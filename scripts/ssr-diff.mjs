#!/usr/bin/env node
/**
 * ssr-diff — proves a playground refactor did not change what the server
 * renders into a tool page (plan "Batch C": every kit wave runs it strict).
 *
 *   node scripts/ssr-diff.mjs snapshot <dir> [--dist dist] [--postbuild-log <file>]
 *   node scripts/ssr-diff.mjs compare  <dir> [--dist dist] [--postbuild-log <file>] [--verbose]
 *   node scripts/ssr-diff.mjs --self-test
 *
 * The container set is DERIVED, never hand-listed: every element in
 * `src/components/*Playground.astro` that carries `set:html` contributes its
 * static `id`. (A hand-written id map in the first plan draft missed
 * `#rx-highlight`, `#klt-canonical` and `#uug-inspect-result`.) The tool page
 * for each playground is the English `src/pages/<slug>.astro` that imports it,
 * plus its four locale copies — 39 tools × 5 locales today.
 *
 * Per built page it records: `<title>`, every `<h1>`, every ld+json body, the
 * inline-script count (CSP hashes depend on it), the outerHTML of every derived
 * container, and under `#playground` the `value` of every input, the text of
 * every textarea, the text of every `[data-cm-fallback]`, and every `.figcap`
 * (a wrong ResultPanel slug shows up as a changed figure label). Tools whose
 * playground seeds nothing (jq-playground, certificate-decoder) record title,
 * H1 and LD only. `--postbuild-log` adds the postbuild scripts' counts
 * (CodeMirror playgrounds, CSP hashes, inline-whitespace offenders, …).
 *
 * `snapshot` FAILS if a derived container id is absent from its built page —
 * a seed that silently went client-only is exactly the regression this exists
 * to catch.
 *
 * `compare` re-extracts the current dist/ and compares field by field:
 *   strict    byte-identical;
 *   semantic  identical after collapsing whitespace, dropping
 *             `data-astro-cid-*`, sorting class tokens — AND identical inner
 *             text (ld+json: identical parsed JSON);
 *   FAIL      anything else, including a container that is missing or emptied
 *             in the candidate, a removed fallback, or a changed postbuild count
 *             (a key only one side has counts as changed);
 *   EXPLAIN   a container / page present in the candidate but not the baseline
 *             (exit 1 too: a new seeded container is a reviewable change).
 * Exit 0 only when every field is strict or semantic. A baseline taken without
 * `--postbuild-log` cannot compare postbuild counts; the summary then says
 * POSTBUILD COUNTS NOT COMPARED in capitals rather than passing quietly.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  tags,
  getAttr,
  attrKind,
  findBlocks,
  blockById,
  blocksByAttr,
  classText,
  textContent,
  collapseWs,
  normalizeHtml,
} from './html-block.mjs';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const COMPONENTS = join(ROOT, 'src', 'components');
const PAGES = join(ROOT, 'src', 'pages');
export const LOCALES = ['', 'de', 'es', 'fr', 'pt-br'];
const SNAPSHOT_FILE = 'ssr-snapshot.json';

// ---------------------------------------------------------------------------
// Source side: derive the container set and the tool pages
// ---------------------------------------------------------------------------

/** Blank out frontmatter, <script> and <style> bodies, keeping offsets. */
export function templateOnly(src) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  let s = src.replace(/^---\r?\n[\s\S]*?\r?\n---/, blank);
  s = s.replace(/<script\b[\s\S]*?<\/script\s*>/gi, blank);
  s = s.replace(/<style\b[\s\S]*?<\/style\s*>/gi, blank);
  s = s.replace(/\{\/\*[\s\S]*?\*\/\}/g, blank).replace(/<!--[\s\S]*?-->/g, blank);
  return s;
}

/**
 * Container ids targeted by `set:html` in one component's source.
 * @returns {{ ids: string[], problems: string[] }}
 */
export function setHtmlTargets(src, label = 'component') {
  const ids = [];
  const problems = [];
  const tpl = templateOnly(src);
  for (const t of tags(tpl)) {
    if (t.kind !== 'open' || getAttr(t.attrs, 'set:html') === undefined) continue;
    const id = getAttr(t.attrs, 'id');
    const line = tpl.slice(0, t.start).split('\n').length;
    if (!id || attrKind(t.attrs, 'id') === 'expr') problems.push(`${label}:${line} set:html target has no static id`);
    else ids.push(id);
  }
  return { ids, problems };
}

