/**
 * Learn roadmaps — typed data driving every /learn/roadmaps/<slug> page.
 * A roadmap is a vertical staged track: ordered stages, each with nodes that
 * deep-link into a guide (guideSlug [+ anchor]) or an external/tool href.
 * Single source of truth; Roadmap.astro renders it, check-learn.mjs validates it.
 */
export type NodeKind = 'core' | 'optional';

export interface RoadmapNode {
  label: string;
  guideSlug?: string;
  anchor?: string;
  href?: string;
  kind: NodeKind;
  desc?: string;
}

export interface RoadmapStage {
  title: string;
  summary?: string;
  nodes: RoadmapNode[];
}

export interface Roadmap {
  slug: string;
  track: string;
  title: string;
  description: string;
  stages: RoadmapStage[];
}

export const roadmaps: Roadmap[] = [
  {
    slug: 'linux',
    track: 'linux',
    title: 'Linux for DevOps Roadmap',
    description:
      'A staged path through the Linux skills DevOps engineers use daily — from the filesystem to bash automation.',
    stages: [
      {
        title: 'Foundations',
        summary: 'Get comfortable moving around a Linux system.',
        nodes: [
          { label: 'Filesystem hierarchy', guideSlug: 'linux-for-devops', anchor: 'linux-filesystem-hierarchy', kind: 'core', desc: 'Where things live: /etc, /var, /proc and friends.' },
          { label: 'File & directory operations', guideSlug: 'linux-for-devops', anchor: 'file-directory-operations', kind: 'core' },
          { label: 'File permissions & ownership', guideSlug: 'linux-for-devops', anchor: 'file-permissions-ownership', kind: 'core', desc: 'chmod, chown, and the octal model.' },
        ],
      },
      {
        title: 'Text processing',
        summary: 'The log-wrangling toolkit.',
        nodes: [
          { label: 'grep — pattern searching', guideSlug: 'linux-for-devops', anchor: 'grep-pattern-searching', kind: 'core' },
          { label: 'awk & sed', guideSlug: 'linux-for-devops', anchor: 'awk-text-processing-powerhouse', kind: 'core' },
          { label: 'Piping & redirection', guideSlug: 'linux-for-devops', anchor: 'piping-redirection', kind: 'core' },
          { label: 'Test regexes first', href: '/regex-log-tester', kind: 'optional', desc: 'Build the pattern in the browser before you grep.' },
        ],
      },
      {
        title: 'Processes & services',
        nodes: [
          { label: 'Process commands', guideSlug: 'linux-for-devops', anchor: 'process-commands', kind: 'core' },
          { label: 'systemd & services', guideSlug: 'linux-for-devops', anchor: 'systemd-services', kind: 'core' },
          { label: 'Package managers', guideSlug: 'linux-for-devops', anchor: 'package-managers', kind: 'optional' },
        ],
      },
      {
        title: 'Networking & SSH',
        nodes: [
          { label: 'Network commands', guideSlug: 'linux-for-devops', anchor: 'network-commands', kind: 'core' },
          { label: 'SSH — secure shell', guideSlug: 'linux-for-devops', anchor: 'ssh-secure-shell-critical', kind: 'core' },
          { label: 'Networking deep dive', guideSlug: 'networking-for-devops', kind: 'optional', desc: 'Continue into the Networking guide.' },
        ],
      },
      {
        title: 'Automation',
        nodes: [
          { label: 'Bash fundamentals', guideSlug: 'linux-for-devops', anchor: 'bash-fundamentals', kind: 'core' },
          { label: 'Bash control flow', guideSlug: 'linux-for-devops', anchor: 'bash-control-flow', kind: 'core' },
          { label: 'Real DevOps bash scripts', guideSlug: 'linux-for-devops', anchor: 'real-devops-bash-scripts', kind: 'core' },
        ],
      },
    ],
  },
];

export function getRoadmap(slug: string): Roadmap | undefined {
  return roadmaps.find((r) => r.slug === slug);
}
