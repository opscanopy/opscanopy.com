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

  // Footer
  'footer.copyright': 'Free & open.',
  'footer.builtBy': 'Built by',
  'footer.disclaimer.lead': 'Not affiliated with or endorsed by Grafana Labs.',
  'footer.disclaimer.trademark': 'and',
  'footer.disclaimer.tail': 'are trademarks of Raintank, Inc.',

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
} as const;

export type UiKey = keyof typeof en;
export type UiDict = Record<UiKey, string>;

export default en;
