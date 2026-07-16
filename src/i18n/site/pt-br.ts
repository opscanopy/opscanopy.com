/** Localized site copy — Brazilian Portuguese (pt-br). Partial: omitted fields fall back to English. */
import type { SiteContent } from './en';

const ptBr: Partial<SiteContent> = {
  tagline:
    'Uma copa de ferramentas gratuitas, privadas e baseadas no navegador para engenheiros de plataforma e DevOps.',
  description:
    'O OpsCanopy é um hub em crescimento de utilitários de DevOps gratuitos e baseados no navegador — validadores, conversores, testadores e linters que rodam inteiramente no lado do cliente. Sem cadastro, sem servidores, seus dados nunca saem do dispositivo.',
  nav: [
    { href: '/tools', label: 'Ferramentas' },
    { href: '/learn', label: 'Learn' },
    { href: '/mission-90/', label: '90 Days DevOps' },
    { href: '/blog', label: 'Blog' },
    { href: '/search', label: 'Buscar' },
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
      title: 'Recursos',
      links: [
        { href: '/blog', label: 'Blog' },
        { href: '/#why', label: 'Por que o OpsCanopy' },
        { href: 'https://github.com/opscanopy/opscanopy.com', label: 'Código-fonte no GitHub' },
      ],
    },
    {
      title: 'Empresa',
      links: [
        { href: '/about', label: 'Sobre' },
        { href: '/contact', label: 'Contato' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { href: '/privacy', label: 'Privacidade' },
        { href: '/terms', label: 'Termos' },
      ],
    },
  ],
};

export default ptBr;
