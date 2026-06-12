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

  // Footer
  'footer.copyright': 'Gratis y abierto.',
  'footer.disclaimer.lead': 'No está afiliado a Grafana Labs ni cuenta con su respaldo.',
  'footer.disclaimer.trademark': 'y',
  'footer.disclaimer.tail': 'son marcas comerciales de Raintank, Inc.',

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
};

export default es;
