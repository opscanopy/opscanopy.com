/**
 * Learn roadmaps — typed data driving every /learn/roadmaps/<slug> page.
 * A roadmap is a vertical staged track: ordered stages, each with nodes that
 * deep-link into a guide (guideSlug [+ anchor]) or an external/tool href.
 * Single source of truth; Roadmap.astro renders it, check-learn.mjs validates it.
 */
export type NodeKind = 'core' | 'optional';

export interface RoadmapNode {
  label: string;
  /** Slug of a guide in src/content/guides (filename without .md). */
  guideSlug?: string;
  /** github-slugger id of an H2/H3 within that guide (optional deep-link). */
  anchor?: string;
  /** External or tool href used instead of a guide link. */
  href?: string;
  kind: NodeKind;
  /** Short description shown in the node drawer. */
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
  // ─── Docker ────────────────────────────────────────────────────────────────
  {
    slug: 'docker',
    track: 'docker',
    title: 'Docker for DevOps Roadmap',
    description:
      'From containers vs VMs all the way to CI/CD registries — the full Docker path a practising DevOps engineer needs.',
    stages: [
      {
        title: 'Foundations',
        summary: 'Understand why containers exist and how Docker fits in.',
        nodes: [
          { label: 'Containers vs Virtual Machines', guideSlug: 'docker-for-devops', anchor: 'containers-vs-virtual-machines', kind: 'core', desc: 'Why containers won the infra argument.' },
          { label: 'What is Docker?', guideSlug: 'docker-for-devops', anchor: 'what-is-docker', kind: 'core', desc: 'The daemon, client, and registry model.' },
          { label: 'Docker installation', guideSlug: 'docker-for-devops', anchor: 'docker-installation-on-ubuntu-2404-complete-guide', kind: 'core', desc: 'Get Docker running on Ubuntu 24.04.' },
        ],
      },
      {
        title: 'Images',
        summary: 'Images are the unit of deployment. Master them.',
        nodes: [
          { label: 'Understanding Docker images', guideSlug: 'docker-for-devops', anchor: 'understanding-docker-images', kind: 'core' },
          { label: 'Image layers & caching', guideSlug: 'docker-for-devops', kind: 'core', desc: 'How layers stack and why cache order matters.' },
          { label: 'Working with images', guideSlug: 'docker-for-devops', kind: 'core', desc: 'pull, tag, inspect, prune.' },
        ],
      },
      {
        title: 'Build',
        summary: 'Author Dockerfiles that are fast, small, and reproducible.',
        nodes: [
          { label: 'Dockerfile basics', guideSlug: 'docker-for-devops', anchor: 'dockerfile-basics', kind: 'core' },
          { label: 'Writing efficient Dockerfiles', guideSlug: 'docker-for-devops', anchor: 'writing-efficient-dockerfiles', kind: 'core', desc: 'Layer hygiene, .dockerignore, BuildKit.' },
          { label: 'Multi-stage builds', guideSlug: 'docker-for-devops', anchor: 'multi-stage-builds', kind: 'core', desc: 'Shrink production images by leaving build tooling behind.' },
        ],
      },
      {
        title: 'Runtime',
        summary: 'Run containers reliably with proper networking, storage, and composition.',
        nodes: [
          { label: 'Docker networking', guideSlug: 'docker-for-devops', anchor: 'networking-fundamentals', kind: 'core', desc: 'Bridge, host, overlay, and port mapping.' },
          { label: 'Volumes & storage', guideSlug: 'docker-for-devops', kind: 'core', desc: 'Named volumes, bind mounts, and tmpfs.' },
          { label: 'Docker Compose', guideSlug: 'docker-for-devops', anchor: 'docker-compose-introduction', kind: 'core', desc: 'Define multi-container stacks declaratively.' },
        ],
      },
      {
        title: 'Ship & prepare',
        summary: 'Push images to registries and get interview-ready.',
        nodes: [
          { label: 'Container registries & CI', guideSlug: 'docker-for-devops', anchor: 'container-registries', kind: 'core', desc: 'Docker Hub, ECR, GitHub Packages, and automated pushes.' },
          { label: 'Practice interview questions', guideSlug: 'docker-interview-questions', kind: 'optional', desc: 'Scenario and concept questions asked in real DevOps interviews.' },
        ],
      },
    ],
  },

