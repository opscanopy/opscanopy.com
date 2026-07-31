/**
 * engine.ts — the public façade: `summarizePlan(input)` and `toMarkdown(summary)`.
 *
 * Synchronous, pure, and it NEVER THROWS. Everything it is handed came off a
 * clipboard: a truncated CI log, a state file pasted by mistake, 2 MB of ANSI
 * noise, JSON nested 20,000 deep. Each of those has a test in `engine.test.ts`.
 *
 * The one design decision that matters more than any other lives here: THE
 * RECONCILIATION. Terraform's human-readable output is not a stable format, so a
 * text parser will eventually drift. Rather than let drift turn into a
 * confidently wrong total, every text summary is cross-checked against
 * Terraform's own "Plan:" line — in which a REPLACEMENT counts once as an add AND
 * once as a destroy. A disagreement is reported as a warning that names both
 * numbers and says which one to trust. That is why this tool can parse an
 * unstable format at all.
 *
 * There is deliberately NO cost estimation, and there never will be: prices go
 * stale, and a stale number printed with confidence is the one thing a
 * ground-truth tool cannot ship.
 */
import { classifyRisk, RISK_CLASS_LABEL } from './blast-radius';
import { detectInput, normalizeInput } from './detect';
import { parsePlanJson } from './json-parser';
import { parsePlanText } from './text-parser';
import type {
  Diagnostic,
  PlanCounts,
  PlanSummary,
  PlanTotals,
  Reconciliation,
  ReportedTotals,
  ResourceChange,
  SummarizeOptions,
} from './types';

/** 2 MiB. A 50,000-line plan is ~2 MB of text, so this is one whole big plan. */
const DEFAULT_MAX_INPUT_CHARS = 2 * 1024 * 1024;
/** Resource changes parsed before the parser stops and says the list is short. */
const DEFAULT_MAX_CHANGES = 2_000;
/** Diagnostics kept before the list is capped with a note. */
const DEFAULT_MAX_DIAGNOSTICS = 50;
/** Rows the Markdown report prints per section before it says how many it dropped. */
const MAX_MARKDOWN_ROWS = 60;

const TOOL_URL = 'https://opscanopy.com/terraform-plan-summarizer/';

const MESSAGES = {
  empty:
    'Paste terraform plan output, or the output of "terraform show -json tfplan", to summarize it.',
  stateJson:
    'This is "terraform show -json" output for STATE, not for a plan: it has "values" but no ' +
    '"resource_changes". Run "terraform plan -out=tfplan", then "terraform show -json tfplan".',
  validateJson:
    'This is "terraform validate -json" output, not a plan: it has "valid" and "diagnostics" but ' +
    'no "resource_changes".',
  otherJson:
    'This is JSON, but it has neither "resource_changes" nor "output_changes", so it is not a ' +
    'Terraform plan. Run "terraform show -json tfplan" on a saved plan file.',
  badJson:
    'The input starts with "{" so it was read as JSON, but it is not valid JSON. If it came out ' +
    'of a log the paste is probably truncated.',
  notAPlan:
    'This does not look like terraform plan output: there is no "Plan:" line, no ' +
    '"# <address> will be ..." line, and no "No changes." line. Paste the plan as Terraform ' +
    'printed it, or the output of "terraform show -json tfplan".',
  nothingReadable:
    'The paste looks like Terraform output, but no resource actions, output changes or "Plan:" ' +
    'line could be read from it. If this is an excerpt, paste the whole plan.',
  totalsOnly:
    'Only Terraform\'s "Plan:" line could be read — no per-resource detail was found. The totals ' +
    'are Terraform\'s own; the resource list is empty because the rest of the plan is missing.',
  absentText:
    'No "Plan:" line was found, so these counts could not be cross-checked against Terraform\'s ' +
    'own total. A paste copied out of CI logs is usually truncated — paste the whole plan, or ' +
    'use "terraform show -json tfplan".',
  absentOutputsOnly:
    'This plan changes outputs only. Terraform prints no "Plan:" line for an outputs-only plan, ' +
    'so there is nothing to cross-check — and applying it changes no real infrastructure.',
  absentJson:
    'Read straight from "resource_changes" in "terraform show -json" output, which is a ' +
    'documented, versioned format — there is no "Plan:" text line to cross-check against.',
  absentUnreadableLine:
    'A "Plan:" line was found, but no "N to add / to change / to destroy" figures could be read ' +
    'from it, so these counts could not be cross-checked.',
  noChangesReconciled:
    'Terraform\'s own summary line is "No changes." and no resource actions were parsed — the ' +
    'two agree.',
  noChangesContradicted:
    'Terraform printed "No changes." yet resource actions were parsed out of the same paste. ' +
    'That cannot both be true: the paste probably splices two different plans together.',
  internal:
    'The summarizer hit an internal error on this input and stopped. Nothing was sent anywhere — ' +
    'try a smaller section of the plan.',
} as const;

