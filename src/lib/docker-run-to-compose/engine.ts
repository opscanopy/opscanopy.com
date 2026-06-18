/**
 * Docker Run ↔ Compose — a CLIENT-SIDE, bidirectional converter between a
 * `docker run` command line and a one-service `docker-compose.yml` snippet.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  WHAT THIS IS                                                              │
 * │                                                                            │
 * │  Two pure functions, neither of which ever throws:                         │
 * │                                                                            │
 * │    runToCompose(cmd)  →  { ok, yaml?, warnings, error? }                    │
 * │      A POSIX-aware shell tokenizer splits the command (honouring single    │
 * │      and double quotes and backslash-newline continuations), strips a       │
 * │      leading `docker run` / `docker container run`, classifies each flag    │
 * │      onto a Compose service object, treats the first non-flag token as the  │
 * │      image and the rest as the container command, then emits deterministic  │
 * │      YAML via a tiny hand-rolled writer (no new dependency).               │
 * │                                                                            │
 * │    composeToRun(yaml) →  { ok, command?, warnings, error? }                 │
 * │      Parses the Compose YAML with js-yaml (the same reader the GHA          │
 * │      validator uses), takes the FIRST service, and rebuilds an equivalent   │
 * │      `docker run …` line. Compose-only keys (depends_on, build, deploy, …)  │
 * │      with no `docker run` equivalent are reported as warnings.             │
 * │                                                                            │
 * │  Flags that genuinely have NO Compose equivalent (`--rm`, `-d`/`--detach`)  │
 * │  are dropped with a warning rather than silently lost.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

// js-yaml v4 ships ESM but no bundled type declarations, and @types/js-yaml is
// not a project dependency. Declare the tiny surface we use so the project
// type-checks under strict mode without adding a dependency. (Mirrors the
// GitHub Actions validator engine, which declares the same module.)
declare module 'js-yaml' {
  export function load(input: string, options?: unknown): unknown;
  const _default: { load: typeof load };
  export default _default;
}

import yaml from 'js-yaml';
import type {
  ComposeService,
  ComposeToRunResult,
  RunToComposeResult,
} from './types';

/* ────────────────────────────────────────────────────────────────────────── *
 *  Small helpers.
 * ────────────────────────────────────────────────────────────────────────── */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Best-effort line-referenced description of a js-yaml parse error. */
