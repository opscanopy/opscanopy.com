/**
 * Site-content accessor — merges a locale's partial site copy over the English
 * source so any untranslated field falls back to English. Components call
 * getSiteContent(lang) instead of reading the raw per-locale modules.
 */
import type { Locale } from './config';
import en, { type SiteContent } from './site/en';
import es from './site/es';
import de from './site/de';
import fr from './site/fr';
import ptBr from './site/pt-br';

const PARTIALS: Record<Locale, Partial<SiteContent>> = {
  en,
  es,
  de,
  fr,
  'pt-br': ptBr,
};

/** Full, English-backed site copy for a locale. */
export function getSiteContent(lang: Locale): SiteContent {
  const partial = PARTIALS[lang] ?? {};
  return {
    tagline: partial.tagline ?? en.tagline,
    description: partial.description ?? en.description,
    nav: partial.nav ?? en.nav,
    footer: partial.footer ?? en.footer,
  };
}

export type { SiteContent };
