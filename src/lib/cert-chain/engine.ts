/**
 * engine.ts — the façade. `analyzeChain(pemText, now?)` is the only entry point
 * the playground uses.
 *
 * It is async because signature verification and fingerprints run through Web
 * Crypto, and it NEVER throws and NEVER rejects: an unusable input comes back as
 * a report with `ok: false` and an `InputIssue` that says what to do instead. That
 * is the contract every engine in this repo follows (`src/lib/ip-core.ts` and
 * friends), and here it also has to hold for binary noise, a 5 MB paste and the
 * empty string.
 *
 * `now` is a parameter, not a `Date.now()` call, so every expiry answer is
 * reproducible and every test pins it.
 *
 * `matchHostname` is deliberately NOT part of this façade — the hostname field is
 * optional in the UI and orthogonal to decoding, so it stays a separate pure
 * export from `chain.ts`.
 */
import { buildChain, expiryOf } from './chain';
import { extractCertificateDers } from './pem';
import { verifyChainEdges } from './verify';
import { fingerprints } from './verify';
import { parseCertificate } from './x509';
import type { CertReport, InputIssue, ParsedCert, ReportCert } from './types';

/**
 * Hard cap on certificates read from one paste. A TLS chain is three or four; a
 * paste with fifty is a trust store, and the DOM — not the parser — is what
 * freezes a tab. Precedent: `MAX_OVERLAP_PAIRS` in cidr-checker.
 */
export const MAX_CERTIFICATES = 50;

/** Normalize the injected clock. */
function toDate(now?: Date | number): Date {
  if (typeof now === 'number' && Number.isFinite(now)) return new Date(now);
  if (now instanceof Date && Number.isFinite(now.getTime())) return now;
  return new Date();
}

function emptyReport(now: Date, issues: InputIssue[], blocks: number): CertReport {
  return {
    ok: false,
    certs: [],
    edges: [],
    diagnostics: [],
    inputIssues: issues,
    summary: 'no certificates found',
    stats: {
      blocks,
      parsed: 0,
      certificates: 0,
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
      verified: 0,
      failed: 0,
      notVerified: 0,
    },
    now,
  };
}

const NOTHING_FOUND: InputIssue = {
  kind: 'nothing',
  severity: 'error',
  message:
    'No certificate found. Paste one or more "-----BEGIN CERTIFICATE-----" blocks — the output of ' +
    '"openssl s_client -showcerts -connect host:443" works as-is.',
};

/** The one-line `role="status"` summary. Three clauses, in reading order. */
function summarize(certs: ReportCert[], report: Omit<CertReport, 'summary'>): string {
  if (certs.length === 0) return 'no certificates found';
  const head = `${certs.length} certificate${certs.length === 1 ? '' : 's'}`;

  const has = (code: string) => report.diagnostics.some((d) => d.code === code);
  let order: string;
  if (has('missing-intermediate')) order = 'missing intermediate';
  else if (has('self-signed-leaf')) order = 'self-signed';
  else if (has('wrong-order')) order = 'reordered for you';
  else if (certs.length === 1) order = 'single certificate';
  else order = 'chain order OK';

  // Only ISSUER→SUBJECT edges are chain verification. A self-signed root's own
  // signature is also an edge, but crediting it in this headline made a paste with
  // a missing intermediate read "missing intermediate · 1 signature verified" —
  // the leaf's signature was never checked at all, and the one line the page
  // designates as the answer implied the chain had been verified.
  const chainEdges = report.edges.filter((e) => e.subjectIndex !== e.issuerIndex);
  const selfEdges = report.edges.filter((e) => e.subjectIndex === e.issuerIndex);
  const total = chainEdges.length;
  const verified = chainEdges.filter((e) => e.status === 'verified').length;
  const failed = chainEdges.filter((e) => e.status === 'failed').length;
  let signatures: string;
  if (failed > 0) signatures = `${failed} signature${failed === 1 ? '' : 's'} failed`;
  else if (total === 0) {
    // Name the reason nothing was checked. "1 signature verified" next to
    // "missing intermediate" was the worst possible reading of a root's self-edge.
    const unlinked = certs.some(
      (cert, index) => !cert.selfIssued && !chainEdges.some((e) => e.subjectIndex === index),
    );
    if (unlinked) signatures = 'no signature checked — the issuer is not in this paste';
    else if (selfEdges.some((e) => e.status === 'verified')) signatures = 'self-signature verified';
    else signatures = 'no signature could be checked';
  } else if (verified === total) {
    signatures = total === 1 ? '1 signature verified' : `all ${total} signatures verified`;
  } else signatures = `${verified} of ${total} signatures verified`;

  const first = certs[0];
  const label = first.role === 'self-signed' ? 'certificate' : first.role;
  return `${head} — ${order} · ${signatures} · ${label} ${first.expiry.text}`;
}

