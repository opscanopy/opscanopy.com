/**
 * JSON-LD builders — shared, pure helpers that emit the exact schema.org
 * structures the tool pages currently hand to Shell via the `jsonLd` prop.
 *
 * Keeping these here removes the per-page duplication of the SoftwareApplication
 * and FAQPage objects while preserving their precise content and shape.
 */
import { site } from '../data/site';

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
}): Record<string, unknown> {
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
    publisher: {
      '@type': 'Organization',
      name: site.name,
      url: site.url,
    },
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
