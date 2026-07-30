/**
 * Dockerfile Linter — shared types.
 *
 * The parse model is deliberately richer than "array of lines". A single logical
 * instruction can span many PHYSICAL lines (backslash continuations, whole-line
 * comments inside them, heredoc bodies), and a linter whose findings all collapse
 * onto the first line of a 12-line `RUN` is not usable. So every instruction
 * keeps `parts: SourcePart[]` — one entry per physical line that contributed
 * argument text — plus per-character line mapping for its shell text, which is
 * what lets DF012 say "line 3" about a pipe buried in a continuation.
 */

/** `error` = Docker or the build will reject/misbehave. `warning` = it builds, but it is wrong. `info` = worth knowing. */
export type Severity = 'error' | 'warning' | 'info';

/** The fixed v1 rule set. Seventeen rules, no more: see `rules.ts`. */
export type RuleId =
  | 'DF001'
  | 'DF002'
  | 'DF003'
  | 'DF004'
  | 'DF005'
  | 'DF006'
  | 'DF007'
  | 'DF008'
  | 'DF009'
  | 'DF010'
  | 'DF011'
  | 'DF012'
  | 'DF013'
  | 'DF014'
  | 'DF015'
  | 'DF016'
  | 'DF017';

/** Every rule id in catalog order — the page's anchor list and the test sweep. */
export const RULE_IDS: readonly RuleId[] = [
  'DF001',
  'DF002',
  'DF003',
  'DF004',
  'DF005',
  'DF006',
  'DF007',
  'DF008',
  'DF009',
  'DF010',
  'DF011',
  'DF012',
  'DF013',
  'DF014',
  'DF015',
  'DF016',
  'DF017',
];

/**
 * One finding. Shape mirrors `gha-validator`'s `Finding` so the two playgrounds
 * can render findings the same way.
 */
export interface Finding {
  /** Rule id — also the `#rule-df007` anchor slug, lowercased. */
  id: RuleId;
  severity: Severity;
  /** One sentence naming what is wrong. Rendered as the row title. */
  title: string;
  /** Why it matters. Plain text — never contains markup. */
  detail: string;
  /** 1-based PHYSICAL line, honest even inside a folded instruction. */
  line?: number;
  /** What to do instead. `backticks` become inline code in the UI. */
  remediation?: string;
}

/** One physical line's contribution to a folded instruction. */
export interface SourcePart {
  /** 1-based physical line number in the original text. */
  line: number;
  /** That line's text with the trailing continuation character removed. */
  text: string;
}

/**
 * Shell text plus a per-character map back to physical lines. Built by the
 * parser for every `RUN` (its folded argument text) and for every heredoc body,
 * so a finding located by offset can still name the line the user sees.
 */
export interface ShellText {
  text: string;
  /** `lineAt[i]` is the 1-based physical line of `text[i]`. Same length as `text`. */
  lineAt: number[];
}

/** A quote-aware slice of shell text: one command in a `&&`/`;`/`|` chain. */
export interface ShellSegment {
  text: string;
  /** Offset of the segment's first character within its owning `ShellText`. */
  start: number;
  /** 1-based physical line of the segment's first non-blank character. */
  line: number;
  /** The separator immediately before this segment (`''` for the first). */
  sepBefore: '' | '&&' | '||' | '|' | ';' | '\n';
}

/** A heredoc body attached to an instruction — opaque to the parser, scanned by shell rules. */
export interface Heredoc {
  /** The delimiter word, without quotes. */
  delimiter: string;
  /** True for `<<-`, which strips leading tabs from the body and the delimiter. */
  stripTabs: boolean;
  /** 1-based line of the first body line (may be past the end for an unterminated body). */
  startLine: number;
  /** The body as shell text, newline-separated, with its line map. */
  body: ShellText;
  /** False when the file ended before the delimiter appeared. */
  terminated: boolean;
}

/** A `--flag` or `--flag=value` written between an instruction keyword and its arguments. */
export interface InstructionFlag {
  /** Lowercased flag name without the leading dashes, e.g. `from`. */
  name: string;
  /** Text after `=`, or `''` for a bare boolean flag. */
  value: string;
  /** 1-based physical line the flag was written on. */
  line: number;
}

