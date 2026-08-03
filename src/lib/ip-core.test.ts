import { describe, expect, it } from 'vitest';
import { parseIPv4, ipv4ToString, parseCidr, parseIPv6, ipv6Compress, relate, classifyIPv4, classifyIPv6 } from './ip-core';

/**
 * ip-core is shared by all six networking tools, so its parsing decisions set
 * every one of their verdicts. It had no tests of its own until now.
 */
describe('parseIPv4 — leading zeros are rejected, not reinterpreted', () => {
  // A leading zero is genuinely ambiguous: inet_aton(3) and anything built on
  // it read `010` as OCTAL 8, while this parser read it as decimal 10. That
  // disagreement is a well-known ACL/SSRF bypass — a checker that says
  // "010.0.0.1 is inside 10.0.0.0/24" is wrong under the octal reading and
  // gives a false sense of safety. Go net/netip, Python ipaddress and Node
  // net.isIP all reject the form outright rather than pick a side.
  it('rejects a zero-padded octet', () => {
    expect(parseIPv4('010.0.0.1')).toBeNull();
  });

  it('rejects zero padding in any position', () => {
    for (const s of ['00.0.0.1', '1.02.3.4', '1.2.003.4', '1.2.3.04']) {
      expect(parseIPv4(s), s).toBeNull();
    }
  });

  it('still accepts a bare zero octet', () => {
    expect(parseIPv4('0.0.0.0')).toBe(0n);
    expect(parseIPv4('10.0.0.0')).not.toBeNull();
  });

  it('still accepts ordinary addresses', () => {
    expect(ipv4ToString(parseIPv4('192.168.1.10')!)).toBe('192.168.1.10');
    expect(ipv4ToString(parseIPv4('255.255.255.255')!)).toBe('255.255.255.255');
    expect(ipv4ToString(parseIPv4('8.8.8.8')!)).toBe('8.8.8.8');
  });

  it('still rejects the pre-existing invalid forms', () => {
    for (const s of ['256.0.0.1', '1.2.3', '1.2.3.4.5', '', 'abc', '1.2.3.-1']) {
      expect(parseIPv4(s), JSON.stringify(s)).toBeNull();
    }
  });

  it('still trims surrounding whitespace (deliberate, for pasted lists)', () => {
    expect(parseIPv4('  1.2.3.4  ')).toBe(parseIPv4('1.2.3.4'));
  });

  it('rejects a padded octet inside a CIDR too', () => {
    expect(parseCidr('010.0.0.0/24')).toBeNull();
    expect(parseCidr('10.0.0.0/24')).not.toBeNull();
  });
});

describe('parseIPv6 — an embedded IPv4 may only terminate the address', () => {
  // RFC 4291 §2.2.3 allows a dotted quad ONLY as the final element. The parser
  // split on '::' and enforced "last segment" per HALF, so a dotted quad at the
  // end of the HEAD half slipped through: '1.2.3.4::' parsed as 102:304:: — a
  // completely different, valid-looking address. Both net.isIP() and the WHATWG
  // URL parser reject that input, and the cidr-checker would have folded the
  // silently-substituted block into a merged range and offered it via Copy all.
  it('rejects a dotted quad in the head half of a :: address', () => {
    expect(parseIPv6('1.2.3.4::')).toBeNull();
    expect(parseIPv6('1.2.3.4::5')).toBeNull();
    expect(parseIPv6('1:2:3.4.5.6::')).toBeNull();
  });

  it('rejects a dotted quad mid-address when there is no ::', () => {
    expect(parseIPv6('2001:db8:1.2.3.4:0:0:0:0')).toBeNull();
  });

  it('still accepts a dotted quad as the true tail', () => {
    expect(parseIPv6('::ffff:192.168.1.1')).not.toBeNull();
    expect(parseIPv6('64:ff9b::192.0.2.33')).not.toBeNull(); // NAT64, tail of the tail half
    expect(parseIPv6('2001:db8:0:0:0:0:1.2.3.4')).not.toBeNull(); // no ::, quad is final
    expect(parseIPv6('::1.2.3.4')).not.toBeNull(); // empty head half
  });

  it('the accepted forms still resolve to the right address', () => {
    expect(ipv6Compress(parseIPv6('::ffff:192.168.1.1')!)).toBe(
      ipv6Compress(parseIPv6('::ffff:c0a8:101')!),
    );
  });
});

