/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 *
 * `runToCompose()` is pure and synchronous and emits deterministic YAML, so
 * the whole result is safe to bake at build time.
 */
import { describe, it, expect } from 'vitest';
import { runToCompose } from './engine';
import { examples } from './examples';
import { resultHtml, warningsHtml, statusText, warnHtml, errorHtml, EMPTY_HTML } from './render';

const seed = runToCompose(examples[0].run); // nginx — publish + read-only mount

describe('the seeded example', () => {
  it('converts to a one-service Compose file, rendered in the dark result slab', () => {
    expect(seed.ok).toBe(true);
    const html = resultHtml('docker-compose.yml', seed.yaml ?? '');
    expect(html).toContain('drc-result__name">docker-compose.yml<');
    expect(html).toContain('image: nginx:alpine');
    expect(html).toContain('container_name: web');
    // YAML quotes must arrive escaped inside <code>.
    expect(html).toContain('- &quot;8080:80&quot;');
    expect(html).not.toContain('"8080:80"');
    expect(html).toContain('/data:/usr/share/nginx/html:ro');
  });

  it('renders the detach note with its backticked flags as <code>', () => {
    expect(seed.warnings.length).toBe(1);
    const html = warningsHtml(seed.warnings);
    expect(html).toContain('drc-warn');
    expect(html).toContain('<code>-d</code>');
    expect(html).toContain('<code>docker compose up -d</code>');
    expect(statusText(seed.warnings)).toBe('1 note');
  });
});

describe('resultHtml / warnHtml', () => {
  it('escapes the file name and the code body', () => {
    const html = resultHtml('<n>', 'a < b & "c"');
    expect(html).toContain('&lt;n&gt;');
    expect(html).toContain('a &lt; b &amp; &quot;c&quot;');
  });

  it('escapes HTML inside warnings but keeps backtick spans as <code>', () => {
    expect(warnHtml('use `<x>` & go')).toBe('use <code>&lt;x&gt;</code> &amp; go');
    expect(warningsHtml([])).toBe('');
    expect(warningsHtml(['a', 'b']).match(/class="drc-warn"/g)?.length).toBe(2);
  });
});

describe('statusText', () => {
  it('reads Converted / 1 note / N notes', () => {
    expect(statusText([])).toBe('Converted');
    expect(statusText(['a'])).toBe('1 note');
    expect(statusText(['a', 'b'])).toBe('2 notes');
  });
});

describe('errorHtml / static states', () => {
  it('escapes the diagnostic message', () => {
    expect(errorHtml('bad <input>')).toContain('bad &lt;input&gt;');
    expect(errorHtml('x')).toContain('role="alert"');
    expect(errorHtml('x')).toContain('Could not convert');
  });
  it('keeps the empty state a stable string', () => {
    expect(EMPTY_HTML).toMatch(/^<p class="drc-empty/);
  });
});