/**
 * Decode every certificate in a PEM paste, order it into a chain, check each
 * chain edge's signature, and report everything that is wrong with it.
 */
export async function analyzeChain(pemText: string, now?: Date | number): Promise<CertReport> {
  const at = toDate(now);
  try {
    return await analyze(pemText, at);
  } catch {
    // The modules below are written to return null rather than throw; this is the
    // backstop that keeps the promise "never rejects" true even if one of them
    // ever regresses.
    return emptyReport(at, [NOTHING_FOUND], 0);
  }
}

async function analyze(pemText: string, now: Date): Promise<CertReport> {
  const extracted = extractCertificateDers(typeof pemText === 'string' ? pemText : '');
  const issues: InputIssue[] = [...extracted.issues];

  let ders = extracted.ders;
  if (extracted.certBlocks > MAX_CERTIFICATES) {
    ders = ders.slice(0, MAX_CERTIFICATES);
    issues.push({
      kind: 'too-many',
      severity: 'warning',
      message:
        `This paste holds ${extracted.certBlocks} certificate blocks; only the first ` +
        `${MAX_CERTIFICATES} were read. A TLS chain is three or four certificates — a bundle this ` +
        `large is a trust store, and this tool is not the right lens for one.`,
    });
  }

  const parsed: ParsedCert[] = [];
  let firstUnparsable = -1;
  ders.forEach((der) => {
    const cert = parseCertificate(der);
    if (!cert) {
      if (firstUnparsable === -1) firstUnparsable = der.length;
      return;
    }
    parsed.push({ ...cert, inputIndex: parsed.length });
  });

  if (firstUnparsable >= 0) {
    issues.push({
      kind: 'not-a-certificate',
      severity: 'error',
      message:
        `A CERTIFICATE block decoded to ${firstUnparsable} bytes that are not a valid X.509 ` +
        `certificate. Base64 is fine; the DER inside it is not.`,
    });
  }

  if (parsed.length === 0) {
    if (issues.length === 0) issues.push(NOTHING_FOUND);
    return emptyReport(now, issues, extracted.totalBlocks);
  }

  const chain = buildChain(parsed, now);
  const [edges, fps] = await Promise.all([
    verifyChainEdges(chain.ordered, chain.edges),
    Promise.all(chain.ordered.map((cert) => fingerprints(cert.raw.der))),
  ]);

  const certs: ReportCert[] = chain.ordered.map((cert, index) => ({
    ...cert,
    role: chain.roles[index],
    expiry: expiryOf(cert, now),
    fingerprints: fps[index],
  }));

  const verified = edges.filter((e) => e.status === 'verified').length;
  const failed = edges.filter((e) => e.status === 'failed').length;
  const notVerified = edges.filter((e) => e.status === 'not-verified').length;

  const errors =
    chain.diagnostics.filter((d) => d.severity === 'error').length +
    issues.filter((i) => i.severity === 'error').length +
    failed;
  const warnings =
    chain.diagnostics.filter((d) => d.severity === 'warning').length +
    issues.filter((i) => i.severity === 'warning').length +
    certs.reduce((total, cert) => total + cert.warnings.length, 0);

  const withoutSummary: Omit<CertReport, 'summary'> = {
    ok: true,
    certs,
    edges,
    diagnostics: chain.diagnostics,
    inputIssues: issues,
    stats: {
      blocks: extracted.totalBlocks,
      parsed: parsed.length,
      certificates: certs.length,
      errors,
      warnings,
      verified,
      failed,
      notVerified,
    },
    now,
  };

  return { ...withoutSummary, summary: summarize(certs, withoutSummary) };
}
