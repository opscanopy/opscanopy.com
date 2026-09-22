/**
 * UUID / ULID Generator — tests for the shared HTML builders.
 *
 * This tool's seed is a DELIBERATE PARTIAL. Generation is random: a v4 UUID or
 * a ULID baked into the static HTML would be a fixed "random" value served to
 * every visitor and quoted by every crawler, which is worse than no answer at
 * all. So the build seeds only the two deterministic things this tool can
 * state as fact — the Nil UUID, and the inspection of one fixed example UUID —
 * and the generated batch is left to the browser behind a labelled
 * `data-client-only` note.
 *
 * The assertions below pin exactly that: the seeded HTML must carry the Nil
 * UUID and the inspector rows, and must contain NO v4 UUID and NO ULID.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inspectUuid, nilUuid } from './engine';
import {
  CLIENT_ONLY_HTML,
  EMPTY_HTML,
  LOAD_ERROR_HTML,
  copyBtnHtml,
  generateErrorHtml,
  inspectErrorHtml,
  inspectResultHtml,
  modeLabel,
  nilCardHtml,
  summaryText,
  valuesHtml,
} from './render';

/** The module's CODE, with comments stripped — the prose above describes the
 *  very APIs it must not call, so a naive scan of the whole file is useless. */
const RENDER_CODE = readFileSync(new URL('./render.ts', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** Canonical RFC 4122 v4 shape — what must never be baked into a build. */
const V4_RE = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\b/;
/** Crockford base32 ULID — 26 chars, no I, L, O or U. */
const ULID_RE = /\b[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}\b/;

const EXAMPLE_UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

describe('uuid-ulid-generator/render — purity', () => {
  it('reaches for no browser, clock or random source', () => {
    for (const forbidden of [
      'window',
      'document',
      'localStorage',
      'Math.random',
      'crypto',
      'getRandomValues',
      'localePath',
    ]) {
      expect(RENDER_CODE).not.toContain(forbidden);
    }
    // `Date` would make the build's output depend on when it ran.
    expect(RENDER_CODE).not.toMatch(/\bDate\b/);
  });

  it('builds the same HTML every time it is called', () => {
    expect(nilCardHtml(nilUuid())).toBe(nilCardHtml(nilUuid()));
    expect(inspectResultHtml(EXAMPLE_UUID, inspectUuid(EXAMPLE_UUID))).toBe(
      inspectResultHtml(EXAMPLE_UUID, inspectUuid(EXAMPLE_UUID))
    );
  });
});

describe('uuid-ulid-generator/render — the seeded Nil UUID card', () => {
  const html = nilCardHtml(nilUuid());

  it('carries the all-zero Nil UUID as a real, copyable row', () => {
    expect(nilUuid()).toBe('00000000-0000-0000-0000-000000000000');
    expect(html).toContain('00000000-0000-0000-0000-000000000000');
    expect(html).toContain('uug-val-row');
    expect(html).toContain('data-copy="00000000-0000-0000-0000-000000000000"');
    expect((html.match(/uug-val-row"/g) ?? []).length).toBe(1);
  });

  it('bakes NO generated v4 UUID and NO generated ULID into the build', () => {
    // The whole point of the partial seed: these values are minted per visit
    // from a CSPRNG. A build that shipped one would be serving everybody the
    // same "random" identifier.
    expect(html).not.toMatch(V4_RE);
    expect(html).not.toMatch(ULID_RE);
  });

  it('says plainly that the generated batch needs JavaScript', () => {
    expect(html).toContain('data-client-only');
    expect(html).toContain(CLIENT_ONLY_HTML);
    expect(CLIENT_ONLY_HTML).toMatch(/Generate/);
  });
});

describe('uuid-ulid-generator/render — the seeded inspector', () => {
  const res = inspectUuid(EXAMPLE_UUID);
  const html = inspectResultHtml(EXAMPLE_UUID, res);

  it('decodes the fixed example UUID into real rows', () => {
    expect(res.valid).toBe(true);
    expect(html).toContain(EXAMPLE_UUID);
    expect(html).toContain('UUID (8-4-4-4-12 hex)');
    expect(html).toContain('Version');
    expect(html).toContain('RFC 4122');
    expect((html.match(/uug-kv-row"/g) ?? []).length).toBe(3);
  });

  it('renders an empty string for empty input', () => {
    expect(inspectResultHtml('', res)).toBe('');
  });

  it('renders the not-recognised card for an invalid identifier', () => {
    const bad = inspectUuid('nope');
    expect(bad.valid).toBe(false);
    const badHtml = inspectResultHtml('nope', bad);
    expect(badHtml).toContain('Not a recognised identifier');
    expect(badHtml).toContain('uug-error');
  });

  it('decodes a ULID without reading the wall clock', () => {
    const ulid = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    const out = inspectResultHtml(ulid, inspectUuid(ulid));
    expect(out).toContain('Crockford base32 ULID (26 chars)');
    expect(out).toContain('Unix (ms)');
    expect(out).toContain('Randomness');
  });
});

describe('uuid-ulid-generator/render — escaping and shared bits', () => {
  it('escapes angle brackets and ampersands everywhere a value lands', () => {
    const btn = copyBtnHtml('value <1>', 'a & b');
    expect(btn).toContain('&lt;1&gt;');
    expect(btn).toContain('a &amp; b');
    expect(valuesHtml(['<img src=x>'])).toContain('&lt;img src=x&gt;');
    expect(valuesHtml(['<img src=x>'])).not.toContain('<img src=x>');
    expect(inspectErrorHtml('<bad> & worse')).toContain('&lt;bad&gt;');
    expect(generateErrorHtml('<bad> & worse')).toContain('&amp;');
  });

  it('labels each mode and summarises a batch', () => {
    expect(modeLabel('v4')).toBe('UUID v4');
    expect(modeLabel('nil')).toBe('Nil UUID');
    expect(modeLabel('ulid')).toBe('ULID');
    expect(summaryText('v4', 5, false, '')).toBe('5 × UUID v4 · lowercase');
    expect(summaryText('ulid', 3, false, '')).toBe('3 × ULID · uppercase');
    expect(summaryText('nil', 1, false, '')).toBe('Nil UUID · lowercase');
    expect(summaryText('v4', 1000, true, 'Count was adjusted to 1000.')).toBe(
      '1000 × UUID v4 · uppercase · Count was adjusted to 1000.'
    );
  });

  it('keeps the empty placeholder in sync with the markup', () => {
    expect(EMPTY_HTML).toContain('uug-empty');
    expect(EMPTY_HTML).toContain('Generate');
  });

  it('keeps the engine-load failure distinct from a generation failure', () => {
    expect(LOAD_ERROR_HTML).toContain('Could not load the generator');
    expect(generateErrorHtml('x')).toContain('Could not generate');
  });
});
