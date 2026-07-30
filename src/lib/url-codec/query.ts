/**
 * Query-string parser for the URL Encoder / Decoder.
 *
 * Ground truth first: the rows this produces are exactly what
 * `URLSearchParams` would produce — split on `&` only, `=` splits the first
 * occurrence, empty segments dropped, repeated keys preserved in order. The
 * value of the tool is the *diagnostics around* that behaviour: the conventions
 * that look like spec but are not (`;` as a separator, `tags[]` as an array,
 * "last one wins") are called out instead of being quietly implemented.
 *
 * Nothing here throws, and every position in a diagnostic is an absolute index
 * into the user's original input (via `offset`), so the UI can point at the
 * character that broke.
 */
import { decodePercent, quoteForMessage } from './percent';
import type { Diagnostic, QueryParam } from './types';

export interface ParseQueryOptions {
  /** Absolute index of `rawQuery` inside the user's input. */
  offset?: number;
  plusAsSpace?: 'auto' | boolean;
}

export interface QueryParseResult {
  params: QueryParam[];
  /** False when any parameter produced an `error`-level diagnostic. */
  ok: boolean;
  /** Query-level notes plus every parameter's own diagnostics, in order. */
  diagnostics: Diagnostic[];
  /** The `+`-is-a-space convention actually applied. */
  plusAsSpace: boolean;
}

const SEMICOLON_MSG =
  'Found ";" in the query string. Browsers and URLSearchParams treat it as an ordinary ' +
  'character, not a separator — the pre-2014 convention of splitting on ";" was dropped from ' +
  'the HTML spec, so it is kept literal here. Split on "&" only.';

const BARE_KEY_MSG =
  'This query contains a bare key with no "=". A bare key is not the same as an empty value: ' +
  '"b" and "b=" arrive differently, and frameworks disagree on whether a bare key means "", ' +
  'null, or true.';

const EMPTY_SEGMENT_MSG =
  'Skipped an empty segment at index %AT% — a doubled "&" (or a leading/trailing one) produces ' +
  'no parameter. URLSearchParams drops it too.';

/**
 * One note per empty segment is fine for a normal URL and ruinous for a pathological one:
 * `?` followed by 20 000 bare `&` produced 20 000 notes and ~11 MB of message text, which is
 * what actually froze the tab (the parse itself is linear). Beyond this many, count silently
 * and emit a single summary note.
 */
const MAX_EMPTY_SEGMENT_NOTES = 200;

const EMPTY_SEGMENTS_TRUNCATED_MSG =
  'Skipped %COUNT% empty segments in total — only the first %SHOWN% are listed above.';

const EMPTY_NAME_MSG =
  'A parameter has an empty name ("=value"). That is legal in the URL grammar and ' +
  'URLSearchParams keeps it, but most server frameworks discard it.';

function arrayKeyMsg(key: string): string {
  return (
    `Key "${key}" is kept literal. The trailing "[]" array convention belongs to PHP and Rack, ` +
    'not to the URL spec, so nothing here groups those values — repeated keys are listed as ' +
    'separate rows.'
  );
}

function duplicateKeyMsg(key: string, count: number): string {
  return (
    `Key "${key}" appears ${count} times and every value is listed below. No spec says which ` +
    'one wins: PHP and Express keep the last, Go’s r.URL.Query() keeps all of them, and ' +
    'ASP.NET joins them with commas.'
  );
}

/**
 * Parse a raw query string (no leading `?`) into rows plus diagnostics.
 *
 * `plusAsSpace: 'auto'` resolves to "yes, if there is a `+` at all": inside a
 * query string the `+`-is-a-space convention is not a guess — it is what
 * `URLSearchParams` does, so matching it keeps the rows ground truth. (Decode
 * mode's `'auto'` is the cautious one, because there the input may be a whole
 * URL rather than a query.) The decision is made once for the whole query;
 * deciding per value would let two rows of one query disagree.
 */
