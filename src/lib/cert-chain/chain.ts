/**
 * chain.ts — ordering, chain diagnostics, expiry maths, RFC 6125 hostname
 * matching. Pure functions over already-parsed certificates; no Web Crypto here
 * (signatures live in verify.ts) and no clock reads anywhere — `now` is always a
 * parameter, so every caller and every test pins it explicitly.
 *
 * NOT in scope, permanently: trust-store validation. This module says "the chain
 * is internally consistent and here is what each signature check returned"; it
 * never says "trusted". Shipping a 200 KB root bundle that drifts out of date
 * would let the page print a confident "trusted" for a root that was distrusted
 * last month, which is precisely the failure this tool exists to catch.
 */
import { bytesEqual } from './der';
import type {
  ChainDiagnostic,
  ChainEdge,
  ChainResult,
  ChainRole,
  ExpiryInfo,
  ExpiryUrgency,
  HostnameResult,
  ParsedCert,
} from './types';

const DAY_MS = 86_400_000;
/** Diagnostics past this point are noise; the list is capped with a note. */
export const MAX_CHAIN_DIAGNOSTICS = 20;

// ── Expiry ───────────────────────────────────────────────────────────────────

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function urgencyFor(state: ExpiryInfo['state'], days: number): ExpiryUrgency {
  if (state !== 'valid') return 'alarm';
  if (days < 7) return 'warn7';
  if (days < 30) return 'warn30';
  return 'ok';
}

/**
 * Where a certificate sits relative to `now`.
 *
 * The day count is TRUNCATED toward zero and flagged `approximate` whenever a
 * partial day was dropped, and the renderer says "about" when it is. Printing
 * "expires in 42 days" for 41 days and 3 hours is the kind of small confident
 * wrongness this whole tool is a reaction to.
 */
export function expiryOf(cert: ParsedCert, now: Date | number): ExpiryInfo {
  const at = typeof now === 'number' ? now : now.getTime();
  const notBefore = cert.notBefore;
  const notAfter = cert.notAfter;
  const msRemaining = notAfter.getTime() - at;
  const msUntilValid = notBefore.getTime() - at;

  if (msUntilValid > 0) {
    const days = Math.trunc(msUntilValid / DAY_MS);
    const approximate = msUntilValid % DAY_MS !== 0;
    return {
      state: 'not-yet-valid',
      urgency: 'alarm',
      daysRemaining: Math.trunc(msRemaining / DAY_MS),
      approximate,
      msRemaining,
      notBefore,
      notAfter,
      text:
        days === 0
          ? `not valid until ${isoDay(notBefore)} — less than a day from now`
          : `not valid until ${isoDay(notBefore)} — ${approximate ? 'about ' : ''}${plural(days, 'day')} from now`,
    };
  }

  const daysRemaining = Math.trunc(msRemaining / DAY_MS);
  const approximate = msRemaining % DAY_MS !== 0;

  if (msRemaining <= 0) {
    const ago = -daysRemaining;
    return {
      state: 'expired',
      urgency: 'alarm',
      daysRemaining,
      approximate,
      msRemaining,
      notBefore,
      notAfter,
      text:
        ago === 0
          ? 'expired less than a day ago'
          : `expired ${approximate ? 'about ' : ''}${plural(ago, 'day')} ago`,
    };
  }

  return {
    state: 'valid',
    urgency: urgencyFor('valid', daysRemaining),
    daysRemaining,
    approximate,
    msRemaining,
    notBefore,
    notAfter,
    text:
      daysRemaining === 0
        ? 'expires in less than a day'
        : `expires in ${approximate ? 'about ' : ''}${plural(daysRemaining, 'day')}`,
  };
}

// ── Chain building ───────────────────────────────────────────────────────────

