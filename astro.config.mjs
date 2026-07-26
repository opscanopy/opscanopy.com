// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { createRequire } from 'node:module';
import remarkCallouts from './src/lib/remark-callouts.mjs';
import rehypeChapters from './src/lib/rehype-chapters.mjs';

// Real per-URL <lastmod>, written by scripts/gen-lastmod.mjs in `prebuild`.
// Missing on a bare `astro dev` with no prior build — fall back to {} so every
// URL simply keeps the build date rather than failing the config.
const require = createRequire(import.meta.url);
/** @type {Record<string, string>} */
let LASTMOD = {};
try {
  LASTMOD = require('./src/data/lastmod.generated.json');
} catch {
  console.warn('[sitemap] lastmod.generated.json not found — using build date for all URLs.');
}

const BUILD_DATE = new Date();

// https://astro.build/config
export default defineConfig({
  site: 'https://opscanopy.com',
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
      // Default for pages with no real date of their own (index/listing pages,
      // which genuinely do change whenever their contents do). Per-URL dates
      // are applied in `serialize` below.
      lastmod: BUILD_DATE,
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
        !page.includes('/alertlint-wasm-demo') &&
        !page.includes('/404') &&
        !page.includes('/500') &&
        !page.includes('/offline') &&
        !/\/search\/?$/.test(page) &&
        !/\/mission-90\/complete\/?$/.test(page) &&
        !/\/tests\/[^/]+\/[^/]+\/?$/.test(page),
      // Replace the blanket build-date stamp with the page's real last-modified
      // date where one exists (git commit date for tools, frontmatter dates for
      // posts and guides). Claiming all 445 URLs changed on every deploy is both
      // untrue and a weak freshness signal.
      serialize: (item) => {
        const pathname = new URL(item.url).pathname;
        const known = LASTMOD[pathname];
        if (known) item.lastmod = known;
        return item;
      },
    }),
  ],
  markdown: {
    remarkPlugins: [remarkCallouts],
    rehypePlugins: [rehypeChapters],
  },
  vite: {
    plugins: [tailwindcss()],
    server: {
      allowedHosts: ['.vorflux.com'],
    },
  },
});
