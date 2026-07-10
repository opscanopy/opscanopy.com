/**
 * Config-validation + playthrough tests for the Day-90 CAPSTONE mission ("The
 * Midnight Outage"), a config-only, ORDERED full-stack incident response. The
 * lesson is upstream-first ordering, enforced entirely by plain state flags:
 *
 *   aws (open tcp/443, sets sgFixed) → kubectl (recreate the Secret, requires
 *   sgFixed, sets k8sFixed) → dig (confirm DNS healed to the primary, gated on
 *   k8sFixed).
 *
 * The anti-soft-lock case is the heart of it: `kubectl create secret …` run
 * BEFORE the security group is open falls to an `out` PRECONDITION line that
 * carries NO effect — it completes nothing, sets no flag, and is fully
 * retryable — and `dig` before the Secret is back returns the failover address
 * and completes nothing. Done in order, all six objectives complete and win.
 *
 * ISLAND CONTRACT: imports ONLY the engine façade, the mission config, and the
 * shared config validator (test-only shared tooling, not island code).
 */
import { describe, it, expect } from 'vitest';
import { createMission, runCommand, getStats, rankFor, readFile } from '../engine';
import type { MissionEffect, MissionState, RunResult } from '../engine';
import { validateMissionConfig } from './_validation';
import { finalMidnightOutage } from './final-midnight-outage';

const config = finalMidnightOutage;

const AWS_FIX =
  'aws ec2 authorize-security-group-ingress --group-id sg-web --protocol tcp --port 443 --cidr 0.0.0.0/0';
const K8S_FIX = 'kubectl create secret generic db-credentials --from-literal=password=pw';
const DIG_VERIFY = 'dig shop.opscanopy.io';

/** Every effect authored anywhere in config.commands (responses + defaults). */
function allEffects(): MissionEffect[] {
  const effects: MissionEffect[] = [];
  for (const sc of Object.values(config.commands ?? {})) {
    for (const r of sc.responses ?? []) if (r.effect) effects.push(r.effect);
    if (sc.default?.effect) effects.push(sc.default.effect);
  }
  return effects;
}

describe('final-midnight-outage — config validation', () => {
  it('has the canonical identity fields (matches the mission90 registry)', () => {
    expect(config.id).toBe('final-midnight-outage');
    expect(config.title).toBe('The Midnight Outage');
    expect(config.week).toBe(13);
    expect(config.unlockAfterDay).toBe(90);
    expect(config.promptUser).toBe('ops');
    expect(config.promptHost).toBe('warroom');
    expect(config.optimalCommands).toBe(8);
  });

  it('passes every shared mission-config guard', () => {
    // Trigger-cmd support, scripted-verb dispatch (G6), effect write paths (G7),
    // err+effect, state-based whens on mutating verbs (aws/kubectl → flagSet;
    // dig is effect-free so its outputMatched is legal), evidence protection
    // (G8/G8b), processStarted sanity (G9), hints/story shape, flag seeding.
    expect(validateMissionConfig(config)).toEqual([]);
  });

  // ── capstone-specific domain facts the generic validator cannot know ──────

  it('the hints point at the real evidence files and the last teaches the full fix chain', () => {
    const hints = config.hints.join(' ');
    expect(hints).toContain('~/incident.log');
    expect(hints).toContain('~/aws/sg-audit.txt');
    expect(hints).toContain('~/k8s/events.txt');
    // The full ordered fix sequence lives ONLY in the last hint.
    expect(config.hints.at(-1)).toContain('aws ec2 authorize-security-group-ingress');
    expect(config.hints.at(-1)).toContain('kubectl create secret generic db-credentials');
    expect(config.hints.at(-1)).toContain('dig shop.opscanopy.io');
  });

  it('each fix appends to its evidence log (never overwrites) and writes a separate status marker', () => {
    const appendPaths = allEffects().flatMap((e) => Object.keys(e.appendFiles ?? {}));
    expect(appendPaths).toContain('~/aws/sg-audit.txt');
    expect(appendPaths).toContain('~/k8s/events.txt');
    const writePaths = allEffects().flatMap((e) => Object.keys(e.writeFiles ?? {}));
    expect(writePaths).not.toContain('~/aws/sg-audit.txt');
    expect(writePaths).not.toContain('~/k8s/events.txt');
    expect(writePaths).toContain('~/aws/status');
    expect(writePaths).toContain('~/k8s/status');
  });

  it('this mission remediates without killing — no effect removes a pid', () => {
    for (const eff of allEffects()) {
      expect(eff.removePids ?? []).toEqual([]);
    }
  });

  it('the verify verb (dig) is purely diagnostic — it carries no effect at all', () => {
    const dig = config.commands!.dig;
    for (const r of dig.responses ?? []) expect(r.effect).toBeUndefined();
    expect(dig.default?.effect).toBeUndefined();
  });

  it('each evidence file carries only its OWN objective string — one cat cannot complete two reads', () => {
    const log = readFile(config.filesystem, '~/incident.log');
    const sg = readFile(config.filesystem, '~/aws/sg-audit.txt');
    const ev = readFile(config.filesystem, '~/k8s/events.txt');
    expect(log).not.toBeNull();
    expect(sg).not.toBeNull();
    expect(ev).not.toBeNull();

    // Each file has its own evidence…
    expect(log!).toContain('CRITICAL');
    expect(sg!).toContain('REVOKE');
    expect(ev!).toContain('db-credentials');

    // …and NOT any other read-objective's string.
    expect(sg!).not.toContain('CRITICAL');
    expect(ev!).not.toContain('CRITICAL');
    expect(log!).not.toContain('REVOKE');
    expect(ev!).not.toContain('REVOKE');
    expect(log!).not.toContain('db-credentials');
    expect(sg!).not.toContain('db-credentials');

    // Only the post-heal dig line names the primary — no evidence file does.
    expect(log!).not.toContain('203.0.113.10');
    expect(sg!).not.toContain('203.0.113.10');
    expect(ev!).not.toContain('203.0.113.10');
  });
});