  // ─── Kubernetes ────────────────────────────────────────────────────────────
  {
    slug: 'kubernetes',
    track: 'kubernetes',
    title: 'Kubernetes for DevOps Roadmap',
    description:
      'A staged path through Kubernetes — from core objects and config to networking, resource management, and production operations.',
    stages: [
      {
        title: 'Core objects',
        summary: 'The three primitives everything else builds on.',
        nodes: [
          { label: 'Pods', guideSlug: 'kubernetes-for-devops', anchor: 'pods', kind: 'core', desc: 'The smallest deployable unit in Kubernetes.' },
          { label: 'Deployments', guideSlug: 'kubernetes-for-devops', anchor: 'replicasets-and-deployments', kind: 'core', desc: 'Declarative rollouts and replica management.' },
          { label: 'Services', guideSlug: 'kubernetes-for-devops', anchor: 'services', kind: 'core', desc: 'ClusterIP, NodePort, and LoadBalancer.' },
        ],
      },
      {
        title: 'Config',
        summary: 'Separate config and secrets from your container images.',
        nodes: [
          { label: 'ConfigMaps', guideSlug: 'kubernetes-for-devops', anchor: 'configmaps', kind: 'core', desc: 'Inject non-sensitive config into pods.' },
          { label: 'Secrets', guideSlug: 'kubernetes-for-devops', anchor: 'secrets', kind: 'core', desc: 'Base64-encoded secrets and how to handle them safely.' },
          { label: 'Namespaces', guideSlug: 'kubernetes-for-devops', anchor: 'namespaces', kind: 'core', desc: 'Logical isolation within a cluster.' },
        ],
      },
      {
        title: 'Networking',
        summary: 'Route external traffic into your cluster.',
        nodes: [
          { label: 'Ingress', guideSlug: 'kubernetes-for-devops', anchor: 'ingress', kind: 'core', desc: 'HTTP/HTTPS routing, TLS termination, and path rules.' },
        ],
      },
      {
        title: 'Resources',
        summary: 'Prevent noisy-neighbour problems and right-size your pods.',
        nodes: [
          { label: 'Requests & limits / QoS', guideSlug: 'kubernetes-for-devops', anchor: 'resource-requests-and-limits', kind: 'core', desc: 'CPU and memory budgets and the QoS classes.' },
          { label: 'Kubernetes resource calculator', href: '/kubernetes-resource-calculator', kind: 'optional', desc: 'Compute requests and limits interactively.' },
        ],
      },
      {
        title: 'Operations',
        summary: 'Keep apps healthy and debug when they are not.',
        nodes: [
          { label: 'Health probes', guideSlug: 'kubernetes-for-devops', anchor: 'health-probes', kind: 'core', desc: 'liveness, readiness, and startup probes.' },
          { label: 'Rollouts & rollbacks', guideSlug: 'kubernetes-for-devops', anchor: 'rollouts-and-rollbacks', kind: 'core', desc: 'Zero-downtime deploys and safe undo.' },
          { label: 'Troubleshooting', guideSlug: 'kubernetes-for-devops', anchor: 'troubleshooting', kind: 'core', desc: 'CrashLoopBackOff, ImagePullBackOff, and beyond.' },
        ],
      },
    ],
  },

