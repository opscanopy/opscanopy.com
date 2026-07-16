/**
 * /rss.xml — RSS 2.0 feed for the OpsCanopy blog (English posts only).
 *
 * Hand-rolled XML — no external dependency. Sources posts via the same
 * getPostsForLocale('en') helper used by src/pages/blog/index.astro so
 * filtering, sorting (newest first), and slug derivation are identical.
 */
import { site } from '../data/site';
import { getPostsForLocale } from '../i18n/blog';

export const prerender = true;

/** Escape the five XML special characters in a string. */
function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Format a Date as an RFC-822 pubDate string required by RSS 2.0. */
function rfc822(date: Date): string {
  return date.toUTCString();
}

export async function GET(): Promise<Response> {
  // Mirror getPostsForLocale('en') — filters to en locale, sorts newest first.
  const posts = await getPostsForLocale('en');

  const items = posts
    .map((post) => {
      // Trailing slash = the canonical form (guid changes with it — a one-time
      // re-display in readers, accepted while the feed audience is small).
      const link = `${site.url}/blog/${post.slug}/`;
      const title = escapeXml(post.entry.data.title);
      const description = escapeXml(post.entry.data.description ?? '');
      const pubDate = rfc822(post.entry.data.pubDate);
      return `    <item>
      <title>${title}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <description>${description}</description>
      <pubDate>${pubDate}</pubDate>
    </item>`;
    })
    .join('\n');

  const channelTitle = escapeXml(`${site.name} Blog`);
  const channelLink = `${site.url}/blog/`;
  const channelDescription = escapeXml(
    'DevOps articles, guides, and tutorials from the OpsCanopy team — delivered right to your reader.',
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${channelTitle}</title>
    <link>${channelLink}</link>
    <description>${channelDescription}</description>
    <language>en</language>
    <atom:link href="${site.url}/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
