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
} as const;

export type UiKey = keyof typeof en;
export type UiDict = Record<UiKey, string>;

export default en;
