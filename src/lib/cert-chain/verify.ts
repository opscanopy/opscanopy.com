/**
 * verify.ts — real signature verification through Web Crypto, plus fingerprints.
 *
 * The output is a TRI-STATE, always:
 *
 *   verified      the issuer's public key validates the signature over the TBS bytes
 *   failed        it does not — wrong issuer, or altered bytes
 *   not-verified  the check could not be made, and `reason` says why
 *
 * That third state is the whole reason this module exists in the shape it does.
 * A boolean would fold "this signature is forged" into "this browser cannot
 * check RSA-PSS", and on a page whose promise is ground truth that is the worst
 * possible bug: a confidently wrong answer. So `not-verified` always names the
 * algorithm and always explains itself.
 *
 * What is verifiable here is exactly what Web Crypto implements: RSASSA-PKCS1-v1_5
 * with SHA-1/256/384/512, ECDSA on P-256/384/521, and Ed25519 where the runtime
 * has it. RSASSA-PSS is deliberately NOT attempted — see PSS_REASON.
 *
 * Nothing here throws; every failure path returns a verdict.
 */
import { bytesEqual, hexColon, readChildren, readNode, TAG } from './der';
import { SIGNATURE_OIDS } from './oids';
import type { EdgeVerdict, ParsedCert } from './types';

export type SigFamily = 'rsa' | 'rsa-pss' | 'ecdsa' | 'eddsa' | 'dsa' | 'unknown';

export interface SigAlgInfo {
  /** Reader-facing name, always populated. */
  display: string;
  family: SigFamily;
  /** Web Crypto hash name, when the family needs one. */
  hash?: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';
  /** True when this module can actually check the signature. */
  verifiable: boolean;
  /** The algorithm works but must not be trusted (SHA-1). */
  deprecated?: boolean;
  /** Why it cannot be checked. Present whenever `verifiable` is false. */
  reason?: string;
}

/**
 * PSS puts its hash, salt length and MGF inside the AlgorithmIdentifier
 * parameters. Guessing them is worse than declining: a wrong salt length prints
 * "signature failed" for a certificate that is completely valid.
 */
const PSS_REASON =
  'RSASSA-PSS carries its hash, salt length and mask function inside the signature parameters. ' +
  'This tool does not guess them, so the signature is shown but not checked — a wrong guess would ' +
  'print "failed" for a perfectly valid certificate.';

function unsupported(display: string, family: SigFamily, what: string): SigAlgInfo {
  return {
    display,
    family,
    verifiable: false,
    reason: `Web Crypto does not implement ${what}, so this signature is shown but not checked in the browser.`,
  };
}

