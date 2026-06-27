/**
 * Learn registry — single source of truth for the /learn hub grid, the Learn
 * nav, and guide↔roadmap cross-links. Mirrors the role of src/data/tools.ts.
 */
import type { ToolAccent } from './tools';

export interface Track {
  slug: string;
  name: string;
  tagline: string;
  accent: ToolAccent;
  roadmapSlug?: string;
  guideSlugs: string[];
}

export const tracks: Track[] = [
  {
    slug: 'linux',
    name: 'Linux',
    tagline: 'The OS every DevOps career stands on.',
    accent: 'develop',
    roadmapSlug: 'linux',
    guideSlugs: ['linux-for-devops'],
  },
  {
    slug: 'docker',
    name: 'Docker',
    tagline: 'Build, ship, and run containers with confidence.',
    accent: 'ship',
    roadmapSlug: undefined,
    guideSlugs: ['docker-for-devops', 'docker-interview-questions'],
  },
  {
    slug: 'kubernetes',
    name: 'Kubernetes',
    tagline: 'Orchestrate containers at scale.',
    accent: 'preview',
    roadmapSlug: undefined,
    guideSlugs: ['kubernetes-for-devops'],
  },
  {
    slug: 'aws',
    name: 'AWS',
    tagline: 'The core cloud services a DevOps engineer actually needs.',
    accent: 'ship',
    roadmapSlug: undefined,
    guideSlugs: ['aws-for-devops-engineers'],
  },
  {
    slug: 'networking',
    name: 'Networking',
    tagline: 'TCP/IP, subnets, DNS, and troubleshooting for engineers.',
    accent: 'develop',
    roadmapSlug: undefined,
    guideSlugs: ['networking-for-devops'],
  },
  {
    slug: 'projects',
    name: 'Hands-on Projects',
    tagline: 'Portfolio-ready, step-by-step DevOps projects.',
    accent: 'preview',
    roadmapSlug: undefined,
    guideSlugs: ['devops-projects'],
  },
];

export function getTrack(slug: string): Track | undefined {
  return tracks.find((t) => t.slug === slug);
}
