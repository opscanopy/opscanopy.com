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

/**
 * Three rolling rows, reused across calls. This function is called once per
 * candidate name — hundreds of times per unknown directive, and once per line of
 * a paste that is not a unit file at all — and allocating a row per character was
 * what turned that into a frozen tab. Not reentrant, and does not need to be:
 * nothing inside the loop calls out.
 */
let rowA = new Int32Array(64);
let rowB = new Int32Array(64);
let rowC = new Int32Array(64);

/**
 * Optimal string alignment distance.
 *
 * `max` is a ceiling on the answer, not on the inputs: as soon as every path is
 * known to cost more than `max`, the function stops and returns `max + 1`. Every
 * caller compares the result against a small threshold, so the exact value past
 * that threshold is never used — and stopping there is what keeps a 199,000-
 * character paste of unknown `KEY=value` lines from blocking the main thread for
 * twenty seconds. Called without `max`, it is exact.
 */
export function editDistance(a: string, b: string, max = Number.POSITIVE_INFINITY): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  // A distance is never smaller than the length difference.
  const gap = Math.abs(m - n);
  if (gap > max) return max + 1;
  // Nothing in this codebase compares names this long; bail rather than build a
  // big matrix for a value no caller can use.
  if (gap > 4) return gap;

  if (rowA.length < n + 1) {
    rowA = new Int32Array(n + 1);
    rowB = new Int32Array(n + 1);
    rowC = new Int32Array(n + 1);
  }
  let prev2 = rowA;
  let prev = rowB;
  let curr = rowC;
  for (let j = 0; j <= n; j += 1) prev[j] = j;

  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, prev2[j - 2] + 1);
      }
      curr[j] = best;
      if (best < rowMin) rowMin = best;
    }
    // Rotate the three rows instead of allocating: prev2 ← row i-1, prev ← row i,
    // and the buffer that held row i-2 becomes the next scratch row. Every cell of
    // it is overwritten before it is read.
    const spare = prev2;
    prev2 = prev;
    prev = curr;
    curr = spare;
    // Every entry in a row is a lower bound on every distance below it, so once
    // the whole row is past the ceiling the answer is too.
    if (rowMin > max) return max + 1;
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
    // Bounded by the threshold: anything past it loses to `bestDistance <= limit`
    // below whatever its exact value is, so there is nothing to buy by computing
    // it. Pure latency, no behaviour change.
    const distance = editDistance(name, candidate, limit);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best !== null && bestDistance <= limit ? best : null;
}
