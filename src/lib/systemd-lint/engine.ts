/**
 * Systemd Unit Validator — public engine.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  WHAT THIS IS                                                            │
 * │                                                                          │
 * │  A CLIENT-SIDE, dependency-free checker for .service, .timer and .socket  │
 * │  files: parse the file the way systemd's own config_parse() reads it, run  │
 * │  the rules over the parse, and return line-numbered findings with a fix    │
 * │  for each. No systemd, no root, no machine — everything it knows comes     │
 * │  from the text in front of it, which is also everything it claims.        │
 * │                                                                          │
 * │  THE CONTRACT                                                            │
 * │                                                                          │
 * │    lint(text, opts?) NEVER THROWS. Empty, truncated, binary, enormous or   │
 * │    simply not-a-unit-file input all return a `LintResult`.                │
 * │                                                                          │
 * │    `ok: false` means the file could not be checked AT ALL — it is empty,   │
 * │    it is not a unit file, it is past the scan limit, or systemd itself     │
 * │    would refuse it (an invalid section header). `error` then carries one    │
 * │    specific, line-referenced sentence and `findings` is EMPTY: a partial   │
 * │    rule report on a file systemd refuses to load is a confidently wrong    │
 * │    answer, and this tool exists to be checkable.                          │
 * │                                                                          │
 * │    `ok: true` with `findings: []` is the good case, not a failure.        │
 * │                                                                          │
 * │    A rule that crashes degrades to ONE info finding; every other rule     │
 * │    still runs.                                                           │
 * │                                                                          │
 * │  What it deliberately refuses to check — and why — is listed in the        │
 * │  DELIBERATELY SILENT block at the top of `rules.ts`, and mirrored on the   │
 * │  tool page. Silence you can read is worth more than a rule you learn to    │
 * │  ignore.                                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { CHECKED_SECTIONS, specFor } from './directives';
import { countLines, parseUnit } from './parser';
import { RULES, type RuleContext } from './rules';
import type {
  Assignment,
  Finding,
  LintResult,
  LintStats,
  Scope,
  Section,
  Severity,
  TruncatedRule,
  UnitKind,
} from './types';

export { parseUnit, countLines, splitQuoted, maskQuoted, stripExecPrefixes } from './parser';
export { validateOnCalendar, SYSTEMD_DOW, CALENDAR_SHORTHANDS } from './calendar';
export {
  CHECKED_SECTIONS,
  UNCHECKED_SECTIONS,
  KNOWN_SECTIONS,
  SECTION_TABLES,
  DIRECTIVE_SECTIONS,
} from './directives';
export { editDistance, suggestName } from './suggest';
export type {
  Assignment,
  Finding,
  LintResult,
  LintStats,
  LintSummary,
  ParsedUnit,
  Scope,
  Section,
  Severity,
  SystemdExample,
  TruncatedRule,
  UnitKind,
} from './types';

/**
 * How much text the validator scans. A dense 200,000-character unit file is
 * roughly four thousand lines; the largest real ones are a hundredth of that.
 * Past this the input is a journal dump or a paste accident, and scanning it
 * would only produce a slow tab and a wrong report.
 */
export const MAX_INPUT_CHARS = 200_000;

/** Findings kept per rule id before that rule is capped (and says so). */
export const MAX_FINDINGS_PER_RULE = 20;

/** Findings kept in total before the run is capped (and says so). */
export const MAX_FINDINGS_TOTAL = 200;

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

const EMPTY_SUMMARY = { errors: 0, warnings: 0, infos: 0 } as const;

function fatal(error: string, stats: LintStats, scope: Scope): LintResult {
  return {
    ok: false,
    error,
    findings: [],
    summary: { ...EMPTY_SUMMARY },
    stats,
    kind: 'unknown',
    scope,
    truncatedRules: [],
    truncated: false,
  };
}

/**
 * Collects findings while enforcing both caps and de-duplicating on
 * `id@line@title`. Duplicates are dropped BEFORE the per-rule tally, so a capped
 * rule's reported total counts real, distinct findings and never an inflated one.
 */
