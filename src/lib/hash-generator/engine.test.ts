/**
 * Hash Generator — engine tests. Asserts the canonical RFC/NIST digest vectors
 * for "abc" plus the well-known empty-string MD5, the SHA-512("abc") prefix, the
 * shape of an HMAC digest, and that neither entry point rejects on normal input.
 *
 * Async: SHA digests come from SubtleCrypto (globalThis.crypto.subtle, available
 * globally on Node 18+), so every case awaits the engine's Promises.
 */
import { describe, it, expect } from 'vitest';
import { hash, hmac } from './engine';
import type { HashRow } from './types';

/** Pull a single algorithm's lowercase-hex value out of a successful result. */
function valueOf(rows: HashRow[], label: string): string {
  const row = rows.find((r) => r.label === label);
  expect(row, `missing row for ${label}`).toBeDefined();
  return row!.value;
}

describe('hash()', () => {
  it('computes the canonical MD5/SHA-1/SHA-256 vectors for "abc"', async () => {
    const result = await hash('abc');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();

    // RFC 1321 / RFC 3174 / NIST FIPS 180-4 published vectors for "abc".
    expect(valueOf(result.rows, 'MD5')).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(valueOf(result.rows, 'SHA-1')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(valueOf(result.rows, 'SHA-256')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('matches the documented SHA-512("abc") prefix', async () => {
    const result = await hash('abc');
    expect(result.valid).toBe(true);
    // NIST FIPS 180-4 SHA-512("abc") begins ddaf35a193617aba...
    expect(valueOf(result.rows, 'SHA-512').startsWith('ddaf35a193617aba')).toBe(true);
  });

  it('returns the well-known MD5 of the empty string', async () => {
    const result = await hash('');
    expect(result.valid).toBe(true);
    // MD5("") = d41d8cd98f00b204e9800998ecf8427e (RFC 1321).
    expect(valueOf(result.rows, 'MD5')).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });

  it('emits one lowercase-hex row per algorithm in order', async () => {
    const result = await hash('abc');
    expect(result.valid).toBe(true);
    expect(result.rows.map((r) => r.label)).toEqual(['MD5', 'SHA-1', 'SHA-256', 'SHA-512']);
    for (const row of result.rows) {
      expect(row.mono).toBe(true);
      expect(row.value).toMatch(/^[0-9a-f]+$/);
    }
  });

  it('does not reject on normal input (resolves, never throws)', async () => {
    await expect(hash('hello world')).resolves.toMatchObject({ valid: true });
    await expect(hash('')).resolves.toMatchObject({ valid: true });
    await expect(hash('Correct-Horse-Battery-Staple-42')).resolves.toMatchObject({ valid: true });
  });
});

describe('hmac()', () => {
  it('returns 64 lowercase hex chars for SHA-256', async () => {
    const sig = await hmac('The quick brown fox jumps over the lazy dog', 'key', 'SHA-256');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(sig.length).toBe(64);
  });

  it('does not reject across the SHA family on normal input', async () => {
    await expect(hmac('message', 'secret', 'SHA-1')).resolves.toMatch(/^[0-9a-f]{40}$/);
    await expect(hmac('message', 'secret', 'SHA-256')).resolves.toMatch(/^[0-9a-f]{64}$/);
    await expect(hmac('message', 'secret', 'SHA-512')).resolves.toMatch(/^[0-9a-f]{128}$/);
    // Empty *message* with a non-empty key is normal input and must resolve.
    // (A zero-length key is rejected by SubtleCrypto.importKey — that is an edge
    // case, not normal input, so it is intentionally not asserted here.)
    await expect(hmac('', 'secret', 'SHA-256')).resolves.toMatch(/^[0-9a-f]{64}$/);
  });
});
