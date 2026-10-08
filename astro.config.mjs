// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { createRequire } from 'node:module';
import remarkCallouts from './src/lib/remark-callouts.mjs';
import rehypeChapters from './src/lib/rehype-chapters.mjs';
import rehypeImgDims from './src/lib/rehype-img-dims.mjs';
import rehypeBlogThumb from './src/lib/rehype-blog-thumb.mjs';
import rehypeTableScroll from './src/lib/rehype-table-scroll.mjs';
import rehypeCodeHeader from './src/lib/rehype-code-header.mjs';
import { shikiConfig } from './src/lib/shiki-theme.mjs';
import { unified } from '@astrojs/markdown-remark';
import { applyLastmod } from './scripts/lastmod-core.mjs';

// Real per-URL <lastmod>, written by scripts/gen-lastmod.mjs in `prebuild`.
// Missing on a bare `astro dev` with no prior build — fall back to null, which
// omits <lastmod> on every URL. Never the build date: a timestamp that moves on
// every deploy is a claim that every page changed.
const require = createRequire(import.meta.url);
/** @type {Record<string, string> | null} */
let LASTMOD = null;
try {
  LASTMOD = require('./src/data/lastmod.generated.json');
} catch {
  console.warn('[sitemap] lastmod.generated.json not found — omitting <lastmod> on all URLs.');
}

// Tag pages with too few posts to index, written by scripts/gen-thin-tags.mjs in
// `prebuild`. The tag page reads the same file to set `noindex`, so the sitemap
// and the markup cannot disagree. Missing on a bare `astro dev` — fall back to
// an empty set, which keeps every tag page in the sitemap rather than failing.
/** @type {{ threshold: number, thin: string[] }} */
let THIN_TAGS = { threshold: 0, thin: [] };
try {
  THIN_TAGS = require('./src/data/thin-tags.generated.json');
} catch {
  console.warn('[sitemap] thin-tags.generated.json not found — all tag pages stay listed.');
}
// Programmatic variant pages outside the keep-list are noindex (see
// src/data/variants/indexable.json, the single source the pages also read);
// every locale copy of a variant (only chmod has them) is noindex.
/** @type {Record<string, string[]>} */
const VARIANT_KEEP = require('./src/data/variants/indexable.json');
/** @param {string} path */
const isNoindexVariant = (path) => {
  const m = path.match(/^(\/(?:de|es|fr|pt-br))?\/([^/]+)\/([^/]+)\/$/);
  if (!m || !(m[2] in VARIANT_KEEP)) return false;
  return Boolean(m[1]) || !VARIANT_KEEP[m[2]].includes(m[3]);
};
const THIN_TAG_PATHS = new Set(THIN_TAGS.thin.map((t) => `/blog/tag/${t}/`));

// https://astro.build/config
export default defineConfig({
  site: 'https://opscanopy.com',
  // Astro 7 defaults to 'jsx', which strips the newline whitespace between
  // text and an inline tag — the prose was authored against Astro 6 and ran
  // together in the built HTML ("like<span class="code-mono">…",
  // "the<a class="link-inline">…"). `true` is Astro 6's lossless compression.
  // scripts/check-inline-whitespace.mjs (postbuild) fails the build on a regression.
  compressHTML: true,
  // Native i18n routing. English is the default and stays un-prefixed at the
  // root (/tools, /cron-expression-tester …) so existing URLs/SEO are intact;
  // other locales are prefixed (/es/…, /de/…, /fr/…, /pt-br/…).
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es', 'de', 'fr', 'pt-br'],
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
    },
  },
  integrations: [
    sitemap({
      // No `lastmod` default on purpose. It used to be the build time, and the
      // 94 URLs gen-lastmod did not cover then claimed a change on every deploy.
      // Per-URL dates are applied (or the field omitted) in `serialize` below.
      // Emit <xhtml:link rel="alternate" hreflang> groups. Map the URL path id
      // (pt-br) to its BCP-47 hreflang value (pt-BR).
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en', es: 'es', de: 'de', fr: 'fr', 'pt-br': 'pt-BR' },
      },
      // Keep noindex routes out of the sitemap (/search is the noindex
      // Pagefind UI — exact-match the path so future "search…" slugs survive;
      // /mission-90/complete is the noindex personal-progress card page;
      // /tests/<cat>/<test>/ are the noindex test-taking pages — the /tests/
      // hub and /tests/<cat>/ category pages stay indexed).
      filter: (page) =>
        !page.includes('/404') &&
        !page.includes('/500') &&
        !page.includes('/offline') &&
        !/\/search\/?$/.test(page) &&
        !/\/mission-90\/complete\/?$/.test(page) &&
        !/\/tests\/[^/]+\/[^/]+\/?$/.test(page) &&
        // Thin tag pages (fewer than `threshold` posts) are noindex — see
        // THIN_TAG_PATHS above. Keeping them listed would advertise URLs we
        // simultaneously ask Google to ignore.
        !THIN_TAG_PATHS.has(new URL(page).pathname) &&
        !isNoindexVariant(new URL(page).pathname),
      // The page's real last-modified date (git commit dates for tools and
      // listing/info pages, frontmatter dates for posts and guides), or no
      // <lastmod> at all when none is known — see scripts/lastmod-core.mjs.
      serialize: (item) => {
        applyLastmod(item, LASTMOD);

        // Add the x-default alternate the integration's `i18n` option omits.
        // The page HTML has declared x-default all along (SEO.astro), so the
        // sitemap was contradicting the markup on all 1675 hreflang entries —
        // it named five language alternates but never said which one serves a
        // visitor whose language matches none of them.
        if (item.links?.length) {
          const en = item.links.find((l) => l.lang === 'en');
          if (en && !item.links.some((l) => l.lang === 'x-default')) {
            item.links.push({ lang: 'x-default', url: en.url });
          }
        }
        return item;
      },
    }),
  ],
  markdown: {
    // The legacy unified pipeline, named explicitly. Astro 7 defaults to the
    // Satteri processor and only ran these plugins through its
    // `coerceLegacyMarkdownPlugins` shim (which builds this same `unified()`
    // from top-level `remarkPlugins` / `rehypePlugins`); saying it here keeps
    // the behaviour while the shim exists and after it is removed.
    // `@astrojs/markdown-remark` must stay an explicit dependency (CLAUDE.md).
    processor: unified({
      remarkPlugins: [remarkCallouts],
      // rehypeCodeHeader runs after Shiki (Astro highlights before user rehype
      // plugins), so every `pre.astro-code[data-language]` exists to be wrapped
      // in its <figure class="code-fig"> with a server-rendered figure cap.
      // rehypeBlogThumb runs before rehypeImgDims: a blog post's first body
      // image (its own cover) is re-pointed at the title-free -thumb plate,
      // and the dimensions are then read from the file that ships.
      rehypePlugins: [rehypeBlogThumb, rehypeChapters, rehypeImgDims, rehypeTableScroll, rehypeCodeHeader],
    }),
    // One code palette (src/lib/code-palette.ts) for Shiki and CodeMirror.
    // Shiki writes the plate as an inline background; global.css `.code-fig pre`
    // re-points it to var(--color-inverse) so dark mode gets its own plate value.
    // Grammar-less fences (promql, logql, …) are aliased to plaintext there.
    shikiConfig,
  },
  vite: {
    plugins: [tailwindcss()],
    server: {
      allowedHosts: ['.vorflux.com'],
    },
  },
});
