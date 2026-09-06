/**
 * Analytics consent — the localStorage key + values shared between
 * ConsentToggle.astro (writer, on /privacy) and Layout.astro's GA bootstrap
 * (reader, region-scoped Consent Mode v2), plus the region list both apply.
 * Layout.astro cannot import (its script is is:inline), so it hand-copies
 * these literals; src/lib/consent.test.ts pins the copies to these exports.
 */
export const CONSENT_KEY = 'oc-analytics-consent';
export const CONSENT_GRANTED = 'granted';
export const CONSENT_DENIED = 'denied';

/**
 * Where analytics cookies need PRIOR consent, so analytics_storage defaults to
 * denied (cookieless pings only) and the /privacy toggle is an opt-in: the EEA
 * (EU-27 + Iceland, Liechtenstein, Norway) under the ePrivacy Directive, the
 * UK under PECR, and Switzerland. Everywhere else the default is granted and
 * the same toggle is an opt-out. ISO 3166-1 alpha-2 — the codes gtag's
 * `region` parameter takes.
 */
export const CONSENT_REQUIRED_REGIONS: readonly string[] = [
  // EU-27
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  // rest of the EEA
  'IS', 'LI', 'NO',
  // UK (PECR) and Switzerland
  'GB', 'CH',
];

/** True when a visitor from `country` must opt in before an analytics cookie may be set. */
export function consentRequiredFor(country: string | null | undefined): boolean {
  if (!country) return false;
  return CONSENT_REQUIRED_REGIONS.includes(country.trim().toUpperCase());
}

/**
 * The `loc=XX` country from a Cloudflare `/cdn-cgi/trace` body (one
 * `key=value` per line). Null when absent or not a two-letter code.
 * Cloudflare's own unknown marker `XX` comes back as-is; it is simply not a
 * consent region, which matches Google applying its general default there.
 */
export function parseTraceCountry(body: string): string | null {
  const m = /^loc=([A-Za-z]{2})\s*$/m.exec(body);
  return m ? m[1].toUpperCase() : null;
}
