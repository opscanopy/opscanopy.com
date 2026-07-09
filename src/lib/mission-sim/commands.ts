/**
 * mission-sim/commands — one handler per supported command.
 *
 * `execute` never mutates the state it is given: every handler returns output
 * lines plus a CommandEffects describing what should change. The engine façade
 * applies those effects to produce the next immutable state.
 *
 * Error strings mimic real bash/coreutils output so the terminal feels honest.
 * Nothing here throws on user input.
 */
import type {
  MissionEffect,
  MissionFsNode,
  MissionState,
  OutputLine,
  ParsedCommand,
  ResponseMatch,
} from './types';
import { getNode, listDir, readFile, resolvePath } from './filesystem';

/**
 * What a command wants changed. The façade applies these to build the next
 * state. Extends the config-facing MissionEffect with the engine-only
 * hint counter (which no config can set).
 */
export interface CommandEffects extends MissionEffect {
  hintsUsedDelta?: number;
}

export interface ExecuteResult {
  output: OutputLine[];
  effects: CommandEffects;
}

type Segment = { cmd: string; args: string[]; flags: Set<string> };
/** stdin is non-null only when the command is the right side of a pipe. */
type Handler = (state: MissionState, seg: Segment, stdin: string[] | null) => ExecuteResult;

const out = (text: string): OutputLine => ({ text, kind: 'out' });
const err = (text: string): OutputLine => ({ text, kind: 'err' });
const sys = (text: string): OutputLine => ({ text, kind: 'sys' });

const fail = (text: string): ExecuteResult => ({ output: [err(text)], effects: {} });

/* ── handlers ─────────────────────────────────────────────────────────────── */

const pwd: Handler = (state) => ({ output: [out(state.cwd)], effects: {} });

function longLine(user: string, name: string, node: MissionFsNode | string): string {
  const isDir = typeof node !== 'string';
  const perms = isDir ? 'drwxr-xr-x' : '-rw-r--r--';
  const size = isDir ? 4096 : node.length;
  return `${perms} 1 ${user} ${user} ${String(size).padStart(6)} Feb  3 01:58 ${name}${isDir ? '/' : ''}`;
}

const ls: Handler = (state, seg) => {
  const target = seg.args[0] ?? '.';
  const path = resolvePath(state.cwd, target);
  const node = path === null ? null : getNode(state.fs, path);
  if (node === null) return fail(`ls: cannot access '${target}': No such file or directory`);
  const user = state.config.promptUser;
  if (typeof node === 'string') {
    return { output: [out(seg.flags.has('-l') ? longLine(user, target, node) : target)], effects: {} };
  }
  const names = (listDir(state.fs, path!) ?? []).slice().sort();
  const lines = names.map((name) => {
    const child = node[name];
    if (seg.flags.has('-l')) return longLine(user, name, child);
    return typeof child === 'string' ? name : `${name}/`;
  });
  return { output: lines.map(out), effects: {} };
};

const cd: Handler = (state, seg) => {
  const target = seg.args[0] ?? '~';
  const path = resolvePath(state.cwd, target);
  const node = path === null ? null : getNode(state.fs, path);
  if (node === null) return fail(`bash: cd: ${target}: No such file or directory`);
  if (typeof node === 'string') return fail(`bash: cd: ${target}: Not a directory`);
  return { output: [], effects: { cwd: path! } };
};

const cat: Handler = (state, seg) => {
  if (seg.args.length === 0) return fail('cat: missing file operand');
  const output: OutputLine[] = [];
  for (const arg of seg.args) {
    const path = resolvePath(state.cwd, arg);
    const node = path === null ? null : getNode(state.fs, path);
    if (node === null) output.push(err(`cat: ${arg}: No such file or directory`));
    else if (typeof node !== 'string') output.push(err(`cat: ${arg}: Is a directory`));
    else for (const line of node.split('\n')) output.push(out(line));
  }
  return { output, effects: {} };
};

const GREP_USAGE = 'usage: grep <pattern> <file>   (or: cat <file> | grep <pattern>)';

