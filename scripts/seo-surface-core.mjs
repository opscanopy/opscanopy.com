// Pure core of the SEO-surface diff guard — no fs, no git, no clock.
//
// scripts/seo-surface-diff.mjs is the CLI: it builds the baseline, reads the two
// dist/ trees and writes the report. Everything that decides what counts as a
// ranking-relevant change lives here so src/lib/seo-surface-diff.test.ts can pin
// it with in-memory fixtures (the same split as lastmod-core.mjs +
// check-sitemap-lastmod.mjs + sitemap-lastmod.test.ts).
//
// The guard compares the surface a search engine reads — title, description,
// canonical, hreflang, robots, lang, og:*, H1, H2, JSON-LD, internal links and
// their anchors, footer targets, Pagefind opt-in, <main> word count, hidden
// elements — page by page, plus the site-level sitemap <lastmod> map, the
// llms.txt hashes and the inbound-link index. A change is either must-explain
// (exit 1 unless an allowlist rule names it), or informational.
//
// It FAILS CLOSED: a page whose head <title>, canonical, <main> or single H1
// cannot be found is must-explain, never "no change".
//
// Extraction is a small quote-aware tokenizer, not a regex over raw HTML: the
// built site DOES carry `>` inside attribute values (CodeBlock's multi-line
// `data-copy="… -> …"` payloads, 121 pages on 2026-10-02), which a naive
// `<[^>]*>` would cut in half. The self-test pins that case.

import { createHash } from 'node:crypto';

export const ORIGIN = 'https://opscanopy.com';
export const LOCALE_PREFIXES = ['de', 'es', 'fr', 'pt-br'];
export const LOCALES = ['en', ...LOCALE_PREFIXES];

/** Mirrors scripts/check-footer.mjs (which runs on import, so it cannot be imported). */
export const LOCALIZED_PROTECTED = ['/contact/', '/privacy/', '/terms/', '/about/', '/security/'];
export const ENGLISH_ONLY_PROTECTED = [
  '/changelog/',
  '/learn/roadmaps/devops/',
  '/learn/guides/linux-for-devops/',
  '/learn/guides/docker-for-devops/',
];

/** Link targets whose anchor text is watched (any locale prefix). */
export const WATCHED_ANCHOR =
  /^\/(?:(?:de|es|fr|pt-br)\/)?(?:tools\/[a-z0-9-]+\/|mission-90\/|tests\/|blog\/|verify-ai\/|security\/|about\/|learn\/)$/;

export const THRESHOLDS = Object.freeze({
  /** <main> word drop above this fraction is must-explain. */
  wordDropFrac: 0.2,
  /** Inbound-link (linking pages) drop above this fraction is must-explain. */
  inboundDropFrac: 0.1,
  /** More re-dated sitemap URLs than this prints a loud line. */
  loudRedate: 50,
  /** Sample paths shown on a collapsed many-page line. */
  samples: 3,
});

/** Route classes where a hidden-element increase inside <main> is must-explain. */
export const HIDDEN_WATCH_CLASSES = new Set(['tool', 'tools-hub', 'tool-category']);

const MASKED_LD_KEYS = new Set(['dateModified', 'datePublished', 'dateCreated']);
const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
]);
const RAWTEXT = new Set(['script', 'style']);
const RCDATA = new Set(['title', 'textarea']);
const POSITIVE_FIELDS = new Set(['lede-present', 'must-contain']);
const RULE_KEYS = new Set(['field', 'pages', 'to', 'maxDrop', 'maxDropAbs', 'reason', 'selector', 'when']);

// ---------------------------------------------------------------------------
// Text helpers

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–',
  hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©',
  middot: '·', times: '×', rarr: '→', larr: '←', laquo: '«', raquo: '»',
};

/** Decode the character references Astro emits (named subset + numeric). */
export function decodeEntities(s) {
  if (!s.includes('&')) return s;
  return s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return String.fromCodePoint(cp);
      } catch {
        return m;
      }
    }
    return Object.prototype.hasOwnProperty.call(NAMED, e) ? NAMED[/** @type {keyof NAMED} */ (e)] : m;
  });
}

/** Collapse every whitespace run (incl. NBSP) to one space and trim. */
export const collapse = (/** @type {string} */ s) => s.replace(/\s+/g, ' ').trim();
const norm = (/** @type {string} */ s) => collapse(decodeEntities(s));

/** JSON.stringify with sorted object keys, so key order never reads as a change. */
export function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** Replace dateModified/datePublished/dateCreated values (any depth) with a mask. */
export function maskDates(v) {
  if (Array.isArray(v)) return v.map(maskDates);
  if (v && typeof v === 'object') {
    /** @type {Record<string, any>} */
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = MASKED_LD_KEYS.has(k) ? '<masked>' : maskDates(x);
    return out;
  }
  return v;
}

export const sha256 = (/** @type {string} */ s) => createHash('sha256').update(s).digest('hex');

// ---------------------------------------------------------------------------
// Tokenizer

/**
 * @typedef {{ k: 't', v: string } | { k: 'e', name: string } |
 *   { k: 's', name: string, attrs: Record<string, string>, void: boolean, raw?: string }} Node
 */

const isAlpha = (/** @type {number} */ c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
const isSpace = (/** @type {number} */ c) => c === 32 || (c >= 9 && c <= 13);
const ATTR_RE = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/** Attribute string → { name: decoded value } (first occurrence wins, boolean = ''). */
export function parseAttrs(raw) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!raw.trim()) return out;
  for (const m of raw.matchAll(ATTR_RE)) {
    const name = m[1].toLowerCase();
    if (name in out) continue;
    const v = m[2] ?? m[3] ?? m[4];
    out[name] = v === undefined ? '' : decodeEntities(v);
  }
  return out;
}

/**
 * HTML → flat node list. Quote-aware inside tags (a `>` inside a quoted value
 * does not end the tag), skips comments/doctype, keeps <script>/<style> bodies
 * on the start node as `raw`, treats <title>/<textarea> bodies as text.
 * @returns {{ nodes: Node[], error: string | null }}
 */