/** One logical instruction, with every physical line it occupies. */
export interface Instruction {
  /** UPPERCASED keyword, e.g. `RUN`. For an ONBUILD wrapper this is the WRAPPED keyword. */
  keyword: string;
  /** The keyword exactly as written, e.g. `run`. */
  rawKeyword: string;
  /** 1-based line of the instruction's first physical line. */
  line: number;
  /** 1-based line of its last physical line, heredoc bodies included. */
  endLine: number;
  /** Arguments as one logical string: continuations folded, comment lines dropped, flags removed. */
  argText: string;
  /** `argText` with its per-character line map. */
  argShell: ShellText;
  /** One entry per physical line that contributed text. */
  parts: SourcePart[];
  /** Index of the owning stage; `-1` before the first FROM. */
  stageIndex: number;
  /** True when this instruction was written as `ONBUILD <instruction>`. */
  onbuild: boolean;
  /** Parsed `--flag=value` prefixes. */
  flags: InstructionFlag[];
  /** JSON exec-form argv — present only when `argText` really parsed as a JSON string array. */
  execArgv?: string[];
  /** True when `argText` starts with `[` but is NOT valid JSON (DF014). */
  brokenJson: boolean;
  /** Heredoc bodies opened by this instruction. */
  heredocs: Heredoc[];
}

/** One build stage: a FROM plus every instruction until the next FROM. */
export interface Stage {
  /** 0-based index, as `COPY --from=<n>` counts them. */
  index: number;
  /** Lowercased `AS` alias, when present (Docker matches stage names case-insensitively). */
  name?: string;
  /** The alias exactly as written. */
  rawName?: string;
  /** The image reference as written, before ARG expansion. */
  image: string;
  /** The image reference after pre-FROM ARG expansion; identical to `image` when nothing expanded. */
  resolvedImage: string;
  /** True when the reference still contains an unresolvable `$VAR` after expansion. */
  unresolved: boolean;
  /** 1-based line of the FROM. */
  line: number;
  instructions: Instruction[];
}

/** Parser directives from the very top of the file. */
export interface Directives {
  /** The line-continuation character: `\` by default, `` ` `` after `# escape=` `` ` ``. */
  escape: string;
  /** The `# syntax=` frontend, when declared. Recorded, never validated. */
  syntax?: string;
}

/** Everything `rules.ts` needs, and nothing it does not. */
export interface ParsedDockerfile {
  directives: Directives;
  /** Every instruction in file order, ONBUILD-wrapped ones included (flattened, `onbuild: true`). */
  instructions: Instruction[];
  stages: Stage[];
  /** Pre-FROM `ARG NAME=default` symbol table (lowercase-insensitive keys as written). */
  preFromArgs: Map<string, string>;
  /** Physical line count of the input. */
  lines: number;
  /** The first unrecognised instruction keyword, if any — a fatal parse error for Docker. */
  unknown?: { keyword: string; line: number; suggestion?: string };
}

/** How many findings a single rule may contribute before it is capped. */
export interface TruncatedRule {
  ruleId: RuleId;
  /** How many findings were kept. */
  shown: number;
  /** How many the rule actually matched. */
  total: number;
}

export interface LintSummary {
  errors: number;
  warnings: number;
  infos: number;
}

export interface LintStats {
  /** Physical lines in the input. */
  lines: number;
  /** Logical instructions parsed (ONBUILD-wrapped ones counted once). */
  instructions: number;
  /** Build stages (FROM count). */
  stages: number;
}

/**
 * `lint()`'s return value. NEVER a thrown exception.
 *
 * `ok: false` means the file could not be linted at all — it is empty, it is not
 * a Dockerfile, or Docker itself would refuse to parse it. In that case `error`
 * carries one specific, line-referenced sentence and `findings` is empty: a
 * partial rule report on a file Docker rejects outright would be a confidently
 * wrong answer.
 */
export interface LintResult {
  ok: boolean;
  error?: string;
  findings: Finding[];
  summary: LintSummary;
  stats: LintStats;
  /** Rules whose findings hit the per-rule cap. Empty in the overwhelming majority of runs. */
  truncatedRules: TruncatedRule[];
  /** True when the TOTAL finding cap was reached and later findings were dropped. */
  truncated: boolean;
}

/** One bundled example chip. */
export interface DockerfileExample {
  id: string;
  label: string;
  dockerfile: string;
}
