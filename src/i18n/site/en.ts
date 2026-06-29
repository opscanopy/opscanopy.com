/**
 * Localized site copy — English (source of truth).
 *
 * Brand constants (name, url, github, twitter, author) stay in src/data/site.ts
 * and are NOT translated. This module holds the translatable site-level copy:
 * the tagline/description and the nav + footer link labels.
 *
 * `href`s are locale-neutral page keys; components localize them per locale via
 * localizeKey(href, lang). Other locales provide a Partial of this shape and
 * fall back to English (see ../site.ts loader).
 */

export interface SiteNavLink {
  /** Locale-neutral page key, e.g. "/tools" or "/#why". */
  href: string;
  label: string;
}

export interface SiteFooterColumn {
  title: string;
  links: SiteNavLink[];
}

export interface SiteContent {
  tagline: string;
  description: string;
  nav: SiteNavLink[];
  footer: SiteFooterColumn[];
}

const en: SiteContent = {
  tagline: 'A canopy of free, private, browser-based tools for platform & DevOps engineers.',
  description:
    'OpsCanopy is a growing hub of free, browser-based DevOps utilities — validators, converters, testers and linters that run entirely client-side. No signup, no servers, your data never leaves the device.',
  nav: [
    { href: '/tools', label: 'Tools' },
    { href: '/learn', label: 'Learn' },
    { href: '/blog', label: 'Blog' },
  ],
  footer: [
    {
      title: 'Tools',
      links: [
        { href: '/tools', label: 'All tools' },
        { href: '/subnet-calculator', label: 'Subnet Calculator' },
        { href: '/jwt-decoder', label: 'JWT Decoder' },
        { href: '/docker-run-to-compose', label: 'Docker Run to Compose' },
        { href: '/github-actions-validator', label: 'GitHub Actions Validator' },
        { href: '/loki-alert-rule-tester', label: 'AlertLint — Loki rule tester' },
      ],
    },
    {
      title: 'Learn',
      links: [
        { href: '/learn', label: 'All guides' },
        { href: '/learn/roadmaps/devops', label: 'DevOps roadmap' },
        { href: '/learn/guides/linux-for-devops', label: 'Linux for DevOps' },
        { href: '/learn/guides/docker-for-devops', label: 'Docker for DevOps' },
      ],
    },
    {
      title: 'Resources',
      links: [
        { href: '/blog', label: 'Blog' },
        { href: '/rss.xml', label: 'RSS feed' },
        { href: '/#why', label: 'Why OpsCanopy' },
      ],
    },
    {
      title: 'Company',
      links: [
        { href: '/about', label: 'About' },
        { href: '/contact', label: 'Contact' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { href: '/privacy', label: 'Privacy' },
        { href: '/terms', label: 'Terms' },
      ],
    },
  ],
};

export default en;
