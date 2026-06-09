/**
 * JWT Decoder — engine tests. These lock down the documented behaviour of the
 * pure `decode()` and the async `verify()`: the canonical HS256 sample decodes
 * to its known claims, an exp-in-the-past token renders an "expired" error row
 * (against a FIXED nowMs so the suite is deterministic), malformed input never
 * throws and reports { valid:false }, HMAC verification matches only the right
 * secret, and an RS256 token with no PEM key is reported as 'unsupported'.
 *
 * Real, documented vectors are used throughout — no snapshots.
 */
import { describe, it, expect } from 'vitest';
import { decode, verify } from './engine';
import { examples } from './examples';

/** The canonical jwt.io sample: HS256, signed with "your-256-bit-secret". */
const classicToken = examples.find((e) => e.id === 'hs256')!.token;
/** Bundled sample whose exp is 1577836800 (2020-01-01 00:00:00 UTC). */
const expiredToken = examples.find((e) => e.id === 'expired')!.token;

/** Encode an object as a base64url JWT segment (Node Buffer is fine in tests). */
function b64u(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

describe('decode()', () => {
  it('decodes the canonical HS256 sample (alg HS256, sub 1234567890, name John Doe)', () => {
    const r = decode(classicToken);

    expect(r.valid).toBe(true);
    expect(r.alg).toBe('HS256');
    expect(r.typ).toBe('JWT');

    // The payload is pretty-printed JSON; parsing it back reveals the claims.
    const payload = JSON.parse(r.payload!);
    expect(payload.sub).toBe('1234567890');
    expect(payload.name).toBe('John Doe');
    expect(payload.iat).toBe(1516239022);

    // Registered-claim rows: sub is surfaced verbatim.
    const sub = r.claims.find((c) => c.label === 'Subject (sub)');
    expect(sub?.value).toBe('1234567890');

    // No exp on this token -> advisory warning, and the third segment is kept.
    expect(r.warnings.some((w) => w.toLowerCase().includes('no exp'))).toBe(true);
    expect(r.signatureB64).toBe('SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
  });

  it('flags an exp-in-the-past token (fixed nowMs) with tone "error" and "(expired)"', () => {
    // The token's exp is 2020-01-01; freeze "now" a year later so it is past.
    const nowMs = Date.UTC(2021, 0, 1); // 1609459200000
    const r = decode(expiredToken, nowMs);

    expect(r.valid).toBe(true);
    const exp = r.claims.find((c) => c.label === 'Expires (exp)');
    expect(exp).toBeDefined();
    expect(exp!.tone).toBe('error');
    expect(exp!.value).toContain('(expired)');
    // Raw epoch and decoded UTC instant are both shown.
    expect(exp!.value).toContain('1577836800');
    expect(exp!.value).toContain('2020-01-01 00:00:00 UTC');
  });

  it('does NOT mark exp expired when nowMs is at/before the exp instant', () => {
    // nowMs exactly equal to exp*1000 -> n*1000 < nowMs is false -> still ok.
    const r = decode(expiredToken, 1577836800 * 1000);
    const exp = r.claims.find((c) => c.label === 'Expires (exp)');
    expect(exp!.tone).toBe('ok');
    expect(exp!.value).not.toContain('(expired)');
  });

  it.each([
    ['empty string', ''],
    ['whitespace only', '   '],
    ['no dots', 'not-a-jwt'],
    ['two parts', 'a.b'],
    ['four parts', 'a.b.c.d'],
    ['non-base64url header', '@@@.@@@.@@@'],
    ['valid base64url but not JSON', 'aGVsbG8.d29ybGQ.sig'],
  ])('returns { valid:false } without throwing: %s', (_label, token) => {
    let r!: ReturnType<typeof decode>;
    expect(() => {
      r = decode(token);
    }).not.toThrow();
    expect(r.valid).toBe(false);
    expect(typeof r.error).toBe('string');
    expect(r.error!.length).toBeGreaterThan(0);
    // Stable shape: callers can always read these.
    expect(r.claims).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('warns on an unsecured alg "none" token', () => {
    const none = examples.find((e) => e.id === 'alg-none')!.token;
    const r = decode(none);
    expect(r.valid).toBe(true);
    expect(r.alg).toBe('none');
    expect(r.warnings.some((w) => w.includes('"none"'))).toBe(true);
  });
});

describe('verify()', () => {
  it('resolves "valid" for the canonical token with the correct secret', async () => {
    const r = await verify(classicToken, 'your-256-bit-secret');
    expect(r.status).toBe('valid');
  });

  it('resolves "invalid" for the canonical token with a wrong secret', async () => {
    const r = await verify(classicToken, 'not-the-right-secret');
    expect(r.status).toBe('invalid');
  });

  it('resolves "unsupported" for an RS256 token when no PEM key is supplied', async () => {
    const rs256Token =
      `${b64u({ alg: 'RS256', typ: 'JWT' })}.` +
      `${b64u({ sub: 'rsa-user', iat: 1700000000 })}.` +
      `${Buffer.from('placeholder-signature').toString('base64url')}`;

    // The engine decodes fine; only verification is unsupported without a key.
    expect(decode(rs256Token).alg).toBe('RS256');

    const r = await verify(rs256Token, 'a-shared-secret-that-cannot-verify-rsa');
    expect(r.status).toBe('unsupported');
  });

  it('does not throw on a malformed token; resolves an "error" status', async () => {
    let r!: Awaited<ReturnType<typeof verify>>;
    await expect(
      (async () => {
        r = await verify('a.b', 'whatever');
      })(),
    ).resolves.not.toThrow();
    expect(r.status).toBe('error');
  });
});
