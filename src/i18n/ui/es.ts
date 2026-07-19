/** Localized UI dictionary — Spanish (es). */
import type { UiDict } from './en';

const es: Partial<UiDict> = {
  // Accessibility / skip link
  'a11y.skipToContent': 'Saltar al contenido',
  'a11y.homeLabel': '{name}, inicio',
  'a11y.openMenu': 'Abrir menú',
  'a11y.closeMenu': 'Cerrar menú',
  'a11y.themeToDark': 'Cambiar al tema oscuro',
  'a11y.themeToLight': 'Cambiar al tema claro',
  'a11y.opensNewTab': '(se abre en una pestaña nueva)',

  // Header
  'nav.browseTools': 'Explorar herramientas',
  'theme.dark': 'Tema oscuro',
  'theme.light': 'Tema claro',

  // Mega menu
  'megamenu.dialogLabel': 'Explorar todas las herramientas',
  'megamenu.searchPlaceholder': 'Buscar entre {count} herramientas…',
  'megamenu.searchLabel': 'Buscar herramientas',
  'megamenu.clearSearch': 'Borrar búsqueda',
  'megamenu.emptyPrefix': 'Ninguna herramienta coincide con',
  'megamenu.emptySuffix': '.',
  'megamenu.browseAll': 'Explorar todas las herramientas',
  'megamenu.footerCount': '{count} herramientas — 100 % en el navegador, no se sube nada',
  'megamenu.viewAll': 'Ver todas las herramientas',
  'megamenu.explore': 'Explora',
  'megamenu.learnStrip': 'Learn — rutas y guías',
  'megamenu.installApp': 'Instalar la app',

  // PWA install CTA (revealed by beforeinstallprompt — see Layout.astro)
  'install.appCta': 'Instala OpsCanopy como aplicación',

  // Footer
  'footer.copyright': 'Gratis y abierto.',
  'footer.builtBy': 'Hecho por',
  'footer.openSource': 'Código abierto — lee exactamente qué calcula cada herramienta.',
  'footer.disclaimer.lead': 'No está afiliado a Grafana Labs ni cuenta con su respaldo.',
  'footer.disclaimer.trademark': 'y',
  'footer.disclaimer.tail': 'son marcas comerciales de Raintank, Inc.',

  // FAQ section (shared FaqList component — defaults; explicit props override)
  'faq.eyebrow': 'FAQ',
  'faq.heading': 'Tus preguntas, respondidas.',
  'faq.tapHint': 'Toca una pregunta para desplegar la respuesta.',

  // Tool cross-links footer (brand-recall band)
  'crosslinks.hook':
    '{count} herramientas gratuitas, todas pueden funcionar sin conexión — opscanopy.com funciona sin registro y sin subir nada.',
  'crosslinks.paletteHint':
    '{count} herramientas, un atajo — pulsa Ctrl/⌘+K para ir a cualquiera de ellas.',

  // Paleta de comandos (Ctrl/⌘+K)
  'palette.dialogLabel': 'Paleta de comandos',
  'palette.placeholder': 'Ir a una herramienta…',
  'palette.searchLabel': 'Buscar herramientas',
  'palette.empty': 'Ninguna herramienta coincide con tu búsqueda.',
  'palette.hintNav': 'Navegar',
  'palette.hintSelect': 'Seleccionar',
  'palette.hintClose': 'Cerrar',

  // Tool changelog
  'tools.updatedBadge': 'Actualizado el {date}',
  'changelog.metaTitle': 'Changelog',

  // Language switcher
  'lang.switcherLabel': 'Idioma',

  // Blog
  'blog.metaTitle': 'Blog',
  'blog.metaDescription': 'Notas sobre herramientas de DevOps, observabilidad y las carencias que vale la pena cubrir.',
  'blog.eyebrow': 'Escritos',
  'blog.indexTitle': 'Notas desde la copa.',
  'blog.indexLead':
    'Observaciones sobre herramientas de DevOps, observabilidad y las pequeñas carencias del ecosistema que vale la pena cubrir, escritas para los ingenieros que se topan con ellas.',
  'blog.countSuffixSingular': 'publicación y subiendo.',
  'blog.countSuffixPlural': 'publicaciones y subiendo.',
  'blog.emptyEyebrow': 'Notas',
  'blog.emptyTitle': 'Aquí no hay nada por ahora.',
  'blog.emptyBody': 'Pronto llegarán notas nuevas. Mientras tanto, explora las herramientas.',
  'blog.emptyCta': 'Explorar las herramientas',
  'blog.readPost': 'Leer publicación',
  'blog.allPosts': 'Todas las publicaciones',
  'blog.notTranslated': 'Esta publicación aún no está disponible en tu idioma; se muestra en inglés.',
  'blog.readingTime': '{minutes} min de lectura',
  'blog.updatedOn': 'Última actualización: {date}',
  'blog.breadcrumbHome': 'Inicio',
  'blog.breadcrumbBlog': 'Blog',
  'blog.breadcrumbAriaLabel': 'Ruta de navegación',
  'blog.relatedTitle': 'Publicaciones relacionadas',
  'blog.ctaEyebrow': 'Pruébalo en vivo',
  'blog.ctaLead': 'Esta publicación se acompaña de una herramienta gratuita que funciona en el navegador.',
  'blog.ctaButton': 'Abrir {name}',

  // Prev/next pager
  'blog.pagerAriaLabel': 'Navegación de publicaciones',
  'blog.prevPost': 'Anterior',
  'blog.nextPost': 'Siguiente',

  // Code copy (progressive enhancement)
  'blog.copyCode': 'Copiar',
  'blog.copiedCode': 'Copiado',
  'blog.copyCodeAriaLabel': 'Copiar código al portapapeles',

  // Post detail: table of contents, share, back-to-top
  'blog.tocTitle': 'En esta página',
  'blog.shareTitle': 'Compartir',
  'blog.shareX': 'Compartir en X',
  'blog.shareLinkedIn': 'Compartir en LinkedIn',
  'blog.copyLink': 'Copiar enlace',
  'blog.linkCopied': 'Enlace copiado',
  'blog.backToTop': 'Volver arriba',
  'blog.headingAnchorLabel': 'Enlace a esta sección',

  // Tag pages
  'blog.tagEyebrow': 'Etiqueta',
  'blog.tagTitle': 'Publicaciones con la etiqueta «{tag}»',
  'blog.tagLead': 'Todas las publicaciones archivadas en «{tag}», de la más reciente a la más antigua.',
  'blog.tagCountSingular': 'publicación.',
  'blog.tagCountPlural': 'publicaciones.',

  // Category filter labels (key = stable English category name)
  'category.Networking': 'Redes',
  'category.Security': 'Seguridad',
  'category.Encoding': 'Codificación',
  'category.Kubernetes': 'Kubernetes',
  'category.Observability': 'Observabilidad',
  'category.CI/CD': 'CI/CD',
  'category.Scheduling': 'Programación',
  'category.Logs': 'Logs',
  'category.Config': 'Config',
  'category.Docker': 'Docker',
  'category.all': 'Todas',

  // Tool catalog (/tools)
  'tools.badgeLive': 'En activo',
  'tools.tryLabel': 'Prueba:',
  'tools.openTool': 'Abrir herramienta',
  'tools.availableNow': 'Disponibles ahora',
  'tools.pinAdd': 'Fijar esta herramienta',
  'tools.pinRemove': 'Dejar de fijar esta herramienta',
  'tools.yourTools': 'Tus herramientas',
  'tools.jumpBackIn': 'Continúa donde lo dejaste',
  'tools.jumpBackInCaption': 'Herramientas fijadas y usadas recientemente — guardadas solo en este navegador.',

  // Tool page breadcrumb trail
  'breadcrumb.home': 'Inicio',
  'breadcrumb.tools': 'Herramientas',
  'breadcrumb.allTools': 'Todas las herramientas',
  'tools.liveToolsHeading': 'Herramientas en activo.',
  'tools.clientSideBadge': '100% del lado del cliente',
  'tools.browseByCategory': 'Explorar por categoría',
  'tools.searchPlaceholder': 'Buscar herramientas…',
  'tools.searchLabel': 'Buscar herramientas',
  'tools.filterLabel': 'Filtrar por categoría',
  'tools.sortLabel': 'Ordenar',
  'tools.sortAriaLabel': 'Ordenar herramientas',
  'tools.sortDefault': 'Predeterminado',
  'tools.sortAZ': 'A–Z',
  'tools.sortNewest': 'Más recientes',
  'tools.emptyTitle': 'Ninguna herramienta coincide con {query}.',
  'tools.emptyQueryFallback': 'tu búsqueda',
  'tools.emptyHint': 'Prueba una de estas opciones, o borra los filtros para ver todo.',
  'tools.clearFilters': 'Borrar filtros',
  'tools.zeroLiveTitle': 'Nada en activo todavía.',
  'tools.zeroLiveBody':
    'La primera herramienta se está puliendo para su lanzamiento: vuelve pronto para ver lo que llega.',

  // Site search (/search)
  'search.title': 'Buscar — OpsCanopy',
  'search.metaDescription': 'Busca en todas las herramientas, guías y entradas de blog de OpsCanopy.',
  'search.ariaLabel': 'Búsqueda del sitio',
  'search.eyebrow': 'Buscar',
  'search.heading': 'Buscar en OpsCanopy',
  'search.lead':
    'Todas las herramientas, guías y entradas de blog del sitio — buscadas por completo en tu navegador. Nada de lo que escribas sale de esta página.',
  'search.inputLabel': 'Buscar en el sitio',
  'search.placeholder': 'subnet, cron, docker compose…',
  'search.hint': 'Los resultados se actualizan mientras escribes — pulsa Intro para buscar ahora.',
  'search.initialEmptyPrefix': 'Escribe para buscar herramientas, guías y entradas de blog — prueba con',
  'search.exampleOr': 'o',
  'search.noscriptPrefix': 'La búsqueda funciona por completo en tu navegador — activa JavaScript para usarla, o',
  'search.noscriptLink': 'explora el catálogo completo de herramientas',
  'search.unavailablePrefix':
    'La búsqueda no está disponible aquí — el índice se genera al compilar el sitio, así que falta en esta vista previa. Explora',
  'search.unavailableToolsLink': 'todas las herramientas',
  'search.unavailableMiddle': 'o el',
  'search.unavailableBlogLink': 'blog',
  'search.unavailableSuffix': 'en su lugar.',
  'search.noResultsPrefix': 'Sin coincidencias para «{term}».',
  'search.noResultsTips':
    'Los términos cortos y sencillos funcionan mejor — nombres de herramientas, protocolos o el mensaje de error exacto.',
  'search.noResultsCoverage': 'La búsqueda solo cubre las páginas en español del sitio.',
  'search.resultsForSingular': '{n} resultado para «{term}»',
  'search.resultsForPlural': '{n} resultados para «{term}»',
  'search.showMoreResults': 'Ver más resultados',
  'search.showMoreResultsCount': 'Ver más resultados ({n})',
  'search.statusNoResults': 'Sin resultados.',
  'search.statusResultsSingular': '{n} resultado.',
  'search.statusResultsPlural': '{n} resultados.',
  'search.statusUnavailable': 'La búsqueda no está disponible en esta vista previa.',
};

export default es;
