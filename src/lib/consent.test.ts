/**
 * Pins the hardcoded consent literals in src/layouts/Layout.astro's GA
 * bootstrap against this module's exports. Layout.astro's GA script is
 * `is:inline` (a classic script, loaded before gtag.js) and therefore
 * cannot `import` — so it keeps its own copies of CONSENT_KEY/GRANTED/DENIED
 * and of the consent-required region list by hand. (define:vars was tried
 * and reverted: Astro wraps is:inline + define:vars scripts in an IIFE,
 * which turns the script's `function gtag()` from an implicit global into a
 * closure-local function, breaking `window.gtag` for every other file that
 * guards on it.) This test is the safety net for that hand-kept duplication
 * — a typo, rename or region drift in either file fails the suite instead
 * of silently desyncing consent.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CONSENT_KEY,
  CONSENT_GRANTED,
  CONSENT_DENIED,
  CONSENT_REQUIRED_REGIONS,
  consentRequiredFor,
  parseTraceCountry,
} from './consent';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8');
const layoutSource = read('../layouts/Layout.astro');
const toggleSource = read('../components/ConsentToggle.astro');

describe('Layout.astro GA bootstrap literals match src/lib/consent.ts', () => {
  it('reads the same localStorage key CONSENT_KEY exports', () => {
    expect(layoutSource).toContain(`localStorage.getItem('${CONSENT_KEY}')`);
  });

  it('re-applies a stored granted choice (opt-in inside the consent regions)', () => {
    expect(layoutSource).toContain(`=== '${CONSENT_GRANTED}'`);
  });

  it('re-applies a stored denied choice too (opt-out everywhere else)', () => {
    expect(layoutSource).toContain(`=== '${CONSENT_DENIED}'`);
  });

  it('denies analytics_storage by default in exactly CONSENT_REQUIRED_REGIONS', () => {
    const m = /region:\s*\[([^\]]*)\]/.exec(layoutSource);
    expect(m, 'no region-scoped consent default in Layout.astro').not.toBeNull();
    const codes = [...m![1].matchAll(/'([A-Z]{2})'/g)].map((x) => x[1]).sort();
    expect(codes).toEqual([...CONSENT_REQUIRED_REGIONS].sort());

    // The region list must sit inside the DENIED default, not the granted one.
    const blockStart = layoutSource.lastIndexOf("gtag('consent', 'default'", m!.index);
    expect(layoutSource.slice(blockStart, m!.index)).toContain("analytics_storage: 'denied'");
  });

  it('grants analytics_storage by default everywhere else, with ad signals still denied', () => {
    expect(layoutSource).toMatch(
      /gtag\('consent',\s*'default',\s*\{\s*analytics_storage:\s*'granted',\s*ad_storage:\s*'denied',\s*ad_user_data:\s*'denied',\s*ad_personalization:\s*'denied',?\s*\}\)/,
    );
  });

  it('ConsentToggle.astro (the writer) is reachable and still imports the shared constants', () => {
    expect(toggleSource).toContain("from '../lib/consent'");
  });
});

describe('CONSENT_REQUIRED_REGIONS', () => {
  it('is the EEA (EU-27 + IS, LI, NO) plus the UK and Switzerland', () => {
    const eu27 = [
      'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
      'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
    ];
    const expected = [...eu27, 'IS', 'LI', 'NO', 'GB', 'CH'].sort();
    expect([...CONSENT_REQUIRED_REGIONS].sort()).toEqual(expected);
  });

  it('holds only unique uppercase ISO 3166-1 alpha-2 codes', () => {
    expect(new Set(CONSENT_REQUIRED_REGIONS).size).toBe(CONSENT_REQUIRED_REGIONS.length);
    for (const c of CONSENT_REQUIRED_REGIONS) expect(c).toMatch(/^[A-Z]{2}$/);
  });
});

describe('consentRequiredFor', () => {
  it('is true inside a consent region', () => {
    expect(consentRequiredFor('DE')).toBe(true);
    expect(consentRequiredFor('NO')).toBe(true);
    expect(consentRequiredFor('GB')).toBe(true);
  });

  it('is false outside them', () => {
    expect(consentRequiredFor('US')).toBe(false);
    expect(consentRequiredFor('IN')).toBe(false);
    expect(consentRequiredFor('BR')).toBe(false);
  });

  it('is case-insensitive and tolerant of surrounding whitespace', () => {
    expect(consentRequiredFor('gb')).toBe(true);
    expect(consentRequiredFor(' fr ')).toBe(true);
  });

  it("is false for unknown or missing codes (Cloudflare's XX, null, undefined, empty)", () => {
    expect(consentRequiredFor('XX')).toBe(false);
    expect(consentRequiredFor(null)).toBe(false);
    expect(consentRequiredFor(undefined)).toBe(false);
    expect(consentRequiredFor('')).toBe(false);
  });
});

describe('parseTraceCountry', () => {
  it('reads loc= from a /cdn-cgi/trace body', () => {
    const body =
      'fl=961f67\nh=opscanopy.com\nip=203.0.113.9\nts=1788701936.000\nvisit_scheme=https\n' +
      'colo=SIN\nloc=IN\ntls=TLSv1.3\nwarp=off\n';
    expect(parseTraceCountry(body)).toBe('IN');
  });

  it('matches only the loc key, not other keys that happen to end in loc', () => {
    expect(parseTraceCountry('xloc=DE\ncolo=FRA\n')).toBeNull();
    expect(parseTraceCountry('colo=FRA\r\nloc=FR\r\n')).toBe('FR');
  });

  it('returns null when loc is missing or malformed', () => {
    expect(parseTraceCountry('')).toBeNull();
    expect(parseTraceCountry('fl=1\nh=x\n')).toBeNull();
    expect(parseTraceCountry('loc=\n')).toBeNull();
    expect(parseTraceCountry('loc=Germany\n')).toBeNull();
  });
});

describe('ConsentToggle.astro derives the unstored default the same way Google does', () => {
  it("asks Cloudflare's same-origin trace for the country and applies the shared region list", () => {
    expect(toggleSource).toContain("'/cdn-cgi/trace'");
    expect(toggleSource).toContain('parseTraceCountry');
    expect(toggleSource).toContain('consentRequiredFor');
  });
});
