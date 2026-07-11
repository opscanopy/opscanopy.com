/**
 * Mission 90 Days DevOps — curriculum registry. Single source of truth for the
 * /mission-90/ hub, day pages, phase navigation, and mission unlock gating.
 * Mirrors the role of src/data/tools.ts and src/data/learn.ts.
 *
 * METADATA ONLY. `blurb` is the one-line card teaser — deliberately NOT named
 * `story` (that's the game engine's briefing array). This module must never
 * import engine code from src/lib/mission-sim/.
 */
import type { ToolAccent } from './tools';

export interface Mission90Phase {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  /** Inclusive day range [first, last]. */
  days: [number, number];
  accent: ToolAccent;
}

export interface Mission90Day {
  day: number;
  slug: string;
  title: string;
  /** Phase id — must agree with phaseForDay(day). */
  phase: number;
  /** Core lesson time in minutes. */
  minutes: number;
  hasMission: boolean;
  missionId?: string;
  isProjectDay: boolean;
  /** 'draft' = content not yet authored (deliberately distinct from missions' 'planned' product state). */
  status: 'live' | 'draft';
}

export interface Mission90Mission {
  id: string;
  week: number;
  title: string;
  /** One-line card teaser. */
  blurb: string;
  unlockAfterDay: number;
  skills: string[];
  noCodeFriendly?: boolean;
  status: 'live' | 'planned';
}

export const program = {
  name: 'Mission 90 Days DevOps',
  route: '/mission-90/',
  description:
    'A free 90-day DevOps curriculum — 45–60 focused minutes a day, from your first terminal session to job-ready, with story-driven missions along the way.',
  totalDays: 90,
} as const;

export const phases: Mission90Phase[] = [
  {
    id: 1,
    slug: 'foundations',
    name: 'Foundations',
    tagline: 'Linux, the terminal, and the habits everything else builds on.',
    days: [1, 20],
    accent: 'develop',
  },
  {
    id: 2,
    slug: 'containers-cicd',
    name: 'Containers & CI/CD',
    tagline: 'Docker from first principles, then pipelines that ship it for you.',
    days: [21, 45],
    accent: 'ship',
  },
  {
    id: 3,
    slug: 'cloud',
    name: 'Cloud',
    tagline: 'AWS fundamentals — from a safe account to a deployed, monitored app.',
    days: [46, 65],
    accent: 'preview',
  },
  {
    id: 4,
    slug: 'orchestration-iac',
    name: 'Orchestration & IaC',
    tagline: 'Kubernetes to run at scale, Terraform to define it all in code.',
    days: [66, 85],
    accent: 'ship',
  },
  {
    id: 5,
    slug: 'job-ready',
    name: 'Job Ready',
    tagline: 'Turn 90 days of work into a resume, a portfolio, and interview answers.',
    days: [86, 90],
    accent: 'develop',
  },
];

function phaseIdFor(day: number): number {
  const phase = phaseForDay(day);
  if (!phase) throw new Error(`Day ${day} is outside every phase range`);
  return phase.id;
}

interface DayOpts {
  missionId?: string;
  project?: boolean;
  live?: boolean;
}

/** Compact day-row constructor — keeps the 90-entry table scannable. */
function d(day: number, slug: string, title: string, minutes: number, opts: DayOpts = {}): Mission90Day {
  return {
    day,
    slug,
    title,
    phase: phaseIdFor(day),
    minutes,
    hasMission: opts.missionId !== undefined,
    ...(opts.missionId !== undefined ? { missionId: opts.missionId } : {}),
    isProjectDay: opts.project === true,
    status: opts.live === true ? 'live' : 'draft',
  };
}

