/**
 * getStaticPaths helpers for the prefixed-locale route tree under
 * src/pages/[lang]/. English is served un-prefixed from the existing root
 * pages, so these helpers emit ONLY the non-default locales.
 *
 * Also holds the locale-neutral href helpers below — a leaf module with NO
 * dependency on the UI dictionaries (../ui/*), so client-side code that only
 * needs to build localized hrefs (the command palette's lazy-loaded chunk)
 * can import this alone instead of pulling in all 5 UI dictionaries via
 * ./utils. Everything exported here is re-exported by ./utils for every
 * existing call site — zero call-site churn.
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
 * default of "directory"), UNLESS the path already ends in "/" or points at a
 * FILE (last segment has an extension, e.g. "/rss.xml", "/mission-90/feed.xml")
 * — files are served at their exact path on the static host, so "/rss.xml/"
 * would 404. A "#fragment" or "?query" is split off first and the slash goes
 * on the path before it: "/cidr-checker#ip=x" → "/cidr-checker/#ip=x", and
 * "/#why" is untouched because its path is already "/". (Until 2026-09-26 any
 * key containing "#" was returned as-is, which is the same gap that let the
 * cross-tool chips ship "/subnet-calculator#ip=…" and cost a 307 hop each.)
 */
export function withTrailingSlash(key: string): string {
  const cut = key.search(/[?#]/);
  const path = cut === -1 ? key : key.slice(0, cut);
  const suffix = cut === -1 ? '' : key.slice(cut);
  if (path.endsWith('/')) return key;
  const lastSegment = path.slice(path.lastIndexOf('/') + 1);
  if (lastSegment.includes('.')) return key;
  return `${path}/${suffix}`;
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
export const ENGLISH_ONLY_SECTIONS = ['/learn', '/mission-90', '/changelog', '/tests'];

/**
 * Single FILE routes that exist only in English, matched exactly (not as a
 * prefix). The blog feed is English posts only and is built once at /rss.xml
 * (src/pages/rss.xml.ts) — /de/rss.xml does not exist.
 */
export const ENGLISH_ONLY_FILES = ['/rss.xml'] as const;

/**
 * Is this page key served only in English? True for anything at or under an
 * ENGLISH_ONLY_SECTIONS entry (matched at a path boundary, so "/learn-more" is
 * not "/learn") and for an exact ENGLISH_ONLY_FILES match. Chrome links to
 * such a key must never be locale-prefixed — see localizeNavHref.
 */
export function isEnglishOnlyKey(pageKey: string): boolean {
  const key = pageKey.startsWith('/') ? pageKey : '/' + pageKey;
  if ((ENGLISH_ONLY_FILES as readonly string[]).includes(key)) return true;
  return ENGLISH_ONLY_SECTIONS.some((p) => key === p || key === `${p}/` || key.startsWith(`${p}/`));
}

/**
 * localizeKey for nav / footer / menu CHROME links. English-only keys
 * (isEnglishOnlyKey) are never locale-prefixed, so their links resolve to the
 * real English page from every locale instead of a `/de/learn`- or
 * `/de/rss.xml`-style 404. Every other key localizes as usual, so Tools and
 * Blog (which do have localized pages) are unaffected.
 */
export function localizeNavHref(pageKey: string, locale: Locale): string {
  const key = pageKey.startsWith('/') ? pageKey : '/' + pageKey;
  return isEnglishOnlyKey(key) ? withTrailingSlash(key) : localizeKey(key, locale);
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

/** Drop a trailing slash (except on the root) so "/tools" and "/tools/" compare equal. */
const withoutTrailingSlash = (p: string): string => (p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p);

/**
 * Does a chrome link's page key point at the page being rendered? Compares the
 * locale-neutral key of `pathname` (so /es/tools/ matches "/tools"),
 * trailing-slash-insensitive. Exact match only: "/tools" is not current on
 * /tools/subnet/. Shared by Header and Footer for aria-current="page".
 */
export function isCurrentKey(key: string, pathname: string): boolean {
  return withoutTrailingSlash(stripLocale(pathname)) === withoutTrailingSlash(key);
}

/**
 * Should the page offer a language switcher? Hidden on pages that declare no
 * alternates (404, English-only pages) and, rather than render a dead one-item
 * dropdown, when the page exists in only one locale. `available` undefined
 * means "every locale" (LangSwitcher's own default). Header and Footer share
 * this rule so the two switchers can never disagree.
 */
export function shouldShowLangSwitcher(
  noAlternates: boolean | undefined,
  available: Locale[] | undefined,
): boolean {
  return !noAlternates && (available === undefined || available.length > 1);
}

export { isLocale };
export type { Locale };
