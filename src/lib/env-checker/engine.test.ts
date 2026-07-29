/**
 * Env Example Checker — engine tests.
 *
 * The engine's contract (see engine.ts / types.ts): `check(code, envExample)`
 * returns four unique, sorted string arrays and NEVER throws. These tests cover
 *
 *   • `.env.example` parsing — comments, blanks, `export`, duplicates, values
 *     that themselves contain `=`.
 *   • Every access shape the tool page advertises: process.env, import.meta.env,
 *     Deno/Python/Ruby/Go/Java/PHP, and shell `$NAME` / `${NAME}`.
 *   • Both drift directions, and the "dynamic key is ignored" promise.
 *
 * Two regressions are pinned here because both produced the SAME dangerous
 * failure — a variable the code really needs was listed under the report's
 * "Safe to remove if truly unused" heading:
 *
 *   BUG 1 — shell `$NAME` / `${NAME}` reads were not detected at all, so every
 *           key in a shell / Dockerfile / compose / CI paste read as unused.
 *   BUG 2 — `const { X } = process.env` destructuring (the most common Node
 *           idiom) and `process.env?.X` were not detected, same consequence.
 */
import { describe, it, expect } from 'vitest';
import { check } from './engine';
import { examples } from './examples';

describe('check() — .env.example parsing', () => {
  it('collects plain KEY=value lines', () => {
    const r = check('', 'DATABASE_URL=postgres://localhost/app\nPORT=8080\n');
    expect(r.exampleVars).toEqual(['DATABASE_URL', 'PORT']);
  });

  it('ignores comments and blank lines', () => {
    const envExample = [
      '# Database',
      '',
      'DATABASE_URL=postgres://localhost/app',
      '   ',
      '  # indented comment, and a decoy: FAKE_KEY=1',
      '',
      '# Observability',
      'SENTRY_DSN=',
      '',
    ].join('\n');
    const r = check('', envExample);
    expect(r.exampleVars).toEqual(['DATABASE_URL', 'SENTRY_DSN']);
    expect(r.exampleVars).not.toContain('FAKE_KEY');
  });

  it('accepts the `export KEY=` form and spaces around `=`', () => {
    const r = check('', 'export API_KEY=abc\nHOST = localhost\n');
    expect(r.exampleVars).toEqual(['API_KEY', 'HOST']);
  });

  it('collapses duplicate keys into a single entry', () => {
    const r = check('', 'PORT=8080\nPORT=3000\nexport PORT=1\n');
    expect(r.exampleVars).toEqual(['PORT']);
  });

  it('keeps only the key when the value itself contains `=`', () => {
    const envExample = [
      'DATABASE_URL=postgres://u:p@host:5432/db?sslmode=require&x=1',
      'JWT_SECRET=YWJjZGVmZ2g=',
      'RAW==weird=',
    ].join('\n');
    const r = check('', envExample);
    expect(r.exampleVars).toEqual(['DATABASE_URL', 'JWT_SECRET', 'RAW']);
  });

  it('parses CRLF and bare-CR line endings', () => {
    expect(check('', 'A=1\r\nB=2\r\n').exampleVars).toEqual(['A', 'B']);
    expect(check('', 'A=1\rB=2\r').exampleVars).toEqual(['A', 'B']);
  });

  it('returns empty arrays for empty input', () => {
    expect(check('', '')).toEqual({
      usedVars: [],
      exampleVars: [],
      missingInExample: [],
      unusedInExample: [],
    });
  });
});

