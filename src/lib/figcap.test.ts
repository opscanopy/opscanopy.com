/**
 * figcap — FigureCap.astro and figcapHtml() emit the SAME markup.
 *
 * FigureCap.astro is compiled here with Astro's own compiler (the one
 * `astro build` uses, with `compact: true` = the site's `compressHTML: true`)
 * and rendered through Astro's container API, then compared byte for byte
 * with figcapHtml() for the same props. A third leg closes the loop: the cap
 * rehype-code-header puts on a real Markdown code block (through the real
 * markdown pipeline) equals FigureCap.astro rendered with the same copy button
 * in its slot. So the component, the string builder and the code-block header
 * are one figure cap, and any drift in one of them fails here.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { transform } from '@astrojs/compiler-rs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { createMarkdownProcessor, markdownConfigDefaults } from '@astrojs/markdown-remark';
import { figcapHtml, type FigcapOptions } from './figcap';
import rehypeCodeHeader, { copyButtonHtml } from './rehype-code-header.mjs';
import { shikiConfig } from './shiki-theme.mjs';

const ROOT = resolve(__dirname, '../..');
const COMPONENT = resolve(ROOT, 'src/components/FigureCap.astro');

type Renderable = Parameters<AstroContainer['renderToString']>[0];
let FigureCap: Renderable;
let container: AstroContainer;

/** Compile FigureCap.astro exactly as the build does and load it as a module. */
async function loadFigureCap(): Promise<Renderable> {
  const out = transform(readFileSync(COMPONENT, 'utf8'), {
    compact: true,
    filename: COMPONENT,
    internalURL: 'astro/compiler-runtime',
    resultScopedSlot: true,
    // Supplying a resolver (as the build does) keeps the compiler on the
    // build's code path; without one it emits a dev-only metadata import.
    resolvePath: (specifier: string) => specifier,
  });
  // Its one relative import, re-pointed at the source file so the compiled
  // module can live outside src/ (vitest transforms the .ts on import).
  const code = out.code.replace(
    /(['"])\.\.\/lib\/figcap-label\1/g,
    JSON.stringify(pathToFileURL(resolve(ROOT, 'src/lib/figcap-label.ts')).href),
  );
  expect(code, 'FigureCap.astro import rewrite').toContain('figcap-label.ts');
  const dir = resolve(ROOT, 'node_modules/.cache/figcap-test');
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, 'FigureCap.mjs');
  writeFileSync(file, code);
  return (await import(/* @vite-ignore */ pathToFileURL(file).href)).default;
}

async function renderCap(props: Omit<FigcapOptions, 'actions'>, slot?: string): Promise<string> {
  return container.renderToString(FigureCap, {
    props: props as Record<string, unknown>,
    slots: slot === undefined ? {} : { default: slot },
  });
}

beforeAll(async () => {
  FigureCap = await loadFigureCap();
  container = await AstroContainer.create();
});

const CASES: Array<[string, Omit<FigcapOptions, 'actions'>, string | undefined]> = [
  ['bare label', { label: 'alert.test.yaml' }, undefined],
  ['label + actions', { label: 'yaml' }, '<button type="button" class="rich-code-copy" data-code-copy="">Copy</button>'],
  ['figure number + traffic dots', { fig: '07', label: 'cron-expression-tester · scheduling', tone: 'traffic' }, undefined],
  ['split tail', { fig: '10', label: 'subnet-calculator · networking', tone: 'traffic', split: true }, '<span role="status">3 rows</span>'],
  ['split with no separator', { label: 'terminal', split: true }, undefined],
  ['extra class', { label: 'bash', class: 'px-4 py-2' }, undefined],
  ['escaping', { label: `a & "b" <c> 'd'` }, undefined],
];

describe('figcapHtml === FigureCap.astro', () => {
  for (const [name, props, slot] of CASES) {
    it(name, async () => {
      const astro = await renderCap(props, slot);
      expect(figcapHtml({ ...props, actions: slot })).toBe(astro);
    });
  }

  it('the comparison can fail (a changed tone is caught)', async () => {
    const astro = await renderCap({ label: 'yaml' });
    expect(figcapHtml({ label: 'yaml', tone: 'traffic' })).not.toBe(astro);
    expect(figcapHtml({ label: 'yml' })).not.toBe(astro);
  });
});

describe('rehype-code-header emits FigureCap.astro', () => {
  it('the cap on a real code block equals FigureCap.astro with the copy button slotted', async () => {
    const processor = await createMarkdownProcessor({
      shikiConfig: { ...markdownConfigDefaults.shikiConfig, ...shikiConfig },
      rehypePlugins: [rehypeCodeHeader],
    } as Parameters<typeof createMarkdownProcessor>[0]);
    for (const [lang, file, locale] of [
      ['yaml', 'src/content/blog/en/x.md', 'en'],
      ['bash', 'src/content/blog/de/x.md', 'de'],
      ['', 'src/content/guides/x.md', 'en'],
    ] as const) {
      const { code } = await processor.render('```' + lang + '\nx: 1\n```\n', {
        fileURL: pathToFileURL(resolve(ROOT, file)),
      } as never);
      const emitted = code.slice(code.indexOf('<div class="figcap"'), code.indexOf('<pre'));
      const astro = await renderCap({ label: lang || 'text' }, copyButtonHtml(locale));
      expect(emitted).toBe(astro);
    }
  });
});
