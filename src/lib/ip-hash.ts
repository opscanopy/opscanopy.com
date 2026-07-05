/**
 * Shared `#ip=` deep-link fragment helpers for the networking playgrounds.
 *
 * Read via `new URL(location.href).hash` rather than `location.hash`:
 * Firefox returns `location.hash` already percent-decoded, so a value
 * containing an encoded `%` (e.g. an IPv6 zone ID) would make
 * `decodeURIComponent` throw; the URL serializer is never pre-decoded.
 */
export function readIpHash(): string | null {
  const raw = new URL(window.location.href).hash;
  if (!raw.startsWith('#ip=')) return null;
  try {
    const decoded = decodeURIComponent(raw.slice(4)).trim();
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

export function buildIpHash(value: string): string {
  return '#ip=' + encodeURIComponent(value);
}

/**
 * `#list=` variant for the multi-line list tools (CIDR / Subnet Checker).
 * Same defensive URL-serializer read as `readIpHash` — Firefox pre-decodes
 * `location.hash`, so an encoded `%` would make `decodeURIComponent` throw.
 */
export function readListHash(): string | null {
  const raw = new URL(window.location.href).hash;
  if (!raw.startsWith('#list=')) return null;
  try {
    const decoded = decodeURIComponent(raw.slice(6)).trim();
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

export function buildListHash(value: string): string {
  return '#list=' + encodeURIComponent(value);
}
