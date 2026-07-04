# Mission-Sim Engine Spec — `src/lib/mission-sim/`

Pure TS, no DOM, never throws on user input. Mirrors the repo's multi-module-behind-façade pattern (`src/lib/github-actions-expression-tester/engine.ts`). Tests: Vitest node env, `src/lib/mission-sim/engine.test.ts` (+ `missions/week1-server-down.test.ts` for config validation). Island imports **only** `engine.ts` + the mission config module, dynamically, inside its boot closure.

## 1. Types (`types.ts`)

```ts
export interface MissionFsNode { [name: string]: MissionFsNode | string }
// string = file contents; object = directory. Root key is '~'.

export interface MissionProcess {
  pid: number; user: string; cpu: number; mem: number; command: string;
  /** optional STAT column note rendered by ps, e.g. 'crashed', 'restart-loop' */
  stat?: string;
  /** if killed, replacement rows can appear via onKill effects */
}

export type ParsedCommand = {
  cmd: string; args: string[]; flags: Set<string>;
  /** single pipe supported: `cat file | grep pattern` */
  pipeTo?: { cmd: string; args: string[]; flags: Set<string> };
};

export interface ObjectiveTrigger {
  /** command name(s) that can complete this objective (e.g. ['cat','grep'] for evidence-finding) */
  cmd: string | string[];
  /** predicate on parsed args + engine state AFTER the command ran; keep declarative helpers below */
  when?: 'always' | { argIncludes: string } | { cwdIs: string } | { killedPid: number } | { outputMatched: string };
}

export interface MissionObjective {
  id: number; text: string; trigger: ObjectiveTrigger;
  /** printed on completion, e.g. "✔ Objective 3 — you found the culprit." */
  successLine: string;
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
  /** state effects when the target pid dies (recovery mechanic) */
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
```

## 2. Module contracts

| Module | Exports | Notes |
|---|---|---|
| `parser.ts` | `parseCommand(input: string): ParsedCommand \| null` | trims; splits on whitespace; `-x`/`--xx` → flags; one `\|` split into `pipeTo`; null on empty. Quotes: simple double-quote grouping only. |
| `filesystem.ts` | `resolvePath(cwd, arg): string \| null`, `getNode(fs, path)`, `listDir`, `readFile`, `writeFile` | Handles `~`, `/`-rooted-as-`~`, `.`, `..`, trailing `/`. Never throws. |
| `commands.ts` | `execute(state, parsed): { output; effects }` | One handler per command. Realistic error strings (normalized `bash:` prefix, ` - ` separator for kill): `bash: foo: command not found`, `cat: x: No such file or directory`, `bash: cd: x: Not a directory`, `bash: kill: (999) - No such process`, `bash: kill: (1) - Operation not permitted`, `grep: x: No such file or directory`. `ls` plain (+`-l` tolerated → same list w/ fake perms). `ps` renders aux-style table (incl. `stat` note when set). `kill <pid>`: pid 1 → Operation not permitted; other live pids → removal with consequence line; target pid triggers `onKill` effects (effect lines auto-print). `help` lists supportedCommands with one-liners. `hint` returns next hint (kind:'hint'), increments `hintsUsed`. `clear` is island-side. Unsupported-but-real commands (e.g. `sudo`, `vim`) → in-fiction denial: `sudo: not available on this training box`. |
| `objectives.ts` | `checkObjectives(prev, next, parsed, output): number[]` | **Evaluates ALL pending objectives against every command — NO ordering constraint** (story order is display-only in the HUD). This is the anti-soft-lock rule: a kill-first speedrun must still complete every objective (`outputMatched` triggers can fire from ps/log output whenever they appear; `killedPid` diffs prev/next process tables). Multiple objectives may complete on one command. |
| `engine.ts` | `createMission(config): MissionState`, `runCommand(state, input): RunResult`, `getStats(state)`, `rankFor(stats, config)` | Façade only; deep-clones config fs; pipes: run left, feed its stdout lines as grep's input. Ranks: ≤ optimal & 0 hints → `SRE material`; ≤ optimal+4 or ≤1 hint → `Solid on-call`; else `Survived — that counts`. |

## 3. Week 1 mission — `missions/week1-server-down.ts`

Story: 02:00 AM, PagerDuty fires — checkout is down on prod-web-01. A runaway `backup-script.sh` (PID **4521**, 94% CPU) has starved the `node server.js` app (crashed, restart-looping). Player: orient → find evidence in `~/logs/server.log` → confirm via `ps` → `kill 4521` → verify recovery.

