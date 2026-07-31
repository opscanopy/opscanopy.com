/**
 * engine.ts — the façade: PEM text in, one report out.
 *
 * `analyzeChain` is the only thing the playground calls. It is async because
 * signature verification and fingerprints go through Web Crypto, and it NEVER
 * rejects and NEVER throws: a report with `ok: false` and an input issue is the
 * failure mode, for every input including binary noise, 5 MB of base64 and the
 * empty string.
 *
 * The input-issue wordings pinned here are load-bearing product copy — the
 * private-key line is the tool's whole privacy argument, and the PKCS#7 line is
 * the one place a user is told what command to run instead. The truncated-block
 * wording is additionally pinned by the E2E fixture table
 * (`tests/e2e/tools.fixtures.ts`, `calmErrorString`).
 *
 * Every test that touches a validity window injects `now`.
 */
import { describe, expect, it } from 'vitest';
import { analyzeChain, MAX_CERTIFICATES } from './engine';
import {
  BADSSL_EXPIRED_LEAF,
  BAD_BASE64_BLOCK,
  CSR_BLOCK,
  DEMO_CHAIN,
  DEMO_CHAIN_MISSING_INTERMEDIATE,
  DEMO_CHAIN_NO_ROOT,
  DEMO_INTERMEDIATE,
  DEMO_LEAF,
  DEMO_LEAF_XSS_SUBJECT,
  FAKE_PRIVATE_KEY_BLOCK,
  KEY_AND_CERT,
  LE_R11_CHAIN,
  PKCS7_BUNDLE,
  S_CLIENT_PASTE,
  TRUNCATED_BLOCK,
} from './fixtures';

const NOW = new Date('2026-07-30T00:00:00Z');
const kinds = (issues: { kind: string }[]) => issues.map((i) => i.kind);
const issueText = (issues: { kind: string; message: string }[], kind: string) =>
  issues.find((i) => i.kind === kind)?.message;