export function tokenize(html) {
  /** @type {Node[]} */
  const nodes = [];
  /** @type {string | null} */
  let error = null;
  const n = html.length;
  let i = 0;
  const text = (/** @type {number} */ a, /** @type {number} */ b) => {
    if (b > a) nodes.push({ k: 't', v: html.slice(a, b) });
  };
  while (i < n) {
    const j = html.indexOf('<', i);
    if (j < 0) {
      text(i, n);
      break;
    }
    text(i, j);
    if (html.startsWith('<!--', j)) {
      const e = html.indexOf('-->', j + 4);
      if (e < 0) {
        error = 'unterminated comment';
        break;
      }
      i = e + 3;
      continue;
    }
    const c1 = html[j + 1];
    if (c1 === '!' || c1 === '?') {
      const e = html.indexOf('>', j);
      if (e < 0) {
        error = 'unterminated declaration';
        break;
      }
      i = e + 1;
      continue;
    }
    if (c1 === '/' && isAlpha(html.charCodeAt(j + 2))) {
      const e = html.indexOf('>', j);
      if (e < 0) {
        error = 'unterminated end tag';
        break;
      }
      nodes.push({ k: 'e', name: html.slice(j + 2, e).trim().split(/\s/)[0].toLowerCase() });
      i = e + 1;
      continue;
    }
    if (!isAlpha(html.charCodeAt(j + 1))) {
      text(j, j + 1);
      i = j + 1;
      continue;
    }
    let p = j + 1;
    while (p < n && !isSpace(html.charCodeAt(p)) && html.charCodeAt(p) !== 47 && html.charCodeAt(p) !== 62) p++;
    const name = html.slice(j + 1, p).toLowerCase();
    const a = p;
    // Quote-aware: a quote opens a value only right after `=`; `>` inside it is data.
    let quote = 0;
    let lastSig = 0;
    for (; p < n; p++) {
      const ch = html.charCodeAt(p);
      if (quote) {
        if (ch === quote) quote = 0;
        continue;
      }
      if ((ch === 34 || ch === 39) && lastSig === 61) quote = ch;
      else if (ch === 62) break;
      if (!isSpace(ch)) lastSig = ch;
    }
    if (p >= n) {
      error = `unterminated <${name}> tag`;
      break;
    }
    let raw = html.slice(a, p);
    // A trailing "/" self-closes only after whitespace, a quote, or alone
    // (`<br/>`, `<img src="x"/>`); in `<a href=/learn/>` it ends the value.
    const selfClose = /(?:^|\s|["'])\/\s*$/.test(raw);
    if (selfClose) raw = raw.replace(/\/\s*$/, '');
    /** @type {Node} */
    const node = { k: 's', name, attrs: parseAttrs(raw), void: VOID.has(name) || selfClose };
    nodes.push(node);
    i = p + 1;
    if (!selfClose && (RAWTEXT.has(name) || RCDATA.has(name))) {
      const close = new RegExp(`</${name}\\s*>`, 'gi');
      close.lastIndex = i;
      const m = close.exec(html);
      const end = m ? m.index : n;
      if (RAWTEXT.has(name)) node.raw = html.slice(i, end);
      else text(i, end);
      nodes.push({ k: 'e', name });
      if (!m) {
        error = `unterminated <${name}> element`;
        break;
      }
      i = m.index + m[0].length;
    }
  }
  return { nodes, error };
}

/** Index of the end node matching the start node at k (k itself for void), or -1. */
export function findEnd(nodes, k) {
  const start = nodes[k];
  if (start.k !== 's') return -1;
  if (start.void) return k;
  let depth = 0;
  for (let i = k + 1; i < nodes.length; i++) {
    const nd = nodes[i];
    if (nd.k === 't' || nd.name !== start.name) continue;
    if (nd.k === 's') {
      if (!nd.void) depth++;
    } else if (depth === 0) return i;
    else depth--;
  }
  return -1;
}

/**
 * textContent of the nodes strictly between a and b (tags contribute nothing).
 * `skip` names elements whose whole subtree contributes nothing either (an
 * unclosed one swallows the rest of the range).
 * @param {Set<string>} [skip]
 */
function textBetween(nodes, a, b, sep = '', skip) {
  let s = '';
  for (let i = a + 1; i < b; i++) {
    const nd = nodes[i];
    if (nd.k === 't') s += nd.v;
    else {
      if (sep) s += sep;
      if (skip && nd.k === 's' && !nd.void && skip.has(nd.name)) {
        const e = findEnd(nodes, i);
        i = e < 0 || e > b ? b : e;
      }
    }
  }
  return norm(s);
}

/**
 * Elements inside <main> whose content is never rendered as page copy: a
 * <template> is an inert fragment, and <noscript> is not shown to a reader
 * with scripting on. Each counts as one hidden element, and its text is left
 * out of the word count and the <main> text lede-present reads, so moving copy
 * into one shows up on both counters.
 */
const UNRENDERED = new Set(['template', 'noscript']);

const classTokens = (/** @type {Record<string,string>} */ attrs) =>
  (attrs.class ?? '').split(/\s+/).filter(Boolean);

// ---------------------------------------------------------------------------
// Selectors (deliberately tiny): `tag.class[attr][attr="v"]`, optionally
// `A ~ B` = the first B that starts after the first A element ends.

const SIMPLE_RE = /^([a-z][a-z0-9-]*|\*)?((?:\.[A-Za-z0-9_:/-]+|\[[A-Za-z0-9_:-]+(?:="[^"]*")?\])*)$/;

function parseSimple(s, whole) {
  const m = s.match(SIMPLE_RE);
  if (!m || (!m[1] && !m[2])) throw new Error(`unsupported selector "${whole}"`);
  const tag = !m[1] || m[1] === '*' ? null : m[1].toLowerCase();
  const classes = [...m[2].matchAll(/\.([A-Za-z0-9_:/-]+)/g)].map((x) => x[1]);
  const attrs = [...m[2].matchAll(/\[([A-Za-z0-9_:-]+)(?:="([^"]*)")?\]/g)].map((x) => ({
    name: x[1].toLowerCase(),
    value: x[2],
  }));
  return { tag, classes, attrs };
}

/** @param {string} sel */
export function parseSelector(sel) {
  const parts = sel.split('~').map((s) => s.trim());
  if (parts.length > 2 || parts.some((p) => !p)) throw new Error(`unsupported selector "${sel}"`);
  const simple = parts.map((p) => parseSimple(p, sel));
  return { after: simple.length === 2 ? simple[0] : null, target: simple[simple.length - 1] };
}

function matches(nd, s) {
  if (nd.k !== 's' || (s.tag && nd.name !== s.tag)) return false;
  const cls = classTokens(nd.attrs);
  if (!s.classes.every((c) => cls.includes(c))) return false;
  return s.attrs.every((a) => a.name in nd.attrs && (a.value === undefined || nd.attrs[a.name] === a.value));
}

/** Text of the first element matching `sel` within (a, b), or null when none matches. */
function selectText(nodes, a, b, sel) {
  const { after, target } = parseSelector(sel);
  let from = a + 1;
  if (after) {
    let k = from;
    while (k < b && !matches(nodes[k], after)) k++;
    if (k >= b) return null;
    const e = findEnd(nodes, k);
    if (e < 0) return null;
    from = e + 1;
  }
  for (let k = from; k < b; k++) {
    if (!matches(nodes[k], target)) continue;
    const e = findEnd(nodes, k);
    return e < 0 ? null : textBetween(nodes, k, e);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Paths and classes

/** dist-relative file path → site path ("a/index.html" → "/a/", "404.html" → "/404.html"). */
export function pathFromFile(rel) {
  const p = rel.replace(/\\/g, '/').replace(/^\/+/, '');
  if (p === 'index.html') return '/';
  if (p.endsWith('/index.html')) return `/${p.slice(0, -'index.html'.length)}`;
  return `/${p}`;
}

/** Locale of a site path ('en' when unprefixed). */
export function localeOf(path) {
  const m = path.match(/^\/(de|es|fr|pt-br)(?:\/|$)/);
  return m ? m[1] : 'en';
}

/**
 * Route class of a page. Tool pages are recognised by their `#playground`
 * section (no registry import, so the core stays pure).
 */
export function classify(path, surface) {
  const rest = path.replace(/^\/(de|es|fr|pt-br)(?=\/)/, '') || '/';
  if (rest === '/') return 'home';
  if (rest === '/tools/') return 'tools-hub';
  if (/^\/tools\/[^/]+\/$/.test(rest)) return 'tool-category';
  if (surface?.isTool) return 'tool';
  if (rest === '/blog/') return 'blog-hub';
  if (rest.startsWith('/blog/tag/')) return 'blog-tag';
  if (rest.startsWith('/blog/')) return 'blog-post';
  if (rest.startsWith('/learn/')) return 'learn';
  if (rest.startsWith('/mission-90/')) return 'mission-90';
  if (rest.startsWith('/tests/')) return 'tests';
  if (rest.startsWith('/changelog/')) return 'changelog';
  if (rest.endsWith('.html')) return 'utility';
  return 'info';
}

/** An href → internal site path (+query), or null for external / fragment-only / non-http. */
export function internalHref(href, pagePath) {
  const h = href.trim();
  if (!h || h.startsWith('#')) return null;
  let u;
  try {
    u = new URL(h, ORIGIN + pagePath);
  } catch {
    return null;
  }
  if (u.origin !== ORIGIN) return null;
  return u.pathname + u.search;
}

function protectedFooterHrefs(locale) {
  const pre = locale === 'en' ? '' : `/${locale}`;
  return [...LOCALIZED_PROTECTED.map((h) => pre + h), ...ENGLISH_ONLY_PROTECTED];
}

// ---------------------------------------------------------------------------
// Page extraction

function ldEntry(json) {
  const typeOf = (/** @type {any} */ o) =>
    o && typeof o === 'object'
      ? Array.isArray(o['@type'])
        ? o['@type'].join('+')
        : o['@type'] ?? (o['@graph'] ? `Graph(${o['@graph'].map(typeOf).join(',')})` : 'Unknown')
      : 'Unknown';
  const type = Array.isArray(json) ? json.map(typeOf).join(',') : typeOf(json);
  return { type, body: stableStringify(maskDates(json)) };
}

/**
 * Extract the SEO surface of one built page.
 * @param {string} html
 * @param {string} path site path, e.g. "/subnet-calculator/"
 * @param {{ selectors?: string[], mainText?: boolean }} [opts]
 *   selectors: texts to capture inside <main> (allowlist positive rules);
 *   mainText: keep the whitespace-collapsed textContent of <main>.
 */
export function extractPage(html, path, opts = {}) {
  /** @type {string[]} */
  const errors = [];
  const { nodes, error } = tokenize(html);
  if (error) errors.push(error);

  /** @type {any} */
  const s = {
    path,
    errors,
    lang: null,
    title: null,
    description: null,
    canonical: null,
    robots: null,
    hreflang: /** @type {Record<string,string>} */ ({}),
    xDefault: null,
    og: /** @type {Record<string,string>} */ ({}),
    h1: /** @type {string[]} */ ([]),
    h2: /** @type {string[]} */ ([]),
    ld: /** @type {{type:string, body:string}[]} */ ([]),
    linkCount: 0,
    hrefs: /** @type {string[]} */ ([]),
    anchors: /** @type {Record<string,string[]>} */ ({}),
    footer: /** @type {string[]} */ ([]),
    nofollow: 0,
    pagefind: false,
    words: 0,
    hidden: 0,
    isTool: false,
    selected: /** @type {Record<string,string|null>} */ ({}),
    mainText: null,
  };

  let headEnd = -1;
  let mainStart = -1;
  let footerStart = -1;
  for (let k = 0; k < nodes.length; k++) {
    const nd = nodes[k];
    if (nd.k === 'e' && nd.name === 'head' && headEnd < 0) headEnd = k;
    if (nd.k !== 's') continue;
    if (nd.name === 'main' && mainStart < 0) mainStart = k;
    if (nd.name === 'footer' && footerStart < 0) footerStart = k;
  }
  const mainEnd = mainStart >= 0 ? findEnd(nodes, mainStart) : -1;
  // The site footer is the first <footer> after </main>; an <article> footer
  // inside <main> is not it. Without a closed <main>, fall back to the first.
  if (mainEnd > 0) {
    for (let k = mainEnd + 1; k < nodes.length; k++) {
      const nd = nodes[k];
      if (nd.k === 's' && nd.name === 'footer') {
        footerStart = k;
        break;
      }
    }
  }
  const footerEnd = footerStart >= 0 ? findEnd(nodes, footerStart) : -1;
  if (headEnd < 0) errors.push('no </head>');
  if (mainStart < 0) errors.push('no <main>');
  else if (mainEnd < 0) errors.push('unclosed <main>');

  const inHead = (/** @type {number} */ k) => headEnd >= 0 && k < headEnd;
  const inMain = (/** @type {number} */ k) => mainStart >= 0 && k > mainStart && k < mainEnd;
  const inFooter = (/** @type {number} */ k) => footerStart >= 0 && k > footerStart && k < footerEnd;
  const footerSet = new Set(protectedFooterHrefs(localeOf(path)));
  const hrefs = new Set();
  const footer = new Set();

  for (let k = 0; k < nodes.length; k++) {
    const nd = nodes[k];
    if (nd.k !== 's') continue;
    const at = nd.attrs;
    if ('data-pagefind-body' in at) s.pagefind = true;
    switch (nd.name) {
      case 'html':
        if (s.lang === null && 'lang' in at) s.lang = at.lang;
        break;
      case 'title':
        if (inHead(k) && s.title === null) s.title = textBetween(nodes, k, findEnd(nodes, k));
        break;
      case 'meta':
        if (!inHead(k)) break;
        if (at.name === 'description' && s.description === null) s.description = norm(at.content ?? '');
        else if (at.name === 'robots' && s.robots === null) s.robots = norm(at.content ?? '');
        else if (/^og:(title|description|url|image|image:alt)$/.test(at.property ?? '') && !(at.property in s.og))
          s.og[at.property] = norm(at.content ?? '');
        break;
      case 'link': {
        if (!inHead(k)) break;
        const rel = (at.rel ?? '').toLowerCase().split(/\s+/);
        if (rel.includes('canonical') && s.canonical === null) s.canonical = at.href ?? '';
        else if (rel.includes('alternate') && 'hreflang' in at) {
          if (at.hreflang === 'x-default') s.xDefault = at.href ?? '';
          else s.hreflang[at.hreflang] = at.href ?? '';
        }
        break;
      }
      case 'script':
        if ((at.type ?? '').toLowerCase() === 'application/ld+json') {
          try {
            s.ld.push(ldEntry(JSON.parse(nd.raw ?? '')));
          } catch {
            errors.push('unparseable ld+json block');
          }
        }
        break;
      case 'h1':
        s.h1.push(textBetween(nodes, k, findEnd(nodes, k)));
        break;
      case 'h2':
        if (inMain(k)) s.h2.push(textBetween(nodes, k, findEnd(nodes, k)));
        break;
      case 'a': {
        if (!('href' in at)) break;
        const href = internalHref(at.href, path);
        if (href === null) break;
        s.linkCount++;
        hrefs.add(href);
        if (inMain(k) && (at.rel ?? '').toLowerCase().split(/\s+/).includes('nofollow')) s.nofollow++;
        if (inFooter(k) && footerSet.has(href)) footer.add(href);
        if (WATCHED_ANCHOR.test(href)) {
          const e = findEnd(nodes, k);
          const t = e < 0 ? '' : textBetween(nodes, k, e);
          (s.anchors[href] ??= []).push(t || (at['aria-label'] ? `[aria-label] ${norm(at['aria-label'])}` : ''));
        }
        break;
      }
    }
    if (inMain(k)) {
      if (at.id === 'playground') s.isTool = true;
      if (
        UNRENDERED.has(nd.name) ||
        'hidden' in at ||
        at['aria-hidden'] === 'true' ||
        classTokens(at).some((t) => /(?:^|:)(?:sr-only|hidden)$/.test(t)) ||
        /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/i.test(at.style ?? '')
      )
        s.hidden++;
    }
  }

  if (s.title === null) errors.push('no <title> in <head>');
  if (s.canonical === null) errors.push('no canonical');
  s.hrefs = [...hrefs].sort();
  s.footer = [...footer].sort();
  for (const v of Object.values(s.anchors)) v.sort();
  s.ld.sort((/** @type {any} */ x, /** @type {any} */ y) => (x.type + x.body < y.type + y.body ? -1 : 1));

  if (mainStart >= 0 && mainEnd > 0) {
    const words = textBetween(nodes, mainStart, mainEnd, ' ', UNRENDERED);
    s.words = words ? words.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;
    for (const sel of opts.selectors ?? []) s.selected[sel] = selectText(nodes, mainStart, mainEnd, sel);
    if (opts.mainText) s.mainText = textBetween(nodes, mainStart, mainEnd, '', UNRENDERED);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Site index

/** Sitemap XML → [{ path, lastmod|null }]. */
export function extractSitemap(xml) {
  const out = [];
  for (const [, block] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = block.match(/<loc>(.*?)<\/loc>/)?.[1];
    if (!loc) continue;
    const path = loc.startsWith(ORIGIN) ? loc.slice(ORIGIN.length) || '/' : loc;
    out.push({ path, lastmod: block.match(/<lastmod>(.*?)<\/lastmod>/)?.[1] ?? null });
  }
  return out;
}

/**
 * Surfaces + sitemap XML + text files → the site index diffSites compares.
 * @param {any[]} surfaces extractPage results
 * @param {{ sitemaps?: string[], files?: Record<string,string> }} [extra]
 *   files: name → content for llms.txt / llms-full.txt (hashed here)
 */
export function buildSiteIndex(surfaces, extra = {}) {
  /** @type {Record<string, any>} */
  const pages = {};
  for (const s of surfaces) pages[s.path] = s;
  /** @type {Record<string, string|null>} */
  const lastmod = {};
  for (const xml of extra.sitemaps ?? []) for (const e of extractSitemap(xml)) lastmod[e.path] = e.lastmod;
  /** @type {Record<string, string|null>} */
  const hashes = {};
  for (const [name, content] of Object.entries(extra.files ?? {})) hashes[name] = content === null ? null : sha256(content);
  /** @type {Record<string, number>} */
  const inbound = {};
  for (const s of surfaces) {
    if (s.errors.length) continue;
    for (const h of s.hrefs) if (h !== s.path) inbound[h] = (inbound[h] ?? 0) + 1;
  }
  return { pages, lastmod, hashes, inbound };
}

/**
 * In-memory dist (relative path → content) → site index. Used by the vitest
 * file; the CLI reads real trees file by file with the same extractPage.
 * @param {Record<string,string>} files
 * @param {{ selectors?: string[], mainText?: boolean }} [opts]
 */
export function indexFromFiles(files, opts = {}) {
  const surfaces = [];
  const sitemaps = [];
  /** @type {Record<string,string>} */
  const text = {};
  for (const [rel, content] of Object.entries(files)) {
    if (rel.endsWith('.html')) surfaces.push(extractPage(content, pathFromFile(rel), opts));
    else if (/^sitemap-\d+\.xml$/.test(rel)) sitemaps.push(content);
    else if (/^llms(-full)?\.txt$/.test(rel)) text[rel] = content;
  }
  return buildSiteIndex(surfaces, { sitemaps, files: text });
}

// ---------------------------------------------------------------------------
// Diff

/** The changed middle of two strings (common prefix/suffix stripped). */
export function middleDiff(a, b) {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let q = 0;
  while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
  return { removed: a.slice(p, a.length - q), added: b.slice(p, b.length - q) };
}

function strSig(a, b) {
  if (a === null || b === null) return `${a === null ? '∅' : 'value'}→${b === null ? '∅' : 'value'}`;
  const { removed, added } = middleDiff(a, b);
  return `-${JSON.stringify(removed)} +${JSON.stringify(added)}`;
}

/**
 * Every surface difference between two site indexes, before any allowlist.
 * @returns {{ field: string, page: string, severity: 'must'|'info', from: any, to: any,
 *   sig: string, note?: string, drop?: number, dropFrac?: number }[]}
 */
export function diffSites(base, cand) {
  /** @type {any[]} */
  const out = [];
  const add = (/** @type {any} */ d) => out.push(d);
  const paths = [...new Set([...Object.keys(base.pages), ...Object.keys(cand.pages)])].sort();

  for (const p of paths) {
    const b = base.pages[p];
    const c = cand.pages[p];
    if (!c) {
      add({ field: 'page-removed', page: p, severity: 'must', from: p, to: null, sig: 'removed' });
      continue;
    }
    if (!b) {
      add({ field: 'page-added', page: p, severity: 'must', from: null, to: p, sig: 'added' });
      continue;
    }
    if (b.errors.length || c.errors.length) {
      const note = [
        b.errors.length ? `baseline: ${b.errors.join('; ')}` : '',
        c.errors.length ? `candidate: ${c.errors.join('; ')}` : '',
      ]
        .filter(Boolean)
        .join(' | ');
      add({ field: 'extract', page: p, severity: 'must', from: b.errors.join('; '), to: c.errors.join('; '), sig: note, note });
      continue;
    }
    const scalar = (/** @type {string} */ field, /** @type {any} */ x, /** @type {any} */ y, sev = 'must') => {
      if (x !== y) add({ field, page: p, severity: sev, from: x, to: y, sig: strSig(x, y) });
    };
    scalar('title', b.title, c.title);
    scalar('description', b.description, c.description);
    scalar('canonical', b.canonical, c.canonical);
    scalar('lang', b.lang, c.lang);
    scalar('robots', b.robots, c.robots);
    for (const k of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:alt'])
      scalar(k, b.og[k] ?? null, c.og[k] ?? null);
    const hb = stableStringify(b.hreflang);
    const hc = stableStringify(c.hreflang);
    if (hb !== hc) add({ field: 'hreflang', page: p, severity: 'must', from: hb, to: hc, sig: strSig(hb, hc) });
    if (Object.keys(c.hreflang).length && c.xDefault === null)
      add({ field: 'x-default', page: p, severity: 'must', from: b.xDefault, to: null, sig: 'missing', note: 'hreflang set without x-default' });
    else scalar('x-default', b.xDefault, c.xDefault);

    if (c.h1.length !== 1)
      add({ field: 'h1-count', page: p, severity: 'must', from: b.h1.length, to: c.h1.length, sig: `${b.h1.length}→${c.h1.length}` });
    scalar('h1', b.h1.join(' | '), c.h1.join(' | '));
    if (b.h2.join('\n') !== c.h2.join('\n')) {
      const reorder = [...b.h2].sort().join('\n') === [...c.h2].sort().join('\n');
      const removed = b.h2.filter((/** @type {string} */ x) => !c.h2.includes(x));
      const added = c.h2.filter((/** @type {string} */ x) => !b.h2.includes(x));
      add({
        field: 'h2', page: p, severity: 'info', from: b.h2, to: c.h2,
        sig: reorder ? 'reordered' : JSON.stringify({ removed, added }),
        note: reorder ? 'reordered' : `-${removed.length} +${added.length}`,
      });
    }

    const ldGroups = (/** @type {any[]} */ ld) => {
      /** @type {Record<string,string[]>} */
      const g = {};
      for (const e of ld) (g[e.type] ??= []).push(e.body);
      return g;
    };
    const lb = ldGroups(b.ld);
    const lc = ldGroups(c.ld);
    for (const t of [...new Set([...Object.keys(lb), ...Object.keys(lc)])].sort()) {
      const x = (lb[t] ?? []).join('\n');
      const y = (lc[t] ?? []).join('\n');
      if (x === y) continue;
      const kind = !lb[t] ? 'added' : !lc[t] ? 'removed' : 'changed';
      add({ field: `ld:${t}`, page: p, severity: 'must', from: x || null, to: y || null, sig: kind === 'changed' ? strSig(x, y) : kind, note: kind });
    }

    if (b.pagefind !== c.pagefind)
      add({ field: 'pagefind', page: p, severity: 'must', from: b.pagefind, to: c.pagefind, sig: `${b.pagefind}→${c.pagefind}` });

    for (const h of b.footer)
      if (!c.footer.includes(h))
        add({ field: `footer:${h}`, page: p, severity: 'must', from: h, to: null, sig: 'missing', note: 'protected footer target missing' });

    for (const [h, texts] of Object.entries(b.anchors)) {
      const now = c.anchors[h];
      if (!now) {
        add({ field: `anchor:${h}`, page: p, severity: 'must', from: texts.join(' | '), to: null, sig: 'link removed', note: 'watched link removed' });
      } else if (texts.join('\n') !== now.join('\n')) {
        const x = texts.join(' | ');
        const y = now.join(' | ');
        add({ field: `anchor:${h}`, page: p, severity: 'must', from: x, to: y, sig: strSig(x, y), note: 'anchor text changed' });
      }
    }

    if (c.nofollow > 0)
      add({ field: 'nofollow', page: p, severity: 'must', from: b.nofollow, to: c.nofollow, sig: `${b.nofollow}→${c.nofollow}`, note: 'internal rel="nofollow" inside <main>' });

    const removedHrefs = b.hrefs.filter((/** @type {string} */ h) => !c.hrefs.includes(h));
    const addedHrefs = c.hrefs.filter((/** @type {string} */ h) => !b.hrefs.includes(h));
    if (removedHrefs.length || addedHrefs.length || b.linkCount !== c.linkCount)
      add({
        field: 'links', page: p, severity: 'info', from: b.linkCount, to: c.linkCount,
        sig: JSON.stringify({ removed: removedHrefs, added: addedHrefs, delta: c.linkCount - b.linkCount }),
        note: `${b.linkCount}→${c.linkCount} links; +${addedHrefs.length} / -${removedHrefs.length} hrefs`,
      });

    if (b.words !== c.words) {
      const drop = b.words - c.words;
      const dropFrac = b.words ? drop / b.words : 0;
      add({
        field: 'words', page: p, severity: dropFrac > THRESHOLDS.wordDropFrac ? 'must' : 'info',
        from: b.words, to: c.words, drop, dropFrac, sig: `${drop > 0 ? '-' : '+'}${Math.abs(drop)}`,
        note: `${(dropFrac * -100).toFixed(1)}%`,
      });
    }

    // A tool page that lost its #playground marker stops classifying as 'tool',
    // which would also silence the hidden-count watch below: both sides count.
    if (b.isTool && !c.isTool)
      add({ field: 'is-tool', page: p, severity: 'must', from: true, to: false, sig: 'lost #playground', note: 'tool page no longer has a #playground section' });
    else if (!b.isTool && c.isTool)
      add({ field: 'is-tool', page: p, severity: 'info', from: false, to: true, sig: 'gained #playground' });

    if (b.hidden !== c.hidden) {
      const watched = HIDDEN_WATCH_CLASSES.has(classify(p, b)) || HIDDEN_WATCH_CLASSES.has(classify(p, c));
      add({
        field: 'hidden', page: p, severity: watched && c.hidden > b.hidden ? 'must' : 'info',
        from: b.hidden, to: c.hidden, sig: `${c.hidden > b.hidden ? '+' : '-'}${Math.abs(c.hidden - b.hidden)}`,
      });
    }
  }

  // Site level: sitemap membership and lastmod, llms hashes, inbound index.
  // A URL entering or leaving the sitemap is a membership change, not a
  // re-date: must-explain while its page builds on both sides (it was dropped
  // from, or newly offered to, the index with nothing else to show for it),
  // informational when page-added / page-removed already says so.
  const locs = [...new Set([...Object.keys(base.lastmod), ...Object.keys(cand.lastmod)])].sort();
  for (const p of locs) {
    const inX = p in base.lastmod;
    const inY = p in cand.lastmod;
    if (inX !== inY) {
      const builds = !!base.pages[p] && !!cand.pages[p];
      const sig = inX ? 'left sitemap' : 'entered sitemap';
      add({
        field: 'sitemap', page: p, severity: builds ? 'must' : 'info', from: inX, to: inY, sig,
        note: builds ? `${sig}; the page still builds` : `${sig} with its page`,
      });
      continue;
    }
    const x = base.lastmod[p];
    const y = cand.lastmod[p];
    if (x === y) continue;
    add({ field: 'lastmod', page: p, severity: 'info', from: x ?? null, to: y ?? null, sig: `${x ?? '∅'}→${y ?? '∅'}` });
  }
  for (const name of [...new Set([...Object.keys(base.hashes), ...Object.keys(cand.hashes)])].sort()) {
    if (base.hashes[name] !== cand.hashes[name])
      add({ field: `llms:${name}`, page: `/${name}`, severity: 'info', from: base.hashes[name] ?? null, to: cand.hashes[name] ?? null, sig: 'hash' });
  }
  // Inbound links, counted over source pages both sides could read: a page that
  // failed extraction is already must-explain, and its links must not also read
  // as an inbound drop on every target it pointed at. A removed page's links do
  // count — losing them is real.
  const readable = (/** @type {any} */ x, /** @type {any} */ y) => x && !x.errors.length && (!y || !y.errors.length);
  const inboundOf = (/** @type {any} */ side, /** @type {any} */ other) => {
    /** @type {Record<string, number>} */
    const counts = {};
    for (const [p, s] of Object.entries(side.pages)) {
      if (!readable(s, other.pages[p])) continue;
      for (const h of /** @type {any} */ (s).hrefs) if (h !== p) counts[h] = (counts[h] ?? 0) + 1;
    }
    return counts;
  };
  const inB = inboundOf(base, cand);
  const inC = inboundOf(cand, base);
  for (const [t, n] of Object.entries(inB)) {
    const m = inC[t] ?? 0;
    if (m >= n) continue;
    const drop = n - m;
    const dropFrac = drop / n;
    // Every drop is emitted (like words): informational up to the default
    // threshold, so an allow rule's maxDrop / maxDropAbs can still tighten it.
    add({
      field: `inbound:${t}`, page: t, severity: dropFrac > THRESHOLDS.inboundDropFrac ? 'must' : 'info', from: n, to: m, drop, dropFrac,
      sig: `${n}→${m}`, note: `linking pages ${n}→${m} (-${(dropFrac * 100).toFixed(0)}%)`,
    });
  }
  return out;
}

/**
 * Sitemap URLs whose <lastmod> changed, broken down by route class and locale.
 * The number a batch quotes ("~218 URLs re-dated") must come from here. Only
 * URLs listed on BOTH sides count: one entering or leaving the sitemap is the
 * `sitemap` field, not a re-date.
 */
export function redateBreakdown(base, cand) {
  /** @type {Record<string, Record<string, number>>} */
  const rows = {};
  const paths = [];
  for (const p of Object.keys(base.lastmod).sort()) {
    if (!(p in cand.lastmod)) continue;
    const x = base.lastmod[p];
    const y = cand.lastmod[p];
    if (x === y) continue;
    paths.push(p);
    const cls = classify(p, cand.pages[p] ?? base.pages[p]);
    const row = (rows[cls] ??= { total: 0, en: 0, de: 0, es: 0, fr: 0, 'pt-br': 0 });
    row.total++;
    row[localeOf(p)]++;
  }
  return { total: paths.length, rows, paths, loud: paths.length > THRESHOLDS.loudRedate };
}

// ---------------------------------------------------------------------------
// Allowlist

const globRe = (/** @type {string} */ g) =>
  new RegExp(`^${g.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);

/** Validate an allowlist object; throws with a precise message on any bad shape. */
export function validateAllowlist(allow) {
  if (!allow || typeof allow !== 'object' || Array.isArray(allow)) throw new Error('allowlist: not an object');
  if (typeof allow.batch !== 'string' || !allow.batch) throw new Error('allowlist: "batch" must be a non-empty string');
  if (typeof allow.expires !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(allow.expires))
    throw new Error('allowlist: "expires" must be YYYY-MM-DD');
  if (!Array.isArray(allow.rules)) throw new Error('allowlist: "rules" must be an array');
  allow.rules.forEach((r, i) => {
    const at = `allowlist rule #${i}`;
    if (!r || typeof r !== 'object') throw new Error(`${at}: not an object`);
    for (const k of Object.keys(r)) if (!RULE_KEYS.has(k)) throw new Error(`${at}: unknown key "${k}"`);
    if (typeof r.field !== 'string' || !r.field) throw new Error(`${at}: "field" is required`);
    if (typeof r.reason !== 'string' || !r.reason.trim()) throw new Error(`${at}: "reason" is required`);
    for (const k of ['pages', 'to']) {
      if (r[k] === undefined) continue;
      try {
        new RegExp(r[k]);
      } catch (e) {
        throw new Error(`${at}: "${k}" is not a valid regex (${/** @type {Error} */ (e).message})`);
      }
    }
    for (const k of ['maxDrop', 'maxDropAbs'])
      if (r[k] !== undefined && (typeof r[k] !== 'number' || r[k] < 0)) throw new Error(`${at}: "${k}" must be a number ≥ 0`);
    if (POSITIVE_FIELDS.has(r.field)) {
      if (typeof r.selector !== 'string') throw new Error(`${at}: "${r.field}" needs a "selector"`);
      parseSelector(r.selector);
      if (r.when !== undefined) parseSelector(r.when);
    } else if (r.selector !== undefined || r.when !== undefined) {
      throw new Error(`${at}: "selector"/"when" only apply to lede-present / must-contain`);
    }
  });
  return allow;
}

/**
 * What each side must capture for the allowlist's positive rules.
 * lede-present reads its selector on the BASELINE and needs the candidate's
 * <main> text; must-contain reads `selector` and `when` on the candidate.
 */
export function extractOptionsFor(allow) {
  const base = new Set();
  const cand = new Set();
  let mainText = false;
  for (const r of allow?.rules ?? []) {
    if (r.field === 'lede-present') {
      base.add(r.selector);
      mainText = true;
    } else if (r.field === 'must-contain') {
      cand.add(r.selector);
      if (r.when) cand.add(r.when);
    }
  }
  return { base: { selectors: [...base] }, cand: { selectors: [...cand], mainText } };
}

/**
 * Apply an allowlist to raw diffs and run its positive rules.
 * @param {any[]} diffs from diffSites
 * @param {any} allow validated allowlist, or null
 * @param {{ today: string, base: any, cand: any }} ctx today = YYYY-MM-DD supplied by the caller
 */
export function applyAllowlist(diffs, allow, ctx) {
  const rules = (allow?.rules ?? []).map((/** @type {any} */ r, /** @type {number} */ i) => ({
    ...r,
    index: i,
    fieldRe: globRe(r.field),
    pagesRe: r.pages ? new RegExp(r.pages) : null,
    toRe: r.to ? new RegExp(r.to) : null,
    used: 0,
  }));
  const expired = !!allow && ctx.today > allow.expires;
  const mustExplain = [];
  const allowed = [];
  const informational = [];

  for (const d of diffs) {
    // First match wins (firewall order): the first rule whose field, pages and
    // `to` match decides, and its bounds are final. Later, broader rules are
    // never consulted, so a narrow tightening rule listed first cannot be
    // loosened by a catch-all after it. Order specific rules before broad ones.
    const rule = rules.find(
      (/** @type {any} */ r) =>
        !POSITIVE_FIELDS.has(r.field) &&
        r.fieldRe.test(d.field) &&
        (!r.pagesRe || r.pagesRe.test(d.page)) &&
        (!r.toRe || r.toRe.test(d.to === null || d.to === undefined ? '' : String(d.to))),
    );
    if (!rule) {
      (d.severity === 'must' ? mustExplain : informational).push(d);
      continue;
    }
    rule.used++;
    if (typeof d.drop === 'number' && (rule.maxDrop !== undefined || rule.maxDropAbs !== undefined)) {
      const within =
        (rule.maxDrop === undefined || d.dropFrac <= rule.maxDrop) &&
        (rule.maxDropAbs === undefined || d.drop <= rule.maxDropAbs);
      if (!within) {
        const bound = [
          rule.maxDrop !== undefined ? `maxDrop ${rule.maxDrop}` : '',
          rule.maxDropAbs !== undefined ? `maxDropAbs ${rule.maxDropAbs}` : '',
        ]
          .filter(Boolean)
          .join(', ');
        mustExplain.push({ ...d, severity: 'must', note: `${d.note ?? ''} exceeds rule #${rule.index} (${bound})`.trim(), sig: `${d.sig} past #${rule.index}` });
        continue;
      }
    }
    allowed.push({ ...d, rule: rule.index, reason: rule.reason });
  }

  // Positive rules.
  for (const r of rules) {
    if (!POSITIVE_FIELDS.has(r.field)) continue;
    for (const p of Object.keys(ctx.cand.pages).sort()) {
      if (r.pagesRe && !r.pagesRe.test(p)) continue;
      const c = ctx.cand.pages[p];
      if (c.errors.length) continue;
      if (r.field === 'lede-present') {
        const b = ctx.base.pages[p];
        if (!b || b.errors.length) continue;
        r.used++;
        const want = b.selected?.[r.selector];
        if (!want) {
          mustExplain.push({ field: 'lede-present', page: p, severity: 'must', from: null, to: null, sig: 'baseline selector matched nothing', note: `baseline selector "${r.selector}" matched nothing (rule #${r.index})` });
        } else if (!(c.mainText ?? '').includes(want)) {
          mustExplain.push({ field: 'lede-present', page: p, severity: 'must', from: want, to: null, sig: 'lede text not found verbatim in candidate <main>', note: `rule #${r.index}` });
        } else {
          allowed.push({ field: 'lede-present', page: p, severity: 'info', from: want, to: want, sig: 'present', rule: r.index, reason: r.reason });
        }
      } else {
        if (r.when && (c.selected?.[r.when] ?? null) === null) continue;
        r.used++;
        if ((c.selected?.[r.selector] ?? null) === null)
          mustExplain.push({ field: 'must-contain', page: p, severity: 'must', from: null, to: null, sig: `missing ${r.selector}`, note: `candidate has no ${r.selector} (rule #${r.index})` });
        else allowed.push({ field: 'must-contain', page: p, severity: 'info', from: null, to: r.selector, sig: 'present', rule: r.index, reason: r.reason });
      }
    }
  }

  const unusedRules = rules
    .filter((/** @type {any} */ r) => r.used === 0)
    .map((/** @type {any} */ r) => ({ index: r.index, field: r.field, pages: r.pages ?? null, reason: r.reason }));
  return { mustExplain, allowed, informational, unusedRules, expired };
}

/**
 * Collapse identical diffs (same field, severity and change signature) across
 * many pages into one line with a count and sample paths.
 */
export function collapseDiffs(diffs) {
  /** @type {Map<string, any>} */
  const groups = new Map();
  for (const d of diffs) {
    const key = `${d.severity}\u0000${d.field}\u0000${d.sig}`;
    const g = groups.get(key);
    if (g) {
      g.count++;
      if (g.samples.length < THRESHOLDS.samples) g.samples.push(d.page);
    } else groups.set(key, { field: d.field, severity: d.severity, sig: d.sig, note: d.note, count: 1, samples: [d.page], example: d });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || (a.field < b.field ? -1 : 1));
}

/**
 * The whole comparison: diff, allowlist, re-date breakdown, exit code.
 * @param {any} base site index
 * @param {any} cand site index
 * @param {any} allow validated allowlist or null
 * @param {{ today: string }} opts
 */
export function compareSites(base, cand, allow, opts) {
  const diffs = diffSites(base, cand);
  const res = applyAllowlist(diffs, allow, { today: opts.today, base, cand });
  const redates = redateBreakdown(base, cand);
  const exitCode = res.expired ? 2 : res.mustExplain.length ? 1 : 0;
  return {
    ...res,
    redates,
    exitCode,
    pageCount: { base: Object.keys(base.pages).length, cand: Object.keys(cand.pages).length },
  };
}

/**
 * Whether one guard build ran on a cold content layer, and the sentence the
 * log and report print about it. The evidence is: node_modules/.astro was
 * renamed aside before the build (or none existed — renameSync throws rather
 * than half-succeeding), then the build wrote a fresh data-store.json at that
 * now-empty path and logged "[content] Synced content". The store's absence
 * is NOT checked before the build: right after the rename it is absent by
 * construction, so such a check could never fail and proves nothing.
 * @param {{ hadCache: boolean, storeWritten: boolean, synced: boolean }} o
 */
export function coldVerdict(o) {
  const cold = o.storeWritten && o.synced;
  const detail =
    `${cold ? 'cold' : 'NOT PROVABLY COLD'} content layer (node_modules/.astro moved aside before the build: ` +
    `${o.hadCache ? 'yes' : 'none existed'}; fresh data-store.json written by the build: ${o.storeWritten}; ` +
    `"[content] Synced content" logged: ${o.synced})`;
  return { cold, detail };
}

// ---------------------------------------------------------------------------
// Report

const clip = (/** @type {any} */ v, n = 140) => {
  const s = v === null || v === undefined ? '∅' : typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > n ? `${s.slice(0, n)}…` : s;
};
const mdCell = (/** @type {string} */ s) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function groupLines(diffs) {
  return collapseDiffs(diffs).map((g) => {
    const where = g.count > 1 ? `${g.count} pages, e.g. ${g.samples.join(', ')}` : g.samples[0];
    const ex = g.example;
    const change = g.count > 1 ? g.sig : `${clip(ex.from)} → ${clip(ex.to)}`;
    return `- **${g.field}** · ${where} · ${mdCell(clip(change, 200))}${g.note ? ` · ${mdCell(clip(g.note, 160))}` : ''}`;
  });
}

/** One-line console summary. */
export function summaryLine(result) {
  return (
    `seo-surface: ${result.mustExplain.length} must-explain, ${result.allowed.length} allowed, ` +
    `${result.informational.length} informational; ${result.redates.total} URL(s) re-dated; ` +
    `pages ${result.pageCount.base} → ${result.pageCount.cand}` +
    (result.unusedRules.length ? `; ${result.unusedRules.length} unused allow rule(s)` : '') +
    (result.expired ? '; ALLOWLIST EXPIRED' : '')
  );
}

/**
 * Markdown report.
 * @param {any} result compareSites output
 * @param {{ batch: string, date: string, baseline?: string, candidate?: string,
 *   allowFile?: string|null, expires?: string|null, builds?: string[], timing?: string[],
 *   exit?: number, notCold?: string|null }} meta `exit` is the process's final exit
 *   code when the caller applies checks of its own (the cold-build gate); `notCold`
 *   names the build that could not be proven cold.
 */
export function renderMarkdown(result, meta) {
  const L = [];
  L.push(`# SEO-surface diff — ${meta.batch} — ${meta.date}`, '');
  L.push(`- Baseline: ${meta.baseline ?? '?'}`);
  L.push(`- Candidate: ${meta.candidate ?? '?'}`);
  L.push(`- Allowlist: ${meta.allowFile ? `\`${meta.allowFile}\` (expires ${meta.expires})` : 'none'}`);
  for (const b of meta.builds ?? []) L.push(`- Build: ${b}`);
  for (const t of meta.timing ?? []) L.push(`- Timing: ${t}`);
  L.push('', '## Summary', '');
  L.push(`- **Exit ${meta.exit ?? result.exitCode}** — ${summaryLine(result)}`);
  if (meta.notCold)
    L.push(`- **Not a verified cold build: ${meta.notCold}.** A warm content layer can hide a rehype/Shiki change, so this run exits 1 whatever the diff says.`);
  L.push(`- Pages: ${result.pageCount.base} baseline, ${result.pageCount.cand} candidate`);
  if (result.expired) L.push(`- **The allowlist expired on ${meta.expires}** — prune or re-date it (exit 2).`);
  if (result.redates.loud)
    L.push(`- **LOUD: ${result.redates.total} sitemap URLs re-dated (> ${THRESHOLDS.loudRedate}).** Check this matches the batch's expectation.`);
  L.push('', `## Must-explain (${result.mustExplain.length})`, '');
  L.push(...(result.mustExplain.length ? groupLines(result.mustExplain) : ['None.']));
  L.push('', `## Allowed by rule (${result.allowed.length})`, '');
  if (result.allowed.length) {
    const byRule = new Map();
    for (const a of result.allowed) byRule.set(a.rule, [...(byRule.get(a.rule) ?? []), a]);
    for (const [rule, list] of [...byRule].sort((x, y) => x[0] - y[0])) {
      L.push(`- Rule #${rule} (${mdCell(list[0].reason)}): ${list.length} diff(s)`);
      for (const line of groupLines(list).slice(0, 10)) L.push(`  ${line}`);
    }
  } else L.push('None.');
  L.push('', `## Informational (${result.informational.length})`, '');
  L.push(...(result.informational.length ? groupLines(result.informational).slice(0, 200) : ['None.']));
  L.push('', `## Re-date breakdown (${result.redates.total} URLs)`, '');
  if (result.redates.total) {
    L.push('| route class | URLs | en | de | es | fr | pt-br |', '|---|---:|---:|---:|---:|---:|---:|');
    for (const [cls, r] of Object.entries(result.redates.rows).sort((a, b) => b[1].total - a[1].total))
      L.push(`| ${cls} | ${r.total} | ${r.en} | ${r.de} | ${r.es} | ${r.fr} | ${r['pt-br']} |`);
  } else L.push('No sitemap <lastmod> changed.');
  L.push('', `## Unused allow rules (${result.unusedRules.length})`, '');
  L.push(
    ...(result.unusedRules.length
      ? result.unusedRules.map((/** @type {any} */ r) => `- #${r.index} \`${r.field}\`${r.pages ? ` pages \`${r.pages}\`` : ''} — ${mdCell(r.reason)} (prune it)`)
      : ['None.']),
  );
  L.push('');
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// Fixtures shared by `--self-test` (written to os.tmpdir() as real dist trees)
// and src/lib/seo-surface-diff.test.ts (fed through indexFromFiles).

const words = (/** @type {number} */ n, w = 'word') => Array.from({ length: n }, (_, i) => `${w}${i}`).join(' ');

/**
 * @param {{ path: string, lang?: string, title: string, h1?: string, main: string,
 *   ld?: any[], robots?: string|null, hreflang?: Record<string,string>|null, pagefind?: boolean,
 *   head?: string }} o
 */
export function fixturePage(o) {
  const lang = o.lang ?? 'en';
  const url = ORIGIN + o.path;
  const pre = lang === 'en' ? '' : `/${lang}`;
  const hreflang =
    o.hreflang === null
      ? ''
      : Object.entries(o.hreflang ?? { en: url, 'x-default': url })
          .map(([l, h]) => `<link rel="alternate" hreflang="${l}" href="${h}">`)
          .join('');
  const ld = (o.ld ?? []).map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('');
  const footer = [...LOCALIZED_PROTECTED.map((h) => pre + h), ...ENGLISH_ONLY_PROTECTED]
    .map((h) => `<li><a href="${h}">${h}</a></li>`)
    .join('');
  return (
    `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><title>${o.title}</title>` +
    `<meta name="description" content="Description of ${o.title}">` +
    (o.robots ? `<meta name="robots" content="${o.robots}">` : '') +
    `<link rel="canonical" href="${url}">${hreflang}` +
    `<meta property="og:title" content="${o.title}"><meta property="og:url" content="${url}">` +
    `<meta property="og:image" content="${ORIGIN}/og.png">${o.head ?? ''}${ld}</head><body>` +
    `<header data-pagefind-ignore><a href="${pre}/">Home</a> <a href="/blog/">Blog</a></header>` +
    `<main id="main"${o.pagefind === false ? '' : ' data-pagefind-body'}>${o.main}</main>` +
    `<footer data-pagefind-ignore><ul>${footer}</ul></footer></body></html>`
  );
}

const toolMain = (/** @type {string} */ h1, /** @type {string} */ lede, cat = '/tools/networking/') =>
  `<section class="hero"><nav><a href="${cat}">Category</a></nav>` +
  `<h1 class="display-lg">${h1}</h1><p class="body-md lede">${lede}</p></section>` +
  `<section id="playground"><div class="container-page"><div data-copy="a -> b, x > y" class="code-copy">` +
  `<pre>192.168.0.0/24</pre></div></div></section>` +
  `<section id="why"><h2>Why subnetting</h2><p>${words(30, 'why')}</p><h2>Reference</h2><p>${words(20, 'ref')}</p></section>`;

const LEDE = 'Network, broadcast, netmask &amp; wildcard for any IPv4 or IPv6 CIDR.';
const SITEMAP = (/** @type {Record<string,string>} */ map) =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset>${Object.entries(map)
    .map(([p, d]) => `<url><loc>${ORIGIN}${p}</loc>${d ? `<lastmod>${d}</lastmod>` : ''}</url>`)
    .join('')}</urlset>`;
const D1 = '2026-09-30T00:00:00.000Z';
const D2 = '2026-10-02T00:00:00.000Z';

/** The base fixture site (relative dist path → content). */
export function fixtureSite() {
  const toolLd = [
    { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Subnet Calculator', dateModified: '2026-09-30' },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'What is a /24?' }] },
  ];
  /** @type {Record<string,string>} */
  const files = {
    'index.html': fixturePage({ path: '/', title: 'OpsCanopy', h1: 'Free DevOps tools', main: `<h1>Free DevOps tools</h1><p>${words(40)}</p><a href="/tools/">All tools</a><a href="/learn/">Learn</a>` }),
    'tools/index.html': fixturePage({
      path: '/tools/',
      title: 'All tools',
      main:
        `<h1>Tools</h1><nav><a href="/tools/networking/">Networking 6</a> <a href="/tools/encoding/">Encoding 4</a></nav>` +
        `<ul><li><a href="/subnet-calculator/">Subnet Calculator</a></li></ul><p>${words(30)}</p>`,
    }),
    'tools/networking/index.html': fixturePage({ path: '/tools/networking/', title: 'Networking tools', main: `<h1>Networking tools</h1><p>${words(25)}</p><a href="/subnet-calculator/">Subnet Calculator</a>` }),
    'tools/encoding/index.html': fixturePage({ path: '/tools/encoding/', title: 'Encoding tools', main: `<h1>Encoding tools</h1><p>${words(25)}</p>` }),
    'subnet-calculator/index.html': fixturePage({
      path: '/subnet-calculator/',
      title: 'Subnet Calculator — Free IPv4 &amp; IPv6',
      hreflang: { en: `${ORIGIN}/subnet-calculator/`, de: `${ORIGIN}/de/subnet-calculator/`, 'x-default': `${ORIGIN}/subnet-calculator/` },
      ld: toolLd,
      main: toolMain('<span>Subnet Calculator:</span> <span>Subnet any block at a glance.</span>', LEDE),
    }),
    'de/subnet-calculator/index.html': fixturePage({
      path: '/de/subnet-calculator/',
      lang: 'de',
      title: 'Subnetzrechner',
      hreflang: { en: `${ORIGIN}/subnet-calculator/`, de: `${ORIGIN}/de/subnet-calculator/`, 'x-default': `${ORIGIN}/subnet-calculator/` },
      ld: toolLd,
      // Links the other category so /tools/networking/ has exactly two linking pages.
      main: toolMain('<span>Subnetzrechner:</span> <span>Jeden Block auf einen Blick.</span>', 'Netzwerk und Broadcast.', '/tools/encoding/'),
    }),
    'blog/post/index.html': fixturePage({
      path: '/blog/post/',
      title: 'A post',
      ld: [{ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: 'A post', datePublished: '2026-09-01' }],
      main: `<article><h1>A post</h1><p>${words(100, 'body')}</p><pre class="astro-code" data-language="yaml"><code>key: value</code></pre></article>`,
    }),
    'blog/tag/x/index.html': fixturePage({ path: '/blog/tag/x/', title: 'Tag x', robots: 'noindex,nofollow', hreflang: null, main: `<h1>Posts tagged x</h1><a href="/blog/post/">A post</a>` }),
    'sitemap-0.xml': SITEMAP({ '/': D1, '/tools/': D1, '/tools/networking/': D1, '/tools/encoding/': D1, '/subnet-calculator/': D1, '/de/subnet-calculator/': D1, '/blog/post/': D1 }),
    'llms.txt': '# OpsCanopy\n- Subnet Calculator\n',
  };
  return files;
}

/** A site of n tool pages whose H1 splits name and headline across two spans. */
export function fixtureManyTools(n, joiner = ' ') {
  /** @type {Record<string,string>} */
  const files = {};
  /** @type {Record<string,string>} */
  const map = {};
  for (let i = 0; i < n; i++) {
    const path = `/tool-${i}/`;
    files[`tool-${i}/index.html`] = fixturePage({ path, title: `Tool ${i}`, main: toolMain(`<span>Tool ${i}:</span>${joiner}<span>Does thing ${i}.</span>`, `Lede ${i}.`) });
    map[path] = D1;
  }
  files['index.html'] = fixturePage({ path: '/', title: 'Home', main: '<h1>Home</h1>' });
  files['sitemap-0.xml'] = SITEMAP(map);
  return files;
}

const edit = (/** @type {Record<string,string>} */ files, /** @type {string} */ rel, /** @type {(s: string) => string} */ fn) => {
  const out = { ...files };
  const before = out[rel];
  out[rel] = fn(before);
  if (out[rel] === before) throw new Error(`fixture edit on ${rel} changed nothing`);
  return out;
};
const SUBNET = 'subnet-calculator/index.html';
const allowFor = (/** @type {any[]} */ rules, expires = '2026-11-30') => ({ batch: 'fixture', expires, rules });
const TODAY = '2026-10-02';

/**
 * Every fixture case of the guard. `expect.exit` is the exit code; `must` lists
 * fields that must appear among must-explain diffs; `info` among informational;
 * `mustCount` pins the exact must-explain count; `groups` pins the collapsed
 * must-explain line count; `notMust` / `notInfo` list fields that must NOT
 * appear there; `redates` pins the re-date breakdown's URL total.
 * @returns {{ name: string, base: Record<string,string>, cand: Record<string,string>, allow?: any,
 *   today: string, expect: { exit: number, must?: string[], info?: string[], allowed?: string[],
 *   mustCount?: number, groups?: number, unused?: number, loud?: boolean,
 *   notMust?: string[], notInfo?: string[], redates?: number } }[]}
 */
export function selfTestCases() {
  const base = fixtureSite();
  const many = fixtureManyTools(195, ' ');
  const wordsOf = (/** @type {number} */ k) =>
    edit(base, 'blog/post/index.html', (s) => s.replace(words(100, 'body'), words(100 - k, 'body')));
  // Ten tool pages link home (/) from the header; home's own link is a self-link.
  const tenHome = fixtureManyTools(10, ' ');
  const tenHomeMinusOne = edit(tenHome, 'tool-0/index.html', (s) => s.replace('<a href="/">Home</a>', '<span>Home</span>'));
  return [
    { name: 'identical trees → exit 0', base, cand: base, today: TODAY, expect: { exit: 0, mustCount: 0 } },
    {
      name: '">" inside an attribute value does not break extraction → exit 0',
      base,
      // A `<[^>]*>` scan would end the tag at "->" and then count a second H1.
      cand: edit(base, SUBNET, (s) => s.replace('data-copy="a -> b, x > y"', 'data-copy="a -> b, <h1>not a heading</h1> x > y"')),
      today: TODAY,
      expect: { exit: 0, mustCount: 0 },
    },
    { name: 'title change → must-explain', base, cand: edit(base, SUBNET, (s) => s.replace('<title>Subnet Calculator', '<title>Subnet Calc')), today: TODAY, expect: { exit: 1, must: ['title'] } },
    {
      name: 'title allowed by a rule whose `to` matches → exit 0',
      base,
      cand: edit(base, SUBNET, (s) => s.replace('<title>Subnet Calculator', '<title>Subnet Calc')),
      allow: allowFor([{ field: 'title', pages: '^/subnet-calculator/$', to: '^Subnet Calc —', reason: 'shorter title' }]),
      today: TODAY,
      expect: { exit: 0, allowed: ['title'], unused: 0 },
    },
    {
      name: 'title rule whose `to` does not match → must-explain',
      base,
      cand: edit(base, SUBNET, (s) => s.replace('<title>Subnet Calculator', '<title>Subnet Calc')),
      allow: allowFor([{ field: 'title', pages: '^/subnet-calculator/$', to: '^Something else', reason: 'other title' }]),
      today: TODAY,
      expect: { exit: 1, must: ['title'], unused: 1 },
    },
    { name: 'dateModified-only JSON-LD change → exit 0', base, cand: edit(base, SUBNET, (s) => s.replace('"dateModified":"2026-09-30"', '"dateModified":"2026-10-02"')), today: TODAY, expect: { exit: 0, mustCount: 0 } },
    {
      name: 'JSON-LD type added → must-explain',
      base,
      cand: edit(base, SUBNET, (s) => s.replace('</head>', `<script type="application/ld+json">{"@type":"HowTo","name":"x"}</script></head>`)),
      today: TODAY,
      expect: { exit: 1, must: ['ld:HowTo'] },
    },
    {
      name: 'H2 reorder → informational only',
      base,
      cand: edit(base, SUBNET, (s) => s.replace(/<h2>Why subnetting<\/h2>(<p>[^<]*<\/p>)<h2>Reference<\/h2>/, '<h2>Reference</h2>$1<h2>Why subnetting</h2>')),
      today: TODAY,
      expect: { exit: 0, info: ['h2'], mustCount: 0 },
    },
    { name: 'watched anchor text change → must-explain', base, cand: edit(base, 'tools/index.html', (s) => s.replace('Networking 6</a>', 'Network tools</a>')), today: TODAY, expect: { exit: 1, must: ['anchor:/tools/networking/'] } },
    {
      name: 'one of two category links removed → inbound 50% drop → must-explain',
      base,
      cand: edit(base, 'tools/index.html', (s) => s.replace('<a href="/tools/networking/">Networking 6</a>', '<span>Networking 6</span>')),
      today: TODAY,
      expect: { exit: 1, must: ['inbound:/tools/networking/', 'anchor:/tools/networking/'] },
    },
    { name: 'data-pagefind-body removed → must-explain', base, cand: edit(base, 'blog/post/index.html', (s) => s.replace(' data-pagefind-body', '')), today: TODAY, expect: { exit: 1, must: ['pagefind'] } },
    { name: 'sitemap lastmod change → informational only', base, cand: edit(base, 'sitemap-0.xml', (s) => s.replace(`/blog/post/</loc><lastmod>${D1}`, `/blog/post/</loc><lastmod>${D2}`)), today: TODAY, expect: { exit: 0, info: ['lastmod'], mustCount: 0, redates: 1 } },
    {
      name: 'page removed → must-explain',
      base,
      cand: (() => {
        const c = { ...base };
        delete c['tools/encoding/index.html'];
        return c;
      })(),
      today: TODAY,
      expect: { exit: 1, must: ['page-removed'] },
    },
    { name: 'page added → must-explain', base, cand: { ...base, 'new/index.html': fixturePage({ path: '/new/', title: 'New', main: '<h1>New</h1>' }) }, today: TODAY, expect: { exit: 1, must: ['page-added'] } },
    { name: 'expired allowlist → exit 2', base, cand: base, allow: allowFor([], '2026-10-01'), today: TODAY, expect: { exit: 2 } },
    { name: '21% word drop (the >20% rule) → must-explain', base, cand: wordsOf(21), today: TODAY, expect: { exit: 1, must: ['words'] } },
    { name: '5% word drop → informational', base, cand: wordsOf(5), today: TODAY, expect: { exit: 0, info: ['words'], mustCount: 0 } },
    {
      name: '21% word drop with a maxDrop 0.25 rule → allowed',
      base,
      cand: wordsOf(21),
      allow: allowFor([{ field: 'words', pages: '^/blog/', maxDrop: 0.25, reason: 'trimmed intro' }]),
      today: TODAY,
      expect: { exit: 0, allowed: ['words'] },
    },
    {
      name: '5% word drop past a maxDropAbs 3 rule → must-explain',
      base,
      cand: wordsOf(5),
      allow: allowFor([{ field: 'words', pages: '^/blog/', maxDropAbs: 3, reason: 'eyebrow removed' }]),
      today: TODAY,
      expect: { exit: 1, must: ['words'] },
    },
    { name: 'malformed page (no <main>) → must-explain', base, cand: edit(base, 'tools/encoding/index.html', (s) => s.replace(/<(\/?)main\b/g, '<$1div')), today: TODAY, expect: { exit: 1, must: ['extract'] } },
    { name: 'missing canonical → must-explain (fail closed)', base, cand: edit(base, 'tools/encoding/index.html', (s) => s.replace(/<link rel="canonical"[^>]*>/, '')), today: TODAY, expect: { exit: 1, must: ['extract'] } },
    { name: 'second H1 → must-explain', base, cand: edit(base, 'tools/encoding/index.html', (s) => s.replace('<p>', '<h1>Another</h1><p>')), today: TODAY, expect: { exit: 1, must: ['h1-count', 'h1'] } },
    { name: 'lang change → must-explain', base, cand: edit(base, 'de/subnet-calculator/index.html', (s) => s.replace('<html lang="de">', '<html lang="en">')), today: TODAY, expect: { exit: 1, must: ['lang'] } },
    { name: 'robots flip → must-explain', base, cand: edit(base, 'blog/tag/x/index.html', (s) => s.replace('noindex,nofollow', 'index,follow')), today: TODAY, expect: { exit: 1, must: ['robots'] } },
    { name: 'canonical change → must-explain', base, cand: edit(base, SUBNET, (s) => s.replace('rel="canonical" href="https://opscanopy.com/subnet-calculator/"', 'rel="canonical" href="https://opscanopy.com/subnet/"')), today: TODAY, expect: { exit: 1, must: ['canonical'] } },
    { name: 'description change → must-explain', base, cand: edit(base, SUBNET, (s) => s.replace('content="Description of', 'content="About')), today: TODAY, expect: { exit: 1, must: ['description'] } },
    { name: 'og:image change → must-explain', base, cand: edit(base, SUBNET, (s) => s.replace('/og.png', '/og-2.png')), today: TODAY, expect: { exit: 1, must: ['og:image'] } },
    { name: 'x-default removed → must-explain', base, cand: edit(base, SUBNET, (s) => s.replace(/<link rel="alternate" hreflang="x-default"[^>]*>/, '')), today: TODAY, expect: { exit: 1, must: ['x-default'] } },
    { name: 'hreflang set change → must-explain', base, cand: edit(base, SUBNET, (s) => s.replace(/<link rel="alternate" hreflang="de"[^>]*>/, '')), today: TODAY, expect: { exit: 1, must: ['hreflang'] } },
    { name: 'protected footer href missing → must-explain', base, cand: edit(base, 'blog/post/index.html', (s) => s.replace('<li><a href="/privacy/">/privacy/</a></li>', '')), today: TODAY, expect: { exit: 1, must: ['footer:/privacy/'] } },
    { name: 'internal nofollow inside <main> → must-explain', base, cand: edit(base, 'index.html', (s) => s.replace('<a href="/tools/">', '<a href="/tools/" rel="nofollow">')), today: TODAY, expect: { exit: 1, must: ['nofollow'] } },
    {
      name: 'hidden-count increase on a tool page → must-explain',
      base,
      cand: edit(base, SUBNET, (s) => s.replace('<p class="body-md lede">', '<p class="body-md lede sr-only">')),
      today: TODAY,
      expect: { exit: 1, must: ['hidden'] },
    },
    { name: 'llms.txt change → informational only', base, cand: { ...base, 'llms.txt': '# OpsCanopy\n- Subnet Calculator\n- New\n' }, today: TODAY, expect: { exit: 0, info: ['llms:llms.txt'], mustCount: 0 } },
    {
      name: 'lost inter-span H1 space on 195 pages → must-explain, one collapsed line',
      base: many,
      cand: fixtureManyTools(195, ''),
      today: TODAY,
      expect: { exit: 1, must: ['h1'], mustCount: 195, groups: 1 },
    },
    {
      name: 're-dating 195 URLs → informational with a loud breakdown line',
      base: many,
      cand: edit(many, 'sitemap-0.xml', (s) => s.split(D1).join(D2)),
      today: TODAY,
      expect: { exit: 0, info: ['lastmod'], mustCount: 0, loud: true, redates: 195 },
    },
    {
      name: 'lede moved verbatim below the panel → lede-present passes',
      base,
      cand: edit(base, SUBNET, (s) =>
        s.replace(`<p class="body-md lede">${LEDE}</p>`, '').replace('</div></section><section id="why">', `<p class="body-md">${LEDE}</p></div></section><section id="why">`),
      ),
      allow: allowFor([
        { field: 'lede-present', pages: '^/subnet-calculator/$', selector: 'h1 ~ p.lede', reason: 'lede moves below the panel' },
      ]),
      today: TODAY,
      expect: { exit: 0, allowed: ['lede-present'], mustCount: 0 },
    },
    {
      name: 'lede text altered by one word → lede-present must-explain',
      base,
      cand: edit(base, SUBNET, (s) => s.replace('netmask &amp; wildcard', 'mask &amp; wildcard')),
      allow: allowFor([{ field: 'lede-present', pages: '^/subnet-calculator/$', selector: 'h1 ~ p.lede', reason: 'lede moves below the panel' }]),
      today: TODAY,
      expect: { exit: 1, must: ['lede-present'] },
    },
    {
      name: 'candidate post with a code block contains <figure class="code-fig"> → positive pass',
      base,
      cand: edit(base, 'blog/post/index.html', (s) => s.replace(/(<pre class="astro-code"[\s\S]*?<\/pre>)/, '<figure class="code-fig"><div class="figcap">yaml</div>$1</figure>')),
      allow: allowFor([{ field: 'must-contain', pages: '^/blog/', when: 'pre.astro-code', selector: 'figure.code-fig', reason: 'B2 wraps code blocks' }]),
      today: TODAY,
      expect: { exit: 0, allowed: ['must-contain'], mustCount: 0 },
    },
    {
      name: 'candidate post with a bare code block (no figure) → must-contain must-explain',
      base,
      cand: base,
      allow: allowFor([{ field: 'must-contain', pages: '^/blog/', when: 'pre.astro-code', selector: 'figure.code-fig', reason: 'B2 wraps code blocks' }]),
      today: TODAY,
      expect: { exit: 1, must: ['must-contain'] },
    },
    {
      name: 'allow rule that matches nothing is listed as unused',
      base,
      cand: base,
      allow: allowFor([{ field: 'h1', pages: '^/learn/$', reason: 'sentence case' }]),
      today: TODAY,
      expect: { exit: 0, unused: 1, mustCount: 0 },
    },
    // Inbound drops at or under the default 10% are informational, and an allow
    // rule's bound still tightens them. Ten tool pages link / (not a watched
    // anchor) from the header; one drops the link: 10 → 9.
    {
      name: 'inbound 10% drop → informational',
      base: tenHome,
      cand: tenHomeMinusOne,
      today: TODAY,
      expect: { exit: 0, info: ['inbound:/'], mustCount: 0 },
    },
    {
      name: 'inbound 10% drop past a maxDrop 0 rule → must-explain',
      base: tenHome,
      cand: tenHomeMinusOne,
      allow: allowFor([{ field: 'inbound:/', maxDrop: 0, reason: 'no page may lose its link home' }]),
      today: TODAY,
      expect: { exit: 1, must: ['inbound:/'], unused: 0 },
    },
    {
      name: 'first matching rule wins: a broader rule after a maxDrop 0 rule does not loosen it → must-explain',
      base: tenHome,
      cand: tenHomeMinusOne,
      allow: allowFor([
        { field: 'inbound:/', maxDrop: 0, reason: 'no page may lose its link home' },
        { field: 'inbound:*', maxDrop: 0.5, reason: 'broad catch-all listed second' },
      ]),
      today: TODAY,
      expect: { exit: 1, must: ['inbound:/'], unused: 1 },
    },
    {
      name: 'inline display:none on a tool page → hidden must-explain',
      base,
      cand: edit(base, SUBNET, (s) => s.replace('<p class="body-md lede">', '<p class="body-md lede" style="display: none">')),
      today: TODAY,
      expect: { exit: 1, must: ['hidden'] },
    },
    {
      name: 'tool page loses #playground and hides its lede → is-tool and hidden must-explain',
      base,
      cand: edit(base, SUBNET, (s) => s.replace('id="playground"', 'id="pg"').replace('<p class="body-md lede">', '<p class="body-md lede sr-only">')),
      today: TODAY,
      expect: { exit: 1, must: ['is-tool', 'hidden'] },
    },
    // Added after the second 2026-10-02 review.
    {
      name: 'URL dropped from the sitemap while its page builds → sitemap must-explain, not a re-date',
      base,
      cand: edit(base, 'sitemap-0.xml', (s) => s.replace(`<url><loc>${ORIGIN}/tools/encoding/</loc><lastmod>${D1}</lastmod></url>`, '')),
      today: TODAY,
      expect: { exit: 1, must: ['sitemap'], mustCount: 1, notInfo: ['lastmod'], redates: 0 },
    },
    {
      name: 'URL added to the sitemap for a page that already built → sitemap must-explain, not a re-date',
      base,
      cand: edit(base, 'sitemap-0.xml', (s) => s.replace('</urlset>', `<url><loc>${ORIGIN}/blog/tag/x/</loc><lastmod>${D1}</lastmod></url></urlset>`)),
      today: TODAY,
      expect: { exit: 1, must: ['sitemap'], mustCount: 1, notInfo: ['lastmod'], redates: 0 },
    },
    {
      name: 'page removed with its sitemap URL → page-removed must-explain, sitemap informational, not a re-date',
      base,
      cand: (() => {
        const c = edit(base, 'sitemap-0.xml', (s) => s.replace(`<url><loc>${ORIGIN}/tools/encoding/</loc><lastmod>${D1}</lastmod></url>`, ''));
        delete c['tools/encoding/index.html'];
        return c;
      })(),
      today: TODAY,
      expect: { exit: 1, must: ['page-removed'], info: ['sitemap'], notMust: ['sitemap'], notInfo: ['lastmod'], redates: 0 },
    },
    {
      name: 'FAQ question text changed in JSON-LD → ld:FAQPage must-explain',
      base,
      cand: edit(base, SUBNET, (s) => s.replace('"name":"What is a /24?"', '"name":"What is a /25?"')),
      today: TODAY,
      expect: { exit: 1, must: ['ld:FAQPage'], mustCount: 1 },
    },
    {
      name: 'x-default retargeted (href changed, not removed) → must-explain',
      base,
      cand: edit(base, SUBNET, (s) =>
        s.replace(`hreflang="x-default" href="${ORIGIN}/subnet-calculator/"`, `hreflang="x-default" href="${ORIGIN}/de/subnet-calculator/"`),
      ),
      today: TODAY,
      expect: { exit: 1, must: ['x-default'], mustCount: 1 },
    },
    {
      name: 'tool copy moved into a <template> inside <main> → hidden and words must-explain',
      base,
      cand: edit(base, SUBNET, (s) => s.replace(/<section id="why">([\s\S]*?)<\/section>/, '<section id="why"><template>$1</template></section>')),
      today: TODAY,
      expect: { exit: 1, must: ['hidden', 'words'] },
    },
    {
      name: 'tool lede moved into a <noscript> inside <main> → hidden must-explain, words drop',
      base,
      cand: edit(base, SUBNET, (s) => s.replace(`<p class="body-md lede">${LEDE}</p>`, `<noscript><p class="body-md lede">${LEDE}</p></noscript>`)),
      today: TODAY,
      expect: { exit: 1, must: ['hidden'], info: ['words'] },
    },
    {
      name: 'unquoted href ending in "/" is not read as self-closing → exit 0',
      base,
      cand: edit(base, 'index.html', (s) => s.replace('<a href="/learn/">Learn</a>', '<a href=/learn/>Learn</a>')),
      today: TODAY,
      expect: { exit: 0, mustCount: 0 },
    },
  ];
}

/**
 * Run one fixture case's expectations against a compareSites result.
 * @returns {string[]} failures (empty = pass)
 */
export function checkCase(c, result) {
  const fails = [];
  const fields = (/** @type {any[]} */ list) => new Set(list.map((d) => d.field));
  const must = fields(result.mustExplain);
  const info = fields(result.informational);
  const allowed = fields(result.allowed);
  if (result.exitCode !== c.expect.exit) fails.push(`exit ${result.exitCode}, expected ${c.expect.exit}`);
  for (const f of c.expect.must ?? []) if (!must.has(f)) fails.push(`no must-explain "${f}" (got ${[...must].join(', ') || 'none'})`);
  for (const f of c.expect.info ?? []) if (!info.has(f)) fails.push(`no informational "${f}" (got ${[...info].join(', ') || 'none'})`);
  for (const f of c.expect.allowed ?? []) if (!allowed.has(f)) fails.push(`no allowed "${f}" (got ${[...allowed].join(', ') || 'none'})`);
  if (c.expect.mustCount !== undefined && result.mustExplain.length !== c.expect.mustCount)
    fails.push(`${result.mustExplain.length} must-explain, expected ${c.expect.mustCount}`);
  if (c.expect.groups !== undefined && collapseDiffs(result.mustExplain).length !== c.expect.groups)
    fails.push(`${collapseDiffs(result.mustExplain).length} collapsed lines, expected ${c.expect.groups}`);
  if (c.expect.unused !== undefined && result.unusedRules.length !== c.expect.unused)
    fails.push(`${result.unusedRules.length} unused rules, expected ${c.expect.unused}`);
  if (c.expect.loud !== undefined && result.redates.loud !== c.expect.loud) fails.push(`loud ${result.redates.loud}, expected ${c.expect.loud}`);
  for (const f of c.expect.notMust ?? []) if (must.has(f)) fails.push(`unexpected must-explain "${f}"`);
  for (const f of c.expect.notInfo ?? []) if (info.has(f)) fails.push(`unexpected informational "${f}"`);
  if (c.expect.redates !== undefined && result.redates.total !== c.expect.redates)
    fails.push(`${result.redates.total} URL(s) in the re-date breakdown, expected ${c.expect.redates}`);
  return fails;
}
