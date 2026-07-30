/**
 * Dockerfile Linter — engine tests.
 *
 * Written BEFORE the parser and the rules, in the order the plan requires:
 * parser fixtures first (a rule built on a wrong parse is worse than no rule),
 * then one firing and one NON-firing case for each of DF001–DF017, then the
 * kitchen-sink count assertions, then the never-throws hostile inputs.
 *
 * Diagnostic wordings are pinned byte-for-byte on purpose. They are the product:
 * "Octet 256 is greater than 255." is useful, "invalid" is not, and a reworded
 * message silently breaks the E2E fixture table and the page copy that quotes it.
 */
import { describe, expect, it } from 'vitest';
import { RULES, lint, summaryLine } from './engine';
import { parseDockerfile } from './parse';
import { examples } from './examples';
import { RULE_IDS, type Finding, type LintResult, type RuleId } from './types';

/* ── helpers ─────────────────────────────────────────────────────────────── */

function ids(result: LintResult): RuleId[] {
  return result.findings.map((f) => f.id);
}

function of(result: LintResult, id: RuleId): Finding[] {
  return result.findings.filter((f) => f.id === id);
}

function one(result: LintResult, id: RuleId): Finding {
  const hits = of(result, id);
  expect(hits, `expected exactly one ${id} finding, got ${hits.length}`).toHaveLength(1);
  return hits[0];
}

/** A Dockerfile that triggers nothing at all — the base for non-firing fixtures. */
const CLEAN = `FROM node:22-bookworm-slim
USER node
CMD ["node", "server.js"]
`;

/* ── 0. The clean baseline ───────────────────────────────────────────────── */

describe('baseline', () => {
  it('a small correct Dockerfile produces zero findings', () => {
    const r = lint(CLEAN);
    expect(r.ok).toBe(true);
    expect(r.findings).toEqual([]);
    expect(r.summary).toEqual({ errors: 0, warnings: 0, infos: 0 });
    expect(r.stats).toEqual({ lines: 3, instructions: 3, stages: 1 });
    expect(summaryLine(r)).toBe('No findings across 3 lines — nice Dockerfile.');
  });
});

/* ── 1. Parser fixtures ──────────────────────────────────────────────────── */

