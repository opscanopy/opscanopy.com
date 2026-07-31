/**
 * x509.ts — turn certificate DER into a `ParsedCert`.
 *
 * One entry point, `parseCertificate(der)`, which returns `null` for anything
 * that is not a well-formed X.509 certificate and never throws. It walks the
 * structure with `der.ts` and keeps VIEWS of the four byte ranges the rest of the
 * tool needs — the whole DER (fingerprints), the tbsCertificate TLV (the signed
 * bytes), the signature value, and the SubjectPublicKeyInfo TLV (ready for
 * `crypto.subtle.importKey('spki', …)`).
 *
 * Values come back VERBATIM. A subject full of HTML is returned as HTML; the
 * renderer escapes. A parser that sanitised would corrupt the one thing a
 * decoder is for — showing you exactly what is in the certificate.
 *
 * Extensions this module understands: subjectKeyIdentifier,
 * authorityKeyIdentifier, keyUsage, extendedKeyUsage, basicConstraints,
 * subjectAltName. Everything else is listed by name with its critical flag but
 * not decoded — deliberate: rendering a half-understood nameConstraints or
 * certificatePolicies is worse than saying "present, not decoded here".
 */
import {
  TAG,
  bitSet,
  bytesEqual,
  decodeBitString,
  decodeBoolean,
  decodeIntegerBig,
  decodeOid,
  decodeString,
  decodeTime,
  hexColon,
  readChildren,
  readNode,
  type DerNode,
} from './der';
import {
  CURVE_OIDS,
  KEY_USAGE_BITS,
  PUBLIC_KEY_OIDS,
  SIGNATURE_OIDS,
  dnLabel,
  ekuName,
  extensionName,
} from './oids';
import { describeSigAlg } from './verify';
import type {
  AuthorityKeyId,
  BasicConstraints,
  Name,
  NameAttribute,
  ParsedCert,
  ParsedExtension,
  San,
  SubjectPublicKey,
} from './types';

/** A certificate with more attributes than this in one DN is not a certificate. */
const MAX_DN_ATTRIBUTES = 200;
/** SANs beyond this many are dropped; some appliances emit thousands. */
const MAX_SANS = 500;

function isSequence(node: DerNode | null): boolean {
  return !!node && node.constructed && node.tagClass === 0 && node.tagNumber === TAG.SEQUENCE;
}

function isContext(node: DerNode | null, tagNumber: number): boolean {
  return !!node && node.tagClass === 2 && node.tagNumber === tagNumber;
}

// ── Distinguished names ──────────────────────────────────────────────────────

/**
 * Parse a `Name` (RDNSequence). Multi-valued RDNs are preserved as nested
 * arrays: `OU=Platform Ops + CN=multi.example.com` is ONE RDN holding two
 * attributes, and flattening it would misrepresent the certificate.
 */
function parseName(node: DerNode | null): Name | null {
  if (!isSequence(node)) return null;
  const rdnNodes = readChildren(node);
  if (!rdnNodes) return null;
  const rdns: NameAttribute[][] = [];
  let attributeCount = 0;

  for (const rdnNode of rdnNodes) {
    if (!rdnNode.constructed) return null;
    const atvNodes = readChildren(rdnNode);
    if (!atvNodes) return null;
    const attributes: NameAttribute[] = [];
    for (const atv of atvNodes) {
      attributeCount += 1;
      if (attributeCount > MAX_DN_ATTRIBUTES) return null;
      const parts = readChildren(atv);
      if (!parts || parts.length < 2) return null;
      const oid = decodeOid(parts[0].content);
      if (!oid) return null;
      const value = decodeString(parts[1]) ?? hexColon(parts[1].content);
      attributes.push({ oid, label: dnLabel(oid), value });
    }
    rdns.push(attributes);
  }

  const text = rdns
    .map((rdn) => rdn.map((a) => `${a.label}=${a.value}`).join(' + '))
    .join(', ');
  return { rdns, text };
}

/** The subject's commonName. The LAST one wins, as OpenSSL and clients do. */
function commonNameOf(name: Name): string {
  let found = '';
  for (const rdn of name.rdns) {
    for (const attribute of rdn) {
      if (attribute.oid === '2.5.4.3') found = attribute.value;
    }
  }
  return found;
}

