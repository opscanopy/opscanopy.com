/**
 * chain.ts — ordering, chain diagnostics, expiry maths and RFC 6125 hostname
 * matching.
 *
 * EVERY validity assertion injects `now`. Not one of them reads the clock, so
 * this file cannot rot: the day BADSSL_EXPIRED_LEAF's "expired" test starts
 * depending on today's date is the day it stops being a test.
 *
 * The diagnostic wordings asserted here are the product, not an implementation
 * detail — they are what a person reads at 2am, and they are what the E2E
 * fixture table pins. Changing one is a deliberate product change.
 */
import { describe, expect, it } from 'vitest';
import { extractCertificateDers } from './pem';
import { parseCertificate } from './x509';
import { buildChain, expiryOf, matchHostname } from './chain';
import type { ParsedCert } from './types';
import {
  BADSSL_EXPIRED_LEAF,
  BADSSL_SELF_SIGNED_LEAF,
  BADSSL_WILDCARD_LEAF,
  CROSS_SIGNED_PAIR,
  DEMO_CHAIN,
  DEMO_CHAIN_MISSING_INTERMEDIATE,
  DEMO_CHAIN_NO_ROOT,
  DEMO_CHAIN_ROOT_FIRST,
  DEMO_INTERMEDIATE,
  DEMO_LEAF,
  DEMO_LEAF_NOT_YET_VALID,
  DEMO_LEAF_V1,
  DEMO_ROOT,
  ISRG_ROOT_X1,
  LE_R11,
} from './fixtures';

/** Parse every certificate in a PEM paste, in the order it was pasted. */
function certsOf(pem: string): ParsedCert[] {
  return extractCertificateDers(pem).ders.map((der, i) => {
    const cert = parseCertificate(der);
    expect(cert, `fixture certificate ${i} should parse`).not.toBeNull();
    return { ...cert!, inputIndex: i };
  });
}

const one = (pem: string) => certsOf(pem)[0];
const codes = (input: { code: string }[]) => input.map((d) => d.code);
const message = (ds: { code: string; message: string }[], code: string) =>
  ds.find((d) => d.code === code)?.message;

describe('buildChain — ordering', () => {
  it('leaves a correctly ordered leaf → intermediate → root chain alone', () => {
    const chain = buildChain(certsOf(DEMO_CHAIN));
    expect(chain.ordered.map((c) => c.commonName)).toEqual([
      'shop.example.com',
      'Example Labs Intermediate R3',
      'Example Labs Root X1',
    ]);
    expect(chain.reordered).toBe(false);
    expect(chain.roles).toEqual(['leaf', 'intermediate', 'root']);
    expect(codes(chain.diagnostics)).not.toContain('wrong-order');
    expect(codes(chain.diagnostics)).not.toContain('missing-intermediate');
  });

  it('reorders a root-first paste and says so', () => {
    const chain = buildChain(certsOf(DEMO_CHAIN_ROOT_FIRST));
    expect(chain.ordered.map((c) => c.commonName)).toEqual([
      'shop.example.com',
      'Example Labs Intermediate R3',
      'Example Labs Root X1',
    ]);
    expect(chain.reordered).toBe(true);
    expect(codes(chain.diagnostics)).toContain('wrong-order');
    expect(message(chain.diagnostics, 'wrong-order')).toBe(
      'The certificates are not in chain order — they were pasted root first. A server must send the leaf first, then each intermediate; the order below has been corrected for you.',
    );
  });

  it('accepts a single certificate as a one-link chain', () => {
    const chain = buildChain(certsOf(DEMO_LEAF));
    expect(chain.ordered.length).toBe(1);
    expect(chain.roles).toEqual(['leaf']);
    expect(chain.reordered).toBe(false);
  });

  it('emits one edge per real issuer link, plus a self-edge for a self-signed cert', () => {
    // A self-signed root's signature IS checkable — against its own key — so it
    // gets an edge pointing at itself rather than being silently unverifiable.
    const chain = buildChain(certsOf(DEMO_CHAIN));
    expect(chain.edges).toEqual([
      { subjectIndex: 0, issuerIndex: 1 },
      { subjectIndex: 1, issuerIndex: 2 },
      { subjectIndex: 2, issuerIndex: 2 },
    ]);
  });

  it('emits NO edge where the issuer is absent from the paste', () => {
    // leaf + root with the intermediate missing: nothing issued the leaf here,
    // so there is no edge to verify — only the root's self-signature.
    const chain = buildChain(certsOf(DEMO_CHAIN_MISSING_INTERMEDIATE));
    expect(chain.edges).toEqual([{ subjectIndex: 1, issuerIndex: 1 }]);
  });

  it('emits no edge at all for a lone leaf', () => {
    expect(buildChain(certsOf(DEMO_LEAF)).edges).toEqual([]);
  });
});

