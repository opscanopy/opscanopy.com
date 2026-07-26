/**
 * /robots.txt — crawler policy, generated rather than static.
 *
 * Replaces the hand-written public/robots.txt so the Sitemap and feed URLs are
 * derived from `site.url` and can never drift from the real routes.
 *
 * On the AI-crawler allowlist: OpsCanopy's whole value is being the answer when
 * a developer asks an assistant "how do I decode a JWT / read this PromQL /
 * split this subnet". Being crawlable by assistants is the distribution channel,
 * not a cost — so every documented AI agent is explicitly allowed rather than
 * left to the wildcard.
 *
 * Note this file cannot un-block anything Cloudflare blocks at the edge. AI
 * Crawl Control sits ABOVE robots.txt: it can 403 a crawler that this file
 * welcomes. The per-crawler toggles in the Cloudflare dashboard are the real
 * gate; this states intent for crawlers that read it and for the ones Cloudflare
 * doesn't recognise.
 */
import { site } from '../data/site';

export const prerender = true;

/**
 * Agents given an explicit Allow. Grouped only for readability — the emitted
 * directives are identical for every entry.
 */
const AI_AGENTS = [
  // OpenAI — GPTBot trains + grounds, OAI-SearchBot builds the ChatGPT Search
  // index, ChatGPT-User is a live fetch when a user follows a link in a chat.
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  // Anthropic — same three roles.
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'anthropic-ai',
  // Perplexity — index crawler + live user fetch.
  'PerplexityBot',
  'Perplexity-User',
  // Google/Apple AI surfaces. These are separate from Googlebot/Applebot:
  // disallowing them removes the site from AI answers while keeping normal
  // search indexing, which is the opposite of what we want.
  'Google-Extended',
  'Applebot-Extended',
  // Others that respect robots.txt.
  'CCBot',
  'meta-externalagent',
  'Amazonbot',
  'Bytespider',
  'Diffbot',
  'cohere-ai',
  'YouBot',
];

export function GET(): Response {
  const lines: string[] = [
    '# OpsCanopy — every tool runs client-side; there is nothing here worth hiding.',
    '',
    'User-agent: *',
    'Allow: /',
    '',
    '# Utility routes with no standalone search value. They are already noindex;',
    '# excluding them here just saves crawl budget on a 445-URL site.',
    'Disallow: /search',
    'Disallow: /*/search',
    'Disallow: /alertlint-wasm-demo',
    'Disallow: /offline',
    '',
    '# ── AI assistants: explicitly welcome ──────────────────────────────────',
    '# Being cited by an assistant is how developers find these tools. Allowed',
    '# individually so that a future wildcard-tightening cannot silently drop them.',
    '',
  ];

  for (const agent of AI_AGENTS) {
    lines.push(`User-agent: ${agent}`, 'Allow: /', '');
  }

  lines.push(
    `Sitemap: ${site.url}/sitemap-index.xml`,
    '',
    `# Feeds`,
    `# ${site.url}/rss.xml — blog`,
    `# ${site.url}/mission-90/feed.xml — Mission: 90 Days DevOps`,
    '',
  );

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
