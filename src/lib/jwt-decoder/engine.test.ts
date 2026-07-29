/**
 * JWT Decoder & Encoder — engine tests. These lock down the documented
 * behaviour of the pure `decode()`, the async `verify()` across the full JWS
 * matrix (HS/RS/PS/ES/EdDSA; secrets, PEM, JWK, JWKS), `sign()` (round-trips
 * for every algorithm), `generateKeys()`, and the security lint.
 *
 * Real, documented vectors are used throughout — RFC 7515 §A.1 (HS256) and
 * §A.3 (ES256), RFC 8037 §A.4 (Ed25519) — no snapshots. Ed25519 cases are
 * capability-gated so the suite passes on runtimes without it.
 */
import { describe, it, expect } from 'vitest';
import { decode, verify, sign, generateKeys } from './engine';
import { classifyKeyInput, jwksCandidates, b64uToBytes, bytesToB64u } from './keys';
import { examples } from './examples';

/** The canonical jwt.io sample: HS256, signed with "your-256-bit-secret". */
const classicToken = examples.find((e) => e.id === 'hs256')!.token;
/** Bundled sample whose exp is 1577836800 (2020-01-01 00:00:00 UTC). */
const expiredToken = examples.find((e) => e.id === 'expired')!.token;

/** Encode an object as a base64url JWT segment (Node Buffer is fine in tests). */
function b64u(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/** RFC 7515 §A.3 — ES256 token and its P-256 key (public + private forms). */
const ES256_TOKEN =
  'eyJhbGciOiJFUzI1NiJ9.eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ.DtEhU3ljbEg8L38VWAfUAqOyKAM6-Xx-F4GawxaepmXFCgfTjDxw5djxLa8ISlSApmWQxfKTUJqPP3-Kg6NU1Q';
const ES256_PUBLIC_JWK =
  '{"kty":"EC","crv":"P-256","x":"f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU","y":"x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0"}';
const ES256_PRIVATE_JWK =
  '{"kty":"EC","crv":"P-256","x":"f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU","y":"x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0","d":"jpsQnnGQmL-YBIffH1136cspYG6-0iY7X1fCE9-E9LI"}';

/** RFC 8037 §A.4 — Ed25519 JWS and its OKP key. */
const ED25519_TOKEN =
  'eyJhbGciOiJFZERTQSJ9.RXhhbXBsZSBvZiBFZDI1NTE5IHNpZ25pbmc.hgyY0il_MGCjP0JzlnLWG1PPOt7-09PGcvMg3AIbQR6dWbhijcNR4ki4iylGjg5BhVsPt9g7sVvpAr_MuM0KAg';
const ED25519_PUBLIC_JWK =
  '{"kty":"OKP","crv":"Ed25519","x":"11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo"}';
const ED25519_PRIVATE_JWK =
  '{"kty":"OKP","crv":"Ed25519","x":"11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo","d":"nWGxne_9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A"}';

/** True when this runtime's Web Crypto has Ed25519 (Node 20+ does). */
const hasEd25519 = await (async () => {
  try {
    await globalThis.crypto.subtle.importKey(
      'jwk',
      JSON.parse(ED25519_PUBLIC_JWK),
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    return true;
  } catch {
    return false;
  }
})();

const HEADER_JSON = '{"alg":"HS256","typ":"JWT"}';
const PAYLOAD_JSON = '{"sub":"user-1","name":"Test User","iat":1700000000}';

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

  it('flags an exp-in-the-past token (fixed nowMs) with tone "error" and a relative "(expired … ago)"', () => {
    // The token's exp is 2020-01-01; freeze "now" a year later so it is past.
    const nowMs = Date.UTC(2021, 0, 1); // 1609459200000
    const r = decode(expiredToken, nowMs);

    expect(r.valid).toBe(true);
    const exp = r.claims.find((c) => c.label === 'Expires (exp)');
    expect(exp).toBeDefined();
    expect(exp!.tone).toBe('error');
    expect(exp!.value).toMatch(/\(expired .+ ago\)/);
    // Raw epoch and decoded UTC instant are both shown.
    expect(exp!.value).toContain('1577836800');
    expect(exp!.value).toContain('2020-01-01 00:00:00 UTC');
  });

  it('does NOT mark exp expired when nowMs is at/before the exp instant', () => {
    // nowMs exactly equal to exp*1000 -> n*1000 < nowMs is false -> still ok.
    const r = decode(expiredToken, 1577836800 * 1000);
    const exp = r.claims.find((c) => c.label === 'Expires (exp)');
    expect(exp!.tone).toBe('ok');
    expect(exp!.value).not.toMatch(/\(expired/);
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

  it('gives every registered claim a plain-English caption', () => {
    const many = examples.find((e) => e.id === 'many-claims')!.token;
    const r = decode(many, 1700000001000);
    expect(r.claims.length).toBeGreaterThanOrEqual(7);
    for (const claim of r.claims) {
      expect(claim.caption, `caption for ${claim.label}`).toBeTruthy();
    }
  });
});

describe('relative time on claims (REQ-4)', () => {
  const nowMs = 1700000000 * 1000;
  it('future exp reads "(expires in 42 minutes)"', () => {
    const r = decode(`${b64u({ alg: 'HS256' })}.${b64u({ exp: 1700000000 + 42 * 60 })}.x`, nowMs);
    expect(r.claims.find((c) => c.label.startsWith('Expires'))!.value).toContain('(expires in 42 minutes)');
  });
  it('past iat reads "(2 hours ago)"', () => {
    const r = decode(`${b64u({ alg: 'HS256' })}.${b64u({ iat: 1700000000 - 7200, exp: 1700000000 + 60 })}.x`, nowMs);
    expect(r.claims.find((c) => c.label.startsWith('Issued'))!.value).toContain('(2 hours ago)');
  });
  it('exp exactly at now reads "(expires just now)" — boundary is not-expired', () => {
    const r = decode(expiredToken, 1577836800 * 1000);
    expect(r.claims.find((c) => c.label.startsWith('Expires'))!.value).toContain('(expires just now)');
  });
  it('future nbf reads "(not yet valid — in …)"', () => {
    const r = decode(`${b64u({ alg: 'HS256' })}.${b64u({ nbf: 1700000000 + 600, exp: 1700000000 + 3600 })}.x`, nowMs);
    expect(r.claims.find((c) => c.label.startsWith('Not before'))!.value).toMatch(/\(not yet valid — in 10 minutes\)/);
  });
});

describe('specific decode errors (REQ-3)', () => {
  it('names the found segment count', () => {
    expect(decode('a.b').error).toContain('found 2');
    expect(decode('a.b.c.d').error).toContain('found 4');
  });
  it('distinguishes bad base64url from bad JSON, naming the segment', () => {
    const badB64 = decode('@@@.eyJhIjoxfQ.x');
    expect(badB64.error).toMatch(/header.*base64url/i);
    const badJson = decode(`${Buffer.from('hello').toString('base64url')}.${b64u({ a: 1 })}.x`);
    expect(badJson.error).toMatch(/header.*JSON/i);
  });
  it('renders the header partially when only the payload is broken', () => {
    const r = decode(`${b64u({ alg: 'HS256', typ: 'JWT' })}.@@@.x`);
    expect(r.valid).toBe(false);
    expect(r.partial?.header).toContain('"alg"');
    expect(r.partial?.failedSegment).toBe('payload');
    expect(r.partial?.segmentError).toMatch(/base64url/i);
  });
  it('alg:"none" stays a decoded-with-warning state, never an error (REQ-3)', () => {
    const none = examples.find((e) => e.id === 'alg-none')!.token;
    const r = decode(none);
    expect(r.valid).toBe(true);
    expect(r.error).toBeUndefined();
    expect(r.warnings.some((w) => w.includes('"none"'))).toBe(true);
  });
});

describe('freshness (REQ-1 pill)', () => {
  const nowMs = 1700000000 * 1000;
  it('expired token → state "expired" with relative phrase', () => {
    const r = decode(`${b64u({ alg: 'HS256' })}.${b64u({ exp: 1700000000 - 3 * 86400 })}.x`, nowMs);
    expect(r.freshness?.state).toBe('expired');
    expect(r.freshness?.detail).toContain('3 days ago');
  });
  it('nbf in the future → "not-yet"', () => {
    const r = decode(
      `${b64u({ alg: 'HS256' })}.${b64u({ nbf: 1700000000 + 3600, exp: 1700000000 + 7200 })}.x`,
      nowMs,
    );
    expect(r.freshness?.state).toBe('not-yet');
  });
  it('inside the window → "valid"', () => {
    const r = decode(
      `${b64u({ alg: 'HS256' })}.${b64u({ nbf: 1700000000 - 60, exp: 1700000000 + 3600 })}.x`,
      nowMs,
    );
    expect(r.freshness?.state).toBe('valid');
    expect(r.freshness?.detail).toContain('in 1 hour');
  });
  it('no exp/nbf → "none", phrased neutrally (not an error)', () => {
    const r = decode(classicToken, nowMs);
    expect(r.freshness?.state).toBe('none');
  });
  it('non-numeric exp → "none" (never throws)', () => {
    const r = decode(`${b64u({ alg: 'HS256' })}.${b64u({ exp: 'soon' })}.x`, nowMs);
    expect(r.freshness?.state).toBe('none');
  });
  it.each([
    ['null', null],
    ['boolean', true],
    ['array', []],
    ['empty string', ''],
  ])('non-NumericDate exp (%s) never reads as "Expired since 1970"', (_label, exp) => {
    // RFC 7519 §4.1.4: NumericDate MUST be a number. null/true/[]/"" all
    // Number()-coerce to finite 0/1 — the verdict and the claims row must
    // treat them as absent, not as the epoch.
    const r = decode(`${b64u({ alg: 'HS256' })}.${b64u({ exp })}.x`, nowMs);
    expect(r.freshness?.state).toBe('none');
    const row = r.claims.find((c) => c.label.startsWith('Expires'));
    expect(row?.tone).not.toBe('error');
    expect(row?.value ?? '').not.toContain('1970');
  });
  it('numeric-STRING exp stays tolerated (real-world issuers emit them)', () => {
    const r = decode(`${b64u({ alg: 'HS256' })}.${b64u({ exp: String(1700000000 + 3600) })}.x`, nowMs);
    expect(r.freshness?.state).toBe('valid');
  });
  it('absurd finite epoch beyond Date range → detail falls back to the raw number, never "null"', () => {
    const r = decode(`${b64u({ alg: 'HS256' })}.${b64u({ exp: 1e18 })}.x`, nowMs);
    expect(r.freshness?.detail).not.toContain('null');
  });
});

describe('security lint (via decode)', () => {
  const nowMs = 1700000000 * 1000;

  it('warns on a long-lived exp (more than a year out)', () => {
    const token = `${b64u({ alg: 'HS256' })}.${b64u({ exp: 1700000000 + 2 * 365 * 86400 })}.x`;
    const r = decode(token, nowMs);
    expect(r.warnings.some((w) => w.toLowerCase().includes('long-lived'))).toBe(true);
  });

  it('does not warn on a short-lived exp', () => {
    const token = `${b64u({ alg: 'HS256' })}.${b64u({ exp: 1700000000 + 3600 })}.x`;
    const r = decode(token, nowMs);
    expect(r.warnings.some((w) => w.toLowerCase().includes('long-lived'))).toBe(false);
  });

  it('warns on an unusual typ header', () => {
    const token = `${b64u({ alg: 'HS256', typ: 'CUSTOM' })}.${b64u({ exp: 1700003600 })}.x`;
    const r = decode(token, nowMs);
    expect(r.warnings.some((w) => w.includes('typ'))).toBe(true);
  });

  it('warns when the header carries a crit parameter', () => {
    const token = `${b64u({ alg: 'HS256', crit: ['b64'], b64: false })}.${b64u({ exp: 1700003600 })}.x`;
    const r = decode(token, nowMs);
    expect(r.warnings.some((w) => w.includes('crit'))).toBe(true);
  });

  it('warns on an oversized token (> 8 KB)', () => {
    const token = `${b64u({ alg: 'HS256' })}.${b64u({ exp: 1700003600, blob: 'x'.repeat(9000) })}.x`;
    const r = decode(token, nowMs);
    expect(r.warnings.some((w) => w.toLowerCase().includes('large token'))).toBe(true);
  });
});

describe('classifyKeyInput()', () => {
  it.each([
    ['secret', 'your-256-bit-secret', 'secret'],
    ['SPKI PEM', '-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----', 'pem-public'],
    ['PKCS8 PEM', '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----', 'pem-private'],
    ['PKCS1 private PEM', '-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----', 'pem-private'],
    ['certificate', '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----', 'pem-cert'],
    ['JWK', ES256_PUBLIC_JWK, 'jwk'],
    ['JWKS', `{"keys":[${ES256_PUBLIC_JWK}]}`, 'jwks'],
  ])('classifies %s', (_label, raw, expected) => {
    expect(classifyKeyInput(raw)).toBe(expected);
  });
});

describe('verify() — HS* secrets', () => {
  it('resolves "valid" for the canonical token with the correct secret', async () => {
    const r = await verify(classicToken, 'your-256-bit-secret');
    expect(r.status).toBe('valid');
  });

  it('resolves "invalid" for the canonical token with a wrong secret', async () => {
    const r = await verify(classicToken, 'not-the-right-secret');
    expect(r.status).toBe('invalid');
  });

  it('verifies with a base64url-encoded secret when the option is set', async () => {
    const encoded = bytesToB64u(new TextEncoder().encode('your-256-bit-secret'));
    const r = await verify(classicToken, encoded, { secretBase64url: true });
    expect(r.status).toBe('valid');
  });

  it('reports an error for a non-base64url secret when the option is set', async () => {
    const r = await verify(classicToken, 'not/valid/base64url!!', { secretBase64url: true });
    expect(r.status).toBe('error');
  });

  it('attaches a weak-secret warning (RFC 7518 §3.2) without blocking the result', async () => {
    // "your-256-bit-secret" is 19 bytes — under the 32-byte HS256 floor.
    const r = await verify(classicToken, 'your-256-bit-secret');
    expect(r.status).toBe('valid');
    expect(r.warning).toMatch(/32 bytes/);
  });

  it('verifies with an oct JWK carrying the same secret', async () => {
    const k = bytesToB64u(new TextEncoder().encode('your-256-bit-secret'));
    const r = await verify(classicToken, `{"kty":"oct","k":"${k}"}`);
    expect(r.status).toBe('valid');
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

describe('verify() — published asymmetric vectors', () => {
  it('verifies the RFC 7515 §A.3 ES256 token with its public JWK', async () => {
    const r = await verify(ES256_TOKEN, ES256_PUBLIC_JWK);
    expect(r.status).toBe('valid');
  });

  it('verifies with a *private* JWK by stripping it to its public part', async () => {
    const r = await verify(ES256_TOKEN, ES256_PRIVATE_JWK);
    expect(r.status).toBe('valid');
  });

  it('rejects the ES256 token when the payload is tampered', async () => {
    const [h, , s] = ES256_TOKEN.split('.');
    const tampered = `${h}.${b64u({ iss: 'mallory' })}.${s}`;
    const r = await verify(tampered, ES256_PUBLIC_JWK);
    expect(r.status).toBe('invalid');
  });

  it('reports a curve mismatch as a specific error', async () => {
    const es384Token = `${b64u({ alg: 'ES384' })}.${b64u({ sub: 'x' })}.${'A'.repeat(128)}`;
    const r = await verify(es384Token, ES256_PUBLIC_JWK);
    expect(r.status).toBe('error');
    expect(r.detail).toContain('P-384');
  });

  it.skipIf(!hasEd25519)('verifies the RFC 8037 §A.4 Ed25519 JWS with its public JWK', async () => {
    const r = await verify(ED25519_TOKEN, ED25519_PUBLIC_JWK);
    expect(r.status).toBe('valid');
  });

  it.skipIf(!hasEd25519)('rejects the Ed25519 JWS with a tampered payload', async () => {
    const [h, , s] = ED25519_TOKEN.split('.');
    const tampered = `${h}.${Buffer.from('Example of Ed25519 signing!').toString('base64url')}.${s}`;
    const r = await verify(tampered, ED25519_PUBLIC_JWK);
    expect(r.status).toBe('invalid');
  });

  it('resolves "unsupported" for alg "none" (nothing to verify)', async () => {
    const none = examples.find((e) => e.id === 'alg-none')!.token;
    const r = await verify(none, 'anything');
    expect(r.status).toBe('unsupported');
    expect(r.detail.toLowerCase()).toContain('unsigned');
  });

  it('resolves "unsupported" for an alg outside the matrix (ES256K)', async () => {
    const t = `${b64u({ alg: 'ES256K' })}.${b64u({ sub: 'x' })}.${'A'.repeat(86)}`;
    const r = await verify(t, ES256_PUBLIC_JWK);
    expect(r.status).toBe('unsupported');
  });

  it('tells the user to paste the public key when given a private PEM', async () => {
    const gen = await generateKeys({ kind: 'ec', curve: 'P-256' });
    if (!gen.ok) throw new Error('keygen failed');
    const t = `${b64u({ alg: 'ES256' })}.${b64u({ sub: 'x' })}.${'A'.repeat(86)}`;
    const r = await verify(t, gen.privatePem!);
    expect(r.status).toBe('error');
    expect(r.detail.toLowerCase()).toContain('public key');
  });

  it('rejects X.509 certificates with a pointer to extract the public key', async () => {
    const t = `${b64u({ alg: 'RS256' })}.${b64u({ sub: 'x' })}.${'A'.repeat(86)}`;
    const r = await verify(t, '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----');
    expect(r.status).toBe('unsupported');
    expect(r.detail).toContain('public key');
  });
});

describe('sign() — RFC 7515 §A.1 and round-trips', () => {
  it('reproduces the canonical HS256 token byte-for-byte', async () => {
    // Segment JSON member order matters for byte-identity; the canonical
    // token's header is {"alg","typ"} and payload {"sub","name","iat"}.
    const r = await sign(
      '{"alg":"HS256","typ":"JWT"}',
      '{"sub":"1234567890","name":"John Doe","iat":1516239022}',
      'your-256-bit-secret',
      { alg: 'HS256' },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.token).toBe(classicToken);
  });

  it('forces header.alg to the selected algorithm', async () => {
    const r = await sign('{"alg":"RS256","typ":"JWT"}', PAYLOAD_JSON, 'shhh-this-is-a-long-enough-secret', {
      alg: 'HS256',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const d = decode(r.token);
      expect(d.alg).toBe('HS256');
    }
  });

  it.each(['HS256', 'HS384', 'HS512'] as const)('%s: sign → verify round-trip', async (alg) => {
    const secret = 'a-strong-secret-that-is-long-enough-for-any-hs-variant-0123456789abcdef';
    const r = await sign(HEADER_JSON, PAYLOAD_JSON, secret, { alg });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await verify(r.token, secret)).status).toBe('valid');
    expect((await verify(r.token, 'wrong-secret')).status).toBe('invalid');
  });

  it('signs with a base64url-encoded secret when the option is set', async () => {
    const secretBytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(secretBytes);
    const encoded = bytesToB64u(secretBytes);
    const r = await sign(HEADER_JSON, PAYLOAD_JSON, encoded, { alg: 'HS256', secretBase64url: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await verify(r.token, encoded, { secretBase64url: true })).status).toBe('valid');
    // The same string treated as UTF-8 is a different key.
    expect((await verify(r.token, encoded)).status).toBe('invalid');
  });

  describe('RSA family (one 2048-bit pair, PEM + JWK forms)', async () => {
    const gen = await generateKeys({ kind: 'rsa', modulus: 2048 });
    if (!gen.ok) throw new Error('RSA keygen failed');

    it.each(['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512'] as const)(
      '%s: PEM private sign → PEM public verify',
      async (alg) => {
        const r = await sign(HEADER_JSON, PAYLOAD_JSON, gen.privatePem!, { alg });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect((await verify(r.token, gen.publicPem!)).status).toBe('valid');
        // Tampered payload must fail.
        const [h, , s] = r.token.split('.');
        expect((await verify(`${h}.${b64u({ sub: 'evil' })}.${s}`, gen.publicPem!)).status).toBe('invalid');
      },
    );

    it('RS256: JWK private sign → JWK public verify, and wrong key fails', async () => {
      const r = await sign(HEADER_JSON, PAYLOAD_JSON, gen.privateJwk!, { alg: 'RS256' });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect((await verify(r.token, gen.publicJwk!)).status).toBe('valid');

      const other = await generateKeys({ kind: 'rsa', modulus: 2048 });
      if (!other.ok) throw new Error('RSA keygen failed');
      expect((await verify(r.token, other.publicPem!)).status).toBe('invalid');
    });

    it('refuses to sign with the public key', async () => {
      const r = await sign(HEADER_JSON, PAYLOAD_JSON, gen.publicPem!, { alg: 'RS256' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.toLowerCase()).toContain('private');
    });
  });

  describe('EC family', () => {
    it.each([
      ['ES256', 'P-256'],
      ['ES384', 'P-384'],
      ['ES512', 'P-521'],
    ] as const)('%s (%s): sign → verify round-trip', async (alg, curve) => {
      const gen = await generateKeys({ kind: 'ec', curve });
      if (!gen.ok) throw new Error('EC keygen failed');
      const r = await sign(HEADER_JSON, PAYLOAD_JSON, gen.privatePem!, { alg });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect((await verify(r.token, gen.publicPem!)).status).toBe('valid');
      expect((await verify(r.token, gen.publicJwk!)).status).toBe('valid');
    });
  });

  it.skipIf(!hasEd25519)('EdDSA: signs the RFC 8037 key and round-trips', async () => {
    const r = await sign(HEADER_JSON, PAYLOAD_JSON, ED25519_PRIVATE_JWK, { alg: 'EdDSA' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await verify(r.token, ED25519_PUBLIC_JWK)).status).toBe('valid');
  });

  it.each([
    ['bad header JSON', '{alg:HS256}', PAYLOAD_JSON],
    ['array payload', HEADER_JSON, '[1,2,3]'],
    ['empty payload', HEADER_JSON, ''],
  ])('returns { ok:false } with a specific error: %s', async (_label, h, p) => {
    const r = await sign(h, p, 'some-secret', { alg: 'HS256' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
  });

  it('asks for a key when none is supplied', async () => {
    const r = await sign(HEADER_JSON, PAYLOAD_JSON, '   ', { alg: 'ES256' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('private');
  });
});

describe('bundled examples', () => {
  it('the RS256 example verifies with its bundled public JWK', async () => {
    const ex = examples.find((e) => e.id === 'rs256')!;
    expect((await verify(ex.token, ex.key!)).status).toBe('valid');
  });
  it('every example carries a chip label', () => {
    for (const ex of examples) expect(ex.chip.length, ex.id).toBeGreaterThan(0);
  });
});

describe('verify() — JWKS', () => {
  it('picks the right key by kid and reports it', async () => {
    const a = await generateKeys({ kind: 'ec', curve: 'P-256' });
    const b = await generateKeys({ kind: 'ec', curve: 'P-256' });
    if (!a.ok || !b.ok) throw new Error('EC keygen failed');

    const signed = await sign('{"alg":"ES256","kid":"key-b"}', PAYLOAD_JSON, b.privatePem!, { alg: 'ES256' });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    const jwks = JSON.stringify({
      keys: [
        { ...JSON.parse(a.publicJwk!), kid: 'key-a' },
        { ...JSON.parse(b.publicJwk!), kid: 'key-b' },
      ],
    });
    const r = await verify(signed.token, jwks);
    expect(r.status).toBe('valid');
    expect(r.detail).toContain('key-b');
  });

  it('tries every compatible key when the token has no kid', async () => {
    const a = await generateKeys({ kind: 'ec', curve: 'P-256' });
    const b = await generateKeys({ kind: 'ec', curve: 'P-256' });
    if (!a.ok || !b.ok) throw new Error('EC keygen failed');

    const signed = await sign('{"alg":"ES256"}', PAYLOAD_JSON, b.privatePem!, { alg: 'ES256' });
    if (!signed.ok) throw new Error('sign failed');

    const jwks = JSON.stringify({ keys: [JSON.parse(a.publicJwk!), JSON.parse(b.publicJwk!)] });
    expect((await verify(signed.token, jwks)).status).toBe('valid');

    // And when no key matches, it is a clean "invalid" that counts candidates.
    const strangers = JSON.stringify({ keys: [JSON.parse(a.publicJwk!)] });
    const miss = await verify(signed.token, strangers);
    expect(miss.status).toBe('invalid');
  });

  it('reports a kid that is missing from the JWKS', async () => {
    const a = await generateKeys({ kind: 'ec', curve: 'P-256' });
    if (!a.ok) throw new Error('EC keygen failed');
    const signed = await sign('{"alg":"ES256","kid":"ghost"}', PAYLOAD_JSON, a.privatePem!, { alg: 'ES256' });
    if (!signed.ok) throw new Error('sign failed');

    const jwks = JSON.stringify({ keys: [{ ...JSON.parse(a.publicJwk!), kid: 'real' }] });
    const r = await verify(signed.token, jwks);
    expect(r.status).toBe('error');
    expect(r.detail).toContain('ghost');
  });

  it('jwksCandidates flags malformed JWKS input', () => {
    expect(jwksCandidates('{"keys":42}', 'ES256').ok).toBe(false);
    expect(jwksCandidates('not json', 'ES256').ok).toBe(false);
  });
});

describe('review regressions', () => {
  it('a combined public+private PEM paste signs AND verifies (both block orders)', async () => {
    const gen = await generateKeys({ kind: 'ec', curve: 'P-256' });
    if (!gen.ok) throw new Error('EC keygen failed');
    for (const combined of [
      `${gen.publicPem}\n${gen.privatePem}`,
      `${gen.privatePem}\n${gen.publicPem}`,
    ]) {
      const signed = await sign(HEADER_JSON, PAYLOAD_JSON, combined, { alg: 'ES256' });
      expect(signed.ok).toBe(true);
      if (!signed.ok) continue;
      expect((await verify(signed.token, combined)).status).toBe('valid');
    }
  });

  it('a brace-led plain-text secret fails with the base64url workaround hint', async () => {
    const r = await sign(HEADER_JSON, PAYLOAD_JSON, '{not-json-secret', { alg: 'HS256' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('base64url');
  });

  it('decode() rejects JSON-array headers and payloads (RFC 7519: objects only)', () => {
    expect(decode(`${b64u(['HS256'])}.${b64u({ sub: 'x' })}.sig`).valid).toBe(false);
    expect(decode(`${b64u({ alg: 'HS256' })}.${b64u([1, 2, 3])}.sig`).valid).toBe(false);
  });

  it('formats a negative-year epoch with an intact sign (no "00-6" mangling)', () => {
    // exp ≈ year -6: padStart must not inject zeros between "-" and digits.
    const token = `${b64u({ alg: 'HS256' })}.${b64u({ exp: -62356537152 })}.sig`;
    const r = decode(token, 1700000000000);
    const exp = r.claims.find((c) => c.label === 'Expires (exp)');
    expect(exp!.value).toMatch(/-\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC/);
  });

  it('verify() carries the crit advisory even when the signature is valid', async () => {
    const secret = 'a-strong-secret-that-is-long-enough-for-hs256-0123456789abcdef';
    const signed = await sign('{"alg":"HS256","crit":["b64"],"b64":false}', PAYLOAD_JSON, secret, {
      alg: 'HS256',
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;
    const r = await verify(signed.token, secret);
    expect(r.status).toBe('valid');
    expect(r.warning).toContain('crit');
  });

  it('sign() accepts a JWKS containing a private key (picked by kid)', async () => {
    const a = await generateKeys({ kind: 'ec', curve: 'P-256' });
    const b = await generateKeys({ kind: 'ec', curve: 'P-256' });
    if (!a.ok || !b.ok) throw new Error('EC keygen failed');
    const jwks = JSON.stringify({
      keys: [
        { ...JSON.parse(a.privateJwk!), kid: 'signer-a' },
        { ...JSON.parse(b.privateJwk!), kid: 'signer-b' },
      ],
    });
    const signed = await sign('{"alg":"ES256","kid":"signer-b"}', PAYLOAD_JSON, jwks, { alg: 'ES256' });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;
    expect((await verify(signed.token, b.publicPem!)).status).toBe('valid');
    expect((await verify(signed.token, a.publicPem!)).status).toBe('invalid');
  });

  it('jwksCandidates reports a kid that exists but cannot serve the alg', () => {
    const jwks = JSON.stringify({
      keys: [{ kty: 'RSA', kid: 'rsa-key', n: 'AQAB', e: 'AQAB' }],
    });
    const r = jwksCandidates(jwks, 'ES256', 'rsa-key');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('not usable');
  });
});

describe('lossless JSON source — what is shown and signed is what is in the token', () => {
  /**
   * Encode a RAW JSON string as a segment. `b64u()` above goes through
   * JSON.stringify, which would launder away exactly the hostile properties
   * (big integers, duplicate members, key order) these cases are about.
   */
  function rawSeg(json: string): string {
    return Buffer.from(json, 'utf8').toString('base64url');
  }
  const NOW = 1700000000 * 1000;
  const HDR = b64u({ alg: 'HS256', typ: 'JWT' });

  // ── sign(): the bytes signed must be the bytes the user typed ─────────────

  it('sign() preserves a big-integer claim exactly (no JSON.parse → stringify)', async () => {
    // 1234567890123456789 > Number.MAX_SAFE_INTEGER: a JS round-trip rewrites
    // it, so the user would sign a claim they never typed.
    const payloadJson = '{"uid":1234567890123456789}';
    const r = await sign('{"alg":"HS256","typ":"JWT"}', payloadJson, 'your-256-bit-secret', {
      alg: 'HS256',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const signed = Buffer.from(r.token.split('.')[1], 'base64url').toString('utf8');
    expect(signed).toBe(payloadJson);
    expect(signed).not.toContain('1234567890123456800');
  });

  it('sign() preserves number spelling and member order; alg is pinned in place', async () => {
    const payloadJson = '{"z":1.0,"a":1e2,"neg":-0,"tiny":1e-7}';
    const secret = 'a-secret-long-enough-for-hs256-0123456789abcdef';
    const r = await sign('{"typ":"JWT","kid":"k1"}', payloadJson, secret, { alg: 'HS256' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [h, p] = r.token.split('.');
    expect(Buffer.from(p, 'base64url').toString('utf8')).toBe(payloadJson);
    // alg was absent, so it is appended last — nothing else moves or changes.
    expect(Buffer.from(h, 'base64url').toString('utf8')).toBe('{"typ":"JWT","kid":"k1","alg":"HS256"}');
  });

  it('sign() minifies pretty-printed editor text (the decode → edit → sign flow)', async () => {
    // The playground copies decode()'s pretty output straight into the encoder
    // textareas, so the minifier has to survive indentation and newlines.
    const r = await sign(
      '{\n  "alg": "HS256",\n  "typ": "JWT"\n}',
      '{\n  "sub": "1234567890",\n  "name": "John Doe",\n  "iat": 1516239022\n}',
      'your-256-bit-secret',
      { alg: 'HS256' },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.token).toBe(classicToken);
  });

  it('sign() signs the bytes it emits (signature covers the preserved payload)', async () => {
    const secret = 'a-secret-long-enough-for-hs256-0123456789abcdef';
    const r = await sign('{"alg":"HS256"}', '{"uid":1234567890123456789}', secret, { alg: 'HS256' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await verify(r.token, secret)).status).toBe('valid');
  });

  // ── decode(): what is displayed must be the token's own JSON ──────────────

  it('decode() shows a big-integer claim unrounded and flags the precision loss', () => {
    const r = decode(`${HDR}.${rawSeg('{"uid":1234567890123456789,"exp":1800000000}')}.sig`, NOW);
    expect(r.valid).toBe(true);
    expect(r.payload).toBe('{\n  "uid": 1234567890123456789,\n  "exp": 1800000000\n}');
    expect(r.warnings.some((w) => w.includes('1234567890123456789'))).toBe(true);
    // The claims table still reads the parsed object, so exp handling is intact.
    expect(r.claims.find((c) => c.label.startsWith('Expires'))!.value).toContain('1800000000');
  });

  it('decode() keeps duplicate members and warns that the token is ambiguous', () => {
    // JSON.parse keeps only the last "sub"; a verifier may read the first.
    const r = decode(`${HDR}.${rawSeg('{"sub":"admin","sub":"guest"}')}.sig`, NOW);
    expect(r.payload).toBe('{\n  "sub": "admin",\n  "sub": "guest"\n}');
    expect(r.warnings.some((w) => /duplicate/i.test(w) && w.includes('sub'))).toBe(true);
  });

  it('decode() preserves member order, including integer-like keys JS would resort', () => {
    const r = decode(`${HDR}.${rawSeg('{"sub":"a","2":"two","1":"one"}')}.sig`, NOW);
    expect(r.payload).toBe('{\n  "sub": "a",\n  "2": "two",\n  "1": "one"\n}');
  });

  it('decode() shows an out-of-range number as written instead of null', () => {
    const r = decode(`${HDR}.${rawSeg('{"big":1e400}')}.sig`, NOW);
    expect(r.payload).toBe('{\n  "big": 1e400\n}');
    expect(r.payload).not.toContain('null');
    expect(r.warnings.some((w) => w.includes('1e400') && w.includes('Infinity'))).toBe(true);
  });

  it('decode() renders duplicate header members too, and reports the alg JS sees', () => {
    const r = decode(
      `${rawSeg('{"alg":"HS256","alg":"none"}')}.${b64u({ sub: 'x', exp: 1700003600 })}.sig`,
      NOW,
    );
    expect(r.header).toBe('{\n  "alg": "HS256",\n  "alg": "none"\n}');
    expect(r.alg).toBe('none');
    expect(r.warnings.some((w) => /duplicate/i.test(w) && w.includes('alg'))).toBe(true);
  });

  it('the partial header render (payload broken) is lossless as well', () => {
    const r = decode(`${rawSeg('{"alg":"HS256","serial":1234567890123456789}')}.@@@.x`, NOW);
    expect(r.valid).toBe(false);
    expect(r.partial?.header).toContain('1234567890123456789');
  });

  // ── controls: ordinary tokens must render exactly as they did before ──────

  it('an ordinary token renders byte-identically to the old pretty-printer', () => {
    const r = decode(classicToken);
    expect(r.header).toBe(JSON.stringify({ alg: 'HS256', typ: 'JWT' }, null, 2));
    expect(r.payload).toBe(
      JSON.stringify({ sub: '1234567890', name: 'John Doe', iat: 1516239022 }, null, 2),
    );
  });

  it('nested, empty and escaped structures match JSON.stringify(x, null, 2) exactly', () => {
    const obj = {
      s: 'line\nbreak\t"quoted"\\',
      u: 'café — ünïçode ☂',
      nested: { a: [1, 2, [3, { b: null }]], empty_o: {}, empty_a: [] },
      flags: [true, false, null],
      n: -1.5e-7,
      exp: 1700003600,
    };
    const r = decode(`${HDR}.${rawSeg(JSON.stringify(obj))}.sig`, NOW);
    expect(r.payload).toBe(JSON.stringify(obj, null, 2));
    // No false-positive notes on a perfectly ordinary token.
    expect(r.warnings.some((w) => /duplicate|safe integer|double range/i.test(w))).toBe(false);
  });

  it('an empty object payload still renders as "{}"', () => {
    const r = decode(`${HDR}.${rawSeg('{}')}.sig`, NOW);
    expect(r.payload).toBe('{}');
  });
});

describe('generateKeys()', () => {
  it('generates a base64url HMAC secret of the requested byte length', async () => {
    for (const bytes of [32, 48, 64] as const) {
      const r = await generateKeys({ kind: 'hmac', bytes });
      expect(r.ok).toBe(true);
      if (r.ok) expect(b64uToBytes(r.secretB64u!)?.length).toBe(bytes);
    }
  });

  it('generates an EC pair with correctly framed PEM and matching JWK curve', async () => {
    const r = await generateKeys({ kind: 'ec', curve: 'P-384' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.publicPem).toMatch(/^-----BEGIN PUBLIC KEY-----\n[\s\S]+\n-----END PUBLIC KEY-----$/);
    expect(r.privatePem).toMatch(/^-----BEGIN PRIVATE KEY-----\n[\s\S]+\n-----END PRIVATE KEY-----$/);
    // 64-column body wrapping.
    for (const line of r.publicPem!.split('\n').slice(1, -1)) {
      expect(line.length).toBeLessThanOrEqual(64);
    }
    expect(JSON.parse(r.publicJwk!).crv).toBe('P-384');
    expect(JSON.parse(r.privateJwk!).d).toBeTruthy();
    expect(JSON.parse(r.publicJwk!).d).toBeUndefined();
  });

  it.skipIf(!hasEd25519)('generates an Ed25519 pair that signs and verifies', async () => {
    const r = await generateKeys({ kind: 'ed25519' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const signed = await sign(HEADER_JSON, PAYLOAD_JSON, r.privateJwk!, { alg: 'EdDSA' });
    expect(signed.ok).toBe(true);
    if (signed.ok) expect((await verify(signed.token, r.publicJwk!)).status).toBe('valid');
  });
});
