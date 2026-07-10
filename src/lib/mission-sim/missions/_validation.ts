/**
 * mission-sim/missions/_validation — shared config-integrity guards for
 * mission configs (the generic half of every mission's test suite).
 *
 * Pure module: no vitest, no DOM, no side effects. `validateMissionConfig`
 * returns human-readable violation strings — an empty array means the config
 * passes every guard — so mission tests assert:
 *
 *   expect(validateMissionConfig(config)).toEqual([]);
 *
 * and any failing guard prints its exact violation in the test diff.
 *
 * The guards encode the engine's REAL semantics (commands.ts dispatch,
 * objectives.ts triggers, engine.ts applyEffect) plus the shared authoring
 * rules in docs/plans/mission-90/ROUND2-PLAN.md. They are deliberately no
 * stricter than what the engine enforces at runtime — where a static check
 * cannot know run order, it flags only patterns that are a design bug in
 * every ordering.
 */
import { getNode } from '../engine';
import type { MissionConfig, MissionEffect, MissionObjective, ObjectiveTrigger } from '../engine';

/**
 * The FULL set of state-based objective `when` keys (objectives.ts evaluates
 * these on the RESULTING state, so they survive the "any err line completes
 * nothing" rule and any response-ordering surprises on mutating verbs).
 */
export const STATE_WHENS: readonly string[] = [
  'flagSet',
  'flagIs',
  'fileContains',
  'processStarted',
  'processGone',
];

/**
 * Built-in verbs the engine reserves — never shadowable by scripted commands.
 * Mirrors `RESERVED = new Set(Object.keys(HANDLERS))` in ../commands.ts, which
 * is not exported. KEEP IN SYNC with the HANDLERS table in ../commands.ts.
 */
export const RESERVED_BUILTINS: readonly string[] = [
  'pwd', 'ls', 'cd', 'cat', 'grep', 'ps', 'kill', 'help', 'hint', 'clear',
];

/* ── small pure helpers ───────────────────────────────────────────────────── */

type When = ObjectiveTrigger['when'];

const trigCmds = (obj: MissionObjective): string[] =>
  Array.isArray(obj.trigger.cmd) ? obj.trigger.cmd : [obj.trigger.cmd];

/** The single discriminating key of an object-form `when`; null for 'always'/undefined. */
const whenKey = (when: When): string | null =>
  when !== undefined && when !== 'always' ? (Object.keys(when)[0] ?? null) : null;

/** Effect keys that actually carry a value (an `{ writeFiles: undefined }` is empty). */
const effectKeys = (e: MissionEffect): string[] =>
  Object.entries(e)
    .filter(([, val]) => val !== undefined)
    .map(([k]) => k);

const isNonEmptyEffect = (e: MissionEffect | undefined): e is MissionEffect =>
  e !== undefined && effectKeys(e).length > 0;

/** '~/deploy/status' → '~/deploy'; '~/status' → '~'; bare names fall back to '~'. */
function parentDir(path: string): string {
  const stripped = path.replace(/\/+$/, '');
  const i = stripped.lastIndexOf('/');
  return i <= 0 ? '~' : stripped.slice(0, i) || '~';
}

/** Every authored effect, tagged with its source verb + a human-readable location. */
type SourcedEffect = { verb: string; where: string; effect: MissionEffect };

function collectEffects(config: MissionConfig): SourcedEffect[] {
  const effects: SourcedEffect[] = [];
  for (const [verb, sc] of Object.entries(config.commands ?? {})) {
    (sc.responses ?? []).forEach((r, i) => {
      if (isNonEmptyEffect(r.effect)) {
        effects.push({ verb, where: `commands.${verb}.responses[${i}]`, effect: r.effect });
      }
    });
    const d = sc.default;
    if (d && isNonEmptyEffect(d.effect)) {
      effects.push({ verb, where: `commands.${verb}.default`, effect: d.effect });
    }
  }
  // onKill rules are kill-owned effects (the kill handler applies them verbatim).
  (config.onKill ?? []).forEach((rule, i) => {
    const effect: MissionEffect = { removePids: rule.removeProcs };
    if (rule.addProcs) effect.addProcs = rule.addProcs;
    if (rule.writeFiles) effect.writeFiles = rule.writeFiles;
    effects.push({ verb: 'kill', where: `onKill[${i}] (pid ${rule.pid})`, effect });
  });
  return effects;
}

/* ── the validator ────────────────────────────────────────────────────────── */

/**
 * Validate a mission config against every generic authoring guard.
 * Returns human-readable violations; [] = valid. Pure, never throws.
 */