describe('parser', () => {
  it('1. the escape directive flips the continuation character', () => {
    const parsed = parseDockerfile(
      ['# escape=`', 'FROM alpine:3.20', 'RUN echo one `', '    && echo two'].join('\n'),
    );
    expect(parsed.directives.escape).toBe('`');
    const run = parsed.instructions.find((i) => i.keyword === 'RUN');
    expect(run?.argText).toBe('echo one     && echo two');
    expect(run?.parts.map((p) => p.line)).toEqual([3, 4]);

    // With a backtick escape in force, a trailing backslash is literal text.
    const literal = parseDockerfile(['# escape=`', 'FROM alpine:3.20', 'RUN echo one\\'].join('\n'));
    const literalRun = literal.instructions.find((i) => i.keyword === 'RUN');
    expect(literalRun?.parts).toHaveLength(1);
    expect(literalRun?.argText).toBe('echo one\\');

    // And by default a trailing backslash DOES fold the next line in.
    const folded = parseDockerfile(['FROM alpine:3.20', 'RUN echo one \\', '    && echo two'].join('\n'));
    expect(folded.instructions.find((i) => i.keyword === 'RUN')?.parts).toHaveLength(2);

    // An escaped backslash at end of line is a literal, not a continuation.
    const escaped = parseDockerfile(['FROM alpine:3.20', 'RUN echo a\\\\', 'USER app'].join('\n'));
    expect(escaped.instructions.map((i) => i.keyword)).toEqual(['FROM', 'RUN', 'USER']);
  });

  it('2. a whole-line comment inside a continued RUN is dropped, and the fold continues', () => {
    const parsed = parseDockerfile(
      [
        'FROM alpine:3.20',
        'RUN apk add --no-cache curl \\',
        '  # this comment must not end the instruction',
        '  && rm -rf /tmp/*',
      ].join('\n'),
    );
    const run = parsed.instructions.find((i) => i.keyword === 'RUN');
    expect(run?.argText).toBe('apk add --no-cache curl   && rm -rf /tmp/*');
    // Line 3 contributed nothing, so it is not one of the instruction's parts.
    expect(run?.parts.map((p) => p.line)).toEqual([2, 4]);
    expect(run?.endLine).toBe(4);
  });

  it('3. a heredoc body containing FROM ubuntu creates no stage', () => {
    const parsed = parseDockerfile(
      ['FROM alpine:3.20', 'RUN <<EOF', 'echo "FROM ubuntu"', 'FROM ubuntu', 'EOF'].join('\n'),
    );
    expect(parsed.stages).toHaveLength(1);
    expect(parsed.instructions.map((i) => i.keyword)).toEqual(['FROM', 'RUN']);
    const run = parsed.instructions[1];
    expect(run.heredocs).toHaveLength(1);
    expect(run.heredocs[0].delimiter).toBe('EOF');
    expect(run.heredocs[0].terminated).toBe(true);
    expect(run.endLine).toBe(5);
  });

  it('4. <<-DONE takes a custom delimiter and strips leading tabs', () => {
    const parsed = parseDockerfile(
      ['FROM alpine:3.20', 'RUN <<-DONE', '\techo one', '\techo two', 'DONE'].join('\n'),
    );
    const heredoc = parsed.instructions[1].heredocs[0];
    expect(heredoc.delimiter).toBe('DONE');
    expect(heredoc.stripTabs).toBe(true);
    expect(heredoc.body.text).toBe('echo one\necho two');
    expect(heredoc.body.lineAt[0]).toBe(3);
    expect(heredoc.body.lineAt[heredoc.body.text.indexOf('two')]).toBe(4);
  });

  it("5. CMD ['nginx'] parses as an instruction and is flagged at its own line", () => {
    const src = ['FROM nginx:1.27-alpine', 'USER nginx', "CMD ['nginx', '-g', 'daemon off;']"].join(
      '\n',
    );
    const parsed = parseDockerfile(src);
    const cmd = parsed.instructions[2];
    expect(cmd.keyword).toBe('CMD');
    expect(cmd.brokenJson).toBe(true);
    expect(cmd.execArgv).toBeUndefined();
    expect(one(lint(src), 'DF014').line).toBe(3);
  });

  it('6. --from=0 is clean, --from=1 is an error, --from=nginx:alpine is silent', () => {
    const base = (from: string) =>
      [
        'FROM node:22-bookworm-slim AS build',
        'RUN npm ci',
        'FROM node:22-bookworm-slim',
        `COPY --from=${from} /app /app`,
        'USER node',
        'CMD ["node", "/app/server.js"]',
      ].join('\n');
    expect(ids(lint(base('0')))).not.toContain('DF003');
    expect(ids(lint(base('nginx:alpine')))).not.toContain('DF003');
    expect(one(lint(base('1')), 'DF003').line).toBe(4);
  });

  it('7. a pre-FROM ARG expands in the FROM ref; an unresolvable $VAR stays silent', () => {
    const pinned = ['ARG V=18', 'FROM node:${V}-bookworm-slim', 'USER node'].join('\n');
    const parsedPinned = parseDockerfile(pinned);
    expect(parsedPinned.preFromArgs.get('V')).toBe('18');
    expect(parsedPinned.stages[0].resolvedImage).toBe('node:18-bookworm-slim');
    expect(ids(lint(pinned))).not.toContain('DF002');

    const unresolved = ['FROM node:$UNSET', 'USER node'].join('\n');
    expect(parseDockerfile(unresolved).stages[0].unresolved).toBe(true);
    expect(ids(lint(unresolved))).not.toContain('DF002');
  });

  it('8. CRLF input yields identical findings on identical lines', () => {
    const lf = 'FROM ubuntu\nWORKDIR app\nUSER app\n';
    const crlf = lf.replace(/\n/g, '\r\n');
    const a = lint(lf);
    const b = lint(crlf);
    expect(b.findings).toEqual(a.findings);
    expect(one(b, 'DF006').line).toBe(2);
  });

  it('9. a trailing continuation at end of file does not hang or throw', () => {
    const parsed = parseDockerfile('FROM alpine:3.20\nRUN echo hi \\');
    expect(parsed.instructions).toHaveLength(2);
    expect(parsed.instructions[1].argText).toBe('echo hi ');
    expect(lint('FROM alpine:3.20\nRUN echo hi \\').ok).toBe(true);
  });

  it('10. an empty file is not linted', () => {
    for (const input of ['', '   ', '\n\n\t\n']) {
      const r = lint(input);
      expect(r.ok).toBe(false);
      expect(r.error).toBe('Paste a Dockerfile to lint.');
      expect(r.findings).toEqual([]);
    }
  });

  it('11. lowercase instructions parse, keeping the keyword as written', () => {
    const parsed = parseDockerfile('from alpine:3.20\nuser app\n');
    expect(parsed.instructions.map((i) => i.keyword)).toEqual(['FROM', 'USER']);
    expect(parsed.instructions[0].rawKeyword).toBe('from');
    expect(parsed.stages[0].resolvedImage).toBe('alpine:3.20');
  });

  it('12. ONBUILD wraps an instruction, and the finding lands on the ONBUILD line', () => {
    const src = ['FROM alpine:3.20', 'ONBUILD RUN apt-get update', 'USER app'].join('\n');
    const parsed = parseDockerfile(src);
    const run = parsed.instructions.find((i) => i.keyword === 'RUN');
    expect(run?.onbuild).toBe(true);
    expect(run?.line).toBe(2);
    expect(run?.argText).toBe('apt-get update');
    expect(one(lint(src), 'DF007').line).toBe(2);
  });

  it('13. a comment-only file is refused with its own diagnostic', () => {
    const r = lint('# just notes\n\n#   more notes\n');
    expect(r.ok).toBe(false);
    expect(r.error).toBe(
      'No instructions found — every line in this file is blank or a comment. A Dockerfile needs at least a FROM.',
    );
  });

  it('14. an unknown instruction is a fatal parse error with a did-you-mean', () => {
    const r = lint('FORM ubuntu:22.04\nRUN echo hi\n');
    expect(r.ok).toBe(false);
    expect(r.error).toBe(
      'Unknown instruction “FORM” on line 1 — did you mean FROM? Docker rejects the whole file with a parse error.',
    );
    expect(r.findings).toEqual([]);

    const noGuess = lint('FROM alpine:3.20\nQQQQQQ nope\n');
    expect(noGuess.ok).toBe(false);
    expect(noGuess.error).toBe(
      'Unknown instruction “QQQQQQ” on line 2. Docker rejects the whole file with a parse error.',
    );
  });

  it('15. flags are split off the argument text and keep their own line', () => {
    const parsed = parseDockerfile(
      ['FROM alpine:3.20', 'COPY --from=build --chown=1000:1000 \\', '  /out /srv'].join('\n'),
    );
    const copy = parsed.instructions[1];
    expect(copy.flags.map((f) => `${f.name}=${f.value}`)).toEqual([
      'from=build',
      'chown=1000:1000',
    ]);
    expect(copy.flags[0].line).toBe(2);
    expect(copy.argText.trim()).toBe('/out /srv');
  });

  it('16. a --platform flag on FROM does not become part of the image reference', () => {
    const parsed = parseDockerfile('FROM --platform=linux/amd64 alpine:3.20 AS base\n');
    expect(parsed.stages[0].resolvedImage).toBe('alpine:3.20');
    expect(parsed.stages[0].name).toBe('base');
    expect(parsed.stages[0].rawName).toBe('base');
  });

  it('17. an exec-form instruction exposes its argv', () => {
    const parsed = parseDockerfile('FROM alpine:3.20\nCMD ["sh", "-c", "echo hi"]\n');
    expect(parsed.instructions[1].execArgv).toEqual(['sh', '-c', 'echo hi']);
    expect(parsed.instructions[1].brokenJson).toBe(false);
  });

  it('18. a BOM and a syntax directive are consumed, not linted', () => {
    const parsed = parseDockerfile('﻿# syntax=docker/dockerfile:1\nFROM alpine:3.20\n');
    expect(parsed.directives.syntax).toBe('docker/dockerfile:1');
    expect(parsed.instructions.map((i) => i.keyword)).toEqual(['FROM']);
    expect(parsed.instructions[0].line).toBe(2);
  });
});

