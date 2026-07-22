/**
 * UI string dictionary — English (source of truth).
 *
 * Every other locale's dictionary must `satisfies UiDict`, so a missing or
 * extra key is a compile error. Keys are flat and namespaced as
 * `surface.element`. `{name}`-style placeholders are interpolated by the
 * `t(key, vars)` helper from ../utils — never split a sentence across keys.
 *
 * This holds only language-neutral CHROME strings (nav, buttons, a11y labels,
 * empty states). Marketing/page prose lives in src/content/*, tool metadata in
 * src/i18n/tools/*, and brand/site copy in src/i18n/site/*.
 */

const en = {
  // Accessibility / skip link
  'a11y.skipToContent': 'Skip to content',
  'a11y.homeLabel': '{name}, home',
  'a11y.openMenu': 'Open menu',
  'a11y.closeMenu': 'Close menu',
  'a11y.themeToDark': 'Switch to dark theme',
  'a11y.themeToLight': 'Switch to light theme',
  'a11y.opensNewTab': '(opens in a new tab)',

  // Header
  'nav.browseTools': 'Browse Tools',
  'theme.dark': 'Dark theme',
  'theme.light': 'Light theme',

  // Mega menu
  'megamenu.dialogLabel': 'Browse all tools',
  'megamenu.searchPlaceholder': 'Search {count} tools…',
  'megamenu.searchLabel': 'Search tools',
  'megamenu.clearSearch': 'Clear search',
  'megamenu.emptyPrefix': 'No tools match',
  'megamenu.emptySuffix': '.',
  'megamenu.browseAll': 'Browse all tools',
  'megamenu.footerCount': '{count} tools — 100% browser-based, nothing uploaded',
  'megamenu.viewAll': 'View all tools',
  'megamenu.explore': 'Explore',
  'megamenu.learnStrip': 'Learn — roadmaps & guides',
  'megamenu.installApp': 'Install app',

  // PWA install CTA (revealed by beforeinstallprompt — see Layout.astro)
  'install.appCta': 'Install OpsCanopy as an app',

  // Footer
  'footer.copyright': 'Free & open.',
  'footer.builtBy': 'Built by',
  'footer.openSource': 'Open source — read exactly what each tool computes.',
  'footer.disclaimer.lead': 'Not affiliated with or endorsed by Grafana Labs.',
  'footer.disclaimer.trademark': 'and',
  'footer.disclaimer.tail': 'are trademarks of Raintank, Inc.',

  // FAQ section (shared FaqList component — defaults; explicit props override)
  'faq.eyebrow': 'FAQ',
  'faq.heading': 'Questions, answered.',
  'faq.tapHint': 'Tap a question to expand the answer.',

  // Tool cross-links footer (brand-recall band)
  'crosslinks.hook':
    '{count} free tools, every one offline-capable — opscanopy.com works with no signup and nothing uploaded.',
  'crosslinks.paletteHint': '{count} tools, one shortcut — press Ctrl/⌘+K to jump to any of them.',

  // Command palette (Ctrl/⌘+K)
  'palette.dialogLabel': 'Command palette',
  'palette.placeholder': 'Jump to a tool…',
  'palette.searchLabel': 'Search tools',
  'palette.empty': 'No tools match your search.',
  'palette.hintNav': 'Navigate',
  'palette.hintSelect': 'Select',
  'palette.hintClose': 'Close',

  // Tool changelog
  'tools.updatedBadge': 'Updated {date}',
  'changelog.metaTitle': 'Changelog',

  // Language switcher
  'lang.switcherLabel': 'Language',

  // Blog
  'blog.metaTitle': 'Blog',
  'blog.metaDescription': 'Notes on DevOps tooling, observability, and the gaps worth filling.',
  'blog.eyebrow': 'Writing',
  'blog.indexTitle': 'Notes from the canopy.',
  'blog.indexLead':
    'Observations on DevOps tooling, observability, and the small gaps in the ecosystem worth filling — written for the engineers who hit them.',
  'blog.countSuffixSingular': 'post and counting.',
  'blog.countSuffixPlural': 'posts and counting.',
  'blog.emptyEyebrow': 'Notes',
  'blog.emptyTitle': 'Nothing here right now.',
  'blog.emptyBody': 'New notes are on the way. In the meantime, explore the tools.',
  'blog.emptyCta': 'Browse the Tools',
  'blog.readPost': 'Read post',
  'blog.allPosts': 'All posts',
  'blog.notTranslated': 'This post is not available in your language yet — showing it in English.',
  'blog.readingTime': '{minutes} min read',
  'blog.updatedOn': 'Last updated {date}',
  'blog.breadcrumbHome': 'Home',
  'blog.breadcrumbBlog': 'Blog',
  'blog.breadcrumbAriaLabel': 'Breadcrumb',
  'blog.relatedTitle': 'Related posts',
  'blog.ctaEyebrow': 'Try it live',
  'blog.ctaLead': 'This post pairs with a free, browser-based tool.',
  'blog.ctaButton': 'Open {name}',

  // Prev/next pager
  'blog.pagerAriaLabel': 'Post navigation',
  'blog.prevPost': 'Previous',
  'blog.nextPost': 'Next',

  // Code copy (progressive enhancement)
  'blog.copyCode': 'Copy',
  'blog.copiedCode': 'Copied',
  'blog.copyCodeAriaLabel': 'Copy code to clipboard',

  // Post detail: table of contents, share, back-to-top
  'blog.tocTitle': 'On this page',
  'blog.shareTitle': 'Share',
  'blog.shareX': 'Share on X',
  'blog.shareLinkedIn': 'Share on LinkedIn',
  'blog.copyLink': 'Copy link',
  'blog.linkCopied': 'Link copied',
  'blog.backToTop': 'Back to top',
  'blog.headingAnchorLabel': 'Link to this section',

  // Tag pages
  'blog.tagEyebrow': 'Tag',
  'blog.tagTitle': 'Posts tagged “{tag}”',
  'blog.tagLead': 'Every post filed under “{tag}”, newest first.',
  'blog.tagCountSingular': 'post.',
  'blog.tagCountPlural': 'posts.',

  // Category filter labels (key = stable English category name)
  'category.Networking': 'Networking',
  'category.Security': 'Security',
  'category.Encoding': 'Encoding',
  'category.Kubernetes': 'Kubernetes',
  'category.Observability': 'Observability',
  'category.CI/CD': 'CI/CD',
  'category.Scheduling': 'Scheduling',
  'category.Logs': 'Logs',
  'category.Config': 'Config',
  'category.Docker': 'Docker',
  'category.all': 'All',

  // Tool catalog (/tools) — chrome shared by ToolCard + the catalog page
  'tools.badgeLive': 'Live',
  'tools.tryLabel': 'Try:',
  'tools.openTool': 'Open tool',
  'tools.availableNow': 'Available now',
  'tools.pinAdd': 'Pin this tool',
  'tools.pinRemove': 'Unpin this tool',
  'tools.pinLabel': 'Pin',
  'tools.pinnedLabel': 'Pinned',
  'tools.yourTools': 'Your tools',
  'tools.jumpBackIn': 'Jump back in',
  'tools.jumpBackInCaption': 'Pinned and recently used tools — saved only in this browser.',

  // Tool page breadcrumb trail
  'breadcrumb.home': 'Home',
  'breadcrumb.tools': 'Tools',
  'breadcrumb.allTools': 'All tools',
  'tools.liveToolsHeading': 'Live tools.',
  'tools.clientSideBadge': '100% client-side',
  'tools.browseByCategory': 'Browse by category',
  'tools.searchPlaceholder': 'Search tools…',
  'tools.searchLabel': 'Search tools',
  'tools.filterLabel': 'Filter by category',
  'tools.sortLabel': 'Sort',
  'tools.sortAriaLabel': 'Sort tools',
  'tools.sortDefault': 'Default',
  'tools.sortAZ': 'A–Z',
  'tools.sortNewest': 'Newest',
  'tools.emptyTitle': 'No tools match {query}.',
  'tools.emptyQueryFallback': 'your search',
  'tools.emptyHint': 'Try one of these, or clear the filters to see everything.',
  'tools.clearFilters': 'Clear filters',
  'tools.zeroLiveTitle': 'Nothing live just yet.',
  'tools.zeroLiveBody': 'The first tool is being polished to ship — check back soon to see what is coming.',

  // Site search (/search)
  'search.title': 'Search — OpsCanopy',
  'search.metaDescription': 'Search every OpsCanopy tool, guide, and blog post.',
  'search.ariaLabel': 'Site search',
  'search.eyebrow': 'Search',
  'search.heading': 'Search OpsCanopy',
  'search.lead':
    'Every tool, guide, and blog post on the site — searched entirely in your browser. Nothing you type leaves this page.',
  'search.inputLabel': 'Search the site',
  'search.placeholder': 'subnet, cron, docker compose…',
  'search.hint': 'Results update as you type — press Enter to run now.',
  'search.initialEmptyPrefix': 'Type to search tools, guides, and blog posts — try',
  'search.exampleOr': 'or',
  'search.noscriptPrefix': 'Search runs entirely in your browser — enable JavaScript to use it, or',
  'search.noscriptLink': 'browse the full tool catalog',
  'search.unavailablePrefix':
    'Search is not available here — the index is generated when the site is built, so it is missing in this preview.',
  'search.unavailableToolsLink': 'Browse all tools',
  'search.unavailableMiddle': 'or the',
  'search.unavailableBlogLink': 'blog',
  'search.unavailableSuffix': 'instead.',
  'search.noResultsPrefix': 'No matches for “{term}”.',
  'search.noResultsTips': 'Shorter, simpler terms work best — tool names, protocols, or the exact error string.',
  'search.noResultsCoverage': 'Search covers the English pages of the site.',
  'search.resultsForSingular': '{n} result for “{term}”',
  'search.resultsForPlural': '{n} results for “{term}”',
  'search.showMoreResults': 'Show more results',
  'search.showMoreResultsCount': 'Show more results ({n})',
  'search.statusNoResults': 'No results.',
  'search.statusResultsSingular': '{n} result.',
  'search.statusResultsPlural': '{n} results.',
  'search.statusUnavailable': 'Search is not available in this preview.',
} as const;

export type UiKey = keyof typeof en;
export type UiDict = Record<UiKey, string>;

export default en;
