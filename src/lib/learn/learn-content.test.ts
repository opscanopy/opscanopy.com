/**
 * Content cross-reference checks against the actual guide files. Tolerant of
 * not-yet-authored guides (skips a guideSlug with no file) so the suite stays
 * green during incremental content authoring; catches anchor drift once a guide
 * exists. github-slugger mirrors Astro's heading-id generation.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import GithubSlugger from 'github-slugger';
import { roadmaps } from '../../data/roadmaps';

const GUIDES_DIR = 'src/content/guides';

function loadGuideHeadings(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  if (!existsSync(GUIDES_DIR)) return map;
  for (const trackDir of readdirSync(GUIDES_DIR, { withFileTypes: true })) {
    if (!trackDir.isDirectory()) continue;
    for (const file of readdirSync(join(GUIDES_DIR, trackDir.name))) {
      if (!file.endsWith('.md') || file.startsWith('_')) continue;
      const slug = file.replace(/\.md$/, '');
      const raw = readFileSync(join(GUIDES_DIR, trackDir.name, file), 'utf8');
      const body = raw.replace(/^---[\s\S]*?---/, '');
      const slugger = new GithubSlugger();
      const headings = new Set<string>();
      for (const m of body.matchAll(/^#{2,3}\s+(.+?)\s*$/gm)) {
        headings.add(slugger.slug(m[1].trim()));
      }
      map.set(slug, headings);
    }
  }
  return map;
}

const guideHeadings = loadGuideHeadings();

describe('learn content cross-references', () => {
  it('every roadmap node anchor resolves to a heading in its (existing) guide', () => {
    for (const r of roadmaps) {
      for (const s of r.stages) {
        for (const n of s.nodes) {
          if (!n.guideSlug || !n.anchor) continue;
          const headings = guideHeadings.get(n.guideSlug);
          if (!headings) continue; // guide not authored yet — tolerated
          expect(
            headings.has(n.anchor),
            `roadmap "${r.slug}" node "${n.label}" → "#${n.anchor}" not found in ${n.guideSlug}.md`,
          ).toBe(true);
        }
      }
    }
  });
});
