/**
 * JWT Decoder & Encoder — signing. Turns two editable JSON texts (header +
 * payload) and pasted key material into a signed compact JWS.
 *
 * The token's segments and the signing input are built from ONE minified
 * `JSON.stringify` serialization of each parsed object, so the bytes that are
 * signed are byte-identical to the bytes in the token — pretty-printing in
 * the textarea never leaks into the JWS. `alg` in the emitted header is
 * forced to the selected algorithm (the UI keeps the two in sync).
 *
 * Never throws on user input; resolves `{ ok:false, error }` instead.
 */
import type { JwsAlg, SignResult } from './types';
import { ALGS, isJwsAlg, signParamsFor } from './algs';
import { bytesToB64u, importKeyFor } from './keys';

/** Encode a UTF-8 string as an unpadded base64url segment. */
function utf8ToB64u(text: string): string {
  return bytesToB64u(new TextEncoder().encode(text));
}

/** Parse one JSON editor's text into a plain object, with a specific error. */
function parseJsonObject(
  text: string,
  what: 'header' | 'payload',
): { ok: true; obj: Record<string, unknown> } | { ok: false; error: string } {
  const t = (text ?? '').trim();
  if (t.length === 0) {
    return { ok: false, error: `The ${what} is empty — it must be a JSON object.` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch (err) {
    const msg = err instanceof SyntaxError ? err.message : 'unknown parse error';
    return { ok: false, error: `The ${what} is not valid JSON: ${msg}` };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: `The ${what} must be a JSON object, not ${Array.isArray(parsed) ? 'an array' : typeof parsed}.` };
  }
  return { ok: true, obj: parsed as Record<string, unknown> };
}

/**
 * Sign `headerJson` + `payloadJson` with `keyInput` and return the compact
 * JWS. The header's `alg` is overwritten with `opts.alg`; all other header
 * members pass through untouched.
 */
export async function sign(
  headerJson: string,
  payloadJson: string,
  keyInput: string,
  opts: { alg: JwsAlg; secretBase64url?: boolean },
): Promise<SignResult> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return { ok: false, error: 'Web Crypto is unavailable in this environment.' };
  if (!isJwsAlg(opts.alg)) {
    return { ok: false, error: `"${String(opts.alg)}" is not a supported signing algorithm.` };
  }

  const header = parseJsonObject(headerJson, 'header');
  if (!header.ok) return { ok: false, error: header.error };
  const payload = parseJsonObject(payloadJson, 'payload');
  if (!payload.ok) return { ok: false, error: payload.error };

  if ((keyInput ?? '').trim().length === 0) {
    const spec = ALGS[opts.alg];
    return {
      ok: false,
      error:
        spec.kind === 'hmac'
          ? `Add a secret to sign with ${opts.alg}.`
          : `Add a PKCS8 PEM private key or private JWK to sign with ${opts.alg}.`,
    };
  }

  const imported = await importKeyFor(opts.alg, keyInput, 'sign', {
    secretBase64url: opts.secretBase64url,
    kid: typeof header.obj.kid === 'string' ? header.obj.kid : undefined,
  });
  if (!imported.ok) return { ok: false, error: imported.reason };

  // One serialization builds both the token segments and the signing input.
  const finalHeader = { ...header.obj, alg: opts.alg };
  const headerSeg = utf8ToB64u(JSON.stringify(finalHeader));
  const payloadSeg = utf8ToB64u(JSON.stringify(payload.obj));
  const signingInput = new TextEncoder().encode(`${headerSeg}.${payloadSeg}`);

  try {
    const sig = await subtle.sign(signParamsFor(opts.alg), imported.key, signingInput);
    return { ok: true, token: `${headerSeg}.${payloadSeg}.${bytesToB64u(new Uint8Array(sig))}` };
  } catch {
    return { ok: false, error: `Signing with ${opts.alg} failed — check that the key matches the algorithm.` };
  }
}