const TABLE: Record<string, SigAlgInfo> = {
  '1.2.840.113549.1.1.5': {
    display: 'RSA PKCS#1 v1.5 with SHA-1',
    family: 'rsa',
    hash: 'SHA-1',
    verifiable: true,
    deprecated: true,
  },
  '1.2.840.113549.1.1.11': {
    display: 'RSA PKCS#1 v1.5 with SHA-256',
    family: 'rsa',
    hash: 'SHA-256',
    verifiable: true,
  },
  '1.2.840.113549.1.1.12': {
    display: 'RSA PKCS#1 v1.5 with SHA-384',
    family: 'rsa',
    hash: 'SHA-384',
    verifiable: true,
  },
  '1.2.840.113549.1.1.13': {
    display: 'RSA PKCS#1 v1.5 with SHA-512',
    family: 'rsa',
    hash: 'SHA-512',
    verifiable: true,
  },
  '1.2.840.113549.1.1.10': {
    display: 'RSASSA-PSS',
    family: 'rsa-pss',
    verifiable: false,
    reason: PSS_REASON,
  },
  '1.2.840.113549.1.1.14': unsupported(
    'RSA PKCS#1 v1.5 with SHA-224',
    'rsa',
    'SHA-224',
  ),
  '1.2.840.113549.1.1.4': unsupported('RSA PKCS#1 v1.5 with MD5', 'rsa', 'MD5'),
  '1.2.840.113549.1.1.2': unsupported('RSA PKCS#1 v1.5 with MD2', 'rsa', 'MD2'),
  '1.2.840.10045.4.1': {
    display: 'ECDSA with SHA-1',
    family: 'ecdsa',
    hash: 'SHA-1',
    verifiable: true,
    deprecated: true,
  },
  '1.2.840.10045.4.3.1': unsupported('ECDSA with SHA-224', 'ecdsa', 'SHA-224'),
  '1.2.840.10045.4.3.2': {
    display: 'ECDSA with SHA-256',
    family: 'ecdsa',
    hash: 'SHA-256',
    verifiable: true,
  },
  '1.2.840.10045.4.3.3': {
    display: 'ECDSA with SHA-384',
    family: 'ecdsa',
    hash: 'SHA-384',
    verifiable: true,
  },
  '1.2.840.10045.4.3.4': {
    display: 'ECDSA with SHA-512',
    family: 'ecdsa',
    hash: 'SHA-512',
    verifiable: true,
  },
  '1.3.101.112': { display: 'Ed25519', family: 'eddsa', verifiable: true },
  '1.3.101.113': unsupported('Ed448', 'eddsa', 'Ed448'),
  '1.2.840.10040.4.3': unsupported('DSA with SHA-1', 'dsa', 'DSA'),
  '2.16.840.1.101.3.4.3.1': unsupported('DSA with SHA-224', 'dsa', 'DSA'),
  '2.16.840.1.101.3.4.3.2': unsupported('DSA with SHA-256', 'dsa', 'DSA'),
  '1.2.643.7.1.1.3.2': unsupported(
    'GOST R 34.10-2012 (256-bit)',
    'unknown',
    'the GOST algorithms',
  ),
  '1.2.643.7.1.1.3.3': unsupported(
    'GOST R 34.10-2012 (512-bit)',
    'unknown',
    'the GOST algorithms',
  ),
};

/** Everything this module knows about one signature-algorithm OID. */
export function describeSigAlg(oid: string): SigAlgInfo {
  const known = TABLE[oid];
  if (known) return known;
  const classic = SIGNATURE_OIDS[oid];
  return {
    display: classic ?? `unknown algorithm ${oid}`,
    family: 'unknown',
    verifiable: false,
    reason:
      `This signature algorithm (${oid}) is not one this tool recognises, so the signature is ` +
      `shown but not checked.`,
  };
}

// ── ECDSA signature conversion ───────────────────────────────────────────────

/**
 * X.509 stores an ECDSA signature as `SEQUENCE { INTEGER r, INTEGER s }`; Web
 * Crypto wants raw `r || s`, each component LEFT-PADDED to the curve's field
 * size.
 *
 * The padding is the part everybody gets wrong. DER strips leading zero bytes, so
 * roughly one signature in 256 has an r or s that is a byte short (and one in
 * 65 536 that is two short). Concatenating those without padding produces a
 * signature of the wrong length, Web Crypto returns `false`, and the tool reports
 * "signature failed" for a perfectly valid certificate — a confidently wrong
 * answer that only shows up on a fraction of inputs, which is the worst way for a
 * bug to behave.
 *
 * Returns `null` rather than a wrong-length buffer for anything malformed.
 */
export function derSigToRaw(der: Uint8Array, size: number): Uint8Array | null {
  if (!der || der.length === 0 || !Number.isInteger(size) || size <= 0) return null;
  const node = readNode(der, 0);
  if (!node || !node.constructed || node.tagNumber !== TAG.SEQUENCE || node.tagClass !== 0) {
    return null;
  }
  const parts = readChildren(node);
  if (!parts || parts.length !== 2) return null;
  const out = new Uint8Array(size * 2);
  for (let i = 0; i < 2; i += 1) {
    const part = parts[i];
    if (part.tagNumber !== TAG.INTEGER || part.tagClass !== 0) return null;
    let bytes = part.content;
    if (bytes.length === 0) return null;
    let from = 0;
    while (from < bytes.length - 1 && bytes[from] === 0) from += 1;
    bytes = bytes.subarray(from);
    if (bytes.length > size) return null;
    out.set(bytes, i * size + (size - bytes.length));
  }
  return out;
}

