/**
 * Dockerfile Linter — public engine.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  WHAT THIS IS                                                            │
 * │                                                                          │
 * │  A CLIENT-SIDE, dependency-free Dockerfile linter: parse the file the way │
 * │  BuildKit reads it, run seventeen high-signal rules over the parse, and   │
 * │  return line-numbered findings with a fix for each one. There is no       │
 * │  server, no image pull and no registry lookup — everything it knows comes │
 * │  from the text in front of it.                                           │
 * │                                                                          │
 * │  THE CONTRACT                                                            │
 * │                                                                          │
 * │    lint(text) NEVER THROWS. Empty, truncated, binary, enormous or simply  │
 * │    not-a-Dockerfile input all return a `LintResult`.                      │
 * │                                                                          │
 * │    `ok: false` means the file could not be linted AT ALL — it is empty,   │
 * │    it contains no instructions, it is larger than the scan limit, or      │
 * │    Docker itself would reject it with a parse error. In that case `error` │
 * │    carries one specific, line-referenced sentence and `findings` is       │
 * │    EMPTY: a partial rule report on a file Docker refuses to build is a    │
 * │    confidently wrong answer, and this tool exists to be checkable.       │
 * │                                                                          │
 * │    `ok: true` with `findings: []` is the good case, not a failure.        │
 * │                                                                          │
 * │    A rule that crashes on unexpected input degrades to ONE info finding   │
 * │    attributed to that rule; every other rule still runs.                  │
 * │                                                                          │
 * │  What it deliberately refuses to flag is listed, with reasons, in the     │
 * │  DELIBERATELY SILENT block at the top of `rules.ts`. Read that before     │
 * │  adding a rule — the fixed v1 set is DF001–DF017 and nothing else.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { countLines, parseDockerfile } from './parse';
import { RULES, makeContext } from './rules';
import {
  RULE_IDS,
  type Finding,
  type LintResult,
  type LintStats,
  type RuleId,
  type Severity,
  type TruncatedRule,
} from './types';

export { parseDockerfile, segmentShell, maskQuoted, KNOWN_INSTRUCTIONS } from './parse';
export { RULES } from './rules';
export { RULE_IDS } from './types';
export type {
  Finding,
  Instruction,
  LintResult,
  LintStats,
  LintSummary,
  ParsedDockerfile,
  RuleId,
  Severity,
  Stage,
  TruncatedRule,
} from './types';

/**
 * How much text the linter scans. A dense 200,000-character Dockerfile is about
 * four thousand lines; the largest real ones are a hundredth of that. Past this
 * the input is a build log, a bundled archive or a paste accident, and scanning
 * it would only produce a slow tab and a wrong report.
 */
export const MAX_INPUT_CHARS = 200_000;

/** Findings kept per rule before the rule is capped (and says so). */
export const MAX_FINDINGS_PER_RULE = 20;

/** Findings kept in total before the run is capped (and says so). */
export const MAX_FINDINGS_TOTAL = 200;

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

const EMPTY_SUMMARY = { errors: 0, warnings: 0, infos: 0 } as const;

function statsOf(text: string, instructions: number, stages: number): LintStats {
  return { lines: countLines(text), instructions, stages };
}

function fatal(error: string, stats: LintStats): LintResult {
  return {
    ok: false,
    error,
    findings: [],
    summary: { ...EMPTY_SUMMARY },
    stats,
    truncatedRules: [],
    truncated: false,
  };
}

/**
 * Collects findings while enforcing both caps and de-duplicating on
 * `ruleId@line@title`. Duplicates are dropped BEFORE the per-rule tally, so a
 * capped rule's reported total is a count of real, distinct findings and never
 * an inflated one.
 */
class Collector {
  readonly findings: Finding[] = [];
  private readonly seen = new Set<string>();
  private readonly kept = new Map<RuleId, number>();
  private readonly matched = new Map<RuleId, number>();
  truncated = false;

