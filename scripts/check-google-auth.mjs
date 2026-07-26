// Preflight for the Google service-account credentials.
//
// Creating a service-account key grants nothing on its own — the account must
// ALSO be added as a user inside Search Console and GA4. That two-step is the
// thing everyone misses, and it surfaces as an opaque 403 a week later when the
// scheduled report first runs. This checks it in ten seconds instead.
//
// Run it locally with the downloaded key file, BEFORE adding anything to GitHub.
// PREFER THE FILE PATH FORM — pass the path, never the key contents:
//
//   node scripts/check-google-auth.mjs ~/Downloads/opscanopy-seo-abc123.json
//
// Interpolating the key with $(cat …) puts the private key into your shell
// history and onto the process command line, where it is trivially recoverable
// and easy to paste somewhere public by accident. The file-path form keeps the
// secret on disk where it already is.
//
// Site and property come from the environment or from flags:
//
//   GSC_SITE_URL=sc-domain:opscanopy.com GA4_PROPERTY_ID=498372615 \
//     node scripts/check-google-auth.mjs ~/Downloads/key.json
//
// GCP_SA_KEY is still honoured for CI, where the value legitimately arrives as
// an environment variable from a secret store.
//
// GA4_PROPERTY_ID is optional. Exit 0 means Search Console is good to go.

import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const keyPathArg = process.argv.slice(2).find((a) => !a.startsWith('-'));

let SA_RAW = process.env.GCP_SA_KEY;
if (keyPathArg) {
  try {
    SA_RAW = readFileSync(keyPathArg.replace(/^~/, process.env.HOME ?? '~'), 'utf8');
  } catch (err) {
    console.error(`\nCould not read key file "${keyPathArg}": ${err.code ?? err.message}`);
    console.error('Pass the path to the .json you downloaded from Google Cloud.\n');
    process.exit(1);
  }
}

const SITE_URL = process.env.GSC_SITE_URL;
const GA4_PROPERTY = process.env.GA4_PROPERTY_ID;

const ok = (m) => console.log(`  OK    ${m}`);
const bad = (m) => console.log(`  FAIL  ${m}`);
const info = (m) => console.log(`        ${m}`);

console.log('\nGoogle credentials preflight\n');

// ── 1. Key parses ─────────────────────────────────────────────────────────────
if (!SA_RAW) {
  bad('No service-account key provided.');
  info('Pass the PATH to the downloaded .json file:');
  info('  node scripts/check-google-auth.mjs ~/Downloads/your-key.json');
  info('');
  info('Do not paste the key contents into the command — that puts the private');
  info('key in your shell history and on the process command line.');
  process.exit(1);
}

let sa;
try {
  sa = JSON.parse(SA_RAW);
} catch {
  bad('GCP_SA_KEY is not valid JSON.');
  info('It must be the entire file contents, from the opening { to the closing }.');
  process.exit(1);
}

for (const field of ['client_email', 'private_key', 'token_uri']) {
  if (!sa[field]) {
    bad(`Key is missing "${field}" — this does not look like a service-account key.`);
    info('Download the JSON from IAM & Admin -> Service Accounts -> Keys -> Add Key.');
    process.exit(1);
  }
}
ok(`Key parsed. Service account: ${sa.client_email}`);

// ── 2. Token exchange ─────────────────────────────────────────────────────────
function b64url(s) {
  return Buffer.from(s).toString('base64url');
}

