/**
 * Site-content accessor — merges a locale's partial site copy over the English
 * source so any untranslated field falls back to English. Components call
 * getSiteContent(lang) / getFooter(lang) instead of reading the raw per-locale
 * modules.
 */
import { DEFAULT_LOCALE, type Locale } from './config';
import { isEnglishOnlyKey, localizeNavHref, useTranslations } from './utils';
import en, {
  type FooterGroupId,
  type FooterHref,
  type SiteContent,
  type SiteLocaleContent,
} from './site/en';
import es from './site/es';
import de from './site/de';
import fr from './site/fr';
import ptBr from './site/pt-br';

const PARTIALS: Record<Locale, SiteLocaleContent> = {
  en,
  es,
  de,
  fr,
  'pt-br': ptBr,
};

/** Full, English-backed site copy for a locale. The footer structure is always English's. */
export function getSiteContent(lang: Locale): SiteContent {
  const partial = PARTIALS[lang] ?? {};
  return {
    tagline: partial.tagline ?? en.tagline,
    description: partial.description ?? en.description,
    nav: partial.nav ?? en.nav,
    footer: en.footer,
  };
}

/** A resolved footer link, ready to render as an `<a>`. */
export interface FooterLink {
  /** Localized href (localizeNavHref); English-only targets stay unprefixed. */
  href: string;
  label: string;
  external: boolean;
  /** Set on non-English pages when the anchor text is English. */
  lang?: 'en';
  /** Tool names (brand marks) are never machine-translated. */
  translate?: 'no';
  rel?: string;
  target?: '_blank';
}

/** A resolved footer link group. */
export interface FooterGroup {
  id: FooterGroupId;
  title: string;
  /** Set on non-English pages when the title fell back to English. */
  titleLang?: 'en';
  /** Muted line under the title (e.g. "In English" when every target is English-only). */
  caption?: string;
  /** Render in the previous group's grid cell (see footerCells). */
  stack?: boolean;
  links: FooterLink[];
}

/** Trailing-slash-insensitive key, so nav "/mission-90/" matches footer "/mission-90/" or "/mission-90". */
const navKey = (p: string): string => (p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p);

/** The header nav label a locale uses for a page key, if that key is in the nav. */
const navLabelFor = (lang: Locale, href: string): string | undefined =>
  getSiteContent(lang).nav.find((n) => navKey(n.href) === navKey(href))?.label;

const isExternal = (href: string): boolean => /^https?:\/\//.test(href);

/**
 * The footer for a locale: English structure, localized labels and hrefs.
 *
 * Label resolution, non-English pages:
 *   brand (tool names)      → the English name, lang="en", translate="no"
 *   locale footerLabels     → that label
 *   target in the header nav → the locale's nav label (one word for one place)
 *   otherwise               → the English label
 * A link gets lang="en" when its text is English: a brand name, an English
 * fallback, or an English-only target whose nav label is the English word
 * ("Learn", "90 Days DevOps"). An English-only target with a TRANSLATED label
 * (the practice tests → "Übungstests") carries no lang — marking German words
 * as English would mispronounce them (WCAG 3.1.2). English pages set no lang.
 *
 * A group whose targets are all English-only gets a localized "In English"
 * caption off English pages; a title the locale does not translate gets
 * titleLang="en".
 */
export function getFooter(lang: Locale): FooterGroup[] {
  const isDefault = lang === DEFAULT_LOCALE;
  const t = useTranslations(lang);
  const labels = isDefault ? undefined : PARTIALS[lang]?.footerLabels;

  const resolveLink = (link: { href: FooterHref; label: string; brand?: true }): FooterLink => {
    const external = isExternal(link.href);
    const out: FooterLink = {
      href: external ? link.href : localizeNavHref(link.href, lang),
      label: link.label,
      external,
    };
    if (external) {
      out.rel = 'noopener noreferrer';
      out.target = '_blank';
    }
    if (link.brand) {
      out.translate = 'no';
      if (!isDefault) out.lang = 'en';
      return out;
    }
    if (isDefault) return out;

    const own = labels?.links[link.href];
    // The header's label stands in only for the SAME word: "Practice tests" is
    // both the footer and the nav label, so a locale shows its nav translation.
    // "All guides" is not the nav's "Learn", so /learn keeps its own anchor
    // (an unsanctioned relabel of 276 locale anchors otherwise).
    const nav =
      link.label === navLabelFor(DEFAULT_LOCALE, link.href) ? navLabelFor(lang, link.href) : undefined;
    out.label = own ?? nav ?? link.label;
    const englishText =
      out.label === link.label || out.label === navLabelFor(DEFAULT_LOCALE, link.href);
    const fellBack = own === undefined && nav === undefined;
    if (fellBack || (englishText && isEnglishOnlyKey(link.href))) out.lang = 'en';
    return out;
  };

  return en.footer.map((group) => {
    const ownTitle = labels?.titles[group.id];
    const out: FooterGroup = {
      id: group.id,
      title: ownTitle ?? group.title,
      links: group.links.map(resolveLink),
    };
    if (group.stack) out.stack = true;
    if (!isDefault) {
      if (ownTitle === undefined) out.titleLang = 'en';
      const allEnglishOnly = group.links.every((l) => !isExternal(l.href) && isEnglishOnlyKey(l.href));
      if (allEnglishOnly) out.caption = t('footer.inEnglish');
    }
    return out;
  });
}

/**
 * Pack groups into grid cells: each group starts a new cell, except a
 * `stack` group, which joins the previous cell (Legal under Company). The
 * English structure yields exactly 4 cells — the md 4-column index.
 */
export function footerCells(groups: FooterGroup[]): FooterGroup[][] {
  const cells: FooterGroup[][] = [];
  for (const group of groups) {
    const last = cells[cells.length - 1];
    if (group.stack && last) last.push(group);
    else cells.push([group]);
  }
  return cells;
}

export type { SiteContent, SiteLocaleContent, FooterGroupId, FooterHref };