describe('check() — drift in both directions', () => {
  it('reports a key used in code but absent from the example', () => {
    const r = check('const k = process.env.STRIPE_SECRET_KEY;', 'DATABASE_URL=\n');
    expect(r.missingInExample).toEqual(['STRIPE_SECRET_KEY']);
  });

  it('reports a key declared in the example that no code path reads', () => {
    const r = check('const k = process.env.DATABASE_URL;', 'DATABASE_URL=\nLEGACY_API_URL=\n');
    expect(r.unusedInExample).toEqual(['LEGACY_API_URL']);
  });

  it('reports no drift when the two sides agree', () => {
    const r = check('process.env.A; process.env.B;', 'B=\nA=\n');
    expect(r.missingInExample).toEqual([]);
    expect(r.unusedInExample).toEqual([]);
  });

  it('returns unique, sorted output regardless of input order', () => {
    const r = check('process.env.ZED; process.env.ALPHA; process.env.ZED;', 'ZED=\nMID=\nALPHA=\n');
    expect(r.usedVars).toEqual(['ALPHA', 'ZED']);
    expect(r.exampleVars).toEqual(['ALPHA', 'MID', 'ZED']);
    expect(r.unusedInExample).toEqual(['MID']);
  });

  it('never throws and never sets `error` on ordinary input', () => {
    expect(check('process.env.A', 'A=').error).toBeUndefined();
    // Deliberately hostile input: unbalanced braces, lone `$`, huge repetition.
    expect(() => check('${ $ } ${'.repeat(500), '='.repeat(500))).not.toThrow();
    // Non-string arguments are coerced defensively rather than throwing.
    expect(() => check(null as unknown as string, undefined as unknown as string)).not.toThrow();
  });
});

describe('check() — JS / TS access shapes', () => {
  it('detects process.env.NAME and the quoted-bracket form', () => {
    const code = `const a = process.env.DATABASE_URL;
const b = process.env["STRIPE_KEY"];
const c = process.env['SENTRY_DSN'];`;
    expect(check(code, '').usedVars).toEqual(['DATABASE_URL', 'SENTRY_DSN', 'STRIPE_KEY']);
  });

  it('detects import.meta.env.NAME and its bracket form', () => {
    const code = `const a = import.meta.env.VITE_API_BASE;
const b = import.meta.env["VITE_SENTRY_DSN"];`;
    expect(check(code, '').usedVars).toEqual(['VITE_API_BASE', 'VITE_SENTRY_DSN']);
  });

  it('ignores dynamically-built keys it cannot resolve statically', () => {
    const code = `const key = 'DATABASE_URL';
const a = process.env[key];
const b = process.env[\`PREFIX_\${suffix}\`];`;
    expect(check(code, '').usedVars).toEqual([]);
  });

  it('detects the other advertised languages', () => {
    const code = `Deno.env.get("DENO_PORT");
os.getenv("PY_GETENV"); os.environ["PY_ENVIRON"]; os.environ.get("PY_GET");
ENV["RB_BRACKET"]; ENV.fetch("RB_FETCH");
os.Getenv("GO_VAR");
System.getenv("JAVA_VAR");
$_ENV["PHP_SUPERGLOBAL"];`;
    expect(check(code, '').usedVars).toEqual([
      'DENO_PORT',
      'GO_VAR',
      'JAVA_VAR',
      'PHP_SUPERGLOBAL',
      'PY_ENVIRON',
      'PY_GET',
      'PY_GETENV',
      'RB_BRACKET',
      'RB_FETCH',
    ]);
  });
});

/* ── BUG 1 ───────────────────────────────────────────────────────────────────
   Shell `$NAME` / `${NAME}` access is advertised on the tool page (and in the
   JSON-LD featureList), but no shell pattern existed. A shell / Dockerfile /
   compose / CI paste therefore reported 100% false drift: every correctly
   declared key landed under "Safe to remove if truly unused".
   ────────────────────────────────────────────────────────────────────────── */
