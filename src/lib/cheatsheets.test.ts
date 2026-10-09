/**
 * Cheat sheets (`src/content/cheatsheets/*.md`) — the editorial gate.
 *
 * Zod proves a sheet is structurally valid at build; this proves it is written
 * the way the site promises: every "try it" tool and body link resolves, every
 * source is an official reference, every destructive command is marked, and
 * every jq example on the jq sheet actually runs under the jq the site ships.
 * The last block pins the rehype-chapters skip: no "Section X of Y" pager on a
 * sheet, but still one on a guide.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import yaml from 'js-yaml';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { liveTools } from '../data/tools';
import { JQ_VERSION } from '../data/versions';
import { runJq } from './jq-playground/engine';
import rehypeChapters from './rehype-chapters.mjs';

const ROOT = resolve(__dirname, '../..');
const DIR = join(ROOT, 'src/content/cheatsheets');
const GUIDES = join(ROOT, 'src/content/guides');

type Sheet = { slug: string; raw: string; fm: Record<string, unknown>; body: string };

const sheets: Sheet[] = readdirSync(DIR)
  .filter((f) => f.endsWith('.md'))
  .map((f) => {
    const raw = readFileSync(join(DIR, f), 'utf8');
    const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
    if (!m) throw new Error(`${f}: no frontmatter`);
    return { slug: f.replace(/\.md$/, ''), raw: m[1], fm: yaml.load(m[1]) as Record<string, unknown>, body: m[2] };
  });

const toolSlugs = new Set(liveTools.map((t) => t.slug));
const guideSlugs = new Set(
  readdirSync(GUIDES)
    .filter((d) => statSync(join(GUIDES, d)).isDirectory())
    .flatMap((d) => readdirSync(join(GUIDES, d)).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''))),
);
const sheetSlugs = new Set(sheets.map((s) => s.slug));

/** Official references only — a cheat sheet that cites another cheat sheet is a copy of a copy. */
const OFFICIAL_HOSTS = [
  'kubernetes.io',
  'docs.docker.com',
  'www.freedesktop.org',
  'man7.org',
  'docs.openssl.org',
  'jqlang.org',
  'git-scm.com',
];

/** Commands that delete data or state. Kept here, not in the content. */
const DESTRUCTIVE = [
  /\bkubectl (?:delete|drain)\b/,
  /\bdocker (?:rm|rmi|container rm|image rm|volume rm|network rm)\b/,
  /\bdocker (?:system|image|container|volume|network|builder) prune\b/,
  /\bdocker compose down\b[^`|]*(?:-v\b|--volumes\b)/,
  /\bsystemctl (?:mask|kill)\b/,
  /\bjournalctl --vacuum/,
  /(?:^|[\s`])rm -/,
  /\bgit (?:reset --hard|clean|push --force)\b/,
];

