#!/usr/bin/env node
/**
 * Footer guardrail (postbuild gate). The site footer is the ONLY inbound link
 * for /changelog/, /contact/, /privacy/ and /terms/ in every locale, and the
 * main one for the DevOps roadmap, the Linux/Docker guides, /about/ and
 * /security/ — so a footer regression silently orphans real pages. This scans
 * every dist/**\/index.html and fails the build unless each page has:
 *
 *   - exactly one <footer> (<script>/<style> contents and comments are ignored);
 *   - every protected target as a VISIBLE <a href> inside it — the locale's own
 *     /<l>/contact/ /<l>/privacy/ /<l>/terms/ /<l>/about/ /<l>/security/, plus
 *     the English-only /changelog/ and Learn pages, which stay UNPREFIXED. An
 *     anchor does not count when it, or any ancestor, is a <details> or
 *     <template>, carries `hidden`, `inert` or aria-hidden="true", has a
 *     `hidden`/`sr-only` class (any variant: `max-md:hidden` hides it on
 *     phones, which is what Google indexes) or an inline display:none /
 *     visibility:hidden. That rule is also what keeps the footer language
 *     switcher (a <details>, whose rel="alternate" options repeat the current
 *     page's path in every locale) from standing in for a real footer link;
 *   - no locale-prefixed link to an English-only route (/de/rss.xml, /de/tests/
 *     … 404 — mirrors ENGLISH_ONLY_SECTIONS/FILES in src/i18n/paths.ts);
 *   - no `nofollow` on an internal link;
 *   - no \d{4}-\d{2}-\d{2} date anywhere in the footer — text or attributes,
 *     except href values (a site-wide date competes with each page's real
 *     "Updated" date; a dated link TARGET does not, and the switcher's hrefs
 *     repeat the page path, so a dated slug would otherwise fail every page);
 *   - every social profile (mirrors src/lib/site-links.ts) linked with a `me`
 *     rel and an accessible name that starts with the page locale's
 *     `footer.profileOn` string PLUS a space ("OpsCanopy on GitHub", never
 *     "OpsCanopy onGitHub"); the strings are read from src/i18n/ui/*.ts;
 *   - a footer of at most 20 KB raw (it ships on every page). Brotli size is
 *     reported, and warned above 4 KB, but does not fail.
 *
 * Usage:
 *   node scripts/check-footer.mjs              scan dist/, exit 1 on any failure
 *   node scripts/check-footer.mjs <dir>        scan <dir> instead
 *   node scripts/check-footer.mjs --self-test  prove every check can fail (synthetic HTML)
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync } from 'node:zlib';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

const LOCALES = ['en', 'de', 'es', 'fr', 'pt-br'];
const PREFIXED = LOCALES.filter((l) => l !== 'en');

/** Localized in every locale: /de/contact/ on a German page, /contact/ on an English one. */
const LOCALIZED_PROTECTED = ['/contact/', '/privacy/', '/terms/', '/about/', '/security/'];
/** English-only pages: linked unprefixed from every locale. */
const ENGLISH_ONLY_PROTECTED = [
  '/changelog/',
  '/learn/roadmaps/devops/',
  '/learn/guides/linux-for-devops/',
  '/learn/guides/docker-for-devops/',
];
/** Mirrors ENGLISH_ONLY_SECTIONS / ENGLISH_ONLY_FILES in src/i18n/paths.ts. */
const ENGLISH_ONLY_SECTIONS = ['/learn', '/mission-90', '/changelog', '/tests'];
const ENGLISH_ONLY_FILES = ['/rss.xml'];
/**
 * Mirrors socialLinks in src/lib/site-links.ts (footer: true), which reads
 * src/data/site.ts. If a profile is added, dropped or flipped to footer:false,
 * update this list in the same commit — the check fails loudly until you do.
 */
const SOCIAL_HREFS = [
  'https://github.com/opscanopy',
  'https://bsky.app/profile/opscanopy.bsky.social',
  'https://dev.to/opscanopy',
  'https://x.com/opscanopy',
];