describe('relate — address families are never compared as bare integers', () => {
  // relate() unpacked both CIDRs to [start, end] BigInts and compared them with
  // no version check, so the IPv4 and IPv6 number lines were treated as one.
  // Not reachable through today's UI (cidr-checker buckets by family first),
  // but the next caller that forgets to pre-bucket gets silent false
  // containment — the worst possible failure for a membership tool.
  const r = (a: string, b: string) => relate(parseCidr(a)!, parseCidr(b)!);

  it('every IPv4 block is disjoint from ::/0, both directions', () => {
    expect(r('10.0.0.0/8', '::/0')).toBe('disjoint');
    expect(r('::/0', '10.0.0.0/8')).toBe('disjoint');
  });

  it('numerically identical ranges in different families are not equal', () => {
    // 10.0.0.0/8 and ::a00:0/104 occupy the same integer range.
    expect(r('10.0.0.0/8', '::a00:0/104')).toBe('disjoint');
  });

  it('same-family relations are unchanged', () => {
    expect(r('10.0.0.0/8', '10.0.0.0/8')).toBe('equal');
    expect(r('10.1.0.0/16', '10.0.0.0/8')).toBe('within');
    expect(r('10.0.0.0/8', '10.1.0.0/16')).toBe('contains');
    expect(r('10.0.0.0/25', '10.0.0.128/25')).toBe('disjoint');
    expect(r('2001:db8::/32', '2001:db8:1::/48')).toBe('contains');
  });
});

describe('parseCidr — the prefix gets the same leading-zero strictness as the octets', () => {
  // parseCidr rejected '010.0.0.0/24' (octal ambiguity) while accepting
  // '10.0.0.0/024' — the same lexical form, opposite treatment, one function.
  it('rejects a zero-padded prefix', () => {
    expect(parseCidr('10.0.0.0/024')).toBeNull();
    expect(parseCidr('10.0.0.0/00')).toBeNull();
    expect(parseCidr('2001:db8::/064')).toBeNull();
  });

  it('keeps /0 and every unpadded prefix', () => {
    expect(parseCidr('0.0.0.0/0')).not.toBeNull();
    expect(parseCidr('10.0.0.0/8')).not.toBeNull();
    expect(parseCidr('10.0.0.0/24')).not.toBeNull();
    expect(parseCidr('10.0.0.0/32')).not.toBeNull();
    expect(parseCidr('2001:db8::/128')).not.toBeNull();
  });
});

describe('ipv6Compress — RFC 5952 §5 dotted form for IPv4-mapped addresses', () => {
  it('renders ::ffff:0:0/96 addresses with a dotted tail', () => {
    expect(ipv6Compress(parseIPv6('::ffff:192.168.1.1')!)).toBe('::ffff:192.168.1.1');
    expect(ipv6Compress(parseIPv6('::ffff:0.0.0.0')!)).toBe('::ffff:0.0.0.0');
    expect(ipv6Compress(parseIPv6('::ffff:255.255.255.255')!)).toBe('::ffff:255.255.255.255');
  });

  it('leaves every other address in hex', () => {
    // ::/96 "IPv4-compatible" is deprecated (RFC 4291 §2.5.5.1) — do NOT extend
    // the dotted form to it, or ::c0a8:101 starts rendering as ::192.168.1.1.
    expect(ipv6Compress(parseIPv6('::192.168.1.1')!)).toBe('::c0a8:101');
    expect(ipv6Compress(parseIPv6('::1')!)).toBe('::1');
    expect(ipv6Compress(parseIPv6('64:ff9b::192.0.2.33')!)).toBe('64:ff9b::c000:221');
  });

  it('regression pins: compression rules are untouched', () => {
    expect(ipv6Compress(parseIPv6('::')!)).toBe('::');
    // RFC 5952 §4.2.3 — first of two equal-length runs wins.
    expect(ipv6Compress(parseIPv6('0:0:1:0:0:1:0:0')!)).toBe('::1:0:0:1:0:0');
    // §4.2.2 — a single zero group is never shortened to '::'.
    expect(ipv6Compress(parseIPv6('2001:db8:0:1:1:1:1:1')!)).toBe('2001:db8:0:1:1:1:1:1');
  });
});

