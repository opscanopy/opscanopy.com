/**
 * cert-chain — every shared type for the certificate decoder & chain checker.
 *
 * Two rules run through the whole module and are encoded in these shapes:
 *
 *  1. **A signature check is a tri-state, never a boolean.** `EdgeVerdict.status`
 *     is `verified | failed | not-verified`. Collapsing that to `true/false`
 *     would make "this signature is forged" and "this browser cannot check
 *     RSA-PSS" render identically, which on a page whose promise is ground truth
 *     is the worst bug available.
 *
 *  2. **Nothing rounded is presented as exact.** `ExpiryInfo` carries the exact
 *     `notAfter` instant, a day count truncated toward zero, and an
 *     `approximate` flag that the renderer must honour ("expires in about 42
 *     days" vs "expires in 42 days").
 *
 * Parsers return `null`; analysis returns issues. Nothing in this module throws
 * on user input.
 */

// ── Names ────────────────────────────────────────────────────────────────────

/** One `AttributeTypeAndValue`: an OID plus its decoded string value. */
export interface NameAttribute {
  /** Dotted OID, e.g. `2.5.4.3`. */
  oid: string;
  /** Short label where one is known (`CN`, `O`, `OU`…), else the dotted OID. */
  label: string;
  /** The decoded value, VERBATIM — escaping belongs to the renderer. */
  value: string;
}

/**
 * A distinguished name. `rdns` is the real structure — a sequence of RDNs, each
 * a SET of one or more attributes — because a multi-valued RDN (`OU=A + CN=B`)
 * is a single RDN and flattening it loses that.
 */
export interface Name {
  rdns: NameAttribute[][];
  /** One-line form: attributes joined `, `, multi-valued RDNs joined ` + `. */
  text: string;
}

// ── Public keys, extensions, SANs ────────────────────────────────────────────

export type KeyType = 'RSA' | 'EC' | 'Ed25519' | 'Ed448' | 'DSA' | 'DH' | 'unknown';

export interface SubjectPublicKey {
  /** Algorithm OID from the SPKI AlgorithmIdentifier. */
  oid: string;
  keyType: KeyType;
  /** Modulus size for RSA, field size for EC, key size for EdDSA. */
  bits?: number;
  /** Named curve for EC keys, in Web Crypto spelling (`P-256`, `P-384`, `P-521`). */
  curve?: string;
  /** One-line human summary, e.g. `RSA 2048-bit` / `ECDSA P-384`. */
  summary: string;
}

export interface ParsedExtension {
  oid: string;
  /** Known short name (`subjectAltName`…) or the dotted OID. */
  name: string;
  critical: boolean;
  /** True when this module understands the extension body. */
  understood: boolean;
  /** Short rendered value for the "all extensions" list, where one is available. */
  detail?: string;
}

export type SanKind = 'dns' | 'ip' | 'email' | 'uri' | 'dirname' | 'other';

export interface San {
  kind: SanKind;
  value: string;
}

export interface BasicConstraints {
  ca: boolean;
  pathLen?: number;
  critical: boolean;
}

export interface AuthorityKeyId {
  /** Hex, colon-separated, upper case — comparable with a `ski` directly. */
  keyId?: string;
  serialHex?: string;
  issuerText?: string;
}

// ── The certificate ──────────────────────────────────────────────────────────

export interface ParsedCert {
  /** 0-based position in the paste, before any reordering. */
  inputIndex: number;
  version: 1 | 2 | 3;
  serialHex: string;
  /** Exact decimal via BigInt — a 20-byte serial does not fit a double. */
  serialDecimal: string;
  serialNegative: boolean;
  subject: Name;
  issuer: Name;
  /** The subject's commonName, or '' when it has none (SAN-only certificates). */
  commonName: string;
  notBefore: Date;
  notAfter: Date;
  notBeforeKind: 'utc' | 'generalized';
  notAfterKind: 'utc' | 'generalized';
  sigAlgOid: string;
  /** Classic OpenSSL spelling, e.g. `sha256WithRSAEncryption`. */
  sigAlgName: string;
  /** Reader-facing spelling, e.g. `RSA PKCS#1 v1.5 with SHA-256`. */
  sigAlgDisplay: string;
  spki: SubjectPublicKey;
  extensions: ParsedExtension[];
  sans: San[];
  keyUsage: string[];
  keyUsageCritical: boolean;
  extKeyUsage: { oids: string[]; names: string[] };
  basicConstraints?: BasicConstraints;
  ski?: string;
  aki?: AuthorityKeyId;
  isCa: boolean;
  /** Subject DN is byte-identical to issuer DN. Not proof of a self-signature. */
  selfIssued: boolean;
  raw: {
    /** The whole certificate DER. Fingerprints are taken over this. */
    der: Uint8Array;
    /** The signed bytes: the tbsCertificate TLV, header included. */
    tbs: Uint8Array;
    /** The signature value, unwrapped from its BIT STRING. */
    sigBytes: Uint8Array;
    /** The SubjectPublicKeyInfo TLV, ready for Web Crypto `importKey('spki')`. */
    spki: Uint8Array;
  };
  /** Per-certificate parse notes (v1, negative serial, missing SAN…). */
  warnings: string[];
}

