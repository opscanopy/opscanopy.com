/**
 * detect.ts — decide what somebody actually pasted, before trying to parse it.
 *
 * Auto-detection has to be honest about the near-misses, because all four of
 * them are things real people paste into a plan reader:
 *
 *   - `terraform show -json` run against STATE instead of a plan file
 *     (`values`, no `resource_changes`) — the single most common mistake;
 *   - `terraform validate -json` output (`valid`, `diagnostics`);
 *   - some other JSON entirely;
 *   - JSON that is truncated mid-array, which is what a copied log excerpt is.
 *
 * Reporting "invalid input" for those four would be useless. Each one gets its
 * own diagnostic naming the command that produces the right thing instead.
 *
 * Detection never parses the whole document: it looks at a bounded prefix, so
 * this stays O(1)-ish on a 2 MiB paste.
 */

export type InputKind =
  | 'empty'
  | 'plan-text'
  | 'plan-json'
  | 'state-json'
  | 'validate-json'
  | 'other-json'
  | 'broken-json'
  | 'unknown';

export interface Detection {
  kind: InputKind;
  /** The parsed JSON document, when `kind` came from valid JSON. */
  json?: unknown;
}

/** Escape sequences a CI runner leaves in the output. CSI plus OSC. */
const ANSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;

/** Strip ANSI, normalize CRLF/CR to LF, and drop a leading BOM. */
export function normalizeInput(raw: string): string {
  return raw.replace(/^\uFEFF/, '').replace(ANSI_RE, '').replace(/\r\n?/g, '\n');
}

/**
 * Header-comment verbs Terraform prints. Only used here as a "is this a plan at
 * all" signal; `text-parser.ts` owns the authoritative table.
 */
const TEXT_MARKERS = [
  'Terraform will perform the following actions:',
  'will be created',
  'will be destroyed',
  'will be updated in-place',
  'must be replaced',
  'will be read during apply',
  'will be imported',
  'has moved to',
  'has changed',
  'Changes to Outputs:',
];

/** How much of the input the sniffers read. A plan header is far shorter. */
const SNIFF_CHARS = 4096;

export function detectInput(raw: string): Detection {
  const text = normalizeInput(raw);
  if (text.trim().length === 0) return { kind: 'empty' };

  const trimmed = text.trimStart();
  if (trimmed.startsWith('{')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return { kind: 'broken-json' };
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { kind: 'other-json', json: parsed };
    }
    const doc = parsed as Record<string, unknown>;
    if ('resource_changes' in doc || 'output_changes' in doc || 'resource_drift' in doc) {
      return { kind: 'plan-json', json: doc };
    }
    if ('values' in doc) return { kind: 'state-json', json: doc };
    if ('valid' in doc && 'diagnostics' in doc) return { kind: 'validate-json', json: doc };
    return { kind: 'other-json', json: doc };
  }

  // A `[`-led document is JSON too, but never a plan — fall through to the text
  // sniffer, which will correctly refuse it.
  const head = text.slice(0, SNIFF_CHARS);
  if (/^Plan: /m.test(text) || /^No changes\./m.test(text)) return { kind: 'plan-text' };
  for (const marker of TEXT_MARKERS) {
    if (head.includes(marker) || text.includes(marker)) return { kind: 'plan-text' };
  }
  return { kind: 'unknown' };
}