describe('final-midnight-outage — intended upstream-first playthrough', () => {
  it('reaches victory with SRE-material rank via aws → kubectl → dig', () => {
    let s: MissionState = createMission(config);
    let r: RunResult;

    r = runCommand(s, 'cat ~/incident.log');
    expect(r.completed).toEqual([1]); // triage — CRITICAL
    s = r.state;

    r = runCommand(s, 'cat ~/aws/sg-audit.txt');
    expect(r.completed).toEqual([2]); // network block — REVOKE
    s = r.state;

    r = runCommand(s, AWS_FIX);
    expect(r.completed).toEqual([3]); // sg re-opened
    expect(r.victory).toBe(false);
    expect(s.flags?.sgFixed).toBe(false); // pre-command state unchanged
    s = r.state;

    const sgText = r.output.map((l) => l.text).join('\n');
    expect(sgText).toContain('Authorized tcp/443 ingress on sg-web');
    expect(r.output.some((l) => l.kind === 'err')).toBe(false);
    expect(s.flags?.sgFixed).toBe(true);

    r = runCommand(s, 'cat ~/k8s/events.txt');
    expect(r.completed).toEqual([4]); // failover-cluster events — db-credentials
    s = r.state;

    r = runCommand(s, K8S_FIX);
    expect(r.completed).toEqual([5]); // Secret restored
    expect(r.victory).toBe(false); // dig verify still pending
    s = r.state;

    const k8sText = r.output.map((l) => l.text).join('\n');
    expect(k8sText).toContain('secret/db-credentials created');
    expect(r.output.some((l) => l.kind === 'err')).toBe(false);
    expect(s.flags?.k8sFixed).toBe(true);

    r = runCommand(s, DIG_VERIFY);
    expect(r.completed).toEqual([6]); // DNS healed to the primary
    expect(r.victory).toBe(true);
    s = r.state;

    const digText = r.output.map((l) => l.text).join('\n');
    expect(digText).toContain('203.0.113.10');

    // evidence preserved (append-only) + separate status markers written.
    expect(readFile(s.fs, '~/aws/sg-audit.txt')!).toContain('REVOKE'); // original intact
    expect(readFile(s.fs, '~/aws/sg-audit.txt')!).toContain('AUTHORIZE'); // appended line
    expect(readFile(s.fs, '~/k8s/events.txt')!).toContain('not found'); // original intact
    expect(readFile(s.fs, '~/aws/status')).toContain('OK');
    expect(readFile(s.fs, '~/k8s/status')).toContain('OK');

    const stats = getStats(s);
    expect(stats).toEqual({ commandsRun: 6, hintsUsed: 0 });
    expect(rankFor(stats, config)).toBe('SRE material');
  });
});

