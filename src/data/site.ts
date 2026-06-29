/**
 * Global site config — single source of truth for brand, nav, and footer.
 * Imported by Layout, Header, Footer, SEO, and pages.
 */

export const site = {
  name: 'OpsCanopy',
  domain: 'opscanopy.com',
  url: 'https://opscanopy.com',
  tagline: 'A canopy of free, private, browser-based tools for platform & DevOps engineers.',
  description:
    'OpsCanopy is a growing hub of free, browser-based DevOps utilities — validators, converters, testers and linters that run entirely client-side. No signup, no servers, your data never leaves the device.',
  github: 'https://github.com/opscanopy',
  twitter: '@opscanopy',
  author: 'OpsCanopy',
} as const;

export interface NavLink {
  label: string;
  href: string;
}

/** Centre link row in the top nav. */
export const navLinks: NavLink[] = [
  { label: 'Tools', href: '/tools' },
  { label: 'Learn', href: '/learn' },
  { label: 'Blog', href: '/blog' },
];

export interface FooterColumn {
  title: string;
  links: NavLink[];
}

/** 4-column footer nav. */
export const footerColumns: FooterColumn[] = [
  {
    title: 'Tools',
    links: [
      { label: 'AlertLint — Loki rule tester', href: '/loki-alert-rule-tester' },
      { label: 'All tools', href: '/tools' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Blog', href: '/blog' },
      { label: 'Why OpsCanopy', href: '/#why' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
  },
];
