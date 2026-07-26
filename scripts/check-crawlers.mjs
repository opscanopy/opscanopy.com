// Post-deploy reachability probe for search and AI crawlers.
//
// WHAT THIS CAN AND CANNOT TELL YOU — read before trusting a red result.
//
// Cloudflare verifies major crawlers by source IP/ASN, not by User-Agent. A
// request from GitHub Actions claiming to be ClaudeBot is, correctly, an
// impersonator — so a 403 here does NOT prove the real crawler is blocked.
// Treating it as proof produces false alarms.
//
// What a 403 DOES prove is that the edge is willing to reject a request purely
// on its UA string, which is the fingerprint of Cloudflare AI Crawl Control
// being switched on. That is worth surfacing, because the setting is invisible
// from the repo and silently removes the site from AI assistants.
//
// The authoritative source is the per-crawler Allowed/Unsuccessful table at
// Cloudflare dashboard -> AI Crawl Control -> Security. This script is a smoke
// test around it, and it never fails the build: it reports and exits 0 unless
// a REAL user-agent (a plain browser) cannot fetch the page, which is an
// unambiguous outage.
//
//   node scripts/check-crawlers.mjs
//   SITE_URL=https://staging.example.com node scripts/check-crawlers.mjs

const SITE = process.env.SITE_URL ?? 'https://opscanopy.com';
const TIMEOUT_MS = 20_000;

const BROWSER =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const AGENTS = [
  // [label, user-agent, category]
  ['Googlebot', 'Googlebot/2.1 (+http://www.google.com/bot.html)', 'search'],
  ['bingbot', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)', 'search'],
  ['DuckDuckBot', 'DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)', 'search'],
  ['GPTBot', 'Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)', 'ai'],
  ['OAI-SearchBot', 'Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)', 'ai'],
  ['ChatGPT-User', 'ChatGPT-User/1.0; +https://openai.com/bot', 'ai'],
  ['ClaudeBot', 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)', 'ai'],
  ['Claude-User', 'Claude-User/1.0; +Claude-User@anthropic.com', 'ai'],
  ['PerplexityBot', 'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)', 'ai'],
  ['CCBot', 'Mozilla/5.0 (compatible; CCBot/2.0; +https://commoncrawl.org/faq/)', 'ai'],
];

async function probe(ua) {
  const ctl = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const res = await fetch(SITE, { headers: { 'User-Agent': ua }, signal: ctl, redirect: 'follow' });
    return res.status;
  } catch (err) {
    return `ERR ${err.name}`;
  }
}

console.log(`Crawler reachability probe — ${SITE}\n`);

const browserStatus = await probe(BROWSER);
console.log(`  ${String(browserStatus).padEnd(6)} browser (control)`);

if (browserStatus !== 200) {
  console.error(`\nFAIL: a normal browser cannot fetch ${SITE} (got ${browserStatus}).`);
  console.error('This is a real outage, not a crawler-policy question.');
  process.exit(1);
}

const blockedAi = [];
const blockedSearch = [];

for (const [label, ua, kind] of AGENTS) {
  const status = await probe(ua);
  console.log(`  ${String(status).padEnd(6)} ${label}`);
  if (status !== 200) (kind === 'ai' ? blockedAi : blockedSearch).push(label);
}

console.log('');

if (blockedSearch.length) {
  console.warn(
    `WARNING: classic search crawlers rejected by UA: ${blockedSearch.join(', ')}.\n` +
      '  These are normally allowed even for unverified IPs. Check Cloudflare\n' +
      '  Security -> WAF and Bot Fight Mode.',
  );
}

if (blockedAi.length) {
  console.warn(
    `NOTE: ${blockedAi.length} AI agent UA(s) rejected: ${blockedAi.join(', ')}.\n` +
      '  Not conclusive — this runner is not a verified crawler IP, so a 403 is\n' +
      '  the correct response to a spoofed UA. Confirm in the Cloudflare dashboard:\n' +
      '  AI Crawl Control -> Security -> per-crawler Allowed/Unsuccessful counts.\n' +
      '  Real blocking looks like: Block toggle on, Allowed at or near 0.',
  );
} else {
  console.log('All probed AI agent UAs were served — no edge UA-blocking detected.');
}

// Never fail the deploy on a crawler-policy signal; the control request passed.
process.exit(0);