describe('classifyIPv4 — special-purpose ranges are not "public"', () => {
  const c = (s: string) => classifyIPv4(parseIPv4(s)!);

  it('labels the documentation nets (RFC 5737)', () => {
    // Calling 203.0.113.0/24 "Public / global unicast" is exactly backwards for
    // a range whose entire purpose is that it is NOT routable.
    for (const a of ['192.0.2.1', '198.51.100.4', '203.0.113.9']) {
      expect(c(a)).toMatch(/Documentation/);
    }
    expect(c('192.0.2.1')).toContain('RFC 5737');
  });

  it('labels benchmarking and the deprecated 6to4 relay', () => {
    expect(c('198.18.0.1')).toMatch(/Benchmarking/);
    expect(c('198.19.255.255')).toMatch(/Benchmarking/); // /15 spans both
    expect(c('192.88.99.1')).toMatch(/6to4/);
  });

  it('limited broadcast beats the 240/4 reserved bucket', () => {
    expect(c('255.255.255.255')).toMatch(/broadcast/i);
    expect(c('240.0.0.1')).toBe('Reserved (240.0.0.0/4)'); // still reserved
  });

  it('leaves every existing verdict alone', () => {
    expect(c('10.0.0.1')).toBe('Private (RFC 1918)');
    expect(c('172.16.0.1')).toBe('Private (RFC 1918)');
    expect(c('192.168.1.1')).toBe('Private (RFC 1918)');
    expect(c('127.0.0.1')).toBe('Loopback (127.0.0.0/8)');
    expect(c('169.254.1.1')).toBe('Link-local / APIPA (169.254.0.0/16)');
    expect(c('100.64.0.1')).toBe('Carrier-grade NAT (RFC 6598)');
    expect(c('224.0.0.1')).toBe('Multicast (224.0.0.0/4)');
    expect(c('0.0.0.0')).toBe('This network (0.0.0.0/8)');
    expect(c('8.8.8.8')).toBe('Public / global unicast');
    expect(c('198.17.255.255')).toBe('Public / global unicast'); // just below 198.18/15
    expect(c('198.20.0.0')).toBe('Public / global unicast'); // just above
  });
});

describe('classifyIPv6 — transition ranges', () => {
  const c = (s: string) => classifyIPv6(parseIPv6(s)!);

  it('labels NAT64 and 6to4', () => {
    expect(c('64:ff9b::1')).toMatch(/NAT64/);
    expect(c('2002:c000:204::1')).toMatch(/6to4/);
  });

  it('leaves every existing verdict alone', () => {
    expect(c('::')).toBe('Unspecified (::)');
    expect(c('::1')).toBe('Loopback (::1)');
    expect(c('ff02::1')).toBe('Multicast (ff00::/8)');
    expect(c('fe80::1')).toBe('Link-local (fe80::/10)');
    expect(c('fd00::1')).toBe('Unique local — ULA (fc00::/7)');
    expect(c('2001:db8::1')).toBe('Documentation (2001:db8::/32)');
    expect(c('::ffff:192.168.1.1')).toBe('IPv4-mapped (::ffff:0:0/96)');
    expect(c('2001:4860:4860::8888')).toBe('Global unicast (2000::/3)');
  });
});