  // ─── AWS ───────────────────────────────────────────────────────────────────
  {
    slug: 'aws',
    track: 'aws',
    title: 'AWS for DevOps Engineers Roadmap',
    description:
      'The AWS services a practising DevOps engineer actually uses — from IAM and EC2 through VPC, S3, RDS, and cost controls.',
    stages: [
      {
        title: 'Fundamentals',
        summary: 'Get oriented in the AWS console and lock down access from day one.',
        nodes: [
          { label: 'AWS core concepts', guideSlug: 'aws-for-devops-engineers', anchor: 'aws-fundamentals', kind: 'core', desc: 'Regions, AZs, accounts, and the shared responsibility model.' },
          { label: 'IAM — users, roles, policies', guideSlug: 'aws-for-devops-engineers', anchor: 'iam--identity-and-access-management', kind: 'core', desc: 'Least-privilege access, assume-role, and instance profiles.' },
        ],
      },
      {
        title: 'Compute',
        summary: 'Run workloads on VMs and serverless functions.',
        nodes: [
          { label: 'EC2', guideSlug: 'aws-for-devops-engineers', anchor: 'compute--ec2-lambda-containers', kind: 'core', desc: 'Instance types, AMIs, key pairs, and user-data.' },
          { label: 'Lambda', guideSlug: 'aws-for-devops-engineers', kind: 'core', desc: 'Serverless functions, event triggers, and cold starts.' },
        ],
      },
      {
        title: 'Networking',
        summary: 'Build isolated, routable cloud networks.',
        nodes: [
          { label: 'VPC', guideSlug: 'aws-for-devops-engineers', anchor: 'networking--vpc-and-friends', kind: 'core', desc: 'Subnets, route tables, IGW, NAT, and security groups.' },
          { label: 'Subnet calculator', href: '/subnet-calculator', kind: 'optional', desc: 'Plan VPC CIDR blocks and subnets interactively.' },
        ],
      },
      {
        title: 'Storage & data',
        summary: 'Persist data reliably at any scale.',
        nodes: [
          { label: 'S3', guideSlug: 'aws-for-devops-engineers', anchor: 'storage--s3-ebs-efs', kind: 'core', desc: 'Buckets, IAM policies, versioning, and lifecycle rules.' },
          { label: 'RDS & DynamoDB', guideSlug: 'aws-for-devops-engineers', anchor: 'databases--rds-and-dynamodb', kind: 'core', desc: 'Managed relational vs NoSQL trade-offs.' },
        ],
      },
      {
        title: 'Guardrails',
        summary: 'Prevent runaway spend and keep the account secure.',
        nodes: [
          { label: 'Cost & security guardrails', guideSlug: 'aws-for-devops-engineers', anchor: 'cost-and-security-guardrails', kind: 'core', desc: 'Budgets, Cost Explorer, GuardDuty, and SCPs.' },
        ],
      },
    ],
  },

  // ─── Networking ────────────────────────────────────────────────────────────
  {
    slug: 'networking',
    track: 'networking',
    title: 'Networking for DevOps Roadmap',
    description:
      'TCP/IP, DNS, HTTP/TLS, and the troubleshooting toolkit — the networking fundamentals every DevOps engineer needs.',
    stages: [
      {
        title: 'Models',
        summary: 'The conceptual frameworks that make networking make sense.',
        nodes: [
          { label: 'OSI & TCP/IP models', guideSlug: 'networking-for-devops', anchor: 'the-osi-and-tcpip-models', kind: 'core', desc: 'Seven layers vs four — and which one actually matters.' },
        ],
      },
      {
        title: 'Addressing',
        summary: 'IP addresses and how networks are carved up.',
        nodes: [
          { label: 'IP addressing', guideSlug: 'networking-for-devops', anchor: 'ip-addressing', kind: 'core', desc: 'IPv4 classes, public vs private, and CIDR notation.' },
          { label: 'Subnets & CIDR', guideSlug: 'networking-for-devops', anchor: 'subnets-and-cidr', kind: 'core', desc: 'Subdividing address space for VPCs and on-prem networks.' },
          { label: 'Subnet calculator', href: '/subnet-calculator', kind: 'optional', desc: 'Plan subnets interactively.' },
          { label: 'CIDR checker', href: '/cidr-checker', kind: 'optional', desc: 'Verify whether an IP falls inside a CIDR block.' },
        ],
      },
      {
        title: 'Name resolution',
        summary: 'How hostnames become IP addresses.',
        nodes: [
          { label: 'DNS', guideSlug: 'networking-for-devops', anchor: 'dns', kind: 'core', desc: 'Resolvers, records (A, CNAME, MX, TXT), and TTLs.' },
        ],
      },
      {
        title: 'Transport & app',
        summary: 'The protocols your services speak.',
        nodes: [
          { label: 'TCP vs UDP', guideSlug: 'networking-for-devops', anchor: 'tcp-vs-udp', kind: 'core', desc: 'Connection-oriented reliability vs low-latency datagrams.' },
          { label: 'HTTP & TLS', guideSlug: 'networking-for-devops', anchor: 'http-and-httpstls', kind: 'core', desc: 'Request/response, status codes, TLS handshake.' },
        ],
      },
      {
        title: 'Edge',
        summary: 'Traffic management at the boundary of your infrastructure.',
        nodes: [
          { label: 'Load balancing', guideSlug: 'networking-for-devops', anchor: 'load-balancing-and-reverse-proxies', kind: 'core', desc: 'Round-robin, least-connections, health checks.' },
          { label: 'Firewalls & security groups', guideSlug: 'networking-for-devops', anchor: 'firewalls-and-security-groups', kind: 'core', desc: 'Stateful vs stateless packet filtering.' },
        ],
      },
      {
        title: 'Troubleshooting',
        summary: 'Diagnose network problems systematically.',
        nodes: [
          { label: 'The troubleshooting toolkit', guideSlug: 'networking-for-devops', anchor: 'network-troubleshooting-toolkit', kind: 'core', desc: 'ping, traceroute, dig, ss, tcpdump — when to use which.' },
        ],
      },
    ],
  },

