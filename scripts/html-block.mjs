/**
 * html-block — balanced-tag extraction over HTML and Astro templates, with no
 * HTML parser dependency.
 *
 * Shared by `scripts/ssr-diff.mjs` (built pages in dist/) and the source gates
 * `src/lib/playground-kit.test.ts` and `src/lib/rail.test.ts` (Astro component
 * templates). Both inputs need the same three operations: tokenise opening and
 * closing tags, find the element that carries an id / attribute, and cut out
 * that element's balanced outerHTML.
 *
 * The tokenizer is deliberately conservative:
 *   - attribute scanning respects "…" / '…' / `…` quotes AND Astro `{…}`
 *     expression braces, so `class:list={[a, b > 1 && 'x']}` or an arrow
 *     function inside an attribute never ends the tag early;
 *   - `<!-- … -->` comments are skipped;
 *   - the raw-text elements (script, style, textarea, title) are skipped to
 *     their own closing tag, so markup-looking strings inside them are never
 *     tokenised as tags;
 *   - void elements and `<X … />` self-closing tags have no inner block.
 *
 * It is not a conforming HTML parser: it does not implement implied end tags
 * (`<p>` closed by a following `<div>`). The site's markup — Astro's
 * `compressHTML: true` output and the component templates — closes every
 * element explicitly, and the self-tests in the two gates pin the behaviour.
 */

export const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
]);

export const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'textarea', 'title']);

/**
 * Scan one tag starting at `s[i] === '<'`. Returns null when the text at `i`
 * is not a tag (e.g. `a < b` in prose or an expression).
 *
 * @param {string} s
 * @param {number} i
 * @returns {null | { kind: 'open' | 'close', name: string, start: number, end: number, attrs: string, selfClosing: boolean }}
 */
export function scanTag(s, i) {
  if (s[i] !== '<') return null;
  let j = i + 1;
  let kind = /** @type {'open' | 'close'} */ ('open');
  if (s[j] === '/') {
    kind = 'close';
    j++;
  }
  const nameMatch = /^[A-Za-z][\w.:-]*/.exec(s.slice(j, j + 64));
  if (!nameMatch) return null;
  const rawName = nameMatch[0];
  j += rawName.length;
  // Next char must end the name: whitespace, '>', '/', or '{' (Astro spread).
  if (j < s.length && !/[\s>/{]/.test(s[j])) return null;
  const attrStart = j;
  let depth = 0;
  /** @type {string | null} */
  let quote = null;
  for (; j < s.length; j++) {
    const c = s[j];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (depth > 0) {
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '"' || c === "'" || c === '`') quote = c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === '{') {
      depth++;
      continue;
    }
    if (c === '>') {
      const attrs = s.slice(attrStart, j);
      const selfClosing = /\/\s*$/.test(attrs);
      // Lowercase native element names; keep component names (PascalCase,
      // dotted) as written so `<ResultPanel>` and `<resultpanel>` differ.
      const name = /^[a-z]/.test(rawName) ? rawName.toLowerCase() : rawName;
      return { kind, name, start: i, end: j + 1, attrs, selfClosing };
    }
  }
  return null;
}

/**
 * Iterate every tag in `s` in document order, skipping comments and the
 * contents of raw-text elements.
 *
 * @param {string} s
 * @returns {Generator<NonNullable<ReturnType<typeof scanTag>>>}
 */
export function* tags(s) {
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt === -1) return;
    if (s.startsWith('<!--', lt)) {
      const close = s.indexOf('-->', lt + 4);
      i = close === -1 ? s.length : close + 3;
      continue;
    }
    const t = scanTag(s, lt);
    if (!t) {
      i = lt + 1;
      continue;
    }
    yield t;
    i = t.end;
    if (t.kind === 'open' && !t.selfClosing && RAW_TEXT_ELEMENTS.has(t.name)) {
      const closeRe = new RegExp(`</${t.name}\\s*>`, 'ig');
      closeRe.lastIndex = i;
      const m = closeRe.exec(s);
      if (!m) return;
      // Yield the closing tag too, so balance counting stays correct.
      const ct = scanTag(s, m.index);
      if (ct) yield ct;
      i = m.index + m[0].length;
    }
  }
}

/** True for a tag that never has an inner block. */
export function isLeaf(t) {
  return t.selfClosing || VOID_ELEMENTS.has(t.name);
}

/**
 * Read one attribute's raw value from a tag's attribute text. Returns
 * `undefined` when absent, `''` for a bare boolean attribute, the unquoted
 * string for "…" / '…' values, and the inner source for an Astro `{…}` value.
 *
 * @param {string} attrs
 * @param {string} name
 */
export function getAttr(attrs, name) {
  return readAttr(attrs, name)?.value;
}

/**
 * How an attribute is written: 'string' ("…" / '…'), 'expr' (Astro `{…}`),
 * 'bare' (unquoted), 'bool' (no value), or undefined when absent.
 *
 * @param {string} attrs
 * @param {string} name
 */
export function attrKind(attrs, name) {
  return readAttr(attrs, name)?.kind;
}

/**
 * @param {string} attrs
 * @param {string} name
 * @returns {{ value: string, kind: 'string' | 'expr' | 'bare' | 'bool' } | undefined}
 */