/** Both DN byte strings identical — the comparison RFC 5280 §7.1 actually wants. */
function sameSubjectAsIssuerOf(candidate: ParsedCert, child: ParsedCert): boolean {
  if (candidate.subject.text !== child.issuer.text) return false;
  // The key identifier is the tiebreaker that makes cross-signed and rolled-over
  // CAs resolve correctly: same DN, different key.
  if (child.aki?.keyId && candidate.ski && child.aki.keyId !== candidate.ski) return false;
  return true;
}

/** A cross-signed twin: same subject and same public key, different issuer. */
function isCrossSignedTwin(a: ParsedCert, b: ParsedCert): boolean {
  return (
    a.subject.text === b.subject.text &&
    bytesEqual(a.raw.spki, b.raw.spki) &&
    a.issuer.text !== b.issuer.text
  );
}

function roleOf(cert: ParsedCert): ChainRole {
  if (cert.selfIssued) return cert.isCa ? 'root' : 'self-signed';
  return cert.isCa ? 'intermediate' : 'leaf';
}

/**
 * Order a pasted pile of certificates into a chain, de-duplicate it, and report
 * everything structurally wrong with it.
 *
 * `now` is optional: omit it and no validity diagnostic is produced at all, which
 * is what the ordering tests want. Pass it and expiry joins the diagnostics.
 */
