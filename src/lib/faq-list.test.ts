/**
 * FaqList.astro — the `align` prop (added 2026-10-03 for the rail pages of
 * Batches D/E) must not change a byte of what every page renders TODAY.
 *
 * The component is compiled with Astro's own compiler (`compact: true`, as
 * the build's `compressHTML: true`) and rendered through the container API,
 * the way src/lib/figcap.test.ts does. Its two i18n imports are re-pointed at
 * a stub whose strings this file proves equal to src/i18n/ui/en.ts, so the
 * pin below is markup, not dictionary. The default render is compared byte
 * for byte with DEFAULT_MARKUP — the markup FaqList produced before the prop
 * existed — and `align="left"` must differ only in the two wrapper class
 * attributes the prop owns.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { transform } from '@astrojs/compiler-rs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import en from '../i18n/ui/en';

const ROOT = resolve(__dirname, '../..');
const COMPONENT = resolve(ROOT, 'src/components/FaqList.astro');

const STRINGS = {
  'faq.eyebrow': 'FAQ',
  'faq.heading': 'Questions, answered.',
  'faq.tapHint': 'Tap a question to expand the answer.',
} as const;

type Renderable = Parameters<AstroContainer['renderToString']>[0];
let FaqList: Renderable;
let container: AstroContainer;

/** Compile the component exactly as the build does; i18n goes through a stub beside it. */
export async function loadFaqList(source: string, name: string): Promise<Renderable> {
  const out = transform(source, {
    compact: true,
    filename: COMPONENT,
    internalURL: 'astro/compiler-runtime',
    resultScopedSlot: true,
    resolvePath: (specifier: string) => specifier,
  });
  const dir = resolve(ROOT, 'node_modules/.cache/faq-list-test');
  mkdirSync(dir, { recursive: true });
  const stub = resolve(dir, 'i18n-stub.mjs');
  writeFileSync(
    stub,
    `export const DEFAULT_LOCALE = 'en';\nconst S = ${JSON.stringify(STRINGS)};\nexport const useTranslations = () => (k) => S[k] ?? k;\n`,
  );
  let code = out.code
    .replace(/(['"])\.\.\/i18n\/(?:config|utils)\1/g, JSON.stringify(pathToFileURL(stub).href))
    // The scoped <style> is the build's business; the compiled module must not import it.
    .replace(/^import\s+["'][^"']*\?astro&type=style[^"']*["'];?\s*$/gm, '');
  expect(code, 'i18n imports rewritten').not.toMatch(/\.\.\/i18n\//);
  expect(code, 'style import dropped').not.toMatch(/type=style/);
  const file = resolve(dir, `${name}.mjs`);
  writeFileSync(file, code);
  return (await import(/* @vite-ignore */ pathToFileURL(file).href + `?t=${Date.now()}`)).default;
}

/**
 * The style scope (`astro-xxxxxxxx` class, always appended last; or a
 * `data-astro-cid-*` attribute under the other strategy) hashes the absolute
 * file path, so it differs per machine; it is not markup. An element whose
 * only class was the scope loses the attribute.
 */
const normalise = (html: string) =>
  html
    .replace(/\s?data-astro-cid-[a-z0-9]+(?:="")?/g, '')
    .replace(/ class="astro-[a-z0-9]{8}"/g, '')
    .replace(/ astro-[a-z0-9]{8}"/g, '"');

const FAQS = [
  { q: 'What is a /24?', a: 'A network with 256 addresses, 254 of them usable for hosts.' },
  { q: 'Does it run offline?', a: 'Yes — every calculation happens in your browser & nothing is sent.' },
];

async function renderFaq(props: Record<string, unknown>): Promise<string> {
  return normalise(await container.renderToString(FaqList, { props: { faqs: FAQS, ...props } }));
}

beforeAll(async () => {
  FaqList = await loadFaqList(readFileSync(COMPONENT, 'utf8'), 'FaqList');
  container = await AstroContainer.create();
});

// FaqList.astro at main a351713 (before `align` existed), rendered with FAQS
// through this same loader. Regenerate ONLY for a deliberate markup change,
// and say so in the commit: every tool page's FAQ section is this string.
const DEFAULT_MARKUP =
  '<section id="faq" class="scroll-mt-24 border-t border-hairline bg-canvas"> <div class="container-page py-16 sm:py-20"> <div class="mx-auto max-w-2xl text-center"> <p class="eyebrow">FAQ</p> <h2 class="display-lg mt-3 text-ink">Questions, answered.</h2> <p class="body-sm mt-3 text-mute">Tap a question to expand the answer.</p> </div> <div class="mx-auto mt-10 max-w-3xl divide-y divide-hairline border-y border-hairline"> <details class="faq-item group"> <summary class="flex cursor-pointer list-none items-start justify-between gap-4 py-5"> <h3 class="display-sm text-balance text-ink transition-colors group-hover:text-link"> What is a /24? </h3> <span aria-hidden="true" class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-mute transition-colors group-hover:bg-canvas-soft-2 group-hover:text-ink"> <svg class="faq-chevron size-4 transition-transform duration-200 ease-out" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"> <polyline points="6 9 12 15 18 9"></polyline> </svg> </span> </summary> <div class="pb-6 pr-10"> <p class="body-md text-pretty text-body">A network with 256 addresses, 254 of them usable for hosts.</p> </div> </details><details class="faq-item group"> <summary class="flex cursor-pointer list-none items-start justify-between gap-4 py-5"> <h3 class="display-sm text-balance text-ink transition-colors group-hover:text-link"> Does it run offline? </h3> <span aria-hidden="true" class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-mute transition-colors group-hover:bg-canvas-soft-2 group-hover:text-ink"> <svg class="faq-chevron size-4 transition-transform duration-200 ease-out" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"> <polyline points="6 9 12 15 18 9"></polyline> </svg> </span> </summary> <div class="pb-6 pr-10"> <p class="body-md text-pretty text-body">Yes — every calculation happens in your browser &amp; nothing is sent.</p> </div> </details> </div> </div> </section>';

describe('FaqList align prop', () => {
  it('the stub strings are the English dictionary', () => {
    for (const [k, v] of Object.entries(STRINGS)) expect((en as Record<string, string>)[k]).toBe(v);
  });

  it('default render (no align) is byte-identical to the pre-prop markup', async () => {
    expect(await renderFaq({})).toBe(DEFAULT_MARKUP);
  });

  it('align="center" is the default, spelled out', async () => {
    expect(await renderFaq({ align: 'center' })).toBe(DEFAULT_MARKUP);
  });

  it('align="left" changes only the two wrapper class attributes', async () => {
    const left = await renderFaq({ align: 'left' });
    expect(left).not.toBe(DEFAULT_MARKUP);
    const expected = DEFAULT_MARKUP.replace('class="mx-auto max-w-2xl text-center"', 'class="max-w-2xl"').replace(
      'class="mx-auto mt-10 max-w-3xl divide-y divide-hairline border-y border-hairline"',
      'class="mt-10 max-w-3xl divide-y divide-hairline border-y border-hairline"',
    );
    expect(expected).not.toBe(DEFAULT_MARKUP);
    expect(left).toBe(expected);
    expect(left).not.toContain('mx-auto');
    expect(left).not.toContain('text-center');
  });

  it('the pin can fail (a different question is caught)', async () => {
    const html = normalise(await container.renderToString(FaqList, { props: { faqs: [{ q: 'Other?', a: 'No.' }] } }));
    expect(html).not.toBe(DEFAULT_MARKUP);
  });
});
