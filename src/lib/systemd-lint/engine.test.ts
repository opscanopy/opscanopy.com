import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CALENDAR_SHORTHANDS } from './calendar';
import { ALL_DIRECTIVE_NAMES, CHECKED_SECTIONS, UNCHECKED_SECTIONS } from './directives';
import {
  MAX_FINDINGS_PER_RULE,
  MAX_FINDINGS_TOTAL,
  MAX_INPUT_CHARS,
  lint,
  parseUnit,
  summaryLine,
} from './engine';
import { examples } from './examples';
import { CHECK_IDS } from './rules';
import type { Finding, LintResult, Severity } from './types';

/* ────────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────────── */

function ids(result: LintResult): string[] {
  return result.findings.map((f) => f.id);
}

function find(result: LintResult, id: string): Finding {
  const hit = result.findings.find((f) => f.id === id);
  if (!hit) {
    throw new Error(
      `no “${id}” finding. Got: ${result.findings.map((f) => `${f.id}@${f.line}`).join(', ') || '(none)'}` +
        (result.ok ? '' : ` — fatal: ${result.error}`),
    );
  }
  return hit;
}

function has(result: LintResult, id: string): boolean {
  return result.findings.some((f) => f.id === id);
}

function severityOf(result: LintResult, id: string): Severity {
  return find(result, id).severity;
}

/** A minimal service that produces zero findings — the baseline for negatives. */
const CLEAN_SERVICE = `[Unit]
Description=Test unit

[Service]
Type=simple
ExecStart=/usr/bin/true

[Install]
WantedBy=multi-user.target
`;