export function buildChain(certs: ParsedCert[], now?: Date | number): ChainResult {
  const diagnostics: ChainDiagnostic[] = [];
  const input = Array.isArray(certs) ? certs.filter(Boolean) : [];
  if (input.length === 0) {
    return { ordered: [], roles: [], edges: [], reordered: false, diagnostics };
  }

  // ── 1. De-duplicate byte-identical certificates ──
  const unique: ParsedCert[] = [];
  const dropped = new Map<string, number>();
  for (const cert of input) {
    const twin = unique.find((existing) => bytesEqual(existing.raw.der, cert.raw.der));
    if (twin) {
      const key = cert.commonName || cert.subject.text;
      dropped.set(key, (dropped.get(key) ?? 0) + 1);
      continue;
    }
    unique.push(cert);
  }
  for (const [name, count] of dropped) {
    diagnostics.push({
      code: 'duplicate',
      severity: 'info',
      message:
        `${name} appears ${count + 1} times in this paste — the copies are byte-identical, so ` +
        `${count === 1 ? '1 was' : `${count} were`} dropped.`,
    });
  }

  // ── 2. Cross-signed pairs, before anything mistakes them for duplicates ──
  for (let i = 0; i < unique.length; i += 1) {
    for (let j = i + 1; j < unique.length; j += 1) {
      if (isCrossSignedTwin(unique[i], unique[j])) {
        diagnostics.push({
          code: 'cross-signed',
          severity: 'info',
          message:
            `Two certificates share the subject "${unique[i].subject.text}" and the same public ` +
            `key but have different issuers. That is a cross-signed pair, not a duplicate — it is ` +
            `how a newer root is made to work on older clients.`,
        });
      }
    }
  }

  // ── 3. Walk the chain from its leaf ──
  const isIssuerOfSomethingElse = (cert: ParsedCert): boolean =>
    unique.some((other) => other !== cert && sameSubjectAsIssuerOf(cert, other));
  const candidates = unique.filter((cert) => !isIssuerOfSomethingElse(cert));
  const start =
    candidates.find((cert) => !cert.isCa) ??
    candidates[0] ??
    unique.find((cert) => !cert.isCa) ??
    unique[0];

  const walked: ParsedCert[] = [start];
  const used = new Set<ParsedCert>([start]);
  for (let guard = 0; guard < unique.length; guard += 1) {
    const tail = walked[walked.length - 1];
    if (tail.selfIssued) break;
    const issuer = unique.find(
      (cert) =>
        !used.has(cert) &&
        cert !== tail &&
        !isCrossSignedTwin(cert, tail) &&
        sameSubjectAsIssuerOf(cert, tail),
    );
    if (!issuer) break;
    walked.push(issuer);
    used.add(issuer);
  }

  const leftovers = unique.filter((cert) => !used.has(cert));
  const ordered = [...walked, ...leftovers];
  // Anything past the walk is a leftover: it is in the paste but nothing links it
  // into the chain. Badging it by its own shape ('leaf', 'root') contradicts the
  // extra-certificate finding directly below — two cards would read "Leaf".
  const roles = ordered.map((cert, index) =>
    index >= walked.length ? 'extra' : roleOf(cert),
  ) as ChainRole[];

  if (leftovers.length > 0) {
    diagnostics.push({
      code: 'extra-certificate',
      severity: 'info',
      message:
        leftovers.length === 1
          ? `One certificate in this paste ("${leftovers[0].subject.text}") is not part of the chain above — nothing in the paste links it in.`
          : `${leftovers.length} certificates in this paste are not part of the chain above — nothing in the paste links them in.`,
    });
  }

  // ── 4. Ordering verdict ──
  const pastedOrder = ordered.map((cert) => cert.inputIndex);
  const reordered = pastedOrder.some((index, i) => i > 0 && index < pastedOrder[i - 1]);
  if (reordered) {
    const firstPasted = input.reduce((best, cert) =>
      cert.inputIndex < best.inputIndex ? cert : best,
    );
    diagnostics.push({
      code: 'wrong-order',
      severity: 'warning',
      message:
        firstPasted.selfIssued && firstPasted.isCa
          ? 'The certificates are not in chain order — they were pasted root first. A server must send the leaf first, then each intermediate; the order below has been corrected for you.'
          : 'The certificates are not in chain order. A server must send the leaf first, then each intermediate; the order below has been corrected for you.',
    });
  }

  // ── 5. What is missing, what is redundant ──
  const tail = walked[walked.length - 1];
  if (tail.selfIssued && !tail.isCa) {
    diagnostics.push({
      code: 'self-signed-leaf',
      severity: 'warning',
      certIndex: ordered.indexOf(tail),
      message:
        'This certificate is self-signed: it issued itself, so nothing vouches for it. Browsers ' +
        'report NET::ERR_CERT_AUTHORITY_INVALID and curl reports "self-signed certificate" unless ' +
        'the certificate is installed as a trust anchor.',
    });
  } else if (tail.selfIssued && walked.length >= 2) {
    diagnostics.push({
      code: 'root-included',
      severity: 'info',
      certIndex: ordered.indexOf(tail),
      message:
        `The self-signed root "${tail.subject.text}" is included in this paste. That is harmless, ` +
        `but it is bytes on every handshake and it proves nothing — a client either has the root ` +
        `in its trust store already or it does not.`,
    });
  } else if (!tail.selfIssued) {
    if (tail.isCa) {
      diagnostics.push({
        code: 'root-missing',
        severity: 'info',
        message:
          `The root "${tail.issuer.text}" is not included. That is normal and correct — clients ` +
          `trust roots from their own store, so sending it only adds bytes to every handshake.`,
      });
    } else {
      diagnostics.push({
        code: 'missing-intermediate',
        severity: 'error',
        certIndex: ordered.indexOf(tail),
        message:
          `The chain is missing the intermediate that issued ${tail.commonName || tail.subject.text}: ` +
          `"${tail.issuer.text}". Browsers often paper over this by fetching or caching the ` +
          `intermediate; curl, openssl and most language runtimes will not, and fail with ` +
          `"unable to get local issuer certificate".`,
      });
    }
  }

  // ── 6. Validity, only when a clock was supplied ──
  if (now !== undefined) {
    ordered.forEach((cert, index) => {
      const info = expiryOf(cert, now);
      const name = cert.commonName || cert.subject.text;
      if (info.state === 'expired') {
        const ago = -info.daysRemaining;
        diagnostics.push({
          code: 'expired',
          severity: 'error',
          certIndex: index,
          message:
            `${name} expired on ${isoDay(cert.notAfter)}, ${info.approximate ? 'about ' : ''}` +
            `${plural(ago, 'day')} ago. Every client rejects it, so there is nothing to debug here ` +
            `beyond renewing it.`,
        });
      } else if (info.state === 'not-yet-valid') {
        diagnostics.push({
          code: 'not-yet-valid',
          severity: 'error',
          certIndex: index,
          message:
            `${name} is not valid until ${isoDay(cert.notBefore)}. Either it was issued ahead of a ` +
            `planned rotation, or the clock on the machine that is complaining is wrong.`,
        });
      } else if (info.urgency === 'warn7' || info.urgency === 'warn30') {
        diagnostics.push({
          code: 'expiring-soon',
          severity: 'warning',
          certIndex: index,
          message: `${name} ${info.text} (${isoDay(cert.notAfter)}). Renew it before it becomes an incident.`,
        });
      }
    });
  }

  // ── 7. Edges: real issuer links first, then self-signatures ──
  const edges: ChainEdge[] = [];
  for (let i = 0; i + 1 < ordered.length; i += 1) {
    // The cross-signed guard has to match the walk at step 3. Without it a
    // cross-signed twin (same subject, same key, different issuer) was recorded
    // as the issuer of its self-signed sibling, and because the keys are
    // identical by definition the check "verified" — so the page named the wrong
    // signer and suppressed the honest self-signature edge.
    if (
      !isCrossSignedTwin(ordered[i + 1], ordered[i]) &&
      sameSubjectAsIssuerOf(ordered[i + 1], ordered[i])
    ) {
      edges.push({ subjectIndex: i, issuerIndex: i + 1 });
    }
  }
  ordered.forEach((cert, index) => {
    if (cert.selfIssued) edges.push({ subjectIndex: index, issuerIndex: index });
  });

  return {
    ordered,
    roles,
    edges,
    reordered,
    diagnostics: capDiagnostics(diagnostics),
  };
}

