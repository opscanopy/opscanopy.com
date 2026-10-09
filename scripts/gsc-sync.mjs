// Google Search Console sync — the two things Google lets a plain site do by API.
//
//   node scripts/gsc-sync.mjs sitemaps [--submit] [--force]
//       List the sitemaps registered on the property with Google's last fetch,
//       pending state, error/warning counts and submitted vs indexed counts.
//       --submit re-submits sitemap-index.xml when Google last took it before
//       the live index's <lastmod>; --force re-submits regardless.
//
//   node scripts/gsc-sync.mjs inspect [--newest N] [--since YYYY-MM-DD]
//                                      [--paths /a/ /b/ …] [--out FILE]
//       Inspect URLs from the LIVE sitemap (newest first, English content pages
//       before hubs before localized copies) and print the ranked list of URLs
//       to "Request indexing" in the UI — there is no API for that step, and
//       the UI button allows about ten a day. Default N is 40, so a run stays
//       far under the 2,000/day inspection quota.
//
//   node scripts/gsc-sync.mjs all [--submit] [--newest N] [--out FILE]
//       Both, in that order (what the gsc-sync workflow runs).
//
//   --soft   exit 0 on missing credentials or API failure (deploy-chain use:
//            a sitemap ping must never fail a deploy).
//
// Auth: scripts/google-sa.mjs — GCP_SA_KEY (CI secret) or GCP_SA_KEY_FILE (local
// path under .secrets/). The service account needs **Full** property access for
// URL inspection; sitemap submission needs Owner or Full. Both are read from
// GSC_SITE_URL (default sc-domain:opscanopy.com).
//
// What this deliberately does not do: call the Indexing API. Google restricts
// it to JobPosting / BroadcastEvent pages; using it for ordinary pages is
// against its terms and has had properties' access revoked.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { loadServiceAccount, accessToken, loadEnvFile } from './google-sa.mjs';
import { parseSitemap, selectUrls, sitemapDecision, summarize } from './gsc-sync-core.mjs';

const args = process.argv.slice(2);
const cmd = args.find((a) => !a.startsWith('-')) ?? 'all';
const has = (f) => args.includes(f);
const val = (f, d) => {
  const i = args.indexOf(f);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};
const list = (f) => {
  const i = args.indexOf(f);
  if (i === -1) return [];
  const out = [];
  for (let j = i + 1; j < args.length && !args[j].startsWith('--'); j++) out.push(args[j]);
  return out;
};

const SOFT = has('--soft');
loadEnvFile(); // before GSC_SITE_URL is read
const SITE_URL = process.env.GSC_SITE_URL ?? 'sc-domain:opscanopy.com';
const ORIGIN = SITE_URL.startsWith('sc-domain:')
  ? `https://${SITE_URL.slice('sc-domain:'.length)}`
  : SITE_URL.replace(/\/$/, '');
const FEED = `${ORIGIN}/sitemap-index.xml`;
const API = 'https://www.googleapis.com/webmasters/v3';

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(SOFT ? 0 : code);
}

const { sa, reason } = loadServiceAccount();
if (!sa) fail(`gsc-sync: ${reason} — skipping.`);

let token;
try {
  token = await accessToken(sa, ['https://www.googleapis.com/auth/webmasters']);
} catch (err) {
  fail(`gsc-sync: ${err.message}`);
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${method} ${url}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

async function liveSitemap() {
  const idx = await (await fetch(FEED)).text();
  const indexLastmod = idx.match(/<lastmod>(.*?)<\/lastmod>/)?.[1]?.slice(0, 10) ?? null;
  const children = [...idx.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1].trim());
  const rows = [];
  for (const child of children) rows.push(...parseSitemap(await (await fetch(child)).text()));
  return { indexLastmod, rows };
}

const out = [];
const say = (s = '') => {
  out.push(s);
  console.log(s);
};

