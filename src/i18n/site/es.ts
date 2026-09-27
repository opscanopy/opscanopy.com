/** Localized site copy — Spanish (es). Partial: omitted fields fall back to English. */
import type { SiteLocaleContent } from './en';

const es: SiteLocaleContent = {
  tagline: 'Una copa de herramientas gratuitas, privadas y basadas en el navegador para ingenieros de plataforma y DevOps.',
  description:
    'OpsCanopy es un centro en crecimiento de utilidades de DevOps gratuitas y basadas en el navegador: validadores, conversores, probadores y linters que se ejecutan por completo en el cliente. Sin registro, sin servidores; tus datos nunca salen del dispositivo.',
  nav: [
    { href: '/tools', label: 'Herramientas' },
    { href: '/learn', label: 'Learn' },
    { href: '/mission-90/', label: '90 Days DevOps' },
    { href: '/tests', label: 'Tests de práctica' },
    { href: '/blog', label: 'Blog' },
    { href: '/search', label: 'Buscar' },
  ],
  // Footer: labels only — the structure is English-owned (./en.ts). Omitted
  // hrefs fall back on purpose: a target that is also in the header nav takes
  // the `nav` label above (Learn, 90 Days DevOps, the practice tests, Blog);
  // tool names and the other English-only targets (roadmap, guides, Changelog,
  // RSS feed) keep their English anchor and render lang="en". The Learn
  // title stays English too; getFooter adds the localized "In English" caption.
  footerLabels: {
    titles: {
      tools: 'Herramientas',
      resources: 'Recursos',
      company: 'Empresa',
      legal: 'Legal',
    },
    links: {
      '/tools': 'Todas las herramientas',
      '/about': 'Acerca de',
      '/contact': 'Contacto',
      '/privacy': 'Privacidad',
      '/security': 'Seguridad',
      '/terms': 'Términos',
    },
  },
};

export default es;