describe('final-midnight-outage — anti-soft-lock (the ordering IS the lesson)', () => {
  it('kubectl-before-aws is a no-op precondition; dig-before-heal stays on failover; in order → victory', () => {
    let s: MissionState = createMission(config);

    // OUT OF ORDER: recreate the Secret BEFORE opening the network. The cluster
    // API is unreachable — an `out` PRECONDITION line, NO effect, completes
    // nothing, sets no flag, fully retryable. No soft-lock, no false credit.
    let r = runCommand(s, K8S_FIX);
    expect(r.completed).toEqual([]);
    expect(r.output.some((l) => l.kind === 'err')).toBe(false); // precondition is out, not err
    expect(r.output.some((l) => l.text.includes('cluster API is unreachable'))).toBe(true);
    expect(r.state.flags?.sgFixed).toBe(false);
    expect(r.state.flags?.k8sFixed).toBe(false);
    expect(r.state.objectivesDone.some(Boolean)).toBe(false);
    s = r.state;

    // OUT OF ORDER: confirm DNS before the chain is done — still failed over to
    // 203.0.113.99, completes nothing (obj 6 needs the primary 203.0.113.10).
    r = runCommand(s, DIG_VERIFY);
    expect(r.completed).toEqual([]);
    const failover = r.output.map((l) => l.text).join('\n');
    expect(failover).toContain('203.0.113.99');
    expect(failover).not.toContain('203.0.113.10');
    expect(r.state.flags?.k8sFixed).toBe(false);
    s = r.state;

    // NOW IN ORDER. Step 1: open tcp/443 — sets sgFixed, completes obj 3.
    r = runCommand(s, AWS_FIX);
    expect(r.completed).toEqual([3]);
    expect(r.state.flags?.sgFixed).toBe(true);
    s = r.state;

    // Step 2: the SAME create-secret command now SUCCEEDS — sets k8sFixed, obj 5.
    r = runCommand(s, K8S_FIX);
    expect(r.completed).toEqual([5]);
    expect(r.output.some((l) => l.kind === 'err')).toBe(false);
    expect(r.state.flags?.k8sFixed).toBe(true);
    s = r.state;

    // Step 3: DNS has healed to the primary — obj 6.
    r = runCommand(s, DIG_VERIFY);
    expect(r.completed).toEqual([6]);
    s = r.state;

    // The read-evidence objectives are all still completable after the fixes
    // (append-only logs preserved the REVOKE / not-found evidence).
    r = runCommand(s, 'grep CRITICAL ~/incident.log');
    expect(r.completed).toEqual([1]);
    s = r.state;

    r = runCommand(s, 'grep REVOKE ~/aws/sg-audit.txt');
    expect(r.completed).toEqual([2]);
    s = r.state;

    r = runCommand(s, 'cat ~/k8s/events.txt');
    expect(r.completed).toEqual([4]);
    expect(r.victory).toBe(true);
    expect(r.state.objectivesDone.every(Boolean)).toBe(true);
    s = r.state;

    // Re-running either fix is idempotent + honest, and never double-credits.
    const awsAgain = runCommand(s, AWS_FIX);
    expect(awsAgain.output.some((l) => l.text.includes('already allows tcp/443'))).toBe(true);
    expect(awsAgain.completed).toEqual([]);

    const k8sAgain = runCommand(s, K8S_FIX);
    expect(k8sAgain.output.some((l) => l.text.includes('present'))).toBe(true);
    expect(k8sAgain.completed).toEqual([]);
  });
});