/* ── 2. One firing and one non-firing case per rule ──────────────────────── */

/** Every rule must fire on its own fixture and stay silent on the paired one. */
const CASES: Record<RuleId, { firing: string; silent: string }> = {
  DF001: {
    firing: 'RUN echo hi\nFROM alpine:3.20\nUSER app\n',
    silent: 'ARG V=3.20\nFROM alpine:${V}\nUSER app\n',
  },
  DF002: { firing: 'FROM ubuntu\nUSER app\n', silent: CLEAN },
  DF003: {
    firing: 'FROM alpine:3.20\nCOPY --from=nope /a /b\nUSER app\n',
    silent: 'FROM alpine:3.20 AS b\nFROM alpine:3.20\nCOPY --from=b /a /b\nUSER app\n',
  },
  DF004: {
    firing: 'FROM alpine:3.20\nADD ./entrypoint.sh /entrypoint.sh\nUSER app\n',
    silent: 'FROM alpine:3.20\nADD ./app.tar.gz /opt/app\nUSER app\n',
  },
  DF005: {
    firing: 'FROM alpine:3.20\nADD https://example.com/t.sh /t.sh\nUSER app\n',
    silent:
      'FROM alpine:3.20\nADD --checksum=sha256:abc123 https://example.com/t.tgz /t.tgz\nUSER app\n',
  },
  DF006: {
    firing: 'FROM alpine:3.20\nWORKDIR app\nUSER app\n',
    silent: 'FROM alpine:3.20\nWORKDIR /app\nUSER app\n',
  },
  DF007: {
    firing: 'FROM debian:bookworm-slim\nRUN apt-get update\nUSER app\n',
    silent:
      'FROM debian:bookworm-slim\nRUN apt-get update && apt-get install -y --no-install-recommends curl \\\n  && rm -rf /var/lib/apt/lists/*\nUSER app\n',
  },
  DF008: {
    firing: 'FROM debian:bookworm-slim\nRUN apt-get update && apt-get install -y curl\nUSER app\n',
    silent: 'FROM alpine:3.20\nRUN apk add --no-cache curl\nUSER app\n',
  },
  DF009: {
    firing: 'FROM alpine:3.20\nENV DB_PASSWORD=hunter2\nUSER app\n',
    silent: 'FROM alpine:3.20\nARG NPM_TOKEN\nENV NODE_ENV=production\nUSER app\n',
  },
  DF010: { firing: 'FROM alpine:3.20\nCMD ["sh"]\n', silent: CLEAN },
  DF011: {
    firing: 'FROM alpine:3.20\nRUN cd /opt/app && ./configure\nUSER app\n',
    silent: 'FROM alpine:3.20\nRUN make -C /opt/app\nUSER app\n',
  },
  DF012: {
    firing:
      'FROM alpine:3.20\nRUN curl -fsSL https://get.example.com/i.sh | sh\nUSER app\n',
    silent:
      'FROM alpine:3.20\nRUN curl -fsSL https://get.example.com/i.sh -o /tmp/i.sh \\\n  && sha256sum -c /tmp/i.sha256 \\\n  && sh /tmp/i.sh\nUSER app\n',
  },
  DF013: {
    firing: 'FROM alpine:3.20\nUSER app\nCMD ["sh", "-c", "one"]\nCMD ["sh", "-c", "two"]\n',
    silent: CLEAN,
  },
  DF014: {
    firing: "FROM alpine:3.20\nUSER app\nCMD ['sh']\n",
    silent: CLEAN,
  },
  DF015: {
    firing: 'FROM alpine:3.20\nRUN sudo chown -R app /srv\nUSER app\n',
    silent: 'FROM alpine:3.20\nRUN chown -R app /srv\nUSER app\n',
  },
  DF016: {
    firing: 'FROM alpine:3.20\nMAINTAINER ops@example.com\nUSER app\n',
    silent: 'FROM alpine:3.20\nLABEL org.opencontainers.image.authors="ops@example.com"\nUSER app\n',
  },
  DF017: {
    firing: 'FROM node:22-bookworm-slim\nWORKDIR /app\nCOPY . .\nRUN npm ci\nUSER node\n',
    silent:
      'FROM node:22-bookworm-slim\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nUSER node\n',
  },
};

describe('per-rule firing and non-firing', () => {
  for (const id of RULE_IDS) {
    it(`${id} fires on its own fixture and stays silent on the paired one`, () => {
      const firing = lint(CASES[id].firing);
      expect(firing.ok, `${id} firing fixture must lint`).toBe(true);
      expect(ids(firing), `${id} must fire`).toContain(id);

      const silent = lint(CASES[id].silent);
      expect(silent.ok, `${id} silent fixture must lint`).toBe(true);
      expect(ids(silent), `${id} must stay silent`).not.toContain(id);
    });
  }

  it('every rule id in RULE_IDS has a case pair, and no case names an unknown rule', () => {
    expect(Object.keys(CASES).sort()).toEqual([...RULE_IDS].sort());
  });

  it('the catalog is exactly seventeen rules, in id order', () => {
    expect(RULES.map((r) => r.id)).toEqual([...RULE_IDS]);
    expect(RULES).toHaveLength(17);
  });

  it('splits three / twelve / two by severity — the numbers the page prints', () => {
    const bySeverity: Record<string, RuleId[]> = { error: [], warning: [], info: [] };
    for (const id of RULE_IDS) {
      const finding = lint(CASES[id].firing).findings.find((f) => f.id === id);
      expect(finding, `${id} produced no finding`).toBeDefined();
      bySeverity[finding!.severity].push(id);
    }
    expect(bySeverity.error).toEqual(['DF001', 'DF003', 'DF014']);
    expect(bySeverity.warning).toHaveLength(12);
    expect(bySeverity.info).toEqual(['DF016', 'DF017']);
  });
});