const EMPTY_COUNTS: PlanCounts = {
  create: 0,
  update: 0,
  destroy: 0,
  replace: 0,
  read: 0,
  import: 0,
  move: 0,
  forget: 0,
  noop: 0,
};

const EMPTY_TOTALS: PlanTotals = { add: 0, change: 0, destroy: 0, import: 0, forget: 0 };

function tally(changes: ResourceChange[]): PlanCounts {
  const counts: PlanCounts = { ...EMPTY_COUNTS };
  for (const change of changes) {
    switch (change.action) {
      case 'create':
        counts.create += 1;
        break;
      case 'update':
        counts.update += 1;
        break;
      case 'delete':
        counts.destroy += 1;
        break;
      case 'replace':
        counts.replace += 1;
        break;
      case 'read':
        counts.read += 1;
        break;
      case 'import':
        counts.import += 1;
        break;
      case 'move':
        counts.move += 1;
        break;
      case 'forget':
        counts.forget += 1;
        break;
      default:
        counts.noop += 1;
        break;
    }
  }
  return counts;
}

/**
 * Terraform's accounting, and the whole reason the reconciliation works: a
 * replacement is counted ONCE as an add and ONCE as a destroy on the "Plan:"
 * line. Reads, moves and no-ops appear in none of the three.
 */
function toTotals(counts: PlanCounts): PlanTotals {
  return {
    add: counts.create + counts.replace,
    change: counts.update,
    destroy: counts.destroy + counts.replace,
    import: counts.import,
    forget: counts.forget,
  };
}

const TOTAL_KEYS: (keyof PlanTotals)[] = ['add', 'change', 'destroy', 'import', 'forget'];

/** `1 to add, 0 to change, 2 to destroy` for whichever keys were reported. */
function renderTotals(values: Partial<Record<keyof PlanTotals, number | null>>): string {
  return TOTAL_KEYS.filter((key) => values[key] !== null && values[key] !== undefined)
    .map((key) => `${values[key]} to ${key}`)
    .join(', ');
}

/**
 * Terraform's own three figures always, plus `to import` / `to forget` only when
 * they are non-zero — matching how Terraform itself prints the line, rather than
 * padding every summary with two zeros nobody asked about.
 */
export function formatTerraformTotals(totals: PlanTotals): string {
  const parts = [
    `${totals.add} to add`,
    `${totals.change} to change`,
    `${totals.destroy} to destroy`,
  ];
  if (totals.import > 0) parts.unshift(`${totals.import} to import`);
  if (totals.forget > 0) parts.push(`${totals.forget} to forget`);
  return parts.join(', ');
}

