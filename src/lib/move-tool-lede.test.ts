/**
 * Batch D codemod — `scripts/codemods/move-tool-lede.mjs` over fixture strings.
 *
 * The transform ran once over the 195 tool pages; this pins what it did and
 * what it refuses, so a re-run on a drifted page fails loudly instead of
 * half-migrating it. The real-tree invariants (195 files, one lead removed and
 * one lede inserted per file, identical collapsed text) are asserted by the
 * CLI itself; here the fixture is a miniature tool page with every construct
 * the pass touches, in CRLF like the tree.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { transformToolPage, registrySlugs, EXPECTED_FILES } from '../../scripts/codemods/move-tool-lede.mjs';
import { findBlocks, blockById, directChildren, textContent, collapseWs } from '../../scripts/html-block.mjs';
import { tools } from '../data/tools';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

const LF_FIXTURE = `---
import Shell from '../components/Shell.astro';
import Button from '../components/Button.astro';
import CodeBlock from '../components/CodeBlock.astro';
import ToolHero from '../components/ToolHero.astro';
import FaqList from '../components/FaqList.astro';
import ToolCrossLinks from '../components/ToolCrossLinks.astro';
const faqs = [];
---

<Shell title="x">
  <ToolHero
    slug="subnet-calculator"
    eyebrow="Subnet Calculator · Networking"
    badges={[{ label: 'No signup', variant: 'neutral' }]}
  >
    <Fragment slot="headline">Subnet any IPv4 or IPv6 block at a glance.</Fragment>
    <Fragment slot="lead">
      Enter any IPv4 or IPv6 address with a CIDR prefix like
      <span class="code-mono text-ink" translate="no">192.168.1.0/24</span> — or an address plus
      netmask — to get the network address &amp; broadcast address.
    </Fragment>
  </ToolHero>

  <section id="playground" class="scroll-mt-24 bg-canvas-soft pb-20 pt-8 sm:pb-24">
    <div class="container-page">
      <h2 class="sr-only">Subnet Calculator playground</h2>
      <SubnetCalculatorPlayground />
      <SubnetVerifyPanel />
    </div>
  </section>

  <section id="why" class="scroll-mt-24 border-t border-hairline bg-canvas">
    <div class="container-page py-16 sm:py-20">
      <div class="mx-auto grid max-w-5xl gap-10 lg:grid-cols-2">
        <p class="body-md text-pretty text-body">Why.</p>
      </div>
    </div>
  </section>

  <section id="reference" class="scroll-mt-24 border-t border-hairline bg-canvas">
    <div class="container-page py-16 sm:py-20">
      <div class="mx-auto max-w-2xl text-center">
        <p class="eyebrow">Prefix Reference</p>
        <p class="body-md mx-auto mt-3 max-w-xl text-pretty text-body">Each bit halves the block.</p>
      </div>
      <div class="mx-auto mt-10 grid max-w-5xl gap-8 lg:grid-cols-2">
        <CodeBlock lang="text" filename="ipv4-prefixes" code={prefixTable} />
        <CodeBlock
          lang="text"
          filename="ipv6-48"
          code={ipv6Example}
        />
        {rules.map((rule) => (
          <div class={'rule rule--' + rule.id}><p>Don't do this</p><CodeBlock lang="dockerfile" code={rule.bad} /></div>
        ))}
      </div>
      <p class="caption mx-auto mt-6 max-w-3xl text-center text-pretty text-mute">Centred caption.</p>
      <div class="mx-auto"><span class="mx-auto max-w-xs">not a measure on the child</span></div>
    </div>
  </section>

  <section id="next" class="scroll-mt-24 bg-inverse text-inverse-fg">
    <div class="container-page py-16 sm:py-20">
      <div class="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-2">
        <div class="mt-7 flex flex-wrap items-center gap-3">
          <Button href="/cidr-checker/" variant="secondary">Open the CIDR Checker</Button>
          <Button href="/subnet-splitter/">Open the Splitter</Button>
        </div>
        <CodeBlock lang="text" filename="aggregate.txt" code={agg} />
      </div>
    </div>
  </section>

  <FaqList faqs={faqs} />

  <div class="container-page py-4">
    <p class="body-sm text-mute">New to this? Read our guide.</p>
  </div>

  <ToolCrossLinks slug="subnet-calculator">
    <Fragment slot="lead">
      The Subnet Calculator is one tool in OpsCanopy.
    </Fragment>
  </ToolCrossLinks>
</Shell>
`;
const FIXTURE = LF_FIXTURE.replace(/\n/g, '\r\n');

const run = (src: string, figNo = '07') => transformToolPage(src, { figNo });

describe('move-tool-lede codemod — the pass over one page', () => {
  const { out, stats, lede } = run(FIXTURE);

  it('reports one lead removed, one lede inserted, one import, one FaqList', () => {
    expect(stats).toMatchObject({ leadRemoved: 1, ledeInserted: 1, importAdded: 1, faq: 1 });
  });

  it('moves the hero lead verbatim (collapsed text identical, line breaks kept) and leaves the ToolCrossLinks lead alone', () => {
    const heroes = findBlocks(out, (t: { name: string }) => t.name === 'ToolHero');
    expect(heroes.length).toBe(1);
    expect(heroes[0].inner).not.toContain('slot="lead"');
    expect(heroes[0].inner).toContain('<Fragment slot="headline">');
    const ledes = findBlocks(out, (t: { name: string }) => t.name === 'ToolLede');
    expect(ledes.length).toBe(1);
    expect(collapseWs(textContent(ledes[0].inner))).toBe(lede);
    expect(lede).toBe(
      'Enter any IPv4 or IPv6 address with a CIDR prefix like 192.168.1.0/24 — or an address plus netmask — to get the network address & broadcast address.',
    );
    // The `like\n<span class="code-mono` break survives (check-inline-whitespace hard-fails `like<span`).
    expect(ledes[0].inner).toMatch(/prefix like\r\n\s+<span class="code-mono/);
    expect(ledes[0].inner.split('\r\n').length).toBe(5);
    expect((out.match(/slot="lead"/g) ?? []).length).toBe(1);
    expect(out).toContain('The Subnet Calculator is one tool in OpsCanopy.');
  });

  it('inserts <ToolLede> as the LAST child of #playground .container-page, after the VerifyPanel, re-indented to that level', () => {
    const pg = blockById(out, 'playground');
    expect(pg).not.toBeNull();
    const cp = findBlocks(pg!.inner, (t: { attrs: string }) => /container-page/.test(t.attrs))[0];
    const kids = directChildren(cp.inner).map((k: { name: string }) => k.name);
    expect(kids).toEqual(['h2', 'SubnetCalculatorPlayground', 'SubnetVerifyPanel', 'ToolLede']);
    expect(out).toContain('\r\n      <SubnetVerifyPanel />\r\n      <ToolLede>\r\n        Enter any IPv4');
    expect(out).toContain('\r\n      </ToolLede>\r\n    </div>\r\n  </section>');
  });

  it('adds the ToolLede import right after the ToolHero import', () => {
    expect(out).toContain("import ToolHero from '../components/ToolHero.astro';\r\nimport ToolLede from '../components/ToolLede.astro';\r\n");
  });

  it('puts the section wrappers on the rail: direct children of container-page lose mx-auto (with a measure) and text-center; a centred measure inside them loses mx-auto', () => {
    expect(out).toContain('<div class="grid max-w-5xl gap-10 lg:grid-cols-2">');
    expect(out).toContain('<div class="max-w-2xl">');
    expect(out).toContain('<p class="body-md mt-3 max-w-xl text-pretty text-body">Each bit halves the block.</p>');
    expect(out).toContain('<div class="mt-10 grid max-w-5xl gap-8 lg:grid-cols-2">');
    expect(out).toContain('<p class="caption mt-6 max-w-3xl text-pretty text-mute">Centred caption.</p>');
    expect(out).toContain('<div class="grid max-w-5xl items-center gap-10 lg:grid-cols-2">');
    // mx-auto without a measure on the child is not a centred measure — untouched, and so is its descendant.
    expect(out).toContain('<div class="mx-auto"><span class="mx-auto max-w-xs">');
    expect(out).toContain('<div class="container-page py-16 sm:py-20">');
    expect(stats.railChildren).toBe(5);
    expect(stats.railDescendants).toBe(1);
  });

  it('flips every <Button> inside a bg-inverse section to variant="inverse", anchor text unchanged', () => {
    expect(out).toContain('<Button href="/cidr-checker/" variant="inverse">Open the CIDR Checker</Button>');
    expect(out).toContain('<Button variant="inverse" href="/subnet-splitter/">Open the Splitter</Button>');
    expect(stats.buttons).toBe(2);
  });

  it('numbers the reference CodeBlocks fig="NN.k" in order, and only those', () => {
    expect(out).toContain('<CodeBlock fig="07.1" lang="text" filename="ipv4-prefixes" code={prefixTable} />');
    expect(out).toContain('<CodeBlock fig="07.2"\r\n          lang="text"\r\n          filename="ipv6-48"');
    expect(out).toContain('<CodeBlock lang="text" filename="aggregate.txt" code={agg} />');
    expect(stats.figs).toBe(2);
  });

  it('leaves a CodeBlock inside a .map() unnumbered (a literal fig would repeat once per item)', () => {
    expect(out).toContain('<p>Don\'t do this</p><CodeBlock lang="dockerfile" code={rule.bad} />');
    expect(stats.figsSkippedInExpr).toBe(1);
  });

  it('passes align="left" to the FaqList', () => {
    expect(out).toContain('<FaqList faqs={faqs} align="left" />');
  });

  it('preserves CRLF throughout and changes nothing else', () => {
    expect(out).not.toMatch(/[^\r]\n/);
    // Reverse the known edits and the page is byte-identical to the input.
    const undone = out
      .replace("import ToolLede from '../components/ToolLede.astro';\r\n", '')
      .replace(/      <ToolLede>\r\n[\s\S]*?      <\/ToolLede>\r\n/, '')
      .replace('<Fragment slot="headline">Subnet any IPv4 or IPv6 block at a glance.</Fragment>\r\n', '<Fragment slot="headline">Subnet any IPv4 or IPv6 block at a glance.</Fragment>\r\n' + FIXTURE.match(/    <Fragment slot="lead">\r\n[\s\S]*?    <\/Fragment>\r\n/)![0])
      .replace('<div class="grid max-w-5xl gap-10 lg:grid-cols-2">', '<div class="mx-auto grid max-w-5xl gap-10 lg:grid-cols-2">')
      .replace('<div class="max-w-2xl">', '<div class="mx-auto max-w-2xl text-center">')
      .replace('<p class="body-md mt-3 max-w-xl', '<p class="body-md mx-auto mt-3 max-w-xl')
      .replace('<div class="mt-10 grid max-w-5xl', '<div class="mx-auto mt-10 grid max-w-5xl')
      .replace('<p class="caption mt-6 max-w-3xl text-pretty', '<p class="caption mx-auto mt-6 max-w-3xl text-center text-pretty')
      .replace('<div class="grid max-w-5xl items-center', '<div class="mx-auto grid max-w-5xl items-center')
      .replace('variant="inverse">Open the CIDR', 'variant="secondary">Open the CIDR')
      .replace('<Button variant="inverse" href="/subnet-splitter/">', '<Button href="/subnet-splitter/">')
      .replace('<CodeBlock fig="07.1" ', '<CodeBlock ')
      .replace('<CodeBlock fig="07.2"\r\n', '<CodeBlock\r\n')
      .replace(' align="left" />', ' />');
    expect(undone).toBe(FIXTURE);
  });

  it('works on an LF file too, emitting LF', () => {
    const r = run(LF_FIXTURE);
    expect(r.out).not.toContain('\r');
    expect(r.out).toContain('\n      <ToolLede>\n        Enter any IPv4');
    expect(r.lede).toBe(lede);
  });
});

describe('move-tool-lede codemod — refusals', () => {
  it('a page without a lead inside <ToolHero>', () => {
    const s = FIXTURE.replace(/    <Fragment slot="lead">\r\n[\s\S]*?    <\/Fragment>\r\n/, '');
    expect(() => run(s)).toThrow(/exactly one <Fragment slot="lead"> inside <ToolHero>, found 0/);
  });

  it('two leads inside <ToolHero>', () => {
    const s = FIXTURE.replace('    <Fragment slot="headline">', '    <Fragment slot="lead">\r\n      dup\r\n    </Fragment>\r\n    <Fragment slot="headline">');
    expect(() => run(s)).toThrow(/found 2/);
  });

  it('a page already migrated (ToolLede imported) or a CodeBlock that already carries fig=', () => {
    const migrated = run(FIXTURE).out;
    expect(() => run(migrated)).toThrow(/found 0|already/);
    const figged = FIXTURE.replace('<CodeBlock lang="text" filename="ipv4-prefixes"', '<CodeBlock fig="01.1" lang="text" filename="ipv4-prefixes"');
    expect(() => run(figged)).toThrow(/already has fig=/);
  });

  it('no #playground, or a #playground without exactly one .container-page', () => {
    expect(() => run(FIXTURE.replace('id="playground"', 'id="play"'))).toThrow(/no <section id="playground">/);
    expect(() => run(FIXTURE.replace('<div class="container-page">\r\n      <h2 class="sr-only">', '<div class="container-page">\r\n      <div class="container-page"></div>\r\n      <h2 class="sr-only">'))).toThrow(/exactly one \.container-page inside #playground, found 2/);
  });

  it('a lead that shares its line with other markup, or a one-line lead', () => {
    expect(() => run(FIXTURE.replace('<Fragment slot="lead">\r\n      Enter', '<Fragment slot="lead">Enter'))).toThrow(/multi-line/);
    expect(() => run(FIXTURE.replace('    <Fragment slot="lead">\r\n', '    <span></span><Fragment slot="lead">\r\n'))).toThrow(/does not start its line/);
  });

  it('a rail candidate using class:list must be migrated by hand', () => {
    const s = FIXTURE.replace('<div class="mx-auto grid max-w-5xl gap-10 lg:grid-cols-2">', `<div class:list={['mx-auto grid max-w-5xl gap-10 lg:grid-cols-2']}>`);
    expect(() => run(s)).toThrow(/class:list/);
  });

  it('exactly one <FaqList faqs={faqs} />', () => {
    expect(() => run(FIXTURE.replace('<FaqList faqs={faqs} />', '<FaqList id="faq" faqs={faqs} />'))).toThrow(/exactly one <FaqList/);
  });
});

describe('move-tool-lede codemod — registry', () => {
  it('parses the registry slugs in array order, matching the real export', () => {
    const slugs = registrySlugs(readFileSync(join(ROOT, 'src/data/tools.ts'), 'utf8'));
    expect(slugs).toEqual(tools.map((t) => t.slug));
    expect(String(slugs.indexOf('subnet-calculator') + 1).padStart(2, '0')).toBe('10');
  });

  it('expects 39 tools × 5 locales', () => {
    expect(EXPECTED_FILES).toBe(195);
    expect(tools.filter((t) => t.status === 'live').length * 5).toBe(EXPECTED_FILES);
  });
});
