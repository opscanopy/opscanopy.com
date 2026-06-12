/** Localized site copy — Brazilian Portuguese (pt-br). Partial: omitted fields fall back to English. */
import type { SiteContent } from './en';

const ptBr: Partial<SiteContent> = {
  tagline:
    'Uma copa de ferramentas gratuitas, privadas e baseadas no navegador para engenheiros de plataforma e DevOps.',
  description:
    'O OpsCanopy é um hub em crescimento de utilitários de DevOps gratuitos e baseados no navegador — validadores, conversores, testadores e linters que rodam inteiramente no lado do cliente. Sem cadastro, sem servidores, seus dados nunca saem do dispositivo.',
  nav: [
    { href: '/tools', label: 'Ferramentas' },
    { href: '/blog', label: 'Blog' },
  ],
  footer: [
    {
      title: 'Ferramentas',
      links: [
        { href: '/loki-alert-rule-tester', label: 'AlertLint — testador de regras do Loki' },
        { href: '/tools', label: 'Todas as ferramentas' },
      ],
    },
    {
      title: 'Recursos',
      links: [{ href: '/blog', label: 'Blog' }],
    },
    {
      title: 'Plataforma',
      links: [
        { href: '/#why', label: 'Por que o OpsCanopy' },
        { href: '/#privacy', label: 'Privacidade' },
      ],
    },
  ],
};

export default ptBr;
