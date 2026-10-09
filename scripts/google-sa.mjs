// Shared Google service-account auth for the SEO scripts.
//
// Resolves the key from, in order:
//   GCP_SA_KEY        the JSON verbatim (how CI injects the repo secret)
//   GCP_SA_KEY_FILE   a path to the downloaded .json (local use; keep it under
//                     .secrets/, which is gitignored — never inside .env)
// `.env` is read first so the local file-path form works without exporting
// anything; real environment variables always win, so CI is unaffected.
//
// The JWT is signed with node:crypto and exchanged directly — no googleapis.

import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnvFile(root = ROOT) {
  let raw;
  try {
    raw = readFileSync(join(root, '.env'), 'utf8');
  } catch {
    return; // no .env is normal in CI
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const value = m[2].trim().replace(/^["']|["']$/g, '');
    if (value && !process.env[m[1]]) process.env[m[1]] = value;
  }
}

/** The parsed service-account key, or null with a reason when none is configured. */
export function loadServiceAccount() {
  loadEnvFile();
  let raw = process.env.GCP_SA_KEY;
  const file = process.env.GCP_SA_KEY_FILE;
  if (!raw && file) {
    const path = isAbsolute(file) ? file : join(ROOT, file.replace(/^~/, process.env.HOME ?? '~'));
    try {
      raw = readFileSync(path, 'utf8');
    } catch (err) {
      return { sa: null, reason: `GCP_SA_KEY_FILE "${file}" could not be read: ${err.code ?? err.message}` };
    }
  }
  if (!raw) return { sa: null, reason: 'neither GCP_SA_KEY nor GCP_SA_KEY_FILE is set' };
  let sa;
  try {
    sa = JSON.parse(raw);
  } catch {
    return { sa: null, reason: 'the service-account key is not valid JSON' };
  }
  for (const f of ['client_email', 'private_key']) {
    if (!sa[f]) return { sa: null, reason: `the key is missing "${f}"` };
  }
  return { sa, reason: null };
}

const b64url = (s) => Buffer.from(s).toString('base64url');

export async function accessToken(sa, scopes) {
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
  if (!res.ok) throw new Error(`Token exchange failed (HTTP ${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}
