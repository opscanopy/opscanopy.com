/**
 * i18n core config — locale list, defaults, and the maps that turn our internal
 * locale ids (the URL path segments) into BCP-47 language tags and Open Graph
 * locale codes. The URL/path id for Brazilian Portuguese is `pt-br`; its
 * `<html lang>` / hreflang value is `pt-BR`.
 *
 * Keep this list in sync with the `i18n.locales` array in astro.config.mjs.
 */

export const LOCALES = ['en', 'es', 'de', 'fr', 'pt-br'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Internal locale id → BCP-47 tag (for <html lang> and hreflang). */
export const BCP47: Record<Locale, string> = {
  en: 'en',
  es: 'es',
  de: 'de',
  fr: 'fr',
  'pt-br': 'pt-BR',
};

/** Internal locale id → Open Graph locale code. */
export const OG_LOCALE: Record<Locale, string> = {
  en: 'en_US',
  es: 'es_ES',
  de: 'de_DE',
  fr: 'fr_FR',
  'pt-br': 'pt_BR',
};

/** Native-language label for each locale (used by the language switcher). */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
  'pt-br': 'Português (BR)',
};

/** Type guard: is a string one of our known locales? */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
