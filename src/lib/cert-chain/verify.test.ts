/**
 * verify.ts — real signature verification through Web Crypto, plus fingerprints.
 *
 * The tri-state is the whole point. A chain edge is `verified`, `failed`, or
 * `not-verified` WITH A REASON — never a boolean, because "false" would merge
 * "this signature is forged" with "this browser cannot check RSA-PSS", and those
 * two answers must never look alike on a page whose promise is ground truth.
 *
 * The anchors here are real and externally checkable:
 *   - Let's Encrypt R11 really is signed by ISRG Root X1 (RSA, SHA-256);
 *   - Let's Encrypt E5 really is signed by ISRG Root X2 (ECDSA P-384, SHA-384);
 *   - ISRG Root X1's SHA-256 fingerprint is the value ISRG publishes.
 * Node's Web Crypto is the same API the browser runs, so a pass here is a pass
 * in the tool.
 */
import { describe, expect, it } from 'vitest';
import { extractCertificateDers } from './pem';
import { parseCertificate } from './x509';
import { describeSigAlg, derSigToRaw, fingerprints, verifyEdge } from './verify';
import type { ParsedCert } from './types';
import {
  DEMO_INTERMEDIATE,
  DEMO_LEAF,
  DEMO_LEAF_PSS,
  DEMO_LEAF_SHA1,
  DEMO_ROOT,
  ISRG_ROOT_X1,
  ISRG_ROOT_X2,
  LE_E5,
  LE_R11,
} from './fixtures';

function one(pem: string): ParsedCert {
  const { ders } = extractCertificateDers(pem);
  const cert = parseCertificate(ders[0]);
  expect(cert).not.toBeNull();
  return cert!;
}

describe('verifyEdge — RSA', () => {
  it("verifies Let's Encrypt R11 against ISRG Root X1", async () => {
    const verdict = await verifyEdge(one(LE_R11), one(ISRG_ROOT_X1));
    expect(verdict.status).toBe('verified');
    expect(verdict.algorithm).toBe('RSA PKCS#1 v1.5 with SHA-256');
    expect(verdict.deprecated).toBeUndefined();
    expect(verdict.reason).toBeUndefined();
  });

  it('verifies a self-signed root against itself', async () => {
    const x1 = one(ISRG_ROOT_X1);
    expect((await verifyEdge(x1, x1)).status).toBe('verified');
  });

  it('verifies the whole generated demo chain', async () => {
    const leaf = one(DEMO_LEAF);
    const int = one(DEMO_INTERMEDIATE);
    const root = one(DEMO_ROOT);
    expect((await verifyEdge(leaf, int)).status).toBe('verified');
    expect((await verifyEdge(int, root)).status).toBe('verified');
    expect((await verifyEdge(root, root)).status).toBe('verified');
  });

  it('FAILS — not "not-verified" — when a single TBS byte is flipped', async () => {
    const r11 = one(LE_R11);
    const tampered: ParsedCert = {
      ...r11,
      raw: { ...r11.raw, tbs: Uint8Array.from(r11.raw.tbs) },
    };
    // Flip a byte deep inside the signed structure.
    tampered.raw.tbs[100] ^= 0x01;
    const verdict = await verifyEdge(tampered, one(ISRG_ROOT_X1));
    expect(verdict.status).toBe('failed');
    expect(verdict.reason).toBe(
      'The issuer’s public key does not validate this signature. Either this is not the certificate that signed it, or one of the two has been altered.',
    );
  });

  it('fails against the wrong issuer', async () => {
    const verdict = await verifyEdge(one(LE_R11), one(DEMO_ROOT));
    expect(verdict.status).toBe('failed');
  });

  it('verifies a SHA-1 signature but reports it as deprecated', async () => {
    const verdict = await verifyEdge(one(DEMO_LEAF_SHA1), one(DEMO_INTERMEDIATE));
    expect(verdict.status).toBe('verified');
    expect(verdict.algorithm).toBe('RSA PKCS#1 v1.5 with SHA-1');
    expect(verdict.deprecated).toBe(true);
    expect(verdict.note).toBe(
      'SHA-1 is broken for signatures and no public CA has issued a SHA-1 certificate since 2016. The maths checks out; the algorithm does not.',
    );
  });

  it('reports RSA-PSS as not-verified, naming the algorithm', async () => {
    const verdict = await verifyEdge(one(DEMO_LEAF_PSS), one(DEMO_INTERMEDIATE));
    expect(verdict.status).toBe('not-verified');
    expect(verdict.algorithm).toBe('RSASSA-PSS');
    expect(verdict.reason).toBe(
      'RSASSA-PSS carries its hash, salt length and mask function inside the signature parameters. This tool does not guess them, so the signature is shown but not checked — a wrong guess would print "failed" for a perfectly valid certificate.',
    );
  });
});

