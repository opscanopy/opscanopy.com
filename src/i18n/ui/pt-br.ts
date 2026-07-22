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
  'megamenu.explore': 'Explore',
  'megamenu.learnStrip': 'Learn — trilhas e guias',
  'megamenu.installApp': 'Instalar o app',

  // PWA install CTA (revealed by beforeinstallprompt — see Layout.astro)
  'install.appCta': 'Instale o OpsCanopy como aplicativo',

  // Footer
  'footer.copyright': 'Gratuito e aberto.',
  'footer.builtBy': 'Feito por',
  'footer.openSource': 'Código aberto — leia exatamente o que cada ferramenta calcula.',
  'footer.disclaimer.lead': 'Sem afiliação ou endosso da Grafana Labs.',
  'footer.disclaimer.trademark': 'e',
  'footer.disclaimer.tail': 'são marcas registradas da Raintank, Inc.',

  // FAQ section (shared FaqList component — defaults; explicit props override)
  'faq.eyebrow': 'FAQ',
  'faq.heading': 'Suas perguntas, respondidas.',
  'faq.tapHint': 'Toque em uma pergunta para expandir a resposta.',

  // Tool cross-links footer (brand-recall band)
  'crosslinks.hook':
    '{count} ferramentas gratuitas, todas capazes de funcionar offline — o opscanopy.com não exige cadastro e não envia nada.',
  'crosslinks.paletteHint':
    '{count} ferramentas, um atalho — pressione Ctrl/⌘+K para acessar qualquer uma delas.',

  // Paleta de comandos (Ctrl/⌘+K)
  'palette.dialogLabel': 'Paleta de comandos',
  'palette.placeholder': 'Ir para uma ferramenta…',
  'palette.searchLabel': 'Buscar ferramentas',
  'palette.empty': 'Nenhuma ferramenta corresponde à sua busca.',
  'palette.hintNav': 'Navegar',
  'palette.hintSelect': 'Selecionar',
  'palette.hintClose': 'Fechar',

  // Tool changelog
  'tools.updatedBadge': 'Atualizado em {date}',
  'changelog.metaTitle': 'Changelog',

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
  'blog.readingTime': '{minutes} min de leitura',
  'blog.updatedOn': 'Última atualização: {date}',
  'blog.breadcrumbHome': 'Início',
  'blog.breadcrumbBlog': 'Blog',
  'blog.breadcrumbAriaLabel': 'Trilha de navegação',
  'blog.relatedTitle': 'Posts relacionados',
  'blog.ctaEyebrow': 'Teste ao vivo',
  'blog.ctaLead': 'Este post acompanha uma ferramenta gratuita que roda no navegador.',
  'blog.ctaButton': 'Abrir {name}',

  // Prev/next pager
  'blog.pagerAriaLabel': 'Navegação de posts',
  'blog.prevPost': 'Anterior',
  'blog.nextPost': 'Próximo',

  // Code copy (progressive enhancement)
  'blog.copyCode': 'Copiar',
  'blog.copiedCode': 'Copiado',
  'blog.copyCodeAriaLabel': 'Copiar código para a área de transferência',

  // Post detail: table of contents, share, back-to-top
  'blog.tocTitle': 'Nesta página',
  'blog.shareTitle': 'Compartilhar',
  'blog.shareX': 'Compartilhar no X',
  'blog.shareLinkedIn': 'Compartilhar no LinkedIn',
  'blog.copyLink': 'Copiar link',
  'blog.linkCopied': 'Link copiado',
  'blog.backToTop': 'Voltar ao topo',
  'blog.headingAnchorLabel': 'Link para esta seção',

  // Tag pages
  'blog.tagEyebrow': 'Tag',
  'blog.tagTitle': 'Posts com a tag “{tag}”',
  'blog.tagLead': 'Todos os posts arquivados em “{tag}”, do mais recente ao mais antigo.',
  'blog.tagCountSingular': 'post.',
  'blog.tagCountPlural': 'posts.',

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
  'category.Docker': 'Docker',
  'category.all': 'Todas',

  // Tool catalog (/tools)
  'tools.badgeLive': 'No ar',
  'tools.tryLabel': 'Testar:',
  'tools.openTool': 'Abrir ferramenta',
  'tools.availableNow': 'Disponíveis agora',
  'tools.pinAdd': 'Fixar esta ferramenta',
  'tools.pinRemove': 'Desafixar esta ferramenta',
  'tools.pinLabel': 'Fixar',
  'tools.pinnedLabel': 'Fixado',
  'tools.yourTools': 'Suas ferramentas',
  'tools.jumpBackIn': 'Continue de onde parou',
  'tools.jumpBackInCaption': 'Ferramentas fixadas e usadas recentemente — salvas apenas neste navegador.',

  // Tool page breadcrumb trail
  'breadcrumb.home': 'Início',
  'breadcrumb.tools': 'Ferramentas',
  'breadcrumb.allTools': 'Todas as ferramentas',
  'tools.liveToolsHeading': 'Ferramentas no ar.',
  'tools.clientSideBadge': '100% no lado do cliente',
  'tools.browseByCategory': 'Navegar por categoria',
  'tools.searchPlaceholder': 'Buscar ferramentas…',
  'tools.searchLabel': 'Buscar ferramentas',
  'tools.filterLabel': 'Filtrar por categoria',
  'tools.sortLabel': 'Ordenar',
  'tools.sortAriaLabel': 'Ordenar ferramentas',
  'tools.sortDefault': 'Padrão',
  'tools.sortAZ': 'A–Z',
  'tools.sortNewest': 'Mais recentes',
  'tools.emptyTitle': 'Nenhuma ferramenta corresponde a {query}.',
  'tools.emptyQueryFallback': 'sua busca',
  'tools.emptyHint': 'Experimente um destes, ou limpe os filtros para ver tudo.',
  'tools.clearFilters': 'Limpar filtros',
  'tools.zeroLiveTitle': 'Nada no ar ainda.',
  'tools.zeroLiveBody':
    'A primeira ferramenta está sendo finalizada para o lançamento: volte em breve para ver o que vem por aí.',

  // Site search (/search)
  'search.title': 'Buscar — OpsCanopy',
  'search.metaDescription': 'Busque em todas as ferramentas, guias e posts do blog da OpsCanopy.',
  'search.ariaLabel': 'Busca no site',
  'search.eyebrow': 'Buscar',
  'search.heading': 'Buscar na OpsCanopy',
  'search.lead':
    'Todas as ferramentas, guias e posts do blog do site — buscados inteiramente no seu navegador. Nada do que você digita sai desta página.',
  'search.inputLabel': 'Buscar no site',
  'search.placeholder': 'subnet, cron, docker compose…',
  'search.hint': 'Os resultados são atualizados enquanto você digita — pressione Enter para buscar agora.',
  'search.initialEmptyPrefix': 'Digite para buscar ferramentas, guias e posts do blog — experimente',
  'search.exampleOr': 'ou',
  'search.noscriptPrefix': 'A busca funciona inteiramente no seu navegador — ative o JavaScript para usá-la, ou',
  'search.noscriptLink': 'explore o catálogo completo de ferramentas',
  'search.unavailablePrefix':
    'A busca não está disponível aqui — o índice é gerado ao compilar o site, por isso está ausente nesta prévia. Explore',
  'search.unavailableToolsLink': 'todas as ferramentas',
  'search.unavailableMiddle': 'ou o',
  'search.unavailableBlogLink': 'blog',
  'search.unavailableSuffix': '.',
  'search.noResultsPrefix': 'Nenhum resultado para “{term}”.',
  'search.noResultsTips':
    'Termos curtos e simples funcionam melhor — nomes de ferramentas, protocolos ou a mensagem de erro exata.',
  'search.noResultsCoverage': 'A busca cobre apenas as páginas em português do site.',
  'search.resultsForSingular': '{n} resultado para “{term}”',
  'search.resultsForPlural': '{n} resultados para “{term}”',
  'search.showMoreResults': 'Ver mais resultados',
  'search.showMoreResultsCount': 'Ver mais resultados ({n})',
  'search.statusNoResults': 'Nenhum resultado.',
  'search.statusResultsSingular': '{n} resultado.',
  'search.statusResultsPlural': '{n} resultados.',
  'search.statusUnavailable': 'A busca não está disponível nesta prévia.',
};

export default ptBr;