// ── sitemaps ─────────────────────────────────────────────────────────────────
async function sitemaps() {
  const site = encodeURIComponent(SITE_URL);
  const { sitemap: remote = [] } = await api('GET', `${API}/sites/${site}/sitemaps`);
  const { indexLastmod } = await liveSitemap();

  say(`## Sitemaps on ${SITE_URL}`);
  say('');
  say(`Live sitemap-index.xml lastmod: ${indexLastmod ?? 'none'}`);
  say('');
  say('| Sitemap | Last submitted | Last downloaded | Pending | Errors | Warnings | Submitted → indexed |');
  say('|---|---|---|---|---|---|---|');
  for (const s of remote) {
    const c = (s.contents ?? []).map((x) => `${x.type} ${x.submitted}→${x.indexed ?? '?'}`).join(', ');
    say(
      `| ${s.path} | ${(s.lastSubmitted ?? '').slice(0, 10) || '—'} | ${(s.lastDownloaded ?? '').slice(0, 10) || '—'} | ${s.isPending ? 'yes' : 'no'} | ${s.errors ?? 0} | ${s.warnings ?? 0} | ${c || '—'} |`,
    );
  }
  if (!remote.length) say('| _none registered_ | | | | | | |');
  say('');

  const decision = sitemapDecision(remote, { feedpath: FEED, localLastmod: indexLastmod, force: has('--force') });
  if (!has('--submit') && !has('--force')) {
    say(`Decision without --submit: would ${decision.submit ? 'SUBMIT' : 'skip'} (${decision.reason}).`);
  } else if (decision.submit) {
    await api('PUT', `${API}/sites/${site}/sitemaps/${encodeURIComponent(FEED)}`);
    say(`Submitted ${FEED} (${decision.reason}).`);
  } else {
    say(`Not submitted: ${decision.reason}.`);
  }
  say('');
}

// ── inspect ──────────────────────────────────────────────────────────────────
async function inspectOne(url) {
  const r = await api('POST', 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    inspectionUrl: url,
    siteUrl: SITE_URL,
    languageCode: 'en-US',
  });
  const s = r.inspectionResult?.indexStatusResult ?? {};
  return {
    verdict: s.verdict ?? '?',
    coverageState: s.coverageState ?? '?',
    robotsTxtState: s.robotsTxtState ?? '?',
    lastCrawlTime: s.lastCrawlTime ? s.lastCrawlTime.slice(0, 10) : 'never',
    googleCanonical: s.googleCanonical ?? '',
    userCanonical: s.userCanonical ?? '',
  };
}

async function inspect() {
  const { rows } = await liveSitemap();
  const picked = selectUrls(
    rows,
    { since: val('--since'), limit: Number(val('--newest', 40)), paths: list('--paths') },
    ORIGIN,
  );
  console.error(`Inspecting ${picked.length} of ${rows.length} sitemap URLs…`);
  const results = [];
  for (const { loc, lastmod } of picked) {
    try {
      results.push({ url: loc, lastmod, ...(await inspectOne(loc)) });
    } catch (err) {
      // A 401/403 on the first call is a permissions problem — stop rather than
      // burn quota on N-1 identical failures.
      if (/HTTP 40[13]/.test(err.message) && results.length === 0) {
        fail(`gsc-sync: URL inspection refused — the service account needs Full access on ${SITE_URL}. ${err.message}`);
      }
      results.push({ url: loc, lastmod, verdict: 'ERROR', coverageState: err.message, robotsTxtState: '?', lastCrawlTime: '?', googleCanonical: '', userCanonical: '' });
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  const s = summarize(results, { uiQuota: Number(val('--ui-quota', 10)) });
  say(s.markdown);
  return s;
}

// ── run ──────────────────────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);
try {
  say(`# Search Console sync — ${today}`);
  say('');
  if (cmd === 'sitemaps' || cmd === 'all') await sitemaps();
  if (cmd === 'inspect' || cmd === 'all') await inspect();
  if (!['sitemaps', 'inspect', 'all'].includes(cmd)) fail(`Unknown command "${cmd}". Use sitemaps | inspect | all.`, 2);
} catch (err) {
  fail(`gsc-sync: ${err.message}`);
}

const outFile = val('--out');
if (outFile) {
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, out.join('\n') + '\n');
  console.error(`Wrote ${outFile}`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  await writeFile(process.env.GITHUB_STEP_SUMMARY, out.join('\n') + '\n', { flag: 'a' });
}
