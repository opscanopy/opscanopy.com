/**
 * Mission 90 Days — shared display formatters. Pure, no DOM. Previously three
 * near-identical copies (complete.astro, missions/index.astro,
 * MissionTerminal.astro) had already drifted — MissionTerminal's didn't
 * clamp negative/fractional seconds, which only stayed harmless because its
 * one caller happens to pre-clamp; the other two callers don't.
 */

/**
 * Seconds → "m:ss". Clamped to ≥0 and rounded — imported progress codes can
 * carry negative or fractional `seconds` (the schema only checks
 * `Number.isFinite`), and an unclamped value renders garbage like "-3:-5".
 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * ISO date string → a short localized date ("Jan 5, 2026"). Never throws:
 * an unparseable string is returned unchanged. `locale` is exposed so tests
 * can pin a deterministic locale; page callers omit it (uses the browser's).
 */
export function fmtDate(iso: string, locale?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}
