/**
 * text-parser.ts — read Terraform's human-readable plan output.
 *
 * This format is NOT a stable API. HashiCorp says so, and it has changed
 * repeatedly (drift preamble in 0.15.4, `to import` on the summary line in 1.5,
 * `removed` blocks in 1.7). Parsing it anyway is the right call, because a CI log
 * is what people actually have in their clipboard — but it is only safe because
 * `engine.ts` cross-checks the result against Terraform's own "Plan:" line and
 * downgrades a disagreement to a loud warning instead of a confident total.
 *
 * Two deliberate implementation constraints:
 *
 *  1. **No backtracking regexes over whole lines.** A 1 MB single line through
 *     `/^\s*#\s+(\S.*?)\s+(will be created|…)$/` is quadratic. Every line here is
 *     classified with `startsWith` / `endsWith` / `indexOf` and bounded slices,
 *     so a pathological paste is linear.
 *  2. **The header comment is the source of truth for the address**, not the
 *     `resource "type" "name"` line under it — only the comment carries the
 *     module prefix and the index. The symbol line contributes the replacement
 *     ORDER (`-/+` vs `+/-`), which the comment does not encode.
 */
import type {
  Diagnostic,
  OutputChange,
  PlanAction,
  ReportedTotals,
  ResourceChange,
} from './types';

export interface ParsedAddress {
  moduleChain: string[];
  mode: 'managed' | 'data';
  type: string;
  name: string;
  index: string | null;
}