- **filesystem:** `~` → `app/` (`server.js` stub, `status` = `"CRASHED — waiting for CPU"`), `logs/` (`server.log` ≈15 lines: INFO noise, WARN memory, repeated `[ERROR] worker starved, blocked by pid 4521 (backup-script.sh)`, timestamps), `notes.txt` (onboarding flavor + nudge to check logs).
- **processes:** systemd(1), sshd(812), `node server.js` (2201, 0.0 cpu, status crashed), `backup-script.sh` (4521, 94.2), bash(5000).
- **onKill 4521:** remove 4521; add `node server.js` (2310, 2.1 cpu healthy); write `~/app/status` = `"OK — serving traffic"`.
- **objectives (5)** — unordered completion (see objectives.ts contract); HUD displays them in story order:
  1. Find where you are — `pwd` / `always`
  2. Look around — `ls` / `always`
  3. Find the evidence — `['cat','grep']` / `{ outputMatched: '4521' }` on server.log content
  4. Identify the culprit — `['ps','cat','grep']` / `{ outputMatched: 'backup-script' }` (fires from ps output OR the log line "(backup-script.sh)" — so a log-reader and a ps-runner both complete it, and it can't be stranded by an early kill)
  5. Kill it — `kill` / `{ killedPid: 4521 }` → success line: "The runaway process is dead. Watch the recovery roll in…" — the onKill effect lines auto-print the recovery (healthy node PID appears, `~/app/status` flips to OK). No further command is required for victory.
- **hints (4):** progressive: "Start by finding where you are (`pwd`) and what's here (`ls`)." → "Logs live in `~/logs`. `cat` the log — or `grep ERROR` it." → "The log names a PID. Cross-check with `ps`." → "`kill 4521` — then look at the process list again."
- **optimalCommands:** 7. **supportedCommands:** pwd, ls, cd, cat, grep, ps, kill, help, hint, clear.

**Config-validation test (`missions/week1-server-down.test.ts`):** every objective trigger `cmd` ∈ supportedCommands; every path mentioned in hints/story exists in fs; hints.length ≥ objectives.length − 1; onKill pids exist; the '4521' evidence string actually appears in `server.log`; **plus two scripted playthroughs must both reach victory: the intended 7-command path AND a kill-first speedrun (`pwd, ls, kill 4521, cat ~/logs/server.log, ps` order-scrambled) — the anti-soft-lock regression test.**

## 4. TDD order & commits (maps to PLAN T4–T9)

| Step | Red test → Green impl | Commit |
|---|---|---|
| 1 | parser vectors (§5) | `feat(mission-sim): command parser` |
| 2 | fs resolve/list/read vectors | `feat(mission-sim): virtual filesystem` |
| 3 | pwd/ls/cd/cat handlers | `feat(mission-sim): navigation commands` |
| 4 | grep (direct + piped), ps, kill (+onKill effects), help/hint | `feat(mission-sim): investigation commands` |
| 5 | objectives ordering + trigger kinds | `feat(mission-sim): objectives state machine` |
| 6 | façade: full scripted playthrough → victory, stats, rank; never-throws fuzz (20 garbage inputs) | `feat(mission-sim): engine façade` |
| 7 | week1 config + validation test | `feat(mission-sim): mission 1 — server down` |

## 5. Representative test vectors

```ts
parseCommand('grep ERROR server.log')        // {cmd:'grep', args:['ERROR','server.log']}
parseCommand('cat server.log | grep 4521')   // pipeTo:{cmd:'grep', args:['4521']}
parseCommand('ls -l')                        // flags: Set{'-l'}
parseCommand('  ')                           // null
resolvePath('~/logs', '..')                  // '~'
resolvePath('~', 'logs/server.log')          // '~/logs/server.log'
runCommand(s, 'cat nope.txt').output[1].text // 'cat: nope.txt: No such file or directory' (index 0 is the echo line)
runCommand(s, 'kill 4521') → completed includes 5; ps afterwards shows healthy node, no backup-script
runCommand(s, 'frobnicate') → 'bash: frobnicate: command not found'; state.commandsRun still increments
```

## 6. Island contract (`MissionTerminal.astro` — detail in UIUX-SPEC §4)

Props `{ missionId: string }`. Boot: `astro:page-load` + `DOMContentLoaded`, `dataset` re-init guard, then `const eng = await import('../../lib/mission-sim/engine'); const cfg = (await import(`../../lib/mission-sim/missions/${missionId}.ts`)) …` — Vite needs a literal map: use a `missionModules` record of `() => import(...)` thunks (one per live mission) so the graph stays static. All output through `escapeHtml`. Island owns: transcript array, history (↑/↓), clear, timer (startedAtMs), persistence of victory stats to `oc-m90-v1.missions[id]`.