function reconcile(
  format: 'text' | 'json',
  noChanges: boolean,
  reported: ReportedTotals | null,
  computed: PlanTotals,
  hasResources: boolean,
  hasOutputs: boolean,
  truncation: { changesTruncated: boolean; maxChanges: number },
): Reconciliation {
  if (format === 'json') {
    return { status: 'absent', reported: null, computed, message: MESSAGES.absentJson };
  }

  if (noChanges) {
    const zeroed: ReportedTotals = {
      add: 0,
      change: 0,
      destroy: 0,
      import: 0,
      forget: 0,
      unmodeled: [],
    };
    const allZero = TOTAL_KEYS.every((key) => computed[key] === 0);
    return allZero
      ? { status: 'match', reported: zeroed, computed, message: MESSAGES.noChangesReconciled }
      : {
          status: 'mismatch',
          reported: zeroed,
          computed,
          message: MESSAGES.noChangesContradicted,
        };
  }

  if (reported === null) {
    return {
      status: 'absent',
      reported: null,
      computed,
      message:
        !hasResources && hasOutputs ? MESSAGES.absentOutputsOnly : MESSAGES.absentText,
    };
  }

  const readKeys = TOTAL_KEYS.filter((key) => reported[key] !== null);
  if (readKeys.length === 0) {
    return {
      status: 'absent',
      reported,
      computed,
      message: MESSAGES.absentUnreadableLine,
    };
  }

  const disagrees = readKeys.filter((key) => reported[key] !== computed[key]);
  if (disagrees.length === 0) {
    return {
      status: 'match',
      reported,
      computed,
      message: `Counts reconcile with Terraform's own "Plan:" line (${renderTotals(reported)}).`,
    };
  }

  const reportedText = renderTotals(reported);
  const computedText = renderTotals(
    Object.fromEntries(readKeys.map((key) => [key, computed[key]])) as Partial<
      Record<keyof PlanTotals, number>
    >,
  );

  if (truncation.changesTruncated) {
    return {
      status: 'mismatch',
      reported,
      computed,
      message:
        `Count mismatch, and the cause is this tool's own cap: parsing stopped after ` +
        `${truncation.maxChanges.toLocaleString('en-US')} resource changes, so the list below ` +
        `adds up to ${computedText} while Terraform's "Plan:" line reports ${reportedText}. ` +
        'Terraform\'s line is the authority.',
    };
  }

  return {
    status: 'mismatch',
    reported,
    computed,
    message:
      `Count mismatch. Terraform's "Plan:" line reports ${reportedText}; the resources parsed ` +
      `here add up to ${computedText}. Terraform's text output is not a stable format: trust ` +
      'the "Plan:" line and treat the list below as incomplete.',
  };
}

function finalizeDiagnostics(all: Diagnostic[], max: number): {
  list: Diagnostic[];
  truncated: boolean;
} {
  if (all.length <= max) return { list: all, truncated: false };
  const kept = all.slice(0, Math.max(0, max - 1));
  kept.push({
    severity: 'info',
    message: `Showing the first ${kept.length} findings; more were suppressed.`,
  });
  return { list: kept, truncated: true };
}

function failure(
  message: string,
  severity: Diagnostic['severity'],
  inputChars: number,
): PlanSummary {
  const computed = { ...EMPTY_TOTALS };
  return {
    ok: false,
    format: 'unknown',
    noChanges: false,
    counts: { ...EMPTY_COUNTS },
    totals: computed,
    summaryLine: null,
    changes: [],
    drift: [],
    driftCount: 0,
    outputChanges: [],
    highRisk: [],
    reconciliation: { status: 'absent', reported: null, computed, message },
    diagnostics: [{ severity, message }],
    versions: { product: null, version: null, formatVersion: null },
    limits: {
      inputTruncated: false,
      changesTruncated: false,
      diagnosticsTruncated: false,
      inputChars,
      readChars: inputChars,
    },
    stats: { errors: severity === 'error' ? 1 : 0, warnings: severity === 'warning' ? 1 : 0, changes: 0 },
  };
}

/**
 * Summarize one pasted Terraform plan. Auto-detects the human-readable
 * transcript vs `terraform show -json`, never throws, and always explains itself.
 */
