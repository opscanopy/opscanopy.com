/**
 * Localized site copy — English (source of truth).
 *
 * Brand constants (name, url, github, twitter, author) stay in src/data/site.ts
 * and are NOT translated. This module holds the translatable site-level copy:
 * the tagline/description, the nav labels, and the footer.
 *
 * `href`s are locale-neutral page keys; components localize them per locale via
 * localizeNavHref(href, lang). Other locales provide a SiteLocaleContent (a
 * Partial of this shape) and fall back to English (see ../site.ts loader).
 *
 * FOOTER: the structure (groups, order, targets) is defined ONCE, here. Locale
 * files supply `footerLabels` only — titles by group id and link labels by
 * English href — so a locale can never drop, add or reorder a target. That
 * matters: the footer is the only inbound link for /changelog/, /contact/,
 * /privacy/ and /terms/, and the main one for the Learn guides, /about/ and
 * /security/ (src/i18n/site.test.ts pins every one). The English labels below
 * are frozen anchors except where the plan sanctioned a change; do not reword
 * them casually. Never add the sitemap here — it lives in the bottom bar.
 */

export interface SiteNavLink {
  /** Locale-neutral page key, e.g. "/tools" or "/mission-90/". */
  href: string;
  label: string;
}

export type FooterGroupId = 'tools' | 'learn' | 'resources' | 'company' | 'legal';

interface FooterLinkSource {
  readonly href: string;
  /** English anchor text. */
  readonly label: string;
  /** A tool name (brand): English in every locale, rendered translate="no". */
  readonly brand?: true;
}

interface FooterGroupSource {
  readonly id: FooterGroupId;
  /** English group title. */
  readonly title: string;
  /** Render under the previous group, in the same grid cell (Legal under Company). */
  readonly stack?: true;
  readonly links: readonly FooterLinkSource[];
}

/**
 * The footer, in display order. Brand labels are the tool's registry name
 * (src/data/tools.ts `h1Name ?? name`, or a prefix of `name`), not imported so
 * this chrome module stays free of the registry; the test asserts they match.
 */
const footer = [
  {
    id: 'tools',
    title: 'Tools',
    links: [
      { href: '/tools', label: 'All tools' },
      { href: '/subnet-calculator', label: 'Subnet Calculator', brand: true },
      { href: '/jwt-decoder', label: 'JWT Decoder', brand: true },
      { href: '/docker-run-to-compose', label: 'Docker Run to Compose', brand: true },
      { href: '/github-actions-validator', label: 'GitHub Actions Validator', brand: true },
      { href: '/loki-alert-rule-tester', label: 'Loki Alert Rule Tester', brand: true },
    ],
  },
  {
    id: 'learn',
    title: 'Learn',
    links: [
      { href: '/learn', label: 'All guides' },
      { href: '/mission-90/', label: '90 Days DevOps' },
      { href: '/tests', label: 'Practice tests' },
      { href: '/cheatsheets', label: 'Cheat sheets' },
      { href: '/learn/roadmaps/devops', label: 'DevOps roadmap' },
      { href: '/learn/guides/linux-for-devops', label: 'Linux for DevOps' },
      { href: '/learn/guides/docker-for-devops', label: 'Docker for DevOps' },
    ],
  },
  {
    id: 'resources',
    title: 'Resources',
    links: [
      { href: '/blog', label: 'Blog' },
      { href: '/changelog', label: 'Changelog' },
      { href: '/rss.xml', label: 'RSS feed' },
    ],
  },
  {
    id: 'company',
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    id: 'legal',
    title: 'Legal',
    stack: true,
    links: [
      { href: '/privacy', label: 'Privacy' },
      { href: '/security', label: 'Security' },
      { href: '/terms', label: 'Terms' },
    ],
  },
] as const satisfies readonly FooterGroupSource[];

/** Every English footer href — the only keys a locale's footerLabels.links may use. */
export type FooterHref = (typeof footer)[number]['links'][number]['href'];

export interface FooterLinkDef extends FooterLinkSource {
  readonly href: FooterHref;
}

export interface FooterGroupDef extends FooterGroupSource {
  readonly links: readonly FooterLinkDef[];
}

/** What a locale translates in the footer — labels only, never structure. */
export interface FooterLabels {
  titles: Partial<Record<FooterGroupId, string>>;
  links: Partial<Record<FooterHref, string>>;
}

export interface SiteContent {
  tagline: string;
  description: string;
  nav: SiteNavLink[];
  /** Footer structure + English labels. English-only: locales cannot override it. */
  footer: readonly FooterGroupDef[];
}

/** A locale's site copy: any SiteContent field except the footer structure, plus footer labels. */
export type SiteLocaleContent = Partial<Omit<SiteContent, 'footer'>> & { footerLabels?: FooterLabels };

const en: SiteContent = {
  tagline: 'A canopy of free, private, browser-based tools for platform & DevOps engineers.',
  description:
    'OpsCanopy is a growing hub of free, browser-based DevOps utilities — validators, converters, testers and linters that run entirely client-side. No signup, no servers, your data never leaves the device.',
  nav: [
    { href: '/tools', label: 'Tools' },
    { href: '/learn', label: 'Learn' },
    { href: '/mission-90/', label: '90 Days DevOps' },
    { href: '/tests', label: 'Practice tests' },
    { href: '/blog', label: 'Blog' },
    { href: '/search', label: 'Search' },
  ],
  footer,
};

export default en;
