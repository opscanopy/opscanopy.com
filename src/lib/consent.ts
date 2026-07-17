/**
 * Analytics consent — the localStorage key + values shared between
 * ConsentToggle.astro (writer, on /privacy) and Layout.astro's GA bootstrap
 * (reader, default-denied Consent Mode v2). Both must agree on these
 * literals exactly; consolidating them here is the whole point.
 */
export const CONSENT_KEY = 'oc-analytics-consent';
export const CONSENT_GRANTED = 'granted';
export const CONSENT_DENIED = 'denied';
