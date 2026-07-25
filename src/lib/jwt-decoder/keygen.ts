/**
 * JWT Decoder & Encoder — in-browser key generation. Produces test/dev key
 * material entirely client-side: a random HMAC secret (base64url), or an
 * RSA / EC P-256/384/521 / Ed25519 key pair exported as BOTH PEM (SPKI public
 * + PKCS8 private, 64-column wrapped) and pretty-printed JWK.
 *
 * Never throws on user input; resolves `{ ok:false, error }` instead —
 * including on runtimes whose Web Crypto lacks Ed25519.
 */
import type { KeygenRequest, KeygenResult } from './types';
import { bytesToB64u, derToPem } from './keys';

/** Export one CryptoKeyPair as { publicPem, privatePem, publicJwk, privateJwk }. */
async function exportPair(pair: CryptoKeyPair): Promise<{
  publicPem: string;
  privatePem: string;
  publicJwk: string;
  privateJwk: string;
}> {
  const subtle = globalThis.crypto.subtle;
  const [spki, pkcs8, pubJwk, privJwk] = await Promise.all([
    subtle.exportKey('spki', pair.publicKey),
    subtle.exportKey('pkcs8', pair.privateKey),
    subtle.exportKey('jwk', pair.publicKey),
    subtle.exportKey('jwk', pair.privateKey),
  ]);
  // Exported JWKs carry key_ops/ext noise; keep them but drop nothing else —
  // consumers (including this tool's own verify/sign) tolerate the extras.
  return {
    publicPem: derToPem(new Uint8Array(spki), 'PUBLIC KEY'),
    privatePem: derToPem(new Uint8Array(pkcs8), 'PRIVATE KEY'),
    publicJwk: JSON.stringify(pubJwk, null, 2),
    privateJwk: JSON.stringify(privJwk, null, 2),
  };
}

/** Generate the requested key material. Resolves; never rejects. */
export async function generateKeys(req: KeygenRequest): Promise<KeygenResult> {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.subtle) {
    return { ok: false, error: 'Web Crypto is unavailable in this environment.' };
  }

  try {
    switch (req.kind) {
      case 'hmac': {
        const bytes = new Uint8Array(req.bytes);
        cryptoObj.getRandomValues(bytes);
        return { ok: true, secretB64u: bytesToB64u(bytes) };
      }
      case 'rsa': {
        // One RSASSA key pair serves RS* directly; the material also works
        // for PS* (the JWK/PEM carries no algorithm binding).
        const pair = await cryptoObj.subtle.generateKey(
          {
            name: 'RSASSA-PKCS1-v1_5',
            modulusLength: req.modulus,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-256',
          },
          true,
          ['sign', 'verify'],
        );
        return { ok: true, ...(await exportPair(pair)) };
      }
      case 'ec': {
        const pair = await cryptoObj.subtle.generateKey(
          { name: 'ECDSA', namedCurve: req.curve },
          true,
          ['sign', 'verify'],
        );
        return { ok: true, ...(await exportPair(pair)) };
      }
      case 'ed25519': {
        const pair = (await cryptoObj.subtle.generateKey({ name: 'Ed25519' }, true, [
          'sign',
          'verify',
        ])) as CryptoKeyPair;
        return { ok: true, ...(await exportPair(pair)) };
      }
    }
  } catch (err) {
    if (req.kind === 'ed25519' && (err as Error)?.name === 'NotSupportedError') {
      return { ok: false, error: 'This browser does not support Ed25519 in Web Crypto yet.' };
    }
    return { ok: false, error: 'Key generation failed — try a different size or curve.' };
  }
}