/** Keep the list bounded; a 500-certificate bundle must not render 500 rows. */
function capDiagnostics(all: ChainDiagnostic[]): ChainDiagnostic[] {
  if (all.length <= MAX_CHAIN_DIAGNOSTICS) return all;
  const kept = all.slice(0, MAX_CHAIN_DIAGNOSTICS - 1);
  kept.push({
    code: 'extra-certificate',
    severity: 'info',
    message: `…and ${all.length - kept.length} more findings, not shown.`,
  });
  return kept;
}

// ── Hostname matching (RFC 6125) ─────────────────────────────────────────────

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function parseIpv4(text: string): number[] | null {
  const match = IPV4_RE.exec(text);
  if (!match) return null;
  const parts = match.slice(1);
  // A zero-padded octet is octal to inet_aton and glibc: 203.0.113.010 is the
  // host 203.0.113.8, not .10. Accepting it made the tool answer "listed as an IP
  // address in the certificate" about an address the OS would never dial. Same
  // policy as `src/lib/ip-core.ts` (repo-wide since 099f8c2) — refuse, never guess.
  if (parts.some((part) => part.length > 1 && part.startsWith('0'))) return null;
  const octets = parts.map(Number);
  return octets.every((o) => o >= 0 && o <= 255) ? octets : null;
}

/** Parse any legal IPv6 text form into its eight 16-bit groups, or `null`. */
function parseIpv6(text: string): number[] | null {
  if (!text.includes(':')) return null;
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const toGroups = (part: string): number[] | null => {
    if (part === '') return [];
    const out: number[] = [];
    for (const piece of part.split(':')) {
      if (piece === '') return null;
      // A trailing IPv4 form (::ffff:1.2.3.4) contributes two groups.
      const v4 = parseIpv4(piece);
      if (v4) {
        out.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(piece)) return null;
      out.push(parseInt(piece, 16));
    }
    return out;
  };
  const head = toGroups(halves[0]);
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];
  if (head === null || tail === null) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const fill = 8 - head.length - tail.length;
  if (fill < 1) return null;
  return [...head, ...Array(fill).fill(0), ...tail];
}

