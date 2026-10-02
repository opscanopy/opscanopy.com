import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { blogKind, blogCategory, incidentNumbers, kindToken, INCIDENT_REGISTRY, type BlogKind } from './blog-kind';
import { getTool, categoryHue } from '../data/tools';

const ROOT = process.cwd();
const EN = join(ROOT, 'src/content/blog/en');
const PUBLIC_BLOG = join(ROOT, 'public/blog');

function frontmatter(file: string): Record<string, any> {
  const src = readFileSync(join(EN, file), 'utf8');
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) throw new Error(`${file}: no frontmatter`);
  return yaml.load(m[1]) as Record<string, any>;
}

const posts = readdirSync(EN)
  .filter((f) => f.endsWith('.md'))
  .sort()
  .map((f) => {
    const d = frontmatter(f);
    return {
      slug: f.replace(/\.md$/, ''),
      title: String(d.title),
      pubDate: d.pubDate instanceof Date ? d.pubDate : new Date(String(d.pubDate)),
      kind: d.kind as BlogKind | undefined,
      category: blogCategory(d.relatedTool?.href, d.tags, (s) => getTool(s)?.category),
    };
  });

describe('blogKind', () => {
  it('derives incident from a symptom / error-string slug, note otherwise', () => {
    expect(blogKind('debug-anything')).toBe('incident');
    expect(blogKind('kubernetes-oomkilled-exit-code-137')).toBe('incident');
    expect(blogKind('reading-promql')).toBe('note');
  });
  it('lets explicit frontmatter win', () => {
    expect(blogKind('reading-promql', 'incident')).toBe('incident');
    expect(blogKind('debug-anything', 'guide')).toBe('guide');
  });
  // Pins today's classification so a slug rename or a marker edit that flips
  // a published cover's caption shows up as a failing test, not a silent change.
  it('classifies the shipped posts as reviewed on 2026-10-02', () => {
    const incidents = posts.filter((p) => blogKind(p.slug, p.kind) === 'incident').map((p) => p.slug);
    expect(incidents).toEqual([
      'debug-alertmanager-routing',
      'debug-prometheus-relabeling',
      'docker-build-failed-to-solve-exit-code-1',
      'github-actions-if-condition-always-true',
      'github-actions-workflow-not-triggering-filters',
      'grafana-datasource-was-not-found',
      'kubernetes-oomkilled-exit-code-137',
      'kubernetes-service-has-no-endpoints',
      'terraform-forces-replacement',
      'unable-to-get-local-issuer-certificate',
      'x509-certificate-signed-by-unknown-authority',
    ]);
  });
});

describe('incidentNumbers', () => {
  it('numbers by registry position, from 01, ignoring pubDate', () => {
    const n = incidentNumbers(
      [
        { slug: 'debug-b', pubDate: '2026-01-01' },
        { slug: 'debug-a', pubDate: '2026-03-01' },
        { slug: 'reading-notes', pubDate: '2025-01-01' },
      ],
      ['debug-a', 'debug-b'],
    );
    expect([...n]).toEqual([
      ['debug-b', '02'],
      ['debug-a', '01'],
    ]);
  });

  // The scheduled-post bug: an incident written AFTER a scheduled one but
  // published BEFORE it must take the next number, not the scheduled post's.
  it('keeps every shipped number when a later-committed incident has an earlier pubDate', () => {
    const before = incidentNumbers(posts);
    const latecomer = { slug: 'debug-latecomer', pubDate: new Date('2026-06-01') };
    const after = incidentNumbers([...posts, latecomer], [...INCIDENT_REGISTRY, latecomer.slug]);
    for (const [slug, n] of before) expect(after.get(slug), slug).toBe(n);
    expect(after.get('debug-latecomer')).toBe(String(INCIDENT_REGISTRY.length + 1).padStart(2, '0'));
  });

  it('throws on an incident the registry does not list, and on a duplicate entry', () => {
    expect(() => incidentNumbers([{ slug: 'debug-new' }], [])).toThrow(/not in INCIDENT_REGISTRY/);
    expect(() => incidentNumbers([], ['debug-a', 'debug-a'])).toThrow(/listed twice/);
  });

  // Append-only: this list may only ever grow at the end. Editing an existing
  // line renumbers a cover that is already in people's feeds.
  it('pins the registry as of 2026-10-02', () => {
    expect(INCIDENT_REGISTRY.slice(0, 11)).toEqual([
      'github-actions-if-condition-always-true',
      'github-actions-workflow-not-triggering-filters',
      'debug-prometheus-relabeling',
      'debug-alertmanager-routing',
      'docker-build-failed-to-solve-exit-code-1',
      'kubernetes-oomkilled-exit-code-137',
      'x509-certificate-signed-by-unknown-authority',
      'unable-to-get-local-issuer-certificate',
      'terraform-forces-replacement',
      'kubernetes-service-has-no-endpoints',
      'grafana-datasource-was-not-found',
    ]);
  });

  it('every registered slug that is still a post is still an incident', () => {
    const bySlug = new Map(posts.map((p) => [p.slug, p]));
    for (const slug of INCIDENT_REGISTRY) {
      const p = bySlug.get(slug);
      if (p) expect(blogKind(p.slug, p.kind), slug).toBe('incident');
    }
  });

  it('never yields an empty token', () => {
    const n = incidentNumbers(posts);
    for (const p of posts) {
      const kind = blogKind(p.slug, p.kind);
      expect(kindToken(p.slug, kind, n)).toMatch(kind === 'incident' ? /^IR-\d{2}$/ : /^note$/);
    }
    expect(() => kindToken('debug-x', 'incident', new Map())).toThrow();
  });
});

describe('blogCategory', () => {
  it('uses the related tool, then tags, then guide', () => {
    expect(blogCategory('/subnet-calculator', [], (s) => getTool(s)?.category)).toBe('Networking');
    expect(blogCategory('/mission-90/', ['kubernetes'], (s) => getTool(s)?.category)).toBe('Kubernetes');
    expect(blogCategory(undefined, ['career'], (s) => getTool(s)?.category)).toBe('guide');
  });
  it('resolves every shipped post to a registry category or guide', () => {
    for (const p of posts) expect(p.category === 'guide' || p.category in categoryHue, p.slug).toBe(true);
  });
});

// The covers are generated (npm run gen:heroes); these pin the invariants that
// make them safe to serve: outlined text only, small, the post's own title.
describe('blog cover SVGs', () => {
  const covers = readdirSync(PUBLIC_BLOG).filter((f) => f.endsWith('-hero.svg'));
  it('one cover per English post', () => {
    expect(covers.map((f) => f.replace(/-hero\.svg$/, '')).sort()).toEqual(posts.map((p) => p.slug));
  });
  for (const f of covers) {
    it(`${f}: outlined text, ≤ 40 KB, labelled`, () => {
      const svg = readFileSync(join(PUBLIC_BLOG, f), 'utf8');
      expect(svg).not.toMatch(/<text\b/);
      expect(svg).not.toMatch(/font-family/);
      expect(Buffer.byteLength(svg)).toBeLessThanOrEqual(40 * 1024);
      expect(svg).toMatch(/^<svg [^>]*role="img" aria-label="[^"]+"/);
    });
  }
});
