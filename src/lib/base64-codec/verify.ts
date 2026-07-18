/**
 * Base64 Encoder / Decoder — Verify-the-AI engine. Recomputes the real
 * encode/decode result and exact-compares it against a claimed output,
 * with targeted notes for the near-miss shapes an AI "predicting bytes"
 * commonly produces: line-wrapped whitespace, the wrong alphabet
 * (standard vs URL-safe), padding-only drift, or a genuine divergence.
 * Never throws.
 */
import { convert } from './engine';
import type { Base64Mode } from './types';
import { invalidBase, summarize, type ClaimCheck, type VerifyResult } from '../verify-shared';

export interface Base64Claims {
  output?: string;
}

function stripWs(s: string): string {
  return s.replace(/\s+/g, '');
}

function toStdAlphabet(s: string): string {
  return s.replace(/-/g, '+').replace(/_/g, '/');
}

function stripPadding(s: string): string {
  return s.replace(/=+$/, '');
}

function firstDivergenceIndex(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return i;
  }
  return len;
}

/**
 * Compare a claimed output string against the real one. Exported (beyond
 * `verifyClaims`) so the diagnosis logic is directly testable without
 * needing an encode/decode input engineered to hit each edge shape.
 *
 * `isBase64Output` is false for decode mode, where `actual` is plain decoded
 * TEXT, not base64 — the alphabet-swap and padding-diff heuristics assume a
 * base64 CHARSET on both sides, and applying them to arbitrary text produces
 * affirmatively false notes (e.g. claiming "Right bytes, wrong alphabet"
 * between two genuinely different decoded strings that merely share a `-`/`_`
 * vs `+`/`/` character somewhere). Decode-mode mismatches fall straight
 * through to the whitespace check and the first-divergence index.
 */
export function compareOutputs(claimedRaw: string, actual: string, isBase64Output = true): ClaimCheck {
  const field = 'output';
  const label = 'Output';
  const claimed = claimedRaw;

  if (claimed === actual) {
    return { field, label, claimed, actual, verdict: 'match' };
  }

  const wsStrippedClaimed = stripWs(claimed);
  if (wsStrippedClaimed === actual) {
    return {
      field,
      label,
      claimed,
      actual,
      verdict: 'mismatch',
      note: 'Matches once whitespace is stripped — likely just line-wrapped.',
    };
  }

  if (isBase64Output) {
    const stdClaimed = toStdAlphabet(wsStrippedClaimed);
    const stdActual = toStdAlphabet(actual);
    if (stdClaimed === stdActual) {
      return {
        field,
        label,
        claimed,
        actual,
        verdict: 'mismatch',
        note: 'Right bytes, wrong alphabet — standard vs URL-safe characters (+/ vs -_) differ.',
      };
    }

    const noPadClaimed = stripPadding(stdClaimed);
    const noPadActual = stripPadding(stdActual);
    if (noPadClaimed === noPadActual) {
      return {
        field,
        label,
        claimed,
        actual,
        verdict: 'mismatch',
        note: 'Same characters, different padding ("=") — the underlying bytes match.',
      };
    }
  }

  const idx = firstDivergenceIndex(wsStrippedClaimed, actual);
  return {
    field,
    label,
    claimed,
    actual,
    verdict: 'mismatch',
    note: `First difference at character ${idx + 1}.`,
  };
}

export function verifyClaims(
  input: string,
  mode: Base64Mode,
  urlSafe: boolean,
  claims: Base64Claims,
): VerifyResult {
  const base = convert(input, mode, urlSafe);
  if (!base.valid) return invalidBase(base.error ?? 'Could not process that input.');

  const checks: ClaimCheck[] = [];
  if (claims.output?.trim()) checks.push(compareOutputs(claims.output, base.output, mode === 'encode'));

  return {
    valid: true,
    summary: summarize(checks),
    checks,
    mismatchCount: checks.filter((c) => c.verdict === 'mismatch').length,
  };
}