describe('buildChain — diagnostics', () => {
  it('names the missing intermediate by its distinguished name', () => {
    const chain = buildChain(certsOf(DEMO_CHAIN_MISSING_INTERMEDIATE));
    expect(codes(chain.diagnostics)).toContain('missing-intermediate');
    expect(message(chain.diagnostics, 'missing-intermediate')).toBe(
      'The chain is missing the intermediate that issued shop.example.com: "C=US, O=Example Labs, CN=Example Labs Intermediate R3". Browsers often paper over this by fetching or caching the intermediate; curl, openssl and most language runtimes will not, and fail with "unable to get local issuer certificate".',
    );
  });

  it('names the missing intermediate for a lone real leaf too', () => {
    const chain = buildChain(certsOf(BADSSL_WILDCARD_LEAF));
    expect(message(chain.diagnostics, 'missing-intermediate')).toContain(
      '"C=US, O=Let\'s Encrypt, CN=YR2"',
    );
  });

  it('treats an omitted ROOT as normal and correct, not as an error', () => {
    const chain = buildChain(certsOf(DEMO_CHAIN_NO_ROOT));
    expect(codes(chain.diagnostics)).not.toContain('missing-intermediate');
    expect(codes(chain.diagnostics)).toContain('root-missing');
    expect(message(chain.diagnostics, 'root-missing')).toBe(
      'The root "C=US, O=Example Labs, CN=Example Labs Root X1" is not included. That is normal and correct — clients trust roots from their own store, so sending it only adds bytes to every handshake.',
    );
    expect(chain.diagnostics.find((d) => d.code === 'root-missing')?.severity).toBe('info');
  });

  it('notes an included root as harmless', () => {
    const chain = buildChain(certsOf(DEMO_CHAIN));
    expect(codes(chain.diagnostics)).toContain('root-included');
    expect(chain.diagnostics.find((d) => d.code === 'root-included')?.severity).toBe('info');
  });

  it('flags a self-signed leaf as the reason browsers refuse it', () => {
    const chain = buildChain(certsOf(BADSSL_SELF_SIGNED_LEAF));
    expect(codes(chain.diagnostics)).toContain('self-signed-leaf');
    expect(message(chain.diagnostics, 'self-signed-leaf')).toBe(
      'This certificate is self-signed: it issued itself, so nothing vouches for it. Browsers report NET::ERR_CERT_AUTHORITY_INVALID and curl reports "self-signed certificate" unless the certificate is installed as a trust anchor.',
    );
    expect(chain.roles).toEqual(['self-signed']);
  });

  it('de-duplicates byte-identical certificates and says how many it dropped', () => {
    const chain = buildChain(certsOf([DEMO_LEAF, DEMO_INTERMEDIATE, DEMO_LEAF].join('\n')));
    expect(chain.ordered.length).toBe(2);
    expect(codes(chain.diagnostics)).toContain('duplicate');
    expect(message(chain.diagnostics, 'duplicate')).toBe(
      'shop.example.com appears 2 times in this paste — the copies are byte-identical, so 1 was dropped.',
    );
  });

  it('does NOT call a real cross-signed pair a duplicate', () => {
    // ISRG Root X2 appears twice: self-signed, and cross-signed by X1. Same
    // subject, same public key, different issuer — two distinct certificates.
    const chain = buildChain(certsOf(CROSS_SIGNED_PAIR));
    expect(chain.ordered.length).toBe(2);
    expect(codes(chain.diagnostics)).not.toContain('duplicate');
    expect(codes(chain.diagnostics)).toContain('cross-signed');
    expect(message(chain.diagnostics, 'cross-signed')).toBe(
      'Two certificates share the subject "C=US, O=Internet Security Research Group, CN=ISRG Root X2" and the same public key but have different issuers. That is a cross-signed pair, not a duplicate — it is how a newer root is made to work on older clients.',
    );
  });

  it('does NOT record a cross-signed twin as the issuer of its self-signed sibling', () => {
    // Bug: the edge loop omitted the cross-signed guard the walk applies, so the
    // self-signed ISRG Root X2 got an edge pointing at its cross-signed twin. The
    // twin has the same public key by definition, so the check "verified" and the
    // page printed "ISRG Root X2 really did sign this certificate" — naming the
    // wrong signer and suppressing the honest self-signature edge.
    const chain = buildChain(certsOf(CROSS_SIGNED_PAIR));
    expect(chain.edges.filter((e) => e.subjectIndex !== e.issuerIndex)).toEqual([]);
    expect(chain.edges).toContainEqual({ subjectIndex: 0, issuerIndex: 0 });
  });

  it('badges a certificate that is not in the chain "extra", not "leaf"', () => {
    // Bug: `roles` was mapped from each certificate's own shape, so a leftover
    // leaf was badged "Leaf" with the leaf gloss ("the end of the chain") directly
    // under the finding that says it is not part of the chain at all.
    const chain = buildChain(certsOf([DEMO_LEAF, BADSSL_WILDCARD_LEAF, DEMO_INTERMEDIATE].join('\n')));
    expect(codes(chain.diagnostics)).toContain('extra-certificate');
    expect(chain.roles).toEqual(['leaf', 'intermediate', 'extra']);
    expect(chain.ordered[2].commonName).toBe('*.badssl.com');
  });

  it('reports a v1 certificate’s own parse warnings alongside the chain ones', () => {
    const chain = buildChain(certsOf(DEMO_LEAF_V1));
    expect(chain.ordered[0].warnings.length).toBeGreaterThan(0);
  });

  it('caps the diagnostic list instead of growing it without bound', () => {
    // 120 copies of the same certificate: the dedup diagnostic must collapse
    // rather than emitting one per copy.
    const many = Array.from({ length: 120 }, () => DEMO_LEAF).join('\n');
    const chain = buildChain(certsOf(many));
    expect(chain.ordered.length).toBe(1);
    expect(chain.diagnostics.length).toBeLessThanOrEqual(20);
  });
});