describe('summaryLine', () => {
  it('reads as the plan specifies, both ways', () => {
    expect(summaryLine(lint(CLEAN))).toBe('No findings across 3 lines — nice Dockerfile.');
    const dirty = lint('FROM ubuntu\nWORKDIR app\nMAINTAINER a@b.test\n');
    expect(summaryLine(dirty)).toBe('3 warnings, 1 info across 3 lines');
    expect(summaryLine(lint("FROM alpine:3.20\nUSER app\nCMD ['sh']\n"))).toBe(
      '1 error across 3 lines',
    );
  });
});

/* ── 3. Exact wordings, severities and lines, rule by rule ───────────────── */

describe('DF001 — the first instruction must be FROM', () => {
  it('names the instruction that jumped the queue', () => {
    const f = one(lint('RUN echo hi\nFROM alpine:3.20\nUSER app\n'), 'DF001');
    expect(f.severity).toBe('error');
    expect(f.title).toBe('RUN appears before the first FROM.');
    expect(f.line).toBe(1);
  });

  it('reports a file with no FROM at all', () => {
    const f = one(lint('RUN echo hi\nCOPY . /app\n'), 'DF001');
    expect(f.title).toBe('No FROM instruction — nothing tells Docker what to build from.');
    expect(f.line).toBe(1);
    // One finding, not one per instruction: the file has a single problem.
    expect(of(lint('RUN echo hi\nCOPY . /app\n'), 'DF001')).toHaveLength(1);
  });
});

describe('DF002 — base image tag', () => {
  it('flags an untagged reference', () => {
    const f = one(lint('FROM ubuntu\nUSER app\n'), 'DF002');
    expect(f.severity).toBe('warning');
    expect(f.title).toBe('Base image “ubuntu” has no tag, so Docker resolves it to :latest.');
    expect(f.line).toBe(1);
  });

  it('flags an explicit :latest', () => {
    expect(one(lint('FROM ubuntu:latest\nUSER app\n'), 'DF002').title).toBe(
      'Base image “ubuntu:latest” is pinned to the moving :latest tag.',
    );
  });

  it('stays silent for scratch, a digest pin, a stage reference and a registry port', () => {
    const silent = [
      'FROM scratch\nCOPY app /app\nUSER app\n',
      'FROM ubuntu@sha256:aaaabbbbccccddddeeeeffff00001111222233334444555566667777888899990\nUSER app\n',
      'FROM alpine:3.20 AS base\nFROM base\nUSER app\n',
      'FROM registry.example.com:5000/team/app:1.4.2\nUSER app\n',
    ];
    for (const src of silent) expect(ids(lint(src))).not.toContain('DF002');
  });

  it('flags a registry-with-port reference that has no tag', () => {
    expect(one(lint('FROM registry.example.com:5000/team/app\nUSER app\n'), 'DF002').title).toBe(
      'Base image “registry.example.com:5000/team/app” has no tag, so Docker resolves it to :latest.',
    );
  });
});

describe('DF003 — COPY --from', () => {
  it('rejects a stage index that is not built yet', () => {
    const f = one(
      lint('FROM alpine:3.20\nFROM alpine:3.20\nCOPY --from=1 /a /b\nUSER app\n'),
      'DF003',
    );
    expect(f.severity).toBe('error');
    expect(f.title).toBe('COPY --from=1 points at stage 1, which is not built yet.');
    expect(f.line).toBe(3);
  });

  it('hints at image syntax for a bare identifier that matches no stage', () => {
    const f = one(lint('FROM alpine:3.20\nCOPY --from=busybox /a /b\nUSER app\n'), 'DF003');
    expect(f.title).toBe('COPY --from=busybox names no stage in this file.');
    expect(f.remediation).toContain('`busybox:latest`');
  });

  it('rejects a stage name defined later, and the copying stage itself', () => {
    expect(
      one(
        lint('FROM alpine:3.20\nCOPY --from=later /a /b\nFROM alpine:3.20 AS later\nUSER app\n'),
        'DF003',
      ).title,
    ).toBe('COPY --from=later points at stage “later”, which is defined later in the file.');
    expect(
      one(lint('FROM alpine:3.20 AS self\nCOPY --from=self /a /b\nUSER app\n'), 'DF003').title,
    ).toBe('COPY --from=self points at stage “self”, which is the stage doing the copying.');
  });

  it('matches stage names case-insensitively, the way Docker does', () => {
    expect(
      ids(lint('FROM alpine:3.20 AS Build\nFROM alpine:3.20\nCOPY --from=build /a /b\nUSER app\n')),
    ).not.toContain('DF003');
  });
});

describe('DF004 / DF005 — ADD', () => {
  it('asks for COPY on a plain local path', () => {
    const f = one(lint('FROM alpine:3.20\nADD ./entrypoint.sh /entrypoint.sh\nUSER app\n'), 'DF004');
    expect(f.severity).toBe('warning');
    expect(f.title).toBe('ADD copies a local path — COPY is the predictable choice.');
    expect(f.line).toBe(2);
  });

  it('names the URL it cannot verify', () => {
    const f = one(
      lint('FROM alpine:3.20\nADD https://example.com/tool.sh /usr/local/bin/tool\nUSER app\n'),
      'DF005',
    );
    expect(f.title).toBe('ADD downloads “https://example.com/tool.sh” with no checksum.');
    expect(f.line).toBe(2);
  });

  it('treats a remote ADD as remote only: DF004 does not double-report it', () => {
    expect(
      ids(lint('FROM alpine:3.20\nADD https://example.com/tool.sh /t\nUSER app\n')),
    ).not.toContain('DF004');
  });
});

