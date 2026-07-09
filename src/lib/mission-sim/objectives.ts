/**
 * mission-sim/objectives — decide which pending objectives a command completed.
 *
 * THE ANTI-SOFT-LOCK RULE: every pending objective is evaluated against every
 * command — there is NO ordering constraint. Story order is display-only in
 * the HUD. A player who kills the culprit first must still be able to complete
 * "find the evidence" afterwards by reading the log.
 */
import type { MissionState, ObjectiveTrigger, OutputLine, ParsedCommand } from './types';
import { resolvePath } from './filesystem';

/**
 * Return the ids of every pending objective completed by this command.
 * `prev` is the state before the command, `next` after effects were applied,
 * `output` is the command's produced output (echo line excluded by the engine;
 * ignored here anyway — only 'out' and 'sys' lines count as command output).
 *
 * A command that produced any 'err' line completes nothing.
 */
export function checkObjectives(
  prev: MissionState,
  next: MissionState,
  parsed: ParsedCommand,
  output: OutputLine[],
): number[] {
  const completed: number[] = [];
  if (output.some((l) => l.kind === 'err')) return completed;

  // For piped commands both the left and right command names count as run.
  const ranCmds = [parsed.cmd, ...(parsed.pipeTo ? [parsed.pipeTo.cmd] : [])];

  prev.config.objectives.forEach((obj, i) => {
    if (prev.objectivesDone[i]) return;
    const trigCmds = Array.isArray(obj.trigger.cmd) ? obj.trigger.cmd : [obj.trigger.cmd];
    if (!ranCmds.some((c) => trigCmds.includes(c))) return;
    if (matchesWhen(obj.trigger.when, prev, next, parsed, output)) completed.push(obj.id);
  });
  return completed;
}

function matchesWhen(
  when: ObjectiveTrigger['when'],
  prev: MissionState,
  next: MissionState,
  parsed: ParsedCommand,
  output: OutputLine[],
): boolean {
  if (when === undefined || when === 'always') return true;

  if ('argIncludes' in when) {
    const target = when.argIncludes;
    const args = [...parsed.args, ...(parsed.pipeTo?.args ?? [])];
    return args.some((a) => {
      if (a.includes(target)) return true;
      const resolved = resolvePath(prev.cwd, a);
      return resolved !== null && resolved.includes(target);
    });
  }

  if ('cwdIs' in when) return next.cwd === when.cwdIs;

  if ('killedPid' in when) {
    const pid = when.killedPid;
    return prev.processes.some((p) => p.pid === pid) && !next.processes.some((p) => p.pid === pid);
  }

  if ('outputMatched' in when) {
    return output.some((l) => (l.kind === 'out' || l.kind === 'sys') && l.text.includes(when.outputMatched));
  }

  return false;
}
