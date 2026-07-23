// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import remarkCallouts from './src/lib/remark-callouts.mjs';
import rehypeChapters from './src/lib/rehype-chapters.mjs';

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
      // Stamp every entry with a <lastmod> (build date is a safe default —
      // this is a static site rebuilt on each deploy).
      lastmod: new Date(),
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