describe('verifyEdge — ECDSA', () => {
  it("verifies Let's Encrypt E5 against ISRG Root X2 (P-384 / SHA-384)", async () => {
    const verdict = await verifyEdge(one(LE_E5), one(ISRG_ROOT_X2));
    expect(verdict.status).toBe('verified');
    expect(verdict.algorithm).toBe('ECDSA with SHA-384');
  });

  it('verifies the ECDSA root against itself', async () => {
    const x2 = one(ISRG_ROOT_X2);
    expect((await verifyEdge(x2, x2)).status).toBe('verified');
  });

  it('fails an ECDSA signature against an RSA issuer instead of throwing', async () => {
    const verdict = await verifyEdge(one(LE_E5), one(ISRG_ROOT_X1));
    expect(verdict.status).toBe('failed');
  });
});

describe('derSigToRaw — the ECDSA conversion Web Crypto forces on us', () => {
  // X.509 stores an ECDSA signature as DER SEQUENCE { INTEGER r, INTEGER s }.
  // Web Crypto wants raw r||s, each left-padded to the curve's field size. The
  // padding case is the bug everyone ships: whenever r or s happens to be
  // smaller than the field size (about a 1-in-256 chance per component, so it
  // WILL happen in production), a naive concatenation produces a signature that
  // is one byte short and verification "fails" on a valid certificate.
  const seq = (r: number[], s: number[]) =>
    new Uint8Array([
      0x30,
      4 + r.length + s.length,
      0x02,
      r.length,
      ...r,
      0x02,
      s.length,
      ...s,
    ]);

  it('converts a full-length pair unchanged', () => {
    const r = Array.from({ length: 32 }, (_, i) => i + 1);
    const s = Array.from({ length: 32 }, (_, i) => 0x80 - i);
    const raw = derSigToRaw(seq(r, s), 32);
    expect(raw).not.toBeNull();
    expect(raw!.length).toBe(64);
    expect(Array.from(raw!.subarray(0, 32))).toEqual(r);
    expect(Array.from(raw!.subarray(32))).toEqual(s);
  });

  it('LEFT-pads a short r to the field size', () => {
    // r is 30 bytes (its top two bytes were leading zeros, which DER strips).
    const r = Array.from({ length: 30 }, (_, i) => i + 1);
    const s = Array.from({ length: 32 }, () => 0x11);
    const raw = derSigToRaw(seq(r, s), 32)!;
    expect(raw.length).toBe(64);
    expect(Array.from(raw.subarray(0, 2))).toEqual([0, 0]);
    expect(Array.from(raw.subarray(2, 32))).toEqual(r);
    expect(Array.from(raw.subarray(32))).toEqual(s);
  });

  it('LEFT-pads a short s to the field size', () => {
    const r = Array.from({ length: 32 }, () => 0x22);
    const s = [0x07];
    const raw = derSigToRaw(seq(r, s), 32)!;
    expect(raw.length).toBe(64);
    expect(raw[63]).toBe(0x07);
    expect(Array.from(raw.subarray(32, 63))).toEqual(Array(31).fill(0));
  });

  it('strips the leading 0x00 DER adds to keep a high-bit value positive', () => {
    // 33 bytes: 0x00 then 32 bytes whose first has the high bit set.
    const r = [0x00, 0xff, ...Array.from({ length: 31 }, () => 0xaa)];
    const s = Array.from({ length: 32 }, () => 0x33);
    const raw = derSigToRaw(seq(r, s), 32)!;
    expect(raw.length).toBe(64);
    expect(raw[0]).toBe(0xff);
    expect(raw[1]).toBe(0xaa);
  });

  it('pads to 48 bytes for P-384 and 66 for P-521', () => {
    const r = [0x01];
    const s = [0x02];
    expect(derSigToRaw(seq(r, s), 48)!.length).toBe(96);
    expect(derSigToRaw(seq(r, s), 66)!.length).toBe(132);
  });

  it('refuses malformed input instead of producing a wrong-length signature', () => {
    expect(derSigToRaw(new Uint8Array(0), 32)).toBeNull();
    expect(derSigToRaw(new Uint8Array([0x30, 0x00]), 32)).toBeNull();
    // A component longer than the field size cannot be truncated into place.
    const tooLong = Array.from({ length: 40 }, () => 0x01);
    expect(derSigToRaw(seq(tooLong, [0x01]), 32)).toBeNull();
    // Not a SEQUENCE.
    expect(derSigToRaw(new Uint8Array([0x02, 0x01, 0x01]), 32)).toBeNull();
  });

  it('round-trips a real ECDSA signature out of E5', () => {
    const e5 = one(LE_E5);
    const raw = derSigToRaw(e5.raw.sigBytes, 48);
    expect(raw).not.toBeNull();
    expect(raw!.length).toBe(96);
  });
});

