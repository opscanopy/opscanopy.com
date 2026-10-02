/**
 * Playground-kit gate — the design-system contract for the 39 tool
 * playgrounds, enforced on source (plan "Batch C", gate paragraph).
 *
 * Before this gate the Field Manual contract in CLAUDE.md was honoured by 3 of
 * 39 playgrounds (subnet-calculator, cidr-checker, cron-expression-tester) and
 * nothing stopped the other 36 drifting further: 39 local `.<x>-chip`
 * recipes, 27 `9999px` radii, 13 hand-drawn figure caps, 18 one-dark editor
 * themes, 9 duplicate trust lines. The kit (`src/components/playground/*`,
 * Wave 0) makes the right markup the only markup; this file makes that
 * checkable.
 *
 * Shape:
 *   - corpus: every `src/components/**\/*Playground.astro` (walker from
 *     type-scale.test.ts), exactly 39 files;
 *   - pre-processing: comments stripped (`/* *\/`, `{/* *\/}`, `<!-- -->`, as in
 *     contrast.test.ts's footer check) and `<noscript>` blocks dropped — the
 *     no-JS fallbacks legitimately say "runs in your browser";
 *   - the source is split into regions (frontmatter, template, `<style>`,
 *     `<script>`) so each rule reads only where its defect can live;
 *   - RATCHET: `UNMIGRATED` lists, per file, every rule it fails TODAY (computed
 *     from source, not guessed). An allowlisted pair must still fail — when a
 *     wave fixes it the test fails as "stale" until the entry is deleted — and
 *     any pair not allowlisted must pass, so nothing regresses;
 *   - self-tests: a GOLDEN kit-shaped mini playground passes every rule and one
 *     mutation per rule fails exactly that rule, so no rule can pass vacuously.
 *
 * The `tokens` rule (no raw `letter-spacing` / `tracking-*`, no raw
 * uppercase outside eyebrow / label-field) landed with Wave 0, once
 * `--tracking-label` and the `label-field` utility existed to satisfy it.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, basename } from 'node:path';
import { tags, findBlocks, getAttr, classText, blockFrom, directChildren } from '../../scripts/html-block.mjs';

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const COMPONENTS = join(SRC, 'components');
const KIT_DIR = join(COMPONENTS, 'playground');

// ---------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------

/** Same walker as type-scale.test.ts. */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.astro')) out.push(full);
  }
  return out;
}

const playgroundFiles = walk(COMPONENTS)
  .filter((f) => /Playground\.astro$/.test(f))
  .sort();

/**
 * The same discovery `scripts/inject-cm-modulepreload.mjs` runs (top-level
 * `src/components/*.astro` that mention `@codemirror/state`). Duplicated rather
 * than imported because that script runs its postbuild main() on import.
 */
export function discoverCmPlaygrounds(names: Array<{ name: string; src: string }>): string[] {
  return names.filter((f) => f.name.endsWith('.astro') && f.src.includes('@codemirror/state')).map((f) => f.name.replace(/\.astro$/, ''));
}
const EXPECTED_CM = 19;

// ---------------------------------------------------------------------------
// Pre-processing and regions
// ---------------------------------------------------------------------------

/** Comment stripping as in contrast.test.ts, then `<noscript>` blocks. */
export function preprocess(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, '');
}

export interface Regions {
  frontmatter: string;
  template: string;
  style: string;
  script: string;
}

export function regions(raw: string): Regions {
  const src = preprocess(raw);
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src);
  const frontmatter = fm ? fm[1] : '';
  let rest = fm ? src.slice(fm[0].length) : src;
  const style: string[] = [];
  const script: string[] = [];
  rest = rest.replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (_, body: string) => {
    style.push(body);
    return '';
  });
  rest = rest.replace(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi, (_, body: string) => {
    script.push(body);
    return '';
  });
  return { frontmatter, template: rest, style: style.join('\n'), script: script.join('\n') };
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

type Rule = (r: Regions, name: string) => string[];

const SLAB_CLASS = /(?:^|[\s'"`[,])(?:instrument|instrument-flush|bg-inverse)(?=[\s'"`\],]|$)/;
const SLAB_COMPONENTS = new Set(['ResultPanel', 'EditorPane']);
type Tag = { name: string; attrs: string; start: number; end: number; kind: string };
type Block = { start: number; end: number; outer: string; inner: string; tag: Tag };

/** Elements drawn on the dark slab: `.instrument*` / `bg-inverse`, or the kit's slab components. */
function slabBlocks(template: string): Block[] {
  return findBlocks(template, (t: Tag) => SLAB_COMPONENTS.has(t.name) || SLAB_CLASS.test(classText(t.attrs)));
}

const count = (s: string, re: RegExp) => (s.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)) ?? []).length;

