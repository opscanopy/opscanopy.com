#!/usr/bin/env node
// Production-dependency audit gate (CI: deploy.yml "Audit production dependencies").
//
//   node scripts/audit-gate.mjs            # runs npm audit --omit=dev --json
//   node scripts/audit-gate.mjs --self-test
//
// Fails on any high/critical advisory reachable from a production dependency
// unless scripts/audit-allowlist.json names it with a reason and an unexpired
// date; fails on expired or stale allowlist entries. See scripts/audit-gate-core.mjs.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, fixtureAudit } from './audit-gate-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ALLOWLIST = join(here, 'audit-allowlist.json');

function selfTest() {
  const T = '2026-10-03';
  const entry = { id: 'GHSA-aaaa-bbbb-cccc', package: 'lib-a', reason: 'build-time only', expires: '2026-11-03' };
  const cases = [
    ['clean tree passes', fixtureAudit({}), [], true],
    ['unallowlisted high fails', fixtureAudit({ 'lib-a': [['GHSA-aaaa-bbbb-cccc', 'high']] }), [], false],
    ['allowlisted high passes', fixtureAudit({ 'lib-a': [['GHSA-aaaa-bbbb-cccc', 'high']] }, { framework: 'lib-a' }), [entry], true],
    ['allowlist for a different package does not excuse', fixtureAudit({ 'lib-b': [['GHSA-aaaa-bbbb-cccc', 'high']] }), [entry], false],
    ['second high on the same package still fails', fixtureAudit({ 'lib-a': [['GHSA-aaaa-bbbb-cccc', 'high'], ['GHSA-dddd-eeee-ffff', 'critical']] }), [entry], false],
    ['expired entry fails', fixtureAudit({ 'lib-a': [['GHSA-aaaa-bbbb-cccc', 'high']] }), [{ ...entry, expires: '2026-10-02' }], false],
    ['stale entry (advisory gone) fails', fixtureAudit({}), [entry], false],
    ['moderate advisories never block', fixtureAudit({ 'lib-c': [['GHSA-gggg-hhhh-iiii', 'moderate']] }), [], true],
    ['incomplete entry fails', fixtureAudit({ 'lib-a': [['GHSA-aaaa-bbbb-cccc', 'high']] }), [{ id: entry.id, package: 'lib-a' }], false],
  ];
  let failed = 0;
  for (const [name, audit, list, want] of cases) {
    const r = evaluate(audit, list, T);
    const ok = r.ok === want;
    if (!ok) failed++;
    console.log(`audit-gate self-test: ${ok ? 'ok  ' : 'FAIL'} ${name} → ${r.ok ? 'pass' : 'fail'} [expected ${want ? 'pass' : 'fail'}]`);
  }
  console.log(`audit-gate self-test: ${failed ? 'FAIL' : 'PASS'} — ${cases.length} cases, ${failed} failure(s)`);
  process.exit(failed ? 1 : 0);
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  let raw;
  try {
    raw = execFileSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    raw = e.stdout; // npm audit exits non-zero when it finds anything; the JSON is still on stdout
  }
  let audit;
  try {
    audit = JSON.parse(raw);
  } catch {
    console.error('audit-gate: could not parse `npm audit --json` output — failing closed');
    process.exit(1);
  }
  const allowlist = JSON.parse(readFileSync(ALLOWLIST, 'utf8'));
  const today = new Date().toISOString().slice(0, 10);
  const r = evaluate(audit, allowlist, today);
  for (const a of r.allowed) console.log(`audit-gate: ALLOWED ${a.severity} ${a.id} in ${a.package} until ${a.expires} — ${a.reason}`);
  for (const a of r.blocking) console.error(`audit-gate: BLOCKING ${a.severity} ${a.id} in ${a.package} — ${a.title} ${a.url}`);
  for (const p of r.problems) console.error(`audit-gate: FAIL ${p}`);
  console.log(`audit-gate: ${r.ok ? 'PASS' : 'FAIL'} — ${r.blocking.length} blocking, ${r.allowed.length} allowlisted, ${r.problems.length} allowlist problem(s)`);
  process.exit(r.ok ? 0 : 1);
}

main();
