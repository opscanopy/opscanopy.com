/**
 * Batch D codemod — the one pass over the 195 tool pages (39 tools × 5
 * locales). Pure transform + CLI; `src/lib/move-tool-lede.test.ts` drives the
 * transform over fixture strings.
 *
 *   node scripts/codemods/move-tool-lede.mjs [--dry] [--verbose]
 *
 * Per file (every `src/pages/**\/*.astro` that renders a `<ToolHero>` block —
 * `index.astro` is excluded by requiring the block):
 *
 *  1. Lede move. Cut the first `<Fragment slot="lead">…</Fragment>` INSIDE the
 *     `<ToolHero>` block only (every tool page carries a second one inside
 *     `<ToolCrossLinks>`), and insert it as `<ToolLede>…</ToolLede>`, the LAST
 *     child of `#playground`'s `.container-page` (after any VerifyPanel), so
 *     the paragraph directly precedes the first visible `<h2>` of `#why`.
 *     `#playground` is located by id (two class orders exist). The text is
 *     moved byte for byte apart from re-indentation: original line breaks are
 *     preserved (`check-inline-whitespace` hard-fails `word<span class="code-mono`)
 *     and the whitespace-collapsed inner text is asserted identical. The
 *     `ToolLede` import is added next to the `ToolHero` import.
 *  2. Rail. Direct children of every `.container-page` in the template lose
 *     `mx-auto` (when paired with a `max-w-*`) and `text-center` / any
 *     `*:text-center` variant; a descendant of such a child that centres its own
 *     measure (`mx-auto` + `max-w-*`, the hero-style lede paragraph) loses its
 *     `mx-auto` too, so the measure hangs from the same edge as its wrapper.
 *     This is exactly `src/lib/rail.test.ts`'s rule, which the pass empties for
 *     these files.
 *  3. `<Button>`s inside a `bg-inverse` section (the `#next` band; a few pages'
 *     `#cli` / `#install` bands) take `variant="inverse"` — anchor text unchanged.
 *  4. `<CodeBlock>`s inside `<section id="reference">` take `fig="NN.k"`: NN the
 *     tool's registry index (the same number the result panel's cap carries), k
 *     the block's order in the section.
 *  5. `<FaqList faqs={faqs} />` → `<FaqList faqs={faqs} align="left" />`.
 *
 * Every step asserts its count (exactly one lead removed, one lede inserted,
 * one FaqList, …) and the CLI asserts the run touched exactly 195 files, so a
 * drifted page fails the run instead of being half-migrated. Line endings are
 * preserved per file (the tree is CRLF under core.autocrlf).
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, join, relative, dirname } from 'node:path';
import { findBlocks, blockById, directChildren, blockFrom, tags, getAttr, classText, textContent, collapseWs } from '../html-block.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const EXPECTED_FILES = 195;

// ---------------------------------------------------------------------------
// Helpers

const tok = (cls) => new RegExp(`^(?:[a-z0-9]+:)*${cls}$`);
const MX_AUTO = tok('mx-auto');
const MAX_W = tok('max-w-[\\w.\\[\\]()-]+');
const CENTER = tok('text-center');

function eolOf(s) {
  return s.includes('\r\n') ? '\r\n' : '\n';
}
function lineStart(s, i) {
  const j = s.lastIndexOf('\n', i - 1);
  return j === -1 ? 0 : j + 1;
}
function lineEnd(s, i) {
  // index just past the EOL that ends the line containing i
  const j = s.indexOf('\n', i);
  return j === -1 ? s.length : j + 1;
}
function indentAt(s, i) {
  const ls = lineStart(s, i);
  const m = s.slice(ls, i).match(/^[ \t]*/);
  return m ? m[0] : '';
}
/** The template part of an Astro file begins after the closing frontmatter fence. */
function templateStart(s) {
  if (!s.startsWith('---')) return 0;
  const m = /\r?\n---[ \t]*\r?\n/.exec(s.slice(3));
  return m ? 3 + m.index + m[0].length : 0;
}

/**
 * Template-expression depth at offset `at` of an Astro template fragment: the
 * number of `{` not yet closed. Plain brace counting on purpose: quote-aware
 * scanning would trip on apostrophes in JSX text inside a `.map`, while
 * attribute expressions (`code={x}`) and template literals (`${…}`) are
 * balanced. A tag at depth > 0 sits inside a `{…}` block such as a `.map(...)`.
 */
export function exprDepth(s, at) {
  let depth = 0;
  for (let i = 0; i < at; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}' && depth > 0) depth--;
  }
  return depth;
}

