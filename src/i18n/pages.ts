/**
 * Info / legal page-content accessor — merges a locale's partial copy over the
 * English source so any untranslated field falls back to English. Pages call
 * getPagesContent(lang) instead of reading the raw per-locale modules.
 */
import type { Locale } from './config';
import en, { type PagesContent, type PageDoc } from './pages/en';
import es from './pages/es';
import de from './pages/de';
import fr from './pages/fr';
import ptBr from './pages/pt-br';

const PARTIALS: Record<Locale, Partial<PagesContent>> = {
  en,
  es,
  de,
  fr,
  'pt-br': ptBr,
};

/** Full, English-backed info-page copy for a locale. */
export function getPagesContent(lang: Locale): PagesContent {
  const p = PARTIALS[lang] ?? {};
  return {
    privacy: p.privacy ?? en.privacy,
    about: p.about ?? en.about,
    terms: p.terms ?? en.terms,
    contact: p.contact ?? en.contact,
    ui: { updatedLabel: p.ui?.updatedLabel ?? en.ui.updatedLabel },
  };
}

export type { PagesContent, PageDoc };
