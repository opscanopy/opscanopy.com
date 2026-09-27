/** Localized site copy — Brazilian Portuguese (pt-br). Partial: omitted fields fall back to English. */
import type { SiteLocaleContent } from './en';

const ptBr: SiteLocaleContent = {
  tagline:
    'Uma copa de ferramentas gratuitas, privadas e baseadas no navegador para engenheiros de plataforma e DevOps.',
  description:
    'O OpsCanopy é um hub em crescimento de utilitários de DevOps gratuitos e baseados no navegador — validadores, conversores, testadores e linters que rodam inteiramente no lado do cliente. Sem cadastro, sem servidores, seus dados nunca saem do dispositivo.',
  nav: [
    { href: '/tools', label: 'Ferramentas' },
    { href: '/learn', label: 'Learn' },
    { href: '/mission-90/', label: '90 Days DevOps' },
    { href: '/tests', label: 'Testes práticos' },
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
      tools: 'Ferramentas',
      resources: 'Recursos',
      company: 'Empresa',
      legal: 'Legal',
    },
    links: {
      '/tools': 'Todas as ferramentas',
      '/about': 'Sobre',
      '/contact': 'Contato',
      '/privacy': 'Privacidade',
      '/security': 'Segurança',
      '/terms': 'Termos',
    },
  },
};

export default ptBr;