// ── Expiry ───────────────────────────────────────────────────────────────────

export type ExpiryUrgency = 'ok' | 'warn30' | 'warn7' | 'alarm';

export interface ExpiryInfo {
  state: 'valid' | 'expired' | 'not-yet-valid';
  urgency: ExpiryUrgency;
  /** Whole days left, truncated toward zero. Negative once expired. */
  daysRemaining: number;
  /** True when `daysRemaining` dropped a partial day — never print it as exact. */
  approximate: boolean;
  /** Milliseconds until notAfter. Exact. */
  msRemaining: number;
  notBefore: Date;
  notAfter: Date;
  /** Ready-to-render phrase, honouring `approximate` ("expires in about 42 days"). */
  text: string;
}

// ── Chain ────────────────────────────────────────────────────────────────────

export type ChainRole = 'leaf' | 'intermediate' | 'root' | 'self-signed' | 'extra';

export type ChainDiagnosticCode =
  | 'wrong-order'
  | 'missing-intermediate'
  | 'root-included'
  | 'root-missing'
  | 'self-signed-leaf'
  | 'duplicate'
  | 'cross-signed'
  | 'expired'
  | 'not-yet-valid'
  | 'expiring-soon'
  | 'extra-certificate';

export type Severity = 'error' | 'warning' | 'info';

export interface ChainDiagnostic {
  code: ChainDiagnosticCode;
  severity: Severity;
  /** Index into the ORDERED chain, where the diagnostic is about one cert. */
  certIndex?: number;
  message: string;
}

/** A signature relationship: `subjectIndex` was signed by `issuerIndex`. */
export interface ChainEdge {
  subjectIndex: number;
  issuerIndex: number;
}

export interface ChainResult {
  ordered: ParsedCert[];
  roles: ChainRole[];
  edges: ChainEdge[];
  /** True when the ordered chain differs from the pasted order. */
  reordered: boolean;
  diagnostics: ChainDiagnostic[];
}

// ── Signature verdicts ───────────────────────────────────────────────────────

export type EdgeStatus = 'verified' | 'failed' | 'not-verified';

export interface EdgeVerdict extends ChainEdge {
  status: EdgeStatus;
  /** Reader-facing algorithm name, always populated — even when unverifiable. */
  algorithm: string;
  /** Why the check could not be made, for `not-verified`; why it failed, for `failed`. */
  reason?: string;
  /** The algorithm works but should not be trusted (SHA-1). */
  deprecated?: boolean;
  /** Extra context for a verdict that is `verified` but carries a caveat. */
  note?: string;
  /** True when subject and issuer are the same certificate (self-signature). */
  selfSigned?: boolean;
}

// ── Input handling ───────────────────────────────────────────────────────────

export type InputIssueKind =
  | 'nothing'
  | 'private-key'
  | 'public-key'
  | 'csr'
  | 'pkcs7'
  | 'crl'
  | 'other-block'
  | 'truncated'
  | 'bad-base64'
  | 'not-a-certificate'
  | 'headerless'
  | 'noise-ignored'
  | 'too-many';

export interface InputIssue {
  kind: InputIssueKind;
  severity: Severity;
  message: string;
}

// ── Hostname matching ────────────────────────────────────────────────────────

export interface HostnameResult {
  /** The hostname as checked (trimmed, lower-cased, brackets and dot stripped). */
  hostname: string;
  matched: boolean;
  /** The SAN (or commonName) that matched. */
  matchedSan?: string;
  /** True when there were no SANs at all and the commonName was used instead. */
  usedCn?: boolean;
  /** One sentence, always populated, explaining the verdict. */
  reason: string;
  /** How many names were considered. */
  namesChecked: number;
}

// ── The report ───────────────────────────────────────────────────────────────

export interface ReportCert extends ParsedCert {
  role: ChainRole;
  expiry: ExpiryInfo;
  fingerprints: { sha256: string; sha1: string };
}

export interface CertReport {
  /** True when at least one certificate parsed. */
  ok: boolean;
  certs: ReportCert[];
  edges: EdgeVerdict[];
  diagnostics: ChainDiagnostic[];
  inputIssues: InputIssue[];
  /** The one-line `role="status"` summary. */
  summary: string;
  stats: {
    /** Certificate blocks seen in the paste. */
    blocks: number;
    /** Certificates successfully parsed (after the parse cap). */
    parsed: number;
    /** Certificates in the ordered chain (after de-duplication). */
    certificates: number;
    errors: number;
    warnings: number;
    verified: number;
    failed: number;
    notVerified: number;
  };
  /** The instant every validity window was measured against. */
  now: Date;
}