describe('DF006 — WORKDIR', () => {
  it('quotes the offending relative path', () => {
    expect(one(lint('FROM alpine:3.20\nWORKDIR app\nUSER app\n'), 'DF006').title).toBe(
      'WORKDIR “app” is a relative path.',
    );
  });

  it('stays silent for an absolute path and for a variable', () => {
    expect(ids(lint('FROM alpine:3.20\nWORKDIR /app\nUSER app\n'))).not.toContain('DF006');
    expect(ids(lint('FROM alpine:3.20\nWORKDIR $APP_HOME\nUSER app\n'))).not.toContain('DF006');
  });
});

describe('DF007 / DF008 — package manager layers', () => {
  it('names the update command it found alone', () => {
    const f = one(lint('FROM debian:bookworm-slim\nRUN apt-get update\nUSER app\n'), 'DF007');
    expect(f.severity).toBe('warning');
    expect(f.title).toBe('apt-get update runs without an install in the same RUN.');
    expect(f.line).toBe(2);
  });

  it('handles apk update the same way, with apk wording', () => {
    expect(one(lint('FROM alpine:3.20\nRUN apk update\nUSER app\n'), 'DF007').title).toBe(
      'apk update runs without an install in the same RUN.',
    );
  });

  it('flags an apt install that leaves the lists behind, and the cleanup satisfies it', () => {
    expect(
      one(
        lint('FROM debian:bookworm-slim\nRUN apt-get update && apt-get install -y curl\nUSER app\n'),
        'DF008',
      ).title,
    ).toBe('apt-get install leaves the package lists in the image.');
    expect(
      ids(
        lint(
          'FROM debian:bookworm-slim\nRUN apt-get update && apt-get install -y curl \\\n  && rm -rf /var/lib/apt/lists/*\nUSER app\n',
        ),
      ),
    ).not.toContain('DF008');
  });

  it('flags a bare apk add but not apk add --no-cache', () => {
    expect(one(lint('FROM alpine:3.20\nRUN apk add curl\nUSER app\n'), 'DF008').title).toBe(
      'apk add caches the package index in the image.',
    );
    expect(ids(lint('FROM alpine:3.20\nRUN apk add --no-cache curl\nUSER app\n'))).not.toContain(
      'DF008',
    );
  });

  it('accepts dnf clean all and yum clean all as satisfiers', () => {
    expect(
      one(lint('FROM fedora:41\nRUN dnf install -y git\nUSER app\n'), 'DF008').title,
    ).toBe('dnf install leaves its metadata cache in the image.');
    expect(
      ids(lint('FROM fedora:41\nRUN dnf install -y git && dnf clean all\nUSER app\n')),
    ).not.toContain('DF008');
    expect(
      ids(lint('FROM centos:7\nRUN yum install -y git && yum clean all\nUSER app\n')),
    ).not.toContain('DF008');
  });

  it('is suppressed by a BuildKit cache mount', () => {
    const r = lint(
      'FROM debian:bookworm-slim\nRUN --mount=type=cache,target=/var/cache/apt \\\n  apt-get update && apt-get install -y curl\nUSER app\n',
    );
    expect(ids(r)).not.toContain('DF008');
    expect(ids(r)).not.toContain('DF007');
  });
});

describe('DF009 — secrets in ENV / ARG', () => {
  it('names the variable and says where it ends up', () => {
    const f = one(lint('FROM alpine:3.20\nENV DB_PASSWORD=hunter2\nUSER app\n'), 'DF009');
    expect(f.severity).toBe('warning');
    expect(f.title).toBe(
      'ENV “DB_PASSWORD” looks like a secret, and its value is baked into the image.',
    );
    expect(f.detail).toContain('docker history');
  });

  it('uses ARG wording for a build argument default', () => {
    expect(one(lint('FROM alpine:3.20\nARG NPM_TOKEN=abc\nUSER app\n'), 'DF009').title).toBe(
      'ARG “NPM_TOKEN” looks like a secret, and its default value is baked into the image.',
    );
  });

  it('stays silent when there is no value to leak', () => {
    expect(ids(lint('FROM alpine:3.20\nARG NPM_TOKEN\nUSER app\n'))).not.toContain('DF009');
    expect(ids(lint('FROM alpine:3.20\nENV API_KEY=\nUSER app\n'))).not.toContain('DF009');
  });

  it('handles the legacy space-separated ENV form', () => {
    expect(one(lint('FROM alpine:3.20\nENV SECRET_TOKEN hunter2\nUSER app\n'), 'DF009').title).toBe(
      'ENV “SECRET_TOKEN” looks like a secret, and its value is baked into the image.',
    );
  });

  it('reports each secret-looking pair on a multi-pair ENV once', () => {
    const r = lint('FROM alpine:3.20\nENV A=1 DB_PASSWORD=x API_KEY=y\nUSER app\n');
    expect(of(r, 'DF009')).toHaveLength(2);
  });
});

describe('DF010 — root in the final stage', () => {
  it('anchors a missing USER at the final stage FROM', () => {
    const f = one(lint('FROM alpine:3.20 AS build\nUSER app\nFROM alpine:3.20\nCMD ["sh"]\n'), 'DF010');
    expect(f.severity).toBe('warning');
    expect(f.title).toBe('The final stage never sets USER, so the container runs as root.');
    expect(f.line).toBe(3);
  });

  it('flags a switch back to root, at the offending USER line', () => {
    const f = one(lint('FROM alpine:3.20\nUSER app\nRUN echo hi\nUSER root\n'), 'DF010');
    expect(f.title).toBe('The final stage switches back to USER root.');
    expect(f.line).toBe(4);
  });

  it('treats uid 0 as root and any other uid as not root', () => {
    expect(one(lint('FROM alpine:3.20\nUSER 0\n'), 'DF010').title).toBe(
      'The final stage switches back to USER root.',
    );
    expect(ids(lint('FROM alpine:3.20\nUSER 1000:1000\n'))).not.toContain('DF010');
  });

  it('ignores a USER inside ONBUILD, which does not apply to this image', () => {
    expect(ids(lint('FROM alpine:3.20\nONBUILD USER app\nCMD ["sh"]\n'))).toContain('DF010');
  });

  it('looks only at the final stage', () => {
    expect(ids(lint('FROM alpine:3.20 AS build\nFROM alpine:3.20\nUSER app\n'))).not.toContain(
      'DF010',
    );
  });
});