  // ─── DevOps master path ────────────────────────────────────────────────────
  {
    slug: 'devops',
    track: 'devops',
    title: 'DevOps Engineer Roadmap',
    description:
      'The complete end-to-end path: Linux and networking foundations, containers, cloud, Kubernetes, CI/CD, observability, and a portfolio of real projects.',
    stages: [
      {
        title: 'Foundations',
        summary: 'The two pillars everything else sits on.',
        nodes: [
          { label: 'Linux for DevOps', guideSlug: 'linux-for-devops', kind: 'core', desc: 'Filesystem, bash, processes, systemd, and SSH.' },
          { label: 'Networking for DevOps', guideSlug: 'networking-for-devops', kind: 'core', desc: 'TCP/IP, DNS, HTTP, subnets, and the troubleshooting toolkit.' },
        ],
      },
      {
        title: 'Version control',
        summary: 'Git is the backbone of every DevOps workflow.',
        nodes: [
          { label: 'Git', href: 'https://git-scm.com/book', kind: 'core', desc: 'Branching, rebasing, pull requests, and trunk-based development.' },
        ],
      },
      {
        title: 'Containers',
        summary: 'Package and run applications consistently anywhere.',
        nodes: [
          { label: 'Docker for DevOps', guideSlug: 'docker-for-devops', kind: 'core', desc: 'Images, Dockerfiles, Compose, registries, and CI pipelines.' },
        ],
      },
      {
        title: 'Cloud',
        summary: 'Provision and manage cloud infrastructure on AWS.',
        nodes: [
          { label: 'AWS for DevOps engineers', guideSlug: 'aws-for-devops-engineers', kind: 'core', desc: 'IAM, EC2, VPC, S3, RDS, and cost guardrails.' },
        ],
      },
      {
        title: 'Orchestration',
        summary: 'Run containers at scale with Kubernetes.',
        nodes: [
          { label: 'Kubernetes for DevOps', guideSlug: 'kubernetes-for-devops', kind: 'core', desc: 'Pods, Deployments, Services, Ingress, and operations.' },
        ],
      },
      {
        title: 'CI/CD',
        summary: 'Automate test, build, and deploy pipelines.',
        nodes: [
          { label: 'GitHub Actions validator', href: '/github-actions-validator', kind: 'optional', desc: 'Lint your workflow YAML before it hits the runner.' },
          { label: 'GitLab CI validator', href: '/gitlab-ci-validator', kind: 'optional', desc: 'Validate .gitlab-ci.yml syntax interactively.' },
        ],
      },
      {
        title: 'Observability',
        summary: 'Instrument, alert, and query your running systems.',
        nodes: [
          { label: 'PromQL explainer', href: '/promql-explainer', kind: 'optional', desc: 'Understand and build Prometheus queries step by step.' },
          { label: 'Loki alert rule tester', href: '/loki-alert-rule-tester', kind: 'optional', desc: 'Test LogQL-based alert rules against sample logs.' },
        ],
      },
      {
        title: 'Build a portfolio',
        summary: 'Finish real projects to prove your skills.',
        nodes: [
          { label: 'DevOps projects', guideSlug: 'devops-projects', kind: 'core', desc: 'Four portfolio-ready projects: EC2 deploy, Compose stack, monitoring, and a mini CI pipeline.' },
        ],
      },
    ],
  },
];

export function getRoadmap(slug: string): Roadmap | undefined {
  return roadmaps.find((r) => r.slug === slug);
}
