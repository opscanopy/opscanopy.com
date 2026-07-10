/**
 * Config-validation + playthrough tests for the Week 11 mission
 * ("Kubernetes Chaos"), a config-only Secret restore: the fix is a SCRIPTED
 * `kubectl create secret generic db-credentials …` whose effect flips a flag,
 * appends a Normal Started line to the (evidence-preserving) events log, and
 * writes a status marker — zero domain logic in the engine. The live-query
 * diagnostics (get pods / describe pod / get events) are gated on the pre-fix
 * flag so they never lie once the Secret is back.
 *
 * ISLAND CONTRACT: imports ONLY the engine façade, the mission config, and the
 * shared config validator (test-only shared tooling, not island code).
 */
import { describe, it, expect } from 'vitest';
import { createMission, runCommand, getStats, rankFor, readFile } from '../engine';
import type { MissionEffect, MissionState, RunResult } from '../engine';
import { validateMissionConfig } from './_validation';
import { week11KubernetesChaos } from './week11-kubernetes-chaos';

const config = week11KubernetesChaos;

/** Every effect authored anywhere in config.commands (responses + defaults). */
function allEffects(): MissionEffect[] {
  const effects: MissionEffect[] = [];
  for (const sc of Object.values(config.commands ?? {})) {
    for (const r of sc.responses ?? []) if (r.effect) effects.push(r.effect);
    if (sc.default?.effect) effects.push(sc.default.effect);
  }
  return effects;
}

describe('week11-kubernetes-chaos — config validation', () => {
  it('has the canonical identity fields', () => {
    expect(config.id).toBe('week11-kubernetes-chaos');
    expect(config.title).toBe('Kubernetes Chaos');
    expect(config.week).toBe(11);
    expect(config.unlockAfterDay).toBe(73);
    expect(config.promptUser).toBe('student');
    expect(config.promptHost).toBe('kube-bastion');
    expect(config.optimalCommands).toBe(6);
  });

  it('passes every shared mission-config guard', () => {
    // Trigger-cmd support, scripted-verb dispatch (G6), effect write paths (G7),
    // err+effect, state-based whens on mutating verbs, evidence protection
    // (G8/G8b), processStarted sanity (G9), hints/story shape, flag seeding.
    expect(validateMissionConfig(config)).toEqual([]);
  });

  // ── week11-specific domain facts the generic validator cannot know ────────

  it('the hints point at the real evidence files and teach the exact fix', () => {
    const hints = config.hints.join(' ');
    expect(hints).toContain('~/k8s/pods.txt');
    expect(hints).toContain('~/k8s/events.txt');
    expect(hints).toContain('~/k8s/deploy.yaml');
    expect(hints).toContain('kubectl create secret generic db-credentials');
  });

  it('the fix appends to the evidence events log (never overwrites it) and writes a separate status', () => {
    const appendPaths = allEffects().flatMap((e) => Object.keys(e.appendFiles ?? {}));
    expect(appendPaths).toContain('~/k8s/events.txt');
    const writePaths = allEffects().flatMap((e) => Object.keys(e.writeFiles ?? {}));
    expect(writePaths).not.toContain('~/k8s/events.txt');
    expect(writePaths).toContain('~/k8s/status');
  });

  it('this mission remediates without killing — no effect removes a pid', () => {
    for (const eff of allEffects()) {
      expect(eff.removePids ?? []).toEqual([]);
    }
  });

  it('the three evidence files each carry a DISTINCT objective needle', () => {
    const pods = readFile(config.filesystem, '~/k8s/pods.txt');
    const events = readFile(config.filesystem, '~/k8s/events.txt');
    const deploy = readFile(config.filesystem, '~/k8s/deploy.yaml');
    expect(pods).not.toBeNull();
    expect(events).not.toBeNull();
    expect(deploy).not.toBeNull();

    // obj2 needle lives only in pods.txt
    expect(pods!).toContain('CrashLoopBackOff');
    expect(events!).not.toContain('CrashLoopBackOff');
    expect(deploy!).not.toContain('CrashLoopBackOff');

    // obj3 needle ("not found") lives only in events.txt
    expect(events!).toContain('not found');
    expect(pods!).not.toContain('not found');
    expect(deploy!).not.toContain('not found');

    // obj4 needle lives only in deploy.yaml
    expect(deploy!).toContain('secretRef');
    expect(pods!).not.toContain('secretRef');
    expect(events!).not.toContain('secretRef');
  });
});

