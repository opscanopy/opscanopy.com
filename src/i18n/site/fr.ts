/** Localized site copy — French (fr). Partial: omitted fields fall back to English. */
import type { SiteLocaleContent } from './en';

const fr: SiteLocaleContent = {
  tagline:
    'Une canopée d’outils libres, privés et basés sur le navigateur pour les ingénieurs plateforme et DevOps.',
  description:
    'OpsCanopy est un hub grandissant d’utilitaires DevOps gratuits et basés sur le navigateur — validateurs, convertisseurs, testeurs et linters qui s’exécutent entièrement côté client. Sans inscription, sans serveurs, vos données ne quittent jamais l’appareil.',
  nav: [
    { href: '/tools', label: 'Outils' },
    { href: '/learn', label: 'Learn' },
    { href: '/mission-90/', label: '90 Days DevOps' },
    { href: '/tests', label: 'Tests blancs' },
    { href: '/blog', label: 'Blog' },
    { href: '/search', label: 'Recherche' },
  ],
  // Footer: labels only — the structure is English-owned (./en.ts). Omitted
  // hrefs fall back on purpose: a target that is also in the header nav takes
  // the `nav` label above (Learn, 90 Days DevOps, the practice tests, Blog);
  // tool names and the other English-only targets (roadmap, guides, Changelog,
  // RSS feed) keep their English anchor and render lang="en". The Learn
  // title stays English too; getFooter adds the localized "In English" caption.
  footerLabels: {
    titles: {
      tools: 'Outils',
      resources: 'Ressources',
      company: 'Entreprise',
      legal: 'Mentions légales',
    },
    links: {
      '/tools': 'Tous les outils',
      '/about': 'À propos',
      '/contact': 'Contact',
      '/privacy': 'Confidentialité',
      '/security': 'Sécurité',
      '/terms': 'Conditions d’utilisation',
    },
  },
};

export default fr;
