/**
 * pem.ts — get DER out of whatever the user pasted, and say what was ignored.
 *
 * The input this tool actually receives is rarely a clean PEM file. It is the
 * scrollback of `openssl s_client -showcerts`, or a fullchain.pem with a private
 * key accidentally on top, or one block that a chat client rewrapped. So the
 * extraction is regex-driven over BEGIN/END markers and everything outside them
 * is discarded on purpose — which is what makes an s_client transcript paste
 * as-is.
 *
 * The PEM → DER seam is cribbed from `src/lib/jwt-decoder/keys.ts` (`pemToDer`
 * / `blockBodyToDer`), whose block scanner is module-private there — copied
 * rather than exported, per the plan, so neither tool's grammar drifts because
 * the other one needed a change.
 *
 * Nothing here throws.
 */
import type { InputIssue, InputIssueKind } from './types';

/** One PEM block, complete or not. */
export interface PemBlock {
  /** The label between the dashes, e.g. `CERTIFICATE`. */
  label: string;
  /** The base64 body, whitespace included. */
  body: string;
  /** False when no matching END line was found. */
  complete: boolean;
  /** Character offset of the BEGIN line, for ordering. */
  at: number;
}

export type BlockKind =
  | 'certificate'
  | 'private-key'
  | 'public-key'
  | 'csr'
  | 'pkcs7'
  | 'crl'
  | 'other';

/**
 * A PEM label maps to exactly one kind. Deliberately generous: `TRUSTED
 * CERTIFICATE` (OpenSSL) and `X509 CERTIFICATE` (ancient) are certificates;
 * every `… PRIVATE KEY` spelling is a private key, including the OpenSSH and
 * PKCS#1 variants, because they must all be refused identically.
 */
export function classifyLabel(label: string): BlockKind {
  const upper = label.trim().toUpperCase();
  if (upper.includes('PRIVATE KEY')) return 'private-key';
  if (upper === 'CERTIFICATE' || upper === 'X509 CERTIFICATE' || upper === 'TRUSTED CERTIFICATE') {
    return 'certificate';
  }
  if (upper.endsWith('PUBLIC KEY')) return 'public-key';
  if (upper.includes('CERTIFICATE REQUEST') || upper === 'NEW CERTIFICATE REQUEST') return 'csr';
  if (upper === 'PKCS7' || upper === 'PKCS #7 SIGNED DATA') return 'pkcs7';
  if (upper.includes('CRL')) return 'crl';
  return 'other';
}

/**
 * Every PEM block in a paste, in order of appearance. Tolerant of CRLF, of
 * leading indentation, and of a BEGIN with no END (reported as incomplete so the
 * caller can say "truncated" rather than "not a certificate").
 */