/** Split a body into H2 sections (text before the first H2 is its own section). */
function sections(body: string): string[] {
  return body.split(/^(?=## )/m);
}

describe('cheat sheets', () => {
  it('the batch exists', () => {
    expect([...sheetSlugs].sort()).toEqual(['docker', 'jq', 'openssl']);
  });

  for (const s of sheets) {
    describe(s.slug, () => {
      it('dates are plain YYYY-MM-DD and updated is not before published', () => {
        for (const key of ['pubDate', 'updatedDate']) {
          expect(s.raw, key).toMatch(new RegExp(`^${key}: \\d{4}-\\d{2}-\\d{2}$`, 'm'));
        }
        expect(+(s.fm.updatedDate as Date)).toBeGreaterThanOrEqual(+(s.fm.pubDate as Date));
      });

      it('relatedTools are live tool slugs', () => {
        const rel = s.fm.relatedTools as string[];
        expect(rel.length).toBeGreaterThan(0);
        for (const t of rel) expect(toolSlugs.has(t), t).toBe(true);
      });

      it('cites at least two official https sources', () => {
        const src = s.fm.sources as { title: string; url: string }[];
        expect(src.length).toBeGreaterThanOrEqual(2);
        for (const { url } of src) {
          const u = new URL(url);
          expect(u.protocol, url).toBe('https:');
          expect(OFFICIAL_HOSTS, url).toContain(u.hostname);
        }
      });

      it('every internal body link resolves to a live tool, guide or sheet', () => {
        const links = [...s.body.matchAll(/\]\((\/[^)#\s]*)/g)].map((m) => m[1]);
        expect(links.length).toBeGreaterThan(0);
        for (const href of links) {
          expect(href, 'trailing slash').toMatch(/\/$/);
          const parts = href.split('/').filter(Boolean);
          const ok =
            (parts.length === 1 && toolSlugs.has(parts[0])) ||
            (parts.length === 3 && parts[0] === 'learn' && parts[1] === 'guides' && guideSlugs.has(parts[2])) ||
            (parts[0] === 'cheatsheets' && (parts.length === 1 || sheetSlugs.has(parts[1])));
          expect(ok, href).toBe(true);
        }
      });

      it('marks every destructive command', () => {
        for (const sec of sections(s.body)) {
          if (/^> \*\*Warning:\*\*/m.test(sec)) continue;
          for (const line of sec.split('\n')) {
            if (!DESTRUCTIVE.some((re) => re.test(line))) continue;
            // A warning-type callout that names the command is itself the warning.
            const inCallout = /^> \*\*(?:Warning|Gotcha):\*\*/.test(line);
            expect(inCallout || (line.startsWith('|') && line.includes('**Destructive:**')), line).toBe(true);
          }
        }
      });
    });
  }

  describe('jq examples run under the shipped jq', () => {
    const sheet = sheets.find((s) => s.slug === 'jq')!;
    /** Inline examples that use flags the engine does not expose. Named, so a skip is a decision. */
    const SKIP = new Set([
      "jq --arg env prod '.services[] | select(.env == $env) | .name' services.json",
      "jq --argjson min 2 '.services[] | select(.replicas >= $min) | .name' services.json",
      "jq -e '.services[] | select(.name == \"api\")' services.json",
      "jq -R 'split(\",\")'",
      "jq -S '.' services.json",
      "jq -j '.services[].name' services.json",
      "jq --tab '.' services.json",
    ]);

    it('stamps the jq version the site ships', () => {
      expect(sheet.fm.verifiedWith).toBe(`jq ${JQ_VERSION}`);
    });

    const fence = /```json\n([\s\S]*?)```/.exec(sheet.body);
    const input = fence?.[1] ?? '';
    const examples = [...sheet.body.matchAll(/`(jq [^`]+)`/g)].map((m) => m[1].replace(/\\\|/g, '|'));

    it('has a sample document and a few dozen examples', () => {
      expect(() => JSON.parse(input)).not.toThrow();
      expect(examples.length).toBeGreaterThanOrEqual(25);
    });

    for (const ex of examples) {
      if (SKIP.has(ex)) continue;
      it(ex, async () => {
        const m = /^jq((?:\s+-[rcsn]+)*)\s+'([^']+)'(?:\s+[\w.-]+\.json)?$/.exec(ex);
        expect(m, `unparsed jq example (add it to SKIP if it uses an unsupported flag): ${ex}`).not.toBeNull();
        const letters = (m![1] ?? '').replace(/[\s-]/g, '');
        const r = await runJq(m![2], input, {
          rawOutput: letters.includes('r'),
          compact: letters.includes('c'),
          slurp: letters.includes('s'),
          nullInput: letters.includes('n'),
        });
        expect(r.ok ? '' : r.error, ex).toBe('');
        expect(r.ok && r.outputs.length > 0, `${ex} printed nothing`).toBe(true);
      });
    }

    it('every SKIP entry is still on the page', () => {
      for (const s of SKIP) expect(examples, s).toContain(s);
    });
  });
});

describe('rehype-chapters skips cheat sheets', () => {
  const md = ['## One', '', 'Text one.', '', '## Two', '', 'Text two.', ''].join('\n');
  async function render(file: string) {
    const processor = await createMarkdownProcessor({ rehypePlugins: [rehypeChapters] } as Parameters<
      typeof createMarkdownProcessor
    >[0]);
    return (await processor.render(md, { fileURL: pathToFileURL(resolve(file)) } as never)).code;
  }

  it('adds no chapter meta or pager to a sheet', async () => {
    const html = await render('src/content/cheatsheets/docker.md');
    expect(html).not.toContain('chapter-meta');
    expect(html).not.toContain('chapter-pager');
  });

  it('still chapters a guide', async () => {
    const html = await render('src/content/guides/docker/docker-for-devops.md');
    expect(html).toContain('chapter-meta');
  });
});