/**
 * Registry slugs in `tools` array order, parsed from src/data/tools.ts (the
 * codemod runs under plain node, which cannot import the .ts). The test
 * compares this with the real export.
 */
export function registrySlugs(toolsTs) {
  const start = toolsTs.indexOf('export const tools');
  const end = toolsTs.indexOf('export const liveTools');
  if (start < 0 || end < 0 || end < start) throw new Error('tools.ts: cannot find the `tools` array');
  return [...toolsTs.slice(start, end).matchAll(/^ {4}slug: '([a-z0-9-]+)',$/gm)].map((m) => m[1]);
}

// ---------------------------------------------------------------------------
// Transform

/**
 * @param {string} src file contents
 * @param {{ figNo: string }} opts figNo = zero-padded registry number ("07")
 * @returns {{ out: string, stats: Record<string, number>, lede: string }}
 */
export function transformToolPage(src, { figNo }) {
  const EOL = eolOf(src);
  const stats = { leadRemoved: 0, ledeInserted: 0, railChildren: 0, railDescendants: 0, buttons: 0, figs: 0, figsSkippedInExpr: 0, faq: 0, importAdded: 0 };
  const edits = []; // { start, end, text } on the ORIGINAL string, applied last-to-first
  const tplStart = templateStart(src);
  const inTemplate = (b) => b.start >= tplStart;

  // ── 1. lede move ───────────────────────────────────────────────────────
  const heroes = findBlocks(src, (t) => t.name === 'ToolHero').filter(inTemplate);
  if (heroes.length !== 1) throw new Error(`expected exactly one <ToolHero> block, found ${heroes.length}`);
  const hero = heroes[0];
  const leads = findBlocks(hero.inner, (t) => t.name === 'Fragment' && getAttr(t.attrs, 'slot') === 'lead');
  if (leads.length !== 1) throw new Error(`expected exactly one <Fragment slot="lead"> inside <ToolHero>, found ${leads.length}`);
  const lead = leads[0];
  const leadStart = hero.innerStart + lead.start;
  const leadEnd = hero.innerStart + lead.end;
  const remStart = lineStart(src, leadStart);
  const remEnd = lineEnd(src, leadEnd);
  if (src.slice(remStart, leadStart).trim() !== '') throw new Error('lead Fragment does not start its line');
  if (src.slice(leadEnd, remEnd).trim() !== '') throw new Error('lead Fragment does not end its line');
  const leadIndent = src.slice(remStart, leadStart);
  const segs = lead.inner.split(/\r?\n/);
  if (segs.length < 3 || segs[0].trim() !== '' || segs[segs.length - 1].trim() !== '')
    throw new Error('lead Fragment is not a multi-line block (open tag ends its line, close tag starts its own)');
  const contentLines = segs.slice(1, -1);
  const ledeText = collapseWs(textContent(lead.inner));
  if (!ledeText) throw new Error('lead Fragment has no text');
  edits.push({ start: remStart, end: remEnd, text: '' });
  stats.leadRemoved = 1;

  const pg = blockById(src, 'playground');
  if (!pg || pg.start < tplStart) throw new Error('no <section id="playground"> in the template');
  const containers = findBlocks(pg.inner, (t) => classText(t.attrs).split(/\s+/).includes('container-page'));
  if (containers.length !== 1) throw new Error(`expected exactly one .container-page inside #playground, found ${containers.length}`);
  const cp = containers[0];
  const closeAt = pg.innerStart + cp.innerEnd; // '<' of the container's closing tag
  const closeLine = lineStart(src, closeAt);
  if (src.slice(closeLine, closeAt).trim() !== '') throw new Error('#playground .container-page closing tag does not start its line');
  const childIndent = indentAt(src, closeAt) + '  ';
  const strip = leadIndent.length + 2;
  const reindented = contentLines.map((l) => {
    if (l.trim() === '') return '';
    const lead = l.match(/^[ \t]*/)[0];
    if (lead.length < strip) throw new Error(`lede line indented less than its Fragment (+2): "${l.slice(0, 60)}"`);
    return childIndent + '  ' + l.slice(strip);
  });
  const ledeBlock = [`${childIndent}<ToolLede>`, ...reindented, `${childIndent}</ToolLede>`].join(EOL) + EOL;
  edits.push({ start: closeLine, end: closeLine, text: ledeBlock });
  stats.ledeInserted = 1;

  // import next to ToolHero's
  const imp = src.match(/^([ \t]*)import ToolHero from (['"])(.*?)ToolHero\.astro\2;[ \t]*\r?\n/m);
  if (!imp) throw new Error('no `import ToolHero from …` line');
  if (/import ToolLede from/.test(src)) throw new Error('ToolLede already imported — file already migrated?');
  const impEnd = imp.index + imp[0].length;
  edits.push({ start: impEnd, end: impEnd, text: `${imp[1]}import ToolLede from ${imp[2]}${imp[3]}ToolLede.astro${imp[2]};${EOL}` });
  stats.importAdded = 1;

  // ── 2. rail ────────────────────────────────────────────────────────────
  const classEdits = new Map(); // tagStart -> edit (dedupe: a block may be reached twice)
  function stripTokens(tag, absStart, { center }) {
    if (getAttr(tag.attrs, 'class:list') !== undefined) throw new Error(`class:list on a rail candidate at offset ${absStart} — migrate by hand`);
    const m = /\sclass="([^"]*)"/.exec(tag.attrs);
    if (!m) return false;
    const tokens = m[1].split(/\s+/).filter(Boolean);
    const hasMaxW = tokens.some((x) => MAX_W.test(x));
    const kept = tokens.filter((x) => !((hasMaxW && MX_AUTO.test(x)) || (center && CENTER.test(x))));
    if (kept.length === tokens.length) return false;
    // attrs text starts right after the tag name: `<name` + attrs
    const attrsStart = absStart + 1 + tag.name.length;
    const valStart = attrsStart + m.index + m[0].indexOf('"') + 1;
    classEdits.set(absStart, { start: valStart, end: valStart + m[1].length, text: kept.join(' ') });
    return true;
  }
  for (const c of findBlocks(src, (t) => classText(t.attrs).split(/\s+/).includes('container-page')).filter(inTemplate)) {
    for (const child of directChildren(c.inner)) {
      const abs = c.innerStart + child.start;
      if (stripTokens(child, abs, { center: true })) {
        stats.railChildren++;
        const b = blockFrom(src, { ...child, start: abs, end: abs + (child.end - child.start) });
        if (!b) continue;
        for (const t of tags(b.inner)) {
          if (t.kind !== 'open') continue;
          const cls = classText(t.attrs).split(/\s+/);
          if (cls.some((x) => MX_AUTO.test(x)) && cls.some((x) => MAX_W.test(x)) && stripTokens(t, b.innerStart + t.start, { center: false })) stats.railDescendants++;
        }
      }
    }
  }
  edits.push(...classEdits.values());

  // ── 3. buttons on slabs ────────────────────────────────────────────────
  for (const band of findBlocks(src, (t) => t.name === 'section' && classText(t.attrs).split(/\s+/).includes('bg-inverse')).filter(inTemplate)) {
    for (const t of tags(band.inner)) {
      if (t.kind !== 'open' || t.name !== 'Button') continue;
      const abs = band.innerStart + t.start;
      const v = /\svariant="([a-z]+)"/.exec(t.attrs);
      if (v) {
        if (v[1] === 'inverse') continue;
        const vs = abs + 1 + t.name.length + v.index + v[0].indexOf('"') + 1;
        edits.push({ start: vs, end: vs + v[1].length, text: 'inverse' });
      } else {
        edits.push({ start: abs + 1 + t.name.length, end: abs + 1 + t.name.length, text: ' variant="inverse"' });
      }
      stats.buttons++;
    }
  }

  // ── 4. reference CodeBlocks ────────────────────────────────────────────
  const ref = blockById(src, 'reference');
  if (ref && ref.start >= tplStart) {
    let k = 0;
    for (const t of tags(ref.inner)) {
      if (t.kind !== 'open' || t.name !== 'CodeBlock') continue;
      if (/\sfig=/.test(t.attrs)) throw new Error('a reference CodeBlock already has fig= — file already migrated?');
      // A CodeBlock inside a template expression (`{rules.map((r) => (… <CodeBlock …/> …))}`)
      // renders once per item: a literal fig would repeat the same number N times,
      // so those blocks stay unnumbered.
      if (exprDepth(ref.inner, t.start) > 0) {
        stats.figsSkippedInExpr++;
        continue;
      }
      k++;
      const abs = ref.innerStart + t.start + 1 + t.name.length;
      edits.push({ start: abs, end: abs, text: ` fig="${figNo}.${k}"` });
      stats.figs++;
    }
  }

  // ── 5. FaqList ─────────────────────────────────────────────────────────
  const faqs = [...src.matchAll(/<FaqList faqs=\{faqs\} \/>/g)];
  if (faqs.length !== 1) throw new Error(`expected exactly one <FaqList faqs={faqs} />, found ${faqs.length}`);
  const fa = faqs[0].index + '<FaqList faqs={faqs}'.length;
  edits.push({ start: fa, end: fa, text: ' align="left"' });
  stats.faq = 1;

  // ── apply ──────────────────────────────────────────────────────────────
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  for (let i = 1; i < edits.length; i++) {
    if (edits[i].end > edits[i - 1].start) throw new Error('overlapping edits');
  }
  let out = src;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);

  // ── verify the result ──────────────────────────────────────────────────
  const ledes = findBlocks(out, (t) => t.name === 'ToolLede');
  if (ledes.length !== 1) throw new Error(`output has ${ledes.length} <ToolLede> blocks`);
  if (collapseWs(textContent(ledes[0].inner)) !== ledeText) throw new Error('lede text changed during the move');
  if (ledes[0].inner.split(/\r?\n/).length !== lead.inner.split(/\r?\n/).length) throw new Error('lede line count changed');
  const heroOut = findBlocks(out, (t) => t.name === 'ToolHero')[0];
  if (/slot="lead"/.test(heroOut.inner)) throw new Error('lead slot still inside <ToolHero>');
  const before = (src.match(/slot="lead"/g) || []).length;
  const after = (out.match(/slot="lead"/g) || []).length;
  if (before - after !== 1) throw new Error(`slot="lead" count went ${before} → ${after}, expected exactly one fewer`);
  const pgOut = blockById(out, 'playground');
  const cpOut = findBlocks(pgOut.inner, (t) => classText(t.attrs).split(/\s+/).includes('container-page'))[0];
  const kids = directChildren(cpOut.inner);
  if (kids[kids.length - 1].name !== 'ToolLede') throw new Error('<ToolLede> is not the last child of #playground .container-page');
  if (!out.includes(`<ToolLede>${EOL}`)) throw new Error('line endings not preserved');
  return { out, stats, lede: ledeText };
}