describe('analyzeChain — the happy paths', () => {
  it('reads a correctly ordered three-certificate chain', async () => {
    const report = await analyzeChain(DEMO_CHAIN, NOW);
    expect(report.ok).toBe(true);
    expect(report.certs.map((c) => c.commonName)).toEqual([
      'shop.example.com',
      'Example Labs Intermediate R3',
      'Example Labs Root X1',
    ]);
    expect(report.certs.map((c) => c.role)).toEqual(['leaf', 'intermediate', 'root']);
    expect(report.edges.every((e) => e.status === 'verified')).toBe(true);
    // Two ISSUER links, not three: the root's own self-signature is an edge but it
    // is not chain verification, and counting it here credited a check that
    // "proves nothing" (bug: root self-edge inflated the headline tally).
    expect(report.summary).toBe(
      '3 certificates — chain order OK · all 2 signatures verified · leaf expires in 1767 days',
    );
  });

  it('attaches expiry and fingerprints to every certificate', async () => {
    const report = await analyzeChain(DEMO_CHAIN, NOW);
    const leaf = report.certs[0];
    expect(leaf.expiry.state).toBe('valid');
    expect(leaf.expiry.daysRemaining).toBe(1767);
    expect(leaf.fingerprints.sha256).toBe(
      'BA:18:86:BC:68:80:DD:10:24:52:EE:2A:A1:A0:09:54:C1:64:AD:67:82:A2:2B:F1:52:96:98:61:10:28:E7:33',
    );
    expect(leaf.fingerprints.sha1.split(':').length).toBe(20);
  });

  it('reads an s_client paste and ignores every line outside the PEM markers', async () => {
    const report = await analyzeChain(S_CLIENT_PASTE, NOW);
    expect(report.ok).toBe(true);
    expect(report.certs.length).toBe(2);
    expect(report.certs.map((c) => c.role)).toEqual(['leaf', 'intermediate']);
    expect(kinds(report.inputIssues)).toContain('noise-ignored');
    expect(issueText(report.inputIssues, 'noise-ignored')).toBe(
      'Text outside the BEGIN/END markers was ignored, so an "openssl s_client -showcerts" transcript can be pasted as-is.',
    );
    expect(report.summary).toBe(
      '2 certificates — chain order OK · 1 signature verified · leaf expires in 1767 days',
    );
  });

  it('reads a real intermediate + root pair', async () => {
    const report = await analyzeChain(LE_R11_CHAIN, NOW);
    expect(report.certs.map((c) => c.commonName)).toEqual(['R11', 'ISRG Root X1']);
    expect(report.certs.map((c) => c.role)).toEqual(['intermediate', 'root']);
    expect(report.edges.filter((e) => e.status === 'verified').length).toBe(2);
  });

  it('summarizes a missing intermediate', async () => {
    const report = await analyzeChain(DEMO_CHAIN_MISSING_INTERMEDIATE, NOW);
    expect(report.ok).toBe(true);
    // Bug: this used to read "missing intermediate · 1 signature verified" — the
    // only edge was the root vouching for itself, and the leaf's signature was
    // never checked. On a page whose promise is verifiable answers that reads as
    // "the chain verified" right next to "missing intermediate".
    expect(report.summary).toBe(
      '2 certificates — missing intermediate · no signature checked — the issuer is not in this paste · leaf expires in 1767 days',
    );
    expect(report.edges.filter((e) => e.subjectIndex !== e.issuerIndex)).toEqual([]);
    expect(report.diagnostics.some((d) => d.code === 'missing-intermediate')).toBe(true);
    expect(report.stats.errors).toBeGreaterThan(0);
  });

  it('summarizes a correct leaf + intermediate deployment', async () => {
    const report = await analyzeChain(DEMO_CHAIN_NO_ROOT, NOW);
    expect(report.summary).toBe(
      '2 certificates — chain order OK · 1 signature verified · leaf expires in 1767 days',
    );
    expect(report.stats.errors).toBe(0);
  });

  it('summarizes an expired lone leaf without inventing a signature verdict', async () => {
    const report = await analyzeChain(BADSSL_EXPIRED_LEAF, NOW);
    expect(report.summary).toBe(
      '1 certificate — missing intermediate · no signature checked — the issuer is not in this paste · leaf expired about 4126 days ago',
    );
  });

  it('accepts a millisecond timestamp for now', async () => {
    const a = await analyzeChain(DEMO_LEAF, NOW);
    const b = await analyzeChain(DEMO_LEAF, NOW.getTime());
    expect(b.summary).toBe(a.summary);
  });

  it('returns subject text unescaped — the playground escapes, the engine does not', async () => {
    const report = await analyzeChain(DEMO_LEAF_XSS_SUBJECT, NOW);
    expect(report.certs[0].commonName).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('analyzeChain — input tolerance', () => {
  it('ignores a PRIVATE KEY block and makes the privacy point', async () => {
    const report = await analyzeChain(KEY_AND_CERT, NOW);
    expect(report.ok).toBe(true);
    expect(report.certs.length).toBe(1);
    expect(kinds(report.inputIssues)).toContain('private-key');
    expect(issueText(report.inputIssues, 'private-key')).toBe(
      'A PRIVATE KEY block was found and ignored — it was never parsed, and it never left this page, because this decoder is a static page with no server behind it. Most certificate decoders upload what you paste; rotate the key anyway if you pasted it anywhere else.',
    );
  });

  it('handles a private key on its own — no certificate, but no scolding either', async () => {
    const report = await analyzeChain(FAKE_PRIVATE_KEY_BLOCK, NOW);
    expect(report.ok).toBe(false);
    expect(kinds(report.inputIssues)).toContain('private-key');
    expect(report.summary).toBe('no certificates found');
  });

  it('refuses a PKCS#7 bundle with the exact command that converts it', async () => {
    const report = await analyzeChain(PKCS7_BUNDLE, NOW);
    expect(report.ok).toBe(false);
    expect(kinds(report.inputIssues)).toContain('pkcs7');
    expect(issueText(report.inputIssues, 'pkcs7')).toBe(
      'This is a PKCS#7 / P7B bundle, which wraps certificates in another layer this tool does not open. Convert it first: openssl pkcs7 -print_certs -in bundle.p7b -out chain.pem',
    );
  });

  it('tells a CSR apart from a certificate', async () => {
    const report = await analyzeChain(CSR_BLOCK, NOW);
    expect(report.ok).toBe(false);
    expect(kinds(report.inputIssues)).toContain('csr');
    expect(issueText(report.inputIssues, 'csr')).toBe(
      'This is a certificate signing request (PKCS#10), not a certificate: it has no issuer, no validity window and no CA signature to check. Read it with "openssl req -in request.csr -noout -text".',
    );
  });

  it('names a truncated block — the wording the E2E suite pins', async () => {
    const report = await analyzeChain(TRUNCATED_BLOCK, NOW);
    expect(report.ok).toBe(false);
    expect(kinds(report.inputIssues)).toContain('truncated');
    expect(issueText(report.inputIssues, 'truncated')).toBe(
      'A "-----BEGIN CERTIFICATE-----" line has no matching "-----END CERTIFICATE-----" line — the paste looks truncated.',
    );
  });

  it('names a mangled base64 body', async () => {
    const report = await analyzeChain(BAD_BASE64_BLOCK, NOW);
    expect(report.ok).toBe(false);
    expect(kinds(report.inputIssues)).toContain('bad-base64');
    expect(issueText(report.inputIssues, 'bad-base64')).toBe(
      'A CERTIFICATE block is not valid base64 — a character was mangled in transit. Re-copy it, and check that no chat client rewrapped the lines.',
    );
  });

  it('reports a block that is base64 but not a certificate', async () => {
    const notACert =
      '-----BEGIN CERTIFICATE-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A\n-----END CERTIFICATE-----';
    const report = await analyzeChain(notACert, NOW);
    expect(report.ok).toBe(false);
    expect(kinds(report.inputIssues)).toContain('not-a-certificate');
    expect(issueText(report.inputIssues, 'not-a-certificate')).toBe(
      'A CERTIFICATE block decoded to 24 bytes that are not a valid X.509 certificate. Base64 is fine; the DER inside it is not.',
    );
  });

  it('accepts headerless base64 DER as a last resort', async () => {
    const body = DEMO_LEAF.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').trim();
    const report = await analyzeChain(body, NOW);
    expect(report.ok).toBe(true);
    expect(report.certs[0].commonName).toBe('shop.example.com');
    expect(kinds(report.inputIssues)).toContain('headerless');
  });

  it('is tolerant of CRLF line endings and leading indentation', async () => {
    const indented = DEMO_CHAIN.split('\n')
      .map((line) => '    ' + line)
      .join('\r\n');
    const report = await analyzeChain(indented, NOW);
    expect(report.ok).toBe(true);
    expect(report.certs.length).toBe(3);
  });

  it('says nothing was found for the empty string', async () => {
    for (const input of ['', '   ', '\n\n\t']) {
      const report = await analyzeChain(input, NOW);
      expect(report.ok).toBe(false);
      expect(report.certs).toEqual([]);
      expect(kinds(report.inputIssues)).toContain('nothing');
      expect(issueText(report.inputIssues, 'nothing')).toBe(
        'No certificate found. Paste one or more "-----BEGIN CERTIFICATE-----" blocks — the output of "openssl s_client -showcerts -connect host:443" works as-is.',
      );
    }
  });

  it('says the markers lost their line breaks instead of "paste a BEGIN block"', async () => {
    // Bug: the BEGIN marker is line-anchored, so a PEM that came back from a JSON
    // field or an HTML page as one long line produced the generic "No certificate
    // found. Paste one or more -----BEGIN CERTIFICATE----- blocks" — advice the
    // user has already followed, with nothing pointing at the real problem.
    const oneLine = DEMO_LEAF.replace(/\n/g, ' ');
    const report = await analyzeChain(oneLine, NOW);
    expect(report.ok).toBe(false);
    expect(kinds(report.inputIssues)).toContain('markers-inline');
    expect(kinds(report.inputIssues)).not.toContain('nothing');
    expect(issueText(report.inputIssues, 'markers-inline')).toContain('not on a line of its own');
    // A normal paste never trips it.
    expect(kinds((await analyzeChain(DEMO_LEAF, NOW)).inputIssues)).not.toContain('markers-inline');
  });

  it('caps the number of certificates it will parse', async () => {
    const many = Array.from({ length: MAX_CERTIFICATES + 12 }, (_, i) =>
      i % 2 === 0 ? DEMO_LEAF : DEMO_INTERMEDIATE,
    ).join('\n');
    const report = await analyzeChain(many, NOW);
    expect(report.ok).toBe(true);
    expect(report.stats.parsed).toBe(MAX_CERTIFICATES);
    expect(kinds(report.inputIssues)).toContain('too-many');
    expect(issueText(report.inputIssues, 'too-many')).toBe(
      `This paste holds ${MAX_CERTIFICATES + 12} certificate blocks; only the first ${MAX_CERTIFICATES} were read. A TLS chain is three or four certificates — a bundle this large is a trust store, and this tool is not the right lens for one.`,
    );
  });

  it('caps the diagnostics list', async () => {
    const many = Array.from({ length: 40 }, () => BADSSL_EXPIRED_LEAF).join('\n');
    const report = await analyzeChain(many, NOW);
    expect(report.diagnostics.length).toBeLessThanOrEqual(20);
  });
});

describe('analyzeChain — never throws, never rejects', () => {
  const hostile: [string, string][] = [
    ['empty', ''],
    ['whitespace', '   \n\t  '],
    ['plain prose', 'this is definitely not a certificate at all'],
    ['begin only', '-----BEGIN CERTIFICATE-----'],
    ['end only', '-----END CERTIFICATE-----'],
    ['nested markers', '-----BEGIN CERTIFICATE-----BEGIN CERTIFICATE-----END CERTIFICATE-----'],
    ['null bytes', '\u0000\u0000\u0000-----BEGIN CERTIFICATE-----\u0000'],
    ['emoji', '🌍🌎🌏'.repeat(200)],
    ['lone surrogate', '\ud800'],
    ['json', '{"cert":"-----BEGIN CERTIFICATE-----"}'],
    ['html', '<img src=x onerror=alert(1)>'],
    ['label mismatch', '-----BEGIN CERTIFICATE-----\nAAAA\n-----END PRIVATE KEY-----'],
    ['half a marker', '-----BEGIN CERT'],
    ['a thousand markers', '-----BEGIN CERTIFICATE-----\n'.repeat(1000)],
  ];

  for (const [name, input] of hostile) {
    it(`survives: ${name}`, async () => {
      const report = await analyzeChain(input, NOW);
      expect(report).toBeTruthy();
      expect(typeof report.summary).toBe('string');
      expect(Array.isArray(report.certs)).toBe(true);
      expect(Array.isArray(report.inputIssues)).toBe(true);
    });
  }

  it('survives a 5 MB paste of base64-looking noise in reasonable time', async () => {
    const noise = 'MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw\n'.repeat(
      80_000,
    );
    const started = Date.now();
    const report = await analyzeChain(
      `-----BEGIN CERTIFICATE-----\n${noise}-----END CERTIFICATE-----`,
      NOW,
    );
    expect(report.ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it('survives a certificate with every byte after the header flipped', async () => {
    const lines = DEMO_LEAF.split('\n');
    for (let i = 1; i < lines.length - 1; i += 5) {
      const copy = [...lines];
      copy[i] = copy[i].split('').reverse().join('');
      const report = await analyzeChain(copy.join('\n'), NOW);
      expect(typeof report.summary).toBe('string');
    }
  });

  it('survives a null/undefined input without a type assertion', async () => {
    const report = await analyzeChain(undefined as unknown as string, NOW);
    expect(report.ok).toBe(false);
  });
});
