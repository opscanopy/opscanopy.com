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
  'megamenu.explore': 'Explorer',
  'megamenu.learnStrip': 'Learn — feuilles de route et guides',
  'megamenu.installApp': 'Installer l’app',

  // PWA install CTA (revealed by beforeinstallprompt — see Layout.astro)
  'install.appCta': 'Installer OpsCanopy comme application',

  // Footer
  'footer.copyright': 'Libre et ouvert.',
  'footer.builtBy': 'Créé par',
  'footer.openSource': 'Open source — lisez exactement ce que chaque outil calcule.',
  'footer.disclaimer.lead': 'Sans affiliation avec Grafana Labs ni approbation de sa part.',
  'footer.disclaimer.trademark': 'et',
  'footer.disclaimer.tail': 'sont des marques de Raintank, Inc.',

  // FAQ section (shared FaqList component — defaults; explicit props override)
  'faq.eyebrow': 'FAQ',
  'faq.heading': 'Vos questions, nos réponses.',
  'faq.tapHint': 'Appuyez sur une question pour afficher la réponse.',

  // Tool cross-links footer (brand-recall band)
  'crosslinks.hook':
    '{count} outils gratuits, tous utilisables hors ligne — opscanopy.com fonctionne sans inscription et sans rien téléverser.',
  'crosslinks.paletteHint':
    "{count} outils, un raccourci — appuyez sur Ctrl/⌘+K pour accéder à n'importe lequel.",

  // Palette de commandes (Ctrl/⌘+K)
  'palette.dialogLabel': 'Palette de commandes',
  'palette.placeholder': 'Accéder à un outil…',
  'palette.searchLabel': 'Rechercher des outils',
  'palette.empty': 'Aucun outil ne correspond à votre recherche.',
  'palette.hintNav': 'Naviguer',
  'palette.hintSelect': 'Sélectionner',
  'palette.hintClose': 'Fermer',

  // Tool changelog
  'tools.updatedBadge': 'Mis à jour le {date}',
  'changelog.metaTitle': 'Changelog',

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

  // Post detail: table of contents, share, back-to-top
  'blog.tocTitle': 'Sur cette page',
  'blog.shareTitle': 'Partager',
  'blog.shareX': 'Partager sur X',
  'blog.shareLinkedIn': 'Partager sur LinkedIn',
  'blog.copyLink': 'Copier le lien',
  'blog.linkCopied': 'Lien copié',
  'blog.backToTop': 'Haut de page',
  'blog.headingAnchorLabel': 'Lien vers cette section',

  // Tag pages
  'blog.tagEyebrow': 'Étiquette',
  'blog.tagTitle': 'Articles étiquetés « {tag} »',
  'blog.tagLead': 'Tous les articles classés sous « {tag} », du plus récent au plus ancien.',
  'blog.tagCountSingular': 'article.',
  'blog.tagCountPlural': 'articles.',

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
  'category.Docker': 'Docker',
  'category.all': 'Tous',

  // Tool catalog (/tools)
  'tools.badgeLive': 'En service',
  'tools.tryLabel': 'Essayer :',
  'tools.openTool': "Ouvrir l'outil",
  'tools.availableNow': 'Disponibles maintenant',
  'tools.pinAdd': 'Épingler cet outil',
  'tools.pinRemove': 'Désépingler cet outil',
  'tools.pinLabel': 'Épingler',
  'tools.pinnedLabel': 'Épinglé',
  'tools.yourTools': 'Vos outils',
  'tools.jumpBackIn': 'Reprenez où vous en étiez',
  'tools.jumpBackInCaption': 'Outils épinglés et récemment utilisés — enregistrés uniquement dans ce navigateur.',

  // Tool page breadcrumb trail
  'breadcrumb.home': 'Accueil',
  'breadcrumb.tools': 'Outils',
  'breadcrumb.allTools': 'Tous les outils',
  'tools.liveToolsHeading': 'Outils en service.',
  'tools.clientSideBadge': '100% côté client',
  'tools.browseByCategory': 'Parcourir par catégorie',
  'tools.searchPlaceholder': 'Rechercher des outils…',
  'tools.searchLabel': 'Rechercher des outils',
  'tools.filterLabel': 'Filtrer par catégorie',
  'tools.sortLabel': 'Trier',
  'tools.sortAriaLabel': 'Trier les outils',
  'tools.sortDefault': 'Par défaut',
  'tools.sortAZ': 'A–Z',
  'tools.sortNewest': 'Plus récents',
  'tools.emptyTitle': 'Aucun outil ne correspond à {query}.',
  'tools.emptyQueryFallback': 'votre recherche',
  'tools.emptyHint': "Essayez l'un de ceux-ci, ou réinitialisez les filtres pour tout voir.",
  'tools.clearFilters': 'Réinitialiser les filtres',
  'tools.zeroLiveTitle': "Rien en service pour l'instant.",
  'tools.zeroLiveBody':
    "Le premier outil est en cours de finition avant sa mise en ligne : revenez bientôt pour découvrir ce qui arrive.",

  // Site search (/search)
  'search.title': 'Recherche — OpsCanopy',
  'search.metaDescription': 'Recherchez parmi tous les outils, guides et articles de blog OpsCanopy.',
  'search.ariaLabel': 'Recherche sur le site',
  'search.eyebrow': 'Recherche',
  'search.heading': 'Rechercher sur OpsCanopy',
  'search.lead':
    'Tous les outils, guides et articles de blog du site — recherchés entièrement dans votre navigateur. Rien de ce que vous saisissez ne quitte cette page.',
  'search.inputLabel': 'Rechercher sur le site',
  'search.placeholder': 'subnet, cron, docker compose…',
  'search.hint': 'Les résultats se mettent à jour au fur et à mesure — appuyez sur Entrée pour lancer la recherche immédiatement.',
  'search.initialEmptyPrefix': 'Tapez pour rechercher des outils, guides et articles de blog — essayez',
  'search.exampleOr': 'ou',
  'search.noscriptPrefix': 'La recherche fonctionne entièrement dans votre navigateur — activez JavaScript pour l’utiliser, ou',
  'search.noscriptLink': 'parcourez le catalogue complet des outils',
  'search.unavailablePrefix':
    'La recherche n’est pas disponible ici — l’index est généré lors de la compilation du site, il est donc absent de cet aperçu. Parcourez plutôt',
  'search.unavailableToolsLink': 'tous les outils',
  'search.unavailableMiddle': 'ou le',
  'search.unavailableBlogLink': 'blog',
  'search.unavailableSuffix': '.',
  'search.noResultsPrefix': 'Aucune correspondance pour « {term} ».',
  'search.noResultsTips':
    'Les termes courts et simples fonctionnent mieux — noms d’outils, protocoles ou message d’erreur exact.',
  'search.noResultsCoverage': 'La recherche couvre uniquement les pages françaises du site.',
  'search.resultsForSingular': '{n} résultat pour « {term} »',
  'search.resultsForPlural': '{n} résultats pour « {term} »',
  'search.showMoreResults': 'Afficher plus de résultats',
  'search.showMoreResultsCount': 'Afficher plus de résultats ({n})',
  'search.statusNoResults': 'Aucun résultat.',
  'search.statusResultsSingular': '{n} résultat.',
  'search.statusResultsPlural': '{n} résultats.',
  'search.statusUnavailable': 'La recherche n’est pas disponible dans cet aperçu.',
};

export default fr;