/** { component: [ids] } for every src/components/*Playground.astro. */
export function deriveContainers(dir = COMPONENTS) {
  /** @type {Record<string, string[]>} */
  const byComponent = {};
  const problems = [];
  for (const f of readdirSync(dir).filter((n) => /Playground\.astro$/.test(n)).sort()) {
    const name = f.replace(/\.astro$/, '');
    const r = setHtmlTargets(readFileSync(join(dir, f), 'utf-8'), f);
    byComponent[name] = r.ids;
    problems.push(...r.problems);
  }
  return { byComponent, problems };
}

/** [{ slug, component }] from the English src/pages/<slug>.astro playground imports. */
export function deriveToolPages(dir = PAGES) {
  const out = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.astro')).sort()) {
    const src = readFileSync(join(dir, f), 'utf-8');
    const m = [...src.matchAll(/from\s+['"][./]*components\/(\w+Playground)\.astro['"]/g)];
    if (m.length === 1) out.push({ slug: f.replace(/\.astro$/, ''), component: m[0][1] });
    else if (m.length > 1) throw new Error(`${f} imports ${m.length} playgrounds; expected one`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Built side: extract one page
// ---------------------------------------------------------------------------

const hasClass = (t, c) => new RegExp(`(?:^|\\s)${c}(?:\\s|$)`).test(classText(t.attrs));

/**
 * @param {string} html  built page
 * @param {string[]} containerIds  ids this page's playground seeds
 * @param {{ seeded?: boolean }} [opts]
 */
export function extractPage(html, containerIds, opts = {}) {
  const seeded = opts.seeded ?? containerIds.length > 0;
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? null;
  const h1 = findBlocks(html, (t) => t.name === 'h1').map((b) => b.outer);
  const ld = [];
  let inlineScripts = 0;
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/type=["']?application\/ld\+json/i.test(m[1])) ld.push(m[2]);
    else if (!/\ssrc=/i.test(m[1])) inlineScripts++;
  }
  /** @type {Record<string, any>} */
  const rec = { title, h1, ld, inlineScripts, seeded };
  if (!seeded) return rec;

  rec.containers = {};
  rec.missing = [];
  for (const id of containerIds) {
    const b = blockById(html, id);
    rec.containers[id] = b ? b.outer : null;
    if (!b) rec.missing.push(id);
  }
  const pg = blockById(html, 'playground');
  rec.playground = pg !== null;
  const scope = pg ? pg.outer : '';
  rec.inputs = [];
  rec.textareas = [];
  for (const t of tags(scope)) {
    if (t.kind !== 'open') continue;
    if (t.name === 'input') {
      rec.inputs.push({ id: getAttr(t.attrs, 'id') ?? null, value: getAttr(t.attrs, 'value') ?? null });
    }
  }
  for (const b of findBlocks(scope, (t) => t.name === 'textarea')) {
    rec.textareas.push({ id: getAttr(b.tag.attrs, 'id') ?? null, text: b.inner });
  }
  rec.cmFallback = blocksByAttr(scope, 'data-cm-fallback').map((b) => textContent(b.inner));
  rec.figcaps = findBlocks(scope, (t) => hasClass(t, 'figcap')).map((b) => b.outer);
  return rec;
}

// ---------------------------------------------------------------------------
// Postbuild log counts
// ---------------------------------------------------------------------------

/**
 * Pull the postbuild scripts' numeric summary lines out of a build log. Each
 * recognised line becomes `key → [numbers…]`; the keys are line shapes, so a
 * renamed log line shows up as a missing key rather than passing silently.
 */
export function postbuildCounts(log) {
  /** @type {Record<string, number[]>} */
  const out = {};
  // Each pattern captures only the counts that matter, so incidental numbers
  // (footer byte sizes, timings, the build sha) never cause a diff.
  const patterns = [
    ['pagefind-languages', /Indexed (\d+) languages?/],
    ['pagefind-pages', /Indexed (\d+) pages?/],
    ['trailing-slash', /scanned (\d+) file\(s\), every internal href is correctly slashed/],
    ['inline-whitespace-warn', /WARN: (\d+) word\/inline-tag boundaries in (\d+) file/],
    ['inline-whitespace-hard', /scanned (\d+) file\(s\), no word runs into inline/],
    ['footer', /OK: (\d+) page\(s\) \[en (\d+), de (\d+), es (\d+), fr (\d+), pt-br (\d+)\].*?all (\d+) protected links.*?(\d+) social/],
    ['cm-modulepreload', /injected modulepreload hints into (\d+) page\(s\) across (\d+) CodeMirror playground/],
    ['sw-precache', /gen-sw: wrote .*?(\d+) precached URL/],
    ['csp-hashes', /injected (\d+) CSP script hash\(es\).*?scanned (\d+) page/],
  ];
  for (const [key, re] of patterns) {
    const lines = log.split(/\r?\n/).filter((l) => re.test(l));
    if (!lines.length) continue;
    const m = re.exec(lines[lines.length - 1]);
    if (m) out[key] = m.slice(1).map(Number);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

export function buildSnapshot({ dist, postbuildLog } = {}) {
  const distDir = resolve(dist ?? join(ROOT, 'dist'));
  const { byComponent, problems } = deriveContainers();
  const toolPages = deriveToolPages();
  const pages = {};
  const missingPages = [];
  const missingContainers = [];
  for (const { slug, component } of toolPages) {
    const ids = byComponent[component];
    if (!ids) {
      problems.push(`${slug}: page imports ${component}, which is not a *Playground.astro in src/components`);
      continue;
    }
    for (const loc of LOCALES) {
      const rel = `${loc ? `${loc}/` : ''}${slug}/index.html`;
      const file = join(distDir, rel);
      if (!existsSync(file)) {
        missingPages.push(rel);
        continue;
      }
      const rec = extractPage(readFileSync(file, 'utf-8'), ids);
      rec.component = component;
      pages[rel] = rec;
      for (const id of rec.missing ?? []) missingContainers.push(`${rel} #${id}`);
      if (rec.seeded && !rec.playground) missingContainers.push(`${rel} #playground`);
    }
  }
  const ids = Object.values(byComponent).flat();
  return {
    snapshot: {
      version: 1,
      containers: byComponent,
      containerCount: ids.length,
      componentCount: Object.keys(byComponent).length,
      toolCount: toolPages.length,
      locales: LOCALES.map((l) => l || 'en'),
      pages,
      postbuild: postbuildLog ? postbuildCounts(readFileSync(postbuildLog, 'utf-8')) : null,
    },
    problems,
    missingPages,
    missingContainers,
  };
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

const LD_DATE_KEYS = new Set(['dateModified', 'datePublished', 'dateCreated']);

/**
 * Stable JSON with keys sorted. With `maskDates`, date-valued keys become
 * "<date>": a tool's dateModified moves whenever its component changes (that is
 * the sitemap/IndexNow system, owned by the SEO guard), not its seeded content.
 */
function stableJson(text, maskDates = false) {
  try {
    const sort = (v) =>
      Array.isArray(v)
        ? v.map(sort)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, maskDates && LD_DATE_KEYS.has(k) ? '<date>' : sort(v[k])]))
          : v;
    return JSON.stringify(sort(JSON.parse(text)));
  } catch {
    return null;
  }
}

/** strict | semantic | fail for two HTML fragments. */
export function compareHtml(a, b) {
  if (a === b) return 'strict';
  if (a == null || b == null) return 'fail';
  const same = normalizeHtml(a) === normalizeHtml(b) && collapseWs(textContent(a)) === collapseWs(textContent(b));
  return same ? 'semantic' : 'fail';
}

const isEmptyBlock = (outer) => {
  if (outer == null) return true;
  const inner = outer.replace(/^<[^>]*>/, '').replace(/<\/[\w-]+>\s*$/, '');
  return collapseWs(textContent(inner)) === '' && !/<[a-z]/i.test(inner);
};

/**
 * Compare two page records.
 * @returns {Array<{ field: string, status: 'strict'|'semantic'|'fail'|'explain', detail?: string }>}
 */
export function comparePage(base, cand) {
  const out = [];
  const push = (field, status, detail) => out.push({ field, status, detail });

  // title
  if (base.title === cand.title) push('title', 'strict');
  else if (base.title != null && cand.title != null && collapseWs(base.title) === collapseWs(cand.title)) push('title', 'semantic');
  else push('title', 'fail', `${JSON.stringify(base.title)} → ${JSON.stringify(cand.title)}`);

  // h1
  if (base.h1.length !== cand.h1.length) push('h1', 'fail', `h1 count ${base.h1.length} → ${cand.h1.length}`);
  else
    base.h1.forEach((h, i) => {
      // Search engines read an H1's text, not its markup. Batch D splits the
      // tool H1 into a name span and a claim span with the text node intact,
      // so the semantic tier compares H1s by collapsed text: identical text =
      // semantic, any text change = fail. (The SEO guard checks the same.)
      const ht = collapseWs(textContent(h));
      const ct = collapseWs(textContent(cand.h1[i]));
      const s = h === cand.h1[i] ? 'strict' : ht === ct ? 'semantic' : 'fail';
      push(`h1[${i}]`, s, s === 'fail' ? `${ht} → ${ct}` : undefined);
    });

  // ld+json
  if (base.ld.length !== cand.ld.length) push('ld', 'fail', `ld+json blocks ${base.ld.length} → ${cand.ld.length}`);
  else
    base.ld.forEach((l, i) => {
      if (l === cand.ld[i]) push(`ld[${i}]`, 'strict');
      else if (stableJson(l) !== null && stableJson(l, true) === stableJson(cand.ld[i], true)) push(`ld[${i}]`, 'semantic');
      else push(`ld[${i}]`, 'fail', 'ld+json body changed');
    });

  // inline scripts
  push('inlineScripts', base.inlineScripts === cand.inlineScripts ? 'strict' : 'fail',
    base.inlineScripts === cand.inlineScripts ? undefined : `${base.inlineScripts} → ${cand.inlineScripts}`);

  if (!base.seeded) {
    if (cand.seeded) push('seeded', 'explain', 'page now seeds containers it did not before');
    return out;
  }

  // containers
  const candContainers = cand.containers ?? {};
  for (const [id, outer] of Object.entries(base.containers)) {
    const c = candContainers[id];
    if (c == null) {
      push(`#${id}`, 'fail', 'container missing in candidate');
      continue;
    }
    if (!isEmptyBlock(outer) && isEmptyBlock(c)) {
      push(`#${id}`, 'fail', 'container emptied in candidate');
      continue;
    }
    const s = compareHtml(outer, c);
    push(`#${id}`, s, s === 'fail' ? firstTextDiff(outer, c) : undefined);
  }
  for (const id of Object.keys(candContainers)) {
    if (!(id in base.containers)) push(`#${id}`, 'explain', 'container present in candidate only');
  }

  // inputs / textareas / fallbacks / figcaps — ordered lists
  const list = (field, a = [], b = [], cmp) => {
    if (a.length !== b.length) {
      push(field, 'fail', `${field} count ${a.length} → ${b.length}`);
      return;
    }
    a.forEach((x, i) => {
      const s = cmp(x, b[i]);
      const detail = typeof x === 'string' && typeof b[i] === 'string' ? firstTextDiff(x, b[i]) : `${JSON.stringify(x).slice(0, 120)} → ${JSON.stringify(b[i]).slice(0, 120)}`;
      push(`${field}[${i}]`, s, s === 'fail' ? detail : undefined);
    });
  };
  const exact = (x, y) => (JSON.stringify(x) === JSON.stringify(y) ? 'strict' : 'fail');
  list('input', base.inputs, cand.inputs, exact);
  list('textarea', base.textareas, cand.textareas, exact);
  list('cm-fallback', base.cmFallback, cand.cmFallback, exact);
  // A figure cap is pure text (dots are aria-hidden decoration): the kit's
  // opt-in split wraps the ` · category` tail in a span and renames the
  // summary's class, so caps compare by collapsed text, never by markup.
  const capText = (x, y) => (x === y ? 'strict' : collapseWs(textContent(x)) === collapseWs(textContent(y)) ? 'semantic' : 'fail');
  const baseCaps = base.figcaps ?? [];
  const candCaps = cand.figcaps ?? [];
  if (baseCaps.length === 0 && candCaps.length > 0) {
    // A tool that never had a figure cap gains one when it adopts the kit's
    // ResultPanel / EditorPane. That is new visible text, not a change to an
    // existing cap: report each as EXPLAIN with its text, so a run must name
    // it (--allow-new figcap) instead of either failing or passing silently.
    candCaps.forEach((c, i) => push(`figcap+[${i}]`, 'explain', `new cap: ${collapseWs(textContent(c))}`));
  } else {
    list('figcap', baseCaps, candCaps, capText);
  }
  return out;
}

function firstTextDiff(a, b) {
  const x = collapseWs(textContent(a));
  const y = collapseWs(textContent(b));
  if (x === y) return 'markup differs beyond whitespace / cid / class order';
  let i = 0;
  while (i < x.length && x[i] === y[i]) i++;
  return `text differs at ${i}: …${x.slice(Math.max(0, i - 20), i + 30)}… → …${y.slice(Math.max(0, i - 20), i + 30)}…`;
}

export function compareSnapshots(base, cand) {
  /** @type {Array<{ page: string, field: string, status: string, detail?: string }>} */
  const results = [];
  for (const [page, rec] of Object.entries(base.pages)) {
    const c = cand.pages[page];
    if (!c) {
      results.push({ page, field: 'page', status: 'fail', detail: 'page missing in candidate' });
      continue;
    }
    for (const r of comparePage(rec, c)) results.push({ page, ...r });
  }
  for (const page of Object.keys(cand.pages)) {
    if (!(page in base.pages)) results.push({ page, field: 'page', status: 'explain', detail: 'page present in candidate only' });
  }
  if (base.postbuild) {
    if (!cand.postbuild) {
      results.push({ page: '(postbuild)', field: 'postbuild', status: 'fail', detail: 'baseline has postbuild counts; pass --postbuild-log to compare them' });
    } else {
      for (const [k, v] of Object.entries(base.postbuild)) {
        const cv = cand.postbuild[k];
        const ok = JSON.stringify(v) === JSON.stringify(cv);
        results.push({ page: '(postbuild)', field: k, status: ok ? 'strict' : 'fail', detail: ok ? undefined : `${JSON.stringify(v)} → ${JSON.stringify(cv ?? null)}` });
      }
      // A key only the candidate has is a changed count too: e.g. the
      // inline-whitespace WARN line only prints once there is something to warn about.
      for (const [k, cv] of Object.entries(cand.postbuild)) {
        if (!(k in base.postbuild)) {
          results.push({ page: '(postbuild)', field: k, status: 'fail', detail: `postbuild key present in candidate only: null → ${JSON.stringify(cv)}` });
        }
      }
    }
  }
  return results;
}

/**
 * The loud line for a baseline taken without --postbuild-log: those counts
 * were never compared, and a PASS must not read as if they had been.
 * @returns {string | null}
 */
export function postbuildNotice(base, cand) {
  if (base.postbuild) return null;
  return `WARNING: POSTBUILD COUNTS NOT COMPARED — the baseline snapshot was taken without --postbuild-log${cand.postbuild ? ' (the candidate has them; re-snapshot the baseline with --postbuild-log)' : ''}; this PASS/FAIL covers page fields only`;
}

function summarise(results) {
  const by = { strict: 0, semantic: 0, fail: 0, explain: 0, allowed: 0 };
  for (const r of results) by[r.status]++;
  return by;
}

/**
 * Turn EXPLAIN results whose field matches one of the `--allow-new` regexes
 * into ALLOWED (an addition the run named on purpose: a new figure cap, a new
 * seeded container). FAILs are never converted, so a removed or changed cap,
 * container or text still fails whatever is allowed.
 */
export function applyAllowNew(results, patterns) {
  const res = patterns.map((p) => [p, new RegExp(p)]);
  return results.map((r) => {
    if (r.status !== 'explain') return r;
    const hit = res.find(([, re]) => re.test(r.field));
    return hit ? { ...r, status: 'allowed', allowedBy: hit[0] } : r;
  });
}

// ---------------------------------------------------------------------------
// Self-test — the nine fixtures named in the plan
// ---------------------------------------------------------------------------

const FIX_PAGE = (results, extra = '') => `<!DOCTYPE html><html lang="en"><head><title>Subnet Calculator — OpsCanopy</title>
<script type="application/ld+json">{"@type":"SoftwareApplication","name":"Subnet","dateModified":"2026-09-26"}</script>
<script>window.x=1</script></head><body><main><h1 class="display-lg">Subnet <span>Calculator</span></h1>
<section id="playground"><div class="snc-pg" data-astro-cid-ab12cd34>
<input id="snc-input" type="text" value="192.168.1.0/24">
<div class="editor"><pre class="snc-cm-fallback code-mono" data-cm-fallback>rules: []</pre></div>
${extra}
<div class="snc-panel instrument-flush"><div class="figcap" data-tone="traffic"><span class="figcap__dots" aria-hidden="true"><i class="figcap__dot"></i><i class="figcap__dot"></i><i class="figcap__dot"></i></span><span class="figcap__label" title="fig. 10 — subnet-calculator · networking">fig. 10 — subnet-calculator · networking</span></div>
${results}
</div></div></section></main></body></html>`;

const BASE_RESULTS = `<div id="snc-results" class="snc-results" data-astro-cid-ab12cd34><dl class="snc-rows is-mono"><dt>Usable hosts</dt><dd data-k="row:Usable hosts">254</dd></dl></div>`;

export function selfTest() {
  const ids = ['snc-results'];
  const base = FIX_PAGE(BASE_RESULTS);
  const cases = [
    ['identical', base, true],
    ['whitespace-only', FIX_PAGE(BASE_RESULTS.replace('<dl', '\n  <dl').replace('</dl>', '</dl>\n')), true],
    ['cid rename', FIX_PAGE(BASE_RESULTS.replaceAll('data-astro-cid-ab12cd34', 'data-astro-cid-zz99yy88')).replaceAll('data-astro-cid-ab12cd34', 'data-astro-cid-zz99yy88'), true],
    ['class reorder', FIX_PAGE(BASE_RESULTS.replace('class="snc-rows is-mono"', 'class="is-mono snc-rows"')), true],
    ['inner-text change', FIX_PAGE(BASE_RESULTS.replace('>254<', '>253<')), false],
    // A 4th element pins the specific detail the dedicated branch emits, so
    // the case cannot pass on the generic text-diff fallback alone.
    ['container missing', FIX_PAGE(''), false, 'container missing in candidate'],
    ['data-results hook added', FIX_PAGE(BASE_RESULTS.replace('class="snc-results"', 'class="snc-results" data-results')), true],
    ['data-results hook plus a text change', FIX_PAGE(BASE_RESULTS.replace('class="snc-results"', 'class="snc-results" data-results').replace('>254<', '>255<')), false],
    ['container emptied', FIX_PAGE(`<div id="snc-results" class="snc-results" data-astro-cid-ab12cd34></div>`), false, 'container emptied in candidate'],
    ['fallback <pre> removed', base.replace(/<pre class="snc-cm-fallback[^]*?<\/pre>/, ''), false],
    ['ld+json dateModified moved only', base.replace('"dateModified":"2026-09-26"', '"dateModified":"2026-10-02"'), true],
    ['ld+json name changed', base.replace('"name":"Subnet"', '"name":"Subnet Calculator"'), false],
    ['h1 split into name/claim spans, same text', base.replace('<h1 class="display-lg">Subnet <span>Calculator</span></h1>', '<h1 class="text-ink"><span class="block display-lg">Subnet</span> <span class="block body-lg">Calculator</span></h1>'), true],
    ['h1 text changed by one word', base.replace('Subnet <span>Calculator</span>', 'Subnet <span>Calculators</span>'), false],
    ['h1 lost its inter-span space', base.replace('<h1 class="display-lg">Subnet <span>Calculator</span></h1>', '<h1><span class="block">Subnet</span><span class="block">Calculator</span></h1>'), false],
    ['figcap split into a sub span, same text', base.replace('fig. 10 — subnet-calculator · networking</span>', 'fig. 10 — subnet-calculator<span class="figcap__sub"> · networking</span></span>'), true],
    ['figcap label text changed', base.replaceAll('subnet-calculator · networking', 'subnet-splitter · networking'), false],
  ];
  const baseRec = extractPage(base, ids);
  let failed = 0;
  const lines = [];
  // Pin the fixture itself: the baseline must have every field populated, or
  // the "fail" cases could pass for the wrong reason.
  const pins = [
    ['baseline container found', baseRec.containers['snc-results'] != null],
    ['baseline fallback found', baseRec.cmFallback.length === 1],
    ['baseline figcap found', baseRec.figcaps.length === 1],
    ['baseline input value found', baseRec.inputs[0]?.value === '192.168.1.0/24'],
  ];
  for (const [name, ok] of pins) {
    if (!ok) failed++;
    lines.push(`${ok ? 'ok  ' : 'FAIL'} pin: ${name}`);
  }
  for (const [name, html, shouldPass, wantDetail] of cases) {
    const rec = extractPage(html, ids);
    const res = comparePage(baseRec, rec);
    const bad = res.filter((r) => r.status === 'fail' || r.status === 'explain');
    const passed = bad.length === 0;
    const detailOk = !wantDetail || bad.some((b) => b.detail === wantDetail);
    const ok = passed === shouldPass && detailOk;
    if (!ok) failed++;
    const why = bad.map((b) => `${b.field}: ${b.detail ?? b.status}`).join('; ');
    lines.push(`${ok ? 'ok  ' : 'FAIL'} ${name} → ${passed ? 'pass' : `fail (${why})`} [expected ${shouldPass ? 'pass' : 'fail'}${wantDetail ? ` with "${wantDetail}"` : ''}]`);
  }
  // New figure caps on a page that had none: EXPLAIN unless named by
  // --allow-new; a removed cap or a text change is never excused.
  const capRe = /<div class="figcap"[^]*?<\/span><\/div>/;
  const noCap = base.replace(capRe, '');
  const noCapRec = extractPage(noCap, ids);
  const allowCases = [
    ['new cap, not allowed → fail', noCapRec, base, [], false],
    ['new cap, --allow-new ^figcap\\+ → pass', noCapRec, base, ['^figcap\\+'], true],
    ['cap removed, --allow-new ^figcap\\+ → fail', baseRec, noCap, ['^figcap\\+'], false],
    ['new cap allowed but container text changed → fail', noCapRec, base.replace('>254<', '>253<'), ['^figcap\\+'], false],
    ['allow pattern for a different field does not excuse a new cap → fail', noCapRec, base, ['^#jq-results$'], false],
    // A FAIL whose field the pattern matches must still fail: --allow-new
    // only ever converts EXPLAIN (a broad ^figcap must not excuse a changed cap).
    ['broad --allow-new ^figcap does not excuse a changed cap → fail', baseRec, base.replaceAll('subnet-calculator · networking', 'subnet-splitter · networking'), ['^figcap'], false],
  ];
  const capPinOk = noCapRec.figcaps.length === 0 && noCap !== base;
  if (!capPinOk) failed++;
  lines.push(`${capPinOk ? 'ok  ' : 'FAIL'} pin: cap-less baseline built from the fixture`);
  for (const [name, b, html, pats, shouldPass] of allowCases) {
    const res = applyAllowNew(comparePage(b, extractPage(html, ids)), pats);
    const bad = res.filter((r) => r.status === 'fail' || r.status === 'explain');
    const passed = bad.length === 0;
    const ok = passed === shouldPass;
    if (!ok) failed++;
    lines.push(`${ok ? 'ok  ' : 'FAIL'} ${name} [${passed ? 'pass' : `fail: ${bad.map((x) => x.field).join(', ')}`}]`);
  }
  // Source-side derivation: multi-line tag, dynamic id, commented-out target.
  const src = `---\nconst x = a < b;\n---\n<div\n  id="rx-highlight"\n  class="a"\n  set:html={seed}\n></div>\n{/* <div id="ghost" set:html={x}></div> */}\n<p id={dyn} set:html={y}></p>\n<script>const s = '<div id="inscript" set:html={z}>';</script>`;
  const r = setHtmlTargets(src, 'fixture');
  const derOk = JSON.stringify(r.ids) === '["rx-highlight"]' && r.problems.length === 1;
  if (!derOk) failed++;
  lines.push(`${derOk ? 'ok  ' : 'FAIL'} derive: multi-line target found, commented/script targets ignored, dynamic id reported (${JSON.stringify(r)})`);
  // Postbuild counts parse.
  const pc = postbuildCounts(
    'OK: injected modulepreload hints into 95 page(s) across 19 CodeMirror playground(s).\r\n' +
      'gen-sw: wrote dist/sw.js (build f7331d8, 7 precached URL(s))\n' +
      'OK: injected 11 CSP script hash(es) into dist/_headers (scanned 559 page(s)).',
  );
  const pcOk = JSON.stringify(pc) === '{"cm-modulepreload":[95,19],"sw-precache":[7],"csp-hashes":[11,559]}';
  if (!pcOk) failed++;
  lines.push(`${pcOk ? 'ok  ' : 'FAIL'} postbuild counts parse (${JSON.stringify(pc)})`);
  // Postbuild compare: a key only the candidate has fails; a baseline with no
  // postbuild counts is announced loudly rather than passing quietly.
  const pbBase = { pages: {}, postbuild: { 'csp-hashes': [11, 559] } };
  const pbCand = { pages: {}, postbuild: { 'csp-hashes': [11, 559], 'inline-whitespace-warn': [3, 2] } };
  const pbRes = compareSnapshots(pbBase, pbCand);
  const pbOk =
    pbRes.some((r) => r.field === 'inline-whitespace-warn' && r.status === 'fail' && /candidate only/.test(r.detail ?? '')) &&
    pbRes.some((r) => r.field === 'csp-hashes' && r.status === 'strict');
  if (!pbOk) failed++;
  lines.push(`${pbOk ? 'ok  ' : 'FAIL'} postbuild key present in candidate only → fail (${JSON.stringify(pbRes)})`);
  const nNone = postbuildNotice({ pages: {}, postbuild: null }, pbCand);
  const nOk = /POSTBUILD COUNTS NOT COMPARED/.test(nNone ?? '') && postbuildNotice(pbBase, pbCand) === null;
  if (!nOk) failed++;
  lines.push(`${nOk ? 'ok  ' : 'FAIL'} baseline without --postbuild-log is announced (${JSON.stringify(nNone)})`);
  return { failed, lines, cases: cases.length };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dist' || a === '--postbuild-log') args[a.slice(2)] = argv[++i];
    else if (a === '--allow-new') (args['allow-new'] ??= []).push(argv[++i]);
    else if (a.startsWith('--')) args[a.slice(2)] = true;
    else args._.push(a);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args['self-test']) {
    const { failed, lines, cases } = selfTest();
    for (const l of lines) console.log(`ssr-diff self-test: ${l}`);
    console.log(`ssr-diff self-test: ${failed === 0 ? 'PASS' : 'FAIL'} — ${cases} fixtures, ${failed} failure(s)`);
    process.exit(failed === 0 ? 0 : 1);
  }
  const [cmd, dir] = args._;
  if (!['snapshot', 'compare'].includes(cmd) || !dir) {
    console.error('usage: ssr-diff.mjs snapshot|compare <dir> [--dist dist] [--postbuild-log file] [--verbose] | --self-test');
    process.exit(2);
  }
  const { snapshot, problems, missingPages, missingContainers } = buildSnapshot({ dist: args.dist, postbuildLog: args['postbuild-log'] });
  const ids = Object.values(snapshot.containers).flat();
  const seededFiles = Object.values(snapshot.containers).filter((v) => v.length).length;
  console.log(`ssr-diff: ${ids.length} container ids across ${seededFiles} seeding playgrounds (${snapshot.componentCount} *Playground.astro files; unseeded: ${Object.entries(snapshot.containers).filter(([, v]) => !v.length).map(([k]) => k).join(', ') || 'none'})`);
  console.log(`ssr-diff: ids ${ids.map((i) => `#${i}`).join(' ')}`);
  console.log(`ssr-diff: ${Object.keys(snapshot.pages).length} pages recorded (${snapshot.toolCount} tools × ${LOCALES.length} locales)`);
  if (snapshot.postbuild) console.log(`ssr-diff: postbuild counts ${JSON.stringify(snapshot.postbuild)}`);
  const hard = [...problems, ...missingPages.map((p) => `built page missing: ${p}`), ...missingContainers.map((c) => `derived container absent from built page: ${c}`)];
  for (const h of hard) console.error(`ssr-diff: FAIL ${h}`);

  if (cmd === 'snapshot') {
    if (hard.length) process.exit(1);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, SNAPSHOT_FILE), JSON.stringify(snapshot, null, 1));
    console.log(`ssr-diff: snapshot written to ${join(dir, SNAPSHOT_FILE)}`);
    process.exit(0);
  }

  const basePath = join(dir, SNAPSHOT_FILE);
  if (!existsSync(basePath)) {
    console.error(`ssr-diff: no baseline at ${basePath} — run snapshot first`);
    process.exit(2);
  }
  const base = JSON.parse(readFileSync(basePath, 'utf-8'));
  const results = applyAllowNew(compareSnapshots(base, snapshot), args['allow-new'] ?? []);
  const sum = summarise(results);
  const pagesBy = {};
  for (const r of results) {
    const p = (pagesBy[r.page] ??= { strict: 0, semantic: 0, fail: 0, explain: 0, allowed: 0 });
    p[r.status]++;
  }
  const pageEntries = Object.entries(pagesBy).filter(([k]) => k !== '(postbuild)');
  const strictPages = pageEntries.filter(([, p]) => p.semantic + p.fail + p.explain === 0).length;
  const pb = pagesBy['(postbuild)'];
  const notice = postbuildNotice(base, snapshot);
  for (const r of results) {
    if (r.status === 'fail' || r.status === 'explain' || (args.verbose && r.status === 'semantic')) {
      console.log(`ssr-diff: ${r.status.toUpperCase().padEnd(8)} ${r.page} ${r.field}${r.detail ? ` — ${r.detail}` : ''}`);
    }
  }
  const allowed = results.filter((r) => r.status === 'allowed');
  for (const r of allowed) if (args.verbose) console.log(`ssr-diff: ALLOWED  ${r.page} ${r.field}${r.detail ? ` — ${r.detail}` : ''}`);
  const unusedAllow = (args['allow-new'] ?? []).filter((pat) => !allowed.some((r) => r.allowedBy === pat));
  for (const pat of unusedAllow) console.error(`ssr-diff: FAIL --allow-new ${pat} matched nothing (stale or mistyped)`);
  if (unusedAllow.length) hard.push(...unusedAllow.map((p) => `unused --allow-new ${p}`));
  console.log(`ssr-diff: compare ${basename(dir)} — fields strict ${sum.strict}, semantic ${sum.semantic}, ALLOWED-NEW ${allowed.length}, FAIL ${sum.fail}, EXPLAIN ${sum.explain}; pages fully strict ${strictPages}/${pageEntries.length}; postbuild ${pb ? `${pb.strict} strict, ${pb.fail} FAIL` : 'NOT COMPARED'}`);
  if (notice) console.error(`ssr-diff: ${notice}`);
  const ok = hard.length === 0 && sum.fail === 0 && sum.explain === 0;
  console.log(`ssr-diff: ${ok ? 'PASS' : 'FAIL'}${notice ? ' (page fields only — POSTBUILD COUNTS NOT COMPARED)' : ''}`);
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
