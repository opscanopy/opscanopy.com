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