describe('final-midnight-outage — scrambled read-order playthrough (order-independent reads)', () => {
  it('completes with reads scrambled and a grep-piped step, fixes still upstream-first', () => {
    let s: MissionState = createMission(config);

    // Diagnostic listing — completes nothing (obj 3 fires on the flag, not output).
    let r = runCommand(s, 'aws ec2 describe-security-groups');
    expect(r.completed).toEqual([]);
    s = r.state;

    // grep-piped read of the failover-cluster events → obj 4.
    r = runCommand(s, 'cat ~/k8s/events.txt | grep db-credentials');
    expect(r.completed).toEqual([4]);
    s = r.state;

    // Fixes must still go upstream-first: aws before kubectl.
    r = runCommand(s, AWS_FIX);
    expect(r.completed).toEqual([3]);
    s = r.state;

    r = runCommand(s, K8S_FIX);
    expect(r.completed).toEqual([5]);
    s = r.state;

    r = runCommand(s, DIG_VERIFY);
    expect(r.completed).toEqual([6]);
    s = r.state;

    r = runCommand(s, 'grep CRITICAL ~/incident.log');
    expect(r.completed).toEqual([1]);
    s = r.state;

    r = runCommand(s, 'grep REVOKE ~/aws/sg-audit.txt');
    expect(r.completed).toEqual([2]);
    expect(r.victory).toBe(true);
  });
});

describe('final-midnight-outage — per-mission UX checklist', () => {
  it('progressive hints, plain objectives, honest defaults, exact-fix last hint, help-terminated briefing', () => {
    // Hint count is monotone-sufficient: at least objectives − 1, first orients.
    expect(config.hints.length).toBeGreaterThanOrEqual(config.objectives.length - 1);
    expect(config.hints[0]).toContain('cat ~/incident.log');

    // The full create-secret fix command appears ONLY in the last hint.
    const withFix = config.hints.filter((h) => h.includes('kubectl create secret generic db-credentials'));
    expect(withFix).toEqual([config.hints.at(-1)]);

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

    // Both fix responses carry their flag effect and print no err line.
    const aws = config.commands!.aws;
    const awsFix = (aws.responses ?? []).find((r) => r.effect?.setFlags?.sgFixed === true);
    expect(awsFix).toBeDefined();
    expect(awsFix!.outKind).not.toBe('err');

    const kubectl = config.commands!.kubectl;
    const k8sFix = (kubectl.responses ?? []).find((r) => r.effect?.setFlags?.k8sFixed === true);
    expect(k8sFix).toBeDefined();
    expect(k8sFix!.outKind).not.toBe('err');

    // Briefing ends by pointing at help.
    expect(config.story.at(-1)).toContain('help');
  });

  it('the gates are flag-driven: kubectl needs sgFixed, dig needs k8sFixed', () => {
    // kubectl create secret is two-faced by sgFixed: precondition out (no obj)
    // before, success sys (sets k8sFixed) after.
    const cold = createMission(config);
    const pre = runCommand(cold, K8S_FIX);
    expect(pre.output.some((l) => l.kind === 'err')).toBe(false);
    expect(pre.completed).toEqual([]);
    expect(pre.state.flags?.k8sFixed).toBe(false);

    const sgOpen = runCommand(cold, AWS_FIX).state;
    const post = runCommand(sgOpen, K8S_FIX);
    expect(post.output.some((l) => l.kind === 'err')).toBe(false);
    expect(post.completed).toEqual([5]);
    expect(post.state.flags?.k8sFixed).toBe(true);

    // dig is two-faced by k8sFixed: failover 203.0.113.99 before (no obj),
    // primary 203.0.113.10 after (completes obj 6).
    const digCold = runCommand(sgOpen, DIG_VERIFY);
    expect(digCold.completed).toEqual([]);
    expect(digCold.output.some((l) => (l.kind === 'out' || l.kind === 'sys') && l.text.includes('203.0.113.10'))).toBe(
      false,
    );

    const digWarm = runCommand(post.state, DIG_VERIFY);
    expect(digWarm.completed).toEqual([6]);
    expect(digWarm.output.some((l) => (l.kind === 'out' || l.kind === 'sys') && l.text.includes('203.0.113.10'))).toBe(
      true,
    );
  });
});