// ---------------------------------------------------------------------------
// CLI

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.astro')) out.push(full);
  }
  return out;
}

export function run({ dry = false, verbose = false } = {}) {
  const slugs = registrySlugs(readFileSync(join(ROOT, 'src/data/tools.ts'), 'utf8'));
  const files = walk(join(ROOT, 'src/pages')).filter((f) => /<ToolHero\b/.test(readFileSync(f, 'utf8'))).sort();
  if (files.length !== EXPECTED_FILES) throw new Error(`expected ${EXPECTED_FILES} tool pages, found ${files.length}`);
  const totals = {};
  const ledes = [];
  for (const f of files) {
    const slug = basename(f, '.astro');
    const idx = slugs.indexOf(slug);
    if (idx < 0) throw new Error(`${relative(ROOT, f)}: "${slug}" is not in the tools registry`);
    const figNo = String(idx + 1).padStart(2, '0');
    const src = readFileSync(f, 'utf8');
    let res;
    try {
      res = transformToolPage(src, { figNo });
    } catch (e) {
      throw new Error(`${relative(ROOT, f)}: ${e.message}`);
    }
    for (const [k, v] of Object.entries(res.stats)) totals[k] = (totals[k] ?? 0) + v;
    ledes.push({ file: relative(ROOT, f).replace(/\\/g, '/'), lede: res.lede });
    if (verbose) console.log(relative(ROOT, f), JSON.stringify(res.stats));
    if (!dry) writeFileSync(f, res.out);
  }
  if (totals.leadRemoved !== EXPECTED_FILES || totals.ledeInserted !== EXPECTED_FILES || totals.faq !== EXPECTED_FILES || totals.importAdded !== EXPECTED_FILES)
    throw new Error(`per-file invariants broken: ${JSON.stringify(totals)}`);
  console.log(`${dry ? 'DRY: ' : ''}${files.length} tool pages`, JSON.stringify(totals));
  return { files: files.length, totals, ledes };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1].replace(/\\/g, '/').replace(/^([a-z]):/i, (m, d) => `${d.toUpperCase()}:`) || process.argv[1]?.endsWith('move-tool-lede.mjs')) {
  const dry = process.argv.includes('--dry');
  const verbose = process.argv.includes('--verbose');
  const res = run({ dry, verbose });
  const ledesOut = process.argv.indexOf('--ledes-out');
  if (ledesOut !== -1) writeFileSync(process.argv[ledesOut + 1], JSON.stringify(res.ledes, null, 1));
}