// ── Fingerprints ─────────────────────────────────────────────────────────────

async function digest(alg: 'SHA-256' | 'SHA-1', bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return '';
  try {
    const hash = await subtle.digest(alg, bytes as unknown as BufferSource);
    return hexColon(new Uint8Array(hash));
  } catch {
    return '';
  }
}

/**
 * SHA-256 and SHA-1 fingerprints over the WHOLE certificate DER — the same bytes
 * `openssl x509 -fingerprint` hashes, so the values are comparable with what a
 * CA publishes and with what a browser shows.
 */
export async function fingerprints(der: Uint8Array): Promise<{ sha256: string; sha1: string }> {
  const [sha256, sha1] = await Promise.all([digest('SHA-256', der), digest('SHA-1', der)]);
  return { sha256, sha1 };
}

// ── Ed25519 runtime probe ────────────────────────────────────────────────────

let edProbe: Promise<boolean> | null = null;

/** Ed25519 public JWK from RFC 8037 §A.2, used only to probe support. */
const ED_PROBE_JWK: JsonWebKey = {
  kty: 'OKP',
  crv: 'Ed25519',
  x: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo',
};

/**
 * True when this runtime's Web Crypto can import Ed25519 keys (cached). Mirrors
 * `edDsaSupported()` in `src/lib/jwt-decoder/keys.ts`: Ed25519 shipped in Safari
 * 17 and Chrome 137, so on an older browser the honest answer is `not-verified`
 * naming Ed25519 — never `failed`.
 */
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

// ── The edge verdict ─────────────────────────────────────────────────────────

const MISMATCH_REASON =
  'The issuer’s public key does not validate this signature. Either this is not the certificate ' +
  'that signed it, or one of the two has been altered.';

const SHA1_NOTE =
  'SHA-1 is broken for signatures and no public CA has issued a SHA-1 certificate since 2016. ' +
  'The maths checks out; the algorithm does not.';

/** Bytes per ECDSA signature component for a curve of `bits` bits. */
function fieldSize(bits: number): number {
  return Math.ceil(bits / 8);
}

function verdict(
  subjectIndex: number,
  issuerIndex: number,
  info: SigAlgInfo,
  extra: Partial<EdgeVerdict>,
): EdgeVerdict {
  return {
    subjectIndex,
    issuerIndex,
    algorithm: info.display,
    status: 'not-verified',
    ...(info.deprecated ? { deprecated: true } : {}),
    ...extra,
  };
}

/**
 * Check one chain edge: did `issuer`'s public key sign `subject`?
 *
 * Indices default to 0 so the function is usable on a bare pair (as the tests
 * do); `verifyChainEdges` passes the real chain positions.
 */
