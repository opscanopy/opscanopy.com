/**
 * Shared base64url codec — UTF-8 safe, URL-safe (no +, /, or = padding).
 * Extracted from the AlertLint share-link codec so any client-side feature
 * that needs a copy-pasteable or hash-embeddable string (share links, the
 * Mission 90 progress export code) can reuse the same, already-hardened pair
 * instead of re-deriving it.
 */

/** URL-safe base64 of a UTF-8 string. */
export function base64UrlEncode(input: string): string {
  // encodeURIComponent → percent-escape unicode → raw bytes safe for btoa.
  const bytes = encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (_, h) =>
    String.fromCharCode(parseInt(h, 16)),
  );
  return btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Inverse of base64UrlEncode. */
export function base64UrlDecode(input: string): string {
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  const bytes = atob(b64);
  let percent = '';
  for (let i = 0; i < bytes.length; i++) {
    percent += '%' + bytes.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return decodeURIComponent(percent);
}
