/**
 * mission-sim — PUBLIC façade.
 *
 * This is the only module a mission island imports (plus a mission config
 * from ./missions/). It fans out to the parser, the in-memory filesystem,
 * the command handlers and the objective checker.
 *
 * Everything is synchronous, deterministic, and NEVER throws on user input.
 * `runCommand` is a pure transition: it returns a NEW top-level state and
 * leaves the state it was given untouched.
 */
import type { MissionConfig, MissionEffect, MissionFsNode, MissionState, OutputLine, RunResult } from './types';
import { parseCommand } from './parser';
import { execute } from './commands';
import { checkObjectives } from './objectives';
import { readFile, writeFile } from './filesystem';

export { parseCommand } from './parser';
export { getNode, listDir, readFile, resolvePath } from './filesystem';
export type {
  MissionConfig,
  MissionEffect,
  MissionFsNode,
  MissionObjective,
  MissionProcess,
  MissionState,
  ObjectiveTrigger,
  OutputLine,
  ParsedCommand,
  ResponseMatch,
  RunResult,
  ScriptedCommand,
  ScriptedResponse,
} from './types';

/** Recursively clone a mission filesystem tree. */
function cloneFs(node: MissionFsNode): MissionFsNode {
  const copy: MissionFsNode = {};
  for (const [name, child] of Object.entries(node)) {
    copy[name] = typeof child === 'string' ? child : cloneFs(child);
  }
  return copy;
}

/** Boot a fresh mission run. The config's fs and process table are deep-cloned. */
export function createMission(config: MissionConfig): MissionState {
  return {
    config,
    cwd: '~',
    fs: cloneFs(config.filesystem),
    processes: config.processes.map((p) => ({ ...p })),
    objectivesDone: config.objectives.map(() => false),
    hintsUsed: 0,
    commandsRun: 0,
    startedAtMs: null,
    victory: false,
    flags: { ...(config.flags ?? {}) },
  };
}

/**
 * Apply a command's effect to a state, immutably, in a FIXED order:
 *   1. processes — remove pids, then add procs
 *   2. files — clone fs when writeFiles OR appendFiles present, overwrite, then
 *      append (`existing + '\n' + contents`, soft-failing like writeFile)
 *   3. flags — a fresh object ({ ...state.flags, ...setFlags }); never mutated
 *   4. cwd
 * Returns a new state; the input state is never touched. Never throws.
 */
export function applyEffect(state: MissionState, e: MissionEffect): MissionState {
  // 1. processes
  let processes = state.processes;
  if (e.removePids?.length || e.addProcs?.length) {
    const gone = new Set(e.removePids ?? []);
    processes = [
      ...state.processes.filter((p) => !gone.has(p.pid)),
      ...(e.addProcs ?? []).map((p) => ({ ...p })),
    ];
  }

  // 2. files — MUST clone for appendFiles too, or an append mutates prior state.
  let fs = state.fs;
  const hasWrite = e.writeFiles && Object.keys(e.writeFiles).length > 0;
  const hasAppend = e.appendFiles && Object.keys(e.appendFiles).length > 0;
  if (hasWrite || hasAppend) {
    fs = cloneFs(state.fs);
    for (const [path, contents] of Object.entries(e.writeFiles ?? {})) writeFile(fs, path, contents);
    for (const [path, contents] of Object.entries(e.appendFiles ?? {})) {
      writeFile(fs, path, (readFile(fs, path) ?? '') + '\n' + contents);
    }
  }

  // 3. flags — fresh object, never mutate state.flags.
  let flags = state.flags;
  if (e.setFlags && Object.keys(e.setFlags).length > 0) {
    flags = { ...(state.flags ?? {}), ...e.setFlags };
  }

  // 4. cwd
  const cwd = e.cwd ?? state.cwd;

  return { ...state, cwd, fs, processes, flags };
}

/**
 * Run one line of user input: parse → execute → apply effects immutably at
 * the top level → check objectives → append their success lines → compute
 * victory. The first OutputLine is always the echoed prompt + input.
 */
export function runCommand(state: MissionState, input: string): RunResult {
  const raw = typeof input === 'string' ? input : '';
  const prompt = `${state.config.promptUser}@${state.config.promptHost}:${state.cwd}$`;
  const echo: OutputLine = { text: `${prompt} ${raw.trim()}`.trimEnd(), kind: 'echo' };

  const parsed = parseCommand(raw);
  if (parsed === null) {
    // Empty input: echo only, no command counted.
    if (raw.trim() === '') {
      return { state, output: [echo], completed: [], victory: state.victory };
    }
    // Non-empty but unparseable: either a malformed pipe, or a degenerate
    // token like a lone quote that yields no command word.
    const next: MissionState = { ...state, commandsRun: state.commandsRun + 1 };
    const errText = raw.includes('|')
      ? "bash: syntax error near unexpected token `|'"
      : 'bash: syntax error near unexpected token';
    return {
      state: next,
      output: [echo, { text: errText, kind: 'err' }],
      completed: [],
      victory: next.victory,
    };
  }

  const { output: cmdOutput, effects } = execute(state, parsed);

  // Apply the effect immutably (procs → files → flags → cwd), then layer on the
  // engine-owned counters that no config effect can touch.
  const applied = applyEffect(state, effects);
  const next: MissionState = {
    ...applied,
    hintsUsed: state.hintsUsed + (effects.hintsUsedDelta ?? 0),
    commandsRun: state.commandsRun + 1,
    objectivesDone: [...state.objectivesDone],
  };

  const completed = checkObjectives(state, next, parsed, cmdOutput);
  const okLines: OutputLine[] = [];
  for (const id of completed) {
    const idx = state.config.objectives.findIndex((o) => o.id === id);
    if (idx === -1) continue;
    next.objectivesDone[idx] = true;
    okLines.push({ text: state.config.objectives[idx].successLine, kind: 'ok' });
  }
  next.victory =
    state.victory || (next.objectivesDone.length > 0 && next.objectivesDone.every(Boolean));

  return { state: next, output: [echo, ...cmdOutput, ...okLines], completed, victory: next.victory };
}

export interface MissionStats {
  commandsRun: number;
  hintsUsed: number;
}

/** Elapsed time is the island's concern (it owns startedAtMs). */
export function getStats(state: MissionState): MissionStats {
  return { commandsRun: state.commandsRun, hintsUsed: state.hintsUsed };
}

/** Post-victory rank. */
export function rankFor(stats: MissionStats, config: MissionConfig): string {
  if (stats.commandsRun <= config.optimalCommands && stats.hintsUsed === 0) return 'SRE material';
  if (stats.commandsRun <= config.optimalCommands + 4 || stats.hintsUsed <= 1) return 'Solid on-call';
  return 'Survived — that counts';
}