export async function verifyEdge(
  subject: ParsedCert,
  issuer: ParsedCert,
  subjectIndex = 0,
  issuerIndex = 0,
): Promise<EdgeVerdict> {
  const info = describeSigAlg(subject.sigAlgOid);
  // Byte comparison, not index comparison: `verifyEdge(cert, cert)` is a valid
  // call with both indices defaulted to 0, and so is edge {2,2} on a real chain.
  const selfSigned = subject.selfIssued && bytesEqual(subject.raw.der, issuer.raw.der);
  const base = selfSigned ? { selfSigned: true } : {};

  if (!info.verifiable) {
    return verdict(subjectIndex, issuerIndex, info, { ...base, reason: info.reason });
  }

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return verdict(subjectIndex, issuerIndex, info, {
      ...base,
      reason: 'Web Crypto is unavailable in this browser, so no signature can be checked here.',
    });
  }

  // A family mismatch is not an inability to check — it is proof that this
  // certificate did not sign the other one.
  const keyType = issuer.spki.keyType;
  const familyOfKey: Record<string, SigFamily> = {
    RSA: 'rsa',
    EC: 'ecdsa',
    Ed25519: 'eddsa',
    Ed448: 'eddsa',
    DSA: 'dsa',
  };
  const expected = familyOfKey[keyType];
  if (expected && expected !== info.family) {
    return verdict(subjectIndex, issuerIndex, info, {
      ...base,
      status: 'failed',
      reason:
        `This signature is ${info.display}, but the candidate issuer’s key is ${issuer.spki.summary}. ` +
        `A ${keyType} key cannot produce this signature, so that certificate did not sign this one.`,
    });
  }

  let algorithm: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams;
  let verifyParams: AlgorithmIdentifier | RsaPssParams | EcdsaParams;
  let signature: Uint8Array = subject.raw.sigBytes;

  if (info.family === 'rsa') {
    algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: info.hash! };
    verifyParams = { name: 'RSASSA-PKCS1-v1_5' };
  } else if (info.family === 'ecdsa') {
    const curve = issuer.spki.curve;
    if (!curve || !issuer.spki.bits) {
      return verdict(subjectIndex, issuerIndex, info, {
        ...base,
        reason:
          `The issuer's key is on a curve this tool does not recognise (${issuer.spki.summary}), ` +
          `so the signature cannot be checked.`,
      });
    }
    algorithm = { name: 'ECDSA', namedCurve: curve };
    verifyParams = { name: 'ECDSA', hash: info.hash! };
    const raw = derSigToRaw(subject.raw.sigBytes, fieldSize(issuer.spki.bits));
    if (!raw) {
      return verdict(subjectIndex, issuerIndex, info, {
        ...base,
        status: 'failed',
        reason:
          'The ECDSA signature is not a well-formed SEQUENCE of two integers that fit this curve, ' +
          'so it cannot be the signature this certificate claims.',
      });
    }
    signature = raw;
  } else if (info.family === 'eddsa') {
    if (!(await edDsaSupported())) {
      return verdict(subjectIndex, issuerIndex, info, {
        ...base,
        reason:
          'This browser’s Web Crypto has no Ed25519 support, so the signature is shown but not ' +
          'checked. Ed25519 arrived in Chrome 137 and Safari 17.',
      });
    }
    algorithm = { name: 'Ed25519' };
    verifyParams = { name: 'Ed25519' };
  } else {
    return verdict(subjectIndex, issuerIndex, info, { ...base, reason: info.reason });
  }

  let key: CryptoKey;
  try {
    key = await subtle.importKey(
      'spki',
      issuer.raw.spki as unknown as BufferSource,
      algorithm,
      false,
      ['verify'],
    );
  } catch {
    return verdict(subjectIndex, issuerIndex, info, {
      ...base,
      reason:
        `The issuer’s public key (${issuer.spki.summary}) could not be imported for ` +
        `${info.display}, so the signature is shown but not checked.`,
    });
  }

  let ok = false;
  try {
    ok = await subtle.verify(
      verifyParams,
      key,
      signature as unknown as BufferSource,
      subject.raw.tbs as unknown as BufferSource,
    );
  } catch {
    return verdict(subjectIndex, issuerIndex, info, {
      ...base,
      reason: 'Web Crypto refused the signature check itself, so no verdict is available.',
    });
  }

  if (ok) {
    return verdict(subjectIndex, issuerIndex, info, {
      ...base,
      status: 'verified',
      ...(info.deprecated ? { note: SHA1_NOTE } : {}),
    });
  }
  return verdict(subjectIndex, issuerIndex, info, {
    ...base,
    status: 'failed',
    reason: MISMATCH_REASON,
  });
}

/** Verify every edge of an ordered chain, concurrently. */
export async function verifyChainEdges(
  ordered: ParsedCert[],
  edges: { subjectIndex: number; issuerIndex: number }[],
): Promise<EdgeVerdict[]> {
  return Promise.all(
    edges.map((edge) => {
      const subject = ordered[edge.subjectIndex];
      const issuer = ordered[edge.issuerIndex];
      if (!subject || !issuer) {
        return Promise.resolve<EdgeVerdict>({
          ...edge,
          status: 'not-verified',
          algorithm: 'unknown',
          reason: 'One end of this link is missing from the chain.',
        });
      }
      return verifyEdge(subject, issuer, edge.subjectIndex, edge.issuerIndex);
    }),
  );
}
