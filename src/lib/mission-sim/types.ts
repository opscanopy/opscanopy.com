/**
 * mission-sim — shared types for the browser terminal mission simulator.
 *
 * Pure data shapes, no logic. Everything downstream (parser, filesystem,
 * commands, objectives, engine façade) speaks in these types. Nothing here —
 * or anywhere in mission-sim — ever throws on user input.
 */

export interface MissionFsNode { [name: string]: MissionFsNode | string }
// string = file contents; object = directory. Root key is '~'.

export interface MissionProcess {
  pid: number; user: string; cpu: number; mem: number; command: string;
  /** optional STAT column note rendered by ps, e.g. 'crashed', 'restart-loop' */
  stat?: string;
}

export type ParsedCommand = {
  cmd: string; args: string[]; flags: Set<string>;
  /** single pipe supported: `cat file | grep pattern` */
  pipeTo?: { cmd: string; args: string[]; flags: Set<string> };
};

/**
 * ── Scripted commands (config-authored, per-verb, state-dependent) ──────────
 *
 * A mission may enable extra command verbs (`chmod`, `git`, `crontab`, `dig`…)
 * purely from config, with zero domain logic in the engine. Each verb owns an
 * ordered list of responses; the first whose `match` holds produces its output
 * (and optional immutable effect). No response matched → `default` → a generic
 * diagnostic line. Everything is read defensively and never throws.
 */
export interface ResponseMatch {
  /** every token must appear among the segment's parsed args */
  args?: string[];
  /** substring of the space-joined args */
  argIncludes?: string;
  /** every flag must be present in the segment's flag set */
  flags?: string[];
  /** the current working directory equals this */
  cwdIs?: string;
  /** a mission state flag equals a value (default: true) */
  flag?: { name: string; equals?: string | boolean };
  /** a file's contents include this text */
  fileContains?: { path: string; text: string };
  /** some process whose command contains this exists */
  processPresent?: string;
  /** no process whose command contains this exists */
  processAbsent?: string;
}

/** Config-facing effect, applied immutably by the engine in a fixed order. */
export interface MissionEffect {
  cwd?: string;
  removePids?: number[];
  addProcs?: MissionProcess[];
  /** overwrite file contents */
  writeFiles?: Record<string, string>;
  /** append (newline-joined) to existing contents — evidence-preserving */
  appendFiles?: Record<string, string>;
  /** set mission state flags */
  setFlags?: Record<string, string | boolean>;
}

export interface ScriptedResponse {
  match?: ResponseMatch;
  output: string[];
  outKind?: OutputLine['kind'];
  effect?: MissionEffect;
}

export interface ScriptedCommand {
  /** one-liner shown by `help` for this verb */
  oneLiner: string;
  responses?: ScriptedResponse[];
  default?: { output: string[]; outKind?: OutputLine['kind']; effect?: MissionEffect };
}

export interface ObjectiveTrigger {
  /** command name(s) that can complete this objective */
  cmd: string | string[];
  /** predicate on parsed args + engine state AFTER the command ran */
  when?:
    | 'always'
    | { argIncludes: string }
    | { cwdIs: string }
    | { killedPid: number }
    | { outputMatched: string }
    // ── state-based variants, evaluated on the RESULTING (next) state ──
    | { flagSet: string }
    | { flagIs: { name: string; value: string | boolean } }
    | { fileContains: { path: string; text: string } }
    | { processStarted: string }
    | { processGone: string };
}

export interface MissionObjective {
  id: number; text: string; trigger: ObjectiveTrigger;
  successLine: string;   // printed on completion
}

export interface MissionConfig {
  id: string; title: string; week: number;   // id doubles as the route param + config module name; no separate slug
  story: string[];            // briefing paragraphs printed at boot
  promptHost: string;         // 'prod-web-01'
  promptUser: string;         // 'student'
  unlockAfterDay: number;
  filesystem: MissionFsNode;  // rooted at '~'
  processes: MissionProcess[];
  supportedCommands: string[];
  objectives: MissionObjective[];
  hints: string[];            // progressive
  optimalCommands: number;    // for rank calc
  onKill?: { pid: number; removeProcs: number[]; addProcs?: MissionProcess[]; writeFiles?: Record<string, string> }[];
  /** config-authored extra command verbs (must be in supportedCommands to run) */
  commands?: Record<string, ScriptedCommand>;
  /** initial mission state flags */
  flags?: Record<string, string | boolean>;
}

export interface MissionState {
  config: MissionConfig;
  cwd: string;                          // absolute-with-~ form, e.g. '~/logs'
  fs: MissionFsNode;                    // deep-cloned per run
  processes: MissionProcess[];
  objectivesDone: boolean[];
  hintsUsed: number;
  commandsRun: number;
  startedAtMs: number | null;           // island sets; engine treats as opaque
  victory: boolean;
  /** mission state flags, seeded from config.flags; set by scripted effects */
  flags?: Record<string, string | boolean>;
}

export type OutputLine = { text: string; kind: 'echo' | 'out' | 'err' | 'sys' | 'ok' | 'hint' };

export interface RunResult {
  state: MissionState;                   // new state (immutability at top level)
  output: OutputLine[];
  completed: number[];                   // objective ids completed by this command
  victory: boolean;
}