const RAW_BUDGET = 20480;
const BROTLI_BUDGET = 4096;
const LIST_CAP = 40;

const STRIP_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>|<!--[\s\S]*?-->/gi;
const DATE_RE = /\d{4}-\d{2}-\d{2}/;
/** An href attribute and its value, blanked before the date test. `hreflang=` does not match. */
const HREF_ATTR_RE = /(\s(?:xlink:)?href)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
/** One tag: close marker, name, raw attributes (quoted values may contain ">"). */
const TAG_RE = /<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
/** Elements whose content is not rendered until the reader acts (or never). */
const CONCEALING_TAGS = new Set(['details', 'template']);
/** Tailwind classes that remove an element from view: `hidden`, `sr-only`, any variant, `!` either side. */
const CONCEALING_CLASS_RE = /(?:^|:)!?(?:hidden|sr-only)!?$/;
const CONCEALING_STYLE_RE = /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden|content-visibility\s*:\s*hidden)/i;

/** `footer.profileOn` per locale, read from the UI dictionaries (never hand-copied). */
export function loadProfileOn(root = ROOT) {
  const out = {};
  for (const l of LOCALES) {
    const file = join(root, 'src', 'i18n', 'ui', `${l}.ts`);
    const src = readFileSync(file, 'utf8');
    const m = src.match(/['"]footer\.profileOn['"]\s*:\s*(['"])((?:(?!\1).)+)\1/);
    if (!m) throw new Error(`'footer.profileOn' not found in src/i18n/ui/${l}.ts`);
    out[l] = m[2];
  }
  return out;
}