describe('expiryOf — injected now, always', () => {
  const leaf = one(DEMO_LEAF); // 2026-06-01 → 2031-06-01
  const expired = one(BADSSL_EXPIRED_LEAF); // 2015-04-09 → 2015-04-12
  const future = one(DEMO_LEAF_NOT_YET_VALID); // 2028-01-01 → 2029-01-01

  it('reports a comfortably valid certificate', () => {
    const info = expiryOf(leaf, new Date('2026-07-30T00:00:00Z'));
    expect(info.state).toBe('valid');
    expect(info.urgency).toBe('ok');
    expect(info.daysRemaining).toBe(1767);
    expect(info.approximate).toBe(false);
    expect(info.text).toBe('expires in 1767 days');
  });

  it('marks a truncated day count as approximate rather than printing it as exact', () => {
    // 1766 days and 12 hours left. The count is truncated toward zero — never
    // rounded up, and never presented as if it were exact.
    const info = expiryOf(leaf, new Date('2026-07-30T12:00:00Z'));
    expect(info.daysRemaining).toBe(1766);
    expect(info.approximate).toBe(true);
    expect(info.text).toBe('expires in about 1766 days');
    // The exact instant is always available, un-rounded.
    expect(info.notAfter.toISOString()).toBe('2031-06-01T00:00:00.000Z');
  });

  it('escalates urgency at 30 days and at 7 days', () => {
    const at40 = expiryOf(leaf, new Date('2031-04-22T00:00:00Z'));
    expect(at40.daysRemaining).toBe(40);
    expect(at40.urgency).toBe('ok');

    const at29 = expiryOf(leaf, new Date('2031-05-03T00:00:00Z'));
    expect(at29.daysRemaining).toBe(29);
    expect(at29.urgency).toBe('warn30');

    const at6 = expiryOf(leaf, new Date('2031-05-26T00:00:00Z'));
    expect(at6.daysRemaining).toBe(6);
    expect(at6.urgency).toBe('warn7');
  });

  it('reports an expired certificate with how long ago', () => {
    const info = expiryOf(expired, new Date('2026-07-30T00:00:00Z'));
    expect(info.state).toBe('expired');
    expect(info.urgency).toBe('alarm');
    // notAfter is 23:59:59Z, so 4126 whole days plus a few hours have passed.
    // Truncated toward zero — an "expired 4127 days ago" would be one day of
    // invented precision in the wrong direction.
    expect(info.daysRemaining).toBe(-4126);
    expect(info.approximate).toBe(true);
    expect(info.text).toBe('expired about 4126 days ago');
  });

  it('reports the same certificate as VALID when now is inside its window', () => {
    const info = expiryOf(expired, new Date('2015-04-10T00:00:00Z'));
    expect(info.state).toBe('valid');
    expect(info.daysRemaining).toBe(2);
  });

  it('reports a not-yet-valid certificate', () => {
    const info = expiryOf(future, new Date('2026-07-30T00:00:00Z'));
    expect(info.state).toBe('not-yet-valid');
    expect(info.urgency).toBe('alarm');
    expect(info.text).toBe('not valid until 2028-01-01 — 520 days from now');
  });

  it('accepts a millisecond timestamp as well as a Date', () => {
    const a = expiryOf(leaf, new Date('2026-07-30T00:00:00Z'));
    const b = expiryOf(leaf, Date.parse('2026-07-30T00:00:00Z'));
    expect(b).toEqual(a);
  });

  it('surfaces expiry through buildChain diagnostics with an injected now', () => {
    const chain = buildChain(certsOf(BADSSL_EXPIRED_LEAF), new Date('2026-07-30T00:00:00Z'));
    expect(codes(chain.diagnostics)).toContain('expired');
    expect(message(chain.diagnostics, 'expired')).toBe(
      '*.badssl.com expired on 2015-04-12, about 4126 days ago. Every client rejects it, so there is nothing to debug here beyond renewing it.',
    );
    expect(chain.diagnostics.find((d) => d.code === 'expired')?.severity).toBe('error');
  });

  it('surfaces not-yet-valid through buildChain diagnostics', () => {
    const chain = buildChain(certsOf(DEMO_LEAF_NOT_YET_VALID), new Date('2026-07-30T00:00:00Z'));
    expect(codes(chain.diagnostics)).toContain('not-yet-valid');
    expect(message(chain.diagnostics, 'not-yet-valid')).toContain('2028-01-01');
    expect(message(chain.diagnostics, 'not-yet-valid')).toContain('clock');
  });

  it('warns when a leaf is inside the 30-day window', () => {
    const chain = buildChain(certsOf(DEMO_LEAF), new Date('2031-05-20T00:00:00Z'));
    expect(codes(chain.diagnostics)).toContain('expiring-soon');
    expect(chain.diagnostics.find((d) => d.code === 'expiring-soon')?.severity).toBe('warning');
  });
});