  add = (finding: Finding): void => {
    const key = `${finding.id}@${finding.line ?? '-'}@${finding.title}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.matched.set(finding.id, (this.matched.get(finding.id) ?? 0) + 1);

    if ((this.kept.get(finding.id) ?? 0) >= MAX_FINDINGS_PER_RULE) return;
    if (this.findings.length >= MAX_FINDINGS_TOTAL) {
      this.truncated = true;
      return;
    }
    this.kept.set(finding.id, (this.kept.get(finding.id) ?? 0) + 1);
    this.findings.push(finding);
  };

  /** Rules that matched more than they kept, in catalog order. */
  truncatedRules(): TruncatedRule[] {
    const out: TruncatedRule[] = [];
    for (const ruleId of RULE_IDS) {
      const total = this.matched.get(ruleId) ?? 0;
      const shown = this.kept.get(ruleId) ?? 0;
      if (total > shown) out.push({ ruleId, shown, total });
    }
    return out;
  }
}

/** Lint a Dockerfile. Never throws — see the contract in this file's header. */
export function lint(text: string): LintResult {
  if (typeof text !== 'string') {
    return fatal('Paste a Dockerfile to lint.', { lines: 0, instructions: 0, stages: 0 });
  }
  if (text.trim() === '') {
    return fatal('Paste a Dockerfile to lint.', statsOf(text, 0, 0));
  }
  if (text.length > MAX_INPUT_CHARS) {
    return fatal(
      `This input is ${text.length.toLocaleString('en-US')} characters — larger than the ` +
        `${MAX_INPUT_CHARS.toLocaleString('en-US')}-character limit this linter scans. ` +
        'Paste the Dockerfile itself rather than a build log.',
      statsOf(text, 0, 0),
    );
  }

  let parsed;
  try {
    parsed = parseDockerfile(text);
  } catch (err) {
    // The parser's contract is "never throws"; this is belt and braces so a
    // future edit to it can never take the whole playground down.
    return fatal(
      `This file could not be parsed as a Dockerfile (${String(err)}). Check it against the ` +
        'reference on this page, or paste a smaller section.',
      statsOf(text, 0, 0),
    );
  }

  const stats = statsOf(text, parsed.instructions.length, parsed.stages.length);

  if (parsed.instructions.length === 0) {
    return fatal(
      'No instructions found — every line in this file is blank or a comment. A Dockerfile needs at least a FROM.',
      stats,
    );
  }

  if (parsed.unknown) {
    const { keyword, line, suggestion } = parsed.unknown;
    return fatal(
      suggestion
        ? `Unknown instruction “${keyword}” on line ${line} — did you mean ${suggestion}? Docker rejects the whole file with a parse error.`
        : `Unknown instruction “${keyword}” on line ${line}. Docker rejects the whole file with a parse error.`,
      stats,
    );
  }

  const collector = new Collector();
  const ctx = makeContext(parsed, collector.add);
  for (const rule of RULES) {
    try {
      rule.run(ctx);
    } catch (err) {
      // One rule tripping must never lose the other sixteen.
      collector.add({
        id: rule.id,
        severity: 'info',
        title: `${rule.id} could not finish on this input.`,
        detail: `An internal check stopped early (${String(err)}). Every other rule still ran, and the findings listed here are unaffected.`,
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
    truncatedRules: collector.truncatedRules(),
    truncated: collector.truncated,
  };
}

/**
 * The one-line summary the playground announces, and the wording the page
 * quotes. Lives here so the string is covered by the engine's own tests instead
 * of being retyped in five locale pages.
 */
export function summaryLine(result: LintResult): string {
  const { errors, warnings, infos } = result.summary;
  const lines = `${result.stats.lines} ${result.stats.lines === 1 ? 'line' : 'lines'}`;
  if (errors + warnings + infos === 0) return `No findings across ${lines} — nice Dockerfile.`;
  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} ${errors === 1 ? 'error' : 'errors'}`);
  if (warnings > 0) parts.push(`${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`);
  if (infos > 0) parts.push(`${infos} info`);
  return `${parts.join(', ')} across ${lines}`;
}