function sameIp(a: string, b: string): boolean {
  const a4 = parseIpv4(a);
  const b4 = parseIpv4(b);
  if (a4 && b4) return a4.every((octet, i) => octet === b4[i]);
  const a6 = parseIpv6(a);
  const b6 = parseIpv6(b);
  if (a6 && b6) return a6.every((group, i) => group === b6[i]);
  return false;
}

/** Strip the trailing root dot; DNS treats `a.example.com.` as `a.example.com`. */
function normalizeName(name: string): string {
  const lower = name.trim().toLowerCase();
  return lower.endsWith('.') ? lower.slice(0, -1) : lower;
}

/**
 * Does `hostname` match this certificate?
 *
 * RFC 6125 §6.4.3, and the three rules everyone gets wrong:
 *   - a wildcard replaces EXACTLY ONE label — `*.example.com` covers
 *     `a.example.com` but not `a.b.example.com` and not bare `example.com`;
 *   - a wildcard is only legal as the ENTIRE leftmost label — `w*.example.com`
 *     is not honoured;
 *   - a wildcard never matches an IP address, and an IP SAN matches only exactly.
 *
 * commonName is used ONLY when there is no subjectAltName at all, and saying so
 * is part of the answer: browsers stopped reading commonName in 2017.
 *
 * Input that is not a host name at all is REFUSED by name (`unusable: true`)
 * rather than matched. A URL or a `host:port` pair used to go straight into the
 * RFC 6125 matcher, which answered confidently and wrongly in both directions:
 * `https://www.shop.example.com` "matched" the wildcard `*.shop.example.com`
 * (the residual `https://www` holds no dot, so it looked like exactly one label)
 * and `www.shop.example.com:443` matched nothing at all — telling an SRE their
 * SAN list was wrong when it was fine. The value is never silently rewritten.
 */
