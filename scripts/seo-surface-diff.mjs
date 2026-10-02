#!/usr/bin/env node
/**
 * SEO-surface diff guard — compares what a search engine reads on every built
 * page of a baseline (normally the last shipped `main`) against the candidate
 * tree, and fails closed on any unexplained change to a ranking input. Pure
 * decisions live in scripts/seo-surface-core.mjs (pinned by
 * src/lib/seo-surface-diff.test.ts); this file is the I/O: git worktrees,
 * builds, reading dist/, writing the report.
 *
 * Usage:
 *   node scripts/seo-surface-diff.mjs --baseline-build [ref]   (npm run seo:baseline -- main)
 *       Build <ref> (default origin/main) in a detached worktree OUTSIDE the repo,
 *       keep <work>/.seo-baseline/<sha>/dist + surface.json, remove the worktree.
 *       Cached by sha. <work> = --work-dir <path>, else os.tmpdir()/opscanopy-seo.
 *   node scripts/seo-surface-diff.mjs [--allow <file>]          (npm run seo:diff -- --allow …)
 *       Build THIS tree cold, diff it against the latest baseline, write
 *       reports/seo-surface/<date>-<batch>.md. Exit 0 clean, 1 must-explain (or a
 *       build that was not provably cold), 2 expired allowlist.
 *   node scripts/seo-surface-diff.mjs --self-test
 *       Run every fixture case on synthetic dist trees in os.tmpdir().
 *
 * Diff options:
 *   --allow <file>        allowlist (scripts/seo-allow/README.md)
 *   --baseline <x>        a sha/ref with a cached baseline, or a dist directory
 *                         (default: the last --baseline-build)
 *   --candidate <dir>     diff an existing dist instead of building this tree
 *   --no-build            diff ./dist as it is (cold content layer NOT verified)
 *   --assume-cold         accept an unverified candidate build (proofs on a
 *                         hand-edited dist only — never for a ship decision)
 *   --batch <name>        report name (default: the allowlist's batch, else "adhoc")
 *   --date YYYY-MM-DD     report date and expiry reference (default: HEAD's commit date)
 *   --report <path>       report path (default reports/seo-surface/<date>-<batch>.md)
 *   --work-dir <path>     where .seo-baseline/ lives (never inside the repo)
 *
 * Why the builds are cold: Astro's content layer caches rendered Markdown in
 * node_modules/.astro/data-store.json and does not invalidate it when a
 * rehype/remark/Shiki plugin changes, so a warm local build can diff as
 * "identical" while CI (always cold) ships something else. Each build renames
 * node_modules/.astro aside (the rename is the proof the old store is out of
 * reach; nothing re-checks its absence afterwards, which could not fail), then
 * requires that the build wrote a fresh data-store.json there and logged
 * "[content] Synced content" (coldVerdict in the core), then deletes the fresh
 * store and restores the original.
 */
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  renameSync,
  cpSync,
  symlinkSync,
  unlinkSync,
  rmdirSync,
  lstatSync,
  openSync,
  closeSync,
} from 'node:fs';
import { join, resolve, relative, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import {
  extractPage,
  buildSiteIndex,
  pathFromFile,
  compareSites,
  validateAllowlist,
  extractOptionsFor,
  renderMarkdown,
  summaryLine,
  collapseDiffs,
  selfTestCases,
  checkCase,
  coldVerdict,
} from './seo-surface-core.mjs';

const ROOT = resolve(join(fileURLToPath(import.meta.url), '..', '..'));
const SKIP_DIRS = new Set(['_astro', 'pagefind']);
const ANSI = /\x1b\[[0-9;]*m/g;

// ---------------------------------------------------------------------------
// Small helpers

function git(args, cwd = ROOT) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function parseArgs(argv) {
  const o = { mode: 'diff', ref: null, flags: /** @type {Record<string, any>} */ ({}) };
  const takes = new Set(['--allow', '--baseline', '--candidate', '--batch', '--date', '--report', '--work-dir']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--self-test') o.mode = 'self-test';
    else if (a === '--baseline-build') o.mode = 'baseline';
    else if (a === '--diff') o.mode = 'diff';
    else if (a === '--no-build' || a === '--assume-cold') o.flags[a.slice(2)] = true;
    else if (takes.has(a)) {
      if (argv[i + 1] === undefined) throw new Error(`${a} needs a value`);
      o.flags[a.slice(2)] = argv[++i];
    } else if (!a.startsWith('--') && o.mode === 'baseline' && o.ref === null) o.ref = a;
    else throw new Error(`unknown argument "${a}"`);
  }
  return o;
}

const sameFs = (/** @type {string} */ p) => (process.platform === 'win32' ? p.toLowerCase() : p);

/** Throws unless `p` is outside the repo (an in-repo tree is swept into `npm run check`). */
export function assertOutsideRepo(p, root = ROOT) {
  const rel = relative(sameFs(resolve(root)), sameFs(resolve(p)));
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)))
    throw new Error(`work dir ${p} is inside the repo (${root}); tsconfig includes **/* with allowJs, so a baseline tree there breaks npm run check. Use the OS temp dir or --work-dir outside the repo.`);
}