async function token(scopes) {
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
  const sig = signer.sign(sa.private_key, 'base64url');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${sig}`,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error_description ?? JSON.stringify(body));
  return body.access_token;
}

let gscToken;
try {
  gscToken = await token(['https://www.googleapis.com/auth/webmasters.readonly']);
  ok('Signed a JWT and exchanged it for an access token.');
} catch (err) {
  bad(`Token exchange failed: ${err.message}`);
  info('Usually means the Search Console API is not enabled on the project.');
  info('APIs & Services -> Library -> "Google Search Console API" -> Enable.');
  process.exit(1);
}

// ── 3. Which properties can it see? ───────────────────────────────────────────
let visible = [];
try {
  const res = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites', {
    headers: { Authorization: `Bearer ${gscToken}` },
  });
  const body = await res.json().catch(() => ({}));
  visible = (body.siteEntry ?? []).map((s) => s.siteUrl);
  if (visible.length) {
    ok(`Search Console lists ${visible.length} accessible propert(y/ies):`);
    visible.forEach((s) => info(`  ${s}`));
  } else {
    bad('Search Console returned NO accessible properties.');
    info(`The service account has not been added as a user yet. Do this:`);
    info('  search.google.com/search-console -> pick the property');
    info('  -> Settings -> Users and permissions -> Add user');
    info(`  -> ${sa.client_email}  -> Permission: Full`);
    process.exit(1);
  }
} catch (err) {
  bad(`Could not list properties: ${err.message}`);
  process.exit(1);
}

// ── 4. Does GSC_SITE_URL match one of them? ───────────────────────────────────
if (!SITE_URL) {
  bad('GSC_SITE_URL is not set, so I cannot confirm which property to query.');
  info('Use one of the values listed above, verbatim.');
  process.exit(1);
}

if (!visible.includes(SITE_URL)) {
  bad(`GSC_SITE_URL "${SITE_URL}" is not in the accessible list.`);
  info('It must match one of the values above EXACTLY, including any trailing');
  info('slash. Domain properties look like sc-domain:example.com; URL-prefix');
  info('properties look like https://example.com/.');
  process.exit(1);
}
ok(`GSC_SITE_URL matches an accessible property.`);

// ── 5. A real query ───────────────────────────────────────────────────────────
const end = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
const start = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

try {
  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${gscToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: start, endDate: end, dimensions: ['query'], rowLimit: 5 }),
    },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    bad(`Query failed (HTTP ${res.status}): ${JSON.stringify(body)}`);
    process.exit(1);
  }
  const rows = body.rows ?? [];
  ok(`Query succeeded for ${start} to ${end} — ${rows.length} row(s) returned.`);
  if (rows.length) {
    info('Top queries:');
    rows.forEach((r) =>
      info(
        `  "${r.keys[0]}" — ${r.impressions} impr, ${r.clicks} clicks, pos ${r.position.toFixed(1)}`,
      ),
    );
  } else {
    info('No rows yet. Normal for a young property — impressions have to build.');
  }
} catch (err) {
  bad(`Query failed: ${err.message}`);
  process.exit(1);
}

// ── 6. GA4 (optional) ─────────────────────────────────────────────────────────
if (!GA4_PROPERTY) {
  info('');
  info('GA4_PROPERTY_ID not set — skipping the GA4 check (it is optional).');
} else if (/^G-/i.test(GA4_PROPERTY)) {
  bad(`GA4_PROPERTY_ID looks like a measurement ID ("${GA4_PROPERTY}").`);
  info('You need the numeric Property ID instead:');
  info('  analytics.google.com -> Admin -> Property Settings -> PROPERTY ID');
} else {
  try {
    const gaToken = await token(['https://www.googleapis.com/auth/analytics.readonly']);
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY}:runReport`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${gaToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateRanges: [{ startDate: start, endDate: end }],
          metrics: [{ name: 'sessions' }],
        }),
      },
    );
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      ok(`GA4 reachable — ${body.rows?.[0]?.metricValues?.[0]?.value ?? 0} sessions in the window.`);
    } else if (res.status === 403) {
      bad('GA4 returned 403 — the service account is not a user on that property.');
      info('  analytics.google.com -> Admin -> Property Access Management -> +');
      info(`  -> ${sa.client_email} -> role Viewer`);
    } else {
      bad(`GA4 returned HTTP ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
      info('If it mentions the API being disabled: APIs & Services -> Library');
      info('-> "Google Analytics Data API" -> Enable.');
    }
  } catch (err) {
    bad(`GA4 check failed: ${err.message}`);
  }
}

console.log('\nSearch Console is ready. Add these as GitHub repository secrets:');
console.log('  GCP_SA_KEY      = the whole .json file contents');
console.log(`  GSC_SITE_URL    = ${SITE_URL}`);
if (GA4_PROPERTY && !/^G-/i.test(GA4_PROPERTY)) {
  console.log(`  GA4_PROPERTY_ID = ${GA4_PROPERTY}`);
}
console.log('');