describe('check() — shell $NAME / ${NAME} (BUG 1)', () => {
  it('detects every shell expansion form in a bash script', () => {
    const code = `#!/usr/bin/env bash
set -euo pipefail

echo "Deploying to $DEPLOY_ENV"
curl -H "Authorization: Bearer \${API_TOKEN}" "$API_BASE/deploy"
: "\${DATABASE_URL:?DATABASE_URL is required}"
PORT="\${PORT:-8080}"
echo "\${LOG_LEVEL:=info}" > "$HOME/app.log"`;
    expect(check(code, '').usedVars).toEqual([
      'API_BASE',
      'API_TOKEN',
      'DATABASE_URL',
      'DEPLOY_ENV',
      'HOME',
      'LOG_LEVEL',
      'PORT',
    ]);
  });

  it('reports NO false "unused" drift for a shell script whose keys are all declared', () => {
    const code = `#!/bin/sh
echo "$DEPLOY_ENV"
curl "\${API_BASE}/health" -H "x-token: \${API_TOKEN}"`;
    const envExample = `API_BASE=http://localhost:3000
API_TOKEN=
DEPLOY_ENV=staging
`;
    const r = check(code, envExample);
    // This is the whole point of the bug: before the fix all three keys were
    // reported as safe to delete.
    expect(r.unusedInExample).toEqual([]);
    expect(r.missingInExample).toEqual([]);
  });

  it('detects shell expansions in a Dockerfile', () => {
    const code = `FROM node:20-alpine
ARG BUILD_ENV
RUN echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > .npmrc
CMD ["sh", "-c", "node server.js --port \${PORT}"]`;
    const r = check(code, 'NPM_TOKEN=\nPORT=8080\n');
    expect(r.usedVars).toEqual(['NPM_TOKEN', 'PORT']);
    expect(r.unusedInExample).toEqual([]);
  });

  it('detects shell expansions in docker-compose interpolation', () => {
    const code = `services:
  web:
    image: app:latest
    environment:
      - DATABASE_URL=\${DATABASE_URL}
      - REDIS_URL=\${REDIS_URL:-redis://cache:6379}
    ports:
      - "\${PORT}:8080"`;
    const r = check(code, 'DATABASE_URL=\nPORT=\nREDIS_URL=\n');
    expect(r.usedVars).toEqual(['DATABASE_URL', 'PORT', 'REDIS_URL']);
    expect(r.unusedInExample).toEqual([]);
  });

  it('does not fire on lowercase JS template-literal interpolation', () => {
    const code = 'const url = `${apiBase}/users/${userId}`;\nconst m = `Hi ${name}, ${count} items`;';
    expect(check(code, '').usedVars).toEqual([]);
  });

  it('does not mistake PHP superglobals for shell variables', () => {
    const code = `$env = $_ENV["APP_ENV"];
$who = $_SERVER["REMOTE_ADDR"];
$from = getenv("MAIL_FROM");`;
    const used = check(code, '').usedVars;
    expect(used).toContain('APP_ENV');
    expect(used).toContain('MAIL_FROM');
    expect(used).not.toContain('_ENV');
    expect(used).not.toContain('_SERVER');
  });

  it('does not fire on positional params, specials, or dollar amounts', () => {
    const code = 'echo "$1 $2 $@ $# $? $$ $* $-"; echo "costs $100"; if [ -z "$" ]; then :; fi';
    expect(check(code, '').usedVars).toEqual([]);
  });

  it('does not fire on GitHub Actions ${{ }} expressions', () => {
    const code = 'run: deploy --token ${{ secrets.DEPLOY_TOKEN }}';
    expect(check(code, '').usedVars).toEqual([]);
  });
});

/* ── BUG 2 ───────────────────────────────────────────────────────────────────
   `const { X } = process.env` — the most common Node idiom — was undetected,
   as was `process.env?.X`. Same consequence as BUG 1: correctly declared keys
   were reported as safe to remove.
   ────────────────────────────────────────────────────────────────────────── */
describe('check() — process.env destructuring (BUG 2)', () => {
  it('detects `const { A, B } = process.env`', () => {
    const r = check("const { DATABASE_URL, PORT } = process.env;", 'DATABASE_URL=\nPORT=\n');
    expect(r.usedVars).toEqual(['DATABASE_URL', 'PORT']);
    expect(r.unusedInExample).toEqual([]);
  });

  it('detects the `let` and `var` forms', () => {
    expect(check('let { LET_VAR } = process.env', '').usedVars).toEqual(['LET_VAR']);
    expect(check('var { VAR_VAR } = process.env', '').usedVars).toEqual(['VAR_VAR']);
  });

  it('captures the ENV key, not the local binding, when a key is renamed', () => {
    const r = check("const { API_KEY: apiKey } = process.env;", '');
    expect(r.usedVars).toEqual(['API_KEY']);
  });

  it('captures the ENV key when a default value is supplied', () => {
    const r = check("const { PORT = '3000', HOST = 'localhost' } = process.env;", '');
    expect(r.usedVars).toEqual(['HOST', 'PORT']);
  });

  it('handles a multi-line destructure with a trailing comma', () => {
    const code = `const {
  DATABASE_URL,
  REDIS_URL,
  SENTRY_DSN,
} = process.env;`;
    expect(check(code, '').usedVars).toEqual(['DATABASE_URL', 'REDIS_URL', 'SENTRY_DSN']);
  });

  it('mixes renames, defaults and plain bindings, and ignores the rest element', () => {
    const code = "const { NODE_ENV, API_KEY: key, PORT = 8080, ...rest } = process.env;";
    expect(check(code, '').usedVars).toEqual(['API_KEY', 'NODE_ENV', 'PORT']);
  });

  it('detects destructuring of import.meta.env', () => {
    const r = check('const { VITE_API_BASE, VITE_MODE } = import.meta.env;', '');
    expect(r.usedVars).toEqual(['VITE_API_BASE', 'VITE_MODE']);
  });

  it('does not fire on destructuring of an unrelated object', () => {
    expect(check('const { DATABASE_URL, PORT } = config;', '').usedVars).toEqual([]);
  });

  it('reports NO false "unused" drift for a destructuring-only Node file', () => {
    const code = `const { DATABASE_URL, REDIS_URL, STRIPE_SECRET_KEY } = process.env;
module.exports = { DATABASE_URL, REDIS_URL, STRIPE_SECRET_KEY };`;
    const envExample = `DATABASE_URL=postgres://localhost/app
REDIS_URL=redis://localhost:6379
STRIPE_SECRET_KEY=sk_test_x
`;
    const r = check(code, envExample);
    expect(r.unusedInExample).toEqual([]);
    expect(r.missingInExample).toEqual([]);
  });
});