describe('week11-kubernetes-chaos — intended playthrough (~6 commands)', () => {
  it('reaches victory with SRE material rank via a config-only fix', () => {
    let s: MissionState = createMission(config);
    let r: RunResult;

    r = runCommand(s, 'ls');
    expect(r.completed).toEqual([1]);
    s = r.state;

    r = runCommand(s, 'cat ~/k8s/pods.txt');
    expect(r.completed).toEqual([2]); // CrashLoopBackOff
    s = r.state;

    r = runCommand(s, 'grep "not found" ~/k8s/events.txt');
    expect(r.completed).toEqual([3]); // secret not found
    s = r.state;

    r = runCommand(s, 'cat ~/k8s/deploy.yaml');
    expect(r.completed).toEqual([4]); // secretRef
    s = r.state;

    // A live diagnostic before the fix: no objective, no effect, still red.
    r = runCommand(s, 'kubectl describe pod web-6d8f7c9b5d-4xk2p');
    expect(r.completed).toEqual([]);
    expect(r.output.map((l) => l.text).join('\n')).toContain('not found');
    expect(s.flags?.secretRestored).toBe(false);
    s = r.state;

    r = runCommand(s, 'kubectl create secret generic db-credentials --from-literal=password=s3cr3t');
    expect(r.completed).toEqual([5]);
    expect(r.victory).toBe(true);
    s = r.state;

    // The fix is narrated (sys, no err), flips the flag, appends to the events
    // log, and writes a status marker.
    const fixLines = r.output;
    expect(fixLines.some((l) => l.kind === 'err')).toBe(false);
    const fixText = fixLines.map((l) => l.text).join('\n');
    expect(fixText).toContain('secret/db-credentials created');
    expect(fixText).toContain('rolled out (3/3 ready)');
    expect(s.flags?.secretRestored).toBe(true);
    expect(readFile(s.fs, '~/k8s/status')).toContain('OK — 3/3 ready');

    // evidence preserved (append-only events log + untouched pods/deploy).
    const events = readFile(s.fs, '~/k8s/events.txt')!;
    expect(events).toContain('not found'); // original evidence still there
    expect(events).toContain('deployment/web rolled out (3/3 ready)'); // appended line
    expect(readFile(s.fs, '~/k8s/pods.txt')!).toContain('CrashLoopBackOff');
    expect(readFile(s.fs, '~/k8s/deploy.yaml')!).toContain('secretRef');

    const stats = getStats(s);
    expect(stats).toEqual({ commandsRun: 6, hintsUsed: 0 });
    expect(rankFor(stats, config)).toBe('SRE material');
  });
});

describe('week11-kubernetes-chaos — anti-soft-lock (fix-first still completes the evidence objectives)', () => {
  it('recreating the Secret first does not lock out the read-the-evidence objectives', () => {
    let s: MissionState = createMission(config);

    // Fix BEFORE gathering any evidence — completes ONLY its own objective.
    let r = runCommand(s, 'kubectl create secret generic db-credentials --from-literal=password=hunter2');
    expect(r.completed).toEqual([5]);
    expect(r.victory).toBe(false); // 1–4 still pending
    expect(r.state.flags?.secretRestored).toBe(true);
    s = r.state;

    // The "not found" evidence is STILL in the append-only events log.
    r = runCommand(s, 'grep "not found" ~/k8s/events.txt');
    expect(r.completed).toEqual([3]);
    s = r.state;

    // pods.txt and deploy.yaml were never touched by the fix.
    r = runCommand(s, 'cat ~/k8s/pods.txt');
    expect(r.completed).toEqual([2]);
    s = r.state;

    r = runCommand(s, 'cat ~/k8s/deploy.yaml');
    expect(r.completed).toEqual([4]);
    s = r.state;

    r = runCommand(s, 'ls');
    expect(r.completed).toEqual([1]);
    expect(r.victory).toBe(true);
    expect(r.state.objectivesDone.every(Boolean)).toBe(true);
    s = r.state;

    // Re-running the fix is idempotent + honest, and never double-credits.
    const again = runCommand(s, 'kubectl create secret generic db-credentials --from-literal=password=hunter2');
    expect(again.output.some((l) => l.text.includes('exists'))).toBe(true);
    expect(again.completed).toEqual([]);

    // And a post-fix live query no longer claims the crash loop.
    const pods = runCommand(again.state, 'kubectl get pods');
    expect(pods.output.map((l) => l.text).join('\n')).toContain('3/3 ready');
    expect(pods.output.map((l) => l.text).join('\n')).not.toContain('CrashLoopBackOff');
  });
});