class Collector {
  readonly findings: Finding[] = [];
  private readonly seen = new Set<string>();
  private readonly kept = new Map<string, number>();
  private readonly matched = new Map<string, number>();
  private readonly order: string[] = [];
  truncated = false;

  add = (finding: Finding): void => {
    const key = `${finding.id}@${finding.line ?? '-'}@${finding.title}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    if (!this.matched.has(finding.id)) this.order.push(finding.id);
    this.matched.set(finding.id, (this.matched.get(finding.id) ?? 0) + 1);

    if ((this.kept.get(finding.id) ?? 0) >= MAX_FINDINGS_PER_RULE) return;
    if (this.findings.length >= MAX_FINDINGS_TOTAL) {
      this.truncated = true;
      return;
    }
    this.kept.set(finding.id, (this.kept.get(finding.id) ?? 0) + 1);
    this.findings.push(finding);
  };

  /**
   * True when a further finding with this id would be counted and then dropped.
   * A rule consults it before paying for EVIDENCE it only needs in order to show
   * the finding — never to decide whether something is wrong.
   */
  atCap = (ruleId: string): boolean =>
    (this.kept.get(ruleId) ?? 0) >= MAX_FINDINGS_PER_RULE ||
    this.findings.length >= MAX_FINDINGS_TOTAL;

  /** Rules that matched more than they kept, in first-seen order. */
  truncatedRules(): TruncatedRule[] {
    const out: TruncatedRule[] = [];
    for (const ruleId of this.order) {
      const total = this.matched.get(ruleId) ?? 0;
      const shown = this.kept.get(ruleId) ?? 0;
      if (total > shown) out.push({ ruleId, shown, total });
    }
    return out;
  }
}

/** Which unit this file describes, from the sections it carries. */
function detectKind(sections: Section[]): UnitKind {
  const names = new Set(sections.map((s) => s.name));
  // [Timer] first: a file carrying both a timer and a service section is not
  // legal systemd, but people paste the pair together, and the timer is the part
  // whose rules they came for.
  if (names.has('Timer')) return 'timer';
  if (names.has('Socket')) return 'socket';
  if (names.has('Service')) return 'service';
  for (const name of ['Mount', 'Automount', 'Path', 'Swap', 'Slice', 'Scope']) {
    if (names.has(name)) return 'unsupported';
  }
  return 'unknown';
}

/**
 * Assignments of `key` in every section called `section` (repeated headers merge
 * in systemd, so they merge here), with everything before the last EMPTY
 * assignment dropped — an empty assignment resets the list.
 */
function effectiveAssignments(sections: Section[], section: string, key: string): Assignment[] {
  const all: Assignment[] = [];
  for (const candidate of sections) {
    if (candidate.name !== section) continue;
    for (const assignment of candidate.assignments) {
      if (assignment.key === key) all.push(assignment);
    }
  }
  let lastReset = -1;
  for (let i = 0; i < all.length; i += 1) {
    if (all[i].value === '') lastReset = i;
  }
  return all.slice(lastReset + 1);
}

/** Lint a unit file. Never throws — see the contract in this file's header. */
export function lint(text: string, opts?: { scope?: Scope }): LintResult {
  const scope: Scope = opts?.scope === 'user' ? 'user' : 'system';

  if (typeof text !== 'string') {
    return fatal(
      'Paste a unit file to check — a .service, .timer or .socket.',
      { lines: 0, sections: 0, directives: 0 },
      scope,
    );
  }
  if (text.trim() === '') {
    return fatal(
      'Paste a unit file to check — a .service, .timer or .socket.',
      { lines: countLines(text), sections: 0, directives: 0 },
      scope,
    );
  }
  if (text.length > MAX_INPUT_CHARS) {
    return fatal(
      `This input is ${text.length.toLocaleString('en-US')} characters — larger than the ` +
        `${MAX_INPUT_CHARS.toLocaleString('en-US')}-character limit this validator scans. Paste the ` +
        'unit file itself rather than a journal dump.',
      { lines: countLines(text), sections: 0, directives: 0 },
      scope,
    );
  }

  let parsed;
  try {
    parsed = parseUnit(text);
  } catch (err) {
    // The parser's contract is "never throws"; this is belt and braces so a
    // future edit to it can never take the whole playground down.
    return fatal(
      `This file could not be parsed as a unit file (${String(err)}). Check it against the reference ` +
        'on this page, or paste a smaller section.',
      { lines: countLines(text), sections: 0, directives: 0 },
      scope,
    );
  }

  const stats: LintStats = {
    lines: parsed.lines,
    sections: parsed.sections.length,
    directives: parsed.assignments.length,
  };

  if (parsed.fatal) {
    return fatal(parsed.fatal.message, stats, scope);
  }

  if (parsed.sections.length === 0 && parsed.assignments.length === 0) {
    return fatal(
      'This does not look like a unit file: it has no “[Section]” header and no “Name=value” ' +
        'assignment. Paste the contents of a .service, .timer or .socket unit.',
      stats,
      scope,
    );
  }

  const collector = new Collector();
  const kind = detectKind(parsed.sections);

  const ctx: RuleContext = {
    parsed,
    scope,
    kind,
    sectionsNamed: (name) => parsed.sections.filter((section) => section.name === name),
    effective: (section, key) => effectiveAssignments(parsed.sections, section, key),
    scalar: (section, key) => {
      const list = effectiveAssignments(parsed.sections, section, key);
      return list.length > 0 ? list[list.length - 1].value : undefined;
    },
    report: collector.add,
    atCap: collector.atCap,
  };

  for (const rule of RULES) {
    try {
      rule.run(ctx);
    } catch (err) {
      // One rule tripping must never lose the others.
      collector.add({
        id: 'internal-check-incomplete',
        severity: 'info',
        title: `One internal check (${rule.id}) could not finish on this input.`,
        detail:
          `It stopped early (${String(err)}). Every other rule still ran, and the findings listed ` +
          'here are unaffected.',
      });
    }
  }

  const findings = [...collector.findings].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    const al = a.line ?? Number.MAX_SAFE_INTEGER;
    const bl = b.line ?? Number.MAX_SAFE_INTEGER;
    if (al !== bl) return al - bl;
    return a.id.localeCompare(b.id);
  });

  return {
    ok: true,
    findings,
    summary: {
      errors: findings.filter((f) => f.severity === 'error').length,
      warnings: findings.filter((f) => f.severity === 'warning').length,
      infos: findings.filter((f) => f.severity === 'info').length,
    },
    stats,
    kind,
    scope,
    truncatedRules: collector.truncatedRules(),
    truncated: collector.truncated,
  };
}

/**
 * The one-line summary the playground announces. Lives here so the string is
 * covered by the engine's own tests instead of being retyped in five locale
 * pages.
 *
 * Note what it does NOT say when there is nothing to report: "nothing here
 * matched a rule", not "this unit is correct". The rules are a fixed list, and
 * claiming more than they check would be the one mistake a ground-truth tool
 * cannot make.
 */
export function summaryLine(result: LintResult): string {
  const { errors, warnings, infos } = result.summary;
  const lines = `${result.stats.lines} ${result.stats.lines === 1 ? 'line' : 'lines'}`;
  if (errors + warnings + infos === 0) {
    return `No findings across ${lines} — nothing here matched a rule.`;
  }
  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} ${errors === 1 ? 'error' : 'errors'}`);
  if (warnings > 0) parts.push(`${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`);
  if (infos > 0) parts.push(`${infos} info`);
  return `${parts.join(', ')} across ${lines}`;
}

/**
 * A human label for the detected unit kind, for the "Detected:" chip. Kept next
 * to `detectKind` so the two can never disagree.
 */
export function kindLabel(kind: UnitKind): string {
  switch (kind) {
    case 'service':
      return '.service';
    case 'timer':
      return '.timer';
    case 'socket':
      return '.socket';
    case 'unsupported':
      return 'not checked';
    default:
      return 'unknown';
  }
}

/** True when `section` has a directive table (used by the reference section). */
export function isCheckedSection(section: string): boolean {
  return (CHECKED_SECTIONS as readonly string[]).includes(section);
}

/** Re-exported for the page's reference table. */
export { specFor };
