import { describe, expect, it } from 'vitest';
import { parseIPv4, ipv4ToString, parseCidr } from './ip-core';

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
