/**
 * getStaticPaths helpers for the prefixed-locale route tree under
 * src/pages/[lang]/. English is served un-prefixed from the existing root
 * pages, so these helpers emit ONLY the non-default locales.
 */
import { DEFAULT_LOCALE, LOCALES, type Locale } from './config';

/** Non-default locales — the ones that get a URL prefix. */
export const PREFIXED_LOCALES: Locale[] = LOCALES.filter((l) => l !== DEFAULT_LOCALE);

/**
 * Paths for a `[lang]/...` route: one entry per prefixed locale.
 * Usage: `export const getStaticPaths = () => localePaths();`
 */
export function localePaths() {
  return PREFIXED_LOCALES.map((lang) => ({ params: { lang }, props: { lang } }));
}
