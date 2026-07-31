/**
 * The rules.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  SEVERITY MEANS SOMETHING HERE                                           │
 * │                                                                          │
 * │    error   — systemd refuses to load the unit, OR it discards the setting │
 * │              outright, so the file does not do what it says.              │
 * │    warning — the unit loads and the setting applies, but it is wrong or a  │
 * │              known trap.                                                  │
 * │    info    — worth knowing.                                              │
 * │                                                                          │
 * │  `unknown-directive` is ALWAYS info, never error. This page ships a       │
 * │  directive table, not the systemd on your machine: a name it has not      │
 * │  heard of may simply be newer than the table, and a linter that cries     │
 * │  wolf is one you learn to ignore. A name that is a near-miss of a real    │
 * │  directive IS an error (`typo-directive`) — there the evidence is strong  │
 * │  enough to say systemd is throwing the line away.                        │
 * │                                                                          │
 * │  DELIBERATELY SILENT (each considered and rejected):                      │
 * │                                                                          │
 * │    • Whether a unit referenced by After=/Wants=/Unit= exists. It lives in │
 * │      another file this page cannot see. Guessing would be the confidently │
 * │      wrong answer.                                                        │
 * │    • Time-span syntax (`5min`, `1h30s`). systemd's grammar here is        │
 * │      generous, and the mistakes are rare compared to the false positives  │
 * │      a re-implementation would produce.                                  │
 * │    • Whether a path exists, a user exists, or a capability is spelled     │
 * │      right. None of that is in the text you pasted.                       │
 * │    • Drop-in directories, unit-name/filename agreement, template          │
 * │      instances and `systemctl` state. One file, read as text.             │
 * │    • Ordering-vs-dependency reasoning (After= without Wants=). Frequently │
 * │      correct on purpose; the false-positive rate would be enormous.       │
 * │    • Values of directives in [Mount], [Path], [Swap], [Automount],        │
 * │      [Slice] and [Scope] — announced in the results rather than silently  │
 * │      skipped.                                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { validateOnCalendar } from './calendar';
import {
  ALL_DIRECTIVE_NAMES,
  CHECKED_SECTIONS,
  DIRECTIVE_SECTIONS,
  EXEC_DIRECTIVE_NAMES,
  INSTANCE_SPECIFIERS,
  KNOWN_SECTIONS,
  KNOWN_SPECIFIERS,
  LISTEN_DIRECTIVES,
  SECTION_TABLES,
  TIMER_TRIGGERS,
  UNCHECKED_SECTIONS,
  parseBooleanValue,
  specFor,
} from './directives';
import { maskQuoted, splitQuoted, stripExecPrefixes } from './parser';
import { suggestName } from './suggest';
import type { Assignment, Finding, ParsedUnit, Scope, Section, UnitKind } from './types';

/** Everything a rule needs, and nothing it does not. */
export interface RuleContext {
  parsed: ParsedUnit;
  scope: Scope;
  kind: UnitKind;
  /** Sections by name, first occurrence first. */
  sectionsNamed(name: string): Section[];
  /** Every assignment of `key` inside `section`, in file order, after any reset. */
  effective(section: string, key: string): Assignment[];
  /** The last value assigned to a scalar in `section`, or `undefined`. */
  scalar(section: string, key: string): string | undefined;
  /** Emit a finding. */
  report(finding: Finding): void;
  /**
   * True when this rule id has already kept every finding it will show, so the
   * next one is counted and dropped. Only for skipping work that would go into a
   * finding nobody sees — never for deciding whether something is wrong.
   */
  atCap(ruleId: string): boolean;
}

/** How many characters of a quoted value a finding title will show. */
const QUOTE_LIMIT = 60;

function clip(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= QUOTE_LIMIT ? flat : `${flat.slice(0, QUOTE_LIMIT - 1)}…`;
}

function times(n: number): string {
  return n === 2 ? 'twice' : `${n} times`;
}

/* ────────────────────────────────────────────────────────────────────────
 * Section-level rules
 * ──────────────────────────────────────────────────────────────────────── */