export function parseQuery(rawQuery: string, opts: ParseQueryOptions = {}): QueryParseResult {
  const offset = opts.offset ?? 0;
  const setting = opts.plusAsSpace ?? 'auto';
  const plusAsSpace = setting === 'auto' ? rawQuery.includes('+') : setting === true;

  const diagnostics: Diagnostic[] = [];
  const params: QueryParam[] = [];
  let ok = true;

  if (rawQuery.length === 0) {
    return { params, ok: true, diagnostics, plusAsSpace };
  }

  if (rawQuery.includes(';')) {
    diagnostics.push({
      level: 'warning',
      code: 'semicolon-separator',
      at: offset + rawQuery.indexOf(';'),
      message: SEMICOLON_MSG,
    });
  }

  const seenKeys = new Map<string, number>();
  let cursor = 0;
  let index = 0;
  let sawBareKey = false;
  let arrayKeyNoted = false;
  let emptySegments = 0;

  while (cursor <= rawQuery.length) {
    const amp = rawQuery.indexOf('&', cursor);
    const end = amp === -1 ? rawQuery.length : amp;
    const segment = rawQuery.slice(cursor, end);
    const segmentStart = cursor;
    cursor = end + 1;

    if (segment.length === 0) {
      // Cap the per-segment notes. `?` + 20 000 bare `&` used to emit one note each, and the
      // resulting array — not the O(n) parse — was what froze the tab for seconds. Same
      // precedent as cidr-checker's MAX_OVERLAP_PAIRS truncation notice.
      if (rawQuery.length > 0 && emptySegments < MAX_EMPTY_SEGMENT_NOTES) {
        emptySegments += 1;
        diagnostics.push({
          level: 'info',
          code: 'empty-segment',
          at: offset + segmentStart,
          message: EMPTY_SEGMENT_MSG.replace('%AT%', String(offset + segmentStart)),
        });
      } else if (rawQuery.length > 0) {
        emptySegments += 1;
      }
      if (amp === -1) break;
      continue;
    }

    const eq = segment.indexOf('=');
    const hasValue = eq !== -1;
    const rawKey = hasValue ? segment.slice(0, eq) : segment;
    const rawValue = hasValue ? segment.slice(eq + 1) : null;

    const keyDecode = decodePercent(rawKey, {
      offset: offset + segmentStart,
      plusAsSpace,
      detectDouble: false,
    });
    const valueDecode =
      rawValue === null
        ? null
        : decodePercent(rawValue, {
            offset: offset + segmentStart + eq + 1,
            plusAsSpace,
          });

    const where = `${keyDecode.text || '(empty name)'}`;
    const rowDiagnostics: Diagnostic[] = [
      ...keyDecode.diagnostics.map((d) => ({ ...d, where: `name of "${where}"` })),
      ...(valueDecode?.diagnostics ?? []).map((d) => ({ ...d, where: `value of "${where}"` })),
    ];
    if (!keyDecode.ok || (valueDecode && !valueDecode.ok)) ok = false;

    if (rawKey.length === 0) {
      diagnostics.push({
        level: 'info',
        code: 'empty-name',
        at: offset + segmentStart,
        message: EMPTY_NAME_MSG.replace('%AT%', String(index)),
      });
    }
    if (!hasValue) sawBareKey = true;
    if (!arrayKeyNoted && keyDecode.text.endsWith('[]')) {
      arrayKeyNoted = true;
      diagnostics.push({
        level: 'info',
        code: 'array-key',
        at: offset + segmentStart,
        message: arrayKeyMsg(keyDecode.text),
      });
    }

    const seen = seenKeys.get(keyDecode.text) ?? 0;
    seenKeys.set(keyDecode.text, seen + 1);

    params.push({
      index,
      rawKey,
      key: keyDecode.text,
      rawValue,
      value: valueDecode?.text ?? '',
      hasValue,
      isDuplicate: seen > 0,
      doubleEncoded: valueDecode?.doubleEncoded ?? false,
      diagnostics: rowDiagnostics,
    });
    diagnostics.push(...rowDiagnostics);
    index += 1;

    if (amp === -1) break;
  }

  if (sawBareKey) {
    diagnostics.push({ level: 'info', code: 'bare-key', message: BARE_KEY_MSG });
  }
  for (const [key, count] of seenKeys) {
    if (count > 1) {
      diagnostics.push({
        level: 'warning',
        code: 'duplicate-key',
        message: duplicateKeyMsg(quoteForMessage(key, 40), count),
      });
    }
  }
  if (emptySegments > MAX_EMPTY_SEGMENT_NOTES) {
    diagnostics.push({
      level: 'info',
      code: 'empty-segments-truncated',
      message: EMPTY_SEGMENTS_TRUNCATED_MSG.replace('%COUNT%', String(emptySegments)).replace(
        '%SHOWN%',
        String(MAX_EMPTY_SEGMENT_NOTES),
      ),
    });
  }

  return { params, ok, diagnostics, plusAsSpace };
}

/** `key=value` lines for the Copy-all payload, decoded, one per row. */
export function paramLines(params: QueryParam[]): string {
  return params.map((p) => `${p.key}=${p.value}`).join('\n');
}