const CHIP_TOKEN = /^(?!data-|aria-)[a-z][a-z0-9]*(?:-[a-z0-9]+)*-chips?$/;
/**
 * Cross-tool LINK chips are an unrelated feature (CLAUDE.md): the `-xchip(s)`
 * family (`.snc-xchips`, `.dsz-xchip`, excluded by CHIP_TOKEN itself) and
 * IpConverter's `.ipc-chip(s)`, which is why its example chips are named
 * `.ipc-ex-chip`.
 */
const LINK_CHIP = /^ipc-chips?$/;
export const isLocalChipClass = (tok: string) => CHIP_TOKEN.test(tok) && !LINK_CHIP.test(tok);

/** No local `.<x>-chip` recipe: chips are the kit's `.chip` (ExampleChips). */
const localChip: Rule = (r) => {
  const found = new Set<string>();
  for (const t of tags(r.template) as Iterable<Tag>) {
    if (t.kind !== 'open') continue;
    for (const tok of classText(t.attrs).match(/[\w-]+/g) ?? []) if (isLocalChipClass(tok)) found.add(tok);
  }
  for (const m of r.style.matchAll(/\.([a-z][\w-]*)/g)) if (isLocalChipClass(m[1])) found.add(m[1]);
  return [...found].map((c) => `local chip class .${c}`);
};

/** Radii are squared (`--radius-pill` is 6px): no 9999px pills. */
const pillRadius: Rule = (r) => {
  const n = count(r.style + r.template, /(?<![\w.])9{3,}px\b/);
  return n ? [`${n} × 9999px radius`] : [];
};

