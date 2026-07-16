/**
 * i18n runtime helpers — used by layouts, chrome components, and pages.
 *
 *  - useTranslations(lang): returns a `t(key, vars?)` function over the UI
 *    dictionary, with per-key English fallback and `{var}` interpolation.
 *  - getLocaleFromUrl(url): derive the active locale from a URL path.
 *  - stripLocale(path): remove a leading locale prefix → the locale-neutral
 *    "page key" used to compute canonical/hreflang/equivalent-page URLs.
 *  - localizeKey(path, locale): inverse — turn a page key into a localized path.
 */
import { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from './config';
import en, { type UiKey } from './ui/en';
import es from './ui/es';
import de from './ui/de';
import fr from './ui/fr';
import ptBr from './ui/pt-br';

const DICTS: Record<Locale, Partial<Record<UiKey, string>>> = {
  en,
  es,
  de,
  fr,
  'pt-br': ptBr,
};

/** Interpolate `{name}` placeholders with values from `vars`. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in vars ? String(vars[key]) : match,
  );
}

/**
 * Returns a translator bound to `lang`. Missing keys fall back to English so a
 * half-translated locale still renders.
 */
export function useTranslations(lang: Locale) {
  const dict = DICTS[lang] ?? {};
  return function t(key: UiKey, vars?: Record<string, string | number>): string {
    // Locale value → English source → the key itself (never crash on a missing
    // key, e.g. a runtime-cast `category.${x}` with no dictionary entry).
    const value = dict[key] ?? en[key] ?? key;
    return interpolate(value, vars);
  };
}

/** Derive the active locale from a URL path (first segment). en if none. */
export function getLocaleFromUrl(url: URL): Locale {
  const seg = url.pathname.split('/').filter(Boolean)[0];
  return isLocale(seg) && seg !== DEFAULT_LOCALE ? seg : DEFAULT_LOCALE;
}

/**
 * Strip a leading locale prefix, returning the locale-neutral page key with a
 * leading slash. "/de/tools" → "/tools"; "/tools" → "/tools"; "/de" → "/".
 */
export function stripLocale(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length && isLocale(parts[0]) && parts[0] !== DEFAULT_LOCALE) {
    parts.shift();
  }
  return '/' + parts.join('/');
}

/**
 * Append the trailing slash that canonical/hreflang URLs always carry
 * (SEO.astro's getAbsoluteLocaleUrl, driven by the astro.config build.format
 * default of "directory"), UNLESS the key is an in-page anchor ("/#why"),
 * already ends in "/", or points at a FILE (last segment has an extension,
 * e.g. "/rss.xml", "/mission-90/feed.xml") — files are served at their exact
 * path on the static host, so "/rss.xml/" would 404.
 */
function withTrailingSlash(key: string): string {
  if (key.endsWith('/') || key.includes('#')) return key;
  const lastSegment = key.slice(key.lastIndexOf('/') + 1);
  if (lastSegment.includes('.')) return key;
  return `${key}/`;
}

/**
 * Turn a locale-neutral page key into a localized path. en stays un-prefixed.
 * "/tools" + "de" → "/de/tools/"; "/tools" + "en" → "/tools/"; "/" + "de" → "/de/"
 * (slashed like every other canonical — "/de" would 308-hop on the static host).
 */
export function localizeKey(pageKey: string, locale: Locale): string {
  const key = pageKey.startsWith('/') ? pageKey : '/' + pageKey;
  const path = key === '/' ? key : withTrailingSlash(key);
  if (locale === DEFAULT_LOCALE) return path;
  return path === '/' ? `/${locale}/` : `/${locale}${path}`;
}

/**
 * Top-level sections that exist ONLY in English — no localized page tree is
 * built for them (verified: no src/pages/{locale}/learn, .../mission-90 or
 * .../search). Locale headers link these unprefixed so /de/search never 404s.
 */
const ENGLISH_ONLY_SECTIONS = ['/learn', '/mission-90', '/search'];

/**
 * localizeKey for nav / footer / menu CHROME links. English-only sections are
 * never locale-prefixed, so their links resolve to the real English page from
 * every locale instead of a `/de/learn`-style 404. Every other key localizes as
 * usual, so Tools and Blog (which do have localized pages) are unaffected.
 */
export function localizeNavHref(pageKey: string, locale: Locale): string {
  const key = pageKey.startsWith('/') ? pageKey : '/' + pageKey;
  const isEnglishOnly = ENGLISH_ONLY_SECTIONS.some(
    (p) => key === p || key === `${p}/` || key.startsWith(`${p}/`),
  );
  return isEnglishOnly ? withTrailingSlash(key) : localizeKey(key, locale);
}

export { LOCALES, DEFAULT_LOCALE, isLocale };
export type { Locale };
