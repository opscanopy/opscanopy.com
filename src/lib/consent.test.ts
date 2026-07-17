/**
 * Pins the hardcoded consent literals in src/layouts/Layout.astro's GA
 * bootstrap against this module's exports. Layout.astro's GA script is
 * `is:inline` (a classic script, loaded before gtag.js) and therefore
 * cannot `import` — so it keeps its own copies of CONSENT_KEY/GRANTED by
 * hand. (define:vars was tried and reverted: Astro wraps is:inline +
 * define:vars scripts in an IIFE, which turns the script's `function gtag()`
 * from an implicit global into a closure-local function, breaking
 * `window.gtag` for every other file that guards on it.) This test is the
 * safety net for that hand-kept duplication — a typo or rename in either
 * file fails the suite instead of silently desyncing consent.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONSENT_KEY, CONSENT_GRANTED } from './consent';

const layoutSource = readFileSync(
  fileURLToPath(new URL('../layouts/Layout.astro', import.meta.url)),
  'utf-8',
);

describe('Layout.astro GA bootstrap literals match src/lib/consent.ts', () => {
  it('reads the same localStorage key CONSENT_KEY exports', () => {
    expect(layoutSource).toContain(`localStorage.getItem('${CONSENT_KEY}')`);
  });

  it('compares against the same granted value CONSENT_GRANTED exports', () => {
    expect(layoutSource).toContain(`=== '${CONSENT_GRANTED}'`);
  });

  it('ConsentToggle.astro (the writer) is reachable and still imports the shared constants', () => {
    const toggleSource = readFileSync(
      fileURLToPath(new URL('../components/ConsentToggle.astro', import.meta.url)),
      'utf-8',
    );
    expect(toggleSource).toContain("from '../lib/consent'");
  });
});
