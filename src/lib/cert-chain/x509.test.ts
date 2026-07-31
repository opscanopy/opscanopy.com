/**
 * x509.ts — certificate parsing, pinned against REAL certificates.
 *
 * Every value asserted here was read out of the same PEM with
 * `openssl x509 -text` first, so these are cross-checks against another
 * implementation rather than self-consistency checks against this one. The
 * fixtures and their provenance are documented in fixtures.ts.
 *
 * No test here calls Date.now(): parsing is time-independent, and every
 * validity-window assertion lives in chain.test.ts where `now` is injected.
 */
import { describe, expect, it } from 'vitest';
import { TAG, readChildren, readNode } from './der';
import { extractCertificateDers } from './pem';
import { parseCertificate } from './x509';
import {
  DEMO_INTERMEDIATE,
  DEMO_LEAF,
  DEMO_LEAF_GENERALIZED_TIME,
  DEMO_LEAF_MULTIVALUE_RDN,
  DEMO_LEAF_V1,
  DEMO_LEAF_XSS_SUBJECT,
  DEMO_ROOT,
  ISRG_ROOT_X1,
  ISRG_ROOT_X2,
  LE_E5,
  LE_R11,
  BADSSL_WILDCARD_LEAF,
} from './fixtures';

/** Parse the first CERTIFICATE block of a PEM string. Throws only on a broken fixture. */
function parse(pem: string) {
  const { ders } = extractCertificateDers(pem);
  expect(ders.length, 'fixture should contain at least one certificate').toBeGreaterThan(0);
  const cert = parseCertificate(ders[0]);
  expect(cert, 'fixture should parse').not.toBeNull();
  return cert!;
}

describe('ISRG Root X1 — a real self-signed RSA-4096 root', () => {
  const x1 = parse(ISRG_ROOT_X1);

  it('is an X.509 v3 certificate', () => {
    expect(x1.version).toBe(3);
  });

  it('reads the subject and issuer as the same distinguished name', () => {
    expect(x1.subject.text).toBe(
      'C=US, O=Internet Security Research Group, CN=ISRG Root X1',
    );
    expect(x1.issuer.text).toBe(x1.subject.text);
    expect(x1.selfIssued).toBe(true);
    expect(x1.commonName).toBe('ISRG Root X1');
  });

  it('reads the serial number as exact hex and exact decimal', () => {
    expect(x1.serialHex).toBe('82:10:CF:B0:D2:40:E3:59:44:63:E0:BB:63:82:8B:00');
    expect(x1.serialNegative).toBe(false);
    // BigInt, not Number: this value needs 128 bits.
    expect(x1.serialDecimal).toBe('172886928669790476064670243504169061120');
  });

  it('reads the validity window, both bounds as UTCTime', () => {
    expect(x1.notBefore.toISOString()).toBe('2015-06-04T11:04:38.000Z');
    expect(x1.notAfter.toISOString()).toBe('2035-06-04T11:04:38.000Z');
    expect(x1.notBeforeKind).toBe('utc');
    expect(x1.notAfterKind).toBe('utc');
  });

  it('reads the public key as RSA 4096-bit', () => {
    expect(x1.spki.keyType).toBe('RSA');
    expect(x1.spki.bits).toBe(4096);
    expect(x1.spki.summary).toBe('RSA 4096-bit');
  });

  it('names the signature algorithm both ways', () => {
    expect(x1.sigAlgOid).toBe('1.2.840.113549.1.1.11');
    expect(x1.sigAlgName).toBe('sha256WithRSAEncryption');
    expect(x1.sigAlgDisplay).toBe('RSA PKCS#1 v1.5 with SHA-256');
  });

  it('reads the subject key identifier', () => {
    expect(x1.ski).toBe('79:B4:59:E6:7B:B6:E5:E4:01:73:80:08:88:C8:1A:58:F6:E9:9B:6E');
    expect(x1.aki).toBeUndefined();
  });

  it('reads basicConstraints and keyUsage', () => {
    expect(x1.basicConstraints).toEqual({ ca: true, critical: true });
    expect(x1.isCa).toBe(true);
    expect(x1.keyUsage).toEqual(['keyCertSign', 'cRLSign']);
    expect(x1.keyUsageCritical).toBe(true);
  });

  it('slices the TBS bytes and the signature bytes out of the DER', () => {
    // The TBS slice must start at its own SEQUENCE header, not at the certificate's.
    expect(x1.raw.tbs[0]).toBe(0x30);
    expect(x1.raw.tbs.length).toBeLessThan(x1.raw.der.length);
    // A 4096-bit RSA signature is exactly 512 bytes.
    expect(x1.raw.sigBytes.length).toBe(512);
    expect(x1.raw.spki.length).toBeGreaterThan(500);
  });
});

