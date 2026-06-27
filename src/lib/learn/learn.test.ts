import { describe, it, expect } from 'vitest';
import { tracks } from '../../data/learn';
import { roadmaps } from '../../data/roadmaps';
import { tools } from '../../data/tools';

const toolSlugs = new Set(tools.map((t) => t.slug));
const trackSlugs = new Set(tracks.map((t) => t.slug));

describe('learn registry ↔ roadmaps integrity', () => {
  it('every roadmap.track (except devops) maps to a registry track', () => {
    for (const r of roadmaps) {
      if (r.track === 'devops') continue;
      expect(trackSlugs.has(r.track), `roadmap "${r.slug}" → unknown track "${r.track}"`).toBe(true);
    }
  });

  it('every track.roadmapSlug points to an existing roadmap', () => {
    const roadmapSlugs = new Set(roadmaps.map((r) => r.slug));
    for (const t of tracks) {
      if (!t.roadmapSlug) continue;
      expect(roadmapSlugs.has(t.roadmapSlug), `track "${t.slug}" → missing roadmap "${t.roadmapSlug}"`).toBe(true);
    }
  });

  it('every roadmap node has a target (guideSlug or href) and a valid kind', () => {
    for (const r of roadmaps) {
      for (const s of r.stages) {
        for (const n of s.nodes) {
          expect(Boolean(n.guideSlug || n.href), `node "${n.label}" in "${r.slug}" has no target`).toBe(true);
          expect(['core', 'optional']).toContain(n.kind);
        }
      }
    }
  });

  it('every node href that is a tool path resolves to a real tool', () => {
    for (const r of roadmaps) {
      for (const s of r.stages) {
        for (const n of s.nodes) {
          if (n.href && n.href.startsWith('/') && !n.href.startsWith('/learn')) {
            const slug = n.href.slice(1);
            expect(toolSlugs.has(slug), `node "${n.label}" → unknown tool "${slug}"`).toBe(true);
          }
        }
      }
    }
  });
});