describe('check() — optional chaining (BUG 2)', () => {
  it('detects process.env?.NAME', () => {
    const r = check('const a = process.env?.DATABASE_URL;', 'DATABASE_URL=\n');
    expect(r.usedVars).toEqual(['DATABASE_URL']);
    expect(r.unusedInExample).toEqual([]);
  });

  it('detects process.env?.["NAME"]', () => {
    expect(check('const a = process.env?.["STRIPE_KEY"];', '').usedVars).toEqual(['STRIPE_KEY']);
  });

  it('detects import.meta.env?.NAME', () => {
    expect(check('const a = import.meta.env?.VITE_API_BASE;', '').usedVars).toEqual([
      'VITE_API_BASE',
    ]);
  });
});

describe('check() — documented trade-off of the shell patterns', () => {
  /**
   * The shell patterns are gated by NAMING CONVENTION, not by sniffing whether
   * the whole paste "looks like" shell: only SCREAMING_SNAKE_CASE names that
   * start with a letter are captured. That kills the realistic JS noise
   * (`${apiBase}`, `${userId}`) while still catching every conventionally-named
   * env var in shell / Dockerfile / compose / CI.
   *
   * The residual trade-off, pinned here so it stays a deliberate choice: an
   * UPPERCASE JS template-literal interpolation is read as an env access. That
   * errs toward "used", which only ever SUPPRESSES an unused-key warning — it
   * can never tell a user to delete a key their code needs.
   */
  it('treats an uppercase JS template interpolation as a read (conservative direction)', () => {
    const r = check('const url = `${API_BASE}/v1`;', 'API_BASE=\n');
    expect(r.usedVars).toEqual(['API_BASE']);
    expect(r.unusedInExample).toEqual([]);
  });

  it('skips lowercase and mixed-case shell-style names', () => {
    expect(check('echo "$path" "${localVar}" "$camelCase"', '').usedVars).toEqual([]);
  });
});

describe('bundled examples still produce their documented drift', () => {
  const byId = Object.fromEntries(examples.map((e) => [e.id, e]));

  it('node-missing-key: STRIPE_SECRET_KEY missing, LEGACY_API_URL unused', () => {
    const e = byId['node-missing-key'];
    const r = check(e.code, e.envExample);
    expect(r.missingInExample).toEqual(['STRIPE_SECRET_KEY']);
    expect(r.unusedInExample).toEqual(['LEGACY_API_URL']);
  });

  it('python-in-sync: no drift in either direction', () => {
    const e = byId['python-in-sync'];
    const r = check(e.code, e.envExample);
    expect(r.missingInExample).toEqual([]);
    expect(r.unusedInExample).toEqual([]);
  });

  it('polyglot: MAIL_FROM missing, UNUSED_TOKEN unused', () => {
    const e = byId['polyglot'];
    const r = check(e.code, e.envExample);
    expect(r.missingInExample).toEqual(['MAIL_FROM']);
    expect(r.unusedInExample).toEqual(['UNUSED_TOKEN']);
  });
});