/** Durations come from `--dur-*` tokens, not literals. */
const rawDuration: Rule = (r) => {
  const css = count(r.style + r.template, /\b(?:transition|animation)(?:-duration|-delay)?\s*:[^;{}"]*?(?<![\w-])\d*\.?\d+m?s\b/);
  const tw = count(r.template, /(?<![\w-])(?:duration|delay)-(?:\d+|\[)/);
  return css + tw ? [`${css + tw} raw duration(s)`] : [];
};

/** The result lives in the kit's ResultPanel; every seeded container carries `data-results`. */
const resultPanel: Rule = (r) => {
  const out: string[] = [];
  if (!/import\s+ResultPanel\s+from\s+['"][^'"]*playground\/ResultPanel\.astro['"]/.test(r.frontmatter)) out.push('no ResultPanel import');
  if (!/<ResultPanel\b/.test(r.template)) out.push('no <ResultPanel>');
  for (const t of tags(r.template) as Iterable<Tag>) {
    if (t.kind === 'open' && getAttr(t.attrs, 'set:html') !== undefined && getAttr(t.attrs, 'data-results') === undefined) {
      out.push(`set:html target #${getAttr(t.attrs, 'id') ?? '?'} lacks data-results`);
    }
  }
  return out;
};

const SLAB_FORBIDDEN = /(?<![\w-])(?:text-mute|text-error)(?![\w-])|(?<![\w-])(?:text|bg)-white\/|(?<![\w-])rounded-full(?![\w-])/g;

/** Paper inks never sit on the slab: inverse-tier inks only. */
const slabInk: Rule = (r) => {
  const hits = new Map<number, string>();
  for (const b of slabBlocks(r.template)) {
    for (const m of b.outer.matchAll(SLAB_FORBIDDEN)) hits.set(b.start + (m.index ?? 0), m[0]);
  }
  const byToken = new Map<string, number>();
  for (const tok of hits.values()) byToken.set(tok, (byToken.get(tok) ?? 0) + 1);
  return [...byToken].map(([tok, n]) => `${n} × ${tok} on a slab`);
};

const TRUST =
  /\b(?:runs?|processed|happens|generated|stays|conversion runs)\b[^.<]{0,30}?\bin (?:your|the|this) browser\b|\bnothing (?:is )?(?:uploaded|sent)\b|\bnothing leaves\b|\bnever (?:leaves?|uploaded)\b|\b100% in your browser\b/gi;
/** HashGenerator's HMAC caption explains where a secret goes — an input note, not a page-level trust claim. */
const TRUST_EXEMPT: Record<string, string> = {
  HashGeneratorPlayground: 'HMAC key never leaves your browser.',
};

/** ToolHero's caption is the one privacy claim per tool page (CLAUDE.md). */
const oneTrustLine: Rule = (r, name) => {
  let text = r.template.replace(/<[^>]*>/g, ' ');
  if (TRUST_EXEMPT[name]) text = text.split(TRUST_EXEMPT[name]).join(' ');
  const lines = new Set([...text.matchAll(TRUST)].map((m) => text.slice(0, m.index).split('\n').length));
  return lines.size ? [`${lines.size} duplicate trust line(s)`] : [];
};

/**
 * Live-evaluating tools have no primary button ("Run now" is `.btn-tool`).
 * Counts primary BUTTONS in markup: every `<button>` / `<a>` whose class
 * tokens include `btn-primary` (the shared recipe) or a local `*-btn-primary`
 * (`.uug-btn-primary`), plus any element passing `variant="primary"`. CSS
 * rules that style a primary button are not buttons and do not count.
 * UuidUlid is the plan's pinned exception at 1 — its Generate button; its kit
 * migration (Wave 4) re-pins the number deliberately.
 */
const PRIMARY_PINNED: Record<string, number> = { UuidUlidGeneratorPlayground: 1 };
const PRIMARY_TOKEN = /^(?:[a-z][a-z0-9]*-)*btn-primary$/;
export function countPrimaryButtons(template: string): number {
  let n = 0;
  for (const t of tags(template) as Iterable<Tag>) {
    if (t.kind !== 'open') continue;
    const viaClass = (t.name === 'button' || t.name === 'a') && (classText(t.attrs).match(/[\w-]+/g) ?? []).some((tok: string) => PRIMARY_TOKEN.test(tok));
    const viaVariant = getAttr(t.attrs, 'variant') === 'primary';
    if (viaClass || viaVariant) n++;
  }
  return n;
}
const noPrimary: Rule = (r, name) => {
  const n = countPrimaryButtons(r.template);
  const allowed = PRIMARY_PINNED[name] ?? 0;
  return n === allowed ? [] : [`${n} primary <button>/<a> element(s) in markup, expected ${allowed}`];
};

/** Caption bars are FigureCap (via ResultPanel / EditorPane), never three hand-drawn dots. */
const fakeFigcap: Rule = (r) => {
  const dots = count(r.template, /(?:<(span|i)\b[^>]*\bclass(?::list)?=(?:"[^"]*|\{[^}]*)(?:rounded-full|dot)[^>]*>\s*<\/\1>\s*){3}/);
  let hand = 0;
  for (const t of tags(r.template) as Iterable<Tag>) {
    if (t.kind === 'open' && /(?<![\w-])figcap(?:__[\w-]+)?(?![\w-])/.test(classText(t.attrs))) hand++;
  }
  const out: string[] = [];
  if (dots) out.push(`${dots} hand-drawn three-dot cap(s)`);
  if (hand) out.push(`${hand} hand-written .figcap element(s)`);
  return out;
};

/** Tools that do not live-evaluate one input (a decoder that verifies asynchronously, a generator that mints on click) carry no run hint. */
const RUN_HINT_EXEMPT = new Set(['CertificateDecoderPlayground', 'UuidUlidGeneratorPlayground']);
const runHint: Rule = (r, name) => {
  if (RUN_HINT_EXEMPT.has(name)) return [];
  const out: string[] = [];
  if (!/<RunHint\b/.test(r.template)) out.push('no <RunHint>');
  if (/Results update as you type/.test(r.template)) out.push('hand-written hint line');
  const kbd = count(r.template, /<kbd\b/);
  if (kbd) out.push(`${kbd} inline <kbd> outside RunHint`);
  return out;
};

/** Snapshots use the kit bar, on paper. UuidUlid mints fresh values and has no snapshot bar by design. */
const SNAPSHOT_NONE = new Set(['UuidUlidGeneratorPlayground']);
const snapshotBar: Rule = (r, name) => {
  const out: string[] = [];
  const hand = count(r.template, /\bid=["'][\w-]+-snap-(?:save|select|delete)["']/);
  const kit = count(r.template, /<SnapshotBar\b/);
  if (SNAPSHOT_NONE.has(name)) {
    if (hand + kit) out.push('has a snapshot bar but is pinned to none');
    return out;
  }
  if (!kit) out.push('no <SnapshotBar>');
  if (hand) out.push('hand-rolled snapshot controls');
  for (const b of slabBlocks(r.template)) if (/<SnapshotBar\b/.test(b.inner)) out.push('SnapshotBar inside a slab');
  return out;
};

const LEGACY_SELECTOR =
  /['"`][^'"`\n]*\.[a-z][a-z0-9]*-(?:x?chips?|copy-(?:btn|icon|label)|check-icon|snap-(?:btn|select|delete|row))(?![\w-])|['"`]is-active['"`]/g;
/** Island scripts reach kit parts through the kit's hooks (`[data-chips] .chip[aria-pressed]`, `[data-copy]`, `#<p>-snap-*`), never legacy local classes. */
const kitSelectors: Rule = (r) => {
  const n = count(r.script, LEGACY_SELECTOR);
  return n ? [`${n} legacy selector(s) in <script>`] : [];
};

/** Editors use the plate theme (`playground-kit/cm-theme.ts`), not one-dark. */
const noOneDark: Rule = (r) => (/theme-one-dark/.test(r.frontmatter + r.template + r.script) ? ['imports @codemirror/theme-one-dark'] : []);

/** Control heights come from `--control-h-*` (28 / 32 / 44), never px literals. */
const controlHeight: Rule = (r) => {
  const lit = (re: RegExp, s: string) => [...s.matchAll(re)].filter((m) => Number(m[1]) >= 20 && Number(m[1]) <= 48).length;
  const n =
    lit(/(?<![\w-])(?:min-|max-)?height\s*:\s*(\d+)px/g, r.style + r.template) +
    lit(/(?<![\w-])(?:min-|max-)?h-\[(\d+)px\]/g, r.template);
  return n ? [`${n} literal control height(s)`] : [];
};

/**
 * Tracking and case come from the label roles, never raw values: a
 * `letter-spacing` must be a `--tracking-*` token (or a reset: normal / 0 /
 * inherit), no `tracking-*` utility, and uppercase only through `eyebrow` /
 * `label-field` (`@apply label-field` is the way to give a render.ts label
 * the role). Counts CSS declarations in `<style>` and inline styles, class
 * tokens (any variant prefix, `!` important) and `@apply` lists.
 */
const TRACKING_OK = /^(?:var\(--tracking-[\w-]+\)|normal|0|inherit)$/;
const bareUtility = (tok: string) => tok.replace(/^(?:[\w-]+:)*!?/, '');
const isRawCaseOrTracking = (tok: string) => {
  const u = bareUtility(tok);
  return u === 'uppercase' || /^-?tracking-/.test(u);
};
export function tokenViolations(r: Regions): string[] {
  const css = `${r.style}\n${r.template}`;
  let tracking = 0;
  for (const m of css.matchAll(/(?<![\w-])letter-spacing\s*:\s*([^;}"'\n]+)/g)) if (!TRACKING_OK.test(m[1].trim())) tracking++;
  const upper = count(css, /(?<![\w-])text-transform\s*:\s*uppercase\b/);
  let classes = 0;
  for (const t of tags(r.template) as Iterable<Tag>) {
    if (t.kind !== 'open') continue;
    for (const tok of classText(t.attrs).match(/[\w:!./[\]()-]+/g) ?? []) if (isRawCaseOrTracking(tok)) classes++;
  }
  for (const m of r.style.matchAll(/@apply\b([^;]*)/g)) for (const tok of m[1].trim().split(/\s+/)) if (isRawCaseOrTracking(tok)) classes++;
  const out: string[] = [];
  if (tracking) out.push(`${tracking} raw letter-spacing value(s)`);
  if (upper) out.push(`${upper} raw text-transform: uppercase`);
  if (classes) out.push(`${classes} raw uppercase / tracking-* utility class(es)`);
  return out;
}
const tokensRule: Rule = (r) => tokenViolations(r);

export const RULES: Record<string, Rule> = {
  'local-chip': localChip,
  'pill-radius': pillRadius,
  'raw-duration': rawDuration,
  'result-panel': resultPanel,
  'slab-ink': slabInk,
  'one-trust-line': oneTrustLine,
  'no-primary': noPrimary,
  'fake-figcap': fakeFigcap,
  'run-hint': runHint,
  'snapshot-bar': snapshotBar,
  'kit-selectors': kitSelectors,
  'no-one-dark': noOneDark,
  'control-height': controlHeight,
  tokens: tokensRule,
};
const RULE_NAMES = Object.keys(RULES);

/** Kit files render markup only: no island script, no CodeMirror (which would also make the CM discovery count them). */
export function kitPurity(raw: string): string[] {
  const src = preprocess(raw);
  const out: string[] = [];
  if (/<script\b/i.test(src)) out.push('kit file contains <script');
  if (src.includes('@codemirror/state')) out.push('kit file mentions @codemirror/state');
  return out;
}

export function failingRules(raw: string, name: string): string[] {
  const r = regions(raw);
  return RULE_NAMES.filter((k) => RULES[k](r, name).length > 0);
}

// ---------------------------------------------------------------------------
// Ratchet — every rule each file fails today. Computed from source on
// 2026-10-02 (main @ f7331d8), and recomputed unchanged after no-primary
// learned to count buttons and local-chip to skip link chips. Wave 1
// (2026-10-02) removed SubnetCalculator, CidrChecker and CronTester (they
// pass every rule), and the Wave 0 `tokens` rule was appended to the 36
// files that fail it today — a new rule's first allowlist, recomputed with
// KIT_GATE_DUMP, not a regression. Shrink it as the waves land, never grow it.
// ---------------------------------------------------------------------------

const UNMIGRATED: Record<string, string[]> = {
};

// ---------------------------------------------------------------------------
// Corpus tests
// ---------------------------------------------------------------------------

const corpus = playgroundFiles.map((f) => ({ name: basename(f, '.astro'), rel: relative(SRC, f), raw: readFileSync(f, 'utf-8') }));

describe('playground-kit gate — corpus', () => {
  it('walks exactly the 39 playgrounds', () => {
    expect(corpus.length).toBe(39);
  });

  it(`cm-count: the modulepreload discovery finds exactly ${EXPECTED_CM} CodeMirror playgrounds`, () => {
    const top = readdirSync(COMPONENTS)
      .filter((n) => n.endsWith('.astro'))
      .map((n) => ({ name: n, src: readFileSync(join(COMPONENTS, n), 'utf-8') }));
    expect(discoverCmPlaygrounds(top).length).toBe(EXPECTED_CM);
  });

  it('UNMIGRATED names only real files and real rules', () => {
    const names = new Set(corpus.map((c) => c.name));
    for (const [file, rules] of Object.entries(UNMIGRATED)) {
      expect(names.has(file), `UNMIGRATED names unknown file ${file}`).toBe(true);
      for (const r of rules) expect(RULE_NAMES, `UNMIGRATED ${file} names unknown rule ${r}`).toContain(r);
    }
  });

  it('ratchet: allowlisted pairs still fail (else stale) and every other pair passes', () => {
    const stale: string[] = [];
    const regressions: string[] = [];
    const actual: Record<string, string[]> = {};
    for (const c of corpus) {
      const r = regions(c.raw);
      const allowed = new Set(UNMIGRATED[c.name] ?? []);
      for (const rule of RULE_NAMES) {
        const v = RULES[rule](r, c.name);
        if (v.length) (actual[c.name] ??= []).push(rule);
        if (allowed.has(rule) && v.length === 0) stale.push(`${c.name} × ${rule} now passes — delete it from UNMIGRATED`);
        if (!allowed.has(rule) && v.length > 0) regressions.push(`${c.rel} × ${rule}: ${v.join('; ')}`);
      }
    }
    const computed = Object.entries(actual)
      .map(([k, v]) => `  ${k}: [${v.map((x) => `'${x}'`).join(', ')}],`)
      .join('\n');
    // KIT_GATE_DUMP=<file> writes the map as computed now, ready to paste
    // over UNMIGRATED after a wave (only ever to shrink it).
    if (process.env.KIT_GATE_DUMP) writeFileSync(process.env.KIT_GATE_DUMP, `${computed}\n`);
    expect(regressions, `rule violations not in UNMIGRATED:\n${regressions.join('\n')}\n\ncomputed map:\n${computed}`).toEqual([]);
    expect(stale, `stale UNMIGRATED entries:\n${stale.join('\n')}`).toEqual([]);
  });

  it('kit-purity: every kit component is markup-only', () => {
    if (!existsSync(KIT_DIR)) {
      // The kit lands in Wave 0 (stream 7); until then there is nothing to check.
      expect(existsSync(KIT_DIR)).toBe(false);
      return;
    }
    const files = walk(KIT_DIR);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(kitPurity(readFileSync(f, 'utf-8')), relative(SRC, f)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Self-tests
// ---------------------------------------------------------------------------

const GOLDEN = `---
import ExampleChips from './playground/ExampleChips.astro';
import ResultPanel from './playground/ResultPanel.astro';
import RunHint from './playground/RunHint.astro';
import SnapshotBar from './playground/SnapshotBar.astro';
import EditorPane from './playground/EditorPane.astro';
import { examples } from '../lib/golden/examples';
const seedHtml = '<p>ok</p>';
---

<section class="gx-pg" aria-label="Golden playground">
  {/* A comment that names <ResultPanel> and "nothing is uploaded" is ignored. */}
  <ExampleChips prefix="gx" examples={examples} active={0} />
  <EditorPane prefix="gx" label="input.yaml">
    <pre class="editor-pane__fallback code-mono" data-cm-fallback>{examples[0].input}</pre>
  </EditorPane>
  <RunHint variant="live" />
  <SnapshotBar prefix="gx" />
  <ResultPanel slug="golden" prefix="gx">
    <div id="gx-results" class="gx-results" set:html={seedHtml} data-results></div>
  </ResultPanel>
  <noscript><p>This tool runs entirely in your browser — enable JavaScript to use it.</p></noscript>
</section>

<style>
  .gx-results {
    transition: opacity var(--dur-fast) var(--ease-brand);
    min-height: var(--control-h-md);
    border-radius: var(--radius-pill);
    line-height: 20px;
  }
</style>

<script>
  document.addEventListener('astro:page-load', () => {
    const chips = document.querySelectorAll('[data-chips] .chip[aria-pressed]');
    const save = document.getElementById('gx-snap-save');
    void chips;
    void save;
  });
</script>
`;

const MUTATIONS: Record<string, (s: string) => string> = {
  'local-chip': (s) => s.replace('</style>', '  .gx-chip { color: red; }\n</style>'),
  'pill-radius': (s) => s.replace('border-radius: var(--radius-pill);', 'border-radius: 9999px;'),
  'raw-duration': (s) => s.replace('transition: opacity var(--dur-fast) var(--ease-brand);', 'transition: opacity 0.12s ease;'),
  'result-panel': (s) => s.replace(' data-results></div>', '></div>'),
  'slab-ink': (s) => s.replace('<div id="gx-results"', '<span class="text-mute">note</span>\n    <div id="gx-results"'),
  'one-trust-line': (s) => s.replace('<RunHint variant="live" />', '<RunHint variant="live" />\n  <p class="caption">Runs entirely in your browser — nothing is uploaded.</p>'),
  'no-primary': (s) => s.replace('<RunHint variant="live" />', '<RunHint variant="live" />\n  <button type="button" class="btn btn-primary">Run</button>'),
  'fake-figcap': (s) =>
    s.replace('<RunHint variant="live" />', '<RunHint variant="live" />\n  <span class="gx-dots"><span class="gx-dot"></span><span class="gx-dot"></span><span class="gx-dot"></span></span>'),
  'run-hint': (s) => s.replace('<RunHint variant="live" />', '<p class="caption">Results update as you type — press Enter to run now.</p>'),
  'snapshot-bar': (s) => s.replace('  <SnapshotBar prefix="gx" />\n', '').replace('<div id="gx-results"', '<SnapshotBar prefix="gx" />\n    <div id="gx-results"'),
  'kit-selectors': (s) => s.replace("'[data-chips] .chip[aria-pressed]'", "'.gx-copy-btn'"),
  'no-one-dark': (s) => s.replace("document.addEventListener", "import('@codemirror/theme-one-dark');\n  document.addEventListener"),
  'control-height': (s) => s.replace('min-height: var(--control-h-md);', 'min-height: 32px;'),
  tokens: (s) => s.replace('line-height: 20px;', 'line-height: 20px;\n    letter-spacing: 0.04em;'),
};

describe('playground-kit gate — self-tests', () => {
  it('the golden kit playground passes every rule', () => {
    expect(failingRules(GOLDEN, 'GoldenPlayground')).toEqual([]);
  });

  it('there is exactly one mutation per rule', () => {
    expect(Object.keys(MUTATIONS).sort()).toEqual([...RULE_NAMES].sort());
  });

  for (const rule of RULE_NAMES) {
    it(`mutation for ${rule} fails exactly ${rule}`, () => {
      const mutated = MUTATIONS[rule](GOLDEN);
      expect(mutated, `mutation for ${rule} did not change the golden`).not.toBe(GOLDEN);
      expect(failingRules(mutated, 'GoldenPlayground')).toEqual([rule]);
    });
  }

  it('no-primary counts primary <button>/<a> elements in markup, not CSS or other tags', () => {
    expect(countPrimaryButtons('<button type="button" class="uug-btn uug-btn-primary">Generate</button>')).toBe(1);
    expect(countPrimaryButtons('<a class="btn btn-primary" href="/x/">Go</a>')).toBe(1);
    expect(countPrimaryButtons("<button class:list={['btn', on && 'btn-primary']}>Run</button>")).toBe(1);
    expect(countPrimaryButtons('<Button variant="primary">Run</Button>')).toBe(1);
    expect(countPrimaryButtons('<div class="btn-primary"></div><span class="btn-primary-ish"></span><button class="btn btn-tool">Run now</button>')).toBe(0);
    // CSS that styles .gx-btn-primary twice plus ONE such button in markup counts 1, not 3.
    const css = GOLDEN.replace('</style>', '  .gx-btn-primary { color: red; }\n  .gx-btn-primary:hover { color: blue; }\n</style>').replace(
      '<RunHint variant="live" />',
      '<RunHint variant="live" />\n  <button type="button" class="gx-btn gx-btn-primary">Mint</button>',
    );
    expect(countPrimaryButtons(regions(css).template)).toBe(1);
    expect(RULES['no-primary'](regions(css), 'GoldenPlayground')).toEqual(['1 primary <button>/<a> element(s) in markup, expected 0']);
    expect(RULES['no-primary'](regions(css), 'UuidUlidGeneratorPlayground')).toEqual([]);
  });

  it('local-chip ignores cross-tool link chips (.ipc-chip, -xchip) but not example chips', () => {
    for (const c of ['snc-chip', 'snc-chips', 'ipc-ex-chip', 'cron-chips']) expect(isLocalChipClass(c), c).toBe(true);
    for (const c of ['ipc-chip', 'ipc-chips', 'snc-xchips', 'dsz-xchip', 'chip', 'data-chips', 'ipc-chip-input']) expect(isLocalChipClass(c), c).toBe(false);
    const link = GOLDEN.replace('</style>', '  .ipc-chip { color: red; }\n  :global(.snc-xchips) { gap: 4px; }\n</style>').replace(
      '<RunHint variant="live" />',
      '<RunHint variant="live" />\n  <div class="snc-xchips"><a class="ipc-chip" href="/cidr-checker/">CIDR</a></div>',
    );
    expect(failingRules(link, 'GoldenPlayground')).toEqual([]);
    expect(failingRules(link.replace('class="ipc-chip"', 'class="snc-chip"'), 'GoldenPlayground')).toEqual(['local-chip']);
  });

  it('tokens: label roles and tracking tokens pass; raw tracking, raw uppercase and their utilities fail', () => {
    const style = (css: string) => GOLDEN.replace('</style>', `  ${css}\n</style>`);
    const tpl = (cls: string) => GOLDEN.replace('<RunHint variant="live" />', `<RunHint variant="live" />\n  <span class="${cls}">x</span>`);
    for (const ok of [
      style('.gx-k { letter-spacing: var(--tracking-label); }'),
      style('.gx-k { letter-spacing: normal; text-transform: none; }'),
      style(':global(.gx-k) { @apply label-field; }'),
      tpl('eyebrow label-field'),
      tpl('gx-tracking-note'),
    ]) expect(failingRules(ok, 'GoldenPlayground')).toEqual([]);
    for (const bad of [
      style('.gx-k { letter-spacing: 0.05em; }'),
      style('.gx-k { text-transform: uppercase; }'),
      style('.gx-k { @apply font-mono uppercase; }'),
      tpl('uppercase'),
      tpl('sm:tracking-wide'),
      tpl('!tracking-[0.04em]'),
      GOLDEN.replace('<RunHint variant="live" />', '<RunHint variant="live" />\n  <span style="letter-spacing:.1em">x</span>'),
    ]) expect(failingRules(bad, 'GoldenPlayground')).toEqual(['tokens']);
  });

  it('kit-purity: a markup-only kit file passes; a <script> or @codemirror/state fails', () => {
    const kit = `---\n/** Mentions @codemirror/state only in a comment. */\nexport interface Props { prefix: string }\n---\n<div class="chips" data-chips><slot /></div>\n`;
    expect(kitPurity(kit)).toEqual([]);
    expect(kitPurity(`${kit}<script>console.log(1)</script>`)).toEqual(['kit file contains <script']);
    expect(kitPurity(kit.replace('export interface', "import { EditorState } from '@codemirror/state';\nexport interface"))).toEqual([
      'kit file mentions @codemirror/state',
    ]);
  });

  it('cm-count discovery counts only files that mention @codemirror/state', () => {
    const fake = [
      { name: 'APlayground.astro', src: "import { EditorState } from '@codemirror/state';" },
      { name: 'BPlayground.astro', src: '<div />' },
      { name: 'notes.md', src: '@codemirror/state' },
    ];
    expect(discoverCmPlaygrounds(fake)).toEqual(['APlayground']);
  });

  it('exceptions are scoped to their named file', () => {
    const hmac = GOLDEN.replace('<RunHint variant="live" />', '<RunHint variant="live" />\n  <p class="text-xs">HMAC key never leaves your browser.</p>');
    expect(failingRules(hmac, 'HashGeneratorPlayground')).toEqual([]);
    expect(failingRules(hmac, 'GoldenPlayground')).toEqual(['one-trust-line']);

    const mint = '  <button class="btn btn-primary">Mint</button>\n';
    const withMint = (k: number) => GOLDEN.replace('<RunHint variant="live" />', '<RunHint variant="live" />\n' + mint.repeat(k));
    const uuid = (s: string) => s.replace('  <SnapshotBar prefix="gx" />\n', '');
    expect(failingRules(uuid(withMint(1)), 'UuidUlidGeneratorPlayground')).toEqual([]);
    expect(failingRules(uuid(withMint(0)), 'UuidUlidGeneratorPlayground')).toEqual(['no-primary']);
    expect(failingRules(uuid(withMint(2)), 'UuidUlidGeneratorPlayground')).toEqual(['no-primary']);
    // UuidUlid is pinned to NO snapshot bar; the golden's bar fails it there.
    expect(failingRules(withMint(1), 'UuidUlidGeneratorPlayground')).toEqual(['snapshot-bar']);

    const noHint = GOLDEN.replace('  <RunHint variant="live" />\n', '');
    expect(failingRules(noHint, 'CertificateDecoderPlayground')).toEqual([]);
    expect(failingRules(noHint, 'GoldenPlayground')).toEqual(['run-hint']);
  });
});

describe('playground-kit gate — pre-processing and block scanner', () => {
  it('strips /* */, {/* */}, <!-- --> and <noscript> but nothing else', () => {
    const src = 'a /* x */ b {/* <ResultPanel> */} c <!-- <kbd> --> d <noscript><p>runs in your browser</p></noscript> e';
    // `/* */` goes first (as in contrast.test.ts), leaving the JSX braces `{}`.
    expect(preprocess(src).replace(/\s+/g, ' ')).toBe('a b {} c d e');
    expect(preprocess('<p>keep me</p>')).toBe('<p>keep me</p>');
  });

  it('splits frontmatter, template, style and script', () => {
    const r = regions(GOLDEN);
    expect(r.frontmatter).toMatch(/import ResultPanel/);
    expect(r.template).toMatch(/<ResultPanel slug="golden"/);
    expect(r.template).not.toMatch(/import ResultPanel|querySelectorAll|transition:/);
    expect(r.style).toMatch(/transition:/);
    expect(r.script).toMatch(/querySelectorAll/);
  });

  it('balances nested same-name tags and skips raw-text bodies', () => {
    const s = '<div id="a"><div><div></div></div><script>"</div>"</script><p>x</p></div><div id="b"></div>';
    const open = [...tags(s)].find((t) => t.kind === 'open' && getAttr(t.attrs, 'id') === 'a');
    expect(open).toBeDefined();
    const b = open ? blockFrom(s, open) : null;
    expect(b?.outer).toBe('<div id="a"><div><div></div></div><script>"</div>"</script><p>x</p></div>');
  });

  it('does not end a tag on a > inside an Astro expression or a quoted value', () => {
    const s = `<div class:list={['x', n > 1 && 'y']} data-x="a>b"><span /></div>`;
    const [t] = [...(tags(s) as Iterable<Tag>)];
    expect(t.name).toBe('div');
    expect(getAttr(t.attrs, 'data-x')).toBe('a>b');
    expect(classText(t.attrs)).toContain("n > 1 && 'y'");
  });

  it('treats self-closing components and void elements as leaves', () => {
    const s = '<section><ResultPanel slug="x" /><input value="1"><br><p>t</p></section>';
    const [sec] = findBlocks(s, (t: Tag) => t.name === 'section');
    expect(directChildren(sec.inner).map((t: Tag) => t.name)).toEqual(['ResultPanel', 'input', 'br', 'p']);
  });

  it('finds slab blocks through class, class:list and the kit components', () => {
    const tpl = `<div class="instrument-flush"><b>1</b></div><div class:list={['a', 'bg-inverse']}><b>2</b></div><ResultPanel slug="x"><b>3</b></ResultPanel><div class="instrumental"><b>no</b></div>`;
    expect(slabBlocks(tpl).map((b) => b.inner)).toEqual(['<b>1</b>', '<b>2</b>', '<b>3</b>']);
  });
});
