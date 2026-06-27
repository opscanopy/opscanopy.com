/** Localized site copy — German (de). Partial: omitted fields fall back to English. */
import type { SiteContent } from './en';

const de: Partial<SiteContent> = {
  tagline:
    'Ein Blätterdach aus kostenlosen, privaten, browserbasierten Tools für Platform- & DevOps-Engineers.',
  description:
    'OpsCanopy ist eine wachsende Sammlung kostenloser, browserbasierter DevOps-Werkzeuge — Validatoren, Konverter, Tester und Linter, die vollständig clientseitig laufen. Keine Anmeldung, keine Server, Ihre Daten verlassen niemals das Gerät.',
  nav: [
    { href: '/tools', label: 'Tools' },
    { href: '/learn', label: 'Learn' },
    { href: '/blog', label: 'Blog' },
  ],
  footer: [
    {
      title: 'Tools',
      links: [
        { href: '/loki-alert-rule-tester', label: 'AlertLint — Loki-Regel-Tester' },
        { href: '/tools', label: 'Alle Tools' },
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
      title: 'Ressourcen',
      links: [
        { href: '/blog', label: 'Blog' },
        { href: '/#why', label: 'Warum OpsCanopy' },
      ],
    },
    {
      title: 'Unternehmen',
      links: [
        { href: '/about', label: 'Über uns' },
        { href: '/contact', label: 'Kontakt' },
      ],
    },
    {
      title: 'Rechtliches',
      links: [
        { href: '/privacy', label: 'Datenschutz' },
        { href: '/terms', label: 'Nutzungsbedingungen' },
      ],
    },
  ],
};

export default de;