export function validateMissionConfig(config: MissionConfig): string[] {
  const v: string[] = [];
  const supported = new Set(config.supportedCommands);
  const commands = config.commands ?? {};
  const effects = collectEffects(config);

  // ── objective ids must be unique (engine looks success lines up by id) ────
  const seenIds = new Set<number>();
  for (const obj of config.objectives) {
    if (seenIds.has(obj.id)) v.push(`objective id ${obj.id} is duplicated — success-line lookup is by id`);
    seenIds.add(obj.id);
  }

  // ── G1: every objective trigger cmd is a supported command ────────────────
  for (const obj of config.objectives) {
    for (const cmd of trigCmds(obj)) {
      if (!supported.has(cmd)) {
        v.push(`objective ${obj.id}: trigger cmd '${cmd}' is not in supportedCommands`);
      }
    }
  }

  // ── G6: scripted keys ⊆ supportedCommands AND disjoint from RESERVED ──────
  for (const name of Object.keys(commands)) {
    if (!supported.has(name)) {
      v.push(`scripted command '${name}' is not in supportedCommands — it can never run (commands.ts denies it)`);
    }
    if (RESERVED_BUILTINS.includes(name)) {
      v.push(`scripted command '${name}' shadows a reserved built-in (RESERVED in commands.ts) — it is dead config`);
    }
  }

  // ── G7: every effect writeFiles/appendFiles path is actually writable ─────
  // writeFile soft-fails when the parent dir is missing or the target is a
  // directory — a silent no-op the narration would then lie about.
  for (const { where, effect } of effects) {
    const paths = [...Object.keys(effect.writeFiles ?? {}), ...Object.keys(effect.appendFiles ?? {})];
    for (const p of paths) {
      const parent = parentDir(p);
      const parentNode = getNode(config.filesystem, parent);
      if (parentNode === null || typeof parentNode === 'string') {
        v.push(`${where}: file path '${p}' has no parent directory '${parent}' in config.filesystem — the write would silently no-op`);
        continue;
      }
      const target = getNode(config.filesystem, p);
      if (target !== null && typeof target === 'object') {
        v.push(`${where}: file path '${p}' is a directory in config.filesystem — the write would silently no-op`);
      }
    }
  }

  // ── err + effect: an err line completes NO objectives (objectives.ts) ─────
  // so a response that mutates state while printing err mutates-but-credits-
  // nothing: a design bug in every ordering.
  for (const [verb, sc] of Object.entries(commands)) {
    (sc.responses ?? []).forEach((r, i) => {
      if (r.outKind === 'err' && isNonEmptyEffect(r.effect)) {
        v.push(`commands.${verb}.responses[${i}]: an 'err' response must not carry an effect (err completes no objectives)`);
      }
    });
    if (sc.default && sc.default.outKind === 'err' && isNonEmptyEffect(sc.default.effect)) {
      v.push(`commands.${verb}.default: an 'err' default must not carry an effect (err completes no objectives)`);
    }
  }

  // ── mutating-verb objectives must use a state-based `when` ────────────────
  // A mutating verb = any verb with an effect-bearing response/default, plus
  // `kill` when onKill exists. Output/arg matching on such a verb can credit a
  // non-mutating response (or miss the mutation entirely); only state-based
  // whens are ordering-proof. `killedPid` is exempt: objectives.ts evaluates
  // it as a prev→next process diff, i.e. it IS state-based in the engine.
  const mutatingVerbs = new Set(effects.map((e) => e.verb));
  for (const obj of config.objectives) {
    const cmds = trigCmds(obj);
    const mutating = cmds.filter((c) => mutatingVerbs.has(c));
    if (mutating.length === 0) continue;
    const key = whenKey(obj.trigger.when);
    if (key === 'killedPid') continue;
    if (key === null || !STATE_WHENS.includes(key)) {
      v.push(
        `objective ${obj.id}: triggered by mutating verb(s) [${mutating.join(', ')}] but 'when' (${key ?? String(obj.trigger.when)}) ` +
          `is not state-based — use one of ${STATE_WHENS.join('/')}`,
      );
    }
  }

  // ── G8: no writeFiles over an evidence path (appendFiles is allowed) ──────
  // Evidence = any path an objective's `fileContains` when reads, any path an
  // objective's `argIncludes` when names, and any path a response's
  // `match.fileContains` precondition reads. Overwriting one can strand a
  // pending objective (or soft-lock the fix response) — append instead.
  const evidencePaths = new Set<string>();
  for (const obj of config.objectives) {
    const when = obj.trigger.when;
    if (when !== undefined && when !== 'always') {
      if ('fileContains' in when) evidencePaths.add(when.fileContains.path);
      if ('argIncludes' in when) evidencePaths.add(when.argIncludes);
    }
  }
  for (const sc of Object.values(commands)) {
    for (const r of sc.responses ?? []) {
      if (r.match?.fileContains) evidencePaths.add(r.match.fileContains.path);
    }
  }
  for (const { where, effect } of effects) {
    for (const p of Object.keys(effect.writeFiles ?? {})) {
      if (evidencePaths.has(p)) {
        v.push(`${where}: writeFiles '${p}' overwrites objective/response evidence — use appendFiles`);
      }
    }
  }

  // ── G8b: removePids must not strand a process-dependent objective ─────────
  const startedNeedles = config.objectives.flatMap((o) => {
    const when = o.trigger.when;
    return when !== undefined && when !== 'always' && 'processStarted' in when ? [when.processStarted] : [];
  });
  const goneObjs = config.objectives.flatMap((o) => {
    const when = o.trigger.when;
    return when !== undefined && when !== 'always' && 'processGone' in when
      ? [{ id: o.id, needle: when.processGone, cmds: trigCmds(o) }]
      : [];
  });
  const presentNeedles: Array<{ needle: string; verb: string }> = [];
  for (const [verb, sc] of Object.entries(commands)) {
    for (const r of sc.responses ?? []) {
      if (r.match?.processPresent !== undefined) presentNeedles.push({ needle: r.match.processPresent, verb });
    }
  }
  /** Command strings a pid can carry: initial table + every addProcs anywhere. */
  const commandsForPid = (pid: number): string[] => {
    const cmds = config.processes.filter((p) => p.pid === pid).map((p) => p.command);
    for (const { effect } of effects) {
      for (const p of effect.addProcs ?? []) if (p.pid === pid) cmds.push(p.command);
    }
    return cmds;
  };
  for (const { verb, where, effect } of effects) {
    const removed = effect.removePids ?? [];
    if (removed.length === 0) continue;
    const readds = (effect.addProcs ?? []).map((p) => p.command);
    for (const pid of removed) {
      for (const cmd of commandsForPid(pid)) {
        for (const n of startedNeedles) {
          // remove+re-add of the same needle in ONE effect is the legitimate
          // restart pattern — that transition is what fires processStarted.
          if (cmd.includes(n) && !readds.some((c) => c.includes(n))) {
            v.push(`${where}: removePids ${pid} ('${cmd}') removes a process a processStarted('${n}') objective is waiting on, without re-adding one`);
          }
        }
        for (const pn of presentNeedles) {
          // Own-verb removal is the idempotent stop/fix pattern; only a
          // DIFFERENT verb destroying the precondition is a bug in every order.
          if (pn.verb !== verb && cmd.includes(pn.needle)) {
            v.push(`${where}: removePids ${pid} ('${cmd}') destroys the processPresent('${pn.needle}') precondition of scripted verb '${pn.verb}'`);
          }
        }
        for (const g of goneObjs) {
          // Removal by a verb outside the objective's trigger set makes the
          // process gone with no crediting transition left — a soft-lock.
          if (cmd.includes(g.needle) && !g.cmds.includes(verb)) {
            v.push(`${where}: removePids ${pid} ('${cmd}') makes processGone('${g.needle}') objective ${g.id} un-completable (removed outside its trigger verbs)`);
          }
        }
      }
    }
  }

  // ── G9: processStarted targets must not already be present-and-running ────
  // objectives.ts requires a NOT-running → running transition; a target that
  // is already running (stat !== 'crashed') at boot can never transition.
  for (const obj of config.objectives) {
    const when = obj.trigger.when;
    if (when !== undefined && when !== 'always' && 'processStarted' in when) {
      const needle = when.processStarted;
      const running = config.processes.some((p) => p.command.includes(needle) && p.stat !== 'crashed');
      if (running) {
        v.push(`objective ${obj.id}: processStarted('${needle}') target is already present-and-running in the initial process table`);
      }
    }
  }

  // ── hints + story shape ────────────────────────────────────────────────────
  if (config.hints.length < config.objectives.length - 1) {
    v.push(`hints: ${config.hints.length} hint(s) for ${config.objectives.length} objectives — need at least objectives − 1`);
  }
  // Every ~-rooted path mentioned in hints/story must resolve. The final
  // character class excludes '.', so a sentence-ending period after a bare
  // path is not swallowed into the match.
  const text = [...config.hints, ...config.story].join(' ');
  const mentioned = new Set(text.match(/~\/[A-Za-z0-9._/-]*[A-Za-z0-9_/-]/g) ?? []);
  for (const path of mentioned) {
    if (getNode(config.filesystem, path) === null) {
      v.push(`hints/story: path '${path}' does not exist in config.filesystem`);
    }
  }
  if (config.story.length < 2) {
    v.push(`story: only ${config.story.length} paragraph(s) — a briefing needs at least 2`);
  }
  if (!(config.story.at(-1) ?? '').includes('help')) {
    v.push("story: the last paragraph must point the player at 'help'");
  }

  // ── flags referenced by matches/triggers must be seeded in config.flags ───
  const seeded = new Set(Object.keys(config.flags ?? {}));
  for (const [verb, sc] of Object.entries(commands)) {
    (sc.responses ?? []).forEach((r, i) => {
      const name = r.match?.flag?.name;
      if (name !== undefined && !seeded.has(name)) {
        v.push(`commands.${verb}.responses[${i}]: match.flag '${name}' is not seeded in config.flags`);
      }
    });
  }
  for (const obj of config.objectives) {
    const when = obj.trigger.when;
    if (when === undefined || when === 'always') continue;
    if ('flagSet' in when && !seeded.has(when.flagSet)) {
      v.push(`objective ${obj.id}: flagSet '${when.flagSet}' is not seeded in config.flags`);
    }
    if ('flagIs' in when && !seeded.has(when.flagIs.name)) {
      v.push(`objective ${obj.id}: flagIs '${when.flagIs.name}' is not seeded in config.flags`);
    }
  }

  return v;
}

export default validateMissionConfig;
