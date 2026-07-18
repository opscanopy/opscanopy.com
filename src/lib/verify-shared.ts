/**
 * Verify-the-AI — shared result contract for the four tool-specific verify
 * engines (subnet-calculator, timestamp-converter, cron-tester, base64-codec).
 *
 * Each tool's `verifyClaims()` takes the tool's own input plus a set of
 * claimed answers (what an AI assistant said) and recomputes the real
 * answer, never parsing free-text — claims arrive as structured fields, one
 * per claimable fact. This module only carries the shape; per-tool
 * normalization and mismatch diagnostics live in each tool's verify.ts.
 */

export type ClaimVerdict = 'match' | 'mismatch' | 'unreadable';

export interface ClaimCheck {
  /** Stable field key, e.g. "network" or "netmask". */
  field: string;
  /** Human label for the verdict table, e.g. "Network address". */
  label: string;
  /** The claim as typed by the user (trimmed, otherwise unmodified). */
  claimed: string;
  /** The actual, freshly computed value, formatted for display. */
  actual: string;
  verdict: ClaimVerdict;
  /** Present on mismatch/unreadable when a targeted diagnosis is available. */
  note?: string;
}

export interface VerifyResult {
  /** False only when the tool's own input (not a claim) failed to parse. */
  valid: boolean;
  /** Set when `valid` is false — why the base input couldn't be checked. */
  error?: string;
  /** One-line summary for the live region, e.g. "1 mismatch found". */
  summary: string;
  checks: ClaimCheck[];
  /** Count of `verdict === 'mismatch'` entries (unreadable is not a mismatch). */
  mismatchCount: number;
}

/** Build the VerifyResult for a base-input parse failure — no checks run. */
export function invalidBase(error: string): VerifyResult {
  return { valid: false, error, summary: '', checks: [], mismatchCount: 0 };
}

/** Compose the summary line from a finished checks array. */
export function summarize(checks: ClaimCheck[]): string {
  if (checks.length === 0) return 'No claims entered yet.';
  const mismatches = checks.filter((c) => c.verdict === 'mismatch').length;
  const unreadable = checks.filter((c) => c.verdict === 'unreadable').length;
  const matches = checks.length - mismatches - unreadable;
  if (mismatches > 0) {
    return `${mismatches} mismatch${mismatches === 1 ? '' : 'es'} found`;
  }
  if (unreadable > 0 && matches > 0) {
    return `${matches} of ${checks.length} match, ${unreadable} unreadable`;
  }
  if (unreadable > 0) {
    return `${unreadable} claim${unreadable === 1 ? '' : 's'} could not be read`;
  }
  return checks.length === 1 ? 'The claim matches.' : `All ${checks.length} claims match.`;
}

/** Strip thousands separators (commas, spaces, thin/narrow spaces) from a numeric claim. */
export function stripDigitSeparators(s: string): string {
  return s.replace(/[,\s  ]/g, '');
}
