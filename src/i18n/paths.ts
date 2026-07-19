/**
 * getStaticPaths helpers for the prefixed-locale route tree under
 * src/pages/[lang]/. English is served un-prefixed from the existing root
 * pages, so these helpers emit ONLY the non-default locales.
 *
 * Also holds the locale-neutral href helpers below — a leaf module with NO
 * dependency on the UI dictionaries (../ui/*), so client-side code that only
 * needs to build localized hrefs (the command palette's lazy-loaded chunk)
 * can import this alone instead of pulling in all 5 UI dictionaries via
 * ./utils. Those four are re-exported by ./utils for every existing call
 * site — zero call-site churn.
 */
import { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from './config';

/** Non-default locales — the ones that get a URL prefix. */
export const PREFIXED_LOCALES: Locale[] = LOCALES.filter((l) => l !== DEFAULT_LOCALE);

/**
 * Paths for a `[lang]/...` route: one entry per prefixed locale.
 * Usage: `export const getStaticPaths = () => localePaths();`
 */
export function localePaths() {
  return PREFIXED_LOCALES.map((lang) => ({ params: { lang }, props: { lang } }));
}

/**
 * Append the trailing slash that canonical/hreflang URLs always carry
 * (SEO.astro's getAbsoluteLocaleUrl, driven by the astro.config build.format
 * default of "directory"), UNLESS the key is an in-page anchor ("/#why"),
 * already ends in "/", or points at a FILE (last segment has an extension,
 * e.g. "/rss.xml", "/mission-90/feed.xml") — files are served at their exact
 * path on the static host, so "/rss.xml/" would 404.
 */
export function withTrailingSlash(key: string): string {
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
 * built for them (verified: no src/pages/{locale}/learn or .../mission-90).
 * Locale headers link these unprefixed so e.g. /de/learn never 404s.
 * '/search' is NOT here — it has a real localized page per locale (see
 * src/pages/{locale}/search.astro), so it localizes like any other page.
 * '/changelog' (WS-R R6) joined this list for the same reason: tool names/
 * dates are English-only content, not worth a 5x-duplicated page tree.
 */
export const ENGLISH_ONLY_SECTIONS = ['/learn', '/mission-90', '/changelog'];

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

export { isLocale };
export type { Locale };