export function pemBlocks(raw: string): PemBlock[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  const text = raw.replace(/\r\n?/g, '\n');
  const out: PemBlock[] = [];
  const beginRe = /^[ \t]*-{5}BEGIN ([A-Za-z0-9 #]+)-{5}[ \t]*$/gm;
  let match: RegExpExecArray | null;
  while ((match = beginRe.exec(text)) !== null) {
    const label = match[1].trim();
    const bodyStart = match.index + match[0].length;
    // Only the matching END label closes the block, so a PRIVATE KEY END line
    // cannot silently terminate a CERTIFICATE block.
    const endRe = new RegExp(
      `^[ \\t]*-{5}END ${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-{5}[ \\t]*$`,
      'm',
    );
    endRe.lastIndex = 0;
    const rest = text.slice(bodyStart);
    const endMatch = endRe.exec(rest);
    if (endMatch) {
      out.push({
        label,
        body: rest.slice(0, endMatch.index),
        complete: true,
        at: match.index,
      });
      beginRe.lastIndex = bodyStart + endMatch.index + endMatch[0].length;
    } else {
      out.push({ label, body: rest, complete: false, at: match.index });
      break;
    }
  }
  return out;
}

/** Decode one PEM body (base64, whitespace-tolerant) to DER, or `null`. */
export function blockToDer(body: string): Uint8Array | null {
  const compact = body.replace(/\s+/g, '');
  if (compact.length === 0) return null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) return null;
  try {
    const binary = atob(compact);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function issue(kind: InputIssueKind, severity: InputIssue['severity'], message: string): InputIssue {
  return { kind, severity, message };
}

/**
 * The exact wording for each non-certificate block. These are product copy, not
 * debug strings — the private-key line is the whole privacy argument of the tool
 * and the PKCS#7 line is the only place a user is handed the command that fixes
 * their input. `engine.test.ts` pins all of them.
 */
const BLOCK_ISSUES: Record<Exclude<BlockKind, 'certificate'>, InputIssue> = {
  'private-key': issue(
    'private-key',
    'warning',
    'A PRIVATE KEY block was found and ignored — it was never parsed, and it never left this page, ' +
      'because this decoder is a static page with no server behind it. Most certificate decoders ' +
      'upload what you paste; rotate the key anyway if you pasted it anywhere else.',
  ),
  'public-key': issue(
    'public-key',
    'info',
    'A PUBLIC KEY block was ignored. A bare public key has no subject, no validity and no issuer — ' +
      'there is nothing to decode beyond the key itself.',
  ),
  csr: issue(
    'csr',
    'warning',
    'This is a certificate signing request (PKCS#10), not a certificate: it has no issuer, no ' +
      'validity window and no CA signature to check. Read it with "openssl req -in request.csr ' +
      '-noout -text".',
  ),
  pkcs7: issue(
    'pkcs7',
    'warning',
    'This is a PKCS#7 / P7B bundle, which wraps certificates in another layer this tool does not ' +
      'open. Convert it first: openssl pkcs7 -print_certs -in bundle.p7b -out chain.pem',
  ),
  crl: issue(
    'crl',
    'info',
    'A certificate revocation list was ignored. This tool decodes certificates; a CRL is a ' +
      'different structure and revocation checking needs the network.',
  ),
  other: issue(
    'other-block',
    'info',
    'A PEM block that is not a certificate was ignored.',
  ),
};

/** A BEGIN marker anywhere in the text, line-anchored or not. */
const MARKER_ANYWHERE_RE = /-{5}BEGIN [A-Za-z0-9 #]*CERTIFICATE-{5}/i;

export interface ExtractResult {
  /** DER bytes of every certificate block that decoded, in paste order. */
  ders: Uint8Array[];
  issues: InputIssue[];
  /** How many CERTIFICATE blocks were seen, decodable or not. */
  certBlocks: number;
  /** How many PEM blocks of any kind were seen. */
  totalBlocks: number;
}

/**
 * Pull every certificate out of a paste.
 *
 * Order of attempts:
 *   1. complete `CERTIFICATE` blocks (the normal case, s_client noise included);
 *   2. non-certificate blocks → one issue each, deduplicated by kind;
 *   3. an incomplete block → `truncated`;
 *   4. no blocks at all → headerless base64 fallback, so a bare DER body pasted
 *      without its markers still gets decoded rather than rejected.
 */
export function extractCertificateDers(raw: string): ExtractResult {
  const ders: Uint8Array[] = [];
  const issues: InputIssue[] = [];
  const seenKinds = new Set<InputIssueKind>();

  const push = (candidate: InputIssue): void => {
    if (seenKinds.has(candidate.kind)) return;
    seenKinds.add(candidate.kind);
    issues.push(candidate);
  };

  const text = typeof raw === 'string' ? raw : '';
  const blocks = pemBlocks(text);
  let certBlocks = 0;

  for (const block of blocks) {
    const kind = classifyLabel(block.label);
    if (kind !== 'certificate') {
      push(BLOCK_ISSUES[kind]);
      continue;
    }
    certBlocks += 1;
    if (!block.complete) {
      push(
        issue(
          'truncated',
          'error',
          'A "-----BEGIN CERTIFICATE-----" line has no matching "-----END CERTIFICATE-----" line — ' +
            'the paste looks truncated.',
        ),
      );
      continue;
    }
    const der = blockToDer(block.body);
    if (!der || der.length === 0) {
      push(
        issue(
          'bad-base64',
          'error',
          'A CERTIFICATE block is not valid base64 — a character was mangled in transit. Re-copy ' +
            'it, and check that no chat client rewrapped the lines.',
        ),
      );
      continue;
    }
    ders.push(der);
  }

  if (blocks.length === 0) {
    // Headerless fallback: someone pasted the base64 body without its markers.
    const compact = text.replace(/\s+/g, '');
    if (compact.length >= 64 && /^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
      const der = blockToDer(compact);
      if (der && der.length > 0) {
        ders.push(der);
        certBlocks += 1;
        push(
          issue(
            'headerless',
            'info',
            'The input had no "-----BEGIN CERTIFICATE-----" markers, so it was read as raw base64 ' +
              'DER. Add the markers if you plan to feed this to another tool.',
          ),
        );
      }
    }
    if (ders.length === 0 && MARKER_ANYWHERE_RE.test(text)) {
      // The markers ARE there — they just are not on lines of their own, which is
      // what a JSON field or an HTML round-trip does to a PEM file. Telling this
      // user to "paste a BEGIN CERTIFICATE block" is advice they have followed.
      push(
        issue(
          'markers-inline',
          'error',
          'This paste contains a "-----BEGIN CERTIFICATE-----" marker, but not on a line of its ' +
            'own — the line breaks were lost somewhere (a JSON field or a web page will do that). ' +
            'Each BEGIN and END marker has to sit alone on its line. Put the newlines back and ' +
            'paste again.',
        ),
      );
    }
  } else if (hasNoiseOutsideBlocks(text, blocks)) {
    push(
      issue(
        'noise-ignored',
        'info',
        'Text outside the BEGIN/END markers was ignored, so an "openssl s_client -showcerts" ' +
          'transcript can be pasted as-is.',
      ),
    );
  }

  return { ders, issues, certBlocks, totalBlocks: blocks.length };
}

/**
 * True when the paste carries meaningful text outside its PEM blocks. Whitespace
 * does not count, and neither does a lone `---` separator line — s_client emits
 * those between every block and calling them out would fire on almost every real
 * paste.
 */
function hasNoiseOutsideBlocks(raw: string, blocks: PemBlock[]): boolean {
  let stripped = raw.replace(/\r\n?/g, '\n');
  for (const block of blocks) {
    stripped = stripped.replace(`-----BEGIN ${block.label}-----`, '\n');
    stripped = stripped.replace(block.body, '\n');
    stripped = stripped.replace(`-----END ${block.label}-----`, '\n');
  }
  return stripped.replace(/^[ \t]*-+[ \t]*$/gm, '').trim().length > 0;
}
