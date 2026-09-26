/**
 * Pins the search-query redaction in src/layouts/Layout.astro's inline GA
 * shim. That script is is:inline (it cannot import), so the function is
 * extracted from the source by regex and evaluated in a node:vm context —
 * the exact bytes that ship, not a copy.
 *
 * Why it exists: /search/?q=… would otherwise send the query text to GA4 in
 * page_location (and Enhanced Measurement's view_search_results), and the
 * next page's page_referrer would carry /search/?q=… too.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const layoutSource = readFileSync(
  fileURLToPath(new URL('../layouts/Layout.astro', import.meta.url)),
  'utf-8',
);

function extract(src: string): string {
  const m = src.match(/function ocRedact\(u\) \{[\s\S]*?\n {8}\}/);
  if (!m) throw new Error('ocRedact not found in Layout.astro');
  return m[0];
}

function load(fnSource: string): (u: unknown) => string | null {
  const ctx = vm.createContext({ URL });
  vm.runInContext(`${fnSource}\nthis.ocRedact = ocRedact;`, ctx);
  return (ctx as { ocRedact: (u: unknown) => string | null }).ocRedact;
}

const ocRedact = load(extract(layoutSource));

describe('Layout.astro GA shim: ocRedact', () => {
  it('is wired into gtag("set") for page_location and page_referrer', () => {
    expect(layoutSource).toMatch(/var pl = ocRedact\(location\.href\);/);
    expect(layoutSource).toMatch(/var pr = document\.referrer \? ocRedact\(document\.referrer\) : null;/);
    expect(layoutSource).toMatch(/if \(pl \|\| pr\) gtag\('set', o\);/);
    // Must run before the deferred config call.
    expect(layoutSource.indexOf("gtag('set', o)")).toBeLessThan(layoutSource.indexOf("gtag('config'"));
  });

  it('removes q from a search URL', () => {
    const out = ocRedact('https://opscanopy.com/search/?q=cron');
    expect(out).not.toBeNull();
    expect(out).not.toContain('q=');
    expect(out).not.toContain('cron');
    expect(new URL(out!).searchParams.has('q')).toBe(false);
    expect(new URL(out!).pathname).toBe('/search/');
  });

  it('keeps other params and drops the fragment', () => {
    const out = ocRedact('https://opscanopy.com/search/?q=a&x=1#h');
    expect(out).not.toBeNull();
    const u = new URL(out!);
    expect(u.searchParams.has('q')).toBe(false);
    expect(u.searchParams.get('x')).toBe('1');
    expect(u.hash).toBe('');
    expect(out).not.toContain('#');
  });

  it('returns null for a URL without q (GA defaults untouched)', () => {
    expect(ocRedact('https://opscanopy.com/tools/')).toBeNull();
    expect(ocRedact('https://opscanopy.com/subnet-calculator/#ip=10.0.0.0/8')).toBeNull();
  });

  it('returns null for invalid input instead of throwing', () => {
    expect(ocRedact('not a url')).toBeNull();
    expect(ocRedact('')).toBeNull();
    expect(ocRedact(undefined)).toBeNull();
  });

  it('can fail: a broken redactor is caught', () => {
    const src = extract(layoutSource);
    const mutated = src.replace("x.searchParams.delete('q');", '');
    expect(mutated).not.toBe(src);
    const broken = load(mutated);
    const out = broken('https://opscanopy.com/search/?q=cron');
    expect(out).toContain('q=cron');
  });
});
