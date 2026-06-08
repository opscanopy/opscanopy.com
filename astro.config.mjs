// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://opscanopy.com',
  integrations: [
    sitemap({
      // Keep noindex routes out of the sitemap.
      filter: (page) => !page.includes('/alertlint-wasm-demo') && !page.includes('/404'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
