/** Localized UI dictionary — French (fr). */
import type { UiDict } from './en';

const fr: Partial<UiDict> = {
  // Accessibility / skip link
  'a11y.skipToContent': 'Aller au contenu',
  'a11y.homeLabel': '{name}, accueil',
  'a11y.openMenu': 'Ouvrir le menu',
  'a11y.closeMenu': 'Fermer le menu',
  'a11y.themeToDark': 'Passer au thème sombre',
  'a11y.themeToLight': 'Passer au thème clair',
  'a11y.opensNewTab': '(ouvre dans un nouvel onglet)',

  // Header
  'nav.browseTools': 'Parcourir les outils',
  'theme.dark': 'Thème sombre',
  'theme.light': 'Thème clair',

  // Mega menu
  'megamenu.dialogLabel': 'Parcourir tous les outils',
  'megamenu.searchPlaceholder': 'Rechercher parmi {count} outils…',
  'megamenu.searchLabel': 'Rechercher des outils',
  'megamenu.clearSearch': 'Effacer la recherche',
  'megamenu.emptyPrefix': 'Aucun outil ne correspond à',
  'megamenu.emptySuffix': '.',
  'megamenu.browseAll': 'Parcourir tous les outils',
  'megamenu.footerCount': '{count} outils — 100 % dans le navigateur, rien n’est téléversé',
  'megamenu.viewAll': 'Voir tous les outils',

  // Footer
  'footer.copyright': 'Libre et ouvert.',
  'footer.disclaimer.lead': 'Sans affiliation avec Grafana Labs ni approbation de sa part.',
  'footer.disclaimer.trademark': 'et',
  'footer.disclaimer.tail': 'sont des marques de Raintank, Inc.',

  // Language switcher
  'lang.switcherLabel': 'Langue',

  // Blog
  'blog.metaTitle': 'Blog',
  'blog.metaDescription':
    'Notes sur l’outillage DevOps, l’observabilité et les manques qui méritent d’être comblés.',
  'blog.eyebrow': 'Articles',
  'blog.indexTitle': 'Notes de la canopée.',
  'blog.indexLead':
    'Observations sur l’outillage DevOps, l’observabilité et les petits manques de l’écosystème qui méritent d’être comblés — écrites pour les ingénieurs qui les rencontrent.',
  'blog.countSuffixSingular': 'article et ce n’est qu’un début.',
  'blog.countSuffixPlural': 'articles et ce n’est qu’un début.',
  'blog.emptyEyebrow': 'Notes',
  'blog.emptyTitle': 'Rien ici pour le moment.',
  'blog.emptyBody':
    'De nouvelles notes arrivent bientôt. En attendant, explorez les outils.',
  'blog.emptyCta': 'Parcourir les outils',
  'blog.readPost': 'Lire l’article',
  'blog.allPosts': 'Tous les articles',
  'blog.notTranslated':
    'Cet article n’est pas encore disponible dans votre langue — il est affiché en anglais.',
  'blog.readingTime': '{minutes} min de lecture',
  'blog.updatedOn': 'Dernière mise à jour : {date}',
  'blog.breadcrumbHome': 'Accueil',
  'blog.breadcrumbBlog': 'Blog',
  'blog.breadcrumbAriaLabel': 'Fil d’Ariane',
  'blog.relatedTitle': 'Articles liés',
  'blog.ctaEyebrow': 'Essayez-le en direct',
  'blog.ctaLead': 'Cet article s’accompagne d’un outil gratuit qui fonctionne dans le navigateur.',
  'blog.ctaButton': 'Ouvrir {name}',

  // Prev/next pager
  'blog.pagerAriaLabel': 'Navigation des articles',
  'blog.prevPost': 'Précédent',
  'blog.nextPost': 'Suivant',

  // Code copy (progressive enhancement)
  'blog.copyCode': 'Copier',
  'blog.copiedCode': 'Copié',
  'blog.copyCodeAriaLabel': 'Copier le code dans le presse-papiers',

  // Tag pages
  'blog.tagEyebrow': 'Étiquette',
  'blog.tagTitle': 'Articles étiquetés « {tag} »',
  'blog.tagLead': 'Tous les articles classés sous « {tag} », du plus récent au plus ancien.',
  'blog.tagCountSingular': 'article.',
  'blog.tagCountPlural': 'articles.',
  'blog.breadcrumbTag': 'Étiquette',

  // Category filter labels (key = stable English category name)
  'category.Networking': 'Réseau',
  'category.Security': 'Sécurité',
  'category.Encoding': 'Encodage',
  'category.Kubernetes': 'Kubernetes',
  'category.Observability': 'Observabilité',
  'category.CI/CD': 'CI/CD',
  'category.Scheduling': 'Planification',
  'category.Logs': 'Logs',
  'category.Config': 'Config',
};

export default fr;
