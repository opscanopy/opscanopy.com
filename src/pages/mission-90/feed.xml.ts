/**
 * /mission-90/feed.xml — RSS 2.0 feed for the Mission 90 Days DevOps program.
 *
 * Hand-rolled XML — no external dependency, mirroring src/pages/rss.xml.ts.
 * Enumerates LIVE day lessons the same way src/pages/mission-90/day/[day].astro
 * does — getCollection('mission90Days', ({ data }) => !data.draft) — sorted by
 * day ascending. One <item> per published day. At launch only Day 1 is live, so
 * the feed carries a single item; it grows as more days go live.
 */
import { getCollection } from 'astro:content';
import { site } from '../../data/site';

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
  // Mirror day/[day].astro — non-draft entries are the live days. Sort ascending.
  const days = (await getCollection('mission90Days', ({ data }) => !data.draft)).sort(
    (a, b) => a.data.day - b.data.day,
  );

  const items = days
    .map((entry) => {
      const d = entry.data;
      const link = `${site.url}/mission-90/day/${d.day}/`;
      const title = escapeXml(d.title);
      const description = escapeXml(d.description);
      // updatedDate is optional in the schema; fall back to the program's
      // reference date so rfc822() never yields "Invalid Date"
      // (matches day/[day].astro's isoPublished fallback).
      const pubDate = rfc822(d.updatedDate ?? new Date('2026-07-05'));
      return `    <item>
      <title>${title}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <description>${description}</description>
      <pubDate>${pubDate}</pubDate>
    </item>`;
    })
    .join('\n');

  const channelTitle = escapeXml('Mission 90 Days DevOps');
  const channelLink = `${site.url}/mission-90/`;
  const channelDescription = escapeXml(
    'A free 90-day guided DevOps program from OpsCanopy — one focused lesson a day, from Linux fundamentals to production-ready platform skills.',
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${channelTitle}</title>
    <link>${channelLink}</link>
    <description>${channelDescription}</description>
    <language>en</language>
    <atom:link href="${site.url}/mission-90/feed.xml" rel="self" type="application/rss+xml" />
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