// ── Public keys ──────────────────────────────────────────────────────────────

/** Significant bit length of a big-endian unsigned integer's bytes. */
function bitLengthOf(bytes: Uint8Array): number {
  let i = 0;
  while (i < bytes.length && bytes[i] === 0) i += 1;
  if (i === bytes.length) return 0;
  let bits = (bytes.length - i - 1) * 8;
  let top = bytes[i];
  while (top > 0) {
    bits += 1;
    top >>= 1;
  }
  return bits;
}

function parseSpki(node: DerNode | null): SubjectPublicKey | null {
  if (!isSequence(node)) return null;
  const parts = readChildren(node);
  if (!parts || parts.length < 2) return null;
  const algParts = readChildren(parts[0]);
  if (!algParts || algParts.length < 1) return null;
  const oid = decodeOid(algParts[0].content);
  if (!oid) return null;
  const keyBits = decodeBitString(parts[1].content);

  if (oid === '1.2.840.113549.1.1.1' || oid === '1.2.840.113549.1.1.10') {
    let bits: number | undefined;
    if (keyBits) {
      const inner = readChildren(readNode(keyBits.bytes, 0));
      if (inner && inner.length >= 1) bits = bitLengthOf(inner[0].content);
    }
    return {
      oid,
      keyType: 'RSA',
      bits,
      summary: bits ? `RSA ${bits}-bit` : 'RSA',
    };
  }

  if (oid === '1.2.840.10045.2.1') {
    const curveOid = algParts.length > 1 ? decodeOid(algParts[1].content) : null;
    const curve = curveOid ? CURVE_OIDS[curveOid] : undefined;
    return {
      oid,
      keyType: 'EC',
      bits: curve?.bits,
      curve: curve?.name,
      summary: curve ? `ECDSA ${curve.name}` : `ECDSA (curve ${curveOid ?? 'unknown'})`,
    };
  }

  if (oid === '1.3.101.112' || oid === '1.3.101.113') {
    const name = oid === '1.3.101.112' ? 'Ed25519' : 'Ed448';
    return {
      oid,
      keyType: name === 'Ed25519' ? 'Ed25519' : 'Ed448',
      bits: name === 'Ed25519' ? 256 : 448,
      summary: name,
    };
  }

  if (oid === '1.2.840.10040.4.1') {
    return { oid, keyType: 'DSA', summary: 'DSA' };
  }

  const label = PUBLIC_KEY_OIDS[oid] ?? oid;
  return { oid, keyType: 'unknown', summary: `${label} (not recognised)` };
}

// ── IP formatting for SANs ───────────────────────────────────────────────────

/** Format an iPAddress SAN: 4 bytes → dotted quad, 16 → compressed IPv6. */
function formatIp(bytes: Uint8Array): string | null {
  if (bytes.length === 4) return Array.from(bytes).join('.');
  if (bytes.length !== 16) return null;
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) {
    groups.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
  }
  // Compress the longest run of two or more zero groups (RFC 5952).
  let bestStart = -1;
  let bestLength = 0;
  let runStart = -1;
  for (let i = 0; i <= groups.length; i += 1) {
    if (i < groups.length && groups[i] === '0') {
      if (runStart === -1) runStart = i;
    } else if (runStart !== -1) {
      const length = i - runStart;
      if (length > bestLength) {
        bestLength = length;
        bestStart = runStart;
      }
      runStart = -1;
    }
  }
  if (bestLength < 2) return groups.join(':');
  const head = groups.slice(0, bestStart).join(':');
  const tail = groups.slice(bestStart + bestLength).join(':');
  return `${head}::${tail}`;
}

// ── Extensions ───────────────────────────────────────────────────────────────

interface ExtensionSink {
  extensions: ParsedExtension[];
  sans: San[];
  keyUsage: string[];
  keyUsageCritical: boolean;
  extKeyUsage: { oids: string[]; names: string[] };
  basicConstraints?: BasicConstraints;
  ski?: string;
  aki?: AuthorityKeyId;
  warnings: string[];
}

