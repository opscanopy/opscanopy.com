/** Localized site copy — French (fr). Partial: omitted fields fall back to English. */
import type { SiteContent } from './en';

const fr: Partial<SiteContent> = {
  tagline:
    'Une canopée d’outils libres, privés et basés sur le navigateur pour les ingénieurs plateforme et DevOps.',
  description:
    'OpsCanopy est un hub grandissant d’utilitaires DevOps gratuits et basés sur le navigateur — validateurs, convertisseurs, testeurs et linters qui s’exécutent entièrement côté client. Sans inscription, sans serveurs, vos données ne quittent jamais l’appareil.',
  nav: [
    { href: '/tools', label: 'Outils' },
    { href: '/learn', label: 'Learn' },
    { href: '/mission-90/', label: '90 Days DevOps' },
    { href: '/blog', label: 'Blog' },
    { href: '/search', label: 'Recherche' },
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
      title: 'Learn',
      links: [
        { href: '/learn', label: 'All guides' },
        { href: '/mission-90/', label: '90 Days DevOps' },
        { href: '/learn/roadmaps/devops', label: 'DevOps roadmap' },
        { href: '/learn/guides/linux-for-devops', label: 'Linux for DevOps' },
        { href: '/learn/guides/docker-for-devops', label: 'Docker for DevOps' },
      ],
    },
    {
      title: 'Ressources',
      links: [
        { href: '/blog', label: 'Blog' },
        { href: '/#why', label: 'Pourquoi OpsCanopy' },
        { href: 'https://github.com/opscanopy/opscanopy.com', label: 'Code source sur GitHub' },
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
