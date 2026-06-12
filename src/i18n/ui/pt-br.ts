/** Localized UI dictionary — Brazilian Portuguese (pt-br). */
import type { UiDict } from './en';

const ptBr: Partial<UiDict> = {
  // Accessibility / skip link
  'a11y.skipToContent': 'Pular para o conteúdo',
  'a11y.homeLabel': '{name}, página inicial',
  'a11y.openMenu': 'Abrir menu',
  'a11y.closeMenu': 'Fechar menu',
  'a11y.themeToDark': 'Mudar para o tema escuro',
  'a11y.themeToLight': 'Mudar para o tema claro',
  'a11y.opensNewTab': '(abre em uma nova aba)',

  // Header
  'nav.browseTools': 'Explorar ferramentas',
  'theme.dark': 'Tema escuro',
  'theme.light': 'Tema claro',

  // Mega menu
  'megamenu.dialogLabel': 'Explorar todas as ferramentas',
  'megamenu.searchPlaceholder': 'Buscar em {count} ferramentas…',
  'megamenu.searchLabel': 'Buscar ferramentas',
  'megamenu.clearSearch': 'Limpar busca',
  'megamenu.emptyPrefix': 'Nenhuma ferramenta corresponde a',
  'megamenu.emptySuffix': '.',
  'megamenu.browseAll': 'Explorar todas as ferramentas',
  'megamenu.footerCount': '{count} ferramentas — 100% no navegador, nada é enviado',
  'megamenu.viewAll': 'Ver todas as ferramentas',

  // Footer
  'footer.copyright': 'Gratuito e aberto.',
  'footer.disclaimer.lead': 'Sem afiliação ou endosso da Grafana Labs.',
  'footer.disclaimer.trademark': 'e',
  'footer.disclaimer.tail': 'são marcas registradas da Raintank, Inc.',

  // Language switcher
  'lang.switcherLabel': 'Idioma',

  // Blog
  'blog.metaTitle': 'Blog',
  'blog.metaDescription':
    'Notas sobre ferramentas de DevOps, observabilidade e as lacunas que vale a pena preencher.',
  'blog.eyebrow': 'Textos',
  'blog.indexTitle': 'Notas da copa das árvores.',
  'blog.indexLead':
    'Observações sobre ferramentas de DevOps, observabilidade e as pequenas lacunas do ecossistema que vale a pena preencher — escritas para as pessoas que desenvolvem e esbarram nelas.',
  'blog.countSuffixSingular': 'post e contando.',
  'blog.countSuffixPlural': 'posts e contando.',
  'blog.emptyEyebrow': 'Notas',
  'blog.emptyTitle': 'Nada por aqui no momento.',
  'blog.emptyBody': 'Novas notas estão a caminho. Enquanto isso, explore as ferramentas.',
  'blog.emptyCta': 'Explorar as ferramentas',
  'blog.readPost': 'Ler post',
  'blog.allPosts': 'Todos os posts',
  'blog.notTranslated':
    'Este post ainda não está disponível no seu idioma — exibindo em inglês.',

  // Category filter labels (key = stable English category name)
  'category.Networking': 'Redes',
  'category.Security': 'Segurança',
  'category.Encoding': 'Codificação',
  'category.Kubernetes': 'Kubernetes',
  'category.Observability': 'Observabilidade',
  'category.CI/CD': 'CI/CD',
  'category.Scheduling': 'Agendamento',
  'category.Logs': 'Logs',
  'category.Config': 'Config',
};

export default ptBr;