function workRoot(flags) {
  const base = resolve(flags['work-dir'] ?? join(os.tmpdir(), 'opscanopy-seo'));
  assertOutsideRepo(base);
  const dir = join(base, '.seo-baseline');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function fmtSecs(ms) {
  return `${(ms / 1000).toFixed(1)} s`;
}

/** Read a dist tree into a site index (page by page; the tree is never held whole). */
export function readDist(dir, extractOpts = {}) {
  if (!existsSync(join(dir, 'index.html'))) throw new Error(`${dir} has no index.html — not a built dist/`);
  const surfaces = [];
  const walk = (/** @type {string} */ d, /** @type {string} */ rel) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!(rel === '' && SKIP_DIRS.has(e.name))) walk(join(d, e.name), r);
      } else if (e.name.endsWith('.html')) {
        surfaces.push(extractPage(readFileSync(join(d, e.name), 'utf8'), pathFromFile(r), extractOpts));
      }
    }
  };
  walk(dir, '');
  const top = readdirSync(dir);
  const sitemaps = top.filter((f) => /^sitemap-\d+\.xml$/.test(f)).map((f) => readFileSync(join(dir, f), 'utf8'));
  /** @type {Record<string,string>} */
  const files = {};
  for (const f of ['llms.txt', 'llms-full.txt']) if (existsSync(join(dir, f))) files[f] = readFileSync(join(dir, f), 'utf8');
  return buildSiteIndex(surfaces, { sitemaps, files });
}

/** Write an in-memory fixture tree to disk. */
function writeTree(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
}

// ---------------------------------------------------------------------------
// Cold build

/**
 * `npm run build` in `tree` with node_modules/.astro moved aside. Returns
 * whether the build succeeded and whether its content layer was provably cold.
 */
function coldBuild(tree, label, logFile) {
  const nm = join(tree, 'node_modules');
  const cache = join(nm, '.astro');
  const aside = join(nm, '.astro.seo-aside');
  if (existsSync(aside)) {
    if (existsSync(cache))
      throw new Error(`${aside} and ${cache} both exist: an earlier guard run died mid-build. Keep the right one, delete the other, re-run.`);
    renameSync(aside, cache);
  }
  const hadCache = existsSync(cache);
  if (hadCache) renameSync(cache, aside);
  const t0 = Date.now();
  let status = 1;
  let cold = false;
  let detail = '';
  try {
    console.log(`seo-surface: building ${label} (content layer moved aside: ${hadCache ? 'yes' : 'none existed'}) → ${logFile}`);
    const fd = openSync(logFile, 'w');
    try {
      status = spawnSync('npm run build', { cwd: tree, shell: true, stdio: ['ignore', fd, fd], env: process.env }).status ?? 1;
    } finally {
      closeSync(fd);
    }
    const log = readFileSync(logFile, 'utf8').replace(ANSI, '');
    const store = join(cache, 'data-store.json');
    // The path was emptied by the rename above, so a store here was written by this build.
    ({ cold, detail } = coldVerdict({ hadCache, storeWritten: existsSync(store), synced: /\[content\] Synced content/.test(log) }));
    if (status !== 0) {
      console.error(log.split('\n').slice(-40).join('\n'));
    }
  } finally {
    rmSync(cache, { recursive: true, force: true });
    if (hadCache) renameSync(aside, cache);
  }
  const ms = Date.now() - t0;
  return { ok: status === 0, cold, detail, ms };
}

