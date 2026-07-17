/** Localized UI dictionary — German (de). */
import type { UiDict } from './en';

const de: Partial<UiDict> = {
  // Accessibility / skip link
  'a11y.skipToContent': 'Zum Inhalt springen',
  'a11y.homeLabel': '{name}, Startseite',
  'a11y.openMenu': 'Menü öffnen',
  'a11y.closeMenu': 'Menü schließen',
  'a11y.themeToDark': 'Zum dunklen Design wechseln',
  'a11y.themeToLight': 'Zum hellen Design wechseln',
  'a11y.opensNewTab': '(wird in einem neuen Tab geöffnet)',

  // Header
  'nav.browseTools': 'Tools durchsuchen',
  'theme.dark': 'Dunkles Design',
  'theme.light': 'Helles Design',

  // Mega menu
  'megamenu.dialogLabel': 'Alle Tools durchsuchen',
  'megamenu.searchPlaceholder': '{count} Tools durchsuchen…',
  'megamenu.searchLabel': 'Tools durchsuchen',
  'megamenu.clearSearch': 'Suche zurücksetzen',
  'megamenu.emptyPrefix': 'Keine Tools gefunden für',
  'megamenu.emptySuffix': '.',
  'megamenu.browseAll': 'Alle Tools durchsuchen',
  'megamenu.footerCount': '{count} Tools — 100 % browserbasiert, nichts wird hochgeladen',
  'megamenu.viewAll': 'Alle Tools anzeigen',

  // Footer
  'footer.copyright': 'Kostenlos & offen.',
  'footer.builtBy': 'Entwickelt von',
  'footer.disclaimer.lead': 'Nicht mit Grafana Labs verbunden oder von Grafana Labs unterstützt.',
  'footer.disclaimer.trademark': 'und',
  'footer.disclaimer.tail': 'sind Marken von Raintank, Inc.',

  // Language switcher
  'lang.switcherLabel': 'Sprache',

  // Blog
  'blog.metaTitle': 'Blog',
  'blog.metaDescription':
    'Notizen zu DevOps-Tooling, Observability und den Lücken, die sich zu schließen lohnen.',
  'blog.eyebrow': 'Beiträge',
  'blog.indexTitle': 'Notizen aus dem Blätterdach.',
  'blog.indexLead':
    'Beobachtungen zu DevOps-Tooling, Observability und den kleinen Lücken im Ökosystem, die sich zu schließen lohnen — geschrieben für die Engineers, die auf sie stoßen.',
  'blog.countSuffixSingular': 'Beitrag und es werden mehr.',
  'blog.countSuffixPlural': 'Beiträge und es werden mehr.',
  'blog.emptyEyebrow': 'Notizen',
  'blog.emptyTitle': 'Hier ist derzeit nichts.',
  'blog.emptyBody':
    'Neue Notizen sind unterwegs. Erkunden Sie in der Zwischenzeit die Tools.',
  'blog.emptyCta': 'Tools durchsuchen',
  'blog.readPost': 'Beitrag lesen',
  'blog.allPosts': 'Alle Beiträge',
  'blog.notTranslated':
    'Dieser Beitrag ist noch nicht in Ihrer Sprache verfügbar — er wird auf Englisch angezeigt.',
  'blog.readingTime': '{minutes} Min. Lesezeit',
  'blog.updatedOn': 'Zuletzt aktualisiert: {date}',
  'blog.breadcrumbHome': 'Startseite',
  'blog.breadcrumbBlog': 'Blog',
  'blog.breadcrumbAriaLabel': 'Brotkrümelnavigation',
  'blog.relatedTitle': 'Ähnliche Beiträge',
  'blog.ctaEyebrow': 'Live ausprobieren',
  'blog.ctaLead': 'Zu diesem Beitrag gibt es ein kostenloses, browserbasiertes Tool.',
  'blog.ctaButton': '{name} öffnen',

  // Prev/next pager
  'blog.pagerAriaLabel': 'Beitragsnavigation',
  'blog.prevPost': 'Zurück',
  'blog.nextPost': 'Weiter',

  // Code copy (progressive enhancement)
  'blog.copyCode': 'Kopieren',
  'blog.copiedCode': 'Kopiert',
  'blog.copyCodeAriaLabel': 'Code in die Zwischenablage kopieren',

  // Post detail: table of contents, share, back-to-top
  'blog.tocTitle': 'Auf dieser Seite',
  'blog.shareTitle': 'Teilen',
  'blog.shareX': 'Auf X teilen',
  'blog.shareLinkedIn': 'Auf LinkedIn teilen',
  'blog.copyLink': 'Link kopieren',
  'blog.linkCopied': 'Link kopiert',
  'blog.backToTop': 'Nach oben',
  'blog.headingAnchorLabel': 'Link zu diesem Abschnitt',

  // Tag pages
  'blog.tagEyebrow': 'Schlagwort',
  'blog.tagTitle': 'Beiträge mit dem Schlagwort „{tag}“',
  'blog.tagLead': 'Alle Beiträge unter „{tag}“, neueste zuerst.',
  'blog.tagCountSingular': 'Beitrag.',
  'blog.tagCountPlural': 'Beiträge.',

  // Category filter labels (key = stable English category name)
  'category.Networking': 'Netzwerk',
  'category.Security': 'Sicherheit',
  'category.Encoding': 'Kodierung',
  'category.Kubernetes': 'Kubernetes',
  'category.Observability': 'Observability',
  'category.CI/CD': 'CI/CD',
  'category.Scheduling': 'Zeitplanung',
  'category.Logs': 'Logs',
  'category.Config': 'Config',
  'category.Docker': 'Docker',
  'category.all': 'Alle',

  // Tool catalog (/tools)
  'tools.badgeLive': 'Live',
  'tools.tryLabel': 'Testen:',
  'tools.openTool': 'Tool öffnen',
  'tools.availableNow': 'Jetzt verfügbar',
  'tools.liveToolsHeading': 'Live-Tools.',
  'tools.clientSideBadge': '100% clientseitig',
  'tools.browseByCategory': 'Nach Kategorie durchsuchen',
  'tools.searchPlaceholder': 'Tools durchsuchen…',
  'tools.searchLabel': 'Tools durchsuchen',
  'tools.filterLabel': 'Nach Kategorie filtern',
  'tools.sortLabel': 'Sortieren',
  'tools.sortAriaLabel': 'Tools sortieren',
  'tools.sortDefault': 'Standard',
  'tools.sortAZ': 'A–Z',
  'tools.sortNewest': 'Neueste',
  'tools.emptyTitle': 'Keine Tools entsprechen {query}.',
  'tools.emptyQueryFallback': 'Ihrer Suche',
  'tools.emptyHint': 'Probieren Sie eines davon, oder setzen Sie die Filter zurück, um alles zu sehen.',
  'tools.clearFilters': 'Filter zurücksetzen',
  'tools.zeroLiveTitle': 'Noch nichts live.',
  'tools.zeroLiveBody':
    'Das erste Tool wird gerade für den Release poliert – schauen Sie bald wieder vorbei, um zu sehen, was kommt.',

  // Site search (/search)
  'search.title': 'Suche — OpsCanopy',
  'search.metaDescription': 'Durchsuchen Sie jedes OpsCanopy-Tool, jeden Guide und Blogbeitrag.',
  'search.ariaLabel': 'Website-Suche',
  'search.eyebrow': 'Suche',
  'search.heading': 'OpsCanopy durchsuchen',
  'search.lead':
    'Jedes Tool, jeder Guide und jeder Blogbeitrag der Website – durchsucht vollständig in Ihrem Browser. Nichts, was Sie eingeben, verlässt diese Seite.',
  'search.inputLabel': 'Die Website durchsuchen',
  'search.placeholder': 'subnet, cron, docker compose…',
  'search.hint': 'Ergebnisse aktualisieren sich beim Tippen — drücken Sie Enter, um sofort zu suchen.',
  'search.initialEmptyPrefix': 'Tippen Sie, um Tools, Guides und Blogbeiträge zu durchsuchen — probieren Sie',
  'search.exampleOr': 'oder',
  'search.noscriptPrefix': 'Die Suche läuft vollständig in Ihrem Browser — aktivieren Sie JavaScript, um sie zu nutzen, oder',
  'search.noscriptLink': 'durchsuchen Sie den gesamten Tool-Katalog',
  'search.unavailablePrefix':
    'Die Suche ist hier nicht verfügbar — der Index wird beim Erstellen der Website generiert und fehlt daher in dieser Vorschau. Durchsuchen Sie stattdessen',
  'search.unavailableToolsLink': 'alle Tools',
  'search.unavailableMiddle': 'oder den',
  'search.unavailableBlogLink': 'Blog',
  'search.unavailableSuffix': '.',
  'search.noResultsPrefix': 'Keine Treffer für „{term}“.',
  'search.noResultsTips':
    'Kürzere, einfachere Begriffe funktionieren am besten — Toolnamen, Protokolle oder die genaue Fehlermeldung.',
  'search.noResultsCoverage': 'Die Suche deckt nur die deutschen Seiten der Website ab.',
  'search.resultsForSingular': '{n} Ergebnis für „{term}“',
  'search.resultsForPlural': '{n} Ergebnisse für „{term}“',
  'search.showMoreResults': 'Weitere Ergebnisse anzeigen',
  'search.showMoreResultsCount': 'Weitere Ergebnisse anzeigen ({n})',
  'search.statusNoResults': 'Keine Ergebnisse.',
  'search.statusResultsSingular': '{n} Ergebnis.',
  'search.statusResultsPlural': '{n} Ergebnisse.',
  'search.statusUnavailable': 'Die Suche ist in dieser Vorschau nicht verfügbar.',
};

export default de;
