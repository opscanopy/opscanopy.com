/** Localized site copy — German (de). Partial: omitted fields fall back to English. */
import type { SiteContent } from './en';

const de: Partial<SiteContent> = {
  tagline:
    'Ein Blätterdach aus kostenlosen, privaten, browserbasierten Tools für Platform- & DevOps-Engineers.',
  description:
    'OpsCanopy ist eine wachsende Sammlung kostenloser, browserbasierter DevOps-Werkzeuge — Validatoren, Konverter, Tester und Linter, die vollständig clientseitig laufen. Keine Anmeldung, keine Server, Ihre Daten verlassen niemals das Gerät.',
  nav: [
    { href: '/tools', label: 'Tools' },
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
