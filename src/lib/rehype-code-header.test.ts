/**
 * rehype-code-header — every Shiki code block is wrapped in
 * <figure class="code-fig"> headed by the site figure cap (figcapHtml, proved
 * equal to FigureCap.astro in figcap.test.ts), with the copy button in the
 * cap's actions slot. Run through the real Astro markdown pipeline
 * (createMarkdownProcessor: remark → Shiki → user rehype → rehype-raw →
 * stringify), so what is asserted here is what a page receives.
 */
import { describe, expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createMarkdownProcessor, markdownConfigDefaults } from '@astrojs/markdown-remark';
import rehypeCodeHeader, { codeLabel, copyButtonHtml, localeFromPath } from './rehype-code-header.mjs';
import rehypeChapters from './rehype-chapters.mjs';
import rehypeTableScroll from './rehype-table-scroll.mjs';
import { shikiConfig as siteShiki } from './shiki-theme.mjs';
import { CODE_PALETTE } from './code-palette';
import { figcapHtml } from './figcap';

// The site's own shikiConfig (astro.config.mjs passes the same object).
const shikiConfig = { ...markdownConfigDefaults.shikiConfig, ...siteShiki };

async function render(md: string, opts: { header?: boolean; file?: string } = {}) {
  const { header = true, file = 'src/content/blog/en/post.md' } = opts;
  const processor = await createMarkdownProcessor({
    shikiConfig,
    rehypePlugins: header ? [rehypeChapters, rehypeTableScroll, rehypeCodeHeader] : [rehypeChapters, rehypeTableScroll],
  } as Parameters<typeof createMarkdownProcessor>[0]);
  return (await processor.render(md, { fileURL: pathToFileURL(resolve(file)) } as never)).code;
}

const YAML = ['Intro paragraph.', '', '```yaml', 'groups:', '  - name: api # the api group', '    rules: []', '```', ''].join('\n');

/** Every `<pre …>…</pre>` in the output, in order. */
const pres = (html: string) => html.match(/<pre\b[\s\S]*?<\/pre>/g) ?? [];

describe('rehypeCodeHeader through createMarkdownProcessor', () => {
  it('wraps a fenced block in figure.code-fig whose first child is the figure cap', async () => {
    const html = await render(YAML);
    const cap = figcapHtml({ label: 'yaml', actions: copyButtonHtml('en') });
    expect(html).toContain(`<figure class="code-fig" data-language="yaml">${cap}<pre class="astro-code opscanopy-plate"`);
    expect(html).toContain('<button type="button" class="rich-code-copy" data-code-copy="" aria-label="Copy code to clipboard">Copy</button>');
    expect(html.match(/<figure class="code-fig"/g)).toHaveLength(1);
  });

  it('moves the <pre> without changing a byte of it (code text and tokens unchanged)', async () => {
    const md = YAML + '\n```bash\nkubectl get pods -n "prod" | grep -v Running\n```\n\n```\nplain text\n```\n';
    const before = pres(await render(md, { header: false }));
    const after = pres(await render(md));
    expect(before).toHaveLength(3);
    expect(after).toEqual(before);
  });

  it('paints the plate from the code palette (no github-dark #24292e left)', async () => {
    const html = await render(YAML);
    expect(html).toContain(`background-color:${CODE_PALETTE.bg}`);
    expect(html).toContain(`color:${CODE_PALETTE.fg}`);
    expect(html.toLowerCase()).not.toContain('#24292e');
    expect(html.toLowerCase()).not.toContain('#6a737d');
    // A YAML comment is mute + italic; a key is plain fg.
    expect(html).toMatch(new RegExp(`color:${CODE_PALETTE.mute};font-style:italic"> #`, 'i'));
    expect(html).toMatch(new RegExp(`color:${CODE_PALETTE.key}">groups<`, 'i'));
    expect(html).toMatch(new RegExp(`color:${CODE_PALETTE.brand}"> api<`, 'i'));
  });

  it('labels a grammar-less fence by the name the author wrote, tokens still plain', async () => {
    const html = await render('```promql\nrate(x[5m]) > 0\n```\n');
    expect(html).toContain('<figure class="code-fig" data-language="promql">');
    expect(html).toContain('title="promql">promql</span>');
    expect(html).toContain('<span class="line"><span>rate(x[5m]) > 0</span></span>');
  });

  it('labels a fence with no language `text`', async () => {
    const html = await render('```\nhello\n```\n');
    expect(html).toContain('<figure class="code-fig" data-language="text">');
    expect(html).toContain('<span class="figcap__label" title="text">text</span>');
  });

  it('labels every block and wraps each exactly once', async () => {
    const md = '```yaml\na: 1\n```\n\n- item\n\n  ```json\n  {"a": 1}\n  ```\n\n> quote\n>\n> ```bash\n> echo hi\n> ```\n';
    const html = await render(md);
    expect(html.match(/<figure class="code-fig"/g)).toHaveLength(3);
    expect(html.match(/<pre class="astro-code/g)).toHaveLength(3);
    for (const label of ['yaml', 'json', 'bash']) expect(html).toContain(`title="${label}">${label}</span>`);
    // Nothing nests: no figure inside a figure.
    for (const chunk of html.split('<figure class="code-fig"').slice(1)) {
      expect(chunk.slice(0, chunk.indexOf('</figure>'))).not.toContain('<figure');
    }
  });

  it('leaves inline code alone', async () => {
    const html = await render('Run `kubectl get pods` now.\n');
    expect(html).toContain('<code>kubectl get pods</code>');
    expect(html).not.toContain('code-fig');
  });

  it('takes the copy label from the post locale', async () => {
    const html = await render(YAML, { file: 'src/content/blog/de/post.md' });
    expect(html).toContain('aria-label="Code in die Zwischenablage kopieren">Kopieren</button>');
    const fr = await render(YAML, { file: 'src/content/blog/fr/post.md' });
    expect(fr).toContain('>Copier</button>');
    const pt = await render(YAML, { file: 'src/content/blog/pt-br/post.md' });
    expect(pt).toContain('>Copiar</button>');
  });
});

describe('rehypeCodeHeader helpers', () => {
  it('reads the locale from a content path on either separator', () => {
    expect(localeFromPath('C:\\repo\\src\\content\\blog\\de\\x.md')).toBe('de');
    expect(localeFromPath('/repo/src/content/blog/pt-br/x.md')).toBe('pt-br');
    expect(localeFromPath('/repo/src/content/guides/linux.md')).toBe('en');
    expect(localeFromPath('/repo/src/content/mission90/day-001.md')).toBe('en');
    expect(localeFromPath(undefined)).toBe('en');
  });

  it('maps fence languages to the mono label grammar', () => {
    expect(codeLabel('YAML')).toBe('yaml');
    expect(codeLabel('plaintext')).toBe('text');
    expect(codeLabel(undefined)).toBe('text');
    expect(codeLabel('bash')).toBe('bash');
  });

  it('does not double-wrap a pre already inside figure.code-fig', () => {
    const pre = { type: 'element', tagName: 'pre', properties: { class: 'astro-code', dataLanguage: 'yaml' }, children: [] };
    const fig = { type: 'element', tagName: 'figure', properties: { className: ['code-fig'] }, children: [pre] };
    const root = { type: 'root', children: [fig] };
    (rehypeCodeHeader() as (t: unknown, f: unknown) => void)(root, { path: '/x.md' });
    expect(root.children).toEqual([fig]);
    expect(fig.children).toEqual([pre]);
  });
});