const grep: Handler = (state, seg, stdin) => {
  const pattern = seg.args[0];
  if (pattern === undefined) return fail(GREP_USAGE);
  const ci = seg.flags.has('-i');
  const needle = ci ? pattern.toLowerCase() : pattern;
  const matches = (line: string) => (ci ? line.toLowerCase() : line).includes(needle);

  let lines: string[];
  if (stdin !== null) {
    lines = stdin;
  } else {
    const file = seg.args[1];
    if (file === undefined) return fail(GREP_USAGE);
    const path = resolvePath(state.cwd, file);
    const node = path === null ? null : getNode(state.fs, path);
    if (node === null) return fail(`grep: ${file}: No such file or directory`);
    if (typeof node !== 'string') return fail(`grep: ${file}: Is a directory`);
    lines = node.split('\n');
  }
  return { output: lines.filter(matches).map(out), effects: {} };
};

const ps: Handler = (state) => {
  const row = (user: string, pid: string, cpu: string, mem: string, stat: string, command: string) =>
    `${user.padEnd(8)} ${pid.padStart(5)} ${cpu.padStart(4)} ${mem.padStart(4)} ${stat.padEnd(12)} ${command}`;
  const lines = [row('USER', 'PID', '%CPU', '%MEM', 'STAT', 'COMMAND')];
  for (const p of state.processes) {
    lines.push(row(p.user, String(p.pid), p.cpu.toFixed(1), p.mem.toFixed(1), p.stat ?? 'S', p.command));
  }
  return { output: lines.map(out), effects: {} };
};

/** First line of possibly-multiline file contents, for one-line sys notices. */
function firstLine(contents: string): string {
  const nl = contents.indexOf('\n');
  return nl === -1 ? contents : `${contents.slice(0, nl)}…`;
}

const kill: Handler = (state, seg) => {
  const arg = seg.args[0];
  if (arg === undefined) return fail('usage: kill <pid>');
  if (!/^\d+$/.test(arg)) return fail(`bash: kill: ${arg}: arguments must be process or job IDs`);
  const pid = Number(arg);
  if (pid === 1) return fail('bash: kill: (1) - Operation not permitted');
  const proc = state.processes.find((p) => p.pid === pid);
  if (!proc) return fail(`bash: kill: (${pid}) - No such process`);

  const rule = state.config.onKill?.find((e) => e.pid === pid);
  if (rule) {
    // Target pid: apply the mission's scripted consequences and NARRATE them —
    // the recovery must be visible without the player running another command.
    const output: OutputLine[] = [sys(`Process ${pid} (${proc.command}) terminated.`)];
    for (const np of rule.addProcs ?? []) {
      output.push(sys(`New process appeared: ${np.command} (pid ${np.pid}) — running.`));
    }
    for (const [path, contents] of Object.entries(rule.writeFiles ?? {})) {
      output.push(sys(`${path} now reads: ${firstLine(contents)}`));
    }
    return {
      output,
      effects: {
        removePids: [...rule.removeProcs],
        addProcs: rule.addProcs?.map((p) => ({ ...p })),
        writeFiles: rule.writeFiles ? { ...rule.writeFiles } : undefined,
      },
    };
  }

  // A live process that is not the scripted target: it dies, nothing improves.
  return {
    output: [
      sys(`Process ${pid} (${proc.command}) terminated.`),
      sys('The pager is still screaming — that was not the culprit.'),
    ],
    effects: { removePids: [pid] },
  };
};

const ONE_LINERS: Record<string, string> = {
  pwd: 'print the current directory',
  ls: 'list files here (ls -l for details)',
  cd: 'change directory (cd <dir>, cd ..)',
  cat: 'print a file (cat <file>)',
  grep: 'search text (grep <pattern> <file>, or cat <file> | grep <pattern>)',
  ps: 'show running processes',
  kill: 'terminate a process (kill <pid>)',
  help: 'show this list',
  hint: 'get a nudge when stuck (counts against your rank)',
  clear: 'clear the screen',
};

const help: Handler = (state) => ({
  // Iterate supportedCommands (never Object.keys(config.commands)) so the list
  // length stays === supportedCommands.length; only the LOOKUP consults a
  // scripted verb's oneLiner before falling back to the built-in table.
  output: state.config.supportedCommands.map((c) =>
    out(`${c.padEnd(6)} — ${state.config.commands?.[c]?.oneLiner ?? ONE_LINERS[c] ?? ''}`),
  ),
  effects: {},
});