/** The page locale from its dist-relative path ("/de/about/index.html" → "de"). */
export function localeOf(relPath) {
  const first = relPath.split('/').filter(Boolean)[0];
  return PREFIXED.includes(first) ? first : 'en';
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

function parseAttrs(src) {
  const attrs = {};
  for (const m of src.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/** Why this element hides its subtree from a reader, or null when it does not. */
function concealedBy(name, attrs) {
  if (CONCEALING_TAGS.has(name)) return `<${name}>`;
  if ('hidden' in attrs) return 'a hidden element';
  if ('inert' in attrs) return 'an inert element';
  if ((attrs['aria-hidden'] ?? '').trim().toLowerCase() === 'true') return 'aria-hidden="true"';
  const cls = (attrs.class ?? '').split(/\s+/).find((c) => CONCEALING_CLASS_RE.test(c));
  if (cls) return `class "${cls}"`;
  if (CONCEALING_STYLE_RE.test(attrs.style ?? '')) return 'an inline display:none/visibility:hidden';
  return null;
}

/**
 * Every <a> in `html` as { href, rel[], name, concealed } — name is aria-label,
 * else the text content; concealed is null for a visible anchor, else the
 * nearest reason it is hidden (its own attributes first, then its ancestors').
 * One pass over the tags with an open-element stack: void elements and `/>`
 * never push, and a close tag pops back to its nearest matching open tag (an
 * unmatched one is ignored), which is enough for Astro's fully closed output.
 */
function anchorsIn(html) {
  const out = [];
  const stack = []; // { name, why } — `why` is cumulative: own reason ?? parent's
  let open = null; // the <a> being read: { attrs, why, start }
  for (const m of html.matchAll(TAG_RE)) {
    const [whole, close, rawName, rawAttrs] = m;
    const name = rawName.toLowerCase();
    if (close) {
      if (name === 'a' && open) {
        const text = decodeEntities(html.slice(open.start, m.index).replace(/<[^>]*>/g, ''));
        const label = (open.attrs['aria-label'] ?? text).replace(/\s+/g, ' ').trim();
        out.push({
          href: open.attrs.href ?? '',
          rel: (open.attrs.rel ?? '').toLowerCase().split(/\s+/).filter(Boolean),
          name: label,
          concealed: open.why,
        });
        open = null;
      }
      const at = stack.map((e) => e.name).lastIndexOf(name);
      if (at !== -1) stack.length = at;
      continue;
    }
    const attrs = parseAttrs(rawAttrs);
    const why = concealedBy(name, attrs) ?? stack.at(-1)?.why ?? null;
    if (name === 'a') open = { attrs, why, start: m.index + whole.length };
    if (!VOID.has(name) && !/\/\s*$/.test(rawAttrs)) stack.push({ name, why });
  }
  return out;
}

const isInternal = (href) =>
  (href.startsWith('/') && !href.startsWith('//')) ||
  href.startsWith('#') ||
  /^https?:\/\/(www\.)?opscanopy\.com(\/|$|[?#])/i.test(href);

/** "/de/tests/" → true: a locale prefix in front of a route that exists only in English. */
function isPrefixedEnglishOnly(href) {
  const m = href.match(/^\/([a-z]{2}(?:-[a-z]{2})?)(\/.*)$/);
  if (!m || !PREFIXED.includes(m[1])) return false;
  const rest = m[2].split(/[?#]/)[0];
  if (ENGLISH_ONLY_FILES.includes(rest)) return true;
  return ENGLISH_ONLY_SECTIONS.some((p) => rest === p || rest.startsWith(`${p}/`));
}

/**
 * Check one page. Returns { errors: string[], raw, brotli } — raw/brotli are
 * the footer's byte sizes (0 when there is no single footer to measure).
 */
export function checkPage(html, locale, profileOn) {
  const errors = [];
  const scan = html.replace(STRIP_RE, '');
  const opens = (scan.match(/<footer\b/gi) ?? []).length;
  if (opens !== 1) return { errors: [`expected exactly one <footer>, found ${opens}`], raw: 0, brotli: 0 };
  const footer = scan.match(/<footer\b[\s\S]*?<\/footer>/i)?.[0];
  if (!footer) return { errors: ['<footer> is never closed'], raw: 0, brotli: 0 };

  const anchors = anchorsIn(footer);
  const visible = new Set(anchors.filter((a) => a.concealed === null).map((a) => a.href));
  const pre = locale === 'en' ? '' : `/${locale}`;
  const protectedHrefs = [...LOCALIZED_PROTECTED.map((p) => pre + p), ...ENGLISH_ONLY_PROTECTED];
  for (const p of protectedHrefs) {
    if (visible.has(p)) continue;
    const hidden = anchors.find((a) => a.href === p);
    errors.push(
      hidden
        ? `protected link not visible: ${p} is only linked inside ${hidden.concealed} (it must be a plain, always-rendered <a href>)`
        : `protected link missing: ${p}`,
    );
  }

  // The remaining link checks read EVERY anchor, visible or not: a hidden
  // nofollow or a hidden /de/rss.xml is still in the markup crawlers parse.
  for (const a of anchors) {
    if (isPrefixedEnglishOnly(a.href)) errors.push(`locale-prefixed link to an English-only route: ${a.href}`);
    if (isInternal(a.href) && a.rel.includes('nofollow')) errors.push(`nofollow on internal link: ${a.href}`);
  }

  const date = footer.replace(HREF_ATTR_RE, '$1=""').match(DATE_RE);
  if (date) errors.push(`date inside <footer>: "${date[0]}"`);

  const prefix = profileOn[locale];
  for (const href of SOCIAL_HREFS) {
    const links = anchors.filter((a) => a.href === href);
    if (!links.length) {
      errors.push(`social link missing: ${href}`);
      continue;
    }
    for (const a of links) {
      if (!a.rel.includes('me')) errors.push(`social link without rel="me": ${href}`);
      if (!a.name.startsWith(`${prefix} `)) {
        errors.push(`social link name must start with "${prefix} ": ${href} is named "${a.name}"`);
      }
    }
  }

  const raw = Buffer.byteLength(footer, 'utf8');
  const brotli = brotliCompressSync(Buffer.from(footer, 'utf8')).length;
  if (raw > RAW_BUDGET) errors.push(`footer is ${raw} bytes raw (budget ${RAW_BUDGET})`);
  return { errors, raw, brotli };
}

// ---------------------------------------------------------------------------
// --self-test: synthetic pages, each bad one must fail for the stated reason.
// ---------------------------------------------------------------------------
function selfTest() {
  const P = { en: 'OpsCanopy on', de: 'OpsCanopy auf', es: 'OpsCanopy en', fr: 'OpsCanopy sur', 'pt-br': 'OpsCanopy no' };
  const social = (l, { name = (label) => `<span class="sr-only">${P[l]} </span>${label}`, rel = 'me noopener noreferrer', skip = '' } = {}) =>
    SOCIAL_HREFS.filter((h) => h !== skip)
      .map((h, i) => `<li><a href="${h}" rel="${rel}" target="_blank" translate="no">${name(`Site${i}`)}<span class="sr-only"> (opens in a new tab)</span></a></li>`)
      .join('');
  const links = (l, { drop = '', swap = {}, attrs = {}, extra = '' } = {}) => {
    const pre = l === 'en' ? '' : `/${l}`;
    return [...LOCALIZED_PROTECTED.map((p) => pre + p), ...ENGLISH_ONLY_PROTECTED, `${pre}/blog/`, '/rss.xml']
      .filter((h) => h !== drop)
      .map((h) => `<li><a href="${swap[h] ?? h}"${attrs[h] ? ` ${attrs[h]}` : ''} class="body-sm">Label</a></li>`)
      .join('') + extra;
  };
  /** The footer LangSwitcher: a <details> whose options repeat the page key in every locale. */
  const switcher = (key) =>
    `<details class="lang-switcher relative"><summary class="body-sm"><span class="sr-only">Language: </span>` +
    `<svg width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle></svg><span translate="no">English</span></summary>` +
    `<ul role="list">${LOCALES.map((x) => `<li><a href="${x === 'en' ? '' : `/${x}`}${key}" hreflang="${x}" lang="${x}" rel="alternate">${x}</a></li>`).join('')}</ul></details>`;
  // The good footer carries what the real one does beside its links — an
  // aria-hidden logo SVG with a self-closing <path/>, the max-sm:hidden plate
  // with a <wbr />, an aria-hidden separator and the switcher — so a
  // concealment rule that leaked out of its own subtree fails the good pages.
  const footer = (l, { socialOpts, linkOpts, inner = '', wrapNav = (n) => n, key = '/tools/' } = {}) =>
    `<footer class="relative" data-pagefind-ignore><a href="${l === 'en' ? '/' : `/${l}/`}" aria-label="OpsCanopy, home">` +
    `<svg class="h-full" aria-hidden="true" focusable="false"><path d="M0 0h32v32z"/></svg></a>` +
    `<div class="min-w-0 max-sm:hidden"><div class="colophon instrument"><a href="https://github.com/opscanopy/opscanopy.com" rel="noopener noreferrer" target="_blank">github.com/<wbr />opscanopy</a></div></div>` +
    `<ul role="list">${social(l, socialOpts)}</ul>` +
    wrapNav(`<nav aria-label="Footer"><ul role="list">${links(l, linkOpts)}</ul></nav>`) +
    `<p class="caption">&copy;&nbsp;<span class="tabular-nums">2026</span>&nbsp;OpsCanopy. Free &amp; open. <span aria-hidden="true">·</span> <a href="/sitemap-index.xml">Sitemap</a></p>` +
    `${switcher(key)}${inner}</footer>`;
  const page = (l, foot, { main = '', head = '' } = {}) =>
    `<!doctype html><html lang="${l}"><head>${head}</head><body><main>${main}</main>${foot}</body></html>`;

  const cases = [
    // [name, locale, html, expected error pattern (null = must pass)]
    ['good en page', 'en', page('en', footer('en')), null],
    ['good de page', 'de', page('de', footer('de')), null],
    ['good pt-br page', 'pt-br', page('pt-br', footer('pt-br')), null],
    ['a date outside the footer is fine', 'en', page('en', footer('en'), { main: '<time datetime="2026-09-27">27 Sep</time>' }), null],
    ['nofollow on an external link is fine', 'en', page('en', footer('en', { inner: '<a href="https://example.com/" rel="nofollow">x</a>' })), null],
    ['"<footer" inside a script is not a footer', 'en', page('en', footer('en'), { head: '<script>const s = "<footer>";</script>' }), null],
    ['"<footer" inside a comment is not a footer', 'en', page('en', footer('en'), { main: '<!-- <footer> goes below -->' }), null],
    ['a dated slug in the switcher hrefs is fine', 'de', page('de', footer('de', { key: '/blog/2026-10-01-release/' })), null],
    // No wrapper to close them: a void or `/>` element that were pushed as an
    // open parent would conceal every link after it.
    ['hidden void elements beside the nav do not leak', 'en', page('en', footer('en', { wrapNav: (n) => `<img src="/x.png" alt="" hidden><br class="hidden">${n}` })), null],
    ['a self-closing hidden SVG beside the nav does not leak', 'en', page('en', footer('en', { wrapNav: (n) => `<svg aria-hidden="true" width="0" height="0"/>${n}` })), null],
    ['a stray close tag does not unbalance the walk', 'en', page('en', footer('en', { wrapNav: (n) => `<div class="hidden"></span></div>${n}` })), null],
    ['nav in a mobile accordion (<details> + hidden inert)', 'en', page('en', footer('en', { wrapNav: (n) => `<details><summary>More</summary><div hidden inert>${n}</div></details>` })), /not visible: \/contact\/ is only linked inside a hidden element/],
    ['nav in an open <details>', 'en', page('en', footer('en', { wrapNav: (n) => `<details open><summary>Links</summary>${n}</details>` })), /not visible: \/privacy\/ is only linked inside <details>/],
    ['nav in a <template>', 'en', page('en', footer('en', { wrapNav: (n) => `<template>${n}</template>` })), /not visible: \/terms\/ is only linked inside <template>/],
    ['nav under a hidden attribute', 'fr', page('fr', footer('fr', { wrapNav: (n) => `<div hidden="until-found">${n}</div>` })), /not visible: \/fr\/about\/ is only linked inside a hidden element/],
    ['nav under inert', 'en', page('en', footer('en', { wrapNav: (n) => `<div inert>${n}</div>` })), /not visible: \/security\/ is only linked inside an inert element/],
    ['nav under aria-hidden', 'en', page('en', footer('en', { wrapNav: (n) => `<div aria-hidden="true">${n}</div>` })), /not visible: \/changelog\/ is only linked inside aria-hidden="true"/],
    ['nav hidden on phones (max-md:hidden)', 'es', page('es', footer('es', { wrapNav: (n) => `<div class="min-w-0 max-md:hidden">${n}</div>` })), /not visible: \/es\/contact\/ is only linked inside class "max-md:hidden"/],
    ['nav hidden below md (hidden md:block)', 'en', page('en', footer('en', { wrapNav: (n) => `<div class="hidden md:block">${n}</div>` })), /only linked inside class "hidden"/],
    ['nav in an sr-only box', 'en', page('en', footer('en', { wrapNav: (n) => `<div class="sr-only">${n}</div>` })), /only linked inside class "sr-only"/],
    ['nav under inline display:none', 'en', page('en', footer('en', { wrapNav: (n) => `<div style="color: red; display: none">${n}</div>` })), /only linked inside an inline display:none/],
    ['one protected link aria-hidden on itself', 'en', page('en', footer('en', { linkOpts: { attrs: { '/terms/': 'aria-hidden="true" tabindex="-1"' } } })), /not visible: \/terms\/ is only linked inside aria-hidden="true"/],
    ['de page whose only /de/about/ is the switcher option', 'de', page('de', footer('de', { key: '/about/', linkOpts: { drop: '/de/about/' } })), /not visible: \/de\/about\/ is only linked inside <details>/],
    ['no footer', 'en', page('en', ''), /exactly one <footer>, found 0/],
    ['two footers', 'en', page('en', footer('en') + footer('en')), /exactly one <footer>, found 2/],
    ['unclosed footer', 'en', page('en', footer('en').replace('</footer>', '')), /never closed/],
    ['missing /privacy/', 'en', page('en', footer('en', { linkOpts: { drop: '/privacy/' } })), /missing: \/privacy\//],
    ['missing a Learn guide', 'es', page('es', footer('es', { linkOpts: { drop: '/learn/guides/docker-for-devops/' } })), /missing: \/learn\/guides\/docker-for-devops\//],
    ['de page links English /about/', 'de', page('de', footer('de', { linkOpts: { swap: { '/de/about/': '/about/' } } })), /missing: \/de\/about\//],
    ['de page prefixes /changelog/', 'de', page('de', footer('de', { linkOpts: { swap: { '/changelog/': '/de/changelog/' } } })), /English-only route: \/de\/changelog\//],
    ['fr page links /fr/rss.xml', 'fr', page('fr', footer('fr', { linkOpts: { extra: '<li><a href="/fr/rss.xml">RSS</a></li>' } })), /English-only route: \/fr\/rss\.xml/],
    ['internal nofollow', 'en', page('en', footer('en', { inner: '<a href="/tools/" rel="nofollow">Tools</a>' })), /nofollow on internal link: \/tools\//],
    ['absolute internal nofollow', 'en', page('en', footer('en', { inner: '<a href="https://opscanopy.com/blog/" rel="noopener nofollow">Blog</a>' })), /nofollow on internal link/],
    ['date inside the footer', 'en', page('en', footer('en', { inner: '<span>Updated 2026-09-27</span>' })), /date inside <footer>/],
    ['build date in an attribute', 'en', page('en', footer('en', { inner: '<div data-built="2026-09-27T10:00:00Z"></div>' })), /date inside <footer>/],
    ['date in link text beside a dated href', 'en', page('en', footer('en', { inner: '<a href="/blog/2026-09-27-x/">Released 2026-09-27</a>' })), /date inside <footer>/],
    ['date in a title attribute', 'en', page('en', footer('en', { inner: '<a href="/changelog/" title="Updated 2026-09-27">Changelog</a>' })), /date inside <footer>/],
    ['social link missing', 'en', page('en', footer('en', { socialOpts: { skip: SOCIAL_HREFS[1] } })), /social link missing: https:\/\/bsky\.app/],
    ['social link without rel=me', 'en', page('en', footer('en', { socialOpts: { rel: 'noopener noreferrer' } })), /without rel="me"/],
    ['social name lacks the prefix', 'en', page('en', footer('en', { socialOpts: { name: (label) => label } })), /must start with "OpsCanopy on "/],
    ['social name lacks the space', 'en', page('en', footer('en', { socialOpts: { name: (label) => `<span class="sr-only">${P.en}</span>${label}` } })), /must start with "OpsCanopy on "/],
    ['social name in the wrong locale', 'de', page('de', footer('de', { socialOpts: { name: (label) => `<span class="sr-only">${P.en} </span>${label}` } })), /must start with "OpsCanopy auf "/],
    ['oversize footer', 'en', page('en', footer('en', { inner: `<p>${'x'.repeat(Math.min(RAW_BUDGET, 1e6))}</p>` })), /bytes raw \(budget/],
  ];

  const wrong = [];
  for (const [name, locale, html, want] of cases) {
    const { errors } = checkPage(html, locale, P);
    if (want === null && errors.length) wrong.push(`${name}: expected to pass, got ${JSON.stringify(errors)}`);
    if (want !== null && !errors.some((e) => want.test(e))) {
      wrong.push(`${name}: expected an error matching ${want}, got ${JSON.stringify(errors)}`);
    }
  }

  const paths = [
    ['/index.html', 'en'],
    ['/about/index.html', 'en'],
    ['/de/index.html', 'de'],
    ['/pt-br/terms/index.html', 'pt-br'],
    ['/design/index.html', 'en'],
  ];
  for (const [p, l] of paths) if (localeOf(p) !== l) wrong.push(`localeOf(${p}) = ${localeOf(p)}, expected ${l}`);

  try {
    const real = loadProfileOn();
    for (const l of LOCALES) {
      if (!real[l]?.startsWith('OpsCanopy ')) wrong.push(`loadProfileOn(): ${l} = ${JSON.stringify(real[l])}`);
    }
  } catch (e) {
    wrong.push(`loadProfileOn(): ${e.message}`);
  }

  const total = cases.length + paths.length + 1;
  if (wrong.length) {
    console.error(`FAIL: check-footer self-test, ${wrong.length} of ${total} case(s) wrong:`);
    for (const w of wrong) console.error(`  ${w}`);
    process.exit(1);
  }
  console.log(`OK: check-footer self-test, all ${total} cases (${cases.filter((c) => c[3] !== null).length} must-fail fixtures failed as expected)`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Scan dist/
// ---------------------------------------------------------------------------
function walkIndexHtml(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkIndexHtml(full));
    else if (entry === 'index.html') out.push(full);
  }
  return out;
}

function run() {
  const DIST = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, 'dist');
  if (!existsSync(DIST)) {
    console.error(`FAIL: ${DIST} does not exist — run \`npm run build\` first.`);
    process.exit(1);
  }
  let profileOn;
  try {
    profileOn = loadProfileOn();
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exit(1);
  }

  const files = walkIndexHtml(DIST);
  if (!files.length) {
    console.error(`FAIL: no index.html under ${DIST}.`);
    process.exit(1);
  }
  const perLocale = Object.fromEntries(LOCALES.map((l) => [l, 0]));
  const failed = []; // { rel, errors }
  let largest = { raw: 0, brotli: 0, rel: '' };
  const overBrotli = [];
  for (const file of files) {
    const rel = file.slice(DIST.length).split(sep).join('/');
    const locale = localeOf(rel);
    perLocale[locale] += 1;
    const { errors, raw, brotli } = checkPage(readFileSync(file, 'utf8'), locale, profileOn);
    if (errors.length) failed.push({ rel, errors });
    if (raw > largest.raw) largest = { raw, brotli, rel };
    if (brotli > BROTLI_BUDGET) overBrotli.push(rel);
  }

  const counts = LOCALES.map((l) => `${l} ${perLocale[l]}`).join(', ');
  const size = `largest footer ${largest.raw} B raw / ${largest.brotli} B brotli (${largest.rel || 'n/a'})`;
  if (overBrotli.length) {
    console.warn(`WARN: ${overBrotli.length} footer(s) over the ${BROTLI_BUDGET} B brotli target (not a failure), e.g. ${overBrotli[0]}`);
  }
  if (failed.length) {
    const n = failed.reduce((s, f) => s + f.errors.length, 0);
    console.error(`\nFAIL: ${n} footer problem(s) on ${failed.length} of ${files.length} page(s) [${counts}]:\n`);
    const lines = failed.flatMap((f) => f.errors.map((e) => `  ${f.rel}  ${e}`));
    for (const l of lines.slice(0, LIST_CAP)) console.error(l);
    if (lines.length > LIST_CAP) console.error(`  … and ${lines.length - LIST_CAP} more`);
    console.error(`\n${size}`);
    process.exit(1);
  }
  console.log(
    `OK: ${files.length} page(s) [${counts}] — one <footer> each with all ` +
      `${LOCALIZED_PROTECTED.length + ENGLISH_ONLY_PROTECTED.length} protected links visible and ` +
      `${SOCIAL_HREFS.length} social profiles; no internal nofollow, no English-only prefix, no dates; ${size}.`,
  );
  process.exit(0);
}

if (process.argv[2] === '--self-test') selfTest();
else run();