/** Split an address on top-level dots only — `["a.b"]` and `[0]` stay whole. */
function splitAddress(address: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inQuote = false;
  let current = '';
  for (let i = 0; i < address.length; i += 1) {
    const ch = address[i];
    if (inQuote) {
      current += ch;
      if (ch === '\\') {
        const next = address[i + 1];
        if (next !== undefined) {
          current += next;
          i += 1;
        }
        continue;
      }
      if (ch === '"') inQuote = false;
      continue;
    }
    if (ch === '"') {
      inQuote = true;
      current += ch;
      continue;
    }
    if (ch === '[') {
      depth += 1;
      current += ch;
      continue;
    }
    if (ch === ']') {
      if (depth > 0) depth -= 1;
      current += ch;
      continue;
    }
    if (ch === '.' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

/**
 * `module.network.module.subnets.aws_subnet.private[0]` →
 * `{moduleChain:['network','subnets'], type:'aws_subnet', name:'private', index:'0'}`.
 *
 * Never throws: a malformed address yields empty strings rather than an
 * exception, because the input is a paste and the paste is often truncated.
 */
export function parseAddress(address: string): ParsedAddress {
  const parts = splitAddress(address.trim());
  const moduleChain: string[] = [];
  let i = 0;
  while (parts[i] === 'module' && i + 1 < parts.length) {
    moduleChain.push(parts[i + 1]);
    i += 2;
  }
  let mode: 'managed' | 'data' = 'managed';
  if (parts[i] === 'data') {
    mode = 'data';
    i += 1;
  }
  const type = parts[i] ?? '';
  const nameToken = parts[i + 1] ?? '';
  let name = nameToken;
  let index: string | null = null;
  const bracket = nameToken.indexOf('[');
  if (bracket >= 0 && nameToken.endsWith(']')) {
    name = nameToken.slice(0, bracket);
    const raw = nameToken.slice(bracket + 1, -1);
    index =
      raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
  }
  return { moduleChain, mode, type, name, index };
}

/**
 * The header-comment verbs Terraform prints, longest first so
 * `is tainted, so must be replaced` is never mistaken for `must be replaced`
 * with `… is tainted, so` swallowed into the address.
 */
interface VerbRule {
  verb: string;
  action: PlanAction;
  tainted?: boolean;
  /** Belongs to the "changed outside of Terraform" preamble, not the plan. */
  drift?: boolean;
}

/**
 * Annotated separately from the sorted view below so the literal is CONTEXTUALLY
 * typed against `VerbRule` — `[...].sort()` widened `action` to `string`, which
 * meant a typo in an action name compiled silently.
 */
const VERB_TABLE: VerbRule[] = [
  { verb: 'will no longer be managed by Terraform, but will not be destroyed', action: 'forget' },
  // Terraform 1.2+ `replace_triggered_by` lifecycle rule. Missing this verb did
  // not merely lose a label: the whole resource block was dropped, so a plan
  // that destroys and recreates a production database rendered as
  // `add 0 / change 0 / destroy 0 / replace 0` with no blast-radius band, and
  // the tool then told the user their complete paste was truncated.
  { verb: 'will be replaced due to changes in replace_triggered_by', action: 'replace' },
  { verb: 'is tainted, so must be replaced', action: 'replace', tainted: true },
  { verb: 'will be replaced, as requested', action: 'replace' },
  { verb: 'will be updated in-place', action: 'update' },
  { verb: 'will be read during apply', action: 'read' },
  { verb: 'will be destroyed', action: 'delete' },
  { verb: 'will be created', action: 'create' },
  { verb: 'will be imported', action: 'import' },
  { verb: 'must be replaced', action: 'replace' },
  { verb: 'has been deleted', action: 'delete', drift: true },
  { verb: 'has changed', action: 'update', drift: true },
];

const VERBS: VerbRule[] = [...VERB_TABLE].sort((a, b) => b.verb.length - a.verb.length);

const MOVED_TO = ' has moved to ';

/** Longest address Terraform could plausibly print. Guards the header sniffer. */
const MAX_ADDRESS_CHARS = 1024;

/** Attribute paths blamed for one replacement before the list is capped. */
const MAX_REPLACE_REASONS = 20;

const SECTION_MARKERS = [
  'Terraform will perform the following actions:',
  'Terraform used the selected providers to generate the following execution',
  'Changes to Outputs:',
];

const DRIFT_MARKERS = [
  'Note: Objects have changed outside of Terraform',
  'Objects have changed outside of Terraform',
  'Terraform detected the following changes made outside of Terraform',
];

export interface TextParseResult {
  changes: ResourceChange[];
  drift: ResourceChange[];
  outputChanges: OutputChange[];
  summaryLine: string | null;
  reported: ReportedTotals | null;
  noChanges: boolean;
  product: 'Terraform' | 'OpenTofu' | null;
  version: string | null;
  changesTruncated: boolean;
  diagnostics: Diagnostic[];
}

function blankChange(address: string, action: PlanAction): ResourceChange {
  const parsed = parseAddress(address);
  return {
    address,
    moduleChain: parsed.moduleChain,
    mode: parsed.mode,
    type: parsed.type,
    name: parsed.name,
    index: parsed.index,
    provider: null,
    action,
    replaceOrder: null,
    replaceReasons: [],
    replaceReasonsTruncated: false,
    actionReason: null,
    tainted: false,
    imported: action === 'import',
    movedFrom: null,
    sensitive: false,
    risk: null,
  };
}

/** `~ engine_version = "13.4" -> "15.3" # forces replacement` → `engine_version`. */
function attributeOf(line: string): string | null {
  let rest = line.trim();
  // Strip the leading change symbol, whichever form it takes.
  for (const symbol of ['-/+ ', '+/- ', '<= ', '+ ', '- ', '~ ']) {
    if (rest.startsWith(symbol)) {
      rest = rest.slice(symbol.length).trimStart();
      break;
    }
  }
  const stop = rest.search(/[\s={]/);
  const token = (stop === -1 ? rest : rest.slice(0, stop)).replace(/^"|"$/g, '');
  return token.length > 0 ? token : null;
}

/** Parse `Plan: 1 to import, 2 to add, 0 to change, 3 to destroy.` */
function parsePlanLine(line: string, diagnostics: Diagnostic[]): ReportedTotals {
  const totals: ReportedTotals = {
    add: null,
    change: null,
    destroy: null,
    import: null,
    forget: null,
    unmodeled: [],
  };
  const pairs = line.matchAll(/(\d+) to ([a-z][a-z_-]*)/g);
  for (const pair of pairs) {
    const digits = pair[1];
    const key = pair[2];
    // Beyond 15 digits a JS number is no longer exact, and printing an
    // approximation as though it were Terraform's own figure is the one mistake
    // this tool must never make.
    if (digits.length > 15) {
      diagnostics.push({
        severity: 'info',
        message:
          `Terraform's "Plan:" line reports "${digits} to ${key}", which is too large to be a ` +
          'real resource count, so it was ignored rather than rounded.',
      });
      continue;
    }
    const value = Number(digits);
    if (key === 'add') totals.add = value;
    else if (key === 'change') totals.change = value;
    else if (key === 'destroy') totals.destroy = value;
    else if (key === 'import') totals.import = value;
    else if (key === 'forget') totals.forget = value;
    else totals.unmodeled.push({ key, value });
  }
  return totals;
}

/** Read an already-normalized (ANSI-stripped, LF-only) plan transcript. */
export function parsePlanText(text: string, maxChanges: number): TextParseResult {
  const lines = text.split('\n');
  const changes: ResourceChange[] = [];
  const drift: ResourceChange[] = [];
  const outputChanges: OutputChange[] = [];
  const diagnostics: Diagnostic[] = [];

  let summaryLine: string | null = null;
  let reported: ReportedTotals | null = null;
  let noChanges = false;
  let product: 'Terraform' | 'OpenTofu' | null = null;
  let version: string | null = null;
  let changesTruncated = false;

  let section: 'none' | 'drift' | 'plan' | 'outputs' = 'none';
  /** The resource block currently being read, so body lines attribute correctly. */
  let current: ResourceChange | null = null;
  /** True once the `resource "…" "…"` line under the header has been seen. */
  let sawSymbolLine = false;

  const closeBlock = (): void => {
    current = null;
    sawSymbolLine = false;
  };

  for (const rawLine of lines) {
    const line = rawLine;
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      if (section === 'outputs') section = 'none';
      continue;
    }

    /* ── Section + document-level markers ──────────────────────────────── */
    if (product === null && (trimmed.startsWith('Terraform v') || trimmed.startsWith('OpenTofu v'))) {
      const match = /^(Terraform|OpenTofu) v(\d+\.\d+\.\d+[^\s]*)/.exec(trimmed);
      if (match) {
        product = match[1] as 'Terraform' | 'OpenTofu';
        version = match[2];
      }
      continue;
    }

    if (trimmed.startsWith('Plan: ')) {
      closeBlock();
      section = 'none';
      summaryLine = trimmed;
      reported = parsePlanLine(trimmed, diagnostics);
      continue;
    }

    if (trimmed.startsWith('No changes.')) {
      closeBlock();
      section = 'none';
      noChanges = true;
      if (summaryLine === null) summaryLine = trimmed;
      continue;
    }

    if (DRIFT_MARKERS.some((marker) => trimmed.startsWith(marker))) {
      closeBlock();
      section = 'drift';
      continue;
    }

    if (SECTION_MARKERS.some((marker) => trimmed.startsWith(marker))) {
      closeBlock();
      section = trimmed.startsWith('Changes to Outputs:') ? 'outputs' : 'plan';
      continue;
    }

    /* ── Output rows ───────────────────────────────────────────────────── */
    if (section === 'outputs') {
      const indent = line.length - line.trimStart().length;
      const symbol = trimmed.slice(0, 1);
      const eq = trimmed.indexOf('=');
      const name = eq > 2 ? trimmed.slice(2, eq).trim() : '';
      if (
        indent <= 4 &&
        (symbol === '+' || symbol === '~' || symbol === '-') &&
        trimmed[1] === ' ' &&
        name.length > 0 &&
        !name.includes(' ')
      ) {
        outputChanges.push({
          name,
          action: symbol === '+' ? 'create' : symbol === '-' ? 'delete' : 'update',
          sensitive: trimmed.includes('(sensitive value)') || trimmed.includes('(sensitive)'),
        });
        continue;
      }
      section = 'none';
      // Fall through: this line might be a header comment for the next block.
    }

    /* ── Resource header comment ───────────────────────────────────────── */
    if (trimmed.startsWith('# ') && trimmed.length <= MAX_ADDRESS_CHARS + 96) {
      const body = trimmed.slice(2).trim();

      const movedAt = body.indexOf(MOVED_TO);
      if (movedAt > 0) {
        const from = body.slice(0, movedAt).trim();
        const to = body.slice(movedAt + MOVED_TO.length).trim();
        if (from.length > 0 && to.length > 0 && to.length <= MAX_ADDRESS_CHARS) {
          closeBlock();
          if (changes.length + drift.length >= maxChanges) {
            changesTruncated = true;
            continue;
          }
          const change = blankChange(to, 'move');
          change.movedFrom = from;
          changes.push(change);
          current = change;
          continue;
        }
      }

      let matched: VerbRule | null = null;
      for (const rule of VERBS) {
        if (body.length > rule.verb.length && body.endsWith(rule.verb)) {
          matched = rule;
          break;
        }
      }
      if (matched) {
        const address = body.slice(0, body.length - matched.verb.length).trim();
        if (address.length > 0 && address.length <= MAX_ADDRESS_CHARS) {
          closeBlock();
          if (changes.length + drift.length >= maxChanges) {
            changesTruncated = true;
            continue;
          }
          const change = blankChange(address, matched.action);
          change.tainted = matched.tainted === true;
          const isDrift = matched.drift === true || section === 'drift';
          (isDrift ? drift : changes).push(change);
          current = change;
          continue;
        }
      }

      // `# (because aws_iam_role.old is not in configuration)` — Terraform's own
      // words for why, kept verbatim rather than paraphrased.
      if (current !== null && current.actionReason === null && body.startsWith('(') && body.endsWith(')')) {
        current.actionReason = body.slice(1, -1);
      }
      continue;
    }

    /* ── The symbol line under a header comment ────────────────────────── */
    if (current !== null && !sawSymbolLine) {
      if (trimmed.startsWith('-/+ ')) current.replaceOrder = 'destroy-create';
      else if (trimmed.startsWith('+/- ')) current.replaceOrder = 'create-destroy';
      if (trimmed.includes('resource "') || trimmed.includes('data "')) {
        sawSymbolLine = true;
        if (trimmed.includes('# forces replacement') && current.replaceReasons.length === 0) {
          const attribute = attributeOf(trimmed);
          if (attribute) current.replaceReasons.push(attribute);
        }
        continue;
      }
    }

    /* ── Resource body ─────────────────────────────────────────────────── */
    if (current !== null) {
      const indent = line.length - line.trimStart().length;
      if (trimmed === '}' && indent <= 4) {
        closeBlock();
        continue;
      }
      if (trimmed.includes('(sensitive value)') || trimmed.includes('(sensitive)')) {
        current.sensitive = true;
      }
      if (trimmed.endsWith('# forces replacement')) {
        if (current.replaceReasons.length >= MAX_REPLACE_REASONS) {
          current.replaceReasonsTruncated = true;
        } else {
          const attribute = attributeOf(trimmed);
          if (attribute && !current.replaceReasons.includes(attribute)) {
            current.replaceReasons.push(attribute);
          }
        }
      }
    }
  }

  return {
    changes,
    drift,
    outputChanges,
    summaryLine,
    reported,
    noChanges,
    product,
    version,
    changesTruncated,
    diagnostics,
  };
}