const hint: Handler = (state) => {
  const next = state.config.hints[state.hintsUsed];
  if (next === undefined) {
    return {
      output: [{ text: 'No hints left — you already have everything you need. Re-read that log.', kind: 'hint' }],
      effects: {},
    };
  }
  return { output: [{ text: next, kind: 'hint' }], effects: { hintsUsedDelta: 1 } };
};

/** `clear` is handled by the island (it owns the screen); the engine treats it as a no-op. */
const clear: Handler = () => ({ output: [], effects: {} });

const HANDLERS: Record<string, Handler> = { pwd, ls, cd, cat, grep, ps, kill, help, hint, clear };

/** Built-in verbs are never shadowable by a mission's scripted commands. */
const RESERVED = new Set(Object.keys(HANDLERS));

/* ── unsupported-but-real commands → in-fiction denials ───────────────────── */

/** null = default "not available on this training box" line. */
const DENIALS: Record<string, string | null> = {
  sudo: 'sudo: not available on this training box',
  vim: null, vi: null, nano: null, emacs: null,
  top: 'top: not available here — ps has what you need',
  htop: 'htop: not available here — ps has what you need',
  less: null, more: null, man: null, tail: null, head: null,
  echo: null, touch: null, mkdir: null, rm: null, mv: null, cp: null, rmdir: null,
  chmod: null, chown: null, find: null, sed: null, awk: null, xargs: null,
  ssh: null, scp: null, curl: null, wget: null, ping: null, dig: null, netstat: null, ss: null,
  systemctl: null, service: null, journalctl: null, dmesg: null, strace: null,
  docker: null, kubectl: null, apt: null, 'apt-get': null, yum: null, dnf: null,
  npm: null, node: null, python: null, python3: null, git: null, make: null,
  whoami: null, uname: null, df: null, du: null, free: null, uptime: null, history: null,
  reboot: 'reboot: nice try — fix the process, not the whole box',
  shutdown: 'shutdown: nice try — fix the process, not the whole box',
  exit: 'exit: no escape until checkout is back up',
  logout: 'logout: no escape until checkout is back up',
};

/* ── scripted commands (config-authored verbs) ────────────────────────────── */

/**
 * Does a scripted response's match hold for the CURRENT state + segment?
 * Every present field must hold (AND); an omitted field matches anything.
 * Read defensively (state.flags may be undefined) — pure, never throws.
 */
function matchesResponse(match: ResponseMatch | undefined, state: MissionState, seg: Segment): boolean {
  if (!match) return true;
  const flags = state.flags ?? {};

  if (match.args) {
    for (const a of match.args) if (!seg.args.includes(a)) return false;
  }
  if (match.argIncludes !== undefined) {
    if (!seg.args.join(' ').includes(match.argIncludes)) return false;
  }
  if (match.flags) {
    for (const f of match.flags) if (!seg.flags.has(f)) return false;
  }
  if (match.cwdIs !== undefined) {
    if (state.cwd !== match.cwdIs) return false;
  }
  if (match.flag) {
    const want = match.flag.equals ?? true;
    if (flags[match.flag.name] !== want) return false;
  }
  if (match.fileContains) {
    const contents = readFile(state.fs, match.fileContains.path);
    if (contents === null || !contents.includes(match.fileContains.text)) return false;
  }
  if (match.processPresent !== undefined) {
    if (!state.processes.some((p) => p.command.includes(match.processPresent!))) return false;
  }
  if (match.processAbsent !== undefined) {
    if (state.processes.some((p) => p.command.includes(match.processAbsent!))) return false;
  }
  return true;
}

function toLines(texts: string[], kind: OutputLine['kind']): OutputLine[] {
  return texts.map((text) => ({ text, kind }));
}

/**
 * Run a config-authored verb: the first response whose match holds wins;
 * else the `default` block; else a generic non-empty diagnostic line so the
 * terminal is never silent. Effects flow straight through to the façade.
 */