describe('DF011 / DF012 / DF015 — shell scanning inside RUN', () => {
  it('flags cd but not a directory argument', () => {
    const f = one(lint('FROM alpine:3.20\nRUN cd /opt/app && ./configure\nUSER app\n'), 'DF011');
    expect(f.title).toBe('cd inside RUN only lasts for that RUN.');
    expect(f.line).toBe(2);
    expect(ids(lint('FROM alpine:3.20\nRUN tar -C /opt -xzf a.tgz\nUSER app\n'))).not.toContain(
      'DF011',
    );
  });

  it('reports pipe-to-shell on the PHYSICAL line the download sits on', () => {
    const src = [
      'FROM alpine:3.20',
      'RUN set -eux; \\',
      '    curl -fsSL https://example.com/i.sh \\',
      '      | sh',
      'USER app',
    ].join('\n');
    const f = one(lint(src), 'DF012');
    expect(f.severity).toBe('warning');
    expect(f.title).toBe('Piping a download straight into a shell.');
    expect(f.line).toBe(3);
  });

  it('scans heredoc bodies, and attributes the finding to the body line', () => {
    const src = [
      'FROM alpine:3.20',
      'RUN <<EOF',
      'apk add --no-cache curl',
      'wget -qO- https://example.com/i.sh | sudo bash',
      'EOF',
      'USER app',
    ].join('\n');
    expect(one(lint(src), 'DF012').line).toBe(4);
  });

  it('does not mistake a logical OR for a pipe', () => {
    expect(
      ids(lint('FROM alpine:3.20\nRUN curl -fsSL https://x/y -o y || sh ./fallback.sh\nUSER app\n')),
    ).not.toContain('DF012');
  });

  it('does not look inside quotes for a pipe target', () => {
    expect(
      ids(lint('FROM alpine:3.20\nRUN echo "curl https://x | bash" > /etc/motd\nUSER app\n')),
    ).not.toContain('DF012');
  });

  it('flags sudo', () => {
    const f = one(lint('FROM alpine:3.20\nRUN sudo chown -R app /srv\nUSER app\n'), 'DF015');
    expect(f.title).toBe('sudo in a RUN has nothing to escalate from.');
    expect(f.line).toBe(2);
  });
});

describe('DF013 — superseded CMD / ENTRYPOINT', () => {
  it('counts per stage, names the ignored line and anchors at the winner', () => {
    const src = [
      'FROM alpine:3.20',
      'USER app',
      'CMD ["sh", "-c", "one"]',
      'RUN echo hi',
      'CMD ["sh", "-c", "two"]',
    ].join('\n');
    const f = one(lint(src), 'DF013');
    expect(f.title).toBe('Stage has 2 CMD instructions — only the last one runs.');
    expect(f.detail).toBe(
      'Docker keeps the last CMD in a stage and silently discards the earlier ones (line 3).',
    );
    expect(f.line).toBe(5);
  });

  it('lists every ignored line when there are more than two', () => {
    const src = [
      'FROM alpine:3.20',
      'USER app',
      'ENTRYPOINT ["a"]',
      'ENTRYPOINT ["b"]',
      'ENTRYPOINT ["c"]',
    ].join('\n');
    const f = one(lint(src), 'DF013');
    expect(f.title).toBe('Stage has 3 ENTRYPOINT instructions — only the last one runs.');
    expect(f.detail).toBe(
      'Docker keeps the last ENTRYPOINT in a stage and silently discards the earlier ones (lines 3, 4).',
    );
  });

  it('does not add up CMDs across stages, and ignores ONBUILD ones', () => {
    expect(
      ids(lint('FROM alpine:3.20 AS a\nCMD ["x"]\nFROM alpine:3.20\nUSER app\nCMD ["y"]\n')),
    ).not.toContain('DF013');
    expect(
      ids(lint('FROM alpine:3.20\nUSER app\nONBUILD CMD ["x"]\nCMD ["y"]\n')),
    ).not.toContain('DF013');
  });
});

describe('DF014 — JSON that is not JSON', () => {
  it('says what Docker silently does instead', () => {
    const f = one(lint("FROM alpine:3.20\nUSER app\nCMD ['sh']\n"), 'DF014');
    expect(f.severity).toBe('error');
    expect(f.title).toBe('CMD looks like a JSON array but is not valid JSON.');
    expect(f.detail).toContain('/bin/sh -c');
    expect(f.line).toBe(3);
  });

  it('applies to every instruction that accepts the exec form', () => {
    for (const keyword of ['RUN', 'ENTRYPOINT', 'VOLUME', 'SHELL']) {
      const r = lint(`FROM alpine:3.20\nUSER app\n${keyword} ['x']\n`);
      expect(one(r, 'DF014').title).toBe(
        `${keyword} looks like a JSON array but is not valid JSON.`,
      );
    }
  });

  it('accepts a valid array, including one folded across lines', () => {
    expect(
      ids(lint('FROM alpine:3.20\nUSER app\nCMD ["node", \\\n  "server.js"]\n')),
    ).not.toContain('DF014');
  });

  it('flags an array of non-strings', () => {
    expect(ids(lint('FROM alpine:3.20\nUSER app\nCMD [1, 2]\n'))).toContain('DF014');
  });
});

describe('DF016 — MAINTAINER', () => {
  it('is info, never an error', () => {
    const f = one(lint('FROM alpine:3.20\nMAINTAINER ops@example.com\nUSER app\n'), 'DF016');
    expect(f.severity).toBe('info');
    expect(f.title).toBe('MAINTAINER is deprecated.');
    expect(f.remediation).toContain('org.opencontainers.image.authors');
  });
});

