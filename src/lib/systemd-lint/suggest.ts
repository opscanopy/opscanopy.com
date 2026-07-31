/**
 * "Did you mean …?" for systemd directive and section names.
 *
 * Optimal string alignment (Damerau-Levenshtein restricted to adjacent
 * transpositions), which is the right metric here because the mistakes are
 * typing mistakes: `ExecStrat` (transposition), `RestartSecs` (insertion),
 * `Wantedby` (case). A plain Levenshtein would score `ExecStrat` → `ExecStart`
 * as 2 rather than 1 and rank a worse candidate above it.
 *
 * The threshold is deliberately tight. A suggestion promotes a finding from
 * "unknown, might be newer than our table" (info) to "this is a typo and systemd
 * is discarding your line" (error), so a wrong guess is expensive: it tells
 * someone to change a line that was right. Hence:
 *
 *   - distance ≤ 1 for names up to 6 characters;
 *   - distance ≤ 2 for longer names;
 *   - a case-only difference always wins, because systemd compares directive
 *     names case-sensitively and `execstart=` is unambiguously ExecStart=.
 */

/** Optimal string alignment distance, capped so long strings stay cheap. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  // Nothing in this codebase compares names this long; bail rather than build a
  // big matrix for a value no caller can use.
  if (Math.abs(m - n) > 4) return Math.abs(m - n);

  let prev2: number[] = [];
  let prev: number[] = new Array(n + 1);
  let curr: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;

  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, prev2[j - 2] + 1);
      }
      curr[j] = best;
    }
    prev2 = prev;
    prev = curr;
    curr = new Array(n + 1);
  }
  return prev[n];
}

/** The distance this name is allowed to be from a candidate to count as a typo. */
function thresholdFor(name: string): number {
  return name.length <= 6 ? 1 : 2;
}

/**
 * The closest candidate to `name`, or `null` when nothing is close enough.
 *
 * Candidates are compared in the order given, and ties keep the FIRST candidate —
 * so callers pass the most likely set (the current section's own directives)
 * first and the wider set afterwards.
 */
export function suggestName(name: string, candidates: Iterable<string>): string | null {
  if (typeof name !== 'string' || name === '') return null;
  const lower = name.toLowerCase();
  const limit = thresholdFor(name);

  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (candidate === name) return null; // not a typo at all
    // A case-only difference is never a guess: systemd is case-sensitive, so the
    // canonical spelling is certainly what was meant.
    if (candidate.toLowerCase() === lower) return candidate;
    const distance = editDistance(name, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best !== null && bestDistance <= limit ? best : null;
}
