/**
 * JSON-LD builders — shared, pure helpers that emit the exact schema.org
 * structures the tool pages currently hand to Shell via the `jsonLd` prop.
 *
 * Keeping these here removes the per-page duplication of the SoftwareApplication
 * and FAQPage objects while preserving their precise content and shape.
 */
import { site } from '../data/site';
import { getToolUpdatedAt } from '../data/tool-meta';

const LOCALE_PREFIXES = ['de', 'es', 'fr', 'pt-br'];

/**
 * Tool slug out of an absolute page URL, locale prefix stripped.
 * "https://opscanopy.com/de/jwt-decoder/" → "jwt-decoder".
 */
function slugFromUrl(url: string): string | undefined {
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  const parts = path.split('/').filter(Boolean);
  if (!parts.length) return undefined;
  return LOCALE_PREFIXES.includes(parts[0]) ? parts[1] : parts[0];
}

/**
 * Stable @id anchors for the two sitewide entities.
 *
 * Emitting `Organization` and `WebSite` on every page as anonymous inline
 * objects tells a parser nothing — it sees hundreds of unrelated organizations
 * with the same name. Giving each a fixed @id and referencing it by @id from
 * every publisher/isPartOf slot instead declares one entity that the whole site
 * belongs to, which is what lets search and AI engines resolve "OpsCanopy" to a
 * single thing.
 */
export const ORG_ID = `${site.url}/#organization`;
export const SITE_ID = `${site.url}/#website`;

/** Reference to the sitewide Organization. Use in `publisher` / `provider`. */
export const orgRef = { '@id': ORG_ID } as const;

/**
 * The sitewide Organization node. Emitted once per page by SEO.astro.
 */
export function organizationLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG_ID,
    name: site.name,
    url: site.url,
    description: site.description,
    sameAs: [site.github, `https://x.com/${site.twitter.replace('@', '')}`],
  };
}

/**
 * The sitewide WebSite node, including the sitelinks SearchAction.
 *
 * `/search` is a real working Pagefind UI but nothing declared it, so engines
 * had no way to offer a search box for the site.
 */
export function websiteLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': SITE_ID,
    name: site.name,
    url: site.url,
    description: site.description,
    publisher: orgRef,
    inLanguage: ['en', 'de', 'es', 'fr', 'pt-BR'],
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${site.url}/search/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * SoftwareApplication object for a tool page.
 * Matches the established shape: DeveloperApplication, browser-based, free,
 * published by the site organization.
 */
export function softwareAppLd(o: {
  name: string;
  description: string;
  url: string;
  subCategory?: string;
  featureList?: string[];
  keywords?: string;
  /**
   * Override the last-modified date. Normally omitted — it is resolved from
   * the git-derived tool-meta data using the slug in `url`, so all 145 tool
   * pages (29 x 5 locales) get an accurate `dateModified` without touching a
   * single call site. The date was already rendered as ToolHero's "Updated"
   * badge but was invisible to parsers.
   */
  dateModified?: string;
}): Record<string, unknown> {
  const slug = slugFromUrl(o.url);
  const dateModified = o.dateModified ?? (slug ? getToolUpdatedAt(slug) : undefined);
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    applicationCategory: 'DeveloperApplication',
    applicationSubCategory: o.subCategory,
    operatingSystem: 'Any (browser-based)',
    url: o.url,
    name: o.name,
    description: o.description,
    featureList: o.featureList,
    keywords: o.keywords,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    isAccessibleForFree: true,
    // Reference the one sitewide Organization rather than repeating a stub, so
    // all 29 tools resolve to the same publisher entity.
    publisher: orgRef,
    isPartOf: { '@id': SITE_ID },
    ...(dateModified ? { dateModified } : {}),
  };
}

/**
 * BreadcrumbList object for a tool page's breadcrumb trail.
 * `items` is an ordered list of { name, item } where `item` is an ABSOLUTE url.
 * Positions are 1-based, in array order.
 */