describe("Let's Encrypt R11 — a real intermediate", () => {
  const r11 = parse(LE_R11);
  const x1 = parse(ISRG_ROOT_X1);

  it('links to its issuer: R11.aki.keyId === X1.ski', () => {
    expect(r11.aki?.keyId).toBe(x1.ski);
    expect(r11.issuer.text).toBe(x1.subject.text);
  });

  it('reads basicConstraints CA:TRUE with pathLen 0', () => {
    expect(r11.basicConstraints).toEqual({ ca: true, pathLen: 0, critical: true });
    expect(r11.isCa).toBe(true);
    expect(r11.selfIssued).toBe(false);
  });

  it('reads its own subject key identifier', () => {
    expect(r11.ski).toBe('C5:CF:46:A4:EA:F4:C3:C0:7A:6C:95:C4:2D:B0:5E:92:2F:26:E3:B9');
  });

  it('reads the extended key usages', () => {
    expect(r11.extKeyUsage.names).toEqual([
      'TLS Web Client Authentication',
      'TLS Web Server Authentication',
    ]);
  });

  it('reads keyUsage including digitalSignature', () => {
    expect(r11.keyUsage).toEqual(['digitalSignature', 'keyCertSign', 'cRLSign']);
  });

  it('has no subjectAltName — it is a CA, not a server', () => {
    expect(r11.sans).toEqual([]);
  });
});

describe('ECDSA certificates', () => {
  it('reads ISRG Root X2 as ECDSA P-384, signed with ecdsa-with-SHA384', () => {
    const x2 = parse(ISRG_ROOT_X2);
    expect(x2.spki.keyType).toBe('EC');
    expect(x2.spki.curve).toBe('P-384');
    expect(x2.spki.bits).toBe(384);
    expect(x2.spki.summary).toBe('ECDSA P-384');
    expect(x2.sigAlgName).toBe('ecdsa-with-SHA384');
    expect(x2.sigAlgDisplay).toBe('ECDSA with SHA-384');
    expect(x2.selfIssued).toBe(true);
  });

  it("reads Let's Encrypt E5 and links it to X2", () => {
    const e5 = parse(LE_E5);
    const x2 = parse(ISRG_ROOT_X2);
    expect(e5.aki?.keyId).toBe(x2.ski);
    expect(e5.spki.curve).toBe('P-384');
    // An ECDSA signature is a DER SEQUENCE, so its length varies run to run.
    expect(e5.raw.sigBytes[0]).toBe(0x30);
  });
});

