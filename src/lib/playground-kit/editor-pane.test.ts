/**
 * EditorPane.astro, rendered — compiled with Astro's own compiler (as
 * figcap.test.ts does for FigureCap) and rendered through the container API.
 *
 * Pins two things the guard and ssr-diff cannot see on their own:
 *   - the default single-host markup carries none of the new props' output
 *     (no role, aria-label or aria-labelledby, no separator), so every
 *     migrated playground renders as it did before the props existed;
 *   - the multi-host form names each labelled host through a visible caption
 *     that is NOT `role="separator"` (separator children are presentational,
 *     so a label inside one is dropped by screen readers).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { transform } from '@astrojs/compiler-rs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';

const ROOT = resolve(__dirname, '../../..');
const CACHE = resolve(ROOT, 'node_modules/.cache/editor-pane-test');

type Renderable = Parameters<AstroContainer['renderToString']>[0];
let EditorPane: Renderable;
let container: AstroContainer;

function compile(src: string, rewrites: Array<[RegExp, string]>, outName: string): string {
  const out = transform(readFileSync(src, 'utf8'), {
    compact: true,
    filename: src,
    internalURL: 'astro/compiler-runtime',
    resultScopedSlot: true,
    resolvePath: (specifier: string) => specifier,
  });
  let code = out.code;
  for (const [re, to] of rewrites) {
    const before = code;
    code = code.replace(re, JSON.stringify(to));
    expect(code, `${outName}: import rewrite ${re}`).not.toBe(before);
  }
  const file = resolve(CACHE, outName);
  writeFileSync(file, code);
  return pathToFileURL(file).href;
}

beforeAll(async () => {
  mkdirSync(CACHE, { recursive: true });
  const cap = compile(
    resolve(ROOT, 'src/components/FigureCap.astro'),
    [[/(['"])\.\.\/lib\/figcap-label\1/g, pathToFileURL(resolve(ROOT, 'src/lib/figcap-label.ts')).href]],
    'FigureCap.mjs',
  );
  const pane = compile(
    resolve(ROOT, 'src/components/playground/EditorPane.astro'),
    [[/(['"])\.\.\/FigureCap\.astro\1/g, cap]],
    'EditorPane.mjs',
  );
  EditorPane = (await import(/* @vite-ignore */ pane)).default;
  container = await AstroContainer.create();
});

const render = (props: Record<string, unknown>, slots: Record<string, string>) => container.renderToString(EditorPane, { props, slots });

/** The opening tag of the element with this id. */
function tagOf(html: string, id: string): string {
  const m = new RegExp(`<[a-z]+[^>]*\\bid="${id}"[^>]*>`).exec(html);
  if (!m) throw new Error(`no element #${id} in ${html}`);
  return m[0];
}

describe('EditorPane single host (the form every playground uses today)', () => {
  it('default props add no role, name or separator', async () => {
    const html = await render({ prefix: 'gx', label: 'input.yaml' }, { default: '<pre data-cm-fallback>a: 1</pre>' });
    const host = tagOf(html, 'gx-editor');
    expect(host).toContain('data-editor-host');
    expect(host).not.toMatch(/\brole=|aria-label|aria-labelledby/);
    expect(html).not.toContain('editor-pane__sep');
    expect(html).toContain('<pre data-cm-fallback>a: 1</pre>');
    expect(html).not.toMatch(/class="figcap__label"[^>]*\bid=/);
  });

  it('ariaLabel names the host as a group; labelId lands on the cap label', async () => {
    const html = await render({ prefix: 'gx', label: 'input.yaml', ariaLabel: 'Workflow YAML', labelId: 'gx-cap' }, { default: '' });
    const host = tagOf(html, 'gx-editor');
    expect(host).toContain('role="group"');
    expect(host).toContain('aria-label="Workflow YAML"');
    expect(tagOf(html, 'gx-cap')).toContain('figcap__label');
  });
});

describe('EditorPane hosts (several hosts in one slab)', () => {
  const hosts = [{ id: 'jq-program' }, { id: 'jq-input', label: 'input.json · stdin' }, { id: 'jq-extra' }];
  const slots = { 'jq-program': '<pre>.foo</pre>', 'jq-input': '<pre>{}</pre>', 'jq-extra': '<pre>x</pre>' };

  it('a labelled host is a group named by a visible caption that is not a separator', async () => {
    const html = await render({ prefix: 'jq', label: 'filter.jq', hosts }, slots);
    const caption = tagOf(html, 'jq-input-label');
    expect(caption).toContain('editor-pane__sep');
    expect(caption).not.toContain('role="separator"');
    expect(html).toContain('>input.json · stdin</div>');
    const host = tagOf(html, 'jq-input');
    expect(host).toContain('role="group"');
    expect(host).toContain('aria-labelledby="jq-input-label"');
  });

  it('an unlabelled later host gets an empty separator hairline; the first host gets none', async () => {
    const html = await render({ prefix: 'jq', label: 'filter.jq', hosts }, slots);
    const seps = [...html.matchAll(/<div[^>]*role="separator"[^>]*>([^<]*)<\/div>/g)];
    expect(seps).toHaveLength(1);
    expect(seps[0][1]).toBe('');
    expect(html.indexOf('role="separator"')).toBeGreaterThan(html.indexOf('id="jq-input"'));
    expect(tagOf(html, 'jq-program')).not.toMatch(/\brole=|aria-label/);
    expect(tagOf(html, 'jq-extra')).not.toMatch(/\brole=|aria-label/);
  });

  it('each host is filled from the slot named by its id', async () => {
    const html = await render({ prefix: 'jq', label: 'filter.jq', hosts }, slots);
    expect(html).toMatch(/id="jq-program"[^>]*><pre>\.foo<\/pre><\/div>/);
    expect(html).toMatch(/id="jq-input"[^>]*><pre>\{\}<\/pre><\/div>/);
  });
});