// ---------------------------------------------------------------------------
// Baseline

function isLink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Remove a node_modules junction/symlink WITHOUT touching its target. */
function removeLink(link) {
  if (!isLink(link)) return;
  try {
    unlinkSync(link);
  } catch {
    rmdirSync(link);
  }
  if (isLink(link) || existsSync(link)) throw new Error(`could not remove the node_modules link at ${link}; remove it by hand BEFORE deleting the worktree, or its target is at risk.`);
}

function removeWorktree(wt) {
  if (!existsSync(wt)) {
    git(['worktree', 'prune']);
    return;
  }
  removeLink(join(wt, 'node_modules'));
  try {
    git(['worktree', 'remove', '--force', wt]);
  } catch {
    rmSync(wt, { recursive: true, force: true });
  }
  git(['worktree', 'prune']);
}

function baselineBuild(ref, flags) {
  const t0 = Date.now();
  const sha = git(['rev-parse', '--verify', `${ref}^{commit}`]);
  const work = workRoot(flags);
  const out = join(work, sha);
  const latest = join(work, 'latest.json');
  const metaFile = join(out, 'meta.json');
  if (existsSync(metaFile) && existsSync(join(out, 'dist', 'index.html'))) {
    const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
    if (meta.ok && meta.cold) {
      writeFileSync(latest, JSON.stringify({ sha, ref, dir: out }, null, 2));
      console.log(`seo-surface: baseline ${ref} ${sha.slice(0, 12)} cached at ${out} (built cold, ${meta.build}).`);
      return 0;
    }
  }
  // A crashed run must not poison this one.
  git(['worktree', 'prune']);
  const wt = join(work, `wt-${sha.slice(0, 12)}`);
  removeWorktree(wt);
  console.log(`seo-surface: baseline ${ref} = ${sha.slice(0, 12)}; worktree ${wt}`);
  git(['worktree', 'add', '--detach', wt, sha]);
  const rootNm = join(ROOT, 'node_modules');
  let build;
  let deps = '';
  try {
    const lf = (/** @type {string} */ s) => s.replace(/\r\n/g, '\n');
    const lockSame = lf(git(['show', `${sha}:package-lock.json`])) === lf(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')).trim();
    if (lockSame) {
      if (!existsSync(join(rootNm, 'astro', 'package.json'))) throw new Error(`${rootNm} is not installed; run npm ci in this tree first.`);
      symlinkSync(rootNm, join(wt, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
      deps = 'package-lock.json unchanged → node_modules linked from the candidate tree';
    } else {
      deps = 'package-lock.json differs → npm ci inside the baseline worktree';
      console.log(`seo-surface: ${deps}`);
      const ci = spawnSync('npm ci', { cwd: wt, shell: true, stdio: 'inherit' });
      if (ci.status !== 0) throw new Error('npm ci failed in the baseline worktree');
    }
    mkdirSync(out, { recursive: true });
    build = coldBuild(wt, `baseline ${sha.slice(0, 12)}`, join(work, `build-${sha.slice(0, 12)}.log`));
    if (!build.ok) throw new Error(`baseline build failed (log ${join(work, `build-${sha.slice(0, 12)}.log`)})`);
    rmSync(join(out, 'dist'), { recursive: true, force: true });
    try {
      renameSync(join(wt, 'dist'), join(out, 'dist'));
    } catch {
      cpSync(join(wt, 'dist'), join(out, 'dist'), { recursive: true });
    }
    const index = readDist(join(out, 'dist'));
    writeFileSync(join(out, 'surface.json'), JSON.stringify(index));
    const meta = { ok: true, cold: build.cold, sha, ref, deps, detail: build.detail, build: fmtSecs(build.ms), pages: Object.keys(index.pages).length };
    writeFileSync(metaFile, JSON.stringify(meta, null, 2));
    writeFileSync(latest, JSON.stringify({ sha, ref, dir: out }, null, 2));
  } finally {
    removeWorktree(wt);
    if (!existsSync(join(rootNm, 'astro', 'package.json')))
      console.error(`seo-surface: WARNING ${rootNm} looks damaged after the baseline run — run npm ci.`);
  }
  console.log(`seo-surface: ${deps}`);
  console.log(`seo-surface: baseline build ${fmtSecs(build.ms)}, ${build.detail}`);
  console.log(`seo-surface: baseline kept at ${out} (total ${fmtSecs(Date.now() - t0)})`);
  if (!build.cold) {
    console.error('FAIL: the baseline build did not run with a provably cold content layer.');
    return 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Diff

function resolveBaseline(flags) {
  const work = workRoot(flags);
  const b = flags.baseline;
  if (b && existsSync(join(resolve(b), 'index.html')))
    return { dist: resolve(b), label: `dist ${resolve(b)} (not built by the guard)`, cold: false };
  let dir;
  let sha;
  let ref;
  if (b) {
    sha = git(['rev-parse', '--verify', `${b}^{commit}`]);
    ref = b;
    dir = join(work, sha);
  } else {
    const latest = join(work, 'latest.json');
    if (!existsSync(latest)) throw new Error(`no baseline yet — run npm run seo:baseline -- <ref> first (looked in ${work}).`);
    ({ sha, ref, dir } = JSON.parse(readFileSync(latest, 'utf8')));
  }
  const metaFile = join(dir, 'meta.json');
  if (!existsSync(metaFile)) throw new Error(`no cached baseline for ${ref} (${sha}); run npm run seo:baseline -- ${ref}`);
  const meta = JSON.parse(readFileSync(metaFile, 'utf8'));
  return { dist: join(dir, 'dist'), label: `${ref} ${sha.slice(0, 12)} (build ${meta.build}; ${meta.detail})`, cold: !!meta.cold };
}

function diff(flags) {
  const t0 = Date.now();
  const allowFile = flags.allow ? resolve(flags.allow) : null;
  const allow = allowFile ? validateAllowlist(JSON.parse(readFileSync(allowFile, 'utf8'))) : null;
  const opts = extractOptionsFor(allow);
  const baseline = resolveBaseline(flags);

  const work = workRoot(flags);
  let candDist;
  let candCold = false;
  /** @type {string[]} */
  const builds = [];
  /** @type {string[]} */
  const timing = [];
  if (flags.candidate) {
    candDist = resolve(flags.candidate);
    builds.push(`candidate: dist ${candDist} (not built by the guard; content layer not verified)`);
  } else if (flags['no-build']) {
    candDist = join(ROOT, 'dist');
    builds.push(`candidate: ./dist as found (--no-build; content layer not verified)`);
  } else {
    const b = coldBuild(ROOT, 'candidate (this tree)', join(work, 'build-candidate.log'));
    if (!b.ok) {
      console.error('FAIL: candidate build failed.');
      return 1;
    }
    candDist = join(ROOT, 'dist');
    candCold = b.cold;
    builds.push(`candidate: this tree, ${b.detail}`);
    timing.push(`candidate build ${fmtSecs(b.ms)}`);
  }
  if (flags['assume-cold'] && !candCold) builds.push('candidate: cold content layer ASSUMED (--assume-cold) — proof runs only, never a ship decision');

  const t1 = Date.now();
  const base = readDist(baseline.dist, opts.base);
  const cand = readDist(candDist, opts.cand);
  const head = git(['rev-parse', '--short=12', 'HEAD']);
  const dirty = git(['status', '--porcelain', '--untracked-files=no']) !== '';
  const date = flags.date ?? git(['log', '-1', '--format=%cs', 'HEAD']);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`--date must be YYYY-MM-DD, got "${date}"`);
  const result = compareSites(base, cand, allow, { today: date });
  timing.push(`extract + diff ${fmtSecs(Date.now() - t1)} (${result.pageCount.base} + ${result.pageCount.cand} pages)`);
  timing.push(`total ${fmtSecs(Date.now() - t0)}`);

  // The final exit code is settled before the report is written, so the
  // report's "Exit N" line is the one the process returns.
  const coldOk = baseline.cold && (candCold || !!flags['assume-cold']);
  const notCold = coldOk ? null : !baseline.cold ? 'the baseline' : 'the candidate';
  const exit = result.expired ? 2 : notCold ? 1 : result.exitCode;

  const batch = flags.batch ?? allow?.batch ?? 'adhoc';
  const reportPath = resolve(flags.report ?? join(ROOT, 'reports', 'seo-surface', `${date}-${batch}.md`));
  const md = renderMarkdown(result, {
    exit,
    notCold,
    batch,
    date,
    baseline: baseline.label,
    candidate: `${flags.candidate ? resolve(flags.candidate) : 'this tree'} @ ${head}${dirty ? ' + uncommitted changes' : ''}`,
    allowFile: allowFile ? relative(ROOT, allowFile).replace(/\\/g, '/') : null,
    expires: allow?.expires ?? null,
    builds,
    timing,
  });
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, md);
  writeFileSync(join(work, 'candidate-surface.json'), JSON.stringify(cand));

  console.log(summaryLine(result) + (notCold ? `; NOT A VERIFIED COLD BUILD (${notCold})` : ''));
  for (const g of collapseDiffs(result.mustExplain).slice(0, 30))
    console.log(`  MUST ${g.field} · ${g.count} page(s), e.g. ${g.samples.join(', ')} · ${String(g.sig).slice(0, 160)}`);
  for (const r of result.unusedRules) console.log(`  unused rule #${r.index} ${r.field} — ${r.reason}`);
  if (result.redates.total) console.log(`  re-dated: ${result.redates.total} URL(s)${result.redates.loud ? ' (LOUD: > 50)' : ''}`);
  for (const t of timing) console.log(`  timing: ${t}`);
  console.log(`  report: ${relative(ROOT, reportPath).replace(/\\/g, '/')}`);

  if (result.expired) {
    console.error(`FAIL: allowlist ${flags.allow} expired on ${allow.expires} (date ${date}).`);
    return 2;
  }
  if (notCold) {
    console.error(
      `FAIL: ${notCold} build is not a verified cold build — ` +
        'a warm content layer can hide a rehype/Shiki change. Re-run without --no-build/--candidate.',
    );
  }
  return exit;
}

// ---------------------------------------------------------------------------
// Self-test

function selfTest() {
  const tmp = mkdtempSync(join(os.tmpdir(), 'seo-surface-selftest-'));
  let failed = 0;
  const cases = selfTestCases();
  try {
    cases.forEach((c, i) => {
      const dir = join(tmp, String(i));
      writeTree(join(dir, 'base'), c.base);
      writeTree(join(dir, 'cand'), c.cand);
      const allow = c.allow ? validateAllowlist(c.allow) : null;
      const opts = extractOptionsFor(allow);
      const result = compareSites(readDist(join(dir, 'base'), opts.base), readDist(join(dir, 'cand'), opts.cand), allow, { today: c.today });
      const fails = checkCase(c, result);
      renderMarkdown(result, { batch: 'self-test', date: c.today });
      if (fails.length) {
        failed++;
        console.error(`FAIL ${c.name}: ${fails.join('; ')}`);
      } else console.log(`ok   ${c.name} (exit ${result.exitCode}, ${result.mustExplain.length} must-explain)`);
      rmSync(dir, { recursive: true, force: true });
    });
    // The baseline tree must never land inside the repo.
    let refused = false;
    try {
      assertOutsideRepo(join(ROOT, '.seo-baseline'));
    } catch {
      refused = true;
    }
    if (refused) console.log('ok   a --work-dir inside the repo is refused');
    else {
      failed++;
      console.error('FAIL a --work-dir inside the repo was accepted');
    }
    try {
      assertOutsideRepo(tmp);
      console.log('ok   a --work-dir under the OS temp dir is accepted');
    } catch {
      failed++;
      console.error('FAIL the OS temp dir was refused as a --work-dir');
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  const total = cases.length + 2;
  if (failed) {
    console.error(`FAIL: seo-surface self-test, ${failed} of ${total} case(s) wrong`);
    return 1;
  }
  console.log(`OK: seo-surface self-test, all ${total} cases`);
  return 0;
}

// ---------------------------------------------------------------------------

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let code;
  try {
    const { mode, ref, flags } = parseArgs(process.argv.slice(2));
    code = mode === 'self-test' ? selfTest() : mode === 'baseline' ? baselineBuild(ref ?? 'origin/main', flags) : diff(flags);
  } catch (e) {
    console.error(`FAIL: ${/** @type {Error} */ (e).message}`);
    code = 1;
  }
  process.exit(code);
}