function runScripted(state: MissionState, cmd: string, seg: Segment): ExecuteResult {
  const sc = state.config.commands![cmd];
  for (const resp of sc.responses ?? []) {
    if (matchesResponse(resp.match, state, seg)) {
      return { output: toLines(resp.output, resp.outKind ?? 'out'), effects: resp.effect ?? {} };
    }
  }
  if (sc.default) {
    return { output: toLines(sc.default.output, sc.default.outKind ?? 'out'), effects: sc.default.effect ?? {} };
  }
  return { output: [out(`${cmd}: no output`)], effects: {} };
}

/* ── dispatch ─────────────────────────────────────────────────────────────── */

const deny = (cmd: string): ExecuteResult =>
  fail(DENIALS[cmd] ?? `${cmd}: not available on this training box`);

function runSegment(state: MissionState, seg: Segment, stdin: string[] | null): ExecuteResult {
  const supported = state.config.supportedCommands.includes(seg.cmd);

  // 1. Built-ins are reserved: run when supported, else deny. Never shadowable.
  if (RESERVED.has(seg.cmd)) {
    if (supported) return HANDLERS[seg.cmd](state, seg, stdin);
    return deny(seg.cmd);
  }

  // 2. A scripted + supported verb wins — even over a DENIAL entry (this is how
  //    a mission enables chmod/docker/kubectl/dig/terraform/aws/git).
  const scripted = state.config.commands?.[seg.cmd];
  if (scripted && supported) return runScripted(state, seg.cmd, seg);

  // 3. A real-but-unavailable command, or a scripted verb the mission did NOT
  //    put in supportedCommands, denies in fiction.
  if (seg.cmd in DENIALS || scripted) return deny(seg.cmd);

  // 4. Anything else does not exist.
  return fail(`bash: ${seg.cmd}: command not found`);
}

function mergeEffects(a: CommandEffects, b: CommandEffects): CommandEffects {
  const merged: CommandEffects = { ...a };
  if (b.cwd !== undefined) merged.cwd = b.cwd;
  if (b.removePids) merged.removePids = [...(merged.removePids ?? []), ...b.removePids];
  if (b.addProcs) merged.addProcs = [...(merged.addProcs ?? []), ...b.addProcs];
  if (b.writeFiles) merged.writeFiles = { ...(merged.writeFiles ?? {}), ...b.writeFiles };
  if (b.appendFiles) merged.appendFiles = { ...(merged.appendFiles ?? {}), ...b.appendFiles };
  if (b.setFlags) merged.setFlags = { ...(merged.setFlags ?? {}), ...b.setFlags };
  if (b.hintsUsedDelta) merged.hintsUsedDelta = (merged.hintsUsedDelta ?? 0) + b.hintsUsedDelta;
  return merged;
}

/**
 * Run one parsed command (optionally piped into grep) against the state.
 * Pure: returns output + effects, never mutates, never throws.
 */
export function execute(state: MissionState, parsed: ParsedCommand): ExecuteResult {
  const left = runSegment(state, parsed, null);
  if (!parsed.pipeTo) return left;

  // Single pipe. Only grep can consume stdin on this training box.
  if (parsed.pipeTo.cmd !== 'grep') {
    // Rejected pipe is a TRUE no-op. We drop the left segment's effects (so
    // `kill 4521 | ls` never mutates state, which would otherwise soft-lock a
    // one-shot objective) AND its narration: keep only genuine `err` lines, not
    // the `out`/`sys`/`ok`/`hint` lines. Otherwise the left command's "it
    // happened" story leaks — e.g. kill's `sys` recovery lines would narrate a
    // recovery that never occurred, and `hint | ls` would reveal a hint while
    // the dropped `hintsUsedDelta` leaves rank undocked. Show only the rejection.
    return {
      output: [
        ...left.output.filter((l) => l.kind === 'err'),
        err(`bash: ${parsed.pipeTo.cmd}: can only pipe into grep on this training box`),
      ],
      effects: {},
    };
  }
  const stdinLines = left.output.filter((l) => l.kind === 'out').map((l) => l.text);
  const right = runSegment(state, parsed.pipeTo, stdinLines);
  return {
    output: [...left.output.filter((l) => l.kind !== 'out'), ...right.output],
    effects: mergeEffects(left.effects, right.effects),
  };
}