function parseSubjectAltName(value: Uint8Array, sink: ExtensionSink): string | undefined {
  const items = readChildren(readNode(value, 0));
  if (!items) return undefined;
  for (const item of items) {
    if (sink.sans.length >= MAX_SANS) break;
    switch (item.tagNumber) {
      case 1:
        sink.sans.push({ kind: 'email', value: decodeStringBytes(item.content) });
        break;
      case 2:
        sink.sans.push({ kind: 'dns', value: decodeStringBytes(item.content) });
        break;
      case 4: {
        const name = parseName(readChildren(item)?.[0] ?? null);
        sink.sans.push({ kind: 'dirname', value: name?.text ?? hexColon(item.content) });
        break;
      }
      case 6:
        sink.sans.push({ kind: 'uri', value: decodeStringBytes(item.content) });
        break;
      case 7: {
        const ip = formatIp(item.content);
        sink.sans.push({ kind: 'ip', value: ip ?? hexColon(item.content) });
        break;
      }
      case 8: {
        const oid = decodeOid(item.content);
        sink.sans.push({ kind: 'other', value: oid ? `registeredID ${oid}` : hexColon(item.content) });
        break;
      }
      default:
        sink.sans.push({ kind: 'other', value: `[${item.tagNumber}] ${hexColon(item.content)}` });
        break;
    }
  }
  const shown = sink.sans.slice(0, 4).map((s) => s.value);
  return sink.sans.length > 4 ? `${shown.join(', ')} … ${sink.sans.length} names` : shown.join(', ');
}

const asciiDecoder = new TextDecoder('utf-8');

/** IA5String-ish content: decode as UTF-8, which is a superset for real names. */
function decodeStringBytes(bytes: Uint8Array): string {
  try {
    return asciiDecoder.decode(bytes);
  } catch {
    let out = '';
    for (const byte of bytes) out += String.fromCharCode(byte);
    return out;
  }
}

function applyExtension(oid: string, critical: boolean, value: Uint8Array, sink: ExtensionSink): void {
  const name = extensionName(oid);
  let understood = true;
  let detail: string | undefined;

  switch (oid) {
    case '2.5.29.14': {
      const inner = readNode(value, 0);
      if (inner && inner.tagNumber === TAG.OCTET_STRING) {
        sink.ski = hexColon(inner.content);
        detail = sink.ski;
      } else understood = false;
      break;
    }
    case '2.5.29.35': {
      const parts = readChildren(readNode(value, 0));
      if (parts) {
        const aki: AuthorityKeyId = {};
        for (const part of parts) {
          if (isContext(part, 0)) aki.keyId = hexColon(part.content);
          else if (isContext(part, 1)) {
            const names = readChildren(part);
            const dir = names?.find((n) => n.tagNumber === 4);
            const parsed = dir ? parseName(readChildren(dir)?.[0] ?? null) : null;
            if (parsed) aki.issuerText = parsed.text;
          } else if (isContext(part, 2)) {
            const serial = decodeIntegerBig(part.content);
            if (serial !== null) aki.serialHex = hexColon(part.content);
          }
        }
        sink.aki = aki;
        detail = aki.keyId;
      } else understood = false;
      break;
    }
    case '2.5.29.15': {
      const node = readNode(value, 0);
      const bits = node ? decodeBitString(node.content) : null;
      if (bits) {
        sink.keyUsageCritical = critical;
        KEY_USAGE_BITS.forEach((usage, index) => {
          if (bitSet(bits, index)) sink.keyUsage.push(usage);
        });
        detail = sink.keyUsage.join(', ');
        if (sink.keyUsage.length === 0) {
          sink.warnings.push(
            'The keyUsage extension is present but every bit is zero, which forbids every use of this key.',
          );
        }
      } else understood = false;
      break;
    }
    case '2.5.29.37': {
      const items = readChildren(readNode(value, 0));
      if (items) {
        for (const item of items) {
          const purpose = decodeOid(item.content);
          if (purpose) {
            sink.extKeyUsage.oids.push(purpose);
            sink.extKeyUsage.names.push(ekuName(purpose));
          }
        }
        detail = sink.extKeyUsage.names.join(', ');
      } else understood = false;
      break;
    }
    case '2.5.29.19': {
      const parts = readChildren(readNode(value, 0));
      if (parts) {
        const constraints: BasicConstraints = { ca: false, critical };
        for (const part of parts) {
          if (part.tagNumber === TAG.BOOLEAN && part.tagClass === 0) {
            constraints.ca = decodeBoolean(part.content) === true;
          } else if (part.tagNumber === TAG.INTEGER && part.tagClass === 0) {
            const pathLen = decodeIntegerBig(part.content);
            if (pathLen !== null && pathLen >= 0n && pathLen < 1000n) {
              constraints.pathLen = Number(pathLen);
            }
          }
        }
        sink.basicConstraints = constraints;
        detail = constraints.ca
          ? `CA:TRUE${constraints.pathLen === undefined ? '' : `, pathlen:${constraints.pathLen}`}`
          : 'CA:FALSE';
      } else understood = false;
      break;
    }
    case '2.5.29.17':
      detail = parseSubjectAltName(value, sink);
      understood = detail !== undefined;
      break;
    default:
      understood = false;
      break;
  }

  sink.extensions.push({ oid, name, critical, understood, detail });
}

