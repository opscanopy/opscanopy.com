/** Localized site copy — Spanish (es). Partial: omitted fields fall back to English. */
import type { SiteContent } from './en';

const es: Partial<SiteContent> = {
  tagline: 'Una copa de herramientas gratuitas, privadas y basadas en el navegador para ingenieros de plataforma y DevOps.',
  description:
    'OpsCanopy es un centro en crecimiento de utilidades de DevOps gratuitas y basadas en el navegador: validadores, conversores, probadores y linters que se ejecutan por completo en el cliente. Sin registro, sin servidores; tus datos nunca salen del dispositivo.',
  nav: [
    { href: '/tools', label: 'Herramientas' },
    { href: '/learn', label: 'Learn' },
    { href: '/mission-90/', label: '90 Days DevOps' },
    { href: '/blog', label: 'Blog' },
    { href: '/search', label: 'Buscar' },
  ],
  footer: [
    {
      title: 'Herramientas',
      links: [
        { href: '/loki-alert-rule-tester', label: 'AlertLint — probador de reglas de Loki' },
        { href: '/tools', label: 'Todas las herramientas' },
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
        { href: '/#why', label: 'Por qué OpsCanopy' },
      ],
    },
    {
      title: 'Empresa',
      links: [
        { href: '/about', label: 'Acerca de' },
        { href: '/contact', label: 'Contacto' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { href: '/privacy', label: 'Privacidad' },
        { href: '/terms', label: 'Términos' },
      ],
    },
  ],
};

export default es;
