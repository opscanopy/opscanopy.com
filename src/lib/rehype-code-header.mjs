/**
 * rehype-code-header — heads every Shiki code block with the site's figure
 * cap. Each `<pre class="astro-code" data-language="…">` becomes
 *
 *   <figure class="code-fig" data-language="yaml">
 *     <div class="figcap" data-tone="mute"> … yaml … <span class="figcap__actions">
 *       <button type="button" class="rich-code-copy" data-code-copy="" aria-label="…">Copy</button>
 *     </span> </div>
 *     <pre class="astro-code …">…</pre>
 *   </figure>
 *
 * so a code block is an instrument plate like every other slab on the site
 * (fig cap, copy action in the cap's actions slot — never floating over the
 * code), server-rendered, with no layout shift when the script binds it.
 *
 * The cap is `figcapHtml()` from src/lib/figcap.ts, the builder that
 * src/lib/figcap.test.ts proves byte-equal to FigureCap.astro, inserted as a
 * `raw` node (Astro's pipeline runs rehype-raw after user plugins, so it is
 * parsed into the tree before stringify). The label is the fence language in
 * the kit's mono grammar (`yaml`, `bash`); a fence with no language is `text`.
 * The button label and its accessible name come from the post's locale
 * dictionary (`blog.copyCode` / `blog.copyCodeAriaLabel`), read from the
 * content file's path (`src/content/blog/<lang>/…`); everything else is
 * English, which is what the guides and Mission 90 days are written in.
 *
 * The <pre> and its tokens are moved, never rebuilt: code text is unchanged.
 * Runs after Shiki (Astro applies user rehype plugins after highlighting), so
 * `pre.astro-code[data-language]` exists. Styled by `.code-fig` in global.css;
 * bound by the copy script in BlogPost / GuidePost / MissionDay.
 */
import { figcapHtml } from './figcap.ts';
import en from '../i18n/ui/en.ts';
import de from '../i18n/ui/de.ts';
import es from '../i18n/ui/es.ts';
import fr from '../i18n/ui/fr.ts';
import ptBr from '../i18n/ui/pt-br.ts';

/** @type {Record<string, Partial<Record<string, string>>>} */
const DICTS = { en, de, es, fr, 'pt-br': ptBr };

/**
 * The content locale from a markdown file path; English unless the file sits
 * under `content/<collection>/<locale>/`.
 * @param {string | undefined} path
 */
export function localeFromPath(path) {
  const m = /[\\/]content[\\/][^\\/]+[\\/](de|es|fr|pt-br|en)[\\/]/.exec(path ?? '');
  return m ? m[1] : 'en';
}

/** @param {string} locale */
export function copyLabels(locale) {
  const d = DICTS[locale] ?? {};
  return {
    copy: d['blog.copyCode'] ?? en['blog.copyCode'],
    aria: d['blog.copyCodeAriaLabel'] ?? en['blog.copyCodeAriaLabel'],
  };
}

/** The copy button exactly as it reaches the page (hast-stable attributes). @param {string} locale */
export function copyButtonHtml(locale) {
  const { copy, aria } = copyLabels(locale);
  const esc = (/** @type {string} */ s) => s.replace(/&/g, '&#x26;').replace(/"/g, '&#x22;').replace(/</g, '&#x3C;');
  return `<button type="button" class="rich-code-copy" data-code-copy="" aria-label="${esc(aria)}">${esc(copy)}</button>`;
}

/** Fence language → cap label. @param {unknown} lang */
export function codeLabel(lang) {
  const l = typeof lang === 'string' ? lang.trim().toLowerCase() : '';
  return !l || l === 'plaintext' || l === 'plain' || l === 'txt' ? 'text' : l;
}

/** @param {any} node */
function classList(node) {
  const p = node.properties ?? {};
  const raw = p.className ?? p.class ?? [];
  return Array.isArray(raw) ? raw.map(String) : String(raw).split(/\s+/).filter(Boolean);
}

/** @param {any} node */
function isShikiPre(node) {
  return node?.type === 'element' && node.tagName === 'pre' && classList(node).includes('astro-code');
}

/** @param {any} node */
function isCodeFig(node) {
  return node?.type === 'element' && node.tagName === 'figure' && classList(node).includes('code-fig');
}

/** @param {any} parent @param {string} locale */
function walk(parent, locale) {
  const kids = parent.children;
  if (!kids) return;
  for (let i = 0; i < kids.length; i++) {
    const node = kids[i];
    if (node.type !== 'element') continue;
    if (isShikiPre(node) && !isCodeFig(parent)) {
      const lang = node.properties?.dataLanguage;
      const label = codeLabel(lang);
      kids[i] = {
        type: 'element',
        tagName: 'figure',
        properties: { className: ['code-fig'], dataLanguage: label },
        children: [{ type: 'raw', value: figcapHtml({ label, actions: copyButtonHtml(locale) }) }, node],
      };
      continue;
    }
    walk(node, locale);
  }
}

export default function rehypeCodeHeader() {
  /** @param {any} tree @param {any} file */
  return (tree, file) => walk(tree, localeFromPath(file?.path ?? file?.history?.[0]));
}
