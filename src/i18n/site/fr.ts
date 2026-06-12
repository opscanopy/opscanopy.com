/** Localized site copy — French (fr). Partial: omitted fields fall back to English. */
import type { SiteContent } from './en';

const fr: Partial<SiteContent> = {
  tagline:
    'Une canopée d’outils libres, privés et basés sur le navigateur pour les ingénieurs plateforme et DevOps.',
  description:
    'OpsCanopy est un hub grandissant d’utilitaires DevOps gratuits et basés sur le navigateur — validateurs, convertisseurs, testeurs et linters qui s’exécutent entièrement côté client. Sans inscription, sans serveurs, vos données ne quittent jamais l’appareil.',
  nav: [
    { href: '/tools', label: 'Outils' },
    { href: '/blog', label: 'Blog' },
  ],
  footer: [
    {
      title: 'Outils',
      links: [
        { href: '/loki-alert-rule-tester', label: 'AlertLint — testeur de règles Loki' },
        { href: '/tools', label: 'Tous les outils' },
      ],
    },
    {
      title: 'Ressources',
      links: [
        { href: '/blog', label: 'Blog' },
        { href: '/#why', label: 'Pourquoi OpsCanopy' },
      ],
    },
    {
      title: 'Entreprise',
      links: [
        { href: '/about', label: 'À propos' },
        { href: '/contact', label: 'Contact' },
      ],
    },
    {
      title: 'Mentions légales',
      links: [
        { href: '/privacy', label: 'Confidentialité' },
        { href: '/terms', label: 'Conditions d’utilisation' },
      ],
    },
  ],
};

export default fr;
