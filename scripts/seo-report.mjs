// Weekly Search Console + GA4 report, written to reports/seo/<date>.md.
//
// This is the feedback loop the whole content strategy runs on. Without query
// data every content decision is a guess; with it, the highest-ROI work is
// simply "the queries where we already rank 11-20".
//
// Auth: one Google Cloud service account, used for both APIs.
//   GCP_SA_KEY         the service-account JSON, verbatim (whole file)
//   GSC_SITE_URL       e.g. "sc-domain:opscanopy.com" or "https://opscanopy.com/"
//   GA4_PROPERTY_ID    numeric property id (NOT the G-XXXX measurement id)
//
// The service account must ALSO be granted access in each product — creating
// the key is not enough:
//   Search Console -> Settings -> Users and permissions -> add client_email (Full)
//   GA4 -> Admin -> Property Access Management -> add client_email (Viewer)
//
// GA4 is optional: if GA4_PROPERTY_ID is unset the report is built from GSC
// alone rather than failing.
//
// Zero dependencies — the service-account JWT is signed with node:crypto and
// exchanged for an access token directly, avoiding googleapis (~50MB) for what
// is two POSTs.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createSign } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = process.env.GSC_SITE_URL ?? 'sc-domain:opscanopy.com';
const GA4_PROPERTY = process.env.GA4_PROPERTY_ID;
const SA_RAW = process.env.GCP_SA_KEY;

// Report window. GSC data lags ~2 days, so end the window there rather than
// today — otherwise the most recent days read as a fake traffic collapse.
const LAG_DAYS = 2;
const WINDOW_DAYS = 28;

if (!SA_RAW) {
  console.error('GCP_SA_KEY is not set — cannot query Search Console.');
  process.exit(1);
}

let sa;
try {
  sa = JSON.parse(SA_RAW);
} catch {
  console.error('GCP_SA_KEY is not valid JSON. Paste the whole service-account file.');
  process.exit(1);
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

async function getAccessToken(scopes) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: scopes.join(' '),
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const signature = signer.sign(sa.private_key, 'base64url');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${signature}`,
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed (HTTP ${res.status}): ${await res.text()}`);
  }
  return (await res.json()).access_token;
}

function isoDay(offsetDays) {
  const d = new Date(Date.now() - offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const endDate = isoDay(LAG_DAYS);
const startDate = isoDay(LAG_DAYS + WINDOW_DAYS);
const prevEnd = isoDay(LAG_DAYS + WINDOW_DAYS + 1);
const prevStart = isoDay(LAG_DAYS + WINDOW_DAYS * 2 + 1);

// ── Search Console ────────────────────────────────────────────────────────────
const token = await getAccessToken(['https://www.googleapis.com/auth/webmasters.readonly']);

async function gsc(body) {
  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 403) {
      throw new Error(
        `GSC returned 403 for ${SITE_URL}. The service account (${sa.client_email}) ` +
          'is probably not added as a user on the property, or GSC_SITE_URL does not ' +
          `match how the property is verified. Response: ${text}`,
      );
    }
    throw new Error(`GSC query failed (HTTP ${res.status}): ${text}`);
  }
  return (await res.json()).rows ?? [];
}

const [queries, pages, totalsNow, totalsPrev] = await Promise.all([
  gsc({ startDate, endDate, dimensions: ['query'], rowLimit: 500 }),
  gsc({ startDate, endDate, dimensions: ['page'], rowLimit: 500 }),
  gsc({ startDate, endDate, rowLimit: 1 }),
  gsc({ startDate: prevStart, endDate: prevEnd, rowLimit: 1 }),
]);