describe('fingerprints', () => {
  it("matches the SHA-256 fingerprint ISRG publishes for Root X1", async () => {
    const fp = await fingerprints(one(ISRG_ROOT_X1).raw.der);
    expect(fp.sha256).toBe(
      '96:BC:EC:06:26:49:76:F3:74:60:77:9A:CF:28:C5:A7:CF:E8:A3:C0:AA:E1:1A:8F:FC:EE:05:C0:BD:DF:08:C6',
    );
  });

  it('matches the published SHA-1 fingerprint too', async () => {
    const fp = await fingerprints(one(ISRG_ROOT_X1).raw.der);
    expect(fp.sha1).toBe('CA:BD:2A:79:A1:07:6A:31:F2:1D:25:36:35:CB:03:9D:43:29:A5:E8');
  });

  it('fingerprints the whole DER, not the TBS', async () => {
    const x1 = one(ISRG_ROOT_X1);
    const ofTbs = await fingerprints(x1.raw.tbs);
    const ofDer = await fingerprints(x1.raw.der);
    expect(ofTbs.sha256).not.toBe(ofDer.sha256);
  });

  it('never throws on empty input', async () => {
    await expect(fingerprints(new Uint8Array(0))).resolves.toHaveProperty('sha256');
  });
});

describe('describeSigAlg', () => {
  it('names every algorithm this tool can check', () => {
    expect(describeSigAlg('1.2.840.113549.1.1.11')).toMatchObject({
      display: 'RSA PKCS#1 v1.5 with SHA-256',
      verifiable: true,
    });
    expect(describeSigAlg('1.2.840.113549.1.1.12').display).toBe(
      'RSA PKCS#1 v1.5 with SHA-384',
    );
    expect(describeSigAlg('1.2.840.113549.1.1.13').display).toBe(
      'RSA PKCS#1 v1.5 with SHA-512',
    );
    expect(describeSigAlg('1.2.840.10045.4.3.2')).toMatchObject({
      display: 'ECDSA with SHA-256',
      verifiable: true,
    });
    expect(describeSigAlg('1.3.101.112')).toMatchObject({ display: 'Ed25519' });
  });

  it('marks SHA-1 as verifiable but deprecated', () => {
    expect(describeSigAlg('1.2.840.113549.1.1.5')).toMatchObject({
      display: 'RSA PKCS#1 v1.5 with SHA-1',
      verifiable: true,
      deprecated: true,
    });
    expect(describeSigAlg('1.2.840.10045.4.1')).toMatchObject({
      display: 'ECDSA with SHA-1',
      deprecated: true,
    });
  });

  it('marks what it cannot check, and says why', () => {
    const pss = describeSigAlg('1.2.840.113549.1.1.10');
    expect(pss.verifiable).toBe(false);
    expect(pss.display).toBe('RSASSA-PSS');
    expect(pss.reason).toContain('RSASSA-PSS carries its hash');

    const md5 = describeSigAlg('1.2.840.113549.1.1.4');
    expect(md5.display).toBe('RSA PKCS#1 v1.5 with MD5');
    expect(md5.verifiable).toBe(false);

    const dsa = describeSigAlg('1.2.840.10040.4.3');
    expect(dsa.display).toBe('DSA with SHA-1');
    expect(dsa.verifiable).toBe(false);

    const ed448 = describeSigAlg('1.3.101.113');
    expect(ed448.verifiable).toBe(false);
  });

  it('falls back to the raw OID for an algorithm it has never heard of', () => {
    const unknown = describeSigAlg('1.2.3.4.5.6.7.8.9');
    expect(unknown.display).toBe('unknown algorithm 1.2.3.4.5.6.7.8.9');
    expect(unknown.verifiable).toBe(false);
    expect(unknown.reason).toContain('1.2.3.4.5.6.7.8.9');
  });
});