describe('the demo leaf — SANs, EKU, key identifiers', () => {
  const leaf = parse(DEMO_LEAF);

  it('reads every subjectAltName, wildcard and IP addresses included', () => {
    expect(leaf.sans).toEqual([
      { kind: 'dns', value: 'shop.example.com' },
      { kind: 'dns', value: '*.shop.example.com' },
      { kind: 'dns', value: 'api.example.net' },
      { kind: 'ip', value: '203.0.113.10' },
      { kind: 'ip', value: '2001:db8::10' },
    ]);
  });

  it('reads the extended key usage', () => {
    expect(leaf.extKeyUsage.names).toEqual([
      'TLS Web Server Authentication',
      'TLS Web Client Authentication',
    ]);
    expect(leaf.extKeyUsage.oids).toEqual(['1.3.6.1.5.5.7.3.1', '1.3.6.1.5.5.7.3.2']);
  });

  it('reads keyUsage and CA:FALSE', () => {
    expect(leaf.keyUsage).toEqual(['digitalSignature', 'keyEncipherment']);
    expect(leaf.basicConstraints).toEqual({ ca: false, critical: true });
    expect(leaf.isCa).toBe(false);
  });

  it('links leaf → intermediate → root by key identifier', () => {
    const int = parse(DEMO_INTERMEDIATE);
    const root = parse(DEMO_ROOT);
    expect(leaf.ski).toBe('95:5A:CB:98:EC:60:F2:A2:E6:E0:AE:E8:FC:D0:42:28:AB:F8:DB:81');
    expect(leaf.aki?.keyId).toBe(int.ski);
    expect(int.aki?.keyId).toBe(root.ski);
    expect(root.aki).toBeUndefined();
  });

  it('lists every extension it saw, critical flags included', () => {
    const names = leaf.extensions.map((e) => e.name);
    expect(names).toContain('basicConstraints');
    expect(names).toContain('subjectAltName');
    expect(names).toContain('extendedKeyUsage');
    const bc = leaf.extensions.find((e) => e.name === 'basicConstraints');
    expect(bc?.critical).toBe(true);
    const san = leaf.extensions.find((e) => e.name === 'subjectAltName');
    expect(san?.critical).toBe(false);
  });

  it('has no warnings — it is a well-formed v3 certificate', () => {
    expect(leaf.warnings).toEqual([]);
  });
});

describe('the wildcard badssl leaf — a real leaf with two SANs', () => {
  const leaf = parse(BADSSL_WILDCARD_LEAF);

  it('reads the wildcard SAN and the bare apex', () => {
    expect(leaf.sans).toEqual([
      { kind: 'dns', value: '*.badssl.com' },
      { kind: 'dns', value: 'badssl.com' },
    ]);
    expect(leaf.commonName).toBe('*.badssl.com');
  });

  it("names the real issuer DN, which is what a missing-intermediate message quotes", () => {
    expect(leaf.issuer.text).toBe("C=US, O=Let's Encrypt, CN=YR2");
  });
});

describe('shapes that break naive parsers', () => {
  it('an X.509 v1 certificate has no extensions, and says so', () => {
    const v1 = parse(DEMO_LEAF_V1);
    expect(v1.version).toBe(1);
    expect(v1.extensions).toEqual([]);
    expect(v1.sans).toEqual([]);
    expect(v1.ski).toBeUndefined();
    expect(v1.basicConstraints).toBeUndefined();
    expect(v1.warnings).toContain(
      'This is an X.509 version 1 certificate: it carries no extensions, so it has no subjectAltName, no basicConstraints and no key identifiers. Clients have rejected v1 server certificates since 2017.',
    );
  });

  it('joins a multi-valued RDN with " + " instead of dropping one half', () => {
    const multi = parse(DEMO_LEAF_MULTIVALUE_RDN);
    expect(multi.subject.text).toBe(
      'C=US, O=Example Labs, OU=Platform Ops + CN=multi.example.com',
    );
    expect(multi.commonName).toBe('multi.example.com');
    // Four attributes across three RDNs — the third RDN holds two of them.
    expect(multi.subject.rdns.length).toBe(3);
    expect(multi.subject.rdns[2].length).toBe(2);
  });

  it('reads a notAfter encoded as GeneralizedTime (year >= 2050)', () => {
    const long = parse(DEMO_LEAF_GENERALIZED_TIME);
    expect(long.notAfter.toISOString()).toBe('2053-06-01T00:00:00.000Z');
    expect(long.notAfterKind).toBe('generalized');
    expect(long.notBeforeKind).toBe('utc');
  });

  it('returns subject text verbatim — escaping is the renderer’s job, not the parser’s', () => {
    const xss = parse(DEMO_LEAF_XSS_SUBJECT);
    expect(xss.commonName).toBe('<img src=x onerror=alert(1)>');
    expect(xss.subject.text).toBe(
      'O=Acme <img src=x onerror=alert(1)>, CN=<img src=x onerror=alert(1)>',
    );
  });

  it('reports a negative serial number as negative rather than as a huge positive', () => {
    // No public CA issues one, so forge it: take a real certificate and set the
    // top bit of its serial's first byte. RFC 5280 §4.1.2.2 requires a positive
    // serial; some appliances emit negative ones anyway, and a parser that reads
    // the bytes as unsigned prints a completely different number.
    const { ders } = extractCertificateDers(DEMO_LEAF);
    const der = Uint8Array.from(ders[0]);
    const original = parseCertificate(der)!;
    const serialBytes = original.serialHex.split(':').map((h) => parseInt(h, 16));
    let at = -1;
    for (let i = 0; i < der.length - serialBytes.length; i += 1) {
      if (serialBytes.every((byte, k) => der[i + k] === byte)) {
        at = i;
        break;
      }
    }
    expect(at, 'serial bytes should be findable in the DER').toBeGreaterThan(0);
    der[at] |= 0x80;
    const forged = parseCertificate(der)!;
    expect(forged.serialNegative).toBe(true);
    expect(forged.serialDecimal.startsWith('-')).toBe(true);
    expect(forged.warnings).toContain(
      'The serial number is negative. RFC 5280 requires a positive serial, so some clients will reject this certificate outright.',
    );
  });
});

