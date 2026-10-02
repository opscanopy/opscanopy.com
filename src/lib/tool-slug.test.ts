/**
 * toolSlugFromPath — the shared path → slug resolver (src/lib/tool-slug.ts),
 * plus a source gate that keeps ToolHero and ToolGapVisual on it. Both used to
 * carry their own hand-copied `LOCALE_PREFIXES` array; a locale added to
 * src/i18n/config.ts and missed in one copy would resolve `/xx/<slug>/` to
 * the slug `xx` and drop that page's breadcrumb, pin and category accent.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LOCALES, DEFAULT_LOCALE } from '../i18n/config';
import { toolSlugFromPath } from './tool-slug';

const SLUG = 'subnet-calculator';

describe('toolSlugFromPath', () => {
  it('reads the slug from an English tool path', () => {
    expect(toolSlugFromPath(`/${SLUG}/`)).toBe(SLUG);
    expect(toolSlugFromPath(`/${SLUG}`)).toBe(SLUG);
  });

  it.each(LOCALES.filter((l) => l !== DEFAULT_LOCALE))(
    'strips the %s prefix from a localized tool path',
    (lang) => {
      expect(toolSlugFromPath(`/${lang}/${SLUG}/`)).toBe(SLUG);
      expect(toolSlugFromPath(`/${lang}/${SLUG}`)).toBe(SLUG);
    },
  );

  it('covers every locale in src/i18n/config.ts', () => {
    // Fails if a locale is added to config and the resolver does not know it.
    for (const lang of LOCALES) {
      const path = lang === DEFAULT_LOCALE ? `/${SLUG}/` : `/${lang}/${SLUG}/`;
      expect(toolSlugFromPath(path), path).toBe(SLUG);
    }
  });

  it('returns undefined for a site root and a locale root', () => {
    expect(toolSlugFromPath('/')).toBeUndefined();
    expect(toolSlugFromPath('')).toBeUndefined();
    for (const lang of LOCALES.filter((l) => l !== DEFAULT_LOCALE)) {
      expect(toolSlugFromPath(`/${lang}/`)).toBeUndefined();
    }
  });

  it('does not treat the default locale as a prefix', () => {
    // English is served un-prefixed; `/en/x/` is not a tool path for `x`.
    expect(toolSlugFromPath(`/${DEFAULT_LOCALE}/${SLUG}/`)).toBe(DEFAULT_LOCALE);
  });
});

describe('slug-from-path has one implementation', () => {
  const read = (rel: string) =>
    readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

  it.each(['../components/ToolHero.astro', '../components/ToolGapVisual.astro'])(
    '%s uses toolSlugFromPath and carries no locale list of its own',
    (rel) => {
      const src = read(rel);
      expect(src).toMatch(/import\s*\{\s*toolSlugFromPath\s*\}\s*from\s*'\.\.\/lib\/tool-slug'/);
      expect(src).toMatch(/toolSlugFromPath\(Astro\.url\.pathname\)/);
      expect(src).not.toMatch(/LOCALE_PREFIXES/);
      // No inline array literal naming a prefixed locale.
      expect(src).not.toMatch(/\[\s*'(?:de|es|fr|pt-br)'\s*,/);
    },
  );
});
