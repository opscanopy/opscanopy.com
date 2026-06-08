/**
 * escape-html — shared, dependency-free HTML escaper.
 *
 * Used by every playground that injects user-supplied text into innerHTML
 * (matches, capture groups, error messages, etc.). Escapes the five
 * characters that can break out of text or attribute contexts: & < > " '.
 *
 * Order matters: ampersand is replaced first so we never double-escape the
 * entities introduced by the later replacements.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