describe('never throws', () => {
  it('returns null for DER that is not a certificate', () => {
    expect(parseCertificate(new Uint8Array(0))).toBeNull();
    expect(parseCertificate(new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x01]))).toBeNull();
    expect(parseCertificate(new Uint8Array(64).fill(0xff))).toBeNull();
  });

  it('returns null for every truncation of a real certificate', () => {
    const { ders } = extractCertificateDers(DEMO_LEAF);
    const full = ders[0];
    for (let cut = 1; cut < full.length; cut += 37) {
      expect(() => parseCertificate(full.subarray(0, cut))).not.toThrow();
      expect(parseCertificate(full.subarray(0, cut))).toBeNull();
    }
  });

  it('survives a single flipped byte anywhere in a real certificate', () => {
    const { ders } = extractCertificateDers(DEMO_LEAF);
    for (let i = 0; i < ders[0].length; i += 29) {
      const copy = Uint8Array.from(ders[0]);
      copy[i] ^= 0xff;
      expect(() => parseCertificate(copy)).not.toThrow();
    }
  });

  it('refuses a mangled signatureAlgorithm OID tag rather than reading it as clean', () => {
    // Bug: `decodeOid` only ever looked at content octets, so flipping the OID's
    // identifier byte (0x06 → 0x07) still produced 1.2.840.113549.1.1.11 and the
    // certificate came back verified with no warnings — a shape OpenSSL and every
    // browser reject as malformed. Assert the tag, do not assume it.
    const { ders } = extractCertificateDers(DEMO_LEAF);
    const der = ders[0];
    const outer = readNode(der, 0)!;
    const top = readChildren(outer)!;
    const base = outer.contentStart;
    // top = [tbsCertificate, signatureAlgorithm, signatureValue]
    const algOidTagAt = base + top[1].contentStart;
    expect(der[algOidTagAt]).toBe(TAG.OID);
    for (const wrong of [0x07, 0x86, 0x05]) {
      const copy = Uint8Array.from(der);
      copy[algOidTagAt] = wrong;
      expect(parseCertificate(copy)).toBeNull();
    }
  });

  it('refuses a signature BIT STRING with non-zero unused bits', () => {
    // Bug: a signature is a whole number of octets, but any unusedBits value 0–7
    // was accepted, so mutating that octet to 0x01 produced a clean, "verified"
    // certificate out of a malformed one.
    const { ders } = extractCertificateDers(DEMO_LEAF);
    const der = ders[0];
    const outer = readNode(der, 0)!;
    const top = readChildren(outer)!;
    const unusedBitsAt = outer.contentStart + top[2].contentStart;
    expect(der[unusedBitsAt]).toBe(0);
    for (const wrong of [0x01, 0x07]) {
      const copy = Uint8Array.from(der);
      copy[unusedBitsAt] = wrong;
      expect(parseCertificate(copy)).toBeNull();
    }
    // The untouched certificate still parses, so the check has not gone too far.
    expect(parseCertificate(der)).not.toBeNull();
  });

  it('survives 2 MB of random bytes', () => {
    const big = new Uint8Array(2 * 1024 * 1024);
    for (let i = 0; i < big.length; i += 1) big[i] = (i * 31 + 7) & 0xff;
    expect(() => parseCertificate(big)).not.toThrow();
  });
});