// ── The certificate ──────────────────────────────────────────────────────────

/**
 * Parse certificate DER. Returns `null` for anything that is not a certificate —
 * truncated, flipped, empty, or a different ASN.1 structure entirely.
 */
export function parseCertificate(der: Uint8Array): ParsedCert | null {
  try {
    return parseCertificateInner(der);
  } catch {
    // Defence in depth. Every helper is written to return null rather than
    // throw, but a certificate parser is exactly the wrong place to be sure.
    return null;
  }
}

function parseCertificateInner(der: Uint8Array): ParsedCert | null {
  if (!der || der.length < 32) return null;
  const outer = readNode(der, 0);
  if (!isSequence(outer)) return null;
  const top = readChildren(outer);
  if (!top || top.length < 3) return null;

  const [tbsNode, sigAlgNode, sigValueNode] = top;
  if (!isSequence(tbsNode) || !isSequence(sigAlgNode)) return null;
  if (sigValueNode.tagNumber !== TAG.BIT_STRING || sigValueNode.tagClass !== 0) return null;

  const sigAlgParts = readChildren(sigAlgNode);
  if (!sigAlgParts || sigAlgParts.length < 1) return null;
  const sigAlgOid = decodeOid(sigAlgParts[0].content);
  if (!sigAlgOid) return null;

  const sigBits = decodeBitString(sigValueNode.content);
  if (!sigBits) return null;

  const fields = readChildren(tbsNode);
  if (!fields || fields.length < 6) return null;

  const warnings: string[] = [];
  let cursor = 0;
  let version: 1 | 2 | 3 = 1;

  if (isContext(fields[cursor], 0) && fields[cursor].constructed) {
    const inner = readChildren(fields[cursor]);
    const raw = inner && inner.length > 0 ? decodeIntegerBig(inner[0].content) : null;
    if (raw === 1n) version = 2;
    else if (raw === 2n) version = 3;
    else if (raw !== 0n && raw !== null) return null;
    cursor += 1;
  }

  const serialNode = fields[cursor];
  if (!serialNode || serialNode.tagNumber !== TAG.INTEGER || serialNode.tagClass !== 0) return null;
  const serial = decodeIntegerBig(serialNode.content);
  if (serial === null) return null;
  cursor += 1;

  const innerAlgNode = fields[cursor];
  if (!isSequence(innerAlgNode)) return null;
  const innerAlgParts = readChildren(innerAlgNode);
  const innerAlgOid = innerAlgParts?.[0] ? decodeOid(innerAlgParts[0].content) : null;
  cursor += 1;

  const issuer = parseName(fields[cursor]);
  if (!issuer) return null;
  const issuerNode = fields[cursor];
  cursor += 1;

  const validityNode = fields[cursor];
  if (!isSequence(validityNode)) return null;
  const validity = readChildren(validityNode);
  if (!validity || validity.length < 2) return null;
  const notBefore = decodeTime(validity[0]);
  const notAfter = decodeTime(validity[1]);
  if (!notBefore || !notAfter) return null;
  cursor += 1;

  const subject = parseName(fields[cursor]);
  if (!subject) return null;
  const subjectNode = fields[cursor];
  cursor += 1;

  const spkiNode = fields[cursor];
  const spki = parseSpki(spkiNode);
  if (!spki || !spkiNode) return null;
  cursor += 1;

  const sink: ExtensionSink = {
    extensions: [],
    sans: [],
    keyUsage: [],
    keyUsageCritical: false,
    extKeyUsage: { oids: [], names: [] },
    warnings: [],
  };

  for (let i = cursor; i < fields.length; i += 1) {
    const field = fields[i];
    if (!isContext(field, 3)) continue;
    const extensionsSeq = readChildren(field)?.[0] ?? null;
    const items = readChildren(extensionsSeq);
    if (!items) {
      sink.warnings.push('The extensions block could not be decoded, so no extension is shown.');
      break;
    }
    for (const item of items) {
      const parts = readChildren(item);
      if (!parts || parts.length < 2) continue;
      const oid = decodeOid(parts[0].content);
      if (!oid) continue;
      let critical = false;
      let valueNode = parts[1];
      if (parts.length >= 3) {
        critical = decodeBoolean(parts[1].content) === true;
        valueNode = parts[2];
      }
      if (valueNode.tagNumber !== TAG.OCTET_STRING || valueNode.tagClass !== 0) continue;
      applyExtension(oid, critical, valueNode.content, sink);
    }
  }

  warnings.push(...sink.warnings);

  if (version === 1) {
    warnings.push(
      'This is an X.509 version 1 certificate: it carries no extensions, so it has no ' +
        'subjectAltName, no basicConstraints and no key identifiers. Clients have rejected v1 ' +
        'server certificates since 2017.',
    );
  }
  if (serial < 0n) {
    warnings.push(
      'The serial number is negative. RFC 5280 requires a positive serial, so some clients will ' +
        'reject this certificate outright.',
    );
  }
  if (innerAlgOid && innerAlgOid !== sigAlgOid) {
    warnings.push(
      `The signature algorithm inside the signed data (${innerAlgOid}) does not match the one ` +
        `outside it (${sigAlgOid}). That mismatch is a signature-substitution red flag.`,
    );
  }
  if (notAfter.date.getTime() <= notBefore.date.getTime()) {
    warnings.push(
      'The validity window ends at or before it begins, so this certificate is never valid.',
    );
  }
  const isCa = sink.basicConstraints?.ca === true;
  if (!isCa && sink.sans.length === 0 && version === 3) {
    warnings.push(
      'This certificate has no subjectAltName. Browsers have ignored commonName since 2017, so ' +
        'they will reject it for every hostname.',
    );
  }

  // DER prepends 0x00 to a positive INTEGER whose top bit is set. That byte is
  // encoding, not value: `openssl x509 -serial` does not print it, so neither do
  // we, or a fingerprint-style copy/paste comparison against openssl fails. A
  // NEGATIVE serial keeps its bytes verbatim — there is no padding to strip.
  let serialBytes = serialNode.content;
  if (serial >= 0n) {
    let from = 0;
    while (from < serialBytes.length - 1 && serialBytes[from] === 0x00) from += 1;
    serialBytes = serialBytes.subarray(from);
  }
  return {
    inputIndex: 0,
    version,
    serialHex: hexColon(serialBytes),
    serialDecimal: serial.toString(),
    serialNegative: serial < 0n,
    subject,
    issuer,
    commonName: commonNameOf(subject),
    notBefore: notBefore.date,
    notAfter: notAfter.date,
    notBeforeKind: notBefore.kind,
    notAfterKind: notAfter.kind,
    sigAlgOid,
    sigAlgName: SIGNATURE_OIDS[sigAlgOid] ?? sigAlgOid,
    sigAlgDisplay: describeSigAlg(sigAlgOid).display,
    spki,
    extensions: sink.extensions,
    sans: sink.sans,
    keyUsage: sink.keyUsage,
    keyUsageCritical: sink.keyUsageCritical,
    extKeyUsage: sink.extKeyUsage,
    basicConstraints: sink.basicConstraints,
    ski: sink.ski,
    aki: sink.aki,
    isCa,
    selfIssued: bytesEqual(subjectNode.full, issuerNode.full),
    raw: {
      der: outer!.full,
      tbs: tbsNode.full,
      sigBytes: sigBits.bytes,
      spki: spkiNode.full,
    },
    warnings,
  };
}
