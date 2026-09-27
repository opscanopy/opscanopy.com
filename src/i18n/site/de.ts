/** Localized site copy — German (de). Partial: omitted fields fall back to English. */
import type { SiteLocaleContent } from './en';

const de: SiteLocaleContent = {
  tagline:
    'Ein Blätterdach aus kostenlosen, privaten, browserbasierten Tools für Platform- & DevOps-Engineers.',
  description:
    'OpsCanopy ist eine wachsende Sammlung kostenloser, browserbasierter DevOps-Werkzeuge — Validatoren, Konverter, Tester und Linter, die vollständig clientseitig laufen. Keine Anmeldung, keine Server, Ihre Daten verlassen niemals das Gerät.',
  nav: [
    { href: '/tools', label: 'Tools' },
    { href: '/learn', label: 'Learn' },
    { href: '/mission-90/', label: '90 Days DevOps' },
    { href: '/tests', label: 'Übungstests' },
    { href: '/blog', label: 'Blog' },
    { href: '/search', label: 'Suche' },
  ],
  // Footer: labels only — the structure is English-owned (./en.ts). Omitted
  // hrefs fall back on purpose: a target that is also in the header nav takes
  // the `nav` label above (Learn, 90 Days DevOps, the practice tests, Blog);
  // tool names and the other English-only targets (roadmap, guides, Changelog,
  // RSS feed) keep their English anchor and render lang="en". The Learn
  // title stays English too; getFooter adds the localized "In English" caption.
  footerLabels: {
    titles: {
      tools: 'Tools',
      resources: 'Ressourcen',
      company: 'Unternehmen',
      legal: 'Rechtliches',
    },
    links: {
      '/tools': 'Alle Tools',
      '/about': 'Über uns',
      '/contact': 'Kontakt',
      '/privacy': 'Datenschutz',
      '/security': 'Sicherheit',
      '/terms': 'Nutzungsbedingungen',
    },
  },
};

export default de;