describe('lint — the baseline is silent', () => {
  it('finds nothing in a correct service', () => {
    const r = lint(CLEAN_SERVICE);
    expect(r.ok).toBe(true);
    expect(r.findings).toEqual([]);
    expect(r.kind).toBe('service');
    expect(r.scope).toBe('system');
    expect(r.summary).toEqual({ errors: 0, warnings: 0, infos: 0 });
  });

  it('counts physical lines, sections and directives', () => {
    const r = lint(CLEAN_SERVICE);
    expect(r.stats).toEqual({ lines: 9, sections: 3, directives: 4 });
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * PARSER — the nine cases from the plan
 * ════════════════════════════════════════════════════════════════════════ */

describe('parser — continuation folding keeps physical line numbers', () => {
  const unit = `[Unit]
Description=Folded

[Service]
Type=oneshot
ExecStart=/usr/bin/tool \\
    --first \\
    --second
ExecStop=notabsolute
`;

  it('folds a continuation into one value, joined by a space', () => {
    const parsed = parseUnit(unit);
    const exec = parsed.assignments.find((a) => a.key === 'ExecStart');
    expect(exec?.value).toBe('/usr/bin/tool --first --second');
  });

  it('keeps the starting and ending physical line of a folded assignment', () => {
    const parsed = parseUnit(unit);
    const exec = parsed.assignments.find((a) => a.key === 'ExecStart');
    expect(exec?.line).toBe(6);
    expect(exec?.endLine).toBe(8);
    expect(exec?.parts.map((p) => p.line)).toEqual([6, 7, 8]);
  });

  it('reports the line AFTER a folded block at its real physical number', () => {
    // The whole point of tracking physical lines: a finding on line 9 must not
    // be reported on line 7 just because lines 6-8 folded into one assignment.
    const r = lint(unit);
    expect(find(r, 'exec-not-absolute').line).toBe(9);
  });
});

describe('parser — comments', () => {
  it('ignores full-line # and ; comments, indented or not', () => {
    const r = lint(`# a hash comment
; a semicolon comment
   # an indented hash comment
[Unit]
Description=Commented

[Service]
Type=simple
ExecStart=/usr/bin/true

[Install]
WantedBy=multi-user.target
`);
    expect(r.ok).toBe(true);
    expect(r.findings).toEqual([]);
  });

  it('treats a comment inside a continuation as a comment, and says so', () => {
    const r = lint(`[Unit]
Description=Test

[Service]
Type=oneshot
ExecStart=/usr/bin/tool \\
# this comment interrupts the continuation
    --flag
`);
    const finding = find(r, 'comment-in-continuation');
    expect(finding.severity).toBe('info');
    expect(finding.line).toBe(7);
    expect(finding.title).toBe('A comment line sits inside the “\\” continuation of ExecStart=.');
    // The value itself must NOT contain the comment text.
    const exec = parseUnit(`[Service]
ExecStart=/usr/bin/tool \\
# nope
    --flag
`).assignments.find((a) => a.key === 'ExecStart');
    expect(exec?.value).toBe('/usr/bin/tool --flag');
  });
});

describe('parser — there are no end-of-line comments', () => {
  it('keeps the “comment” in the value and names the trap', () => {
    const r = lint(`[Unit]
Description=Test

[Service]
Type=simple
ExecStart=/usr/bin/true
RestartSec=30 # nightly
`);
    const finding = find(r, 'inline-comment');
    expect(finding.severity).toBe('warning');
    expect(finding.line).toBe(7);
    expect(finding.directive).toBe('RestartSec');
    expect(finding.title).toBe('RestartSec= keeps “# nightly” as part of its value.');
    expect(finding.detail).toBe(
      'A unit file has no end-of-line comments: everything after “=” — including “# nightly” — becomes part of the value.',
    );
    expect(finding.remediation).toBe('Move the comment onto its own line above the directive.');
  });

  it('flags a “;” end-of-line comment the same way', () => {
    const r = lint(`[Service]
ExecStart=/usr/bin/true
RestartSec=30 ; later
`);
    expect(find(r, 'inline-comment').title).toBe('RestartSec= keeps “; later” as part of its value.');
  });

  it('does NOT flag a “;” inside quotes — nginx writes those on purpose', () => {
    const r = lint(`[Unit]
Description=Test

[Service]
Type=forking
PIDFile=/run/nginx.pid
ExecStart=/usr/sbin/nginx -g 'daemon on; master_process on;'

[Install]
WantedBy=multi-user.target
`);
    expect(has(r, 'inline-comment')).toBe(false);
  });

  it('does NOT flag a “#” that is part of a value with no preceding space', () => {
    const r = lint(`[Service]
ExecStart=/usr/bin/tool --color=#ff0000
`);
    expect(has(r, 'inline-comment')).toBe(false);
  });
});

describe('parser — repeated directives', () => {
  it('appends a list directive and reports it as a note', () => {
    const r = lint(`[Unit]
Description=Test

[Service]
Type=oneshot
ExecStartPre=/usr/bin/first
ExecStartPre=/usr/bin/second
ExecStart=/usr/bin/true

[Install]
WantedBy=multi-user.target
`);
    const finding = find(r, 'repeated-list-directive');
    expect(finding.severity).toBe('info');
    expect(finding.title).toBe('ExecStartPre= appears twice — systemd appends, so both run in order.');
  });

  it('warns that a repeated scalar silently loses the earlier value', () => {
    const r = lint(`[Unit]
Description=Test

[Service]
Type=simple
ExecStart=/usr/bin/true
Type=oneshot

[Install]
WantedBy=multi-user.target
`);
    const finding = find(r, 'repeated-scalar-directive');
    expect(finding.severity).toBe('warning');
    expect(finding.line).toBe(7);
    expect(finding.title).toBe('Type= is set twice; only the value on line 7 takes effect.');
    expect(finding.detail).toBe(
      'Type= is not a list directive, so systemd keeps the last assignment and silently discards the earlier one on line 5.',
    );
  });

  it('uses “3 times” rather than “twice” past two', () => {
    const r = lint(`[Service]
ExecStart=/usr/bin/true
Type=simple
Type=exec
Type=oneshot
`);
    expect(find(r, 'repeated-scalar-directive').title).toBe(
      'Type= is set 3 times; only the value on line 5 takes effect.',
    );
  });

  it('reads the LAST value of a repeated scalar for the other rules', () => {
    // Type=oneshot wins, so Restart=always is a hard conflict even though the
    // first Type= says simple.
    const r = lint(`[Service]
ExecStart=/usr/bin/true
Restart=always
Type=simple
Type=oneshot
`);
    expect(has(r, 'restart-conflicts-oneshot')).toBe(true);
  });
});

describe('parser — an empty assignment resets a list', () => {
  it('reports the reset as a note', () => {
    const r = lint(`[Unit]
Description=Test
After=
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/true

[Install]
WantedBy=multi-user.target
`);
    const finding = find(r, 'empty-assignment-reset');
    expect(finding.severity).toBe('info');
    expect(finding.line).toBe(3);
    expect(finding.title).toBe('After= is assigned an empty value, which resets the list.');
  });

  it('does not count a reset ExecStart towards the multiple-ExecStart rule', () => {
    // `ExecStart=` clears the list, so this service has exactly ONE command.
    const r = lint(`[Service]
Type=simple
ExecStart=/usr/bin/wrong
ExecStart=
ExecStart=/usr/bin/right
`);
    expect(has(r, 'multiple-execstart')).toBe(false);
    expect(has(r, 'service-no-execstart')).toBe(false);
  });
});

describe('parser — section headers are case-sensitive', () => {
  it('treats [unit] as an error with the exact fix', () => {
    const r = lint(`[unit]
Description=Test

[Service]
Type=simple
ExecStart=/usr/bin/true

[Install]
WantedBy=multi-user.target
`);
    const finding = find(r, 'section-case');
    expect(finding.severity).toBe('error');
    expect(finding.line).toBe(1);
    expect(finding.title).toBe(
      '[unit] is not a section systemd knows — section names are case-sensitive.',
    );
    expect(finding.detail).toBe(
      'systemd matches section headers exactly, so “unit” is an unknown section: it logs “Unknown ' +
        "section 'unit'. Ignoring.” and every directive inside it is discarded.",
    );
    expect(finding.remediation).toBe('Write `[Unit]`.');
  });

  it('does not report directive findings inside a section it is ignoring', () => {
    const r = lint(`[service]
Type=simple
ExecStart=relative
`);
    expect(has(r, 'exec-not-absolute')).toBe(false);
    expect(has(r, 'section-case')).toBe(true);
  });
});

describe('parser — unknown and private sections', () => {
  it('warns about an unknown section and suggests the near match', () => {
    const r = lint(`[Servcie]
Type=simple
ExecStart=/usr/bin/true
`);
    const finding = find(r, 'unknown-section');
    expect(finding.severity).toBe('warning');
    expect(finding.title).toBe('[Servcie] is not a section systemd knows.');
    expect(finding.remediation).toBe('Did you mean `[Service]`?');
  });

  it('notes an X- prefixed section instead of warning', () => {
    const r = lint(`[Unit]
Description=Test

[X-Ansible]
managed=true

[Service]
Type=simple
ExecStart=/usr/bin/true

[Install]
WantedBy=multi-user.target
`);
    const finding = find(r, 'x-prefixed-section');
    expect(finding.severity).toBe('info');
    expect(finding.title).toBe('[X-Ansible] is a private section — systemd ignores it by design.');
    expect(has(r, 'unknown-section')).toBe(false);
    // Nothing inside it is checked as a directive.
    expect(has(r, 'unknown-directive')).toBe(false);
  });

  it('says out loud that [Mount] directives are not checked', () => {
    const r = lint(`[Unit]
Description=Test

[Mount]
What=/dev/sdb1
Where=/mnt/data
`);
    const finding = find(r, 'unsupported-section');
    expect(finding.severity).toBe('info');
    expect(finding.title).toBe('This validator does not check directives inside [Mount].');
    expect(r.kind).toBe('unsupported');
    expect(has(r, 'unknown-directive')).toBe(false);
  });

  it('warns when a section is repeated', () => {
    const r = lint(`[Service]
Type=simple
ExecStart=/usr/bin/true

[Service]
Restart=on-failure
`);
    const finding = find(r, 'duplicate-section');
    expect(finding.severity).toBe('warning');
    expect(finding.line).toBe(5);
    expect(finding.title).toBe('[Service] appears twice.');
  });
});

describe('parser — lines systemd throws away', () => {
  it('warns about a line with no “=”', () => {
    const r = lint(`[Service]
ExecStart=/usr/bin/true
Restart always
`);
    const finding = find(r, 'missing-equals');
    expect(finding.severity).toBe('warning');
    expect(finding.line).toBe(3);
    expect(finding.title).toBe('Line 3 (“Restart always”) has no “=”, so systemd ignores it.');
    expect(finding.detail).toBe(
      'systemd logs “Missing \'=\', ignoring line.” for any line in a unit file that is not blank, a ' +
        'comment, a “[Section]” header or a “Name=value” assignment.',
    );
  });

  it('warns about an assignment before the first section, echoing the line', () => {
    const r = lint(`ExecStart=/usr/bin/true

[Service]
Type=simple
ExecStart=/usr/bin/true
`);
    const finding = find(r, 'assignment-outside-section');
    expect(finding.severity).toBe('warning');
    expect(finding.line).toBe(1);
    expect(finding.title).toBe(
      'ExecStart= appears before any “[Section]” header, so systemd ignores it.',
    );
    expect(finding.detail).toBe(
      'Line 1 reads “ExecStart=/usr/bin/true”. systemd logs “Assignment outside of section. Ignoring.” ' +
        '— a directive only takes effect inside the section that owns it.',
    );
    expect(finding.remediation).toBe('Move it under `[Service]`.');
  });

  it('echoes an outside-section line verbatim, whatever it contains', () => {
    // This is the path the XSS probe drives: the value is echoed into the
    // finding, so the playground has to escape it.
    const payload = 'ExecStart=<img src=x onerror=alert(1)>';
    const r = lint(payload);
    expect(r.ok).toBe(true);
    expect(find(r, 'assignment-outside-section').detail).toContain(
      'Line 1 reads “ExecStart=<img src=x onerror=alert(1)>”.',
    );
  });
});

describe('parser — Exec prefixes and specifiers', () => {
  for (const prefix of ['-', '@', '+', '!', '!!', ':', '-@', '@-']) {
    it(`strips the “${prefix}” Exec prefix before checking the path`, () => {
      const r = lint(`[Service]
Type=oneshot
ExecStart=${prefix}/usr/bin/true argv0
`);
      expect(has(r, 'exec-not-absolute'), `prefix ${prefix} should be stripped`).toBe(false);
    });
  }

  it('accepts a specifier at the start of an Exec path', () => {
    const r = lint(`[Service]
Type=oneshot
ExecStart=%h/.local/bin/sync-notes
`);
    expect(has(r, 'exec-not-absolute')).toBe(false);
  });

  it('warns about an unknown specifier', () => {
    const r = lint(`[Unit]
Description=Test %x

[Service]
Type=simple
ExecStart=/usr/bin/true

[Install]
WantedBy=multi-user.target
`);
    const finding = find(r, 'unknown-specifier');
    expect(finding.severity).toBe('warning');
    expect(finding.line).toBe(2);
    expect(finding.title).toBe('“%x” is not a systemd specifier.');
    expect(finding.detail).toBe(
      'systemd expands “%” escapes in unit values, and “%x” is not one of them. Write “%%” for a literal percent sign.',
    );
  });

  it('accepts the known specifiers and the %% escape', () => {
    const r = lint(`[Unit]
Description=%n on %H

[Service]
Type=simple
ExecStart=/usr/bin/tool --state %t --cache %C --pct 50%%
WorkingDirectory=%h

[Install]
WantedBy=multi-user.target
`);
    expect(has(r, 'unknown-specifier')).toBe(false);
  });

  it('notes that %i only means something in a template unit', () => {
    const r = lint(`[Service]
Type=simple
ExecStart=/usr/bin/tool --name %i
`);
    const finding = find(r, 'instance-specifier');
    expect(finding.severity).toBe('info');
    expect(finding.title).toBe('%i only has a value in a template unit.');
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * FATAL — what systemd itself refuses, and what is not a unit file
 * ════════════════════════════════════════════════════════════════════════ */

describe('lint — fatal input', () => {
  it('asks for input when there is none', () => {
    for (const empty of ['', '   ', '\n\n', '\t']) {
      const r = lint(empty);
      expect(r.ok).toBe(false);
      expect(r.error).toBe('Paste a unit file to check — a .service, .timer or .socket.');
      expect(r.findings).toEqual([]);
    }
  });

  it('rejects a section header with no closing bracket', () => {
    const r = lint('[Unit');
    expect(r.ok).toBe(false);
    expect(r.error).toBe(
      '“[Unit” on line 1 looks like a section header but has no closing “]” — systemd refuses to ' +
        'load a unit file with an invalid section header.',
    );
    expect(r.findings).toEqual([]);
  });

  it('rejects a section header with a trailing end-of-line comment', () => {
    // `[Service] # the meat` does not end in “]”, so systemd calls the whole
    // header invalid — the classic reason a hand-annotated unit stops loading.
    const r = lint(`[Unit]
Description=Test

[Service] # the meat
ExecStart=/usr/bin/true
`);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('“[Service] # the meat” on line 4 looks like a section header');
  });

  it('rejects an empty section name', () => {
    const r = lint('[]\nExecStart=/usr/bin/true\n');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('The section header on line 1 has no name — “[]” is not a section.');
  });

  it('rejects text that is not a unit file at all', () => {
    const r = lint('0 3 * * * /usr/bin/backup.sh');
    expect(r.ok).toBe(false);
    expect(r.error).toBe(
      'This does not look like a unit file: it has no “[Section]” header and no “Name=value” ' +
        'assignment. Paste the contents of a .service, .timer or .socket unit.',
    );
  });

  it('refuses input past the scan limit, with the real size', () => {
    const huge = 'x'.repeat(MAX_INPUT_CHARS + 1);
    const r = lint(huge);
    expect(r.ok).toBe(false);
    expect(r.error).toBe(
      `This input is ${(MAX_INPUT_CHARS + 1).toLocaleString('en-US')} characters — larger than the ` +
        `${MAX_INPUT_CHARS.toLocaleString('en-US')}-character limit this validator scans. Paste the ` +
        'unit file itself rather than a journal dump.',
    );
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * SEMANTIC RULES — positive AND negative for each
 * ════════════════════════════════════════════════════════════════════════ */

describe('rule: wrong-section', () => {
  it('names the section a directive belongs in', () => {
    const r = lint(`[Unit]
Description=Test
User=backup

[Service]
Type=simple
ExecStart=/usr/bin/true

[Install]
WantedBy=multi-user.target
`);
    const finding = find(r, 'wrong-section');
    expect(finding.severity).toBe('error');
    expect(finding.line).toBe(3);
    expect(finding.directive).toBe('User');
    expect(finding.title).toBe('User= belongs in [Service], not [Unit].');
    // The detail names EVERY section that accepts the directive (User= is valid
    // in [Socket] too, for the processes an Accept=yes socket spawns), while the
    // title names the one to move it to. Naming only [Service] would be a
    // smaller truth than the table actually knows.
    expect(finding.detail).toBe(
      'systemd only reads User= from [Service] or [Socket]. Here it logs “Unknown key name \'User\' in ' +
        "section 'Unit', ignoring.” and the setting has no effect at all.",
    );
    expect(finding.remediation).toBe('Move the line into the `[Service]` section.');
  });

  it('catches WantedBy= in [Unit] — the classic generated-unit mistake', () => {
    const r = lint(`[Unit]
Description=Test
WantedBy=timers.target

[Service]
Type=simple
ExecStart=/usr/bin/true
`);
    expect(find(r, 'wrong-section').title).toBe('WantedBy= belongs in [Install], not [Unit].');
  });

  it('catches ExecReload= in [Unit]', () => {
    const r = lint(`[Unit]
Description=Test
ExecReload=/bin/kill -HUP $MAINPID

[Service]
Type=simple
ExecStart=/usr/bin/true
`);
    expect(find(r, 'wrong-section').title).toBe('ExecReload= belongs in [Service], not [Unit].');
  });

  it('stays silent when the directive is where it belongs', () => {
    expect(has(lint(CLEAN_SERVICE), 'wrong-section')).toBe(false);
  });

  it('does not flag a directive that is legal in several sections', () => {
    // ExecStartPre= is valid in [Service] AND [Socket]; Description= in [Unit].
    const r = lint(`[Unit]
Description=Test

[Socket]
ListenStream=8080
ExecStartPre=/usr/bin/true

[Install]
WantedBy=sockets.target
`);
    expect(has(r, 'wrong-section')).toBe(false);
  });
});

describe('rule: typo-directive', () => {
  it('suggests the near match in the same section', () => {
    const r = lint(`[Service]
Type=simple
ExecStart=/usr/bin/true
ExecStrat=/usr/bin/other
`);
    const finding = find(r, 'typo-directive');
    expect(finding.severity).toBe('error');
    expect(finding.line).toBe(4);
    expect(finding.title).toBe('ExecStrat= is not a systemd directive — did you mean ExecStart=?');
    expect(finding.detail).toBe(
      'systemd logs “Unknown key name \'ExecStrat\' in section \'Service\', ignoring.”, so this line does nothing.',
    );
    expect(finding.remediation).toBe('Write `ExecStart=`.');
  });

  it('catches the RestartSecs= hallucination', () => {
    const r = lint(`[Service]
Type=simple
ExecStart=/usr/bin/true
RestartSecs=5
`);
    expect(find(r, 'typo-directive').title).toBe(
      'RestartSecs= is not a systemd directive — did you mean RestartSec=?',
    );
  });

  it('catches a wrong-case directive name, because systemd is case-sensitive', () => {
    const r = lint(`[Service]
Type=simple
execstart=/usr/bin/true
`);
    expect(find(r, 'typo-directive').title).toBe(
      'execstart= is not a systemd directive — did you mean ExecStart=?',
    );
  });

  it('does not guess when nothing is close', () => {
    const r = lint(`[Service]
Type=simple
ExecStart=/usr/bin/true
Frobnicate=yes
`);
    expect(has(r, 'typo-directive')).toBe(false);
  });
});

describe('rule: unknown-directive is ALWAYS a note', () => {
  it('reports an unrecognised name as info, never as an error', () => {
    const r = lint(`[Service]
Type=simple
ExecStart=/usr/bin/true
Frobnicate=yes
`);
    const finding = find(r, 'unknown-directive');
    expect(finding.severity).toBe('info');
    expect(finding.title).toBe('Frobnicate= is not in this page’s directive table.');
    expect(finding.detail).toBe(
      'That is a note, not an error: this page ships a directive table, not the systemd on your ' +
        'machine, so a name it does not recognise may simply be newer than the table. If it is a typo, ' +
        'systemd ignores the line and logs “Unknown key name”.',
    );
    expect(finding.remediation).toBe('Check it against `systemd.directives(7)` for your systemd version.');
  });

  it('never emits an error severity for an unknown name, whatever it is', () => {
    for (const name of ['Zzzz', 'A', 'X', 'Totally-Made-Up', 'ExecStartPreflight']) {
      const r = lint(`[Service]\nType=simple\nExecStart=/usr/bin/true\n${name}=1\n`);
      for (const f of r.findings) {
        if (f.id === 'unknown-directive') expect(f.severity).toBe('info');
      }
    }
  });
});

describe('rule: service-no-execstart', () => {
  it('errors when a non-oneshot service has no ExecStart=', () => {
    const r = lint(`[Unit]
Description=Test

[Service]
Type=simple
User=nobody
`);
    const finding = find(r, 'service-no-execstart');
    expect(finding.severity).toBe('error');
    expect(finding.title).toBe('[Service] has no ExecStart=.');
    expect(finding.detail).toBe(
      'systemd refuses to load the unit: “Service has no ExecStart= setting, which is only allowed ' +
        'for Type=oneshot services.”',
    );
  });

  it('errors when a oneshot service has no ExecStart, ExecStop or SuccessAction', () => {
    const r = lint(`[Service]
Type=oneshot
RemainAfterExit=yes
`);
    const finding = find(r, 'service-no-execstart');
    expect(finding.title).toBe('[Service] has nothing to run.');
    expect(finding.detail).toBe(
      'A Type=oneshot service may leave out ExecStart=, but only if it has ExecStop= or ' +
        'SuccessAction=. With none of the three, systemd refuses to load it: “Service has no ' +
        'ExecStart=, ExecStop=, or SuccessAction=. Refusing.”',
    );
  });

  it('accepts a oneshot service that only has ExecStop=', () => {
    const r = lint(`[Service]
Type=oneshot
RemainAfterExit=yes
ExecStop=/usr/bin/true
`);
    expect(has(r, 'service-no-execstart')).toBe(false);
  });

  it('accepts a oneshot service that only has SuccessAction=', () => {
    const r = lint(`[Unit]
Description=Test
SuccessAction=poweroff

[Service]
Type=oneshot
`);
    expect(has(r, 'service-no-execstart')).toBe(false);
  });
});

describe('rule: multiple-execstart', () => {
  it('errors for two ExecStart= lines when Type is not oneshot', () => {
    const r = lint(`[Service]
Type=simple
ExecStart=/usr/bin/first
ExecStart=/usr/bin/second
`);
    const finding = find(r, 'multiple-execstart');
    expect(finding.severity).toBe('error');
    expect(finding.line).toBe(4);
    expect(finding.title).toBe('[Service] has 2 ExecStart= lines but Type=simple.');
    expect(finding.detail).toBe(
      'systemd refuses to load it: “Service has more than one ExecStart= setting, which is only ' +
        'allowed for Type=oneshot services.”',
    );
  });

  it('errors the same way when Type= is absent (the default is simple)', () => {
    const r = lint(`[Service]
ExecStart=/usr/bin/first
ExecStart=/usr/bin/second
`);
    expect(find(r, 'multiple-execstart').title).toBe(
      '[Service] has 2 ExecStart= lines but Type=simple.',
    );
  });

  it('accepts several ExecStart= lines for Type=oneshot', () => {
    const r = lint(`[Service]
Type=oneshot
ExecStart=/usr/bin/first
ExecStart=/usr/bin/second
ExecStart=/usr/bin/third
`);
    expect(has(r, 'multiple-execstart')).toBe(false);
  });
});

describe('rule: forking-no-pidfile', () => {
  it('warns when Type=forking has no PIDFile=', () => {
    const r = lint(`[Service]
Type=forking
ExecStart=/usr/sbin/daemon
`);
    const finding = find(r, 'forking-no-pidfile');
    expect(finding.severity).toBe('warning');
    expect(finding.title).toBe('Type=forking without PIDFile=.');
  });

  it('stays silent when PIDFile= is set', () => {
    const r = lint(`[Service]
Type=forking
PIDFile=/run/daemon.pid
ExecStart=/usr/sbin/daemon
`);
    expect(has(r, 'forking-no-pidfile')).toBe(false);
  });
});

describe('rule: restart-conflicts-oneshot', () => {
  for (const value of ['always', 'on-success']) {
    it(`errors for Restart=${value} with Type=oneshot`, () => {
      const r = lint(`[Service]
Type=oneshot
ExecStart=/usr/bin/true
Restart=${value}
`);
      const finding = find(r, 'restart-conflicts-oneshot');
      expect(finding.severity).toBe('error');
      expect(finding.title).toBe(`Restart=${value} cannot be combined with Type=oneshot.`);
      expect(finding.detail).toBe(
        'systemd refuses to load the unit: “Service has Restart= set to either always or on-success, ' +
          'which isn\'t allowed for Type=oneshot services.” Restart=on-failure IS allowed for oneshot.',
      );
    });
  }

  // The precision that stops this being a cry-wolf rule: oneshot + on-failure is
  // legal, and plenty of real units use it.
  for (const value of ['on-failure', 'on-abnormal', 'on-abort', 'on-watchdog', 'no']) {
    it(`accepts Restart=${value} with Type=oneshot`, () => {
      const r = lint(`[Service]
Type=oneshot
ExecStart=/usr/bin/true
Restart=${value}
`);
      expect(has(r, 'restart-conflicts-oneshot')).toBe(false);
    });
  }

  it('accepts Restart=always when Type is not oneshot', () => {
    const r = lint(`[Service]
Type=simple
ExecStart=/usr/bin/true
Restart=always
`);
    expect(has(r, 'restart-conflicts-oneshot')).toBe(false);
  });
});

describe('rule: missing-install', () => {
  it('warns with the target that suits a service', () => {
    const r = lint(`[Service]
Type=simple
ExecStart=/usr/bin/true
`);
    const finding = find(r, 'missing-install');
    expect(finding.severity).toBe('warning');
    expect(finding.title).toBe('No [Install] section, so “systemctl enable” has nothing to do.');
    expect(finding.remediation).toBe(
      'Add `[Install]` with `WantedBy=multi-user.target` (or `default.target` for a user unit).',
    );
  });

  it('suggests timers.target for a timer', () => {
    const r = lint(`[Timer]
OnCalendar=daily
`);
    expect(find(r, 'missing-install').remediation).toBe('Add `[Install]` with `WantedBy=timers.target`.');
  });

  it('suggests sockets.target for a socket', () => {
    const r = lint(`[Socket]
ListenStream=8080
`);
    expect(find(r, 'missing-install').remediation).toBe(
      'Add `[Install]` with `WantedBy=sockets.target`.',
    );
  });

  it('stays silent when [Install] is present', () => {
    expect(has(lint(CLEAN_SERVICE), 'missing-install')).toBe(false);
  });
});

describe('rule: timer-no-trigger', () => {
  it('errors on a timer with no trigger at all', () => {
    const r = lint(`[Unit]
Description=Test

[Timer]
Persistent=true

[Install]
WantedBy=timers.target
`);
    const finding = find(r, 'timer-no-trigger');
    expect(finding.severity).toBe('error');
    expect(finding.title).toBe('[Timer] has no OnCalendar= and no On*Sec=, so it never fires.');
    expect(finding.detail).toBe(
      'systemd refuses to load a timer with no trigger: “Timer unit lacks value setting.” A timer ' +
        'needs at least one of OnCalendar=, OnActiveSec=, OnBootSec=, OnStartupSec=, OnUnitActiveSec= ' +
        'or OnUnitInactiveSec=.',
    );
  });

  for (const trigger of [
    'OnCalendar=daily',
    'OnBootSec=15min',
    'OnActiveSec=1h',
    'OnStartupSec=30s',
    'OnUnitActiveSec=1d',
    'OnUnitInactiveSec=1d',
  ]) {
    it(`accepts a timer whose trigger is ${trigger}`, () => {
      const r = lint(`[Timer]\n${trigger}\n\n[Install]\nWantedBy=timers.target\n`);
      expect(has(r, 'timer-no-trigger')).toBe(false);
    });
  }
});

describe('rule: oncalendar-invalid', () => {
  it('errors on */15 and carries the calendar validator’s own diagnostic', () => {
    const r = lint(`[Timer]
OnCalendar=*/15
`);
    const finding = find(r, 'oncalendar-invalid');
    expect(finding.severity).toBe('error');
    expect(finding.title).toBe('OnCalendar=*/15 is not a valid calendar expression.');
    expect(finding.detail).toBe(
      'A systemd calendar repeat needs an explicit start value before the “/”: write “00/15”, not ' +
        '“*/15”. systemd refuses to load a timer whose OnCalendar= it cannot parse, so this timer never fires.',
    );
    expect(finding.remediation).toBe(
      'Check the expression with `systemd-analyze calendar \'…\'` on a machine that has systemd.',
    );
  });

  it('accepts every OnCalendar= form the reference table shows', () => {
    for (const expr of ['daily', 'weekly', '*-*-* 03:00:00', 'Mon..Fri *-*-* 09:00:00', '*-*-* *:00/15:00']) {
      const r = lint(`[Timer]\nOnCalendar=${expr}\n`);
      expect(has(r, 'oncalendar-invalid'), `${expr} should be accepted`).toBe(false);
    }
  });

  it('reports the timezone caveat as a note, not an error', () => {
    const r = lint(`[Timer]
OnCalendar=*-*-* 06:00:00 Asia/Kolkata
`);
    expect(has(r, 'oncalendar-invalid')).toBe(false);
    expect(severityOf(r, 'oncalendar-note')).toBe('info');
    expect(find(r, 'oncalendar-note').detail).toContain('systemd 242 or newer');
  });

  it('reports a shorthand’s expansion as a note', () => {
    const r = lint(`[Timer]
OnCalendar=weekly
`);
    expect(find(r, 'oncalendar-note').detail).toContain('Mon *-*-* 00:00:00');
  });

  it('checks every OnCalendar= line, because they accumulate', () => {
    const r = lint(`[Timer]
OnCalendar=daily
OnCalendar=*/15
`);
    expect(has(r, 'oncalendar-invalid')).toBe(true);
    expect(find(r, 'oncalendar-invalid').line).toBe(3);
  });
});

describe('rule: oncalendar-looks-like-cron', () => {
  it('recognises a five-field crontab schedule and points at the converter', () => {
    const r = lint(`[Timer]
OnCalendar=0 3 * * *
`);
    const finding = find(r, 'oncalendar-looks-like-cron');
    expect(finding.severity).toBe('error');
    expect(finding.title).toBe(
      'OnCalendar=0 3 * * * is a crontab line, not a systemd calendar expression.',
    );
    expect(finding.detail).toBe(
      'A crontab schedule is five space-separated fields (minute hour day-of-month month ' +
        'day-of-week). OnCalendar= uses systemd’s own syntax — “DOW YYYY-MM-DD HH:MM:SS” — so systemd ' +
        'cannot parse this and the timer never fires.',
    );
    expect(finding.remediation).toBe(
      'Convert the line with the Cron to systemd Converter at /cron-to-systemd/ instead of hand-writing it.',
    );
  });

  it('takes precedence over the generic invalid-calendar finding', () => {
    const r = lint(`[Timer]
OnCalendar=*/15 * * * *
`);
    expect(has(r, 'oncalendar-looks-like-cron')).toBe(true);
    expect(has(r, 'oncalendar-invalid')).toBe(false);
  });

  it('does not mistake a valid three-part calendar expression for cron', () => {
    const r = lint(`[Timer]
OnCalendar=Mon..Fri *-*-* 09:00:00
`);
    expect(has(r, 'oncalendar-looks-like-cron')).toBe(false);
  });
});

describe('rule: timer-unit-note', () => {
  it('explains the implicit Unit= for a timer', () => {
    const r = lint(`[Timer]
OnCalendar=daily
`);
    const finding = find(r, 'timer-unit-note');
    expect(finding.severity).toBe('info');
    expect(finding.title).toBe(
      'This timer has no Unit=, so it triggers the service with the same name.',
    );
  });

  it('stays silent when Unit= is explicit', () => {
    const r = lint(`[Timer]
OnCalendar=daily
Unit=backup.service
`);
    expect(has(r, 'timer-unit-note')).toBe(false);
  });
});

describe('rule: persistent-no-oncalendar', () => {
  it('warns that Persistent= does nothing on a monotonic timer', () => {
    const r = lint(`[Timer]
OnBootSec=10min
Persistent=true
`);
    const finding = find(r, 'persistent-no-oncalendar');
    expect(finding.severity).toBe('warning');
    expect(finding.title).toBe('Persistent=true has no effect without OnCalendar=.');
  });

  it('stays silent with OnCalendar=', () => {
    const r = lint(`[Timer]
OnCalendar=daily
Persistent=true
`);
    expect(has(r, 'persistent-no-oncalendar')).toBe(false);
  });

  it('stays silent when Persistent= is false', () => {
    const r = lint(`[Timer]
OnBootSec=10min
Persistent=false
`);
    expect(has(r, 'persistent-no-oncalendar')).toBe(false);
  });
});

describe('rule: wantedby-scope-mismatch', () => {
  const userUnit = `[Service]
Type=simple
ExecStart=%h/.local/bin/tool

[Install]
WantedBy=multi-user.target
`;

  it('warns about a system target in a user unit', () => {
    const r = lint(userUnit, { scope: 'user' });
    const finding = find(r, 'wantedby-scope-mismatch');
    expect(finding.severity).toBe('warning');
    expect(finding.title).toBe(
      'WantedBy=multi-user.target is a system target, but this is a user unit.',
    );
    expect(finding.remediation).toBe(
      'Use `WantedBy=default.target` for a user unit (or `timers.target`, which does exist in the user manager).',
    );
  });

  it('says nothing about the same file in system scope', () => {
    expect(has(lint(userUnit, { scope: 'system' }), 'wantedby-scope-mismatch')).toBe(false);
  });

  it('accepts default.target and timers.target in user scope', () => {
    for (const target of ['default.target', 'timers.target', 'sockets.target']) {
      const r = lint(`[Service]\nExecStart=/usr/bin/true\n\n[Install]\nWantedBy=${target}\n`, {
        scope: 'user',
      });
      expect(has(r, 'wantedby-scope-mismatch'), target).toBe(false);
    }
  });
});

describe('rule: dynamicuser-pitfall', () => {
  it('warns when DynamicUser=yes has nowhere writable', () => {
    const r = lint(`[Service]
Type=simple
DynamicUser=yes
ExecStart=/usr/bin/tool
`);
    const finding = find(r, 'dynamicuser-pitfall');
    expect(finding.severity).toBe('warning');
    expect(finding.title).toBe('DynamicUser=yes with no StateDirectory=.');
    expect(finding.remediation).toBe(
      'Add `StateDirectory=` (systemd creates /var/lib/<name> and fixes its owner on every start).',
    );
  });

  for (const dir of ['StateDirectory=tool', 'RuntimeDirectory=tool', 'CacheDirectory=tool', 'LogsDirectory=tool']) {
    it(`stays silent when ${dir.split('=')[0]} is set`, () => {
      const r = lint(`[Service]\nDynamicUser=yes\nExecStart=/usr/bin/tool\n${dir}\n`);
      expect(has(r, 'dynamicuser-pitfall')).toBe(false);
    });
  }

  it('stays silent when DynamicUser is off', () => {
    const r = lint(`[Service]\nDynamicUser=no\nExecStart=/usr/bin/tool\n`);
    expect(has(r, 'dynamicuser-pitfall')).toBe(false);
  });
});

describe('rule: exec-not-absolute', () => {
  it('warns and quotes the command', () => {
    const r = lint(`[Service]
Type=simple
ExecStart=backup.sh
`);
    const finding = find(r, 'exec-not-absolute');
    expect(finding.severity).toBe('warning');
    expect(finding.title).toBe('ExecStart=backup.sh does not start with “/”.');
    expect(finding.detail).toBe(
      'Exec* lines are not run through a shell, so the command is not looked up in $PATH and not ' +
        'resolved against WorkingDirectory=.',
    );
  });

  it('checks every Exec* directive, not just ExecStart', () => {
    const r = lint(`[Service]
Type=oneshot
ExecStart=/usr/bin/true
ExecStopPost=cleanup.sh
`);
    expect(find(r, 'exec-not-absolute').title).toBe('ExecStopPost=cleanup.sh does not start with “/”.');
  });

  it('accepts an absolute path', () => {
    expect(has(lint(CLEAN_SERVICE), 'exec-not-absolute')).toBe(false);
  });
});

describe('rule: exec-shell-syntax', () => {
  for (const command of [
    '/usr/bin/tool | /usr/bin/other',
    '/usr/bin/tool > /var/log/out.log',
    '/usr/bin/tool && /usr/bin/other',
    '/usr/bin/tool; /usr/bin/other',
    '/usr/bin/tool $(date +%%s)',
  ]) {
    it(`warns about shell syntax in “${command}”`, () => {
      const r = lint(`[Service]\nType=oneshot\nExecStart=${command}\n`);
      const finding = find(r, 'exec-shell-syntax');
      expect(finding.severity).toBe('warning');
      expect(finding.title).toBe('ExecStart= uses shell syntax that systemd will not interpret.');
      expect(finding.remediation).toBe("Wrap it: `ExecStart=/bin/sh -lc '…'`.");
    });
  }

  it('stays silent when the command IS a shell', () => {
    for (const command of [
      "/bin/sh -c '/usr/bin/a | /usr/bin/b'",
      "/bin/bash -lc 'a && b'",
      '/usr/bin/env sh -c "a > b"',
    ]) {
      const r = lint(`[Service]\nType=oneshot\nExecStart=${command}\n`);
      expect(has(r, 'exec-shell-syntax'), command).toBe(false);
    }
  });

  it('does not flag a metacharacter inside quotes', () => {
    const r = lint(`[Service]
Type=forking
PIDFile=/run/nginx.pid
ExecStart=/usr/sbin/nginx -g 'daemon on; master_process on;'
`);
    expect(has(r, 'exec-shell-syntax')).toBe(false);
  });

  it('does not flag $VAR, which systemd really does expand', () => {
    const r = lint(`[Service]
Type=simple
Environment=PORT=8080
ExecStart=/usr/bin/tool --port \${PORT}
ExecReload=/bin/kill -HUP $MAINPID
`);
    expect(has(r, 'exec-shell-syntax')).toBe(false);
  });
});

describe('rule: bad-enum-or-bool', () => {
  it('rejects a wrong-case enum, because systemd compares them case-sensitively', () => {
    const r = lint(`[Service]
Type=Simple
ExecStart=/usr/bin/true
`);
    const finding = find(r, 'bad-enum-or-bool');
    expect(finding.severity).toBe('error');
    expect(finding.title).toBe('Type=Simple is not a valid Type= value.');
    expect(finding.detail).toBe(
      'systemd compares these values case-sensitively and would log “Failed to parse service type, ' +
        'ignoring: Simple”, leaving Type= at its default. Valid values: simple, exec, forking, ' +
        'oneshot, dbus, notify, notify-reload, idle.',
    );
    expect(finding.remediation).toBe('Write `Type=simple`.');
  });

  it('rejects an invalid Restart= value', () => {
    const r = lint(`[Service]
Type=simple
ExecStart=/usr/bin/true
Restart=sometimes
`);
    expect(find(r, 'bad-enum-or-bool').title).toBe('Restart=sometimes is not a valid Restart= value.');
  });

  // NoNewPrivileges= is strictly boolean. PrivateTmp= deliberately is NOT
  // validated as one: systemd 257 added `PrivateTmp=disconnected`, and a
  // validator that called a legal value an error would be the cry-wolf failure
  // this tool exists to avoid. `directives.ts` records that choice.
  it('rejects a value that is not a boolean', () => {
    const r = lint(`[Service]
Type=simple
ExecStart=/usr/bin/true
NoNewPrivileges=yess
`);
    const finding = find(r, 'bad-enum-or-bool');
    expect(finding.title).toBe('NoNewPrivileges=yess is not a boolean systemd accepts.');
    expect(finding.detail).toBe(
      'systemd accepts 1, yes, y, true, t, on and their negatives 0, no, n, false, f, off — ' +
        'case-insensitively. Anything else is logged as “Failed to parse boolean value” and the ' +
        'directive keeps its default.',
    );
    expect(finding.remediation).toBe('Write `NoNewPrivileges=yes` or `NoNewPrivileges=no`.');
  });

  it('does not treat PrivateTmp= as a plain boolean', () => {
    // `disconnected` is legal on systemd 257+; flagging it would be a false error.
    expect(has(lint(`[Service]\nExecStart=/usr/bin/true\nPrivateTmp=disconnected\n`), 'bad-enum-or-bool')).toBe(
      false,
    );
  });

  // The asymmetry, pinned deliberately: booleans are case-INsensitive in systemd,
  // enums are case-SENSITIVE. A validator that got this backwards would either
  // cry wolf on `Persistent=True` or wave `Type=Simple` through.
  it('accepts a capitalised boolean', () => {
    for (const value of ['True', 'YES', 'On', 'Off', 'FALSE', '1', '0', 'y', 'n', 't', 'f']) {
      const r = lint(`[Timer]\nOnCalendar=daily\nPersistent=${value}\n`);
      expect(has(r, 'bad-enum-or-bool'), `Persistent=${value}`).toBe(false);
    }
  });

  it('accepts every documented Type= value', () => {
    for (const value of ['simple', 'exec', 'forking', 'oneshot', 'dbus', 'notify', 'notify-reload', 'idle']) {
      const unit =
        value === 'forking'
          ? `[Service]\nType=forking\nPIDFile=/run/x.pid\nExecStart=/usr/bin/true\n`
          : value === 'dbus'
            ? `[Service]\nType=dbus\nBusName=org.example.X\nExecStart=/usr/bin/true\n`
            : `[Service]\nType=${value}\nExecStart=/usr/bin/true\n`;
      expect(has(lint(unit), 'bad-enum-or-bool'), value).toBe(false);
    }
  });
});

describe('rule: deprecated-directive', () => {
  it('notes a deprecated directive without calling it an error', () => {
    const r = lint(`[Service]
Type=simple
ExecStart=/usr/bin/true
PermissionsStartOnly=true
`);
    const finding = find(r, 'deprecated-directive');
    expect(finding.severity).toBe('info');
    expect(finding.title).toBe('PermissionsStartOnly= is deprecated.');
    expect(finding.detail).toContain('“+” prefix');
  });

  it('notes the cgroup v1 resource names', () => {
    const r = lint(`[Service]
Type=simple
ExecStart=/usr/bin/true
MemoryLimit=512M
`);
    expect(find(r, 'deprecated-directive').detail).toContain('MemoryMax=');
  });
});

describe('rule: socket-no-listen', () => {
  it('errors on a socket with nothing to listen on', () => {
    const r = lint(`[Socket]
Accept=yes

[Install]
WantedBy=sockets.target
`);
    const finding = find(r, 'socket-no-listen');
    expect(finding.severity).toBe('error');
    expect(finding.title).toBe('[Socket] has no Listen* directive, so there is nothing to listen on.');
    expect(finding.detail).toContain('“Socket unit lacks Listen setting.”');
  });

  for (const listen of [
    'ListenStream=8080',
    'ListenDatagram=514',
    'ListenSequentialPacket=/run/x.sock',
    'ListenFIFO=/run/x.fifo',
    'ListenSpecial=/dev/input/event0',
    'ListenNetlink=kobject-uevent 1',
    'ListenMessageQueue=/x',
    'ListenUSBFunction=/sys/kernel/config/usb_gadget/x',
  ]) {
    it(`accepts ${listen.split('=')[0]}`, () => {
      const r = lint(`[Socket]\n${listen}\n\n[Install]\nWantedBy=sockets.target\n`);
      expect(has(r, 'socket-no-listen')).toBe(false);
    });
  }
});

/* ════════════════════════════════════════════════════════════════════════
 * UNIT KIND, SUMMARY, SORTING, CAPS
 * ════════════════════════════════════════════════════════════════════════ */

describe('lint — unit kind detection', () => {
  it('detects each supported kind from its section', () => {
    expect(lint('[Service]\nExecStart=/usr/bin/true\n').kind).toBe('service');
    expect(lint('[Timer]\nOnCalendar=daily\n').kind).toBe('timer');
    expect(lint('[Socket]\nListenStream=8080\n').kind).toBe('socket');
    expect(lint('[Mount]\nWhat=/dev/sdb1\n').kind).toBe('unsupported');
    expect(lint('[Unit]\nDescription=Only metadata\n').kind).toBe('unknown');
  });

  it('prefers [Timer] when a file carries both a timer and a service section', () => {
    // Not legal in systemd (one unit per file), but people paste both together.
    expect(lint('[Timer]\nOnCalendar=daily\n\n[Service]\nExecStart=/usr/bin/true\n').kind).toBe('timer');
  });
});

describe('summaryLine', () => {
  it('reads as a sentence when there is nothing to report', () => {
    expect(summaryLine(lint(CLEAN_SERVICE))).toBe(
      'No findings across 9 lines — nothing here matched a rule.',
    );
  });

  it('counts each severity, pluralised', () => {
    const r = lint(`[Unit]
Description=Test
User=root

[Service]
Type=simple
ExecStart=relative
`);
    expect(summaryLine(r)).toBe('1 error, 2 warnings across 7 lines');
  });

  it('says “1 info”, never “1 infos”', () => {
    // An explicit expression rather than `daily`, so the shorthand-expansion note
    // does not make this two infos.
    const r = lint(`[Timer]
OnCalendar=*-*-* 03:00:00

[Install]
WantedBy=timers.target
`);
    expect(r.summary).toEqual({ errors: 0, warnings: 0, infos: 1 });
    expect(summaryLine(r)).toBe('1 info across 5 lines');
  });
});

describe('lint — finding order', () => {
  it('sorts errors first, then by line', () => {
    const r = lint(`[Unit]
Description=Test
User=root
WantedBy=multi-user.target

[Service]
Type=simple
ExecStart=relative
`);
    const severities = r.findings.map((f) => f.severity);
    const firstWarning = severities.indexOf('warning');
    expect(severities.slice(0, firstWarning).every((s) => s === 'error')).toBe(true);
    const errorLines = r.findings.filter((f) => f.severity === 'error').map((f) => f.line);
    expect(errorLines).toEqual([...errorLines].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });
});

describe('lint — caps are stated, never silent', () => {
  it('caps one rule and reports the real total', () => {
    const many = ['[Service]', 'Type=oneshot', 'ExecStart=/usr/bin/true'];
    for (let i = 0; i < MAX_FINDINGS_PER_RULE + 10; i += 1) many.push(`Frobnicate${i}=1`);
    const r = lint(many.join('\n'));
    expect(r.ok).toBe(true);
    const capped = r.truncatedRules.find((t) => t.ruleId === 'unknown-directive');
    expect(capped).toBeDefined();
    expect(capped!.shown).toBe(MAX_FINDINGS_PER_RULE);
    expect(capped!.total).toBe(MAX_FINDINGS_PER_RULE + 10);
    expect(r.findings.filter((f) => f.id === 'unknown-directive')).toHaveLength(
      MAX_FINDINGS_PER_RULE,
    );
  });

  // The per-rule cap is the BINDING limit and the total cap is a backstop behind
  // it: at 20 per rule, the 200-finding ceiling only engages once ten separate
  // rules are simultaneously capped. So this asserts what actually protects the
  // tab — a pathological file stays bounded, and every cap reports its real
  // count instead of quietly swallowing the difference.
  it('keeps a pathological file bounded and reports the real counts', () => {
    const lines = ['[Service]', 'Type=oneshot', 'ExecStart=/usr/bin/true'];
    const pathological = MAX_FINDINGS_TOTAL + 50;
    for (let i = 0; i < pathological; i += 1) lines.push(`Frobnicate${i}=1 # note`);
    const r = lint(lines.join('\n'));

    expect(r.ok).toBe(true);
    expect(r.findings.length).toBeLessThanOrEqual(MAX_FINDINGS_TOTAL);
    for (const ruleId of ['unknown-directive', 'inline-comment']) {
      const capped = r.truncatedRules.find((t) => t.ruleId === ruleId);
      expect(capped, `${ruleId} should be capped`).toBeDefined();
      expect(capped!.shown).toBe(MAX_FINDINGS_PER_RULE);
      expect(capped!.total).toBe(pathological);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * NEVER THROWS
 * ════════════════════════════════════════════════════════════════════════ */

describe('lint — never throws', () => {
  const hostile: string[] = [
    '',
    ' ',
    '\n',
    '\r\n\r\n',
    '\0',
    '[',
    ']',
    '[]',
    '[[[[',
    '=',
    '=value',
    'key=',
    '[Unit]\n=\n',
    '[Unit]\n=value\n',
    '\\',
    '\\\n',
    '[Service]\nExecStart=\\\n',
    '[Service]\nExecStart=a\\',
    '%',
    '%%',
    '%'.repeat(1000),
    '[Service]\nExecStart=%\n',
    '[Timer]\nOnCalendar=\n',
    '[Timer]\nOnCalendar=' + '*'.repeat(2000) + '\n',
    ' [Unit]\nDescription=x\n',
    '﻿[Unit]\nDescription=x\n',
    'ExecStart=' + 'x'.repeat(50_000),
    '[Service]\n' + 'ExecStart=/usr/bin/true\n'.repeat(5000),
    '[Service]\n' + 'a\\\n'.repeat(5000) + 'b\n',
    '\ud800',
    '🚀=🚀',
    'A'.repeat(MAX_INPUT_CHARS + 5),
    '[Unit]\r\nDescription=CRLF\r\n\r\n[Service]\r\nExecStart=/usr/bin/true\r\n',
  ];

  for (const [i, input] of hostile.entries()) {
    it(`survives hostile input #${i}`, () => {
      expect(() => lint(input)).not.toThrow();
      const r = lint(input);
      expect(typeof r.ok).toBe('boolean');
      expect(Array.isArray(r.findings)).toBe(true);
      if (!r.ok) {
        expect(typeof r.error).toBe('string');
        expect(r.findings).toEqual([]);
      }
      for (const f of r.findings) {
        expect(typeof f.id).toBe('string');
        expect(typeof f.title).toBe('string');
        expect(typeof f.detail).toBe('string');
        expect(['error', 'warning', 'info']).toContain(f.severity);
      }
      expect(() => summaryLine(r)).not.toThrow();
    });
  }

  it('never throws on non-string input', () => {
    for (const bad of [undefined, null, 42, {}, [], () => {}, Symbol('x')]) {
      expect(() => lint(bad as unknown as string)).not.toThrow();
      expect(lint(bad as unknown as string).ok).toBe(false);
    }
  });

  it('handles CRLF line endings without shifting line numbers', () => {
    const r = lint('[Unit]\r\nDescription=Test\r\nUser=root\r\n');
    expect(find(r, 'wrong-section').line).toBe(3);
  });

  it('is linear enough for a large file', () => {
    // ~168 KB: just under MAX_INPUT_CHARS, so this exercises the real scan rather
    // than the size refusal.
    const big = '[Service]\nType=oneshot\n' + 'ExecStart=/usr/bin/true\n'.repeat(7_000);
    const started = Date.now();
    const r = lint(big);
    expect(r.ok).toBe(true);
    expect(Date.now() - started).toBeLessThan(4000);
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * THE NUMBERS THE TOOL PAGE PRINTS
 *
 * A shipped page in an earlier wave carried two mutually inconsistent wrong
 * figures across all five locales. Every count the five locale pages state is
 * pinned here, so prose and code cannot drift apart silently.
 * ════════════════════════════════════════════════════════════════════════ */

describe('the counts the page quotes', () => {
  it('has 35 checks, and CHECK_IDS matches what rules.ts can actually emit', () => {
    expect(CHECK_IDS).toHaveLength(35);
    expect(new Set(CHECK_IDS).size).toBe(35);

    // Read the source and extract every finding id literal, so a new rule that
    // forgets to register itself here fails the suite instead of quietly making
    // the page's "35 checks" wrong.
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, 'rules.ts'), 'utf-8');
    const emitted = new Set(
      [...source.matchAll(/\bid: '([a-z][a-z0-9-]*)'/g)].map((match) => match[1]),
    );
    // The seven rule-GROUP ids (`{ id: 'sections', run: … }`) are not findings.
    for (const group of ['sections', 'stray-lines', 'directives', 'service', 'timer', 'socket', 'install']) {
      emitted.delete(group);
    }
    expect([...emitted].sort()).toEqual([...CHECK_IDS].sort());
  });

  it('knows 439 directive names across 5 checked and 6 unchecked sections', () => {
    expect(ALL_DIRECTIVE_NAMES).toHaveLength(439);
    expect(CHECKED_SECTIONS).toEqual(['Unit', 'Install', 'Service', 'Timer', 'Socket']);
    expect(UNCHECKED_SECTIONS).toHaveLength(6);
    expect(Object.keys(CALENDAR_SHORTHANDS)).toHaveLength(9);
  });

  it('carries the caps the page states', () => {
    expect(MAX_INPUT_CHARS).toBe(200_000);
    expect(MAX_FINDINGS_PER_RULE).toBe(20);
    expect(MAX_FINDINGS_TOTAL).toBe(200);
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * EXAMPLES — the five chips, pinned
 * ════════════════════════════════════════════════════════════════════════ */

describe('examples', () => {
  it('ships five chips, each with a label and a unit', () => {
    expect(examples).toHaveLength(5);
    for (const ex of examples) {
      expect(ex.label.length).toBeGreaterThan(0);
      expect(ex.unit.trim().length).toBeGreaterThan(0);
      expect(lint(ex.unit, { scope: ex.scope ?? 'system' }).ok).toBe(true);
    }
  });

  it('example 1 is the planted-issues service: exactly 2 errors and 1 warning', () => {
    const r = lint(examples[0].unit);
    expect(summaryLine(r)).toBe('2 errors, 1 warning across 8 lines');
    expect(ids(r).sort()).toEqual(['missing-install', 'typo-directive', 'wrong-section']);
    expect(find(r, 'typo-directive').title).toContain('did you mean ExecStart=?');
    expect(find(r, 'wrong-section').title).toBe('WantedBy= belongs in [Install], not [Unit].');
  });

  // The real-world fixtures from the plan's acceptance list: nginx.service,
  // fstrim.timer and a podman-style socket must not produce a single ERROR.
  it('example 2 is a real forking service with zero findings', () => {
    const r = lint(examples[1].unit);
    expect(r.findings).toEqual([]);
    expect(r.kind).toBe('service');
  });

  it('example 3 is an fstrim-style timer with no errors', () => {
    const r = lint(examples[2].unit);
    expect(r.summary.errors).toBe(0);
    expect(r.kind).toBe('timer');
    expect(has(r, 'timer-unit-note')).toBe(true);
  });

  it('example 4 is a user unit whose point only appears in user scope', () => {
    expect(examples[3].scope).toBe('user');
    const asUser = lint(examples[3].unit, { scope: 'user' });
    expect(has(asUser, 'wantedby-scope-mismatch')).toBe(true);
    expect(asUser.summary.errors).toBe(0);
    expect(has(lint(examples[3].unit, { scope: 'system' }), 'wantedby-scope-mismatch')).toBe(false);
  });

  it('example 5 is a socket unit with no errors', () => {
    const r = lint(examples[4].unit);
    expect(r.summary.errors).toBe(0);
    expect(r.kind).toBe('socket');
  });
});