// ── GA4 (optional) ────────────────────────────────────────────────────────────
let ga4 = null;
if (GA4_PROPERTY) {
  try {
    const gaToken = await getAccessToken([
      'https://www.googleapis.com/auth/analytics.readonly',
    ]);
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY}:runReport`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${gaToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: 'sessionSource' }],
          metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
          limit: 25,
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        }),
      },
    );
    if (res.ok) ga4 = await res.json();
    else console.warn(`GA4 query failed (HTTP ${res.status}) — continuing without it.`);
  } catch (err) {
    console.warn(`GA4 unavailable (${err.message}) — continuing without it.`);
  }
}

// ── Analysis ──────────────────────────────────────────────────────────────────
const n = (v) => Math.round((v ?? 0) * 10) / 10;
const pct = (v) => `${(v * 100).toFixed(1)}%`;

const now = totalsNow[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
const prev = totalsPrev[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
const delta = (a, b) => (b ? `${a - b >= 0 ? '+' : ''}${Math.round(((a - b) / b) * 100)}%` : 'n/a');

/**
 * Striking distance: ranking 11-20 with real impression volume. These are the
 * cheapest wins available — the page already ranks, it just needs to be better
 * than the handful of results above it. Everything in the content plan should
 * start here rather than from a keyword tool.
 */
const striking = queries
  .filter((r) => r.position > 10 && r.position <= 20 && r.impressions >= 20)
  .sort((a, b) => b.impressions - a.impressions)
  .slice(0, 40);

/** Ranked well but barely clicked — a title/description problem, not a content one. */
const poorCtr = queries
  .filter((r) => r.position <= 10 && r.impressions >= 50 && r.ctr < 0.02)
  .sort((a, b) => b.impressions - a.impressions)
  .slice(0, 25);

/** Already on page one — protect these. */
const winning = queries
  .filter((r) => r.position <= 10)
  .sort((a, b) => b.clicks - a.clicks)
  .slice(0, 25);

const topPages = [...pages].sort((a, b) => b.clicks - a.clicks).slice(0, 25);

// Indexed-but-invisible: in the sitemap, zero impressions in the window.
let zeroImpression = [];
try {
  const xml = await readFile(join(ROOT, 'dist', 'sitemap-0.xml'), 'utf8');
  const all = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1].trim());
  const seen = new Set(pages.map((r) => r.keys[0].replace(/\/$/, '')));
  zeroImpression = all.filter((u) => !seen.has(u.replace(/\/$/, '')));
} catch {
  // No local build in this job — skip the section rather than fail.
}

// ── Render ────────────────────────────────────────────────────────────────────
const table = (rows, cols) =>
  [
    `| ${cols.map((c) => c[0]).join(' | ')} |`,
    `|${cols.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${cols.map((c) => c[1](r)).join(' | ')} |`),
  ].join('\n');

const queryCols = [
  ['Query', (r) => r.keys[0]],
  ['Impr.', (r) => r.impressions],
  ['Clicks', (r) => r.clicks],
  ['CTR', (r) => pct(r.ctr)],
  ['Pos.', (r) => n(r.position)],
];

const md = `# SEO report — ${endDate}

Window: **${startDate} → ${endDate}** (${WINDOW_DAYS} days, ending ${LAG_DAYS} days back
because Search Console data lags). Compared against the ${WINDOW_DAYS} days before that.

## Totals

| Metric | This window | Previous | Change |
|---|---|---|---|
| Clicks | ${now.clicks} | ${prev.clicks} | ${delta(now.clicks, prev.clicks)} |
| Impressions | ${now.impressions} | ${prev.impressions} | ${delta(now.impressions, prev.impressions)} |
| CTR | ${pct(now.ctr)} | ${pct(prev.ctr)} | — |
| Avg position | ${n(now.position)} | ${n(prev.position)} | — |

## Striking distance — position 11-20 (${striking.length})

The highest-ROI work on the site. Each of these already ranks; it needs a better
answer on the page it ranks with, not a new page.

${striking.length ? table(striking, queryCols) : '_Nothing in range yet. Normal for a new domain — impressions have to build first._'}

## Ranked but not clicked — CTR under 2% on page one (${poorCtr.length})

A title and meta-description problem. The page is being shown and passed over.

${poorCtr.length ? table(poorCtr, queryCols) : '_None._'}

## Winning queries — page one by clicks (${winning.length})

${winning.length ? table(winning, queryCols) : '_None yet._'}

## Top pages by clicks

${
  topPages.length
    ? table(topPages, [
        ['Page', (r) => r.keys[0]],
        ['Impr.', (r) => r.impressions],
        ['Clicks', (r) => r.clicks],
        ['CTR', (r) => pct(r.ctr)],
        ['Pos.', (r) => n(r.position)],
      ])
    : '_None yet._'
}

## Sitemap URLs with zero impressions (${zeroImpression.length})

Live and submitted, but never shown for any query in the window. On a young
domain most of these are simply not crawled yet; persistent entries are the ones
worth investigating.

${
  zeroImpression.length
    ? '<details><summary>Show all</summary>\n\n' +
      zeroImpression.map((u) => `- ${u}`).join('\n') +
      '\n\n</details>'
    : '_Every sitemap URL drew at least one impression._'
}

${
  ga4
    ? `## GA4 — sessions by source

${table(
  (ga4.rows ?? []).map((r) => ({
    src: r.dimensionValues[0].value,
    sessions: r.metricValues[0].value,
    users: r.metricValues[1].value,
  })),
  [
    ['Source', (r) => r.src],
    ['Sessions', (r) => r.sessions],
    ['Users', (r) => r.users],
  ],
)}

AI-assistant referrals to watch for here: \`chatgpt.com\`, \`perplexity.ai\`, \`claude.ai\`.`
    : '_GA4 not configured (set GA4_PROPERTY_ID) — Search Console data only._'
}

---
_Generated by scripts/seo-report.mjs._
`;

const outDir = join(ROOT, 'reports', 'seo');
await mkdir(outDir, { recursive: true });
const outPath = join(outDir, `${endDate}.md`);
await writeFile(outPath, md, 'utf8');

console.log(`Wrote ${outPath}`);
console.log(
  `${now.clicks} clicks / ${now.impressions} impressions · ` +
    `${striking.length} striking-distance queries · ${poorCtr.length} low-CTR queries`,
);

// Surface the headline numbers to the workflow summary.
if (process.env.GITHUB_STEP_SUMMARY) {
  const top = striking
    .slice(0, 10)
    .map((r) => `- \`${r.keys[0]}\` — pos ${n(r.position)}, ${r.impressions} impr.`)
    .join('\n');
  await writeFile(
    process.env.GITHUB_STEP_SUMMARY,
    `## SEO report ${endDate}\n\n` +
      `**${now.clicks}** clicks (${delta(now.clicks, prev.clicks)}), ` +
      `**${now.impressions}** impressions (${delta(now.impressions, prev.impressions)})\n\n` +
      (top ? `### Striking distance\n${top}\n` : ''),
    { flag: 'a' },
  );
}