function describeYamlError(e: unknown): string {
  if (e && typeof e === 'object') {
    const err = e as {
      reason?: string;
      mark?: { line?: number; column?: number };
      message?: string;
    };
    if (err.reason && err.mark && typeof err.mark.line === 'number') {
      return `${err.reason} (line ${err.mark.line + 1}, column ${(err.mark.column ?? 0) + 1}).`;
    }
    if (err.message) return err.message;
  }
  return String(e);
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Shell tokenizer.
 *
 *  Splits a command line into tokens, honouring:
 *    • single quotes  '…'  — everything literal, no escapes.
 *    • double quotes  "…"  — \" and \\ unescape; everything else literal.
 *    • backslash escapes outside quotes (e.g. \  → a literal space).
 *    • backslash-newline continuations — the backslash + newline disappear.
 *  Returns null only if a quote is left open (a genuinely malformed command).
 * ────────────────────────────────────────────────────────────────────────── */

function tokenize(input: string): string[] | null {
  const tokens: string[] = [];
  let cur = '';
  let hasToken = false; // distinguishes a real empty token ("") from whitespace
  let i = 0;
  const n = input.length;

  const push = () => {
    if (hasToken) tokens.push(cur);
    cur = '';
    hasToken = false;
  };

  while (i < n) {
    const ch = input[i];

    if (ch === '\\') {
      const next = input[i + 1];
      // Backslash-newline (line continuation): drop both characters.
      if (next === '\n') {
        i += 2;
        continue;
      }
      if (next === '\r' && input[i + 2] === '\n') {
        i += 3;
        continue;
      }
      // Any other escaped char is taken literally.
      if (next !== undefined) {
        cur += next;
        hasToken = true;
        i += 2;
        continue;
      }
      // Trailing lone backslash — treat as literal.
      cur += ch;
      hasToken = true;
      i += 1;
      continue;
    }

    if (ch === "'") {
      hasToken = true;
      i += 1;
      while (i < n && input[i] !== "'") {
        cur += input[i];
        i += 1;
      }
      if (i >= n) return null; // unterminated single quote
      i += 1; // skip closing quote
      continue;
    }

    if (ch === '"') {
      hasToken = true;
      i += 1;
      while (i < n && input[i] !== '"') {
        if (input[i] === '\\') {
          const next = input[i + 1];
          if (next === '"' || next === '\\') {
            cur += next;
            i += 2;
            continue;
          }
          if (next === '\n') {
            i += 2;
            continue;
          }
        }
        cur += input[i];
        i += 1;
      }
      if (i >= n) return null; // unterminated double quote
      i += 1; // skip closing quote
      continue;
    }

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      push();
      i += 1;
      continue;
    }

    cur += ch;
    hasToken = true;
    i += 1;
  }

  push();
  return tokens;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Flag table — short single-char flags that TAKE a value, and boolean flags.
 *
 *  Used to expand bundled short flags (`-it` → `-i -t`, `-itp 80:80` →
 *  `-i -t -p 80:80`) correctly: a value-taking short flag consumes the rest of
 *  the bundle (or the next token) as its argument.
 * ────────────────────────────────────────────────────────────────────────── */

/** Short flags that consume a value (`-h` is `docker run`'s hostname). */
const SHORT_VALUE_FLAGS = new Set(['p', 'v', 'e', 'w', 'u', 'm', 'l', 'h']);

/** A parsed flag: its canonical long-ish name plus an optional value. */
interface ParsedFlag {
  name: string; // e.g. "p", "publish", "env", "rm"
  value?: string; // present when the flag took a value
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  The Compose service accumulator — mutated as flags are classified.
 * ────────────────────────────────────────────────────────────────────────── */

interface ServiceModel {
  image?: string;
  container_name?: string;
  command?: string[];
  ports: string[];
  volumes: string[];
  environment: string[];
  env_file: string[];
  restart?: string;
  networks: string[];
  network_mode?: string;
  working_dir?: string;
  user?: string;
  entrypoint?: string;
  hostname?: string;
  extra_hosts: string[];
  cap_add: string[];
  cap_drop: string[];
  privileged?: boolean;
  mem_limit?: string;
  cpus?: string;
  labels: string[];
  stdin_open?: boolean;
  tty?: boolean;
  // healthcheck pieces (assembled at emit time)
  healthCmd?: string;
  healthInterval?: string;
  healthTimeout?: string;
  healthRetries?: string;
  healthStartPeriod?: string;
}

function emptyModel(): ServiceModel {
  return {
    ports: [],
    volumes: [],
    environment: [],
    env_file: [],
    networks: [],
    extra_hosts: [],
    cap_add: [],
    cap_drop: [],
    labels: [],
  };
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Argument splitting — turn the raw tokens into flags + positionals.
 *
 *  Handles `--flag=value`, `--flag value`, bundled short flags, and `--` (the
 *  end-of-options marker, after which everything is positional).
 * ────────────────────────────────────────────────────────────────────────── */

interface SplitArgs {
  flags: ParsedFlag[];
  positionals: string[];
}

function splitArgs(tokens: string[]): SplitArgs {
  const flags: ParsedFlag[] = [];
  const positionals: string[] = [];
  let i = 0;
  let endOfOptions = false;

  while (i < tokens.length) {
    const tok = tokens[i];

    if (endOfOptions) {
      positionals.push(tok);
      i += 1;
      continue;
    }

    if (tok === '--') {
      endOfOptions = true;
      i += 1;
      continue;
    }

    // `docker run` grammar: the FIRST non-flag token is the image, and every
    // token after it is the container command (verbatim, never re-parsed as a
    // flag). As soon as we see a positional, stop flag scanning entirely.
    if (!(tok.startsWith('-') && tok.length > 1)) {
      while (i < tokens.length) {
        positionals.push(tokens[i]);
        i += 1;
      }
      break;
    }

    // Long flag: --name or --name=value
    if (tok.startsWith('--')) {
      const body = tok.slice(2);
      const eq = body.indexOf('=');
      if (eq >= 0) {
        flags.push({ name: body.slice(0, eq), value: body.slice(eq + 1) });
        i += 1;
        continue;
      }
      const name = body;
      if (LONG_BOOL_FLAGS.has(name)) {
        flags.push({ name });
        i += 1;
        continue;
      }
      // Value-taking long flag: take the next token as its value.
      const value = tokens[i + 1];
      if (value !== undefined) {
        flags.push({ name, value });
        i += 2;
      } else {
        flags.push({ name });
        i += 1;
      }
      continue;
    }

    // Short flag(s): -p, -it, -itp 80:80, -e=FOO (rare) …
    if (tok.startsWith('-') && tok.length > 1) {
      const body = tok.slice(1);
      let j = 0;
      let consumedNext = false;
      while (j < body.length) {
        const c = body[j];
        if (SHORT_VALUE_FLAGS.has(c)) {
          // The remainder of the bundle is this flag's value, if any…
          const rest = body.slice(j + 1);
          if (rest.length > 0) {
            const v = rest.startsWith('=') ? rest.slice(1) : rest;
            flags.push({ name: c, value: v });
          } else {
            // …otherwise the next token is the value.
            const v = tokens[i + 1];
            flags.push({ name: c, value: v });
            consumedNext = v !== undefined;
          }
          break; // value flag ends the bundle
        }
        // Boolean short flag (known or unknown): record and continue the bundle.
        flags.push({ name: c });
        j += 1;
      }
      i += consumedNext ? 2 : 1;
      continue;
    }

    // Unreachable: a token is either `--`, a positional (handled above), a long
    // flag, or a short-flag bundle. A bare `-` falls through to here.
    positionals.push(tok);
    i += 1;
  }

  return { flags, positionals };
}

/** Long boolean flags (take no value). */
const LONG_BOOL_FLAGS = new Set([
  'rm',
  'detach',
  'privileged',
  'interactive',
  'tty',
  'init',
  'read-only',
]);

/* ────────────────────────────────────────────────────────────────────────── *
 *  Flag classification — map a parsed flag onto the service model.
 * ────────────────────────────────────────────────────────────────────────── */

function applyFlag(flag: ParsedFlag, m: ServiceModel, warnings: string[]): void {
  const { name } = flag;
  const v = flag.value;

  switch (name) {
    // ── ports ──────────────────────────────────────────────────────────────
    case 'p':
    case 'publish':
      if (v) m.ports.push(v);
      return;

    // ── volumes / mounts ─────────────────────────────────────────────────────
    case 'v':
    case 'volume':
      if (v) m.volumes.push(v);
      return;
    case 'mount':
      if (v) {
        const vol = mountToVolume(v);
        if (vol) m.volumes.push(vol);
        else warnings.push(`Could not map --mount "${v}" to a volume; review it manually.`);
      }
      return;

    // ── environment ──────────────────────────────────────────────────────────
    case 'e':
    case 'env':
      if (v) m.environment.push(v);
      return;
    case 'env-file':
      if (v) m.env_file.push(v);
      return;

    // ── identity ─────────────────────────────────────────────────────────────
    case 'name':
      if (v) m.container_name = v;
      return;
    case 'hostname':
    case 'h':
      if (v) m.hostname = v;
      return;

    // ── lifecycle ────────────────────────────────────────────────────────────
    case 'restart':
      if (v) m.restart = v;
      return;

    // ── networking ───────────────────────────────────────────────────────────
    case 'network':
    case 'net':
      if (v) {
        if (v === 'host' || v === 'none') m.network_mode = v;
        else m.networks.push(v);
      }
      return;
    case 'add-host':
      if (v) m.extra_hosts.push(v);
      return;

    // ── runtime context ──────────────────────────────────────────────────────
    case 'w':
    case 'workdir':
      if (v) m.working_dir = v;
      return;
    case 'u':
    case 'user':
      if (v) m.user = v;
      return;
    case 'entrypoint':
      if (v !== undefined) m.entrypoint = v;
      return;

    // ── capabilities / privileges ────────────────────────────────────────────
    case 'cap-add':
      if (v) m.cap_add.push(v);
      return;
    case 'cap-drop':
      if (v) m.cap_drop.push(v);
      return;
    case 'privileged':
      m.privileged = true;
      return;

    // ── resources ────────────────────────────────────────────────────────────
    case 'm':
    case 'memory':
      if (v) m.mem_limit = v;
      return;
    case 'cpus':
      if (v) m.cpus = v;
      return;

    // ── labels ───────────────────────────────────────────────────────────────
    case 'l':
    case 'label':
      if (v) m.labels.push(v);
      return;

    // ── healthcheck ──────────────────────────────────────────────────────────
    case 'health-cmd':
      if (v !== undefined) m.healthCmd = v;
      return;
    case 'health-interval':
      if (v) m.healthInterval = v;
      return;
    case 'health-timeout':
      if (v) m.healthTimeout = v;
      return;
    case 'health-retries':
      if (v) m.healthRetries = v;
      return;
    case 'health-start-period':
      if (v) m.healthStartPeriod = v;
      return;

    // ── interactivity ────────────────────────────────────────────────────────
    case 'i':
    case 'interactive':
      m.stdin_open = true;
      return;
    case 't':
    case 'tty':
      m.tty = true;
      return;

    // ── not representable in Compose (drop with a warning) ────────────────────
    case 'rm':
      warnings.push(
        '`--rm` (remove container on exit) has no Compose equivalent and was dropped. Compose manages container lifecycle for you.',
      );
      return;
    case 'd':
    case 'detach':
      warnings.push(
        '`-d` / `--detach` has no Compose equivalent and was dropped. Use `docker compose up -d` to run detached.',
      );
      return;

    // ── anything else: pass through as a note ────────────────────────────────
    default:
      warnings.push(
        `Flag \`${name.length === 1 ? '-' : '--'}${name}\`${v ? ` ${v}` : ''} is not mapped and was skipped. Add it to the service manually if needed.`,
      );
      return;
  }
}

/**
 * Reduce a `--mount type=…,source=…,target=…,readonly` string to the short
 * `source:target[:ro]` volume form Compose accepts. Returns null if no target.
 */
function mountToVolume(spec: string): string | null {
  const parts = spec.split(',');
  let source = '';
  let target = '';
  let readOnly = false;
  for (const p of parts) {
    const [rawKey, ...rest] = p.split('=');
    const key = rawKey.trim();
    const val = rest.join('=').trim();
    if (key === 'source' || key === 'src') source = val;
    else if (key === 'target' || key === 'destination' || key === 'dst') target = val;
    else if (key === 'readonly' || key === 'ro') readOnly = val === '' || val === 'true';
  }
  if (!target) return null;
  const base = source ? `${source}:${target}` : target;
  return readOnly ? `${base}:ro` : base;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Hand-rolled deterministic YAML emitter.
 *
 *  We control the exact shape (a single service under `services:`), so a tiny
 *  emitter gives stable, diff-friendly output without pulling in js-yaml's
 *  `dump`. Scalars are quoted only when they need it (leading/trailing space,
 *  YAML-significant characters, or values that would otherwise be mis-typed).
 * ────────────────────────────────────────────────────────────────────────── */

/** True when a scalar can be written bare (no quotes) in YAML. */
function needsQuote(s: string): boolean {
  if (s === '') return true;
  // Reserved words / type-ambiguous values must be quoted to stay strings.
  if (/^(?:true|false|yes|no|on|off|null|~)$/i.test(s)) return true;
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)) return true; // looks numeric
  // Leading/trailing whitespace or a leading indicator character breaks plain
  // scalars. (`nginx:alpine` is fine; a leading `-`, `?`, `:`, `&`, etc. is not.)
  if (/^\s/.test(s) || /\s$/.test(s)) return true;
  if (/^[-?:,\[\]{}#&*!|>'"%@`]/.test(s)) return true;
  // A colon only breaks a plain scalar when followed by whitespace (or at end).
  if (/:(?:\s|$)/.test(s)) return true;
  // A `#` only starts a comment when preceded by whitespace.
  if (/\s#/.test(s)) return true;
  // Flow-collection delimiters anywhere are unsafe inside a plain scalar.
  if (/[\[\]{},]/.test(s)) return true;
  return false;
}

/** Quote + escape a scalar with double quotes (only the two YAML escapes). */
function quoteScalar(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Render a scalar, quoting only when necessary. */
function scalar(s: string): string {
  return needsQuote(s) ? quoteScalar(s) : s;
}

/**
 * Emit the full Compose document for one service. `serviceKey` defaults to the
 * container name, else `app`. Keys are written in a fixed, readable order.
 */
function emitYaml(m: ServiceModel): string {
  const key = m.container_name && m.container_name.trim() !== '' ? m.container_name : 'app';
  const lines: string[] = [];
  lines.push('services:');
  lines.push(`  ${scalar(key)}:`);

  const I = '    '; // 4-space service-body indent
  const push = (line: string) => lines.push(`${I}${line}`);
  const list = (label: string, items: string[], forceQuote = false) => {
    push(`${label}:`);
    for (const it of items) {
      lines.push(`${I}  - ${forceQuote ? quoteScalar(it) : scalar(it)}`);
    }
  };

  if (m.image) push(`image: ${scalar(m.image)}`);
  if (m.container_name) push(`container_name: ${scalar(m.container_name)}`);
  if (m.hostname) push(`hostname: ${scalar(m.hostname)}`);
  if (m.entrypoint !== undefined) push(`entrypoint: ${scalar(m.entrypoint)}`);
  if (m.command && m.command.length > 0) {
    push('command:');
    for (const c of m.command) lines.push(`${I}  - ${scalar(c)}`);
  }
  // Port mappings are conventionally quoted in Compose (a bare `5432:5432` can
  // be read as a sexagesimal number by YAML 1.1 parsers), so force-quote them.
  if (m.ports.length) list('ports', m.ports, true);
  if (m.volumes.length) list('volumes', m.volumes);
  if (m.environment.length) list('environment', m.environment);
  if (m.env_file.length) list('env_file', m.env_file);
  if (m.networks.length) list('networks', m.networks);
  if (m.network_mode) push(`network_mode: ${scalar(m.network_mode)}`);
  if (m.extra_hosts.length) list('extra_hosts', m.extra_hosts);
  if (m.working_dir) push(`working_dir: ${scalar(m.working_dir)}`);
  if (m.user) push(`user: ${scalar(m.user)}`);
  if (m.cap_add.length) list('cap_add', m.cap_add);
  if (m.cap_drop.length) list('cap_drop', m.cap_drop);
  if (m.privileged) push('privileged: true');
  if (m.mem_limit) push(`mem_limit: ${scalar(m.mem_limit)}`);
  if (m.cpus) push(`cpus: ${scalar(m.cpus)}`);
  if (m.restart) push(`restart: ${scalar(m.restart)}`);
  if (m.stdin_open) push('stdin_open: true');
  if (m.tty) push('tty: true');
  if (m.labels.length) list('labels', m.labels);

  if (m.healthCmd !== undefined) {
    push('healthcheck:');
    lines.push(`${I}  test: ${scalar(`CMD-SHELL ${m.healthCmd}`)}`);
    if (m.healthInterval) lines.push(`${I}  interval: ${scalar(m.healthInterval)}`);
    if (m.healthTimeout) lines.push(`${I}  timeout: ${scalar(m.healthTimeout)}`);
    if (m.healthRetries) {
      // `retries` is an integer in Compose; emit a clean integer when the value
      // is one, otherwise guard it through scalar() so a non-numeric value
      // (e.g. `abc`) can't produce an unquoted/mis-typed scalar.
      const retries = /^\d+$/.test(m.healthRetries) ? m.healthRetries : scalar(m.healthRetries);
      lines.push(`${I}  retries: ${retries}`);
    }
    if (m.healthStartPeriod) lines.push(`${I}  start_period: ${scalar(m.healthStartPeriod)}`);
  }

  return lines.join('\n') + '\n';
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Public API — runToCompose.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Convert a `docker run …` command line into a one-service Compose snippet.
 * NEVER throws: empty input, an unterminated quote, or a command with no image
 * each return `{ ok:false, error }`.
 */
export function runToCompose(cmd: string): RunToComposeResult {
  if (typeof cmd !== 'string' || cmd.trim() === '') {
    return {
      ok: false,
      warnings: [],
      error: 'Paste a `docker run …` command to convert.',
    };
  }

  const warnings: string[] = [];

  try {
    const tokens = tokenize(cmd);
    if (tokens === null) {
      return {
        ok: false,
        warnings: [],
        error: 'Unbalanced quote in the command — check that every " and \' is closed.',
      };
    }

    // Strip a leading `docker run` / `docker container run`, tolerating a bare
    // `run …` too (people paste fragments). `docker` alone is also tolerated.
    let rest = tokens.slice();
    if (rest[0] === 'docker') {
      rest = rest.slice(1);
      if (rest[0] === 'container') rest = rest.slice(1);
    }
    if (rest[0] === 'run' || rest[0] === 'create') rest = rest.slice(1);

    if (rest.length === 0) {
      return {
        ok: false,
        warnings: [],
        error: 'No arguments found after `docker run`. Include at least an image name.',
      };
    }

    const { flags, positionals } = splitArgs(rest);

    const model = emptyModel();
    for (const flag of flags) applyFlag(flag, model, warnings);

    if (positionals.length === 0) {
      return {
        ok: false,
        warnings,
        error: 'No image found. A `docker run` command must name an image, e.g. `nginx:alpine`.',
      };
    }

    model.image = positionals[0];
    if (positionals.length > 1) model.command = positionals.slice(1);

    return { ok: true, yaml: emitYaml(model), warnings };
  } catch (e) {
    // Contract: never throw. Degrade to a stable error result.
    return {
      ok: false,
      warnings,
      error: `Could not convert the command (${String(e)}).`,
    };
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Public API — composeToRun.
 * ────────────────────────────────────────────────────────────────────────── */

/** Compose keys that have no `docker run` equivalent — surfaced as warnings. */
const COMPOSE_ONLY_KEYS: Record<string, string> = {
  depends_on: '`depends_on` (service ordering) has no `docker run` equivalent — start dependencies yourself first.',
  build: '`build` (build from a Dockerfile) has no `docker run` equivalent — run `docker build` then use the resulting image tag.',
  deploy: '`deploy` (Swarm/replicas config) has no `docker run` equivalent and was skipped.',
  profiles: '`profiles` has no `docker run` equivalent and was skipped.',
  configs: '`configs` (Swarm configs) has no `docker run` equivalent and was skipped.',
  secrets: '`secrets` (Compose secrets) has no `docker run` equivalent — mount the secret as a file or env var instead.',
};

/** Coerce a YAML scalar to a string; numbers/booleans become their text form. */
function strOf(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

/** Quote a single CLI token for the rebuilt command when it contains spaces/specials. */
function shellQuote(s: string): string {
  if (s === '') return "''";
  if (/^[A-Za-z0-9_@%+=:,.\/-]+$/.test(s)) return s; // safe bare token
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Normalise a Compose list/map/scalar into an array of string items. */
function toItems(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(strOf).filter((s) => s !== '');
  if (isRecord(v)) {
    // `environment:` / `labels:` may be a mapping: KEY: value → "KEY=value".
    return Object.entries(v).map(([k, val]) =>
      val === null || val === undefined ? `${k}` : `${k}=${strOf(val)}`,
    );
  }
  const s = strOf(v);
  return s ? [s] : [];
}

/**
 * Reduce a long-form Compose port mapping (`{ target, published, host_ip,
 * protocol }`) to the short `[host_ip:][published:]target[/protocol]` string.
 * Returns null when it can't be mapped (no target).
 */
function longPortToShort(item: Record<string, unknown>): string | null {
  const target = strOf(item.target);
  if (!target) return null;
  const published = strOf(item.published);
  const hostIp = strOf(item.host_ip);
  const protocol = strOf(item.protocol);
  let s = published ? `${published}:${target}` : target;
  if (hostIp) s = `${hostIp}:${s}`;
  if (protocol) s = `${s}/${protocol}`;
  return s;
}

/**
 * Reduce a long-form Compose volume mapping (`{ type, source, target,
 * read_only }`) to the short `source:target[:ro]` string. Returns null when it
 * can't be mapped (no target).
 */
function longVolumeToShort(item: Record<string, unknown>): string | null {
  const target = strOf(item.target);
  if (!target) return null;
  const source = strOf(item.source);
  const base = source ? `${source}:${target}` : target;
  return item.read_only === true ? `${base}:ro` : base;
}

/**
 * Normalise `ports:` / `volumes:`, which may mix short-string items with
 * long-form mapping items (`{ target, published }` / `{ type, source, target }`).
 * Long-form items are reduced to the short string form; anything that can't be
 * mapped pushes a warning rather than vanishing silently.
 */
function toMappingItems(
  v: unknown,
  reduce: (item: Record<string, unknown>) => string | null,
  kind: string,
  warnings: string[],
): string[] {
  if (!Array.isArray(v)) return toItems(v);
  const out: string[] = [];
  for (const raw of v) {
    if (isRecord(raw)) {
      const mapped = reduce(raw);
      if (mapped) out.push(mapped);
      else
        warnings.push(
          `A long-form ${kind} entry could not be mapped to \`docker run\` (no target) and was skipped.`,
        );
    } else {
      const s = strOf(raw);
      if (s) out.push(s);
    }
  }
  return out;
}

/**
 * Reconstruct a `docker run …` command from a Compose YAML document. NEVER
 * throws: a parse failure or a document with no services returns
 * `{ ok:false, error }`.
 */
export function composeToRun(yamlText: string): ComposeToRunResult {
  if (typeof yamlText !== 'string' || yamlText.trim() === '') {
    return {
      ok: false,
      warnings: [],
      error: 'Paste a docker-compose service (YAML) to convert.',
    };
  }

  let doc: unknown;
  try {
    doc = yaml.load(yamlText);
  } catch (e) {
    return {
      ok: false,
      warnings: [],
      error: `Could not parse YAML: ${describeYamlError(e)}`,
    };
  }

  if (!isRecord(doc)) {
    return {
      ok: false,
      warnings: [],
      error: 'The document is not a YAML mapping. Provide a Compose file with a `services:` block.',
    };
  }

  // Accept either a full Compose file (`services:` → { name: service }) or a
  // bare single service object pasted on its own.
  let serviceName = '';
  let service: ComposeService | null = null;

  if (isRecord(doc.services)) {
    const entries = Object.entries(doc.services as Record<string, unknown>);
    if (entries.length === 0) {
      return {
        ok: false,
        warnings: [],
        error: '`services:` is empty — add at least one service definition.',
      };
    }
    const [name, svc] = entries[0];
    serviceName = name;
    service = isRecord(svc) ? (svc as ComposeService) : null;
  } else {
    // No `services:` mapping — treat `doc` (already known to be a record) as a
    // bare service object (has `image:`/`ports:` etc. at the top level).
    service = doc as ComposeService;
  }

  if (!service || !isRecord(service)) {
    return {
      ok: false,
      warnings: [],
      error: 'Could not find a service to convert. Provide a `services:` mapping or a single service object.',
    };
  }

  const warnings: string[] = [];

  try {
    const parts: string[] = ['docker', 'run', '-d'];

    const name = serviceName || strOf(service.container_name);
    if (service.container_name) parts.push('--name', shellQuote(strOf(service.container_name)));
    else if (name) parts.push('--name', shellQuote(name));

    if (service.hostname) parts.push('--hostname', shellQuote(strOf(service.hostname)));

    if (service.restart) parts.push('--restart', shellQuote(strOf(service.restart)));

    for (const p of toMappingItems(service.ports, longPortToShort, 'port', warnings))
      parts.push('-p', shellQuote(p));
    for (const vol of toMappingItems(service.volumes, longVolumeToShort, 'volume', warnings))
      parts.push('-v', shellQuote(vol));
    for (const env of toItems(service.environment)) parts.push('-e', shellQuote(env));
    for (const f of toItems(service.env_file)) parts.push('--env-file', shellQuote(f));

    if (service.network_mode) parts.push('--network', shellQuote(strOf(service.network_mode)));
    for (const net of toItems(service.networks)) parts.push('--network', shellQuote(net));
    for (const host of toItems(service.extra_hosts)) parts.push('--add-host', shellQuote(host));

    if (service.working_dir) parts.push('-w', shellQuote(strOf(service.working_dir)));
    if (service.user) parts.push('-u', shellQuote(strOf(service.user)));
    for (const cap of toItems(service.cap_add)) parts.push('--cap-add', shellQuote(cap));
    for (const cap of toItems(service.cap_drop)) parts.push('--cap-drop', shellQuote(cap));
    if (service.privileged === true) parts.push('--privileged');
    if (service.mem_limit) parts.push('-m', shellQuote(strOf(service.mem_limit)));
    if (service.cpus !== undefined && service.cpus !== null) {
      parts.push('--cpus', shellQuote(strOf(service.cpus)));
    }
    for (const label of toItems(service.labels)) parts.push('-l', shellQuote(label));
    if (service.stdin_open === true) parts.push('-i');
    if (service.tty === true) parts.push('-t');

    // Healthcheck → the common --health-* flags.
    if (isRecord(service.healthcheck)) {
      const hc = service.healthcheck as Record<string, unknown>;
      const test = hc.test;
      let cmd = '';
      if (Array.isArray(test)) {
        // ["CMD-SHELL", "curl …"] or ["CMD", "curl", "…"].
        const arr = test.map(strOf);
        cmd = arr[0] === 'CMD-SHELL' || arr[0] === 'CMD' ? arr.slice(1).join(' ') : arr.join(' ');
      } else if (typeof test === 'string') {
        cmd = test;
      }
      if (cmd) parts.push('--health-cmd', shellQuote(cmd));
      if (hc.interval) parts.push('--health-interval', shellQuote(strOf(hc.interval)));
      if (hc.timeout) parts.push('--health-timeout', shellQuote(strOf(hc.timeout)));
      if (hc.retries !== undefined) parts.push('--health-retries', shellQuote(strOf(hc.retries)));
      if (hc.start_period) parts.push('--health-start-period', shellQuote(strOf(hc.start_period)));
    }

    // Entrypoint override comes before the image. `docker run --entrypoint`
    // takes ONLY the executable, so an array entrypoint maps its first element
    // to --entrypoint and carries any remaining elements as leading command
    // tokens after the image (collected here, emitted with the command below).
    const entrypointArgs: string[] = [];
    if (service.entrypoint !== undefined && service.entrypoint !== null) {
      if (Array.isArray(service.entrypoint)) {
        const ep = service.entrypoint.map(strOf);
        if (ep.length > 0 && ep[0]) {
          parts.push('--entrypoint', shellQuote(ep[0]));
          for (const extra of ep.slice(1)) entrypointArgs.push(shellQuote(extra));
        }
      } else {
        const ep = strOf(service.entrypoint);
        if (ep) parts.push('--entrypoint', shellQuote(ep));
      }
    }

    // Compose-only keys → warnings.
    for (const [key, msg] of Object.entries(COMPOSE_ONLY_KEYS)) {
      if (key in service && service[key] !== undefined && service[key] !== null) {
        warnings.push(msg);
      }
    }

    const image = strOf(service.image);
    if (!image && !('build' in service)) {
      return {
        ok: false,
        warnings,
        error: 'The service has no `image:` — `docker run` needs an image to run.',
      };
    }
    if (image) parts.push(shellQuote(image));

    // Trailing entrypoint elements (from a multi-element entrypoint array) lead
    // the container command after the image.
    for (const arg of entrypointArgs) parts.push(arg);

    // Command after the image.
    if (service.command !== undefined && service.command !== null) {
      if (Array.isArray(service.command)) {
        for (const c of service.command) parts.push(shellQuote(strOf(c)));
      } else {
        // A string command is the SHELL form — a single shell line. Run it via
        // `sh -c '<line>'` and quote it as one argument so operators like `&&`
        // survive a round-trip instead of being re-tokenised by the parser.
        parts.push('sh', '-c', shellQuote(strOf(service.command)));
      }
    }

    return { ok: true, command: parts.join(' '), warnings };
  } catch (e) {
    return {
      ok: false,
      warnings,
      error: `Could not convert the service (${String(e)}).`,
    };
  }
}