describe('week11-kubernetes-chaos — scrambled-order playthrough (order-independent)', () => {
  it('completes in a fully scrambled order, including grep-piped evidence', () => {
    let s: MissionState = createMission(config);

    let r = runCommand(s, 'kubectl get pods');
    expect(r.completed).toEqual([]); // diagnostic only
    expect(r.output.map((l) => l.text).join('\n')).toContain('CrashLoopBackOff');
    s = r.state;

    r = runCommand(s, 'cat ~/k8s/deploy.yaml | grep secretRef');
    expect(r.completed).toEqual([4]);
    s = r.state;

    r = runCommand(s, 'kubectl create secret generic db-credentials --from-literal=password=p@ss');
    expect(r.completed).toEqual([5]);
    expect(r.victory).toBe(false);
    s = r.state;

    r = runCommand(s, 'grep "not found" ~/k8s/events.txt');
    expect(r.completed).toEqual([3]);
    s = r.state;

    r = runCommand(s, 'cat ~/k8s/pods.txt');
    expect(r.completed).toEqual([2]);
    s = r.state;

    r = runCommand(s, 'ls');
    expect(r.completed).toEqual([1]);
    expect(r.victory).toBe(true);
  });
});

describe('week11-kubernetes-chaos — per-mission UX checklist', () => {
  it('4 progressive hints, plain-language objectives, honest defaults, exact-fix hint, help-terminated briefing', () => {
    expect(config.hints.length).toBe(4);
    expect(config.hints.length).toBeGreaterThanOrEqual(config.objectives.length - 1);

    // Progressive specificity: the exact fix command appears ONLY in the last
    // hint, and the first hint orients with `ls`.
    expect(config.hints[0]).toContain('ls');
    const withFix = config.hints.filter((h) => h.includes('kubectl create secret generic db-credentials'));
    expect(withFix).toEqual([config.hints.at(-1)]);

    // Every objective has non-empty text + success line.
    for (const o of config.objectives) {
      expect(o.text.trim().length).toBeGreaterThan(0);
      expect(o.successLine.trim().length).toBeGreaterThan(0);
    }

    // Every scripted command has honest, non-empty output (responses + default).
    for (const sc of Object.values(config.commands ?? {})) {
      if (sc.default) {
        expect(sc.default.output.length).toBeGreaterThan(0);
        expect(sc.default.output.every((l) => l.trim().length > 0)).toBe(true);
      }
      for (const r of sc.responses ?? []) {
        expect(r.output.length).toBeGreaterThan(0);
        expect(r.output.every((l) => l.trim().length > 0)).toBe(true);
      }
    }

    // The success response carries the effect and prints no err line.
    const kubectl = config.commands!.kubectl;
    const fix = (kubectl.responses ?? []).find((r) => r.effect !== undefined);
    expect(fix).toBeDefined();
    expect(fix!.effect?.setFlags?.secretRestored).toBe(true);
    expect(fix!.outKind).not.toBe('err');
    expect(fix!.outKind).toBe('sys');

    // The final hint teaches the exact fix; the briefing ends by pointing at help.
    expect(config.hints.at(-1)).toContain(
      'kubectl create secret generic db-credentials --from-literal=password=<pw>',
    );
    expect(config.story.at(-1)).toContain('help');
  });
});