describe('matchHostname — RFC 6125', () => {
  const wildcard = one(BADSSL_WILDCARD_LEAF); // SANs: *.badssl.com, badssl.com
  const demo = one(DEMO_LEAF); // shop.example.com, *.shop.example.com, api.example.net, 2 IPs
  const v1 = one(DEMO_LEAF_V1); // CN=shop.example.com, no SANs at all

  it('matches an exact DNS SAN', () => {
    const r = matchHostname(demo, 'shop.example.com');
    expect(r.matched).toBe(true);
    expect(r.matchedSan).toBe('shop.example.com');
    expect(r.reason).toBe('shop.example.com is listed as a DNS name in the certificate.');
  });

  it('is case-insensitive and tolerates a trailing dot', () => {
    expect(matchHostname(demo, 'SHOP.Example.COM').matched).toBe(true);
    expect(matchHostname(demo, 'shop.example.com.').matched).toBe(true);
  });

  it('lets a wildcard cover exactly one leftmost label', () => {
    const r = matchHostname(wildcard, 'www.badssl.com');
    expect(r.matched).toBe(true);
    expect(r.matchedSan).toBe('*.badssl.com');
    expect(r.reason).toBe(
      'www.badssl.com is covered by the wildcard *.badssl.com — a wildcard replaces exactly one label.',
    );
  });

  it('does NOT let a wildcard cover two labels', () => {
    const r = matchHostname(wildcard, 'wrong.host.badssl.com');
    expect(r.matched).toBe(false);
    expect(r.reason).toBe(
      'No SAN matches wrong.host.badssl.com. *.badssl.com replaces exactly one label, so it covers host.badssl.com but not wrong.host.badssl.com. The certificate lists: *.badssl.com, badssl.com.',
    );
  });

  it('does NOT let a wildcard match the bare parent domain', () => {
    // *.shop.example.com must not match shop.example.com — but the demo leaf
    // also lists the apex explicitly, so use a certificate that does not.
    const r = matchHostname(wildcard, 'badssl.com');
    expect(r.matched).toBe(true); // matched by the explicit apex SAN, not the wildcard
    expect(r.matchedSan).toBe('badssl.com');
    const parentOnly = matchHostname(demo, 'example.com');
    expect(parentOnly.matched).toBe(false);
  });

  it('matches an IPv4 SAN exactly', () => {
    const r = matchHostname(demo, '203.0.113.10');
    expect(r.matched).toBe(true);
    expect(r.matchedSan).toBe('203.0.113.10');
    expect(r.reason).toBe('203.0.113.10 is listed as an IP address in the certificate.');
  });

  it('matches an IPv6 SAN regardless of how it is written', () => {
    expect(matchHostname(demo, '2001:db8::10').matched).toBe(true);
    expect(matchHostname(demo, '2001:0DB8:0000:0000:0000:0000:0000:0010').matched).toBe(true);
    expect(matchHostname(demo, '[2001:db8::10]').matched).toBe(true);
  });

  it('never lets a wildcard match an IP address', () => {
    expect(matchHostname(wildcard, '203.0.113.10').matched).toBe(false);
    expect(matchHostname(demo, '203.0.113.11').matched).toBe(false);
  });

  it('falls back to the CN only when there is no SAN at all, and warns', () => {
    const r = matchHostname(v1, 'shop.example.com');
    expect(r.matched).toBe(true);
    expect(r.usedCn).toBe(true);
    expect(r.reason).toBe(
      'This certificate has no subjectAltName, so the check fell back to its commonName "shop.example.com". Chrome, Firefox and Safari stopped reading commonName in 2017 — they will reject this certificate no matter what host you serve it on.',
    );
  });

  it('ignores the CN when SANs exist, even if the CN matches', () => {
    // The badssl leaf's CN is *.badssl.com and its SANs cover it, but a CN-only
    // match must never rescue a name the SANs do not list.
    const r = matchHostname(wildcard, 'nope.example.org');
    expect(r.matched).toBe(false);
    expect(r.usedCn).toBeUndefined();
  });

  it('rejects an over-broad wildcard rather than honouring it', () => {
    const fake: ParsedCert = {
      ...demo,
      sans: [{ kind: 'dns', value: '*.com' }],
    };
    const r = matchHostname(fake, 'example.com');
    expect(r.matched).toBe(false);
    expect(r.reason).toContain('*.com is too broad to match anything');
  });

  it('refuses a partial-label wildcard (RFC 6125 §6.4.3)', () => {
    const fake: ParsedCert = {
      ...demo,
      sans: [{ kind: 'dns', value: 'w*.example.com' }],
    };
    expect(matchHostname(fake, 'www.example.com').matched).toBe(false);
  });

  it('refuses a URL instead of matching it against a wildcard', () => {
    // Bug: `https://www.shop.example.com` ended `.shop.example.com`, and the
    // residual prefix `https://www` holds no dot, so it was accepted as "exactly
    // one label" and the tool answered "Matches" with the wildcard rule quoted at
    // it. A URL is not a hostname; refuse it by name and never rewrite the value.
    const r = matchHostname(demo, 'https://www.shop.example.com');
    expect(r.matched).toBe(false);
    expect(r.unusable).toBe(true);
    expect(r.reason).toContain('That looks like a URL');
    expect(r.hostname).toBe('https://www.shop.example.com');
  });

  it('refuses a host:port pair rather than reporting a correct certificate as no-match', () => {
    // Bug: nothing stripped the port, so `www.shop.example.com:443` — a host the
    // certificate genuinely covers via *.shop.example.com — came back "No match"
    // with no mention of the port. At 2am that reads as "my SAN list is wrong".
    const r = matchHostname(demo, 'www.shop.example.com:443');
    expect(r.matched).toBe(false);
    expect(r.unusable).toBe(true);
    expect(r.reason).toContain('host:port');
    // The same host without the port still matches, so the guard is not swallowing
    // the legitimate case.
    expect(matchHostname(demo, 'www.shop.example.com').matched).toBe(true);
  });

  it('refuses other non-hostname shapes but leaves IPv6 literals alone', () => {
    expect(matchHostname(demo, 'user@shop.example.com').unusable).toBe(true);
    expect(matchHostname(demo, 'shop.example.com extra').unusable).toBe(true);
    expect(matchHostname(demo, 'shop.example.com/health').unusable).toBe(true);
    // IPv6 is full of colons and must still be matched, bare or bracketed.
    expect(matchHostname(demo, '2001:db8::10').matched).toBe(true);
    expect(matchHostname(demo, '[2001:db8::10]').matched).toBe(true);
    expect(matchHostname(demo, '2001:db8::10').unusable).toBeUndefined();
  });

  it('refuses a zero-padded IPv4 octet instead of reading it as decimal', () => {
    // Bug: IPV4_RE allowed \d{1,3} and Number('010') === 10, so 203.0.113.010
    // "matched" the 203.0.113.10 IP SAN — but inet_aton/glibc read 010 as octal,
    // so the host the OS dials is 203.0.113.8. Same policy as ip-core (099f8c2).
    const r = matchHostname(demo, '203.0.113.010');
    expect(r.matched).toBe(false);
    expect(r.unusable).toBe(true);
    expect(r.reason).toContain('no leading zeros');
    // The unpadded address still matches.
    expect(matchHostname(demo, '203.0.113.10').matched).toBe(true);
  });

  it('handles an empty or absurd hostname without throwing', () => {
    for (const host of ['', '   ', '.', '..', '*', 'a'.repeat(5000), '<img>', '256.256.256.256']) {
      expect(() => matchHostname(demo, host)).not.toThrow();
      expect(matchHostname(demo, host).matched).toBe(false);
    }
  });
});

describe('real chains from the wild', () => {
  it('orders R11 under ISRG Root X1', () => {
    const chain = buildChain(certsOf([ISRG_ROOT_X1, LE_R11].join('\n')));
    expect(chain.ordered.map((c) => c.commonName)).toEqual(['R11', 'ISRG Root X1']);
    expect(chain.roles).toEqual(['intermediate', 'root']);
    expect(chain.reordered).toBe(true);
  });

  it('never throws on an empty certificate list', () => {
    expect(() => buildChain([])).not.toThrow();
    const chain = buildChain([]);
    expect(chain.ordered).toEqual([]);
    expect(chain.edges).toEqual([]);
  });
});