function sectionRules(ctx: RuleContext): void {
  const seen = new Map<string, number>();

  for (const section of ctx.parsed.sections) {
    const count = (seen.get(section.name) ?? 0) + 1;
    seen.set(section.name, count);

    if (count === 2) {
      ctx.report({
        id: 'duplicate-section',
        severity: 'warning',
        line: section.line,
        directive: `[${section.name}]`,
        title: `[${section.name}] appears twice.`,
        detail:
          'systemd merges repeated sections, so the file still loads — but a directive assigned in ' +
          'both blocks quietly takes the value from the second one, and readers rarely notice.',
        remediation: 'Merge the two blocks.',
      });
    }

    if (KNOWN_SECTIONS.includes(section.name)) {
      if ((UNCHECKED_SECTIONS as readonly string[]).includes(section.name) && count === 1) {
        ctx.report({
          id: 'unsupported-section',
          severity: 'info',
          line: section.line,
          directive: `[${section.name}]`,
          title: `This validator does not check directives inside [${section.name}].`,
          detail:
            'Only [Unit], [Install], [Service], [Timer] and [Socket] have directive tables here. ' +
            `[${section.name}] is parsed and its structure is checked, but its directive names and ` +
            'values are not.',
        });
      }
      continue;
    }

    if (/^X-/.test(section.name)) {
      ctx.report({
        id: 'x-prefixed-section',
        severity: 'info',
        line: section.line,
        directive: `[${section.name}]`,
        title: `[${section.name}] is a private section — systemd ignores it by design.`,
        detail:
          'A section name starting with “X-” is reserved for other tools. systemd skips it without a ' +
          'warning, so nothing in it affects the unit.',
      });
      continue;
    }

    // A case-only difference from a real section name is not a guess: systemd
    // matches section headers exactly, so `[unit]` is certainly meant to be
    // `[Unit]` — and everything inside it is being thrown away.
    const exactCase = KNOWN_SECTIONS.find((known) => known.toLowerCase() === section.name.toLowerCase());
    if (exactCase) {
      ctx.report({
        id: 'section-case',
        severity: 'error',
        line: section.line,
        directive: `[${section.name}]`,
        title: `[${section.name}] is not a section systemd knows — section names are case-sensitive.`,
        detail:
          `systemd matches section headers exactly, so “${section.name}” is an unknown section: it ` +
          `logs “Unknown section '${section.name}'. Ignoring.” and every directive inside it is discarded.`,
        remediation: `Write \`[${exactCase}]\`.`,
      });
      continue;
    }

    const suggestion = suggestName(section.name, KNOWN_SECTIONS);
    ctx.report({
      id: 'unknown-section',
      severity: 'warning',
      line: section.line,
      directive: `[${section.name}]`,
      title: `[${section.name}] is not a section systemd knows.`,
      detail:
        'systemd ignores an unknown section and every directive in it, so nothing inside this block ' +
        'takes effect.',
      remediation: suggestion
        ? `Did you mean \`[${suggestion}]\`?`
        : 'Remove the section, or rename it with an “X-” prefix if it is meant for another tool.',
    });
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * Lines systemd throws away
 * ──────────────────────────────────────────────────────────────────────── */

function strayLineRules(ctx: RuleContext): void {
  for (const stray of ctx.parsed.strayLines) {
    ctx.report({
      id: 'missing-equals',
      severity: 'warning',
      line: stray.line,
      title: `Line ${stray.line} (“${clip(stray.text)}”) has no “=”, so systemd ignores it.`,
      detail:
        'systemd logs “Missing \'=\', ignoring line.” for any line in a unit file that is not blank, ' +
        'a comment, a “[Section]” header or a “Name=value” assignment.',
      remediation: 'Write it as `Name=value`, or delete the line.',
    });
  }

  for (const assignment of ctx.parsed.assignments) {
    if (assignment.section !== null) continue;
    const owners = DIRECTIVE_SECTIONS.get(assignment.key);
    ctx.report({
      id: 'assignment-outside-section',
      severity: 'warning',
      line: assignment.line,
      directive: assignment.key,
      title: `${assignment.key}= appears before any “[Section]” header, so systemd ignores it.`,
      detail:
        `Line ${assignment.line} reads “${clip(assignment.raw)}”. systemd logs “Assignment outside of ` +
        'section. Ignoring.” — a directive only takes effect inside the section that owns it.',
      remediation: owners
        ? `Move it under \`[${owners[0]}]\`.`
        : 'Put it under the section that owns it.',
    });
  }

  for (const comment of ctx.parsed.commentsInContinuations) {
    ctx.report({
      id: 'comment-in-continuation',
      severity: 'info',
      line: comment.line,
      directive: comment.key || undefined,
      title: `A comment line sits inside the “\\” continuation of ${comment.key || 'a directive'}=.`,
      detail:
        'systemd drops a full-line comment that appears inside a continuation, so the value itself is ' +
        'unaffected — but that has not always been true, and every reader has to work it out. Moving ' +
        'the comment above the directive removes the doubt.',
      remediation: 'Put the comment on its own line above the directive.',
    });
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * Per-assignment rules: names, repeats, values, specifiers
 * ──────────────────────────────────────────────────────────────────────── */

/** `#` or `;` that is outside quotes and preceded by whitespace. */
function inlineCommentIn(value: string): string | null {
  const mask = maskQuoted(value);
  for (let i = 1; i < mask.length; i += 1) {
    const ch = mask[i];
    if ((ch === '#' || ch === ';') && /\s/.test(mask[i - 1])) {
      return value.slice(i).trim();
    }
  }
  return null;
}

function directiveRules(ctx: RuleContext): void {
  // Repeats and resets are gathered per (section NAME, directive) pair, across
  // every block with that name: systemd merges repeated headers, so `User=` in two
  // [Service] blocks is one directive set twice and the first value is silently
  // discarded — the class of bug this tool exists to name. Gathered per section
  // OBJECT, that case produced nothing but the generic "[Service] appears twice",
  // and the discarded line was never pointed at.
  const perSectionKeys = new Map<string, Map<string, Assignment[]>>();

  for (const section of ctx.parsed.sections) {
    const checked = (CHECKED_SECTIONS as readonly string[]).includes(section.name);

    let perKey = perSectionKeys.get(section.name);
    if (!perKey) {
      perKey = new Map<string, Assignment[]>();
      perSectionKeys.set(section.name, perKey);
    }

    for (const assignment of section.assignments) {
      const list = perKey.get(assignment.key);
      if (list) list.push(assignment);
      else perKey.set(assignment.key, [assignment]);

      if (!checked) continue;

      /* ── inline "comments" ─────────────────────────────────────────── */
      const comment = inlineCommentIn(assignment.value);
      if (comment) {
        ctx.report({
          id: 'inline-comment',
          severity: 'warning',
          line: assignment.line,
          directive: assignment.key,
          title: `${assignment.key}= keeps “${clip(comment)}” as part of its value.`,
          detail:
            'A unit file has no end-of-line comments: everything after “=” — including ' +
            `“${clip(comment)}” — becomes part of the value.`,
          remediation: 'Move the comment onto its own line above the directive.',
        });
      }

      /* ── specifiers ────────────────────────────────────────────────── */
      specifierRules(ctx, assignment);

      /* ── is the name known HERE? ───────────────────────────────────── */
      const spec = specFor(section.name, assignment.key);
      if (!spec) {
        nameRules(ctx, section, assignment);
        continue;
      }
      if (spec.deprecated) {
        ctx.report({
          id: 'deprecated-directive',
          severity: 'info',
          line: assignment.line,
          directive: assignment.key,
          title: `${assignment.key}= is deprecated.`,
          detail: `systemd still accepts it, but it has moved on: ${spec.deprecated}`,
        });
      }

      /* ── value checks ──────────────────────────────────────────────── */
      if (assignment.value === '') continue; // a reset, handled below
      if (spec.kind === 'bool' && parseBooleanValue(assignment.value) === null) {
        ctx.report({
          id: 'bad-enum-or-bool',
          severity: 'error',
          line: assignment.line,
          directive: assignment.key,
          title: `${assignment.key}=${clip(assignment.value)} is not a boolean systemd accepts.`,
          detail:
            'systemd accepts 1, yes, y, true, t, on and their negatives 0, no, n, false, f, off — ' +
            'case-insensitively. Anything else is logged as “Failed to parse boolean value” and the ' +
            'directive keeps its default.',
          remediation: `Write \`${assignment.key}=yes\` or \`${assignment.key}=no\`.`,
        });
      }
      if (spec.kind === 'enum' && spec.values && !spec.values.includes(assignment.value)) {
        const lower = assignment.value.toLowerCase();
        const caseFix = spec.values.find((value) => value.toLowerCase() === lower);
        ctx.report({
          id: 'bad-enum-or-bool',
          severity: 'error',
          line: assignment.line,
          directive: assignment.key,
          title: `${assignment.key}=${clip(assignment.value)} is not a valid ${assignment.key}= value.`,
          detail:
            'systemd compares these values case-sensitively and would log “Failed to parse ' +
            `${spec.logLabel ?? `${assignment.key} value`}, ignoring: ${clip(assignment.value)}”, ` +
            `leaving ${assignment.key}= at its default. Valid values: ${spec.values.join(', ')}.`,
          remediation: caseFix
            ? `Write \`${assignment.key}=${caseFix}\`.`
            : `Use one of: ${spec.values.join(', ')}.`,
        });
      }
      if (spec.kind === 'exec') execRules(ctx, assignment);
      if (spec.kind === 'calendar') calendarRules(ctx, assignment);
    }
  }

  for (const [sectionName, perKey] of perSectionKeys) {
    if (!(CHECKED_SECTIONS as readonly string[]).includes(sectionName)) continue;

    for (const [key, list] of perKey) {
      const resets = list.filter((a) => a.value === '');
      for (const reset of resets) {
        ctx.report({
          id: 'empty-assignment-reset',
          severity: 'info',
          line: reset.line,
          directive: key,
          title: `${key}= is assigned an empty value, which resets the list.`,
          detail:
            'An empty assignment clears everything set for that directive earlier in the file — ' +
            'including anything a drop-in added. If you meant to add a dependency, give it a value.',
        });
      }

      const assigned = list.filter((a) => a.value !== '');
      if (assigned.length < 2) continue;
      const spec = specFor(sectionName, key);
      if (!spec) continue; // unknown name — already reported, no repeat claim
      const last = assigned[assigned.length - 1];
      const previous = assigned[assigned.length - 2];
      if (spec.list) {
        ctx.report({
          id: 'repeated-list-directive',
          severity: 'info',
          line: last.line,
          directive: key,
          title: `${key}= appears ${times(assigned.length)} — systemd appends, so both run in order.`,
          detail:
            `${key}= is a list directive: repeating it adds to the list instead of replacing it. ` +
            'Assigning it an empty value would reset the list.',
        });
      } else {
        ctx.report({
          id: 'repeated-scalar-directive',
          severity: 'warning',
          line: last.line,
          directive: key,
          title: `${key}= is set ${times(assigned.length)}; only the value on line ${last.line} takes effect.`,
          detail:
            `${key}= is not a list directive, so systemd keeps the last assignment and silently ` +
            `discards the earlier one on line ${previous.line}.`,
          remediation: `Keep one \`${key}=\` line.`,
        });
      }
    }
  }
}

/** An unknown name is either in the wrong section, a typo, or simply unknown. */
function nameRules(ctx: RuleContext, section: Section, assignment: Assignment): void {
  const owners = DIRECTIVE_SECTIONS.get(assignment.key);
  if (owners && owners.length > 0) {
    const target = owners[0];
    ctx.report({
      id: 'wrong-section',
      severity: 'error',
      line: assignment.line,
      directive: assignment.key,
      title: `${assignment.key}= belongs in [${target}], not [${section.name}].`,
      detail:
        `systemd only reads ${assignment.key}= from [${owners.join('] or [')}]. Here it logs “Unknown ` +
        `key name '${assignment.key}' in section '${section.name}', ignoring.” and the setting has no ` +
        'effect at all.',
      remediation: `Move the line into the \`[${target}]\` section.`,
    });
    return;
  }

  // Telling a typo from an unrecognised name costs two Damerau-Levenshtein
  // sweeps, the second over all 439 known names. Once BOTH ids that answer can
  // produce are capped, the finding is counted and dropped either way, so the
  // sweep buys nothing but latency — and it is paid per line: a 199,000-character
  // paste of non-unit `KEY=value` lines (a `systemctl show` dump, an `.env`, a
  // concatenated unit tree) froze the tab for 20 seconds INSIDE the input limit
  // this page advertises as the point where it stops instead of freezing.
  if (ctx.atCap('typo-directive') && ctx.atCap('unknown-directive')) {
    reportUnknownDirective(ctx, assignment);
    return;
  }

  // The current section's own names first, so a tie prefers the local fix.
  const local = Object.keys(SECTION_TABLES[section.name] ?? {});
  const suggestion =
    suggestName(assignment.key, local) ?? suggestName(assignment.key, ALL_DIRECTIVE_NAMES);
  if (suggestion) {
    ctx.report({
      id: 'typo-directive',
      severity: 'error',
      line: assignment.line,
      directive: assignment.key,
      title: `${assignment.key}= is not a systemd directive — did you mean ${suggestion}=?`,
      detail:
        `systemd logs “Unknown key name '${assignment.key}' in section '${section.name}', ignoring.”, ` +
        'so this line does nothing.',
      remediation: `Write \`${suggestion}=\`.`,
    });
    return;
  }

  reportUnknownDirective(ctx, assignment);
}

/** The info finding for a name the table simply does not carry. */
function reportUnknownDirective(ctx: RuleContext, assignment: Assignment): void {
  ctx.report({
    id: 'unknown-directive',
    severity: 'info',
    line: assignment.line,
    directive: assignment.key,
    title: `${assignment.key}= is not in this page’s directive table.`,
    detail:
      'That is a note, not an error: this page ships a directive table, not the systemd on your ' +
      'machine, so a name it does not recognise may simply be newer than the table. If it is a typo, ' +
      'systemd ignores the line and logs “Unknown key name”.',
    remediation: 'Check it against `systemd.directives(7)` for your systemd version.',
  });
}

/** `%` escapes: unknown ones, and the instance ones that need a template. */
function specifierRules(ctx: RuleContext, assignment: Assignment): void {
  const value = assignment.value;
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] !== '%') continue;
    const next = value[i + 1];
    if (next === undefined) break;
    if (next === '%') {
      i += 1; // a literal percent sign — skip both characters
      continue;
    }
    if (!KNOWN_SPECIFIERS.includes(next)) {
      ctx.report({
        id: 'unknown-specifier',
        severity: 'warning',
        line: assignment.line,
        directive: assignment.key,
        title: `“%${next}” is not a systemd specifier.`,
        detail:
          'systemd expands “%” escapes in unit values, and ' +
          `“%${next}” is not one of them. Write “%%” for a literal percent sign.`,
        remediation: 'Write `%%` if you meant a literal percent sign.',
      });
      i += 1;
      continue;
    }
    if (INSTANCE_SPECIFIERS.includes(next)) {
      ctx.report({
        id: 'instance-specifier',
        severity: 'info',
        line: assignment.line,
        directive: assignment.key,
        title: `%${next} only has a value in a template unit.`,
        detail:
          `“%${next}” expands from the instance name, which exists only when the file is a template ` +
          '(name@.service) started as name@instance.service. In a plain unit it expands to an empty string.',
      });
    }
    i += 1;
  }
}

/** Shell metacharacters systemd does NOT interpret, outside quotes. */
const SHELL_META = /(\|\||&&|[|;<>`&]|\$\()/;

/** The command is itself a shell, so shell syntax in its argument is intended. */
function isShellCommand(command: string): boolean {
  const argv = splitQuoted(command);
  if (argv.length === 0) return false;
  const first = argv[0].split('/').pop() ?? '';
  if (/^(sh|bash|dash|zsh|ksh|fish)$/.test(first)) return true;
  // `/usr/bin/env sh -c …`
  if (first === 'env') {
    const second = (argv[1] ?? '').split('/').pop() ?? '';
    return /^(sh|bash|dash|zsh|ksh|fish)$/.test(second);
  }
  return false;
}

function execRules(ctx: RuleContext, assignment: Assignment): void {
  const { command } = stripExecPrefixes(assignment.value);
  if (command === '') return;

  const argv = splitQuoted(command);
  const program = argv[0] ?? command;

  if (!program.startsWith('/') && !program.startsWith('%')) {
    ctx.report({
      id: 'exec-not-absolute',
      severity: 'warning',
      line: assignment.line,
      directive: assignment.key,
      title: `${assignment.key}=${clip(program)} does not start with “/”.`,
      detail:
        'Exec* lines are not run through a shell, so the command is not looked up in $PATH and not ' +
        'resolved against WorkingDirectory=.',
      remediation: 'Write the absolute path, e.g. `/usr/local/bin/backup.sh`.',
    });
  }

  if (!isShellCommand(command) && SHELL_META.test(maskQuoted(command))) {
    ctx.report({
      id: 'exec-shell-syntax',
      severity: 'warning',
      line: assignment.line,
      directive: assignment.key,
      title: `${assignment.key}= uses shell syntax that systemd will not interpret.`,
      detail:
        'Exec* lines are not run through a shell, so “|”, “>”, “&&” and “;” are passed to the program ' +
        'as ordinary arguments. (systemd does expand $VAR and ${VAR} from Environment=, but nothing else.)',
      remediation: "Wrap it: `ExecStart=/bin/sh -lc '…'`.",
    });
  }
}

/** Five whitespace-separated fields that all look like cron fields. */
function looksLikeCron(value: string): boolean {
  const fields = value.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  return fields.every((field) => /^[*\d]([\d,/\-*]*)$/.test(field));
}

function calendarRules(ctx: RuleContext, assignment: Assignment): void {
  if (looksLikeCron(assignment.value)) {
    ctx.report({
      id: 'oncalendar-looks-like-cron',
      severity: 'error',
      line: assignment.line,
      directive: assignment.key,
      title: `OnCalendar=${clip(assignment.value)} is a crontab line, not a systemd calendar expression.`,
      detail:
        'A crontab schedule is five space-separated fields (minute hour day-of-month month ' +
        'day-of-week). OnCalendar= uses systemd’s own syntax — “DOW YYYY-MM-DD HH:MM:SS” — so systemd ' +
        'cannot parse this and the timer never fires.',
      remediation:
        'Convert the line with the Cron to systemd Converter at /cron-to-systemd/ instead of hand-writing it.',
    });
    return;
  }

  const check = validateOnCalendar(assignment.value);
  if (!check.valid) {
    ctx.report({
      id: 'oncalendar-invalid',
      severity: 'error',
      line: assignment.line,
      directive: assignment.key,
      title: `OnCalendar=${clip(assignment.value)} is not a valid calendar expression.`,
      detail:
        `${check.error} systemd refuses to load a timer whose OnCalendar= it cannot parse, so this ` +
        'timer never fires.',
      remediation: "Check the expression with `systemd-analyze calendar '…'` on a machine that has systemd.",
    });
    return;
  }
  for (const note of check.notes) {
    ctx.report({
      id: 'oncalendar-note',
      severity: 'info',
      line: assignment.line,
      directive: assignment.key,
      title: `OnCalendar=${clip(assignment.value)} is valid, with one caveat.`,
      detail: note,
    });
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * Unit-shape rules — [Service], [Timer], [Socket], [Install]
 * ──────────────────────────────────────────────────────────────────────── */

function serviceRules(ctx: RuleContext): void {
  if (ctx.sectionsNamed('Service').length === 0) return;

  const type = ctx.scalar('Service', 'Type') ?? 'simple';
  const execStarts = ctx.effective('Service', 'ExecStart');
  const execStops = ctx.effective('Service', 'ExecStop');
  const successAction = ctx.scalar('Unit', 'SuccessAction');

  if (execStarts.length === 0) {
    if (type === 'oneshot') {
      if (execStops.length === 0 && !successAction) {
        ctx.report({
          id: 'service-no-execstart',
          severity: 'error',
          line: ctx.sectionsNamed('Service')[0].line,
          directive: 'ExecStart',
          title: '[Service] has nothing to run.',
          detail:
            'A Type=oneshot service may leave out ExecStart=, but only if it has ExecStop= or ' +
            'SuccessAction=. With none of the three, systemd refuses to load it: “Service has no ' +
            'ExecStart=, ExecStop=, or SuccessAction=. Refusing.”',
          remediation: 'Add `ExecStart=`, or `ExecStop=` if the unit only does something on shutdown.',
        });
      }
    } else {
      ctx.report({
        id: 'service-no-execstart',
        severity: 'error',
        line: ctx.sectionsNamed('Service')[0].line,
        directive: 'ExecStart',
        title: '[Service] has no ExecStart=.',
        detail:
          'systemd refuses to load the unit: “Service has no ExecStart= setting, which is only ' +
          'allowed for Type=oneshot services.”',
        remediation: 'Add `ExecStart=` with the absolute path of the program to run.',
      });
    }
  }

  if (execStarts.length > 1 && type !== 'oneshot') {
    ctx.report({
      id: 'multiple-execstart',
      severity: 'error',
      line: execStarts[execStarts.length - 1].line,
      directive: 'ExecStart',
      title: `[Service] has ${execStarts.length} ExecStart= lines but Type=${type}.`,
      detail:
        'systemd refuses to load it: “Service has more than one ExecStart= setting, which is only ' +
        'allowed for Type=oneshot services.”',
      remediation: 'Use `Type=oneshot`, or move the extra command to `ExecStartPost=`.',
    });
  }

  if (type === 'forking' && !ctx.scalar('Service', 'PIDFile')) {
    ctx.report({
      id: 'forking-no-pidfile',
      severity: 'warning',
      line: ctx.effective('Service', 'Type')[0]?.line,
      directive: 'PIDFile',
      title: 'Type=forking without PIDFile=.',
      detail:
        'systemd has to guess which of the forked processes is the main one. When it guesses wrong ' +
        'the service is reported dead while the daemon is still running, and stop or reload act on ' +
        'the wrong PID.',
      remediation:
        'Add `PIDFile=` with the path the daemon writes, or switch to `Type=simple`/`Type=notify` if ' +
        'it can stay in the foreground.',
    });
  }

  const restart = ctx.scalar('Service', 'Restart');
  if (type === 'oneshot' && (restart === 'always' || restart === 'on-success')) {
    ctx.report({
      id: 'restart-conflicts-oneshot',
      severity: 'error',
      line: ctx.effective('Service', 'Restart').slice(-1)[0]?.line,
      directive: 'Restart',
      title: `Restart=${restart} cannot be combined with Type=oneshot.`,
      detail:
        'systemd refuses to load the unit: “Service has Restart= set to either always or on-success, ' +
        'which isn\'t allowed for Type=oneshot services.” Restart=on-failure IS allowed for oneshot.',
      remediation: 'Drop `Restart=`, or use `Restart=on-failure`.',
    });
  }

  const dynamicUser = ctx.scalar('Service', 'DynamicUser');
  const hasWritable = ['StateDirectory', 'RuntimeDirectory', 'CacheDirectory', 'LogsDirectory'].some(
    (key) => ctx.effective('Service', key).length > 0,
  );
  if (dynamicUser && parseBooleanValue(dynamicUser) === true && !hasWritable) {
    ctx.report({
      id: 'dynamicuser-pitfall',
      severity: 'warning',
      line: ctx.effective('Service', 'DynamicUser').slice(-1)[0]?.line,
      directive: 'DynamicUser',
      title: 'DynamicUser=yes with no StateDirectory=.',
      detail:
        'With DynamicUser=yes the UID is allocated afresh on every start, /tmp and /var/tmp are ' +
        'private to the service, and most of the filesystem is read-only to it. Anything it needs to ' +
        'keep across restarts has to live in a directory systemd creates and re-chowns for it.',
      remediation:
        'Add `StateDirectory=` (systemd creates /var/lib/<name> and fixes its owner on every start).',
    });
  }
}

function timerRules(ctx: RuleContext): void {
  const timers = ctx.sectionsNamed('Timer');
  if (timers.length === 0) return;

  const triggers = TIMER_TRIGGERS.filter((key) => ctx.effective('Timer', key).length > 0);
  if (triggers.length === 0) {
    ctx.report({
      id: 'timer-no-trigger',
      severity: 'error',
      line: timers[0].line,
      directive: 'OnCalendar',
      title: '[Timer] has no OnCalendar= and no On*Sec=, so it never fires.',
      detail:
        'systemd refuses to load a timer with no trigger: “Timer unit lacks value setting.” A timer ' +
        'needs at least one of OnCalendar=, OnActiveSec=, OnBootSec=, OnStartupSec=, OnUnitActiveSec= ' +
        'or OnUnitInactiveSec=.',
      remediation: 'Add `OnCalendar=` (a wall-clock schedule) or `OnBootSec=` (relative to boot).',
    });
  }

  const persistent = ctx.scalar('Timer', 'Persistent');
  if (
    persistent &&
    parseBooleanValue(persistent) === true &&
    ctx.effective('Timer', 'OnCalendar').length === 0
  ) {
    ctx.report({
      id: 'persistent-no-oncalendar',
      severity: 'warning',
      line: ctx.effective('Timer', 'Persistent').slice(-1)[0]?.line,
      directive: 'Persistent',
      title: 'Persistent=true has no effect without OnCalendar=.',
      detail:
        'Persistent= only applies to calendar timers: it records the last trigger on disk and fires ' +
        'immediately at boot when a run was missed. On a monotonic timer (On*Sec=) it does nothing.',
      remediation: 'Either add `OnCalendar=`, or drop `Persistent=`.',
    });
  }

  if (!ctx.scalar('Timer', 'Unit')) {
    ctx.report({
      id: 'timer-unit-note',
      severity: 'info',
      line: timers[0].line,
      directive: 'Unit',
      title: 'This timer has no Unit=, so it triggers the service with the same name.',
      detail:
        'A .timer with no Unit= starts the .service of the same basename — backup.timer starts ' +
        'backup.service. If the service has a different name, the timer fails with “Unit not found”.',
    });
  }
}

function socketRules(ctx: RuleContext): void {
  const sockets = ctx.sectionsNamed('Socket');
  if (sockets.length === 0) return;

  const listens = LISTEN_DIRECTIVES.filter((key) => ctx.effective('Socket', key).length > 0);
  if (listens.length === 0) {
    ctx.report({
      id: 'socket-no-listen',
      severity: 'error',
      line: sockets[0].line,
      directive: 'ListenStream',
      title: '[Socket] has no Listen* directive, so there is nothing to listen on.',
      detail:
        'systemd refuses to load the unit: “Socket unit lacks Listen setting.” A socket needs at ' +
        'least one of ListenStream=, ListenDatagram=, ListenSequentialPacket=, ListenFIFO=, ' +
        'ListenSpecial=, ListenNetlink=, ListenMessageQueue= or ListenUSBFunction=.',
      remediation: 'Add `ListenStream=` with a port, an address or a socket path.',
    });
  }
}

/** Targets that exist in the SYSTEM manager only. */
const SYSTEM_ONLY_TARGETS = new Set([
  'multi-user.target',
  'graphical.target',
  'rescue.target',
  'emergency.target',
  'sysinit.target',
  'network-online.target',
  'remote-fs.target',
  'local-fs.target',
]);

function installRules(ctx: RuleContext): void {
  const installs = ctx.sectionsNamed('Install');

  if (installs.length === 0 && ctx.kind !== 'unknown' && ctx.kind !== 'unsupported') {
    const remediation =
      ctx.kind === 'timer'
        ? 'Add `[Install]` with `WantedBy=timers.target`.'
        : ctx.kind === 'socket'
          ? 'Add `[Install]` with `WantedBy=sockets.target`.'
          : 'Add `[Install]` with `WantedBy=multi-user.target` (or `default.target` for a user unit).';
    ctx.report({
      id: 'missing-install',
      severity: 'warning',
      title: 'No [Install] section, so “systemctl enable” has nothing to do.',
      detail:
        'systemctl enable reads WantedBy=, RequiredBy= and Also= from [Install] to create its ' +
        'symlinks. Without them the unit only ever starts by hand, or when another unit pulls it in — ' +
        'which is correct for a service triggered by a .timer or .socket.',
      remediation,
    });
  }

  if (ctx.scope !== 'user') return;

  for (const key of ['WantedBy', 'RequiredBy']) {
    for (const assignment of ctx.effective('Install', key)) {
      for (const target of assignment.value.split(/\s+/)) {
        if (!SYSTEM_ONLY_TARGETS.has(target)) continue;
        ctx.report({
          id: 'wantedby-scope-mismatch',
          severity: 'warning',
          line: assignment.line,
          directive: key,
          title: `${key}=${target} is a system target, but this is a user unit.`,
          detail:
            '“systemctl --user enable” looks for the target inside the user manager, where ' +
            `${target} does not exist, so the enable fails or the unit never starts.`,
          remediation:
            'Use `WantedBy=default.target` for a user unit (or `timers.target`, which does exist in ' +
            'the user manager).',
        });
      }
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * The rule list
 * ──────────────────────────────────────────────────────────────────────── */

export interface Rule {
  id: string;
  run(ctx: RuleContext): void;
}

/**
 * Every finding id this file can emit, in the order the tool page's reference
 * section lists them.
 *
 * It exists so the page can say "35 checks" and have that number be a fact
 * rather than a guess: `engine.test.ts` reads this file, extracts every
 * `id: '…'` literal, and fails if the two ever disagree. `internal-check-
 * incomplete` (engine.ts) is excluded on purpose — it is the "a rule crashed"
 * degradation, not a check.
 */
export const CHECK_IDS: readonly string[] = [
  // Sections
  'section-case',
  'unknown-section',
  'x-prefixed-section',
  'duplicate-section',
  'unsupported-section',
  // Lines systemd throws away
  'missing-equals',
  'assignment-outside-section',
  'inline-comment',
  'comment-in-continuation',
  // Directive names
  'wrong-section',
  'typo-directive',
  'unknown-directive',
  'deprecated-directive',
  // Values
  'bad-enum-or-bool',
  'exec-not-absolute',
  'exec-shell-syntax',
  'unknown-specifier',
  'instance-specifier',
  // Repeats
  'repeated-scalar-directive',
  'repeated-list-directive',
  'empty-assignment-reset',
  // [Service]
  'service-no-execstart',
  'multiple-execstart',
  'forking-no-pidfile',
  'restart-conflicts-oneshot',
  'dynamicuser-pitfall',
  // [Timer]
  'timer-no-trigger',
  'oncalendar-invalid',
  'oncalendar-looks-like-cron',
  'oncalendar-note',
  'persistent-no-oncalendar',
  'timer-unit-note',
  // [Socket]
  'socket-no-listen',
  // [Install]
  'missing-install',
  'wantedby-scope-mismatch',
];

/**
 * Order matters only for readability — findings are sorted by severity and line
 * before they are returned.
 */
export const RULES: readonly Rule[] = [
  { id: 'sections', run: sectionRules },
  { id: 'stray-lines', run: strayLineRules },
  { id: 'directives', run: directiveRules },
  { id: 'service', run: serviceRules },
  { id: 'timer', run: timerRules },
  { id: 'socket', run: socketRules },
  { id: 'install', run: installRules },
];