export const days: Mission90Day[] = [
  // Phase 1 — Foundations (days 1–20)
  d(1, 'what-devops-is', 'What DevOps actually is + your first terminal session', 50, { live: true }),
  d(2, 'linux-filesystem', 'The Linux filesystem: where everything lives', 50, { live: true }),
  d(3, 'navigating-managing-files', 'Navigating & managing files — pwd, ls, cd, cp, mv, rm', 45, { live: true }),
  d(4, 'reading-editing-files', 'Reading & editing files — cat, less, nano, vim survival', 45, { live: true }),
  d(5, 'users-groups-permissions', 'Users, groups & permissions — chmod, chown, octal', 55, { live: true }),
  d(6, 'processes-signals', 'Processes & signals — ps, top, kill, nice', 50, { live: true }),
  d(7, 'week-1-review-server-down', 'Week 1 review + Server Down!', 45, { missionId: 'week1-server-down', live: true }),
  d(8, 'grep-sed-awk', 'Text power tools — grep, sed & awk one-liners', 55, { live: true }),
  d(9, 'pipes-redirection-chaining', 'Pipes, redirection & command chaining', 50, { live: true }),
  d(10, 'packages-services', 'Packages & services — apt, systemd, journalctl', 55, { live: true }),
  d(11, 'networking-101', 'Networking 101 — IP, DNS, ports, curl', 55, { live: true }),
  d(12, 'networking-102', 'Networking 102 — ss, dig, ping, a troubleshooting flow', 50, { live: true }),
  d(13, 'ssh-deep-dive', 'SSH deep-dive — keys, config, scp, tunnels', 55, { live: true }),
  d(14, 'week-2-review-dns-detective', 'Week 2 review + DNS Detective', 45, { missionId: 'week2-dns-detective', live: true }),
  d(15, 'shell-scripting-1', 'Shell scripting 1 — variables, conditionals, loops', 55, { live: true }),
  d(16, 'shell-scripting-2', 'Shell scripting 2 — functions, exit codes, a real backup script', 55, { live: true }),
  d(17, 'git-for-devops', 'Git for DevOps — branching, merge vs rebase', 50, { live: true }),
  d(18, 'git-collaboration', 'Git collaboration — PRs, reviews, tags, releases', 45, { live: true }),
  d(19, 'cron-scheduled-jobs', 'Cron & scheduled jobs — crontab, systemd timers', 45, { live: true }),
  d(20, 'phase-1-review', 'Phase 1 review — Linux interview drill', 45, { live: true }),

  // Phase 2 — Containers & CI/CD (days 21–45)
  d(21, 'week-3-review-locked-file', 'Week 3 review + The Locked File', 45, { missionId: 'week3-locked-file', live: true }),
  d(22, 'containers-vs-vms', 'Containers vs VMs — what Docker actually does', 50, { live: true }),
  d(23, 'docker-fundamentals', 'Docker fundamentals — images, containers, registries', 55, { live: true }),
  d(24, 'dockerfiles', 'Dockerfiles — writing & optimizing your first image', 60, { live: true }),
  d(25, 'docker-networking', 'Docker networking & port mapping', 50, { live: true }),
  d(26, 'volumes-persistent-data', 'Volumes & persistent data', 50, { live: true }),
  d(27, 'docker-compose', 'docker compose — multi-container apps', 55, { live: true }),
  d(28, 'week-4-review-docker-rescue', 'Week 4 review + Docker Rescue', 45, { missionId: 'week4-docker-rescue', live: true }),
  d(29, 'image-best-practices', 'Image best practices — multi-stage builds, size, security', 55, { live: true }),
  d(30, 'container-debugging', 'Container debugging — logs, exec, inspect, stats', 50, { live: true }),
  d(31, 'cicd-concepts', 'CI/CD concepts — pipelines, environments, artifacts (+ Jenkins legacy aside)', 45, { live: true }),
  d(32, 'github-actions-1', 'GitHub Actions 1 — workflow anatomy, triggers', 55, { live: true }),
  d(33, 'github-actions-2', 'GitHub Actions 2 — jobs, matrices, secrets', 55, { live: true }),
  d(34, 'github-actions-3', 'GitHub Actions 3 — build & push an image to a registry', 60, { live: true }),
  d(35, 'week-5-review', 'Week 5 review — harden your pipeline', 45, { live: true }),
  d(36, 'testing-in-pipelines', 'Testing in pipelines — lint, unit tests, quality gates', 50, { live: true }),
  d(37, 'versioning-releases', 'Versioning & releases — semver, tags, changelogs', 45, { live: true }),
  d(38, 'deploy-strategies', 'Deploy strategies — rolling, blue-green, canary', 45, { live: true }),
  d(39, 'pipeline-security', 'Pipeline security — secrets management, image scanning (Trivy), supply-chain basics', 50, { live: true }),
  d(40, 'phase-2-review-broken-pipeline', 'Phase 2 review + Broken Pipeline', 45, { missionId: 'week6-broken-pipeline', live: true }),
  d(41, 'project-1-day-1', 'Project 1, Day 1: scope & scaffold', 60, { project: true, live: true }),
  d(42, 'project-1-day-2', 'Project 1, Day 2: write & optimize the Dockerfiles', 60, { project: true, live: true }),
  d(43, 'project-1-day-3', 'Project 1, Day 3: compose the full stack locally', 60, { project: true, live: true }),
  d(44, 'project-1-day-4', 'Project 1, Day 4: build the CI pipeline', 60, { project: true, live: true }),
  d(45, 'project-1-day-5', 'Project 1, Day 5: ship, tag & write the README', 60, { project: true, live: true }),

  // Phase 3 — Cloud (days 46–65)
  d(46, 'cloud-fundamentals', 'Cloud fundamentals — regions, AZs, shared responsibility', 45, { live: true }),
  d(47, 'aws-account-hygiene', 'AWS account hygiene — IAM, MFA, budgets, cost tagging', 55, { live: true }),
  d(48, 'ec2-basics', 'EC2 — launch, connect, security groups', 55, { live: true }),
  d(49, 'week-7-review-aws-bill-shock', 'Week 7 review + AWS Bill Shock', 45, { missionId: 'week7-aws-bill-shock', live: true }),
  d(50, 'vpc-1', 'VPC 1 — subnets, route tables, gateways', 55),
  d(51, 'vpc-2', 'VPC 2 — NAT, public vs private, bastion patterns', 55),
  d(52, 's3', 'S3 — buckets, policies, static hosting, lifecycle', 50),
  d(53, 'rds-managed-databases', 'RDS & managed databases', 50),
  d(54, 'load-balancers-auto-scaling', 'Load balancers & auto scaling', 55),
  d(55, 'route-53-tls-acm', 'Route 53 & TLS with ACM', 50),
  d(56, 'week-8-review-database-recovery', 'Week 8 review + Database Recovery', 45, { missionId: 'week8-database-recovery' }),
  d(57, 'cloudwatch', 'CloudWatch — metrics, logs, alarms', 50),
  d(58, 'aws-cli', 'AWS CLI & scripting cloud operations', 50),
  d(59, 'ecr-ecs-fargate', 'ECR + ECS/Fargate — containers on AWS (Go Deeper: where Lambda fits)', 60),
  d(60, 'observability-1', 'Observability 1 — Prometheus & Grafana fundamentals', 55),
  d(61, 'observability-2', 'Observability 2 — alerts, SLOs & log aggregation (Loki)', 50),
  d(62, 'project-2-day-1', 'Project 2, Day 1: plan the AWS architecture', 60, { project: true }),
  d(63, 'project-2-day-2', 'Project 2, Day 2: network & IAM groundwork', 60, { project: true }),
  d(64, 'project-2-day-3', 'Project 2, Day 3: deploy containers behind a load balancer', 60, { project: true }),
  d(65, 'project-2-day-4', 'Project 2, Day 4: DNS, TLS & monitoring', 60, { project: true }),

  // Phase 4 — Orchestration & IaC (days 66–85)
  d(66, 'why-kubernetes', 'Why Kubernetes — the problems it solves', 45),
  d(67, 'k8s-architecture-kubectl', 'K8s architecture + kubectl with kind on WSL2', 55),
  d(68, 'pods-deployments', 'Pods & Deployments', 55),
  d(69, 'k8s-services-networking', 'Services & networking in K8s', 55),
  d(70, 'configmaps-secrets', 'ConfigMaps & Secrets', 50),
  d(71, 'probes-resource-limits', 'Health probes & resource requests/limits', 50),
  d(72, 'debugging-workloads', 'Debugging workloads — describe, logs, events, crashloops', 55),
  d(73, 'week-11-review-kubernetes-chaos', 'Week 11 review + Kubernetes Chaos', 45, { missionId: 'week11-kubernetes-chaos' }),
  d(74, 'ingress', 'Ingress & exposing apps properly', 55),
  d(75, 'helm', 'Helm — charts, values, releases (Go Deeper: GitOps with Argo CD)', 55),
  d(76, 'terraform-first-apply', 'IaC concepts + Terraform first apply', 50),
  d(77, 'terraform-variables-state', 'Terraform 2 — variables, outputs, state', 55),
  d(78, 'terraform-modules-workspaces', 'Terraform 3 — modules & workspaces', 55),
  d(79, 'terraform-aws', 'Terraform + AWS — provision the project infra', 60),
  d(80, 'week-12-review-terraform-trouble', 'Week 12 review + Terraform Trouble', 45, { missionId: 'week12-terraform-trouble' }),
  d(81, 'project-3-day-1', 'Project 3, Day 1: design the capstone architecture', 60, { project: true }),
  d(82, 'project-3-day-2', 'Project 3, Day 2: write the Terraform foundation', 60, { project: true }),
  d(83, 'project-3-day-3', 'Project 3, Day 3: build the Kubernetes manifests', 60, { project: true }),
  d(84, 'project-3-day-4', 'Project 3, Day 4: Helm, ingress & TLS', 60, { project: true }),
  d(85, 'project-3-day-5', 'Project 3, Day 5: end-to-end run & writeup', 60, { project: true }),

  // Phase 5 — Job Ready (days 86–90)
  d(86, 'devops-resume', 'Your DevOps resume — turning 90 days into bullets', 50),
  d(87, 'portfolio-github-polish', 'Portfolio & GitHub polish — READMEs, diagrams, demos', 50),
  d(88, 'incident-management', 'Incident management — severity, runbooks, postmortems, error budgets', 55),
  d(89, 'interview-drill', 'Interview drill — rapid-fire across the stack + scenario walk-throughs', 55),
  d(90, 'final-boss-midnight-outage', "FINAL BOSS: The Midnight Outage + what's next", 60, { missionId: 'final-midnight-outage' }),
];

