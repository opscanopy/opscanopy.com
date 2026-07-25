/**
 * JWT Decoder & Encoder — key-material handling. Classifies whatever the user
 * pasted (shared secret, SPKI/PKCS8 PEM, JWK, JWKS), turns it into a
 * CryptoKey for a given JWS alg + usage, and owns the byte-level base64url /
 * PEM helpers (the string-oriented `src/lib/codec.ts` cannot carry binary key
 * material).
 *
 * Every function here follows the tool's contract: NEVER throw on user input.
 * Failures come back as `{ ok:false, reason }`; `unsupported:true` marks the
 * cases the engine reports as 'unsupported' rather than 'error' (wrong key
 * *category* — e.g. a plain secret for an RSA alg — or a runtime without
 * Ed25519), preserving the long-standing verify() semantics.
 */
import type { JwsAlg } from './types';
import { ALGS, importParamsFor } from './algs';

/** Outcome of importing pasted key material for one alg + usage. */
export type KeyImportResult =
  | { ok: true; key: CryptoKey; note?: string }
  | { ok: false; reason: string; unsupported?: boolean };

// ── Byte helpers ─────────────────────────────────────────────────────────────

/** base64url string -> Uint8Array of its bytes, or null on malformed input. */
export function b64uToBytes(seg: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(seg)) return null;
  const std = seg.replace(/-/g, '+').replace(/_/g, '/');
  const padded = std + '='.repeat((4 - (std.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** Uint8Array -> unpadded base64url string. */
export function bytesToB64u(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** One complete `-----BEGIN X----- … -----END X-----` block. */
interface PemBlock {
  label: string;
  body: string;
}

/** All complete PEM blocks in a paste, in order of appearance. */
function pemBlocksOf(raw: string): PemBlock[] {
  const out: PemBlock[] = [];
  const re = /-----BEGIN ([^-]+)-----([\s\S]*?)-----END \1-----/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) out.push({ label: m[1].trim(), body: m[2] });
  return out;
}

/** Decode one PEM block body (base64, whitespace-tolerant) to DER bytes. */
function blockBodyToDer(body: string): Uint8Array | null {
  try {
    const binary = atob(body.replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Decode a PEM paste to raw DER bytes. Uses the FIRST complete block when one
 * exists (a paste holding several blocks must never have its bodies
 * concatenated into one bogus DER blob); falls back to stripping markers for
 * truncated input so near-miss pastes still get a specific parse error.
 */
export function pemToDer(pem: string): Uint8Array | null {
  const blocks = pemBlocksOf(pem);
  if (blocks.length > 0) return blockBodyToDer(blocks[0].body);
  return blockBodyToDer(
    pem.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, ''),
  );
}

/** Wrap raw DER bytes as a PEM block ("PUBLIC KEY" / "PRIVATE KEY"), 64 cols. */
export function derToPem(der: Uint8Array, label: 'PUBLIC KEY' | 'PRIVATE KEY'): string {
  let binary = '';
  for (let i = 0; i < der.length; i++) binary += String.fromCharCode(der[i]);
  const b64 = btoa(binary);
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

// ── Classification ───────────────────────────────────────────────────────────

export type KeyInputKind =
  | 'pem-public'
  | 'pem-private'
  | 'pem-cert'
  | 'jwk'
  | 'jwks'
  | 'secret';

/**
 * Best-effort classification of pasted key material. A paste holding several
 * PEM blocks is classified by the FIRST marker (import picks the block that
 * fits the usage — see importPemFor). JSON starting with "{" is treated as
 * JWK/JWKS even when it doesn't parse — the import step then reports the
 * specific JSON error instead of silently HMAC-ing a JSON blob.
 */
export function classifyKeyInput(raw: string): KeyInputKind {
  const t = (raw ?? '').trim();
  const pem = /-----BEGIN ([^-]+)-----/.exec(t);
  if (pem) {
    const label = pem[1].trim();
    if (label.includes('PRIVATE KEY')) return 'pem-private';
    if (label.endsWith('PUBLIC KEY')) return 'pem-public';
    // CERTIFICATE and every other non-key PEM label route to the cert-style
    // "this isn't a key" handling.
    return 'pem-cert';
  }
  if (t.startsWith('{')) {
    try {
      const parsed = JSON.parse(t) as Record<string, unknown>;
      if (parsed && Array.isArray(parsed.keys)) return 'jwks';
    } catch {
      /* still JSON-shaped — fall through to 'jwk' so errors are specific */
    }
    return 'jwk';
  }
  return 'secret';
}

// ── JWK handling ─────────────────────────────────────────────────────────────

/** The `kty` each alg family needs. */
function ktyFor(alg: JwsAlg): string {
  switch (ALGS[alg].kind) {
    case 'hmac':
      return 'oct';
    case 'rsa':
    case 'pss':
      return 'RSA';
    case 'ecdsa':
      return 'EC';
    case 'eddsa':
      return 'OKP';
  }
}

/** True when the JWK carries private-key members. */
function jwkIsPrivate(jwk: Record<string, unknown>): boolean {
  return typeof jwk.d === 'string';
}

/**
 * Reduce a JWK to only the members Web Crypto needs for this alg family,
 * dropping `alg`/`use`/`key_ops`/`ext` (their mismatches throw in importKey
 * even when the key material itself is fine) and — when `publicOnly` — the
 * private members, so a pasted *private* JWK can still verify.
 */
function sanitizeJwk(
  jwk: Record<string, unknown>,
  alg: JwsAlg,
  publicOnly: boolean,
): Record<string, unknown> {
  const kty = String(jwk.kty ?? '');
  const out: Record<string, unknown> = { kty };
  const copy = (names: string[]) => {
    for (const n of names) if (jwk[n] !== undefined) out[n] = jwk[n];
  };
  if (kty === 'oct') copy(['k']);
  else if (kty === 'RSA') copy(publicOnly ? ['n', 'e'] : ['n', 'e', 'd', 'p', 'q', 'dp', 'dq', 'qi']);
  else copy(publicOnly ? ['crv', 'x', 'y'] : ['crv', 'x', 'y', 'd']); // EC + OKP (OKP has no y)
  void alg;
  return out;
}

/**
 * Import a single (already-parsed) JWK for `alg` + `usage`. A private JWK
 * used for 'verify' is transparently stripped to its public members — Web
 * Crypto refuses private keys with the verify usage.
 */
export async function importJwkFor(
  alg: JwsAlg,
  jwk: Record<string, unknown>,
  usage: 'sign' | 'verify',
): Promise<KeyImportResult> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return { ok: false, unsupported: true, reason: 'Web Crypto is unavailable in this environment.' };

  const spec = ALGS[alg];
  const wantKty = ktyFor(alg);
  const kty = String(jwk.kty ?? '');
  if (kty !== wantKty) {
    return {
      ok: false,
      reason: `This JWK has kty "${kty || '(missing)'}" but ${alg} needs kty "${wantKty}".`,
    };
  }
  if (spec.kind === 'ecdsa' && jwk.crv !== spec.curve) {
    return {
      ok: false,
      reason: `This JWK is on curve ${String(jwk.crv ?? '(missing)')} but ${alg} needs ${spec.curve}.`,
    };
  }
  if (spec.kind === 'eddsa' && jwk.crv !== 'Ed25519') {
    return {
      ok: false,
      reason: `EdDSA here supports Ed25519 only; this JWK's crv is ${String(jwk.crv ?? '(missing)')}.`,
    };
  }

  const isPrivate = jwkIsPrivate(jwk);
  if (usage === 'sign' && !isPrivate && spec.kind !== 'hmac') {
    return { ok: false, reason: 'Signing needs a *private* JWK (with a "d" member) — this one is public.' };
  }

  // HMAC via an oct JWK: the secret bytes live in `k` (base64url).
  if (spec.kind === 'hmac') {
    const k = typeof jwk.k === 'string' ? b64uToBytes(jwk.k) : null;
    if (k === null) return { ok: false, reason: 'This oct JWK has no valid base64url "k" member.' };
    try {
      const key = await subtle.importKey('raw', k as BufferSource, { name: 'HMAC', hash: spec.hash }, false, [usage]);
      return { ok: true, key };
    } catch {
      return { ok: false, reason: 'The oct JWK secret could not be imported.' };
    }
  }

  const publicOnly = usage === 'verify';
  const clean = sanitizeJwk(jwk, alg, publicOnly);
  const note = publicOnly && isPrivate ? 'A private JWK was supplied — verified against its public part.' : undefined;
  try {
    const key = await subtle.importKey('jwk', clean as JsonWebKey, importParamsFor(alg), false, [usage]);
    return { ok: true, key, note };
  } catch (err) {
    if ((err as Error)?.name === 'NotSupportedError') {
      return {
        ok: false,
        unsupported: true,
        reason: `This environment's Web Crypto cannot import keys for ${alg}.`,
      };
    }
    return { ok: false, reason: `The JWK could not be imported for ${alg} — check its members and curve.` };
  }
}

/**
 * Extract candidate JWKs from a pasted JWKS for one alg. A `kid` from the
 * token header narrows to the exact key; otherwise every kty/crv-compatible
 * key is returned in order so the caller can try each.
 */
export function jwksCandidates(
  raw: string,
  alg: JwsAlg,
  kid?: string,
): { ok: true; jwks: Record<string, unknown>[]; matchedKid?: string } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return { ok: false, reason: 'The JWKS is not valid JSON.' };
  }
  const keys = (parsed as { keys?: unknown })?.keys;
  if (!Array.isArray(keys)) return { ok: false, reason: 'A JWKS must be an object with a "keys" array.' };

  const wantKty = ktyFor(alg);
  const spec = ALGS[alg];
  const compatible = keys.filter((k): k is Record<string, unknown> => {
    if (k === null || typeof k !== 'object') return false;
    const o = k as Record<string, unknown>;
    if (o.kty !== wantKty) return false;
    if (spec.kind === 'ecdsa' && o.crv !== spec.curve) return false;
    if (spec.kind === 'eddsa' && o.crv !== 'Ed25519') return false;
    return true;
  });

  if (kid) {
    const hit = compatible.find((k) => k.kid === kid);
    if (hit) return { ok: true, jwks: [hit], matchedKid: kid };
    // A kid that matches nothing compatible is a real answer, not a fallback.
    if (keys.some((k) => (k as Record<string, unknown>)?.kid === kid)) {
      return { ok: false, reason: `The JWKS key with kid "${kid}" is not usable for ${alg}.` };
    }
    return { ok: false, reason: `No key with kid "${kid}" in this JWKS.` };
  }
  if (compatible.length === 0) {
    return { ok: false, reason: `No ${wantKty} key in this JWKS is usable for ${alg}.` };
  }
  return { ok: true, jwks: compatible };
}

// ── PEM import (usage-aware; multi-block pastes pick the right block) ────────

/**
 * Import a PEM paste for `alg` + `usage`. A paste may hold SEVERAL blocks
 * (keygen tools and docs often emit public + private together): the block
 * that fits the usage wins — 'sign' takes the PKCS8 "PRIVATE KEY" block,
 * 'verify' the SPKI "PUBLIC KEY" block — and only that block's body is
 * decoded (bodies are never concatenated). Unusable labels get a specific,
 * actionable reason.
 */
async function importPemFor(
  alg: JwsAlg,
  raw: string,
  usage: 'sign' | 'verify',
): Promise<KeyImportResult> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return { ok: false, unsupported: true, reason: 'Web Crypto is unavailable in this environment.' };

  let blocks = pemBlocksOf(raw);
  if (blocks.length === 0) {
    // Truncated paste (BEGIN without a matching END): treat the whole input
    // as one block so it still reaches a specific parse error below.
    const m = /-----BEGIN ([^-]+)-----/.exec(raw);
    blocks = [
      {
        label: m ? m[1].trim() : '',
        body: raw.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, ''),
      },
    ];
  }
  const has = (pred: (label: string) => boolean) => blocks.some((b) => pred(b.label));

  if (usage === 'verify') {
    const pub = blocks.find((b) => b.label === 'PUBLIC KEY');
    if (pub) {
      const der = blockBodyToDer(pub.body);
      if (der === null) return { ok: false, reason: 'The PEM public key could not be parsed.' };
      try {
        const key = await subtle.importKey('spki', der as BufferSource, importParamsFor(alg), false, ['verify']);
        return { ok: true, key };
      } catch (err) {
        if ((err as Error)?.name === 'NotSupportedError') {
          return { ok: false, unsupported: true, reason: `This environment's Web Crypto cannot import keys for ${alg}.` };
        }
        return { ok: false, reason: `The public key could not be imported for ${alg} — is it the right key type/curve?` };
      }
    }
    if (has((l) => l === 'RSA PUBLIC KEY')) {
      return {
        ok: false,
        reason:
          'This is a PKCS1 "RSA PUBLIC KEY" — convert it to SPKI (openssl rsa -pubin -RSAPublicKey_in -pubout) and paste the "BEGIN PUBLIC KEY" block.',
      };
    }
    if (has((l) => l === 'CERTIFICATE')) {
      return {
        ok: false,
        unsupported: true,
        reason:
          'X.509 certificates are not supported here — extract the public key first (openssl x509 -pubkey -noout -in cert.pem) and paste that.',
      };
    }
    if (has((l) => l.includes('PRIVATE KEY'))) {
      return {
        ok: false,
        reason:
          'This looks like a *private* key — verification uses the public key. Paste the matching public key (or a JWK; private JWKs are fine).',
      };
    }
    return { ok: false, reason: 'No usable PEM block found — paste a "BEGIN PUBLIC KEY" (SPKI) block.' };
  }

  // usage === 'sign'
  const priv = blocks.find((b) => b.label === 'PRIVATE KEY');
  if (priv) {
    const der = blockBodyToDer(priv.body);
    if (der === null) return { ok: false, reason: 'The PEM private key could not be parsed.' };
    try {
      const key = await subtle.importKey('pkcs8', der as BufferSource, importParamsFor(alg), false, ['sign']);
      return { ok: true, key };
    } catch (err) {
      if ((err as Error)?.name === 'NotSupportedError') {
        return { ok: false, unsupported: true, reason: `This environment's Web Crypto cannot import keys for ${alg}.` };
      }
      return { ok: false, reason: `The private key could not be imported for ${alg} — is it the right key type/curve?` };
    }
  }
  if (has((l) => l === 'ENCRYPTED PRIVATE KEY')) {
    return { ok: false, reason: 'Encrypted private keys are not supported — decrypt it first (openssl pkcs8 ... -nocrypt).' };
  }
  if (has((l) => l.includes('OPENSSH'))) {
    return {
      ok: false,
      reason:
        'This is an OpenSSH key — convert it to PKCS8 (ssh-keygen -p -m pkcs8) and paste the "BEGIN PRIVATE KEY" block.',
    };
  }
  if (has((l) => l === 'RSA PRIVATE KEY' || l === 'EC PRIVATE KEY')) {
    return {
      ok: false,
      reason:
        'This is a PKCS1/SEC1 private key — convert it to PKCS8 (openssl pkcs8 -topk8 -nocrypt) and paste the "BEGIN PRIVATE KEY" block.',
    };
  }
  if (has((l) => l.endsWith('PUBLIC KEY'))) {
    return { ok: false, reason: 'Signing needs the *private* key — this is a public key.' };
  }
  if (has((l) => l === 'CERTIFICATE')) {
    return {
      ok: false,
      unsupported: true,
      reason: 'X.509 certificates are not keys — signing needs a PKCS8 "BEGIN PRIVATE KEY" block.',
    };
  }
  return { ok: false, reason: 'No usable PEM block found — paste a PKCS8 "BEGIN PRIVATE KEY" block.' };
}

// ── The one-stop import ──────────────────────────────────────────────────────

/**
 * Turn whatever the user pasted into a CryptoKey for `alg` + `usage`.
 * Handles: shared secrets (UTF-8 or base64url), SPKI/PKCS8 PEM, JWK, and
 * JWKS (kid-matched, else the first compatible key — callers that want to
 * try *every* JWKS candidate use `jwksCandidates` + `importJwkFor` directly).
 */
export async function importKeyFor(
  alg: JwsAlg,
  raw: string,
  usage: 'sign' | 'verify',
  opts?: { secretBase64url?: boolean; kid?: string },
): Promise<KeyImportResult> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return { ok: false, unsupported: true, reason: 'Web Crypto is unavailable in this environment.' };

  const spec = ALGS[alg];
  const kind = classifyKeyInput(raw);

  // ── HMAC family: secrets, oct JWKs, or an oct entry in a JWKS ──
  if (spec.kind === 'hmac') {
    if (kind === 'jwk') {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.trim());
      } catch {
        return {
          ok: false,
          reason:
            'This looks like JSON but does not parse as a JWK. If your plain-text secret really starts with "{", base64url-encode it and tick "Secret is base64url-encoded".',
        };
      }
      return importJwkFor(alg, parsed as Record<string, unknown>, usage);
    }
    if (kind === 'jwks') {
      const cands = jwksCandidates(raw, alg, opts?.kid);
      if (!cands.ok) return { ok: false, reason: cands.reason };
      return importJwkFor(alg, cands.jwks[0], usage);
    }
    if (kind !== 'secret') {
      return {
        ok: false,
        unsupported: true,
        reason: `${alg} uses a shared secret (or an oct JWK) — a PEM key cannot HMAC.`,
      };
    }
    let bytes: Uint8Array;
    if (opts?.secretBase64url) {
      const decoded = b64uToBytes(raw.trim());
      if (decoded === null) {
        return { ok: false, reason: 'The secret is not valid base64url — uncheck "base64url-encoded" for a plain-text secret.' };
      }
      bytes = decoded;
    } else {
      bytes = new TextEncoder().encode(raw ?? '');
    }
    try {
      const key = await subtle.importKey('raw', bytes as BufferSource, { name: 'HMAC', hash: spec.hash }, false, [usage]);
      return { ok: true, key };
    } catch {
      return { ok: false, reason: 'The secret could not be imported for HMAC.' };
    }
  }

  // ── Asymmetric families ──
  switch (kind) {
    case 'secret': {
      const need =
        usage === 'verify'
          ? 'a PEM public key (-----BEGIN PUBLIC KEY-----), a JWK, or a JWKS'
          : 'a PKCS8 PEM private key (-----BEGIN PRIVATE KEY-----) or a private JWK';
      return { ok: false, unsupported: true, reason: `${alg} needs ${need} — a plain secret only fits HS256/384/512.` };
    }
    case 'pem-cert':
    case 'pem-public':
    case 'pem-private':
      return importPemFor(alg, raw, usage);
    case 'jwk': {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.trim());
      } catch {
        return { ok: false, reason: 'The JWK is not valid JSON.' };
      }
      if (parsed === null || typeof parsed !== 'object') {
        return { ok: false, reason: 'A JWK must be a JSON object.' };
      }
      return importJwkFor(alg, parsed as Record<string, unknown>, usage);
    }
    case 'jwks': {
      const cands = jwksCandidates(raw, alg, opts?.kid);
      if (!cands.ok) return { ok: false, reason: cands.reason };
      const pick =
        usage === 'sign' ? (cands.jwks.find((k) => typeof k.d === 'string') ?? cands.jwks[0]) : cands.jwks[0];
      const res = await importJwkFor(alg, pick, usage);
      if (res.ok && cands.matchedKid) {
        return { ok: true, key: res.key, note: `Using the JWKS key with kid "${cands.matchedKid}".` };
      }
      return res;
    }
  }
}

// ── Feature detection ────────────────────────────────────────────────────────

let edProbe: Promise<boolean> | null = null;

/** Ed25519 public JWK from RFC 8037 §A.2 — used only to probe support. */
const ED_PROBE_JWK: JsonWebKey = {
  kty: 'OKP',
  crv: 'Ed25519',
  x: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo',
};

/** True when this runtime's Web Crypto can import Ed25519 keys (cached). */
export function edDsaSupported(): Promise<boolean> {
  if (edProbe) return edProbe;
  edProbe = (async () => {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return false;
    try {
      await subtle.importKey('jwk', ED_PROBE_JWK, { name: 'Ed25519' }, false, ['verify']);
      return true;
    } catch {
      return false;
    }
  })();
  return edProbe;
}