export function summarizePlan(input: string, options: SummarizeOptions = {}): PlanSummary {
  const maxInputChars = options.maxInputChars ?? DEFAULT_MAX_INPUT_CHARS;
  const maxChanges = options.maxChanges ?? DEFAULT_MAX_CHANGES;
  const maxDiagnostics = options.maxDiagnostics ?? DEFAULT_MAX_DIAGNOSTICS;

  const raw = typeof input === 'string' ? input : '';
  const inputChars = raw.length;

  try {
    const inputTruncated = inputChars > maxInputChars;
    const sliced = inputTruncated ? raw.slice(0, maxInputChars) : raw;
    const readChars = sliced.length;

    const pre: Diagnostic[] = [];
    if (inputTruncated) {
      pre.push({
        severity: 'warning',
        message:
          `Input is longer than the ${maxInputChars.toLocaleString('en-US')}-character ` +
          `(${maxInputChars / (1024 * 1024)} MiB) cap, so ` +
          `${(inputChars - readChars).toLocaleString('en-US')} characters at the end were not ` +
          'read. Every count below covers only the part that was read.',
      });
    }

    const detection = detectInput(sliced);

    if (detection.kind === 'empty') return failure(MESSAGES.empty, 'info', inputChars);
    if (detection.kind === 'state-json') return failure(MESSAGES.stateJson, 'error', inputChars);
    if (detection.kind === 'validate-json') {
      return failure(MESSAGES.validateJson, 'error', inputChars);
    }
    if (detection.kind === 'other-json') return failure(MESSAGES.otherJson, 'error', inputChars);
    if (detection.kind === 'broken-json') return failure(MESSAGES.badJson, 'error', inputChars);
    if (detection.kind === 'unknown') return failure(MESSAGES.notAPlan, 'error', inputChars);

    const format: 'text' | 'json' = detection.kind === 'plan-json' ? 'json' : 'text';

    let changes: ResourceChange[];
    let drift: ResourceChange[];
    let outputChanges: PlanSummary['outputChanges'];
    let summaryLine: string | null = null;
    let reported: ReportedTotals | null = null;
    let noChanges = false;
    let changesTruncated = false;
    let versions: PlanSummary['versions'];
    const parserDiagnostics: Diagnostic[] = [];
    let usable = true;

    if (format === 'json') {
      const doc = (detection.json ?? {}) as Record<string, unknown>;
      const result = parsePlanJson(doc, maxChanges);
      changes = result.changes;
      drift = result.drift;
      outputChanges = result.outputChanges;
      changesTruncated = result.changesTruncated;
      versions = {
        product: result.version !== null ? 'Terraform' : null,
        version: result.version,
        formatVersion: result.formatVersion,
      };
      parserDiagnostics.push(...result.diagnostics);
      usable = result.usable;
      // A `show -json` document with empty arrays IS Terraform's no-op plan —
      // there is no "No changes." string in the JSON format to look for. Keyed on
      // emptiness rather than on zero totals so a resource whose action this tool
      // could not model never gets reported as "nothing to do".
      noChanges =
        usable &&
        result.changes.length === 0 &&
        result.drift.length === 0 &&
        result.outputChanges.length === 0;
    } else {
      const result = parsePlanText(normalizeInput(sliced), maxChanges);
      changes = result.changes;
      drift = result.drift;
      outputChanges = result.outputChanges;
      summaryLine = result.summaryLine;
      reported = result.reported;
      noChanges = result.noChanges;
      changesTruncated = result.changesTruncated;
      versions = { product: result.product, version: result.version, formatVersion: null };
      parserDiagnostics.push(...result.diagnostics);
    }

    for (const change of changes) {
      change.risk = classifyRisk(change.type, change.action);
    }
    const highRisk = changes.filter((change) => change.risk !== null);

    const counts = tally(changes);
    const totals = toTotals(counts);
    const hasResources = changes.length > 0;
    const hasOutputs = outputChanges.length > 0;
    const hasReportedFigures =
      reported !== null && TOTAL_KEYS.some((key) => reported![key] !== null);

    const reconciliation = reconcile(format, noChanges, reported, totals, hasResources, hasOutputs, {
      changesTruncated,
      maxChanges,
    });

    /* ── Diagnostics, reconciliation first (it is the headline finding) ──── */
    const diagnostics: Diagnostic[] = [];
    if (reconciliation.status === 'mismatch') {
      diagnostics.push({ severity: 'warning', message: reconciliation.message });
    } else if (reconciliation.status === 'absent') {
      diagnostics.push({
        severity:
          reconciliation.message === MESSAGES.absentText && (hasResources || hasOutputs)
            ? 'warning'
            : 'info',
        message: reconciliation.message,
      });
    }
    diagnostics.push(...pre);

    if (changesTruncated) {
      diagnostics.push({
        severity: 'warning',
        message:
          `Stopped after ${maxChanges.toLocaleString('en-US')} resource changes; the paste ` +
          'contains more. The list below is incomplete, so Terraform\'s "Plan:" line is the ' +
          'authority.',
      });
    }

    if (drift.length > 0) {
      diagnostics.push({
        severity: 'info',
        message:
          `${drift.length} resource${drift.length === 1 ? '' : 's'} changed outside Terraform ` +
          '(drift). Drift is listed separately and is NOT part of the add/change/destroy counts.',
      });
    }

    for (const pair of reported?.unmodeled ?? []) {
      diagnostics.push({
        severity: 'info',
        message:
          `Terraform's "Plan:" line reports "${pair.value} to ${pair.key}", which this tool does ` +
          'not model. The number is shown as Terraform printed it and is not part of the tiles ' +
          'above.',
      });
    }

    diagnostics.push(...parserDiagnostics);

    let ok = usable && (noChanges || hasResources || hasOutputs || hasReportedFigures);
    if (ok && !noChanges && !hasResources && !hasOutputs && hasReportedFigures) {
      diagnostics.push({ severity: 'warning', message: MESSAGES.totalsOnly });
    }
    if (!ok && usable) {
      diagnostics.push({ severity: 'error', message: MESSAGES.nothingReadable });
      ok = false;
    }

    const finalized = finalizeDiagnostics(diagnostics, maxDiagnostics);

    return {
      ok,
      format,
      noChanges,
      counts,
      totals,
      summaryLine,
      changes,
      drift,
      driftCount: drift.length,
      outputChanges,
      highRisk,
      reconciliation,
      diagnostics: finalized.list,
      versions,
      limits: {
        inputTruncated,
        changesTruncated,
        diagnosticsTruncated: finalized.truncated,
        inputChars,
        readChars,
      },
      stats: {
        errors: finalized.list.filter((d) => d.severity === 'error').length,
        warnings: finalized.list.filter((d) => d.severity === 'warning').length,
        changes: changes.length,
      },
    };
  } catch {
    // Unreachable by design; a bug here must still degrade into a message rather
    // than a blank playground.
    return failure(MESSAGES.internal, 'error', inputChars);
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Markdown report — the share affordance, in place of a deep link             */
/* ────────────────────────────────────────────────────────────────────────── */

const ACTION_LABEL: Record<string, string> = {
  create: 'create',
  update: 'update in place',
  delete: 'destroy',
  replace: 'replace',
  read: 'read during apply',
  import: 'import',
  move: 'move',
  'no-op': 'no change',
  forget: 'forget (remove from state, keep the object)',
};

function orderLabel(change: ResourceChange): string {
  if (change.replaceOrder === 'destroy-create') return 'destroy then create';
  if (change.replaceOrder === 'create-destroy') return 'create then destroy';
  return ACTION_LABEL[change.action] ?? change.action;
}

function bullet(change: ResourceChange): string {
  const bits: string[] = [orderLabel(change)];
  if (change.replaceReasons.length > 0) {
    bits.push(`forces replacement: ${change.replaceReasons.join(', ')}`);
  }
  if (change.replaceReasonsTruncated) bits.push('and more attributes not listed');
  if (change.tainted) bits.push('tainted');
  if (change.movedFrom !== null) bits.push(`moved from ${change.movedFrom}`);
  if (change.sensitive) bits.push('has sensitive attributes');
  if (change.actionReason !== null) bits.push(change.actionReason);
  return `- \`${change.address}\` — ${bits.join(' — ')}`;
}

function section(title: string, rows: string[]): string[] {
  if (rows.length === 0) return [];
  const shown = rows.slice(0, MAX_MARKDOWN_ROWS);
  const out = ['', `**${title} (${rows.length})**`, ...shown];
  if (rows.length > shown.length) {
    out.push(`- …and ${rows.length - shown.length} more, not listed.`);
  }
  return out;
}

/**
 * A PR-comment-shaped report. This is the tool's share affordance: a plan is
 * orders of magnitude past the ~2000-character deep-link cap, so there is no URL
 * to share — there is a review comment to paste.
 */
export function toMarkdown(summary: PlanSummary): string {
  const lines: string[] = ['**Terraform plan summary**', ''];

  if (!summary.ok) {
    lines.push(summary.diagnostics[0]?.message ?? 'Nothing could be read from the input.');
    lines.push('', `Summarized in your browser at ${TOOL_URL} — nothing was uploaded.`);
    return lines.join('\n');
  }

  if (summary.noChanges) {
    lines.push('No changes. Terraform found nothing to do.');
  } else {
    lines.push('| | count |', '| --- | --- |');
    lines.push(`| + add | ${summary.counts.create} |`);
    lines.push(`| ~ change | ${summary.counts.update} |`);
    lines.push(`| − destroy | ${summary.counts.destroy} |`);
    lines.push(`| ± replace | ${summary.counts.replace} |`);
    if (summary.counts.read > 0) lines.push(`| <= read | ${summary.counts.read} |`);
    if (summary.counts.import > 0) lines.push(`| import | ${summary.counts.import} |`);
    if (summary.counts.move > 0) lines.push(`| move | ${summary.counts.move} |`);
    if (summary.counts.forget > 0) lines.push(`| forget | ${summary.counts.forget} |`);
    lines.push('');
    lines.push(
      'Terraform counts each replacement once as an add and once as a destroy: ' +
        `${formatTerraformTotals(summary.totals)}.`,
    );
  }

  if (summary.summaryLine !== null) {
    lines.push('', `Terraform's own summary line: \`${summary.summaryLine}\``);
  }
  lines.push(summary.reconciliation.message);

  lines.push(
    ...section(
      'High blast radius',
      summary.highRisk.map(
        (change) =>
          `${bullet(change)} — ${RISK_CLASS_LABEL[change.risk!.klass]}: ${change.risk!.reason}`,
      ),
    ),
  );
  lines.push(
    ...section(
      'Replacements',
      summary.changes.filter((c) => c.action === 'replace').map(bullet),
    ),
  );
  lines.push(
    ...section('Destroys', summary.changes.filter((c) => c.action === 'delete').map(bullet)),
  );
  lines.push(
    ...section('Creates', summary.changes.filter((c) => c.action === 'create').map(bullet)),
  );
  lines.push(
    ...section('Updates', summary.changes.filter((c) => c.action === 'update').map(bullet)),
  );
  lines.push(
    ...section(
      'Other actions',
      summary.changes
        .filter((c) => ['read', 'import', 'move', 'forget', 'no-op'].includes(c.action))
        .map(bullet),
    ),
  );
  lines.push(
    ...section(
      'Changed outside Terraform (drift)',
      summary.drift.map((change) => `- \`${change.address}\``),
    ),
  );
  lines.push(
    ...section(
      'Output changes',
      summary.outputChanges.map(
        (output) =>
          `- \`${output.name}\` — ${output.action}${output.sensitive ? ' (sensitive)' : ''}`,
      ),
    ),
  );

  const notes = summary.diagnostics.filter((d) => d.message !== summary.reconciliation.message);
  lines.push(...section('Notes', notes.map((d) => `- ${d.severity}: ${d.message}`)));

  lines.push('', `Summarized in your browser at ${TOOL_URL} — nothing was uploaded.`);
  return lines.join('\n');
}