export const missions: Mission90Mission[] = [
  {
    id: 'week1-server-down',
    week: 1,
    title: 'Server Down!',
    blurb: "The web server died at 2 a.m. and you're the only one awake — find it, fix it, bring it back.",
    unlockAfterDay: 7,
    skills: ['Linux navigation', 'processes & signals', 'file permissions'],
    noCodeFriendly: true,
    status: 'live',
  },
  {
    id: 'week2-dns-detective',
    week: 2,
    title: 'DNS Detective',
    blurb: 'Users swear the site is "sometimes down" — follow the DNS trail until the story makes sense.',
    unlockAfterDay: 14,
    skills: ['DNS troubleshooting', 'dig & ping', 'curl & ss', 'SSH'],
    status: 'live',
  },
  {
    id: 'week3-locked-file',
    week: 3,
    title: 'The Locked File',
    blurb: "The deploy script won't run and nobody will admit to touching it — permissions, git and cron all have alibis.",
    unlockAfterDay: 21,
    skills: ['shell scripting', 'permissions', 'git history', 'cron'],
    status: 'live',
  },
  {
    id: 'week4-docker-rescue',
    week: 4,
    title: 'Docker Rescue',
    blurb: 'A containerized app is crash-looping on a fresh host — get the stack up without touching the source code.',
    unlockAfterDay: 28,
    skills: ['Docker CLI', 'Dockerfiles', 'docker compose', 'volumes & networking'],
    status: 'live',
  },
  {
    id: 'week6-broken-pipeline',
    week: 6,
    title: 'Broken Pipeline',
    blurb: 'The release pipeline went red on Friday afternoon — trace the failure through secrets, matrices and a bad tag.',
    unlockAfterDay: 40,
    skills: ['GitHub Actions', 'pipeline debugging', 'secrets management', 'releases & tags'],
    status: 'live',
  },
  {
    id: 'week7-aws-bill-shock',
    week: 7,
    title: 'AWS Bill Shock',
    blurb: "The monthly AWS bill just tripled — hunt down what's burning money before finance hunts you.",
    unlockAfterDay: 49,
    skills: ['IAM & account hygiene', 'EC2', 'cost analysis'],
    status: 'live',
  },
  {
    id: 'week8-database-recovery',
    week: 8,
    title: 'Database Recovery',
    blurb: 'Someone dropped a production table — you have RDS snapshots, a tense hour, and no room for a second mistake.',
    unlockAfterDay: 56,
    skills: ['RDS', 'backups & snapshots', 'VPC access patterns'],
    status: 'planned',
  },
  {
    id: 'week11-kubernetes-chaos',
    week: 11,
    title: 'Kubernetes Chaos',
    blurb: 'Half the pods are Pending, the rest are CrashLoopBackOff — read the events and restore order.',
    unlockAfterDay: 73,
    skills: ['kubectl debugging', 'Deployments & Services', 'probes & resource limits', 'ConfigMaps & Secrets'],
    status: 'planned',
  },
  {
    id: 'week12-terraform-trouble',
    week: 12,
    title: 'Terraform Trouble',
    blurb: 'A teammate ran apply from their laptop and now state disagrees with reality — reconcile it without breaking prod.',
    unlockAfterDay: 80,
    skills: ['Terraform state', 'modules & workspaces', 'plan/apply discipline'],
    status: 'planned',
  },
  {
    id: 'final-midnight-outage',
    week: 13,
    title: 'The Midnight Outage',
    blurb: "Everything you've learned, one pager at midnight — a full-stack outage across DNS, containers, K8s and AWS.",
    unlockAfterDay: 90,
    skills: ['incident response', 'full-stack debugging', 'Kubernetes', 'AWS'],
    status: 'planned',
  },
];

/** Days that have shipped — drives hub progress and day-page listings. */
export const liveDays = days.filter((day) => day.status === 'live');

export function getDay(n: number): Mission90Day | undefined {
  return days.find((day) => day.day === n);
}

export function phaseForDay(n: number): Mission90Phase | undefined {
  return phases.find((p) => n >= p.days[0] && n <= p.days[1]);
}

/**
 * Sum of all 90 day minutes — single source for the hub "~80 hrs core"
 * caption and the courseLd workload field.
 */
export const totalCoreMinutes = days.reduce((sum, day) => sum + day.minutes, 0);
