/**
 * Kubernetes Resource Calculator — engine. Parses a Pod's CPU / memory requests
 * and limits the same way the Kubernetes API does, then renders a per-pod
 * breakdown plus totals multiplied across the replica count.
 *
 * CPU is normalised to MILLICORES: a trailing "m" means milli ("500m" → 500),
 * a bare number is whole cores ("1" → 1000, "2.5" → 2500).
 * MEMORY is normalised to BYTES: binary suffixes Ki/Mi/Gi/Ti/Pi use 1024^n,
 * decimal suffixes k/K/M/G/T/P use 1000^n, and a plain integer is bytes.
 *
 * Pure + browser-safe; never throws on user input — an unparseable field yields
 * { valid:false, error } that names the offending field, and a missing limit is
 * reported as a non-fatal warning rather than an error.
 */
import { base64UrlEncode, base64UrlDecode } from '../codec';
import type { K8sInput, K8sResult, K8sRow, K8sShareState } from './types';

const ERR_EMPTY =
  'Enter at least one resource value, e.g. cpuRequest 500m and memRequest 256Mi.';

function bad(error: string): K8sResult {
  return { valid: false, error, rows: [], warnings: [] };
}

/** Binary (1024^n) memory suffixes, longest-match-first when scanning. */
const BINARY: Record<string, bigint> = {
  Ki: 1024n,
  Mi: 1024n ** 2n,
  Gi: 1024n ** 3n,
  Ti: 1024n ** 4n,
  Pi: 1024n ** 5n,
};

/** Decimal (1000^n) memory suffixes. */
const DECIMAL: Record<string, bigint> = {
  k: 1000n,
  K: 1000n,
  M: 1000n ** 2n,
  G: 1000n ** 3n,
  T: 1000n ** 4n,
  P: 1000n ** 5n,
};

/**
 * Parse a CPU quantity to millicores. Returns null when the field cannot be
 * read as a number. A trailing "m" is milli; a bare value is whole cores.
 */
function parseCpu(raw: string): number | null {
  const s = raw.trim();
  if (s.length === 0) return null;
  if (/m$/.test(s)) {
    const n = Number(s.slice(0, -1));
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n);
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1000);
}

/**
 * Parse a memory quantity to bytes. Binary suffixes (Ki/Mi/Gi/Ti/Pi) are
 * 1024^n, decimal suffixes (k/K/M/G/T/P) are 1000^n, and a bare integer is
 * bytes. Returns null when the field cannot be read.
 */
function parseMem(raw: string): bigint | null {
  const s = raw.trim();
  if (s.length === 0) return null;

  // Binary suffix, e.g. "256Mi".
  const bin = /^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|Pi)$/.exec(s);
  if (bin) return scale(bin[1], BINARY[bin[2]]);

  // Decimal suffix, e.g. "1G" or "500k".
  const dec = /^(\d+(?:\.\d+)?)([kKMGTP])$/.exec(s);
  if (dec) return scale(dec[1], DECIMAL[dec[2]]);

  // Plain integer = bytes.
  if (/^\d+$/.test(s)) return BigInt(s);

  return null;
}

/** Multiply a possibly-fractional magnitude by a bigint unit, rounding to bytes. */
function scale(magnitude: string, unit: bigint): bigint {
  const n = Number(magnitude);
  if (!Number.isFinite(n) || n < 0) return -1n; // sentinel; callers treat <0 as parsed
  if (/^\d+$/.test(magnitude)) return BigInt(magnitude) * unit;
  return BigInt(Math.round(n * Number(unit)));
}

