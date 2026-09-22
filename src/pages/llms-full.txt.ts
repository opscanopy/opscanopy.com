/**
 * /llms-full.txt — the whole site as one plain-Markdown document.
 *
 * `/llms.txt` is a map (titles and links); this is the territory. An assistant
 * that fetches this file has the full prose of every guide and blog post, the
 * complete About / Security / Privacy pages, and a record for every tool — no
 * crawl required, and no JavaScript, which matters because AI crawlers do not
 * execute it.
 *
 * Generated from the same registries and content collections the site renders
 * from, so it cannot drift. English only, deliberately: the localized trees
 * are translations of this same content.
 *
 * Tool FAQs come from src/data/tool-faqs (the registry every tool page renders
 * from since 2026-09-22). KNOWN GAP: each page's "why this exists" prose is
 * still inline markup in src/pages/<slug>.astro and is not reachable here.
 */
import { site } from '../data/site';
import { liveTools, categoryToSlug } from '../data/tools';
import { getToolUpdatedAt } from '../data/tool-meta';
import { toolFaqs } from '../data/tool-faqs';
import { tracks } from '../data/learn';
import { roadmaps } from '../data/roadmaps';
import { program, liveDays } from '../data/mission90';
import { getPostsForLocale } from '../i18n/blog';
import { getGuidesForLocale } from '../lib/learn/guides';
import pages from '../i18n/pages/en';
import type { PageDoc } from '../i18n/pages/en';
import { SITE_INTRO } from './llms.txt';

export const prerender = true;

/** One of the static info pages, rendered as Markdown sections. */
function pageDoc(doc: PageDoc, url: string): string[] {
  const out: string[] = ['', `## ${doc.heading}`, '', `Source: ${url}`, '', doc.lead, ''];
  for (const section of doc.sections) {
    out.push(`### ${section.heading}`, '');
    for (const paragraph of section.body) out.push(paragraph, '');
  }
  return out;
}

/**
 * Markdown bodies start with a hero image line that carries no information for
 * a reader who cannot see it; drop it and keep the prose.
 */
function stripHeroImage(body: string): string {
  return body.replace(/^\s*!\[[^\]]*\]\([^)]*\)\s*\n/, '').trim();
}

export async function GET(): Promise<Response> {
  const posts = await getPostsForLocale('en');
  const guides = await getGuidesForLocale('en');

  const out: string[] = [];
  const push = (...l: string[]): void => void out.push(...l);

  push(
    `# ${site.name} — full text`,
    '',
    `> ${site.description}`,
    '',
    ...SITE_INTRO,
    '',
    `Link map (shorter): ${site.url}/llms.txt`,
    '',
    '---',
    '',
    '# Tools',
    '',
    `${liveTools.length} tools, all client-side. Each runs in the visitor's own browser; none has a server to send input to.`,
    '',
  );

  for (const tool of liveTools) {
    const updated = getToolUpdatedAt(tool.slug);
    push(
      `## ${tool.name}`,
      '',
      `URL: ${site.url}/${tool.slug}/`,
      `Category: ${tool.category} (${site.url}/tools/${categoryToSlug(tool.category)}/)`,
      ...(updated ? [`Last updated: ${updated}`] : []),
      '',
      tool.tagline,
      '',
      tool.description,
      '',
      ...(tool.keywords?.length ? [`Also searched as: ${tool.keywords.join(', ')}.`, ''] : []),
      ...(tool.related?.length
        ? [`Related: ${tool.related.map((s) => `${site.url}/${s}/`).join(' · ')}`, '']
        : []),
    );
    const faqs = toolFaqs(tool.slug, 'en');
    if (faqs.length) {
      push('### Questions and answers', '');
      for (const f of faqs) push(`**${f.q}**`, '', f.a, '');
    }
  }

  push('---', '', '# About, security and privacy', '');
  push(...pageDoc(pages.about, `${site.url}/about/`));
  push(...pageDoc(pages.security, `${site.url}/security/`));
  push(...pageDoc(pages.privacy, `${site.url}/privacy/`));

  push('---', '', '# Guides', '');
  for (const g of guides) {
    push(
      `## ${g.entry.data.title}`,
      '',
      `URL: ${site.url}/learn/guides/${g.slug}/`,
      `Track: ${g.entry.data.track} · ${g.entry.data.difficulty}`,
      '',
      g.entry.data.description,
      '',
      stripHeroImage(g.entry.body ?? ''),
      '',
    );
  }

  push('---', '', '# Blog', '');
  for (const p of posts) {
    push(
      `## ${p.entry.data.title}`,
      '',
      `URL: ${site.url}/blog/${p.slug}/`,
      `Published: ${p.entry.data.pubDate.toISOString().slice(0, 10)}`,
      '',
      p.entry.data.description,
      '',
      stripHeroImage(p.entry.body ?? ''),
      '',
    );
  }

  push(
    '---',
    '',
    `# ${program.name}`,
    '',
    `URL: ${site.url}/mission-90/`,
    '',
    `${program.description} ${liveDays.length} days are live. Free, no signup.`,
    '',
    'Each day is a standalone lesson with its own goals; the day pages carry the full text.',
    '',
  );
  for (const d of liveDays) {
    push(
      `- Day ${d.day}: ${d.title} — ${site.url}/mission-90/day/${d.day}/ (${d.minutes} min` +
        `${d.hasMission ? ', playable mission' : ''}${d.isProjectDay ? ', project day' : ''})`,
    );
  }
  push('');

  push(
    '---',
    '',
    '# Learning tracks',
    '',
    ...tracks.map((t) => `- ${t.name}: ${site.url}/learn/#${t.slug}`),
    '',
    '# Roadmaps',
    '',
    ...roadmaps.map((r) => `- ${r.title}: ${site.url}/learn/roadmaps/${r.slug}/ — ${r.description}`),
    '',
    'Localized editions of the tools and blog exist at /de/, /es/, /fr/ and /pt-br/.',
    '',
  );

  return new Response(out.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