export function matchHostname(cert: ParsedCert, hostname: string): HostnameResult {
  const raw = typeof hostname === 'string' ? hostname.trim() : '';
  const unbracketed = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw;
  const host = normalizeName(unbracketed);

  if (host.length === 0) {
    return {
      hostname: host,
      matched: false,
      unusable: true,
      reason: 'Enter a hostname to check it against this certificate’s names.',
      namesChecked: 0,
    };
  }

  const unusable = (reason: string): HostnameResult => ({
    hostname: host,
    matched: false,
    unusable: true,
    reason,
    namesChecked: 0,
  });

  if (/\s/.test(host)) {
    return unusable(
      'A hostname cannot contain a space. Enter exactly one host name — no scheme, no port, ' +
        'nothing else on the line.',
    );
  }
  if (host.includes('/')) {
    return unusable(
      'That looks like a URL, not a hostname. Enter just the host — no scheme, no port and no ' +
        'path (for example www.example.com).',
    );
  }
  if (host.includes('@')) {
    return unusable(
      'That looks like a URL with credentials, or an email address — not a hostname. Enter just ' +
        'the host part, the text after the "@".',
    );
  }
  if (host.includes(':') && parseIpv6(host) === null) {
    return unusable(
      'That looks like a host:port pair. Enter just the hostname — a certificate lists names, ' +
        'never ports, so the port plays no part in the match. (A bare or bracketed IPv6 literal ' +
        'is fine here.)',
    );
  }
  // All-digit labels can only ever be an IPv4 literal, so a failed parse is a
  // malformed address rather than a name that happens to match nothing.
  if (/^\d[\d.]*$/.test(host) && parseIpv4(host) === null) {
    return unusable(
      `${host} is not a valid IPv4 address. Each octet must be 0–255 with no leading zeros — ` +
        'glibc reads a leading zero as octal, so 203.0.113.010 is really the host 203.0.113.8.',
    );
  }

  const dnsSans = cert.sans.filter((san) => san.kind === 'dns');
  const ipSans = cert.sans.filter((san) => san.kind === 'ip');
  const allNames = [...dnsSans, ...ipSans].map((san) => san.value);
  const listing = allNames.length > 0 ? ` The certificate lists: ${allNames.join(', ')}.` : '';
  const hostIsIp = parseIpv4(host) !== null || parseIpv6(host) !== null;

  if (hostIsIp) {
    const hit = ipSans.find((san) => sameIp(san.value, host));
    if (hit) {
      return {
        hostname: host,
        matched: true,
        matchedSan: hit.value,
        reason: `${host} is listed as an IP address in the certificate.`,
        namesChecked: allNames.length,
      };
    }
    return {
      hostname: host,
      matched: false,
      reason:
        `No SAN matches ${host}. An IP address must appear as an iPAddress SAN and must match ` +
        `exactly — a wildcard never covers an IP.${listing}`,
      namesChecked: allNames.length,
    };
  }

  const notes: string[] = [];
  for (const san of dnsSans) {
    const pattern = normalizeName(san.value);
    if (!pattern.includes('*')) {
      if (pattern === host) {
        return {
          hostname: host,
          matched: true,
          matchedSan: san.value,
          reason: `${host} is listed as a DNS name in the certificate.`,
          namesChecked: allNames.length,
        };
      }
      continue;
    }
    if (!pattern.startsWith('*.') || pattern.slice(2).includes('*')) {
      notes.push(
        `${san.value} uses a partial-label wildcard, which RFC 6125 says clients must not honour.`,
      );
      continue;
    }
    const suffix = pattern.slice(1); // ".example.com"
    if (suffix.split('.').filter(Boolean).length < 2) {
      notes.push(
        `${san.value} is too broad to match anything — a wildcard may not sit in the top two labels.`,
      );
      continue;
    }
    if (!host.endsWith(suffix)) continue;
    const prefix = host.slice(0, host.length - suffix.length);
    if (prefix.length === 0) {
      notes.push(
        `${san.value} replaces exactly one label, so it does not cover the bare ${suffix.slice(1)}.`,
      );
      continue;
    }
    if (!prefix.includes('.')) {
      return {
        hostname: host,
        matched: true,
        matchedSan: san.value,
        reason: `${host} is covered by the wildcard ${san.value} — a wildcard replaces exactly one label.`,
        namesChecked: allNames.length,
      };
    }
    const covered = prefix.split('.').slice(-1)[0] + suffix;
    notes.push(
      `${san.value} replaces exactly one label, so it covers ${covered} but not ${host}.`,
    );
  }

  if (cert.sans.length === 0) {
    const cn = normalizeName(cert.commonName);
    const cnMatches =
      cn.length > 0 &&
      (cn === host ||
        (cn.startsWith('*.') &&
          cn.slice(2).split('.').filter(Boolean).length >= 2 &&
          host.endsWith(cn.slice(1)) &&
          !host.slice(0, host.length - cn.length + 1).includes('.') &&
          host.length > cn.length - 1));
    if (cnMatches) {
      return {
        hostname: host,
        matched: true,
        matchedSan: cert.commonName,
        usedCn: true,
        reason:
          `This certificate has no subjectAltName, so the check fell back to its commonName ` +
          `"${cert.commonName}". Chrome, Firefox and Safari stopped reading commonName in 2017 — ` +
          `they will reject this certificate no matter what host you serve it on.`,
        namesChecked: 1,
      };
    }
    return {
      hostname: host,
      matched: false,
      reason:
        `This certificate has no subjectAltName, and its commonName "${cert.commonName}" does not ` +
        `match ${host} either. Browsers have ignored commonName since 2017, so a certificate ` +
        `without a SAN cannot match any hostname at all.`,
      namesChecked: 1,
    };
  }

  return {
    hostname: host,
    matched: false,
    reason: `No SAN matches ${host}.${notes.length > 0 ? ` ${notes.join(' ')}` : ''}${listing}`,
    namesChecked: allNames.length,
  };
}