describe('DF017 — layer-cache order', () => {
  it('names the install line it defeats, with the wording the plan pins', () => {
    const src = ['FROM node:22-bookworm-slim', 'WORKDIR /app', 'COPY . .', 'RUN npm ci', 'USER node'].join(
      '\n',
    );
    const f = one(lint(src), 'DF017');
    expect(f.severity).toBe('info');
    expect(f.title).toBe(
      'COPY . copies the whole build context before the dependency install on line 4.',
    );
    expect(f.detail).toBe(
      'Copy the dependency manifest first, install, then copy the rest — a source-only change currently reinstalls every dependency.',
    );
    expect(f.line).toBe(3);
    expect(f.remediation).toContain('.dockerignore');
  });

  it('accepts the correct order', () => {
    expect(
      ids(
        lint(
          'FROM node:22-bookworm-slim\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nUSER node\n',
        ),
      ),
    ).not.toContain('DF017');
  });

  it('recognises the other package managers', () => {
    const installs = [
      'RUN pip install -r requirements.txt',
      'RUN bundle install',
      'RUN composer install',
      'RUN go mod download',
      'RUN cargo build --release',
      'RUN pnpm install --frozen-lockfile',
      'RUN yarn install --frozen-lockfile',
    ];
    for (const install of installs) {
      const r = lint(`FROM alpine:3.20\nCOPY ./ /src\n${install}\nUSER app\n`);
      expect(ids(r), install).toContain('DF017');
    }
  });

  it('does not fire across stage boundaries', () => {
    expect(
      ids(
        lint(
          'FROM node:22-bookworm-slim AS deps\nCOPY . /src\nFROM node:22-bookworm-slim\nRUN npm ci\nUSER node\n',
        ),
      ),
    ).not.toContain('DF017');
  });
});

/* ── 4. Kitchen sink: exact counts ───────────────────────────────────────── */

describe('bundled examples', () => {
  it('ships the four chips the plan specifies, kitchen sink first', () => {
    expect(examples.map((e) => e.id)).toEqual([
      'kitchen-sink',
      'clean-multistage',
      'python-slim',
      'heredoc-build',
    ]);
  });

  it('the kitchen sink fires fifteen findings, with exact per-severity counts', () => {
    const r = lint(examples[0].dockerfile);
    expect(r.ok).toBe(true);
    expect(r.summary).toEqual({ errors: 1, warnings: 12, infos: 2 });
    expect(r.findings).toHaveLength(15);
    expect([...new Set(ids(r))].sort()).toEqual([
      'DF002',
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
    ]);
    // Errors sort before warnings, warnings before info; ties break on line.
    expect(r.findings[0].severity).toBe('error');
    expect(r.findings.at(-1)?.severity).toBe('info');
  });

  it('the clean multi-stage example is genuinely clean', () => {
    const r = lint(examples[1].dockerfile);
    expect(r.ok).toBe(true);
    expect(r.findings).toEqual([]);
    expect(r.stats.stages).toBe(2);
  });

  it('the python-slim example is a realistic middle: two warnings and one info', () => {
    const r = lint(examples[2].dockerfile);
    expect(r.summary).toEqual({ errors: 0, warnings: 2, infos: 1 });
    expect([...new Set(ids(r))].sort()).toEqual(['DF008', 'DF010', 'DF017']);
  });

  it('the heredoc example proves heredoc scanning', () => {
    const r = lint(examples[3].dockerfile);
    expect(r.summary).toEqual({ errors: 0, warnings: 2, infos: 0 });
    expect([...new Set(ids(r))].sort()).toEqual(['DF008', 'DF012']);
    // Both findings sit on BODY lines — line 4 is the `RUN <<-DONE` itself, so a
    // parser that collapsed the heredoc onto its opener would report 4 twice.
    expect(one(r, 'DF008').line).toBe(6);
    expect(one(r, 'DF012').line).toBe(7);
  });

  it('the kitchen sink puts every finding on the right physical line', () => {
    const r = lint(examples[0].dockerfile);
    const byId = new Map(r.findings.map((f) => [f.id, f.line]));
    expect(Object.fromEntries(byId)).toEqual({
      DF002: 1,
      DF010: 1,
      DF016: 2,
      DF006: 3,
      DF004: 4,
      DF005: 5,
      DF007: 6,
      DF008: 7,
      DF012: 8,
      DF015: 9,
      DF011: 10,
      DF009: 11,
      DF017: 12,
      DF014: 14,
      DF013: 15,
    });
  });

  it('the python-slim example reports the install line inside its folded RUN', () => {
    const r = lint(examples[2].dockerfile);
    expect(one(r, 'DF008').line).toBe(7);
    expect(one(r, 'DF017').line).toBe(13);
    expect(one(r, 'DF010').line).toBe(1);
  });

  it('every example is non-empty and parses', () => {
    for (const ex of examples) {
      expect(ex.dockerfile.trim().length, ex.id).toBeGreaterThan(0);
      expect(lint(ex.dockerfile).ok, ex.id).toBe(true);
    }
  });
});

/* ── 5. Sorting, de-duplication and caps ─────────────────────────────────── */