function readAttr(attrs, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&');
  const re = new RegExp(`(?:^|[\\s{}"'])${esc}(?=[\\s=/>]|$)`, 'g');
  let m;
  while ((m = re.exec(attrs)) !== null) {
    // Reject matches inside a quoted value or brace expression by re-scanning
    // from the start: cheap, and the attribute strings are short.
    const at = m.index + (m[0].length - name.length);
    if (insideValue(attrs, at)) continue;
    let k = at + name.length;
    while (/\s/.test(attrs[k] ?? '')) k++;
    if (attrs[k] !== '=') return { value: '', kind: 'bool' };
    k++;
    while (/\s/.test(attrs[k] ?? '')) k++;
    const q = attrs[k];
    if (q === '"' || q === "'") {
      const close = attrs.indexOf(q, k + 1);
      return { value: attrs.slice(k + 1, close === -1 ? attrs.length : close), kind: 'string' };
    }
    if (q === '{') {
      let depth = 0;
      for (let p = k; p < attrs.length; p++) {
        if (attrs[p] === '{') depth++;
        else if (attrs[p] === '}' && --depth === 0) return { value: attrs.slice(k + 1, p), kind: 'expr' };
      }
      return { value: attrs.slice(k + 1), kind: 'expr' };
    }
    const bare = /^[^\s>]+/.exec(attrs.slice(k));
    return { value: bare ? bare[0] : '', kind: 'bare' };
  }
  return undefined;
}

function insideValue(attrs, pos) {
  let depth = 0;
  /** @type {string | null} */
  let quote = null;
  for (let p = 0; p < pos; p++) {
    const c = attrs[p];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || (depth > 0 && c === '`')) quote = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
  }
  return quote !== null || depth > 0;
}

/**
 * Given an opening tag, find its balanced closing tag. Returns the element's
 * outer and inner ranges. A leaf element's inner range is empty.
 *
 * @param {string} s
 * @param {NonNullable<ReturnType<typeof scanTag>>} open
 */
export function blockFrom(s, open) {
  if (isLeaf(open)) {
    return { start: open.start, end: open.end, innerStart: open.end, innerEnd: open.end, outer: s.slice(open.start, open.end), inner: '' };
  }
  let depth = 0;
  for (const t of tags(s.slice(open.start))) {
    if (t.name !== open.name) continue;
    if (t.kind === 'open') {
      if (!isLeaf(t)) depth++;
    } else if (--depth === 0) {
      const end = open.start + t.end;
      const innerEnd = open.start + t.start;
      return { start: open.start, end, innerStart: open.end, innerEnd, outer: s.slice(open.start, end), inner: s.slice(open.end, innerEnd) };
    }
  }
  return null; // unbalanced
}

/**
 * Every element whose opening tag satisfies `pred(tag)`, as balanced blocks.
 *
 * @param {string} s
 * @param {(t: NonNullable<ReturnType<typeof scanTag>>) => boolean} pred
 */
export function findBlocks(s, pred) {
  const out = [];
  for (const t of tags(s)) {
    if (t.kind !== 'open' || !pred(t)) continue;
    const b = blockFrom(s, t);
    if (b) out.push({ ...b, tag: t });
  }
  return out;
}

/** The element with `id="<id>"`, or null. Static ids only (`id={x}` is not matched). */
export function blockById(s, id) {
  for (const t of tags(s)) {
    if (t.kind === 'open' && getAttr(t.attrs, 'id') === id) return blockFrom(s, t);
  }
  return null;
}

/** Every element carrying attribute `name` (optionally with exact `value`). */
export function blocksByAttr(s, name, value) {
  return findBlocks(s, (t) => {
    const v = getAttr(t.attrs, name);
    return v !== undefined && (value === undefined || v === value);
  });
}

/** Class tokens from a tag's `class` or `class:list` attribute text (raw, unresolved for expressions). */
export function classText(attrs) {
  return [getAttr(attrs, 'class'), getAttr(attrs, 'class:list')].filter((v) => v !== undefined).join(' ');
}

/**
 * The direct children of a block: tags at depth 0 inside its inner range.
 * Elements inside Astro expressions (`{cond && <div/>}`, `.map(() => <li/>)`)
 * count as direct children — they render as such.
 *
 * @param {string} inner
 */
export function directChildren(inner) {
  const out = [];
  let depth = 0;
  for (const t of tags(inner)) {
    if (t.kind === 'open') {
      if (depth === 0) out.push(t);
      if (!isLeaf(t)) depth++;
    } else if (depth > 0) depth--;
  }
  return out;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/** Decode the HTML entities Astro emits (named basics + numeric). */
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** textContent of an HTML fragment: tags (and script/style bodies) dropped, entities decoded. */
export function textContent(html) {
  const noRaw = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  return decodeEntities(noRaw.replace(/<[^>]*>/g, ''));
}

/** Collapse runs of whitespace (incl. nbsp) to one space and trim. */
export function collapseWs(s) {
  return s.replace(/[\s ]+/g, ' ').trim();
}

/**
 * Semantic normal form of an HTML fragment: whitespace collapsed (and dropped
 * between tags), `data-astro-cid-*` attributes removed, class tokens sorted.
 */
export function normalizeHtml(html) {
  let out = html.replace(/\s+data-astro-cid-[\w-]+(?:="[^"]*")?/g, '');
  // The playground kit's `data-results` hook marks a seeded container for the
  // gate and this diff; it is not content. Plan: the semantic compare drops it.
  out = out.replace(/\s+data-results(?:="[^"]*")?(?=[\s>/])/g, '');
  out = out.replace(/\sclass="([^"]*)"/g, (_, c) => ` class="${c.split(/\s+/).filter(Boolean).sort().join(' ')}"`);
  out = out.replace(/>\s+</g, '><');
  return collapseWs(out);
}
