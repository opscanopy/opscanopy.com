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

export interface ObjectiveTrigger {
  /** command name(s) that can complete this objective */
  cmd: string | string[];
  /** predicate on parsed args + engine state AFTER the command ran */
  when?: 'always' | { argIncludes: string } | { cwdIs: string } | { killedPid: number } | { outputMatched: string };
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
}

export type OutputLine = { text: string; kind: 'echo' | 'out' | 'err' | 'sys' | 'ok' | 'hint' };

export interface RunResult {
  state: MissionState;                   // new state (immutability at top level)
  output: OutputLine[];
  completed: number[];                   // objective ids completed by this command
  victory: boolean;
}