/** Parse the replica count: a positive integer, defaulting to 1 when blank. */
function parseReplicas(raw: string | undefined): number | null {
  const s = (raw ?? '').trim();
  if (s.length === 0) return 1;
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/** Format millicores as a "1000m" / "0.5 cores" pair, trimming trailing zeros. */
function cpuPair(milli: number): string {
  const cores = milli / 1000;
  const coresStr = trimNum(cores);
  return `${milli}m (${coresStr} core${cores === 1 ? '' : 's'})`;
}

/** Format bytes as a "256Mi / 0.25Gi / 268435456 bytes" triple. */
function memTriple(bytes: bigint): string {
  const mi = Number(bytes) / 1048576;
  const gi = Number(bytes) / 1073741824;
  return `${trimNum(mi)}Mi (${trimNum(gi)}Gi, ${bytes.toString()} bytes)`;
}

/** Drop trailing zeros from a fixed-precision number for tidy display. */
function trimNum(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return parseFloat(n.toFixed(3)).toString();
}

export function calculate(input: K8sInput): K8sResult {
  const cpuRequestRaw = (input.cpuRequest ?? '').trim();
  const cpuLimitRaw = (input.cpuLimit ?? '').trim();
  const memRequestRaw = (input.memRequest ?? '').trim();
  const memLimitRaw = (input.memLimit ?? '').trim();

  // At least one resource field must be present (replicas alone is not enough).
  if (
    cpuRequestRaw.length === 0 &&
    cpuLimitRaw.length === 0 &&
    memRequestRaw.length === 0 &&
    memLimitRaw.length === 0
  ) {
    return bad(ERR_EMPTY);
  }

  // ── Parse every supplied field, failing fast with the field name ──────────
  let cpuRequest: number | null = null;
  let cpuLimit: number | null = null;
  let memRequest: bigint | null = null;
  let memLimit: bigint | null = null;

  if (cpuRequestRaw.length > 0) {
    cpuRequest = parseCpu(cpuRequestRaw);
    if (cpuRequest === null) return bad(`cpuRequest "${cpuRequestRaw}" is not a valid CPU quantity.`);
  }
  if (cpuLimitRaw.length > 0) {
    cpuLimit = parseCpu(cpuLimitRaw);
    if (cpuLimit === null) return bad(`cpuLimit "${cpuLimitRaw}" is not a valid CPU quantity.`);
  }
  if (memRequestRaw.length > 0) {
    memRequest = parseMem(memRequestRaw);
    if (memRequest === null || memRequest < 0n)
      return bad(`memRequest "${memRequestRaw}" is not a valid memory quantity.`);
  }
  if (memLimitRaw.length > 0) {
    memLimit = parseMem(memLimitRaw);
    if (memLimit === null || memLimit < 0n)
      return bad(`memLimit "${memLimitRaw}" is not a valid memory quantity.`);
  }

  const replicas = parseReplicas(input.replicas);
  if (replicas === null) return bad(`replicas "${(input.replicas ?? '').trim()}" must be a positive integer.`);

  // ── Per-pod rows (skip blank fields) ──────────────────────────────────────
  const rows: K8sRow[] = [];
  const warnings: string[] = [];

  if (cpuRequest !== null) rows.push({ label: 'CPU request (per pod)', value: cpuPair(cpuRequest), mono: true });
  if (cpuLimit !== null) rows.push({ label: 'CPU limit (per pod)', value: cpuPair(cpuLimit), mono: true });
  if (memRequest !== null) rows.push({ label: 'Memory request (per pod)', value: memTriple(memRequest), mono: true });
  if (memLimit !== null) rows.push({ label: 'Memory limit (per pod)', value: memTriple(memLimit), mono: true });

  rows.push({ label: 'Replicas', value: replicas.toString(), mono: true });

  // ── Totals across replicas ────────────────────────────────────────────────
  if (cpuRequest !== null) {
    const totalMilli = cpuRequest * replicas;
    rows.push({ label: 'Total CPU request', value: `${trimNum(totalMilli / 1000)} cores (${totalMilli}m)`, mono: true });
  }
  if (cpuLimit !== null) {
    const totalMilli = cpuLimit * replicas;
    rows.push({ label: 'Total CPU limit', value: `${trimNum(totalMilli / 1000)} cores (${totalMilli}m)`, mono: true });
  }
  if (memRequest !== null) {
    const total = memRequest * BigInt(replicas);
    rows.push({ label: 'Total memory request', value: memTriple(total), mono: true });
  }
  if (memLimit !== null) {
    const total = memLimit * BigInt(replicas);
    rows.push({ label: 'Total memory limit', value: memTriple(total), mono: true });
  }

  // ── Warnings (advisory; never fatal) ──────────────────────────────────────
  if (cpuRequest !== null && cpuLimit !== null && cpuLimit < cpuRequest) {
    warnings.push('CPU limit is below the CPU request — the pod may be throttled or rejected.');
  }
  if (memRequest !== null && memLimit !== null && memLimit < memRequest) {
    warnings.push('Memory limit is below the memory request — Kubernetes will reject this pod.');
  }
  if (cpuRequest !== null && cpuLimit === null) {
    warnings.push('No CPU limit set — the pod can burst to use all available node CPU.');
  }
  if (memRequest !== null && memLimit === null) {
    warnings.push('No memory limit set — the pod can be OOM-killed under node memory pressure.');
  }

  return { valid: true, rows, warnings };
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Shareable-URL state (base64url in the location hash).
 * ────────────────────────────────────────────────────────────────────────── */

const SHARE_ROW_FIELDS = ['cpuRequest', 'cpuLimit', 'memRequest', 'memLimit', 'replicas'] as const;

/**
 * Validate/sanitize one parsed row from untrusted JSON. Mirrors this
 * codebase's house style for defensive parsing (see tool-prefs/prefs.ts's
 * parseToolPrefs): drop malformed rows rather than throwing or letting
 * garbage through. A row survives only when it is a plain object, every
 * present field is a string, and at least one field is non-blank — an
 * all-blank row carries no information and is dropped just like a
 * type-mismatched one.
 */
function sanitizeShareRow(raw: unknown): K8sInput | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const row: K8sInput = {};
  let hasContent = false;
  for (const field of SHARE_ROW_FIELDS) {
    const v = o[field];
    if (v === undefined) continue;
    if (typeof v !== 'string') return null; // wrong field type -> drop the whole row
    row[field] = v;
    if (v.trim().length > 0) hasContent = true;
  }
  return hasContent ? row : null;
}

/**
 * Encode the current resource row(s) into a URL hash fragment, e.g.
 * "#s=eyJyb3dzIjpbey4uLn1dfQ". `rows` mirrors the array-of-rows share-link
 * convention used elsewhere in this codebase; this playground currently
 * calls it with exactly one row (its single Pod-spec form).
 */
export function encodeState(rows: K8sInput[]): string {
  const payload: K8sShareState = { rows };
  return '#s=' + base64UrlEncode(JSON.stringify(payload));
}

/**
 * Decode the current `location.hash` into a K8sShareState, or null when
 * absent, malformed, or containing no valid rows. SSR-safe: returns null
 * when `window` is undefined. Never throws.
 */
export function decodeState(): K8sShareState | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash ?? '';
  const m = hash.match(/[#&]s=([^&]+)/);
  if (!m) return null;
  try {
    const json = base64UrlDecode(m[1]);
    const parsed = JSON.parse(json) as Partial<K8sShareState>;
    if (!Array.isArray(parsed.rows)) return null;
    const rows = parsed.rows
      .map(sanitizeShareRow)
      .filter((r): r is K8sInput => r !== null);
    return rows.length > 0 ? { rows } : null;
  } catch {
    return null;
  }
}