export function breadcrumbLd(
  items: { name: string; item: string }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.item,
    })),
  };
}

/**
 * FAQPage object mirroring a list of rendered question/answer pairs.
 */
export function faqPageLd(faqs: { q: string; a: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.a,
      },
    })),
  };
}

/**
 * ItemList object for a page that curates an ordered set of other pages
 * (e.g. the 4 tool cards on the /verify-ai hub). `items` is 1-based by array
 * order, mirroring `breadcrumbLd`'s position convention.
 */
export function itemListLd(items: { name: string; url: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      url: it.url,
    })),
  };
}

/**
 * CollectionPage object for a page that aggregates content drawn from many
 * other pages (e.g. every Mission-90 day's interview Q&A) rather than being
 * a single article itself. Deliberately separate from faqPageLd: an
 * aggregator built from content whose SOURCE pages already emit their own
 * FAQPage-shaped structured data should not re-emit the same questions as a
 * second FAQPage — that would duplicate structured data across pages.
 */
export function collectionPageLd(o: { name: string; description: string; url: string }): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: o.name,
    description: o.description,
    url: o.url,
  };
}

/**
 * TechArticle object for a Learn guide page. Mirrors the BlogPosting shape used
 * by blog posts but typed as TechArticle (technical how-to/reference content).
 *
 * `author` (optional) swaps the default Organization author for a Person —
 * the publisher stays the site Organization. `isPartOfCourse` (optional)
 * links the article into a Course via `isPartOf`.
 */
export function techArticleLd(o: {
  headline: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified?: string;
  keywords?: string;
  proficiencyLevel?: 'Beginner' | 'Intermediate' | 'Advanced';
  author?: { name: string; url?: string };
  isPartOfCourse?: { name: string; url: string };
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: o.headline,
    description: o.description,
    proficiencyLevel: o.proficiencyLevel,
    datePublished: o.datePublished,
    dateModified: o.dateModified ?? o.datePublished,
    keywords: o.keywords,
    mainEntityOfPage: { '@type': 'WebPage', '@id': o.url },
    author: o.author
      ? { '@type': 'Person', name: o.author.name, url: o.author.url }
      : { '@type': 'Organization', name: site.name, url: site.url },
    publisher: { '@type': 'Organization', name: site.name, url: site.url },
    isPartOf: o.isPartOfCourse
      ? { '@type': 'Course', name: o.isPartOfCourse.name, '@id': o.isPartOfCourse.url }
      : undefined,
  };
}

/**
 * HowTo object for a step-by-step install/setup guide (e.g. the Mission 90
 * Day 0 lab-setup page). Each step becomes a HowToStep with a name + text.
 * `totalTime` (optional) is an ISO-8601 duration, e.g. "PT20M".
 */
export function howToLd(o: {
  name: string;
  description: string;
  url: string;
  totalTime?: string;
  steps: { name: string; text: string }[];
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: o.name,
    description: o.description,
    url: o.url,
    totalTime: o.totalTime,
    step: o.steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };
}

/**
 * Course object for a structured multi-phase program (e.g. Mission 90 Days).
 * `totalMinutes` is the TOTAL workload across the whole program, emitted as an
 * ISO-8601 duration rounded to the nearest hour (4740 → "PT79H"). Each phase
 * becomes a Syllabus section named like "Foundations (Days 1–20)".
 */
export function courseLd(
  o: { name: string; description: string; url: string },
  phases: { name: string; days: [number, number] }[],
  totalMinutes: number,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: o.name,
    description: o.description,
    url: o.url,
    provider: {
      '@type': 'Organization',
      name: site.name,
      url: site.url,
    },
    isAccessibleForFree: true,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: 'Online',
      courseWorkload: `PT${Math.round(totalMinutes / 60)}H`,
    },
    syllabusSections: phases.map((p) => ({
      '@type': 'Syllabus',
      name: `${p.name} (Days ${p.days[0]}–${p.days[1]})`,
    })),
  };
}