describe('finalize', () => {
  it('sorts by severity then line', () => {
    const src = [
      'FROM ubuntu', // DF002 warning, line 1 (+ DF010 warning line 1)
      'WORKDIR app', // DF006 warning line 2
      "CMD ['sh']", // DF014 error line 3
    ].join('\n');
    const r = lint(src);
    const order = r.findings.map((f) => `${f.severity}:${f.line}`);
    expect(order[0]).toBe('error:3');
    const rest = r.findings.slice(1);
    expect(rest.every((f) => f.severity !== 'error')).toBe(true);
    const lines = rest.map((f) => f.line ?? 0);
    expect([...lines].sort((a, b) => a - b)).toEqual(lines);
  });

  it('de-duplicates identical rule + line + title triples', () => {
    // Two identical RUN lines produce two findings on DIFFERENT lines, so both
    // survive — de-duplication must not swallow a real second occurrence.
    const r = lint('FROM alpine:3.20\nRUN apk update\nRUN apk update\nUSER app\n');
    expect(of(r, 'DF007').map((f) => f.line)).toEqual([2, 3]);
  });

  it('caps a single rule and reports the cap honestly', () => {
    const many = ['FROM alpine:3.20', ...Array.from({ length: 40 }, () => 'RUN apk update'), 'USER app'].join(
      '\n',
    );
    const r = lint(many);
    expect(r.ok).toBe(true);
    expect(of(r, 'DF007')).toHaveLength(20);
    expect(r.truncatedRules).toEqual([{ ruleId: 'DF007', shown: 20, total: 40 }]);
  });

  it('caps the total number of findings', () => {
    // Twelve rule surfaces × 30 repetitions. Each rule caps at 20, so the total
    // wants 240 findings and the 200 ceiling has to bite.
    const lines: string[] = [];
    for (let i = 0; i < 30; i += 1) {
      lines.push(
        'FROM ubuntu', // DF002
        'MAINTAINER a@b.test', // DF016
        'WORKDIR app', // DF006
        'ADD ./x.sh /x.sh', // DF004
        'ADD https://example.test/y.sh /y.sh', // DF005
        'COPY --from=nope /a /b', // DF003
        'ENV DB_PASSWORD=x', // DF009
        'RUN apk update', // DF007
        'RUN apk add curl', // DF008
        'RUN sudo true', // DF015
        'RUN cd /tmp && true', // DF011
        "CMD ['sh']", // DF014
      );
    }
    const r = lint(lines.join('\n'));
    expect(r.findings.length).toBeLessThanOrEqual(200);
    expect(r.truncated).toBe(true);
  });
});

/* ── 6. Never throws ─────────────────────────────────────────────────────── */

describe('never throws', () => {
  const hostile: [string, string][] = [
    ['empty', ''],
    ['whitespace', ' \t\n '],
    ['a lone newline', '\n'],
    ['a lone backslash', '\\'],
    ['only continuations', '\\\n\\\n\\\n'],
    ['a bare keyword with no arguments', 'FROM\nRUN\nCOPY\nENV\nARG\nUSER\nWORKDIR\nCMD\n'],
    ['JSON, not a Dockerfile', '{"image":"ubuntu","cmd":["sh"]}'],
    ['YAML, not a Dockerfile', 'services:\n  web:\n    image: nginx\n'],
    ['a truncated instruction', 'FROM alpine:3.20\nRUN apt-get inst'],
    ['an unterminated heredoc', 'FROM alpine:3.20\nRUN <<EOF\necho hi\n'],
    ['an unterminated quote', 'FROM alpine:3.20\nRUN echo "hi\nUSER app\n'],
    ['a nested ONBUILD', 'FROM alpine:3.20\nONBUILD ONBUILD RUN echo hi\n'],
    ['an empty JSON array', 'FROM alpine:3.20\nCMD []\n'],
    ['NUL bytes', 'FROM alpine:3.20\nRUN echo \0\0\0\n'],
    ['binary-ish bytes', '\x89PNG\r\n\x1a\n\0\0'],
    ['a very long single line', 'FROM alpine:3.20\nRUN ' + 'a'.repeat(50_000)],
    ['many curls and one distant pipe', 'FROM alpine:3.20\nRUN ' + 'curl '.repeat(8_000) + '| sh'],
    ['deeply repeated pipes', 'FROM alpine:3.20\nRUN ' + 'curl x | bash && '.repeat(2_000) + 'true'],
    ['thousands of instructions', 'FROM alpine:3.20\n' + 'RUN echo hi\n'.repeat(5_000)],
    ['a huge heredoc', 'FROM alpine:3.20\nRUN <<EOF\n' + 'echo hi\n'.repeat(5_000) + 'EOF\n'],
    ['emoji and RTL text', 'FROM alpine:3.20\nLABEL a="🚢 مرحبا"\nUSER app\n'],
    ['CRLF everywhere', 'FROM ubuntu\r\nWORKDIR app\r\nUSER root\r\n'],
    ['a lone CR', 'FROM ubuntu\rUSER app\r'],
  ];

  for (const [label, input] of hostile) {
    it(`survives ${label}`, () => {
      const started = Date.now();
      const r = lint(input);
      expect(Date.now() - started, `${label} took too long`).toBeLessThan(4_000);
      expect(typeof r.ok).toBe('boolean');
      expect(Array.isArray(r.findings)).toBe(true);
      expect(r.summary.errors + r.summary.warnings + r.summary.infos).toBe(r.findings.length);
      for (const f of r.findings) {
        expect(RULE_IDS).toContain(f.id);
        expect(f.title.length).toBeGreaterThan(0);
        expect(f.detail.length).toBeGreaterThan(0);
        if (f.line !== undefined) {
          expect(f.line).toBeGreaterThanOrEqual(1);
        }
      }
      // parseDockerfile is public too, and must be equally total.
      expect(() => parseDockerfile(input)).not.toThrow();
    });
  }

  it('refuses a non-string without throwing', () => {
    for (const bad of [null, undefined, 42, {}, [], true]) {
      const r = lint(bad as unknown as string);
      expect(r.ok).toBe(false);
      expect(r.error).toBe('Paste a Dockerfile to lint.');
    }
  });

  it('refuses an input past the scan limit, and says the real numbers', () => {
    const big = 'FROM alpine:3.20\n' + 'RUN echo hi\n'.repeat(30_000);
    expect(big.length).toBeGreaterThan(200_000);
    const r = lint(big);
    expect(r.ok).toBe(false);
    expect(r.error).toBe(
      `This input is ${big.length.toLocaleString('en-US')} characters — larger than the 200,000-character limit this linter scans. Paste the Dockerfile itself rather than a build log.`,
    );
    expect(r.findings).toEqual([]);
  });

  it('never reports a line number past the end of the input', () => {
    const src = examples.map((e) => e.dockerfile).join('\n');
    const r = lint(src);
    const total = src.split('\n').length;
    for (const f of r.findings) {
      if (f.line !== undefined) expect(f.line).toBeLessThanOrEqual(total);
    }
  });
});
