---
title: "Docker for DevOps: A Deep Dive into Images, Layers, and Compose"
description: "A practical, comprehensive Docker guide for DevOps engineers — images, layers, Dockerfiles, multi-stage builds, networking, volumes, Compose, security, and production patterns."
track: docker
order: 1
difficulty: beginner
estMinutes: 250
updatedDate: 2026-06-27
tags: ["docker", "containers", "devops", "dockerfile", "docker-compose"]
relatedTools: ["docker-run-to-compose", "env-example-checker", "github-actions-validator", "gitlab-ci-validator", "kubernetes-resource-calculator"]
seoTitle: "Docker for DevOps: A Complete Deep Dive Guide"
metaDescription: "A practical Docker deep dive for DevOps: images, layers, Dockerfiles, multi-stage builds, networking, volumes, and Compose — with diagrams."
faqs:
  - q: "What is the difference between a Docker image and a container?"
    a: "An image is a read-only template built from a Dockerfile; a container is a running (or stopped) instance of an image with a writable layer on top. One image can spawn many containers."
  - q: "What are Docker image layers and how does layer caching work?"
    a: "Each Dockerfile instruction creates a layer. Docker caches unchanged layers and rebuilds only from the first changed instruction down, so ordering stable steps before volatile ones speeds up builds."
  - q: "What is a multi-stage build and when should you use one?"
    a: "A multi-stage build uses multiple FROM stages so build tools stay in an early stage and only the compiled artifacts are copied into a small final image — the standard way to shrink production images."
  - q: "How do you reduce Docker image size?"
    a: "Use a slim or distroless base, multi-stage builds, combine and clean up RUN layers, add a .dockerignore, and avoid installing build tools or caches in the final stage."
  - q: "What is the difference between CMD and ENTRYPOINT?"
    a: "ENTRYPOINT sets the fixed executable for the container; CMD provides default arguments that are easy to override at run time. Used together, ENTRYPOINT is the command and CMD is its default args."
  - q: "When should you use a volume vs a bind mount?"
    a: "Use named volumes for persistent data managed by Docker (databases, app state) and bind mounts for mounting host source code during local development."
---

Docker is the tool that finally made "it works on my machine" a non-excuse. By packaging an application together with its exact dependencies into a portable image, Docker lets the same artifact run identically on a laptop, a CI runner, and a production server. This guide is a deep, practical tour for DevOps engineers: how images and layers actually work, how to write efficient and secure Dockerfiles, how containers talk to each other over networks, how to persist data with volumes, how to compose multi-service stacks, and how to take all of it to production. Work through it top to bottom, or jump to the part you need. For a structured learning path beyond this guide, see the [Docker roadmap](/learn/roadmaps/docker).

## The Problem Docker Solves

### The "Works on My Machine" Story

It's 2019. A developer at a startup has been grinding for **3 weeks** on a Node.js app — a real-time dashboard for tracking delivery agents. The UI is slick, the APIs are fast, the PM is happy. He types `npm start` and everything just works. Perfectly.

He pushes the code to staging. The CI pipeline goes green. He Slacks his team: *"Deployed! Please test."*

> **3 minutes later:**
> ```
> Error: Cannot find module 'optional-chaining-polyfill'
> Error: node: /lib/x86_64-linux-gnu/libc.so.6: version 'GLIBC_2.28' not found
> npm ERR! peer dep missing: react@^17.0.0, required by react-query@3.39.0
> ```

His laptop: **Node 14.18, npm 6.14, Ubuntu 22.04**. The staging server: **Node 12.22, npm 5.6, CentOS 7**. Three days of debugging. Three days of *"but it works on my machine!"*

This problem was not unique — every developer at every company was facing it. Docker was the solution.

### Dependency Hell — Real-World Examples

The "Works on My Machine" problem is a symptom of a deeper disease: **dependency hell**. Here are scenarios every developer has lived through:

| Scenario | The Conflict | Pain Level |
|---|---|---|
| Two Python projects on same machine | Project A needs Python 2.7, Project B needs Python 3.9. `pip install` breaks both. | High |
| npm version conflict | App needs npm 6 for legacy scripts, another needs npm 8. Switching breaks lockfiles. | Medium |
| OpenSSL version mismatch | Dev has OpenSSL 3.0, prod server has 1.1. Node.js crypto breaks silently. | High |
| System library versions (glibc) | Compiled on Ubuntu 22, deployed on CentOS 7. Binary won't even load. | Critical |
| Ruby gem native extensions | Gem compiled against libxml2 on Mac, server has different libxml2. Segfault. | Critical |

> **Note:** Think of Docker like sharing a React component with `node_modules` — not just the code, but the *exact* node version, npm version, and OS libraries. Docker packages your application together with its entire environment.

### Deployment Nightmares Before Docker

Before Docker, deploying an app to a new server looked like this:

```bash
# The legendary "deployment runbook" (50 pages of this)
ssh root@production-server-ip

# Step 1: Install the right Node version (pray it's compatible)
curl -fsSL https://deb.nodesource.com/setup_14.x | bash -
apt-get install -y nodejs

# Step 2: Hope npm is the right version
npm install -g npm@6.14.15

# Step 3: Clone app
git clone https://github.com/company/app.git /var/www/app
cd /var/www/app
npm install   # Often fails here due to native modules

# Step 4: Set up environment variables (done manually, often wrong)
export DB_HOST=192.168.1.100
export NODE_ENV=production
# (Someone always forgets one. App crashes at 2 AM)

# Step 5: Set up PM2 or systemd (manual, error-prone)
npm install -g pm2
pm2 start app.js --name "myapp"
pm2 startup  # Different command on every distro

# Step 6: Set up nginx (manual config, copy-paste errors)
# ... 20 more steps ...

# Total time: 4-8 hours per server
# Success rate: ~60% first try
# Consistency across servers: ZERO
```

And if you need to deploy to 10 servers? Do all of this 10 times — and something different will happen each time. This is called **configuration drift** — over time servers diverge from each other, and no one knows why production behaves differently.

### The VM Tax — Resource Waste at Scale

Companies tried solving this with Virtual Machines — one VM per application. But VMs have a massive overhead:

| Resource | Each VM Consumes | 10 Apps = 10 VMs |
|---|---|---|
| RAM | 2–4 GB minimum (OS alone) | 20–40 GB wasted on OS |
| Disk | 20–40 GB per VM image | 200–400 GB |
| Boot time | 1–5 minutes | Can't scale fast |
| CPU | Always-on OS processes | Significant idle overhead |

A startup with 20 microservices using VMs wastes a minimum of 40 GB RAM just for operating systems. The same 20 services in Docker containers consume 2–5 GB of overhead — a dramatic difference that translates directly to cloud cost savings.

### Docker's Shipping Container Analogy

Before the 1950s, international shipping was chaos. Every ship had a different design, every port used different equipment, and cargo had to be repacked repeatedly. A shipment from Europe to America could take months, and costs were astronomical.

**In 1956, Malcolm McLean invented the standardized shipping container.** One fixed size (20ft/40ft), standard corners, works on any ship, any port, any truck, any train. Load once in Shanghai — unload in Mumbai without opening the box.

**Result:** Global trade exploded. Shipping costs dropped 90%.

Docker is the shipping container of software:

| Shipping World | Software World |
|---|---|
| Different ships | Different servers/OS |
| Different ports | Different cloud providers |
| Cargo re-packing | Re-configuring for each environment |
| Standard container | Docker container |
| Load once, ship anywhere | Build once, run anywhere |
| McLean standardized trade | Docker standardized deployment |

> **Tip:** When asked "Why do you use Docker?" in an interview — use the shipping container analogy. Then give concrete numbers: "Our deployment time went from 4 hours to 15 minutes. Configuration drift eliminated. Dev-prod parity achieved."

### Why Every Company Adopted Docker

By 2026, over **80% of cloud workloads** run in containers. Here's why adoption was inevitable:

- **Dev-prod parity** — Same container in dev, test, staging, production. No more surprises.
- **Faster onboarding** — New developer joins? One command: `docker compose up`. Ready in 5 minutes, not 2 days.
- **Microservices enablement** — Each service in its own container. Scale independently.
- **CI/CD becomes simple** — Build a container, test it, push to registry, deploy. Repeatable every time.
- **Cost reduction** — Pack more apps per server. AWS/GCP bills drop 40–60%.
- **Kubernetes compatibility** — Kubernetes orchestrates containers. You cannot use Kubernetes without containers.

---

## Containers vs Virtual Machines

### Virtual Machines — The Apartment Building Analogy

Think of a VM like separate apartments in a large building. Each apartment has its own kitchen, its own bathroom, its own living room. What happens in one apartment is completely invisible to the other.

A **Virtual Machine** runs a complete operating system on top of a *hypervisor* — software that emulates physical hardware. Each VM thinks it owns the whole computer.

- **Hypervisor** (VMware, VirtualBox, KVM, Hyper-V) sits between hardware and VMs
- Each VM gets a **full Guest OS** (Windows, Ubuntu, etc.) — 1–4 GB just for the OS
- Hardware is **emulated** — virtual CPU, virtual RAM, virtual disk
- **Strong isolation** — a crash in VM1 doesn't affect VM2
- **Boot time**: 1–5 minutes (full OS boot)

### Containers — The Shared House Analogy

Think of containers like rooms in a shared house. You share the same kitchen and water supply, but each person has their own private room and lives independently.

A **Container** shares the host OS kernel but runs in an isolated process namespace. No hardware emulation, no duplicate OS.

- **Shared kernel** — uses the host's Linux kernel directly
- Each container gets an **isolated view** of processes, network, filesystem
- **No hypervisor overhead** — near-native performance
- **Lightweight** — MBs instead of GBs
- **Boot time**: Milliseconds to seconds

<figure class="dgm" role="img" aria-label="Side-by-side stack diagram comparing Virtual Machine architecture (Hardware, Hypervisor, Guest OS per app, App) against Container architecture (Hardware, Host OS, Docker Engine, Container per app), illustrating how containers skip the Guest OS layer">
<svg viewBox="0 0 680 310" width="680" height="310" xmlns="http://www.w3.org/2000/svg">
  <!-- VM stack -->
  <text x="155" y="18" text-anchor="middle" font-size="13" font-weight="bold" class="dgm-ink">Virtual Machine</text>
  <!-- Hardware -->
  <rect x="20" y="26" width="270" height="36" rx="7" class="dgm-surface-2" stroke="none"/>
  <rect x="20" y="26" width="270" height="36" rx="7" fill="none" stroke-width="1.5" class="dgm-stroke"/>
  <text x="155" y="50" text-anchor="middle" font-size="11" class="dgm-muted">Hardware</text>
  <!-- Hypervisor -->
  <rect x="20" y="68" width="270" height="36" rx="7" class="dgm-accent-soft" stroke="none"/>
  <rect x="20" y="68" width="270" height="36" rx="7" fill="none" stroke-width="1.5" class="dgm-accent-stroke"/>
  <text x="155" y="92" text-anchor="middle" font-size="11" class="dgm-ink">Hypervisor (VMware / KVM)</text>
  <!-- Guest OS 1 -->
  <rect x="20" y="110" width="126" height="36" rx="7" class="dgm-surface-2" stroke="none"/>
  <rect x="20" y="110" width="126" height="36" rx="7" fill="none" stroke-width="1.5" class="dgm-stroke"/>
  <text x="83" y="134" text-anchor="middle" font-size="10" class="dgm-muted">Guest OS</text>
  <!-- Guest OS 2 -->
  <rect x="164" y="110" width="126" height="36" rx="7" class="dgm-surface-2" stroke="none"/>
  <rect x="164" y="110" width="126" height="36" rx="7" fill="none" stroke-width="1.5" class="dgm-stroke"/>
  <text x="227" y="134" text-anchor="middle" font-size="10" class="dgm-muted">Guest OS</text>
  <!-- App 1 -->
  <rect x="20" y="152" width="126" height="36" rx="7" class="dgm-accent-soft" stroke="none"/>
  <rect x="20" y="152" width="126" height="36" rx="7" fill="none" stroke-width="1.5" class="dgm-accent-stroke"/>
  <text x="83" y="176" text-anchor="middle" font-size="11" class="dgm-ink">App A</text>
  <!-- App 2 -->
  <rect x="164" y="152" width="126" height="36" rx="7" class="dgm-accent-soft" stroke="none"/>
  <rect x="164" y="152" width="126" height="36" rx="7" fill="none" stroke-width="1.5" class="dgm-accent-stroke"/>
  <text x="227" y="176" text-anchor="middle" font-size="11" class="dgm-ink">App B</text>
  <!-- VM labels -->
  <text x="83" y="210" text-anchor="middle" font-size="10" class="dgm-muted">VM 1</text>
  <text x="227" y="210" text-anchor="middle" font-size="10" class="dgm-muted">VM 2</text>
  <text x="155" y="232" text-anchor="middle" font-size="10" class="dgm-muted">Each VM includes a full OS (~2–4 GB overhead)</text>
  <!-- Divider -->
  <line x1="340" y1="10" x2="340" y2="290" stroke-width="1.5" class="dgm-ink-stroke" stroke-dasharray="6,4"/>
  <!-- Container stack -->
  <text x="520" y="18" text-anchor="middle" font-size="13" font-weight="bold" class="dgm-ink">Container</text>
  <!-- Hardware -->
  <rect x="385" y="26" width="270" height="36" rx="7" class="dgm-surface-2" stroke="none"/>
  <rect x="385" y="26" width="270" height="36" rx="7" fill="none" stroke-width="1.5" class="dgm-stroke"/>
  <text x="520" y="50" text-anchor="middle" font-size="11" class="dgm-muted">Hardware</text>
  <!-- Host OS -->
  <rect x="385" y="68" width="270" height="36" rx="7" class="dgm-surface-2" stroke="none"/>
  <rect x="385" y="68" width="270" height="36" rx="7" fill="none" stroke-width="1.5" class="dgm-stroke"/>
  <text x="520" y="92" text-anchor="middle" font-size="11" class="dgm-muted">Host OS (shared kernel)</text>
  <!-- Docker Engine -->
  <rect x="385" y="110" width="270" height="36" rx="7" class="dgm-accent-soft" stroke="none"/>
  <rect x="385" y="110" width="270" height="36" rx="7" fill="none" stroke-width="1.5" class="dgm-accent-stroke"/>
  <text x="520" y="134" text-anchor="middle" font-size="11" class="dgm-ink">Docker Engine</text>
  <!-- Container A -->
  <rect x="385" y="152" width="126" height="36" rx="7" class="dgm-accent-soft" stroke="none"/>
  <rect x="385" y="152" width="126" height="36" rx="7" fill="none" stroke-width="1.5" class="dgm-accent-stroke"/>
  <text x="448" y="176" text-anchor="middle" font-size="11" class="dgm-ink">Container A</text>
  <!-- Container B -->
  <rect x="529" y="152" width="126" height="36" rx="7" class="dgm-accent-soft" stroke="none"/>
  <rect x="529" y="152" width="126" height="36" rx="7" fill="none" stroke-width="1.5" class="dgm-accent-stroke"/>
  <text x="592" y="176" text-anchor="middle" font-size="11" class="dgm-ink">Container B</text>
  <text x="520" y="232" text-anchor="middle" font-size="10" class="dgm-muted">Containers share the Host OS kernel (no duplicate OS)</text>
</svg>
<figcaption>Containers skip the Guest OS layer that VMs require, cutting overhead from gigabytes per app to near zero.</figcaption>
</figure>

### Detailed Comparison Table

| Feature | Virtual Machine | Container |
|---|---|---|
| **Startup Time** | 1–5 minutes (full OS boot) | Seconds (process start) |
| **Size** | 2–40 GB per VM image | 10 MB–1 GB (app + libs only) |
| **OS** | Full Guest OS per VM | Shares Host OS Kernel |
| **Isolation Level** | Hardware-level (very strong) | Process-level (strong, not absolute) |
| **Performance Overhead** | 5–15% CPU/RAM overhead | <1–2% overhead (near-native) |
| **Portability** | Limited (hypervisor-specific) | Excellent (any Linux/Mac/Win with Docker) |
| **Resource Usage** | Heavy (duplicate OS per VM) | Light (shared kernel) |
| **Density (per server)** | 5–20 VMs typical | 50–500 containers typical |
| **Security Isolation** | Very strong (hardware boundary) | Good (namespaces + cgroups) |
| **Best Use Case** | Legacy apps, strong isolation, Windows workloads | Microservices, CI/CD, cloud-native apps |

> **Tip:** Real-world production numbers: Server utilization jumped from 30–40% (with VMs) to 80%+ (with containers). Deployment time dropped from 45 minutes to 8 minutes. Auto-scaling: containers spin up in 3 seconds vs 4 minutes for VMs — critical during peak load events.

### When to Use VM vs Container

| Use VM When... | Use Container When... |
|---|---|
| Running Windows workloads on Linux host | Running microservices/APIs |
| Need kernel-level isolation (security-critical) | CI/CD pipelines (build, test, deploy) |
| Legacy apps that need specific OS versions | Stateless applications |
| Running untrusted code (multi-tenant SaaS) | Development environments |
| Database servers needing dedicated resources | Auto-scaling workloads |

> **Note:** In enterprise environments, both are used together. VMs run Docker. In the cloud, an EC2 VM runs Docker containers on top. This is not a binary choice — they are complementary technologies.

---

## What is Docker?

### The Origin Story — From DotCloud to Changing the World

**2008:** Solomon Hykes co-founds DotCloud — a Platform-as-a-Service (PaaS) company in San Francisco. They're building tools to deploy customer apps on their platform, and internally they develop a container management tool.

**March 21, 2013:** PyCon, Santa Clara. Hykes gives a 5-minute lightning talk called *"The Future of Linux Containers."* He demos Docker — their internal tool they're open-sourcing. The audience is small. The impact: **massive**.

A 5-minute talk at a Python conference launched a technology that today runs in every data center in the world. That's what happens when the right solution meets the right problem at the right time.

- **2013:** Docker open-sourced, goes viral on GitHub
- **2014:** Google, Microsoft, Amazon begin supporting Docker
- **2015:** Docker Inc. raises $95M, valuation $1B+
- **2016:** Docker Swarm, Docker Compose GA. Enterprise adoption explodes.
- **2017:** Kubernetes wins the orchestration wars, but Docker remains the build standard
- **2019:** Docker Inc. sells its enterprise business to Mirantis, refocuses on developers
- **2023+:** Docker Desktop 4.x, Docker Scout (security), AI-powered features
- **2026:** Docker is as fundamental as Git — you cannot be a backend/DevOps engineer without it

### Docker vs Other Container Runtimes

Docker is not just one tool — it is an ecosystem. But the container runtime market has other players:

| Runtime | Used By | Key Feature | Should You Learn? |
|---|---|---|---|
| **Docker** | Developers, small teams, CI/CD | Best Developer Experience (DX), most popular, huge ecosystem | Yes, first priority |
| **containerd** | Kubernetes production clusters | Lightweight production runtime, CNCF graduated project | Learn after Docker |
| **Podman** | Red Hat / Fedora users, security-conscious teams | Rootless (no daemon), daemonless, Docker-compatible CLI | Be aware of it |
| **CRI-O** | OpenShift, Kubernetes | Minimal footprint, built for Kubernetes CRI interface | Be aware of it |
| **runc** | Low-level, all runtimes use it | OCI reference implementation, the actual container runner | Deep-dive later |

> **Tip:** When asked "What is the difference between Docker and containerd?" — say this: Docker is the full toolchain (build + run + push + compose). containerd is just the runtime that Kubernetes uses to actually run containers. Docker internally uses containerd. Think of it as: Docker = Full Car, containerd = The Engine.

### Docker's Place in the DevOps Stack

Docker is the **central connective tissue** of the modern DevOps pipeline:

```
Code (React/Node/Python) → Build (docker build / Dockerfile) → Test (docker run test suite) → Registry (docker push / ECR / Docker Hub) → Deploy (ECS / Kubernetes / docker compose up)
```

### Career Impact

Docker knowledge significantly expands your career options:

| Skill Level | Typical Role | Salary Range (India) |
|---|---|---|
| Without Docker | Junior/Mid Developer (Frontend/Backend) | ₹15–20 LPA |
| Docker + Kubernetes | DevOps / SRE (2–5 yrs exp) | ₹30–50 LPA |
| Docker + AWS + K8s + CI/CD | Senior DevOps / Staff SRE (5+ yrs exp) | ₹50+ LPA |

A React/frontend background is a unique advantage in DevOps — engineers who understand both frontend containerization and backend infrastructure are in high demand.

### Docker By The Numbers — 2026

- **13M+** images on Docker Hub
- **13B+** pulls per month
- **20M+** Docker Desktop users
- **80%** of cloud workloads containerized

---

## Containerization Concepts — The Linux Magic

### The Foundation — Why Linux?

Docker's magic comes from three specific Linux kernel features. Understanding them is what separates a senior engineer from a beginner — and this knowledge is invaluable in interviews when asked "How does Docker work internally?"

Docker containers are not magic — they're **three Linux kernel features** working together:

1. **Namespaces** — What a container can *see* (isolation of view)
2. **Cgroups** — What a container can *use* (resource limits)
3. **Union Filesystem (OverlayFS)** — How a container's *filesystem* is built

### Linux Namespaces — The Isolation Magic

A namespace makes a container feel like it is the only process on the machine — like an actor on a film set who is made to feel they are actually in a Mughal palace, when they are actually standing in a Mumbai studio.

Linux has **7 types of namespaces**. Docker uses 6 of them:

**PID Namespace — Process ID Isolation**

The container believes it has its own process tree. Container's PID 1 = Host's PID 5678.

```bash
# Inside container: sees its own process tree
$ ps aux
PID   USER  CMD
1     root  node server.js   ← thinks it's PID 1!
12    root  /bin/sh

# On host: sees the real PID
$ ps aux | grep node
5678  root  node server.js   ← actually PID 5678
```

The container cannot see parent processes. Completely isolated process tree.

**NET Namespace — Network Isolation**

Each container gets its own network interfaces, IP address, routing table, and firewall rules.

```bash
# Container 1: has its own IP
$ docker exec container1 ip addr
172.17.0.2/16   ← container's IP

# Container 2: different IP
$ docker exec container2 ip addr
172.17.0.3/16   ← different IP, same host

# Host: sees docker0 bridge
$ ip addr show docker0
172.17.0.1/16   ← bridge connects them
```

**MNT Namespace — Filesystem Isolation**

The container has its own filesystem view. It appears to have a complete Linux filesystem — `/etc`, `/usr`, `/var` all separate.

```bash
# Container sees its own filesystem
$ docker exec mycontainer ls /
bin  dev  etc  home  lib  proc
root  sys  tmp  usr  var  app

# Host files are NOT visible in container
# (unless explicitly mounted with -v)
```

**UTS Namespace — Hostname Isolation**

Each container can have its own hostname, independent of the host machine.

```bash
# Set custom hostname for container
$ docker run --hostname=myapp-prod ubuntu hostname
myapp-prod

# Host machine sees its own hostname
$ hostname
prod-server-01
```

**USER Namespace — User ID Mapping**

Maps the container's root user to an unprivileged host user. Container "root" is NOT host root — important for security!

```bash
# Container root → host user 1000
# Even if container is "root",
# on host it's unprivileged UID 1000
# Security: container escape doesn't
# give attacker host root access
```

**IPC Namespace — Inter-Process Communication Isolation**

Containers cannot access each other's shared memory, semaphores, or message queues.

```bash
# Share IPC namespace between containers
# (for high-performance apps like Redis)
docker run --ipc=container:redis-container my-app

# Default: isolated IPC per container
# No shared memory leaks between apps
```

### Cgroups — Resource Control

**Control Groups (cgroups)** control *how much* resource a container can use. If namespaces define what a container can see, cgroups define how much it can consume.

Think of cgroups as a **resource budget** per container:

```bash
# Memory limit: container cannot use more than 512MB
docker run --memory=512m nginx

# CPU limit: container gets max 50% of one CPU core
docker run --cpus=0.5 nginx

# Both together (production-ready)
docker run \
  --memory=512m \
  --memory-swap=512m \
  --cpus=0.5 \
  --cpu-shares=512 \
  nginx

# I/O limits (read/write speed)
docker run \
  --device-read-bps /dev/sda:100mb \
  --device-write-bps /dev/sda:50mb \
  nginx

# See current container resource usage
docker stats --no-stream

# Output:
# CONTAINER   CPU %   MEM USAGE / LIMIT    NET I/O
# nginx       0.1%    12MiB / 512MiB       1.2kB / 0B
```

| Cgroup Subsystem | What It Controls | Docker Flag |
|---|---|---|
| `memory` | Max RAM usage, OOM killer behavior | `--memory=512m` |
| `cpu` | CPU time allocation | `--cpus=0.5` |
| `cpuset` | Which CPU cores to use | `--cpuset-cpus=0,1` |
| `blkio` | Block I/O limits (disk read/write) | `--device-read-bps` |
| `net_cls` | Network bandwidth tagging | (via tc/iptables) |
| `pids` | Max number of processes in container | `--pids-limit=100` |

> **Caution:** Always set memory and CPU limits on every production container. Without limits, a runaway container can crash the entire host server — the "noisy neighbour" problem. During peak traffic, if one container hogs CPU, all other containers will slow down. Limits protect all containers on the host.

### Union Filesystem — OverlayFS

A Docker image is made of **read-only layers**. When you run a container, Docker adds a thin **writable layer** on top. This is OverlayFS (Overlay Filesystem).

```bash
# Example Dockerfile - creates layers
FROM ubuntu:22.04            # Layer 1: Base Ubuntu (~70MB)
RUN apt-get update           # Layer 2: Package index (~20MB)
RUN apt-get install -y curl  # Layer 3: curl binary (~5MB)
COPY app.js /app/            # Layer 4: Your app (~1MB)
CMD ["node", "app.js"]       # Layer 5: Metadata only

# See the layers of an image
$ docker history my-node-app
IMAGE         CREATED      SIZE     COMMENT
a1b2c3d4      2 hours ago  1.2MB    COPY app.js
f5e6d7c8      2 hours ago  5.1MB    apt-get install curl
g9h0i1j2      2 hours ago  22MB     apt-get update
ubuntu:22.04  2 weeks ago  72MB     base layer
```

**Copy-on-Write (CoW) — The Secret Sauce**

When a container **modifies** a file from a read-only layer:
1. Docker *copies* that file to the writable layer
2. Makes the modification in the writable layer
3. The original read-only layer is **untouched**
4. 100 containers sharing the same image = base layers shared, only diffs stored

If 100 containers are using the same nginx image, there is still only one copy on disk. 100x efficiency!

```bash
# See OverlayFS in action on Linux host
$ docker inspect mycontainer | grep -A 10 GraphDriver
"GraphDriver": {
  "Data": {
    "LowerDir": "/var/lib/docker/overlay2/abc123/diff:
                 /var/lib/docker/overlay2/def456/diff",
    "MergedDir": "/var/lib/docker/overlay2/xyz789/merged",
    "UpperDir":  "/var/lib/docker/overlay2/xyz789/diff",
    "WorkDir":   "/var/lib/docker/overlay2/xyz789/work"
  }
}
# LowerDir = read-only image layers (stacked)
# UpperDir = writable container layer (your changes)
# MergedDir = what container sees (unified view)
```

> **Note (Senior Engineer Interview):** "Both Docker containers and VMs provide isolation — so why are containers considered less secure?" Answer: VMs provide hardware-level isolation (hypervisor = hard boundary). Containers only use Linux kernel features — if there is a kernel vulnerability (like Dirty COW, runc CVE), container escape is possible. This is why multi-tenant environments running untrusted code prefer VMs or gVisor/Kata Containers.

> **Tip (Quick Summary):** Docker container = Linux process + Namespaces (isolation of view: can't see others' processes, network, files) + Cgroups (resource limits: max CPU/RAM) + OverlayFS (layered filesystem: shared base + writable top). Everything else — Dockerfile, docker-compose, Kubernetes — is built on top of these three.

---

## Docker Architecture Deep Dive

### The Big Picture

Docker follows a client-server architecture. When you type `docker run nginx`, a lot is happening under the hood — think of it as an assembly line where each component performs a specific job.

<figure class="dgm" role="img" aria-label="Docker architecture diagram showing the Docker CLI sending commands via REST API to the Docker Daemon (dockerd), which manages Images and Containers locally, with a Registry (Docker Hub or private) on the right connected to the daemon by pull and push arrows">
<svg viewBox="0 0 680 230" width="680" height="230" xmlns="http://www.w3.org/2000/svg">
  <!-- Docker CLI box -->
  <rect x="20" y="80" width="130" height="70" rx="8" class="dgm-accent-soft" stroke="none"/>
  <rect x="20" y="80" width="130" height="70" rx="8" fill="none" stroke-width="1.5" class="dgm-accent-stroke"/>
  <text x="85" y="109" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">Docker CLI</text>
  <text x="85" y="126" text-anchor="middle" font-size="10" class="dgm-muted">docker run/build</text>
  <text x="85" y="141" text-anchor="middle" font-size="10" class="dgm-muted">docker push/pull</text>
  <!-- Arrow CLI → Daemon -->
  <line x1="151" y1="115" x2="219" y2="115" stroke-width="2" class="dgm-ink-stroke"/>
  <polygon points="219,110 230,115 219,120" class="dgm-ink"/>
  <text x="190" y="108" text-anchor="middle" font-size="9" class="dgm-muted">REST API</text>
  <text x="190" y="129" text-anchor="middle" font-size="9" class="dgm-muted">/var/run/docker.sock</text>
  <!-- Docker Daemon box -->
  <rect x="230" y="50" width="200" height="130" rx="8" class="dgm-surface-2" stroke="none"/>
  <rect x="230" y="50" width="200" height="130" rx="8" fill="none" stroke-width="1.5" class="dgm-stroke"/>
  <text x="330" y="76" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">Docker Daemon (dockerd)</text>
  <!-- Images sub-box -->
  <rect x="244" y="88" width="78" height="36" rx="6" class="dgm-accent-soft" stroke="none"/>
  <rect x="244" y="88" width="78" height="36" rx="6" fill="none" stroke-width="1.5" class="dgm-accent-stroke"/>
  <text x="283" y="111" text-anchor="middle" font-size="10" class="dgm-ink">Images</text>
  <!-- Containers sub-box -->
  <rect x="338" y="88" width="78" height="36" rx="6" class="dgm-accent-soft" stroke="none"/>
  <rect x="338" y="88" width="78" height="36" rx="6" fill="none" stroke-width="1.5" class="dgm-accent-stroke"/>
  <text x="377" y="111" text-anchor="middle" font-size="10" class="dgm-ink">Containers</text>
  <!-- containerd label -->
  <text x="330" y="148" text-anchor="middle" font-size="10" class="dgm-muted">containerd → runc</text>
  <text x="330" y="165" text-anchor="middle" font-size="10" class="dgm-muted">namespaces + cgroups</text>
  <!-- Arrow Daemon → Registry (pull) -->
  <line x1="431" y1="100" x2="499" y2="100" stroke-width="2" class="dgm-ink-stroke"/>
  <polygon points="499,95 510,100 499,105" class="dgm-ink"/>
  <text x="470" y="93" text-anchor="middle" font-size="9" class="dgm-muted">push</text>
  <!-- Arrow Registry → Daemon (push) -->
  <line x1="510" y1="130" x2="432" y2="130" stroke-width="2" class="dgm-ink-stroke"/>
  <polygon points="432,125 421,130 432,135" class="dgm-ink"/>
  <text x="470" y="148" text-anchor="middle" font-size="9" class="dgm-muted">pull</text>
  <!-- Registry box -->
  <rect x="510" y="60" width="150" height="110" rx="8" class="dgm-surface-2" stroke="none"/>
  <rect x="510" y="60" width="150" height="110" rx="8" fill="none" stroke-width="1.5" class="dgm-stroke"/>
  <text x="585" y="87" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">Registry</text>
  <text x="585" y="107" text-anchor="middle" font-size="10" class="dgm-muted">Docker Hub</text>
  <text x="585" y="122" text-anchor="middle" font-size="10" class="dgm-muted">AWS ECR / GCR</text>
  <text x="585" y="137" text-anchor="middle" font-size="10" class="dgm-muted">GitHub GHCR</text>
  <text x="585" y="152" text-anchor="middle" font-size="10" class="dgm-muted">Harbor (self-hosted)</text>
</svg>
<figcaption>The Docker CLI is a thin REST client; all heavy lifting happens inside the Docker daemon, which coordinates containerd and runc to run containers and communicates with registries for image storage.</figcaption>
</figure>

### 1. Docker Client (CLI)

The Docker Client is the tool you use — the `docker` command. When you type `docker run nginx`, the client only translates CLI arguments into a REST API call and sends it to the Docker Daemon. The client itself does nothing else — it is just a translator.

```bash
# Docker CLI is just making REST API calls to the daemon
# You can curl the Docker socket directly

# List running containers (same as docker ps)
curl --unix-socket /var/run/docker.sock http://localhost/v1.43/containers/json

# Start a container via API
curl --unix-socket /var/run/docker.sock \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"Image": "nginx"}' \
  http://localhost/v1.43/containers/create

# Check Docker version via API
curl --unix-socket /var/run/docker.sock http://localhost/v1.43/version | jq

# See all API endpoints
curl --unix-socket /var/run/docker.sock http://localhost/v1.43/_ping
```

> **Tip:** You can control a remote machine's Docker: `export DOCKER_HOST=tcp://192.168.1.100:2376`, then run normal docker commands. In production, always use TLS (port 2376), never plain port 2375!

### 2. Docker Daemon (dockerd)

The Docker Daemon (dockerd) is the background process that actually does the work. It accepts REST API requests and manages containers, images, networks, and volumes.

| Feature | Details |
|---|---|
| Default Socket | `unix:///var/run/docker.sock` |
| TCP (TLS) | Port 2376 (production) |
| TCP (No TLS) | Port 2375 (NEVER in production!) |
| Config File | `/etc/docker/daemon.json` |
| Logs | `journalctl -u docker.service` |
| Restart | `sudo systemctl restart docker` |

### 3. Docker Registry

Registry is where images are stored. Docker Hub is the default public registry, but enterprises use private registries:

- **Docker Hub** — Default public registry. Free tier available. `docker.io/library/nginx`
- **AWS ECR** — Amazon Elastic Container Registry. IAM integration.
- **GCR / GAR** — Google Container/Artifact Registry. Seamless with GKE.
- **GHCR** — GitHub Container Registry. Tight CI/CD integration.
- **Harbor** — Open-source enterprise registry. Self-hosted. Vulnerability scanning built-in.
- **Artifactory** — JFrog's universal artifact manager. Docker + Maven + npm in one place.

### 4. containerd — High-Level Runtime

containerd is a CNCF project that sits between the Docker Daemon and actual containers. It manages image pulling, storage, and container lifecycle. Kubernetes also uses containerd directly (without Docker).

```bash
# containerd has its own CLI: ctr
# Note: operates in a different namespace from Docker

# List images in containerd
sudo ctr images ls

# List containers
sudo ctr containers ls

# Pull image directly via containerd
sudo ctr images pull docker.io/library/nginx:latest

# Run container via containerd (low-level)
sudo ctr run docker.io/library/nginx:latest mynginx

# containerd socket
ls -la /run/containerd/containerd.sock

# Check containerd status
sudo systemctl status containerd
```

> **Note:** Kubernetes v1.24+ removed Docker support. Kubernetes now talks directly to containerd via CRI (Container Runtime Interface). Docker's "removal" was only the removal of the Docker daemon — containers still run the same way because containerd and runc are the same underneath.

### 5. runc — Low-Level Runtime

runc is the reference implementation of the OCI Runtime Specification. It directly makes Linux kernel syscalls — creates namespaces, sets up cgroups, and starts the process. It is the actual tool that makes a "container" exist.

```bash
# runc version check
runc --version

# runc is not normally used directly
# But for understanding: containerd calls runc like this:
# runc create --bundle /path/to/bundle container_id
# runc start container_id
# runc delete container_id
```

### Complete Flow: docker run nginx

1. You type `docker run nginx`
2. Docker CLI → REST API call → Docker daemon (via /var/run/docker.sock)
3. dockerd checks: is the image available locally? No → pull from Registry
4. dockerd → tells containerd to start the container
5. containerd → spawns a containerd-shim process
6. containerd-shim → calls runc
7. runc → makes Linux kernel syscalls (namespaces + cgroups setup)
8. Container process (nginx) starts
9. runc exits; containerd-shim stays alive (for I/O)
10. Container keeps running even on daemon restart

---

## Docker Installation on Ubuntu 24.04 (Complete Guide)

### Prerequisites Check

> **Caution:** Check if Docker is already installed before starting. If an old version exists, remove it first: `sudo apt remove docker docker-engine docker.io containerd runc`

```bash
# System info check
uname -a
lsb_release -a
whoami

# Check if Docker already installed
docker --version 2>/dev/null || echo "Docker not installed"

# Remove old versions if they exist
sudo apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null
sudo apt autoremove -y
```

### Step 1: System Update

```bash
sudo apt update && sudo apt upgrade -y

# If the kernel was updated, reboot (optional but recommended)
# sudo reboot
```

### Step 2: Install Prerequisites

```bash
sudo apt install -y \
  ca-certificates \
  curl \
  gnupg \
  lsb-release

# Verify install
curl --version
gpg --version
```

### Step 3: Add Docker's Official GPG Key

```bash
# Create keyrings directory
sudo install -m 0755 -d /etc/apt/keyrings

# Download Docker's GPG key and convert to binary format
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Set read permissions
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Verify key
gpg --show-keys /etc/apt/keyrings/docker.gpg
```

> **Note:** The GPG key ensures packages come from Docker's official server and have not been intercepted. This protects against man-in-the-middle attacks. Always verify packages before installing.

### Step 4: Add Docker Repository

```bash
echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Verify repository was added
cat /etc/apt/sources.list.d/docker.list

# Expected output:
# deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg]
#   https://download.docker.com/linux/ubuntu noble stable

# Update apt cache with new repository
sudo apt update
```

### Step 5: Install Docker Engine

```bash
sudo apt install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin

# Package breakdown:
# docker-ce              → Docker Community Edition (daemon)
# docker-ce-cli          → Docker CLI (the 'docker' command)
# containerd.io          → containerd runtime
# docker-buildx-plugin   → BuildKit for advanced image building
# docker-compose-plugin  → Docker Compose v2 (docker compose, not docker-compose)

# To install a specific version:
# List available versions
apt-cache madison docker-ce

# Install specific version
# sudo apt install docker-ce=5:26.0.0-1~ubuntu.24.04~noble \
#   docker-ce-cli=5:26.0.0-1~ubuntu.24.04~noble \
#   containerd.io docker-buildx-plugin docker-compose-plugin
```

### Step 6: Verify Installation

```bash
sudo docker run hello-world

# Expected output:
# Hello from Docker!
# This message shows that your installation appears to be working correctly.

# Service status check
sudo systemctl status docker
sudo systemctl status containerd
```

### Step 7: Post-Installation — Run Without sudo

```bash
# Create 'docker' group (usually already exists)
sudo groupadd docker 2>/dev/null || echo "Group already exists"

# Add current user to docker group
sudo usermod -aG docker $USER

# Apply group changes (no logout/login needed for this session)
newgrp docker

# Verify — run docker without sudo
docker run hello-world

# Permanent verification
groups $USER
# Output should include 'docker'
```

> **Caution:** Adding a user to the docker group is practically equivalent to giving root access. Through the Docker socket (`/var/run/docker.sock`), anyone can mount a volume and access the host filesystem. Add users carefully on production servers. Rootless Docker is a more secure option.

### Step 8: Enable Docker on Boot

```bash
sudo systemctl enable docker.service
sudo systemctl enable containerd.service

# Manual start/stop/restart
sudo systemctl start docker
sudo systemctl stop docker
sudo systemctl restart docker

# View logs
sudo journalctl -u docker.service -f      # Live logs
sudo journalctl -u docker.service --since "1 hour ago"
```

### Post-Installation Verification

```bash
# Version info
docker --version
# Docker version 26.1.4, build 5650f9b

docker compose version
# Docker Compose version v2.27.1

# System info (detailed)
docker info

# Test container
docker run hello-world

# Interactive ubuntu container
docker run -it ubuntu bash

# Nginx web server test
docker run -d -p 8080:80 nginx
curl http://localhost:8080

# Cleanup
docker stop $(docker ps -q)
docker system prune -f
```

### Common Installation Errors & Fixes

| Error | Cause | Fix |
|---|---|---|
| `permission denied while trying to connect` | User not in docker group | `sudo usermod -aG docker $USER && newgrp docker` |
| `Cannot connect to the Docker daemon` | dockerd not running | `sudo systemctl start docker` |
| `dial unix /var/run/docker.sock: connect: no such file` | Docker not installed or not started | Install Docker OR `sudo systemctl start docker` |
| `Failed to connect to bus: No such file` | systemd not available (WSL/container) | Logout and login again, or `sudo service docker start` |
| `E: Package 'docker-ce' has no installation candidate` | Repository not added | Redo steps 3-4 |
| `toomanyrequests` from Docker Hub | Rate limit hit (unauthenticated) | Run `docker login` or use a mirror |

### Docker Rootless Mode

```bash
# Install prerequisites
sudo apt install -y uidmap

# Install rootless Docker (as regular user, NOT sudo)
dockerd-rootless-setuptool.sh install

# Set environment variables
export DOCKER_HOST=unix://$XDG_RUNTIME_DIR/docker.sock
export PATH=$HOME/bin:$PATH

# Add to ~/.bashrc for persistence
echo 'export DOCKER_HOST=unix://$XDG_RUNTIME_DIR/docker.sock' >> ~/.bashrc
echo 'export PATH=$HOME/bin:$PATH' >> ~/.bashrc

# Enable service (user-level systemd)
systemctl --user enable docker
systemctl --user start docker

# Verify
docker info | grep -i rootless
# Should show: rootless: true
```

> **Note:** In security-critical environments, use rootless Docker or Podman. In rootless mode, the impact of container breakout attacks is drastically reduced because the daemon is not root. In Kubernetes environments, configure `securityContext` with non-root users.

### Installation on RHEL / CentOS / Rocky Linux

```bash
# Step 1: Install yum-utils
sudo yum install -y yum-utils

# Step 2: Add Docker repository
sudo yum-config-manager \
  --add-repo \
  https://download.docker.com/linux/centos/docker-ce.repo

# Step 3: Install Docker
sudo yum install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin

# Step 4: Start and enable
sudo systemctl start docker
sudo systemctl enable docker

# Step 5: Post-install
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker run hello-world

# Note: On RHEL 9+, podman is preferred (Docker-compatible CLI)
# podman run hello-world  # Same commands, daemonless!
```

---

## Docker Engine Components — Under the Hood

### Component Stack

The Docker Engine follows this layered stack from top to bottom:

1. **docker CLI** — `docker run / build / push / pull` (makes REST API calls)
2. **dockerd — Docker Daemon** — REST API | `/var/run/docker.sock` | Port 2376 (TLS)
3. **containerd** — Image management | Container lifecycle | `/run/containerd/containerd.sock`
4. **containerd-shim** — Daemonless container I/O | stdout/stderr relay
5. **runc (OCI Runtime)** — syscalls to kernel: `clone()`, `unshare()`, `setns()`
6. **Linux Kernel** — namespaces (pid, net, mnt, uts, ipc) | cgroups (cpu, memory, io)
7. **Container Process** — Your app running as PID 1 inside container

### dockerd — Docker Daemon Deep Dive

```bash
# View dockerd process
ps aux | grep dockerd
# root  1234  ... /usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock

# Socket files
ls -la /var/run/docker.sock             # Unix socket (default)
ls -la /run/containerd/containerd.sock  # containerd socket

# dockerd config file
cat /etc/docker/daemon.json

# Restart dockerd (containers will NOT stop!)
sudo systemctl restart docker

# View dockerd logs
sudo journalctl -u docker.service -n 50 --no-pager
sudo journalctl -u docker.service -f  # Live tail

# Docker events stream
docker events  # Real-time events: container start/stop/die, image pull, etc.
```

**daemon.json — Production Configuration**

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  },
  "default-address-pools": [
    {"base": "172.17.0.0/12", "size": 24}
  ],
  "storage-driver": "overlay2",
  "registry-mirrors": [
    "https://mirror.gcr.io"
  ],
  "insecure-registries": [],
  "live-restore": true,
  "max-concurrent-downloads": 10,
  "max-concurrent-uploads": 5,
  "metrics-addr": "0.0.0.0:9323",
  "experimental": false
}
```

> **Note (Production Must-Haves):** `log-driver + log-opts`: By default Docker logs can consume unlimited disk. Set `max-size: 100m` and `max-file: 3` — total 300MB max per container. `live-restore: true`: Containers will not stop when the Docker daemon restarts. Critical for zero-downtime daemon updates! `storage-driver: overlay2`: Best performance on modern kernels. Also the default on Ubuntu.

### containerd — Detailed

```bash
# Inspect containerd directly
sudo ctr version
sudo ctr namespaces ls         # Docker uses 'moby' namespace
sudo ctr -n moby images ls     # Docker images in containerd
sudo ctr -n moby containers ls # Running containers

# containerd config
cat /etc/containerd/config.toml

# Restart containerd (Docker containers will temporarily stop!)
sudo systemctl restart containerd

# In Kubernetes clusters (containerd directly)
# crictl images         # CRI-compatible CLI
# crictl ps             # Running containers
# crictl inspect <id>   # Container details
```

> **Note (containerd-shim):** containerd-shim is an intermediate process spawned for each container. Its job: (1) relay stdin/stdout/stderr, (2) report exit status, (3) keep the container alive even if the daemon crashes. This is why `live-restore: true` works!

### OCI — Open Container Initiative

| Specification | Defines | Implemented By |
|---|---|---|
| Image Spec | Image format: layers, manifest, config JSON | Docker, containerd, Buildah |
| Runtime Spec | How to run a container: config.json + rootfs | runc, crun, kata-containers |
| Distribution Spec | How images are pushed/pulled from registries | Docker Hub, ECR, GCR, Harbor |

> **Tip (Interview Question):** **Q: "What is the difference between Docker and containerd?"** **A:** Docker is a complete platform (CLI + daemon + build tools + compose). containerd is just a container runtime — lightweight, CRI-compatible, perfect for Kubernetes. Docker internally uses containerd. Kubernetes bypasses the Docker daemon and talks directly to containerd (since v1.24).

---

## Understanding Docker Images

### Image — The Blueprint

An image is an immutable blueprint. Think of it this way: a `class Component extends React.Component` — you don't directly "run" a class, you create an instance. Similarly, Image = Class, Container = Instance. An image is built once, then thousands of containers can be created from it. The image itself never changes.

Technically, a Docker image is a read-only filesystem snapshot + metadata (env vars, exposed ports, entry command), organized in layers — each layer representing an incremental change.

### Image Layers — The Onion Model

```
┌─────────────────────────────────────────┐
│  Container Layer — WRITABLE             │  ← New files, modifications go here.
│  New files, modifications go here.      │    Deleted when container stops.
│  Deleted when container stops.          │
├─────────────────────────────────────────┤
│           ↑ WRITABLE / READ-ONLY ↓      │
├─────────────────────────────────────────┤
│  Layer 4: COPY . /app                   │  ← Your application source code (~5 MB)
├─────────────────────────────────────────┤
│  Layer 3: RUN npm install               │  ← node_modules directory (~80 MB)
├─────────────────────────────────────────┤
│  Layer 2: WORKDIR /app                  │  ← Creates /app directory (metadata only)
├─────────────────────────────────────────┤
│  Layer 1: FROM node:18-alpine           │  ← Base OS + Node.js runtime (~120 MB,
│                                         │    shared with other node images)
└─────────────────────────────────────────┘
  OverlayFS merges all layers → appears as single filesystem to container
```

> **Note:** OverlayFS is a Linux kernel filesystem driver. It merges multiple read-only layers and one read-write layer into a single unified filesystem. The container sees a normal filesystem, but it is actually a stack of layers. Copy-on-Write is used — when a container modifies a file, it is first copied from the read-only layer to the read-write layer (upperdir), then modified.

### Image Manifest and Digest

```bash
# View image manifest (JSON format)
docker manifest inspect nginx:latest

# Image digest — immutable SHA256 reference
docker images --digests nginx
# REPOSITORY   TAG       DIGEST                                                    IMAGE ID
# nginx        latest    sha256:a484819eb60...                                     e784f4560448

# Pull by digest (PRODUCTION BEST PRACTICE)
# Tags can change (latest is mutable), digests never change!
docker pull nginx@sha256:a484819eb60211f5299034ac80f6a681b06f89e65866ce91f356ed7c72af059c

# Tags are mutable — this is dangerous:
docker pull nginx:latest   # Today pulls one version, tomorrow may pull another

# Safe production pull (pinned digest):
docker pull nginx@sha256:exact_digest_from_registry

# Get digest of a local image
docker inspect nginx --format='{{index .RepoDigests 0}}'
```

> **Caution:** The `:latest` tag is a moving target. If you pull today you get 1.25; if CI/CD pulls tomorrow it might get 1.26 — with breaking changes. In production, always pin semantic versions: `nginx:1.25.3-alpine` or use digests. `:latest` is only acceptable for local development.

### Image Storage on Disk

```bash
# Where Docker images are stored on disk
ls /var/lib/docker/

# Image layers (overlay2 storage driver)
sudo ls /var/lib/docker/overlay2/
# Each directory is a layer

# Image metadata
sudo ls /var/lib/docker/image/overlay2/imagedb/content/sha256/
# Each file is an image manifest/config

# Disk usage breakdown — important for DevOps!
docker system df
# TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
# Images          15        3         2.1GB     1.8GB (85%)
# Containers      5         2         45MB      23MB (51%)
# Local Volumes   8         3         560MB     300MB (53%)
# Build Cache     0         0         0B        0B

# Detailed breakdown
docker system df -v

# View layer sharing (images share base layers)
docker history nginx:latest --no-trunc
docker history nginx:alpine --no-trunc
# Common layers are shared — only one copy on disk!
```

### Image Tags vs Digests vs IDs

| Concept | Example | Mutable? | Use Case |
|---|---|---|---|
| Image ID | `e784f4560448` | No (content-addressed) | Local reference, scripting |
| Tag | `nginx:1.25.3` | Yes (can be moved) | Human-readable, dev/staging |
| Digest | `nginx@sha256:abc...` | No (cryptographic) | Production deployments, security |
| latest tag | `nginx:latest` | Yes (frequently moves) | Local dev ONLY, never production |

> **Tip (Interview Question):** **Q: "What is the difference between a Docker image and a container?"** **A:** An image is a read-only blueprint/template — a static filesystem snapshot. A container is a running instance of that image, with a writable layer added on top. You can create thousands of containers from one image. When a container is stopped, the writable layer is deleted (unless committed or a volume is used).

---

## Working with Images — Command Deep Dive

### docker pull — Downloading Images

**Purpose:** Download images from a registry to your local machine. Pull without `docker run` when you want the image without starting a container.

```bash
# Basic pull — pulls latest tag (avoid in production!)
docker pull nginx

# Specific tag pull (recommended)
docker pull nginx:1.25.3-alpine

# Specific digest pull (MOST RECOMMENDED for production)
docker pull nginx@sha256:a484819eb60211f5299034ac80f6a681b06f89e65866ce91f356ed7c72af059c

# Pull from private registry
docker pull myregistry.company.com/myapp:v1.2.3

# Pull from AWS ECR (login first)
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin \
  123456789012.dkr.ecr.ap-south-1.amazonaws.com

docker pull 123456789012.dkr.ecr.ap-south-1.amazonaws.com/myapp:latest

# Pull from GCR
docker pull gcr.io/my-project/myapp:v2.0.0

# Pull from GitHub Container Registry
docker pull ghcr.io/myorg/myapp:main

# Specify platform (ARM/AMD64)
docker pull --platform linux/amd64 nginx:latest
docker pull --platform linux/arm64 nginx:latest  # For Apple Silicon
```

> **Caution:** Always specify a tag when pulling. `docker pull nginx` = `docker pull nginx:latest`. If the `latest` tag is updated tomorrow, your CI/CD will pull a different image. Fix: `docker pull nginx:1.25.3` or use a digest.

### docker images — Listing Images

```bash
# Basic list
docker images
docker image ls  # Same command, new syntax

# Table format with size
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"

# Filter dangling images (untagged, build artifacts)
docker images -f dangling=true

# Filter by label
docker images -f label=env=production

# Image IDs only (useful for scripting)
docker images -q

# Show images for a specific repository
docker images nginx

# Custom format
docker images --format "{{.ID}}: {{.Repository}}:{{.Tag}} — {{.Size}}"

# All images (including intermediates)
docker images -a

# Images with digests
docker images --digests

# Sort by size
docker images --format "{{.Size}}\t{{.Repository}}:{{.Tag}}" | sort -h
```

### docker rmi — Deleting Images

```bash
# Remove by name
docker rmi nginx
docker image rm nginx

# Specify tag (when multiple tags exist)
docker rmi nginx:1.25.3-alpine

# Remove by image ID
docker rmi e784f4560448

# Remove multiple images at once
docker rmi nginx:latest ubuntu:20.04 redis:alpine

# Force remove — even if a container is using it (dangerous!)
docker rmi -f nginx:latest

# Remove dangling images (safe cleanup)
docker image prune

# Remove all unused images (aggressive cleanup)
docker image prune -a

# Remove without confirmation
docker image prune -f
docker image prune -a -f

# Nuclear option — delete all images (careful!)
docker rmi $(docker images -q)

# Delete by age filter
docker image prune -a --filter "until=24h"   # Older than 24 hours
docker image prune -a --filter "until=168h"  # Older than 7 days
```

> **Caution:** An image used by a running container cannot be deleted — `docker rmi` will fail. Stop and remove the container first: `docker stop <container> && docker rm <container>`, then `docker rmi <image>`.

### docker tag — Tagging Images

```bash
# Tag for Docker Hub
docker tag myapp:latest myusername/myapp:v1.0.0
docker tag myapp:latest myusername/myapp:latest

# Tag for AWS ECR
docker tag myapp:latest \
  123456789012.dkr.ecr.ap-south-1.amazonaws.com/myapp:v1.0.0

# Tag for GCR
docker tag myapp:latest gcr.io/my-gcp-project/myapp:v1.0.0

# Tag for GitHub Container Registry
docker tag myapp:latest ghcr.io/myorg/myapp:v1.0.0
docker tag myapp:latest ghcr.io/myorg/myapp:main-abc1234  # Git commit hash

# CI/CD common pattern (git hash + version)
GIT_HASH=$(git rev-parse --short HEAD)
VERSION="1.2.3"
docker tag myapp:latest myregistry.io/myapp:${VERSION}-${GIT_HASH}
docker tag myapp:latest myregistry.io/myapp:${VERSION}
docker tag myapp:latest myregistry.io/myapp:latest
```

> **Tip (Tagging Strategy for CI/CD):** Good tagging strategy: (1) Git commit hash tag — always, immutable and traceable. (2) Semantic version tag. (3) Branch name tag (e.g., `main`, `develop`). (4) `latest` only on main/master branch. This strategy makes both rollback and debugging easy.

### docker save & docker load — Transferring Images

```bash
# Save a single image
docker save -o myapp.tar myapp:latest

# Save multiple images into one tar
docker save -o all-images.tar nginx:latest redis:alpine postgres:15

# Compressed save (saves disk space)
docker save myapp:latest | gzip > myapp.tar.gz

# Load from tar file
docker load -i myapp.tar

# Load compressed
gunzip -c myapp.tar.gz | docker load

# Transfer via SSH (no file on disk!)
docker save myapp:latest | ssh user@remote-server docker load

# Verify loaded image
docker images | grep myapp
```

### docker history — Viewing Image Layers

```bash
# View image history
docker history nginx

# Full commands (not truncated)
docker history --no-trunc nginx

# Custom format
docker history --format "table {{.ID}}\t{{.Size}}\t{{.CreatedBy}}" nginx

# Identify large layers
docker history nginx --format "{{.Size}}\t{{.CreatedBy}}" | \
  grep -v "^0B" | \
  sort -rh | head -5
```

### docker inspect — Deep Inspection

```bash
# Full JSON inspection
docker inspect nginx
docker inspect nginx | jq  # Pretty printed (install jq: sudo apt install jq)

# Extract specific fields (Go template syntax)
docker inspect --format '{{.Config.Env}}' nginx
docker inspect --format '{{.Config.ExposedPorts}}' nginx
docker inspect --format '{{.Config.Cmd}}' nginx

# For containers: get IP address
docker inspect --format '{{.NetworkSettings.IPAddress}}' my_container

# Container mount points
docker inspect --format '{{json .Mounts}}' my_container | jq

# Container restart policy
docker inspect --format '{{.HostConfig.RestartPolicy}}' my_container

# Image layers (layer hashes)
docker inspect nginx | jq '.[0].RootFS.Layers'

# Container environment variables
docker inspect my_container | jq '.[0].Config.Env[]'
```

### docker push — Uploading to Registry

```bash
# Login first
docker login                               # Docker Hub
docker login myregistry.company.com        # Private registry

# AWS ECR login
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin \
  123456789012.dkr.ecr.ap-south-1.amazonaws.com

# GitHub Container Registry login
echo $GITHUB_TOKEN | docker login ghcr.io -u $GITHUB_USERNAME --password-stdin

# Push
docker push myusername/myapp:v1.0.0
docker push myusername/myapp:latest

# Push multiple tags (loop)
for TAG in v1.0.0 v1.0 v1 latest; do
  docker push myregistry.io/myapp:${TAG}
done

# Logout (for security on shared machines)
docker logout
docker logout myregistry.company.com
```

---

## Image Layers Deep Dive — Caching & Optimization

<figure class="dgm" role="img" aria-label="Stacked layer diagram showing a Docker image built from four layers bottom to top: Base OS (node:18-alpine), Dependencies (npm install), Application code (COPY src), and a writable Container layer on top, with cache-hit annotations on the lower stable layers and a cache-miss annotation on the top app-code layer">
<svg viewBox="0 0 680 290" width="680" height="290" xmlns="http://www.w3.org/2000/svg">
  <!-- Layer 1: Base -->
  <rect x="60" y="220" width="400" height="44" rx="7" class="dgm-surface-2" stroke="none"/>
  <rect x="60" y="220" width="400" height="44" rx="7" fill="none" stroke-width="1.5" class="dgm-stroke"/>
  <text x="260" y="240" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">Layer 1 — FROM node:18-alpine</text>
  <text x="260" y="256" text-anchor="middle" font-size="10" class="dgm-muted">Base OS + Node runtime · ~120 MB · shared across images</text>
  <!-- Cache hit badge layer 1 -->
  <rect x="478" y="228" width="82" height="22" rx="6" class="dgm-accent-soft" stroke="none"/>
  <rect x="478" y="228" width="82" height="22" rx="6" fill="none" stroke-width="1.5" class="dgm-accent-stroke"/>
  <text x="519" y="244" text-anchor="middle" font-size="10" font-weight="bold" class="dgm-ink">cache HIT ✓</text>
  <!-- Layer 2: Deps -->
  <rect x="60" y="168" width="400" height="44" rx="7" class="dgm-surface-2" stroke="none"/>
  <rect x="60" y="168" width="400" height="44" rx="7" fill="none" stroke-width="1.5" class="dgm-stroke"/>
  <text x="260" y="188" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">Layer 2 — RUN npm install</text>
  <text x="260" y="204" text-anchor="middle" font-size="10" class="dgm-muted">node_modules · ~80 MB · cached when package.json unchanged</text>
  <!-- Cache hit badge layer 2 -->
  <rect x="478" y="176" width="82" height="22" rx="6" class="dgm-accent-soft" stroke="none"/>
  <rect x="478" y="176" width="82" height="22" rx="6" fill="none" stroke-width="1.5" class="dgm-accent-stroke"/>
  <text x="519" y="192" text-anchor="middle" font-size="10" font-weight="bold" class="dgm-ink">cache HIT ✓</text>
  <!-- Layer 3: App code -->
  <rect x="60" y="116" width="400" height="44" rx="7" class="dgm-surface-2" stroke="none"/>
  <rect x="60" y="116" width="400" height="44" rx="7" fill="none" stroke-width="1.5" class="dgm-stroke"/>
  <text x="260" y="136" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">Layer 3 — COPY . /app</text>
  <text x="260" y="152" text-anchor="middle" font-size="10" class="dgm-muted">Application source code · changes frequently</text>
  <!-- Cache miss badge layer 3 -->
  <rect x="478" y="124" width="82" height="22" rx="6" class="dgm-surface-2" stroke="none"/>
  <rect x="478" y="124" width="82" height="22" rx="6" fill="none" stroke-width="1.5" class="dgm-muted-stroke"/>
  <text x="519" y="140" text-anchor="middle" font-size="10" font-weight="bold" class="dgm-muted">cache MISS ✗</text>
  <!-- Container writable layer -->
  <rect x="60" y="58" width="400" height="44" rx="7" class="dgm-accent-soft" stroke="none"/>
  <rect x="60" y="58" width="400" height="44" rx="7" fill="none" stroke-width="1.5" class="dgm-accent-stroke"/>
  <text x="260" y="78" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">Container Layer — WRITABLE (OverlayFS upperdir)</text>
  <text x="260" y="94" text-anchor="middle" font-size="10" class="dgm-muted">Runtime writes · CoW · deleted when container is removed</text>
  <!-- Up arrows between layers -->
  <line x1="260" y1="216" x2="260" y2="214" stroke-width="2" class="dgm-ink-stroke"/>
  <line x1="260" y1="216" x2="260" y2="164" stroke-width="1.5" class="dgm-ink-stroke"/>
  <polygon points="255,165 260,154 265,165" class="dgm-ink"/>
  <line x1="260" y1="164" x2="260" y2="112" stroke-width="1.5" class="dgm-ink-stroke"/>
  <polygon points="255,113 260,102 265,113" class="dgm-ink"/>
  <line x1="260" y1="112" x2="260" y2="104" stroke-width="1.5" class="dgm-ink-stroke"/>
  <polygon points="255,105 260,94 265,105" class="dgm-ink"/>
  <!-- Read-only label -->
  <text x="22" y="200" text-anchor="middle" font-size="10" class="dgm-muted" transform="rotate(-90,22,200)">READ-ONLY</text>
  <!-- Writable label -->
  <text x="22" y="80" text-anchor="middle" font-size="10" class="dgm-accent" transform="rotate(-90,22,80)">WRITABLE</text>
</svg>
<figcaption>Place stable layers (base image, dependencies) below volatile ones (source code) so Docker's layer cache is reused on every incremental build.</figcaption>
</figure>

### OverlayFS — Technical Deep Dive

| OverlayFS Component | Docker Equivalent | Description |
|---|---|---|
| `lowerdir` | Image layers (read-only) | Base image + all intermediate layers — never modified |
| `upperdir` | Container's writable layer | Container-specific changes go here |
| `workdir` | Internal OverlayFS use | Staging area for atomic operations |
| `merged` | Container's filesystem view | Unified mount — what the container sees |

```bash
# View OverlayFS mount for a running container
docker run -d --name mynginx nginx

# Get mount info
docker inspect mynginx | jq '.[0].GraphDriver'
# {
#   "Data": {
#     "LowerDir": "/var/lib/docker/overlay2/abc.../diff:/var/lib/docker/overlay2/def.../diff",
#     "MergedDir": "/var/lib/docker/overlay2/xyz.../merged",
#     "UpperDir": "/var/lib/docker/overlay2/xyz.../diff",
#     "WorkDir": "/var/lib/docker/overlay2/xyz.../work"
#   },
#   "Name": "overlay2"
# }

# View actual filesystem layering on host
sudo ls /var/lib/docker/overlay2/

# View mount point on host
cat /proc/mounts | grep overlay

# Demonstrate Copy-on-Write
docker exec mynginx sh -c "echo 'hello' > /usr/share/nginx/html/test.html"
# The file went into the container's upperdir, NOT into the image.
# The image remains unchanged.
```

### Layer Caching — The Secret of Build Speed

```bash
# First build — everything downloaded and executed (slow)
docker build -t myapp:v1 .
# Step 1/5 : FROM node:18-alpine      → DOWNLOADING (slow)
# Step 2/5 : WORKDIR /app             → Running
# Step 3/5 : COPY package*.json ./    → Running
# Step 4/5 : RUN npm install          → Installing (slow!)
# Step 5/5 : COPY . .                 → Running

# Second build (only source code changed)
docker build -t myapp:v2 .
# Step 1/5 : FROM node:18-alpine      → Using cache  ✓ (instant!)
# Step 2/5 : WORKDIR /app             → Using cache  ✓ (instant!)
# Step 3/5 : COPY package*.json ./    → Using cache  ✓ (package.json unchanged)
# Step 4/5 : RUN npm install          → Using cache  ✓ (instant!)
# Step 5/5 : COPY . .                 → Running      ← Only this re-runs!
# Total time: 2 seconds vs 3 minutes!

# Force bypass cache
docker build --no-cache -t myapp:fresh .

# Use cache from external source (CI/CD optimization)
docker build \
  --cache-from myregistry.io/myapp:latest \
  -t myapp:new .
```

### Cache Invalidation — When Cache Breaks

| Instruction | Cache Invalidates When | Note |
|---|---|---|
| `FROM` | Base image digest changes | Rarely — unless you explicitly pull new base |
| `RUN` | Command text changes | Even whitespace change = cache miss! |
| `COPY / ADD` | File content changes (checksum) | Even 1 byte change = cache miss for this layer + all subsequent |
| `ENV` | Value changes | All subsequent layers also invalidated |
| `ARG` | Build arg value changes | Be careful with VERSION args — they invalidate builds |
| `WORKDIR` | Path changes | Usually stable |

> **Caution:** A cache miss in one layer causes ALL subsequent layers to re-run. This is why layer ordering is so important — put frequently changing instructions last, stable instructions first.

### Layer Ordering — Cache Optimization

```dockerfile
# ❌ BAD — npm install runs EVERY TIME any file changes
FROM node:18-alpine
WORKDIR /app
COPY . .           # Source code AND package.json copied together
RUN npm install    # Re-runs even if only App.jsx changed!
```

```dockerfile
# ✅ GOOD — npm install only when package.json changes
FROM node:18-alpine
WORKDIR /app

# Step 1: Copy ONLY package files first
COPY package.json package-lock.json ./

# Step 2: Install dependencies (CACHED as long as package.json is unchanged)
RUN npm install

# Step 3: Now copy source code (this layer changes with source changes)
COPY . .

# Build
RUN npm run build

# Serve
CMD ["node", "server.js"]
```

```dockerfile
# ✅ BEST — Python/pip example follows the same principle
FROM python:3.11-slim
WORKDIR /app

# Dependencies first (stable layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Source code later (frequently changing)
COPY . .

CMD ["python", "app.py"]
```

```dockerfile
# ✅ BEST — Java/Maven example
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app

# Copy pom.xml first (dependencies are stable)
COPY pom.xml .
RUN mvn dependency:go-offline -q  # Download all dependencies (cached!)

# Source code later
COPY src ./src
RUN mvn package -q -DskipTests

FROM eclipse-temurin:17-jre-alpine
COPY --from=build /app/target/*.jar app.jar
CMD ["java", "-jar", "app.jar"]
```

> **Note (Golden Rule of Layer Ordering):** Think of it this way: "What changes least goes first." Order of stability: Base image > System packages > Dependency files > Dependencies install > Config files > Source code > Build artifacts. Following this order will dramatically speed up CI/CD builds.

### Layer Sharing — Memory & Disk Efficiency

When 50 Node.js microservices all use the same `node:18-alpine` base image:
- Without sharing: 50 × 120MB = 6 GB
- With Docker layer sharing: 120MB (base, stored once) + 50 × app_size

This means more containers fit per Kubernetes node, node startup is faster (layer already cached), and network bandwidth is saved during pulls.

### Layer Analysis Tools

```bash
# Method 1: docker history (built-in)
docker history --no-trunc myapp:latest

# Method 2: docker inspect layers
docker inspect myapp:latest | jq '.[0].RootFS.Layers'

# Method 3: dive tool (BEST for optimization)
# Installation
wget https://github.com/wagoodman/dive/releases/download/v0.12.0/dive_0.12.0_linux_amd64.deb
sudo apt install ./dive_0.12.0_linux_amd64.deb

# Interactive layer analysis
dive myapp:latest
# Left panel: layer list + size
# Right panel: filesystem changes per layer
# Shows wasted space — e.g., files deleted in later layers
# Gives an efficiency score

# CI mode (automated check)
dive myapp:latest --ci   # Fails if efficiency is below threshold

# Method 4: BuildKit inline --progress=plain
DOCKER_BUILDKIT=1 docker build --progress=plain -t myapp:latest .
# Shows each step's timing and cache status
```

### Advanced Layer Optimization Techniques

```dockerfile
# Technique 1: Combine RUN commands (fewer layers)
# ❌ BAD — 3 layers for apt operations
RUN apt update
RUN apt install -y curl wget
RUN rm -rf /var/lib/apt/lists/*

# ✅ GOOD — Single layer, cleanup in SAME layer
RUN apt update && \
    apt install -y curl wget && \
    rm -rf /var/lib/apt/lists/*
# IMPORTANT: Cleanup must be in the SAME RUN instruction!
# Cleaning in a separate RUN does NOT reduce layer size
# (the layer with apt cache already exists)

# Technique 2: Multi-stage builds (drastically reduce SIZE)
# Build stage
FROM node:18 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false  # All deps including devDependencies
COPY . .
RUN npm run build               # Create production build

# Production stage (runtime only!)
FROM node:18-alpine             # Slim base (50MB vs 1GB!)
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
# Build tools, devDeps, source code do not go into the production image!
EXPOSE 3000
CMD ["node", "dist/server.js"]

# Result: 1.2GB → 180MB image!

# Technique 3: .dockerignore (like .gitignore for Docker)
# node_modules/      ← exclude from COPY
# .git/              ← unnecessary
# dist/              ← build output (will be rebuilt)
# *.log              ← log files
# .env               ← Secrets! NEVER in image
# coverage/          ← test coverage reports

# Technique 4: Specific COPY (avoid COPY . .)
# ❌ BAD
COPY . .              # Copies everything including .git, tests, docs

# ✅ GOOD
COPY src/ ./src/
COPY public/ ./public/
COPY package*.json ./
```

> **Tip (Senior Interview Question):** **Q: "A Docker image has grown to 2GB — how would you optimize it?"** **A:** (1) Use `docker history --no-trunc myimage` to identify large layers. (2) Use multi-stage builds — don't include build tools in production. (3) Use Alpine base image (50MB vs 900MB). (4) Run `apt-get clean && rm -rf /var/lib/apt/lists/*` in the same RUN instruction. (5) Use `.dockerignore` to exclude unnecessary files. (6) Use the `dive` tool to find wasted space. (7) Combine RUN instructions. Typically, 2GB → 150-200MB is achievable!

---

## Container Lifecycle

### Container States

Every Docker container passes through multiple states during its life. Think of them like React component lifecycle (mount, update, unmount) — but more complex:

- **CREATED** — Container created via `docker create` but not started
- **RUNNING** — Container is active
- **PAUSED** — Frozen, consuming no CPU
- **EXITED** — Stopped or done (via `docker stop`, `docker kill`, exit, or crash)
- **RESTARTING** — Auto-restart loop in progress
- **DEAD** — Restart attempts failed, max retries exceeded
- **REMOVED** — Container permanently deleted via `docker rm`

### Image vs Container

| Aspect | Image | Container |
|---|---|---|
| **Nature** | Blueprint / Template | Running instance |
| **State** | Immutable, static (never changes) | Mutable, stateful (can change) |
| **Storage** | Read-only layers | Image layers + writable layer on top |
| **Multiple instances** | Shared by all containers using it | Each container fully independent |
| **Lifecycle** | Build once, use forever | Create → Run → Stop → Delete |
| **Disk space** | Stored once even if 100 containers use it | Only writable layer extra per container |
| **Analogy** | Recipe | The actual dish |
| **React analogy** | React Component class/function | Component instance rendered in DOM |

### Container Lifecycle Commands — Quick Reference

```bash
# Full lifecycle — a container's complete journey
docker create --name myapp nginx          # Create but don't start
docker start myapp                        # Start it
docker pause myapp                        # Freeze it (stops CPU usage)
docker unpause myapp                      # Unfreeze it
docker stop myapp                         # Graceful stop (SIGTERM then SIGKILL)
docker start myapp                        # Start again
docker restart myapp                      # Stop + Start in one command
docker kill myapp                         # Immediate kill (SIGKILL)
docker rm myapp                           # Remove container (permanently delete)

# One-liner (create + start + remove when done — for temporary tasks)
docker run --rm --name temp-app nginx

# Check current state of all containers
docker ps -a
```

> **Tip:** `docker run` = `docker create` + `docker start` + `docker attach` (in foreground mode). CI/CD pipelines almost always use `docker run`. `docker create` is useful when you want to set up a container first and start it later.

> **Caution:** If a container enters the DEAD state, it cannot be restarted. You can only remove it with `docker rm`. This happens when restart policy max retries are exhausted. Monitor DEAD containers in production!

---

## Essential Container Commands

### docker run — The Master Command

`docker run` creates a container, starts it, and optionally attaches to it. Understanding its options is essential.

```bash
# Full syntax
docker run [OPTIONS] IMAGE [COMMAND] [ARG...]

# -d: Detached mode (run in background)
docker run -d nginx
docker run -d --name my-nginx nginx

# -p: Port mapping (host_port:container_port)
docker run -d -p 8080:80 nginx             # Host 8080 → Container 80
docker run -d -p 127.0.0.1:8080:80 nginx  # Bind to specific IP
docker run -d -p 8080:80 -p 443:443 nginx # Multiple ports
docker run -d -P nginx                     # Auto-map ALL EXPOSED ports

# -v: Volume mount (old syntax)
docker run -d -v /host/path:/container/path nginx
docker run -d -v myvolume:/app/data nginx
docker run -d -v $(pwd):/app node:18       # Mount current directory

# --mount: Volume mount (new, preferred syntax)
docker run -d --mount type=bind,source=/host/path,target=/container/path nginx
docker run -d --mount type=volume,source=myvolume,target=/data nginx
docker run -d --mount type=tmpfs,target=/tmp nginx

# -e: Environment variables
docker run -d -e NODE_ENV=production node:18
docker run -d -e DB_HOST=localhost -e DB_PORT=5432 myapp
docker run -d --env-file .env myapp        # Load from .env file

# --name: Give the container a name
docker run -d --name my-api myapp:v1.0

# --rm: Automatically remove when it exits
docker run --rm ubuntu echo "hello"        # Perfect for one-off commands
docker run --rm -v $(pwd):/app node:18 npm test

# --network: Connect to a network
docker run -d --network mynetwork nginx
docker run -d --network host nginx         # Use host machine's network

# --restart: Restart policy
docker run -d --restart no nginx              # Never restart (default)
docker run -d --restart always nginx          # Always restart
docker run -d --restart on-failure nginx      # Restart only on failure
docker run -d --restart on-failure:3 nginx    # Max 3 retries
docker run -d --restart unless-stopped nginx  # Restart unless manually stopped

# -it: Interactive Terminal (enter the container)
docker run -it ubuntu bash               # Start bash session
docker run -it --rm ubuntu bash          # Session ends → container deleted
docker run -it node:18 node              # Node.js REPL

# Resource Limits (CRITICAL IN PRODUCTION!)
docker run -d --memory=512m nginx              # Max 512MB RAM
docker run -d --memory=512m --memory-swap=1g nginx  # RAM + swap limit
docker run -d --cpus=0.5 nginx                 # 50% of one CPU
docker run -d --cpus=2 nginx                   # 2 full CPUs

# --user: Run as a specific user (security)
docker run -d --user 1000:1000 nginx
docker run -d --user nobody nginx

# Real-world Production Example — all together
docker run -d \
  --name my-react-app \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e API_URL=https://api.myapp.com \
  -v /var/log/app:/app/logs \
  --memory=256m \
  --cpus=0.5 \
  --restart unless-stopped \
  --network app-network \
  myreactapp:v1.2.3
```

> **Note (Production):** Without resource limits, a single buggy container can consume all server memory. A memory limit means the OOM killer will kill the container — not the entire server. CPU limits ensure fair sharing between containers.

### docker ps — List Containers

```bash
# Running containers only
docker ps

# ALL containers (including stopped)
docker ps -a

# IDs only (useful in scripts)
docker ps -q

# Last 5 created containers
docker ps -n 5

# Custom format
docker ps --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}"
docker ps --format "{{.Names}}: {{.Status}}"

# Filter by status
docker ps -f status=running
docker ps -f status=exited
docker ps -f name=myapp
docker ps -f ancestor=nginx       # Containers using nginx image

# Show container sizes
docker ps -s
```

### docker stop / start / restart

```bash
# Graceful stop — sends SIGTERM, waits 10 sec, then SIGKILL
docker stop myapp
docker stop --time=30 myapp       # Wait 30 sec before SIGKILL

# Stop multiple containers at once
docker stop container1 container2 container3

# Stop all running containers
docker stop $(docker ps -q)

# Start a stopped container
docker start myapp
docker start -a myapp             # Start + attach to output

# Restart = stop + start
docker restart myapp
docker restart --time=5 myapp     # Wait 5 sec before SIGKILL
```

### docker pause / unpause — Freeze a Container

```bash
# Freeze container (uses cgroups freezer)
# Container state is preserved, no CPU consumed
docker pause myapp

# Unfreeze — container continues from where it left off
docker unpause myapp

# When to use:
# - Load testing: pause one container, test another
# - Debug: capture exact state without losing data
# - Resource saving: temporarily free CPU
```

> **Note:** `docker pause` = process freeze (still in memory, state preserved, no CPU). `docker stop` = process terminate (SIGTERM → SIGKILL). Unpause is very fast because the process doesn't restart — it just unfreezes.

### docker kill — Immediate Termination

```bash
# Immediate kill (SIGKILL — no grace period)
docker kill myapp

# Send a specific signal
docker kill --signal=SIGTERM myapp    # Graceful shutdown request
docker kill --signal=SIGHUP myapp     # Nginx config reload (without restart!)
docker kill --signal=9 myapp          # SIGKILL (same as default kill)
docker kill --signal=SIGUSR1 myapp    # App-specific custom signal
```

### docker rm — Remove Containers

```bash
# Remove a stopped container
docker rm myapp

# Force remove a running container (think before you do this!)
docker rm -f myapp

# Remove container and its anonymous volume
docker rm -v myapp

# Remove all stopped containers at once (recommended!)
docker container prune
docker rm $(docker ps -aq -f status=exited)

# Remove ALL containers (running + stopped) — nuclear option!
docker rm -f $(docker ps -aq)
```

### docker logs — View Logs (First Debug Tool)

When something is not working, look at logs first!

```bash
# Basic logs
docker logs myapp

# Follow (like tail -f, real-time updates)
docker logs -f myapp

# Last 100 lines only
docker logs --tail 100 myapp

# Show with timestamps
docker logs -t myapp

# Logs since a specific time
docker logs --since 2024-01-01 myapp
docker logs --since 1h myapp              # Last 1 hour of logs

# Most useful combination — last 50 lines follow with timestamps
docker logs -f -t --tail 50 myapp
```

> **Tip:** `docker logs` works when the application writes to stdout/stderr. If the app writes to a file (e.g., `/var/log/app.log`), use `docker exec -it myapp tail -f /var/log/app.log`, or mount a volume and read from the host.

### docker exec — Enter a Running Container

This command is used daily for debugging. Enter a running container and investigate.

```bash
# Run a command inside the container
docker exec myapp ls /app
docker exec myapp cat /etc/nginx/nginx.conf

# Interactive bash session (most common use case)
docker exec -it myapp bash

# Alpine-based containers: use sh (bash not available)
docker exec -it myapp sh

# Login as root (when full access is needed)
docker exec -it --user root myapp bash

# With environment variable
docker exec -e DEBUG=true myapp node debug.js

# Real-world examples
docker exec -it postgres psql -U admin -d mydb    # Enter PostgreSQL
docker exec -it redis redis-cli                   # Open Redis CLI
docker exec -it nginx nginx -t                    # Test nginx config
docker exec -it nginx nginx -s reload             # Gracefully reload nginx
docker exec -it myapp cat /app/config.json        # Read config file
docker exec -it myapp env                         # View all env variables
docker exec -it myapp ps aux                      # View running processes
```

> **Caution:** `docker exec` starts a new process inside the container. `docker attach` connects to the container's main process — pressing Ctrl+C will STOP the container! For debugging, always use `exec`.

### docker inspect — Extract Full Details

```bash
# Full JSON info
docker inspect myapp

# Extract specific info with Go templates
docker inspect --format '{{.NetworkSettings.IPAddress}}' myapp
docker inspect --format '{{.Config.Env}}' myapp
docker inspect --format '{{.Config.Image}}' myapp
docker inspect --format '{{.State.StartedAt}}' myapp

# Port mappings
docker inspect --format '{{json .NetworkSettings.Ports}}' myapp | jq

# Volume/mount info
docker inspect --format '{{json .Mounts}}' myapp | jq

# Container exit code (for debugging)
docker inspect --format '{{.State.ExitCode}}' myapp
```

### docker top, docker stats, docker cp, docker commit

```bash
# View processes inside container (from host, without entering container)
docker top myapp
docker top myapp aux
docker top myapp -ef

# Real-time resource usage (live dashboard)
docker stats
docker stats myapp
docker stats --no-stream          # One snapshot
docker stats --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# Copy files between container and host
docker cp myapp:/app/config.json ./config.json     # Container → host
docker cp ./config.json myapp:/app/config.json     # Host → container
docker cp myapp:/var/log/app.log ./app.log
# Works with stopped containers too!

# Create a new image from a modified container
docker commit myapp myapp-modified:v2
docker commit -m "Added custom nginx config" -a "Author" myapp myapp:custom
# NOTE: Use Dockerfiles in production — docker commit is not reproducible!
```

---

## Container Operations — Advanced Concepts

### Foreground vs Background — Attached vs Detached Mode

```bash
# Foreground (attached) — output visible, Ctrl+C stops the container
docker run nginx
# Terminal is blocked, nginx logs appear here

# Background (detached) — runs in background, terminal is free
docker run -d nginx
# Returns container ID, you can do other work

# Attach to a running container's output
docker attach myapp
# WARNING: Ctrl+C stops the container!
# To detach without stopping: Ctrl+P then Ctrl+Q
```

### Detaching Without Stopping — Critical Shortcut

```bash
# Start an interactive session
docker run -it ubuntu bash

# To leave WITHOUT stopping the container:
# Press Ctrl+P then Ctrl+Q (both quickly)
# Container keeps running, you get your terminal back

# Return later
docker attach ubuntu_container_name

# exec vs attach — which to use?
# exec — starts a new process (SAFE, always use this)
docker exec -it myapp bash

# attach — connects to main process (RISKY for debugging)
docker attach myapp   # Ctrl+C = container STOP!
```

> **Caution:** New users often use `docker attach` and then press Ctrl+C thinking they are only detaching from the terminal — but the container STOPS! In production, always use `docker exec -it myapp bash`. If you must use attach, detach with `Ctrl+P Ctrl+Q`.

### Container Exit Codes

Exit codes tell you why a container stopped. Visible in `docker ps -a` in the STATUS column as "Exited (137)".

| Exit Code | Meaning | Common Cause |
|---|---|---|
| **0** | Success | Container completed its task successfully |
| **1** | General Error | Application crash, unhandled exception, startup failure |
| **125** | Docker daemon error | Invalid `docker run` options, Docker internal error |
| **126** | Command can't execute | Permission error — command found but not executable |
| **127** | Command not found | Wrong command or PATH issue, typo in CMD/ENTRYPOINT |
| **130** | Ctrl+C (SIGINT) | Manual interruption |
| **137** | SIGKILL (128+9) | OOM killer or docker kill / docker stop timeout |
| **139** | Segmentation fault | Application memory error |
| **143** | SIGTERM (128+15) | docker stop — graceful shutdown signal |

> **Tip:** Signal-based exit codes = 128 + signal_number. SIGKILL = signal 9, exit code = 137. SIGTERM = signal 15, exit code = 143. Exit 137 almost always means OOM or force kill.

### Restart Policies — Detailed

```bash
# no (default) — Never restart
docker run --restart no nginx
# Use case: one-off scripts, batch jobs, dev environment

# always — Always restart (ignores exit code)
docker run --restart always nginx
# Note: Also auto-starts on Docker daemon restart!
# Use case: critical services that must always be running

# on-failure — Restart only on failure (non-zero exit)
docker run --restart on-failure nginx         # Unlimited retries
docker run --restart on-failure:5 nginx       # Max 5 retries, then DEAD
# Use case: services that may occasionally crash

# unless-stopped — Like always, but respects manual stop
docker run --restart unless-stopped nginx
# docker stop → will NOT restart on daemon restart
# Use case: Production services (RECOMMENDED for most cases)

# Change policy on a running container (no restart required)
docker update --restart unless-stopped myapp
docker update --restart no myapp              # Disable restart
```

| Policy | Restart on crash? | Restart on daemon restart? | Restart after docker stop? |
|---|---|---|---|
| `no` | Never | No | No |
| `always` | Yes | Yes | Yes (even after docker stop!) |
| `on-failure` | Yes (non-zero exit only) | Yes (if was running) | No |
| `unless-stopped` | Yes | Yes | No (respects manual stop) |

### Resource Monitoring

```bash
# Real-time stats dashboard (updates every 1 second)
watch -n 1 docker stats --no-stream

# Docker system overall usage
docker system df              # Disk usage — images, containers, volumes, build cache
docker system events          # Live event stream
docker system info            # Complete Docker system info

# Monitor events (powerful debugging tool)
docker events                              # All events real-time
docker events --filter 'type=container'   # Container events only
docker events --filter 'event=die'        # Container deaths
docker events --filter 'event=start'      # Container starts
docker events --since 1h                  # Events from last 1 hour

# Container health check status
docker inspect --format '{{.State.Health.Status}}' myapp
docker inspect --format '{{json .State.Health}}' myapp | jq
```

### Cleanup Commands

```bash
# Check disk usage first
docker system df
# TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
# Images          25        3         12.5GB    10.2GB (82%)
# Containers      8         2         150MB     130MB (86%)
# Local Volumes   15        3         4.2GB     3.8GB (90%)
# Build Cache     -         -         2.1GB     2.1GB

# Individual cleanup (specific resources)
docker container prune                      # Remove stopped containers
docker image prune                          # Remove dangling images
docker image prune -a                       # Remove all unused images
docker volume prune                         # Remove unused volumes
docker network prune                        # Remove unused networks

# Nuclear options — use carefully!
docker system prune                         # Remove everything unused (no volumes)
docker system prune -a --volumes            # Remove everything including volumes

# Non-interactive (for CI/CD scripts)
docker system prune -f
docker system prune -af --volumes           # Full nuclear, no confirmation

# Smart cleanup — only remove old items
docker container prune --filter "until=24h"    # Containers older than 24 hours
docker image prune --filter "until=168h"       # Dangling images older than 1 week
docker system prune --filter "until=72h"       # Everything older than 3 days
```

> **Caution (Production Cleanup Strategy):** On CI/CD servers, set up a daily cron job: `0 2 * * * docker system prune -f`. On production servers, only `docker container prune` and `docker image prune` are safe — **never run `docker volume prune` on production!** An accidental `docker volume prune` has permanently deleted production data for multiple teams.

> **Tip (Interview — SIGTERM vs SIGKILL):** `docker stop` first sends **SIGTERM** — a graceful shutdown request. The application has 10 seconds to clean up (close connections, complete in-flight requests, flush data). If it doesn't exit within 10 seconds, **SIGKILL** is sent — forced termination, no cleanup. `docker kill` sends **SIGKILL** directly — no grace period. Use `docker stop` in production so applications can shut down properly. In Node.js: `process.on('SIGTERM', gracefulShutdown)`. Exit codes: SIGTERM = 143, SIGKILL = 137.

---

## Dockerfile Basics

### What is a Dockerfile?

A Dockerfile is a text file containing instructions for how to build an image. Think of it as a recipe card — ingredients and steps. Each instruction creates a layer, and layers together form the final Docker image.

**Why build a custom image?**
- Your app requires a specific Node/Python version
- Custom environment variables or config are needed
- Pre-installed tools (curl, git, etc.) are required
- You need a production-ready, minimal image
- Security hardening — non-root user, read-only filesystem
- Reproducible builds — every developer gets the same environment

### Where to put the Dockerfile

Usually in the project root — the same directory as `package.json` or `requirements.txt`.

```
my-project/
├── Dockerfile          ← here
├── Dockerfile.dev      ← for dev environment
├── Dockerfile.prod     ← for prod environment
├── .dockerignore       ← CRITICAL! Never forget this
├── package.json
├── src/
└── dist/
```

### docker build — Building an Image

```bash
# Build with current dir as context
docker build -t myapp:latest .

# Build with specific Dockerfile
docker build -f Dockerfile.prod -t myapp:prod .

# Build from a remote Git repo
docker build -t myapp https://github.com/user/repo.git

# Build with no cache (fresh build)
docker build --no-cache -t myapp .

# Build with build args
docker build --build-arg NODE_ENV=production -t myapp .

# Build with multiple tags
docker build -t myapp:latest -t myapp:v1.0.0 .

# Build with verbose output (useful for CI)
docker build --progress=plain -t myapp .
```

> **Tip:** When you write `docker build -t myapp .`, the `.` (dot) is the build context — all files in this directory are sent to the Docker daemon. If your `node_modules` is 500MB and you have no `.dockerignore`, that entire directory gets sent. This is why `.dockerignore` is critical.

### .dockerignore — Never Skip This

This file works exactly like `.gitignore` — it tells the Docker daemon which files to exclude from the build context.

> **Caution:** Never let `.env` files into a Docker image. If `AWS_SECRET_KEY` or a database password ends up in an image, anyone can run `docker history myapp` and see it — even if you deleted it in a later layer!

```dockerfile
# .dockerignore - put this in EVERY project!

# Dependencies (will be installed inside container)
node_modules/
vendor/
__pycache__/
*.pyc
.pytest_cache/
venv/
.venv/

# Build outputs
dist/
build/
.next/
out/
target/

# Environment files (SECURITY RISK!)
.env
.env.local
.env.*.local
.env.development
.env.production
*.pem
*.key
secrets/

# Version control
.git/
.gitignore

# Logs
*.log
logs/

# OS files
.DS_Store
Thumbs.db

# IDE/Editor files
.idea/
.vscode/

# CI/CD & Docker meta
.github/
.dockerignore
Dockerfile*

# Documentation
README.md
*.md
docs/

# Test & Coverage
coverage/
.nyc_output
__tests__/
```

### Build Cache

Docker caches every layer. If a layer has not changed, Docker uses the cache — builds become very fast.

| Scenario | Result | Speed |
|---|---|---|
| Layer unchanged | Cache HIT | Instant |
| Layer changed | Cache MISS | Slow (rebuild) |
| After a cache miss, all subsequent layers | Force rebuild | Slow |
| `--no-cache` flag | Skip all cache | Slowest |

> **Tip:** What changes least goes on top. What changes most (source code) goes at the bottom. If `package.json` hasn't changed, npm install won't re-run — only source code copy will.

### Image Naming Conventions

```bash
# Tag formats
myapp:latest           # ❌ Avoid in production!
myapp:v1.0.0           # ✅ Semantic version (recommended)
myapp:1.0.0-alpine     # ✅ Version + variant
myapp:2024-01-15       # ✅ Date-based
myapp:abc1234          # ✅ Git commit hash (traceable)
myapp:prod-v1.2.3      # ✅ Environment-specific

# With registry
docker.io/myuser/myapp:v1.0.0          # Docker Hub
ghcr.io/myorg/myapp:v1.0.0            # GitHub Container Registry
123456.dkr.ecr.us-east-1.amazonaws.com/myapp:v1.0.0  # AWS ECR

# Build with git commit tag (common in CI/CD)
docker build -t myapp:$(git rev-parse --short HEAD) .
```

> **Caution:** Using `:latest` in production means if you push a new image with `:latest`, any server that restarts will pull the new image — without any warning! Always use specific version tags for reproducible deployments.

---

## Dockerfile Instructions — Deep Dive

### FROM — Every Dockerfile Starts Here

```dockerfile
# Basic — always specify a version
FROM ubuntu:22.04

# Specific digest (production best practice — immutable!)
FROM ubuntu@sha256:abc123def456...

# Multi-stage naming (used later with COPY --from)
FROM node:18-alpine AS builder
FROM nginx:alpine AS production

# ARG before FROM (dynamic base image version)
ARG NODE_VERSION=18
FROM node:${NODE_VERSION}-alpine

# ✅ BEST: Pinned version + variant
FROM node:18.19.0-alpine3.19

# ❌ BAD: Unpredictable, breaks builds
FROM node:latest
```

> **Tip (Alpine vs Slim vs Full):** **alpine**: uses musl libc, 5MB, fastest — but some native modules may not compile. **slim**: Debian-based, ~75MB, more compatible. **full**: Most compatible, but large image. For most Node.js apps: start with `node:18-alpine`.

### LABEL — Image Metadata

```dockerfile
# ✅ BEST: All together in one layer
LABEL \
  maintainer="you@company.com" \
  version="1.0.0" \
  description="React DevOps Guide App" \
  org.opencontainers.image.source="https://github.com/user/repo" \
  org.opencontainers.image.created="2024-01-15" \
  org.opencontainers.image.revision="abc1234"

# Inspect labels
docker inspect myapp --format='{{json .Config.Labels}}'
```

### RUN — Execute Commands

```dockerfile
# Shell form (runs in /bin/sh -c)
RUN apt-get update

# Exec form (no shell — preferred for clarity)
RUN ["apt-get", "update"]

# ❌ BAD: Multiple RUN = multiple layers = big image
RUN apt-get update
RUN apt-get install -y curl
RUN apt-get install -y git

# ✅ BEST: All in one RUN + clean cache in SAME layer
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      curl \
      git \
      build-essential && \
    rm -rf /var/lib/apt/lists/*   # CRITICAL: clean apt cache!

# Node.js
RUN npm ci --only=production && \
    npm cache clean --force

# Python
RUN pip install --no-cache-dir -r requirements.txt

# Alpine (apk package manager)
RUN apk add --no-cache \
    curl \
    git \
    bash
```

> **Caution:** If you don't include `rm -rf /var/lib/apt/lists/*`, the apt cache (which can be several MB) stays in the image — size grows unnecessarily. Always clean in the SAME RUN instruction, not in a separate one (cleaning in a separate layer does not reduce the layer size).

### CMD — Default Command

```dockerfile
# ✅ Exec form (PREFERRED — no shell processing, better signal handling)
CMD ["nginx", "-g", "daemon off;"]
CMD ["node", "server.js"]
CMD ["python", "app.py"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0"]

# ❌ Shell form (avoid — shell processing, harder to handle signals)
CMD nginx -g "daemon off;"
CMD node server.js

# ⚠️ Multiple CMD — only the LAST one counts!
CMD ["node", "app.js"]
CMD ["node", "server.js"]   # ← This one runs; the above is ignored

# Override at runtime
docker run myapp node debug.js   # CMD overridden
```

### ENTRYPOINT — Fixed Executable

```dockerfile
# Exec form (preferred)
ENTRYPOINT ["node", "server.js"]

# ENTRYPOINT + CMD combination (powerful pattern!)
ENTRYPOINT ["node"]
CMD ["server.js"]    # docker run myapp          → node server.js
                     # docker run myapp debug.js  → node debug.js (CMD overridden)
                     # docker run myapp --version → node --version

# Common pattern: entrypoint script for setup logic
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
CMD ["server"]

# entrypoint.sh example:
#!/bin/sh
set -e
echo "Starting container..."
# Run migrations, wait for DB, etc.
exec "$@"   # "$@" = pass CMD arguments through
```

### CMD vs ENTRYPOINT — Most Important Comparison

| Feature | CMD | ENTRYPOINT |
|---|---|---|
| Override easily? | Yes — `docker run myapp npm test` | No — requires `--entrypoint` flag |
| Purpose | Provide default arguments | Set a fixed executable |
| When used together | CMD = default args for ENTRYPOINT | ENTRYPOINT = command, CMD = args |
| Override example | `docker run myapp bash` | `docker run --entrypoint bash myapp` |
| Use case | Flexible containers (same image for dev/prod) | Single-purpose containers |

> **Tip (Interview Question):** "What is the difference between CMD and ENTRYPOINT?" — Short answer: CMD is easily overridden, ENTRYPOINT is not. Use them together — ENTRYPOINT as the executable, CMD as the default arguments.

### COPY and ADD

```dockerfile
# COPY — preferred for most cases
COPY package.json /app/
COPY . /app/
COPY package.json package-lock.json /app/

# With ownership (chown)
COPY --chown=node:node . /app/

# From a multi-stage build (POWERFUL!)
COPY --from=builder /app/dist /usr/share/nginx/html/
COPY --from=builder /app/.next/standalone ./

# ADD — supports URLs and auto-extracts tar files
ADD https://example.com/file.tar.gz /tmp/        # ❌ Prefer curl in RUN
ADD myarchive.tar.gz /app/                       # ✅ Auto-extracts tar
```

| Feature | COPY | ADD |
|---|---|---|
| Local files | Yes | Yes |
| Download from URLs | No | Yes |
| Auto-extract tar | No | Yes |
| Caching | Predictable | Less predictable |
| Recommended | For most cases | Only for tar extraction |

### WORKDIR, ENV, ARG

```dockerfile
# WORKDIR — sets working directory
WORKDIR /app
WORKDIR /usr/src/app

# ❌ BAD: Use cd command
RUN cd /app && npm install  # Only valid for this RUN

# ✅ GOOD: Use WORKDIR
WORKDIR /app
RUN npm install              # Runs in /app

# ENV — environment variables (build + runtime)
ENV NODE_ENV=production \
    PORT=3000 \
    LOG_LEVEL=info \
    TZ=Asia/Kolkata

# Override at runtime
docker run -e NODE_ENV=development myapp
# ⚠️ Never put secrets in ENV — visible in docker inspect!

# ARG — build-time arguments (NOT available at runtime)
ARG NODE_VERSION=18
FROM node:${NODE_VERSION}-alpine

ARG BUILD_DATE
ARG GIT_COMMIT
ARG APP_VERSION=1.0.0

# Pass at build time
docker build \
  --build-arg NODE_VERSION=20 \
  --build-arg BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) \
  -t myapp .

# Convert ARG to ENV (to make it available at runtime)
ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL
```

| Feature | ARG | ENV |
|---|---|---|
| Available at | Build time only | Build + Runtime |
| Persists in container | No | Yes |
| Can use before FROM | Yes | No |
| Visibility | In layer history | In `docker inspect` |

### EXPOSE, VOLUME, USER

```dockerfile
# EXPOSE — documentation only (does NOT actually open the port!)
EXPOSE 3000
EXPOSE 80 443
EXPOSE 8080/tcp
EXPOSE 53/udp

# Actual port publishing requires -p flag at runtime:
docker run -p 8080:3000 myapp   # host:container

# VOLUME — declare mount points
VOLUME /app/data
VOLUME /var/lib/postgresql/data
VOLUME ["/app/logs", "/app/uploads"]

# In production, use named volumes:
docker run -v postgres_data:/var/lib/postgresql/data postgres

# USER — run as non-root (security!)
# ❌ BAD: Running as root (default if USER not specified)

# ✅ Method 1: Named user
RUN groupadd -r appuser && useradd -r -g appuser appuser
USER appuser

# ✅ Method 2: Numeric UID (more secure)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
USER 1001

# ✅ Node.js: Use the built-in 'node' user
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --chown=node:node . .
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

> **Note:** Kubernetes and AWS ECS policies typically prohibit containers running as root. Always specify a non-root USER. In Kubernetes, set `runAsNonRoot: true` in PodSecurityPolicy.

### HEALTHCHECK

```dockerfile
# HTTP health check (common for web apps)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Node.js health check (when curl is not available)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Disable inherited health check
HEALTHCHECK NONE

# Options:
# --interval=30s    → check every 30 seconds (default: 30s)
# --timeout=3s      → fail if no response within 3s (default: 30s)
# --start-period=5s → 5s grace period at start (container boot time)
# --retries=3       → 3 consecutive failures = unhealthy

# Check status
docker inspect --format='{{.State.Health.Status}}' container_name
docker ps   # STATUS column shows (healthy) or (unhealthy)
```

### Shell Form vs Exec Form — Signal Handling

```dockerfile
# Shell form: runs via /bin/sh -c
CMD nginx -g "daemon off;"
ENTRYPOINT node server.js

# Exec form: runs directly (no shell)
CMD ["nginx", "-g", "daemon off;"]
ENTRYPOINT ["node", "server.js"]

# KEY DIFFERENCE: Signal handling!
# Shell form:
#   /bin/sh (PID 1) → nginx (child process)
#   SIGTERM goes to /bin/sh, not nginx → dirty shutdown!

# Exec form:
#   nginx (PID 1) directly
#   SIGTERM goes directly to nginx → graceful shutdown!

# RULE: ALWAYS use exec form in CMD and ENTRYPOINT
```

> **Tip (Interview):** "What is the difference between shell form and exec form?" — Shell form runs via `/bin/sh -c` (does not become PID 1), exec form executes directly (becomes PID 1). In production, exec form is preferred because signals are properly received.

---

## Writing Efficient Dockerfiles

### Before vs After — 1.5 GB to 180 MB

**Before (1.5 GB image):**
```dockerfile
FROM ubuntu:22.04
RUN apt-get update
RUN apt-get install -y nodejs npm
RUN apt-get install -y git
COPY . /app
WORKDIR /app
RUN npm install
EXPOSE 3000
CMD node server.js
```
Problems: Ubuntu base (~80MB), Node+npm via apt (~200MB), multiple apt layers, all `node_modules` included, no cache optimization, running as root, shell form CMD.

**After (180 MB image):**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```
Benefits: Alpine base (~5MB), official Node image, layered cache optimization, production deps only, non-root user, exec CMD form.

### Layer Ordering — Cache Optimization

```dockerfile
# ❌ BAD ORDER: package.json copied with source code
FROM node:18-alpine
WORKDIR /app
COPY . .                    # Source code AND package.json together
RUN npm ci                  # Runs on every code change!
RUN npm run build
EXPOSE 3000
CMD ["node", "server.js"]

# ✅ OPTIMAL ORDER: What changes least goes first
FROM node:18-alpine          # Layer 1: base image (almost always cached)
WORKDIR /app                 # Layer 2: almost always cached
COPY package*.json ./        # Layer 3: rebuilt only when package.json changes
RUN npm ci                   # Layer 4: rebuilt only when package.json changes
COPY . .                     # Layer 5: rebuilt on any code change
RUN npm run build            # Layer 6: rebuilt on any code change
EXPOSE 3000
CMD ["node", "server.js"]

# RESULT:
# If only src/App.js changed:
# → Layers 1-4: CACHE HIT (npm ci skipped!)
# → Layers 5-6: rebuild
# Build time: 10s instead of 60s!
```

> **Tip:** Thumb rule: "What changes least goes on top." Order: Base image → System deps → Package manifest (package.json/requirements.txt) → Dependencies install → Source code copy → Build → Configuration.

### Base Image Choices

| Base Image | Size | Use Case | Pros/Cons |
|---|---|---|---|
| `ubuntu:22.04` | ~80MB | Legacy apps needing apt | Familiar, large |
| `debian:slim` | ~75MB | Debian apps, smaller | Compatible, slim |
| `alpine:3.19` | ~5MB | Smallest possible | musl libc issues sometimes |
| `node:18-alpine` | ~50MB | Node.js apps | Best for Node |
| `python:3.11-slim` | ~130MB | Python apps | Best for Python |
| `gcr.io/distroless/nodejs` | ~30MB | Security-focused | No shell — very secure |
| `scratch` | 0MB | Static Go/Rust binaries | Smallest possible |

### Security Best Practices

```dockerfile
# 1. Pin specific versions
FROM node:18.19.0-alpine3.19   # ✅ Exact version
FROM node:latest                # ❌ Unpredictable

# 2. Non-root user (always!)
USER node

# 3. NEVER put secrets in ENV/ARG permanently
# ❌ WRONG — visible in docker history!
RUN export API_KEY=secret123 && ./setup.sh

# ✅ RIGHT — use runtime env vars
docker run -e API_KEY=secret123 myapp

# 4. Don't install unnecessary packages
RUN apt-get install -y --no-install-recommends \
    curl && \
    rm -rf /var/lib/apt/lists/*

# 5. Read-only filesystem (at runtime)
docker run --read-only \
    --tmpfs /tmp \
    --tmpfs /app/logs \
    myapp

# 6. Drop all capabilities (at runtime)
docker run --cap-drop ALL \
    --cap-add NET_BIND_SERVICE \
    myapp

# 7. Scan images for vulnerabilities
docker scout cves myapp:latest
trivy image myapp:latest
```

> **Note (Production Security Checklist):** Non-root USER | `.dockerignore` with `.env` | No secrets in Dockerfile | Specific base image version | HEALTHCHECK defined | Image vulnerability scan in CI/CD | Read-only filesystem where possible.

### npm install vs npm ci

| Command | Use Case | In Dockerfile? |
|---|---|---|
| `npm install` | Development, install from package.json | Avoid |
| `npm ci` | Exact install from package-lock.json | Always use |
| `npm ci --only=production` | Exclude devDependencies | For production |

---

## Multi-Stage Builds

<figure class="dgm" role="img" aria-label="Multi-stage build diagram: a large Builder Stage box on the left contains the full toolchain, source code, and devDependencies at around 1.2 GB; a COPY artifact arrow points right to a small Final Stage box containing only the production binary and slim runtime base at around 120 MB">
<svg viewBox="0 0 680 220" width="680" height="220" xmlns="http://www.w3.org/2000/svg">
  <!-- Builder stage -->
  <rect x="20" y="30" width="270" height="160" rx="8" class="dgm-surface-2" stroke="none"/>
  <rect x="20" y="30" width="270" height="160" rx="8" fill="none" stroke-width="1.5" class="dgm-stroke"/>
  <text x="155" y="56" text-anchor="middle" font-size="13" font-weight="bold" class="dgm-ink">Stage 1 — Builder</text>
  <text x="155" y="72" text-anchor="middle" font-size="10" class="dgm-muted">FROM node:18  AS builder</text>
  <!-- Contents -->
  <rect x="36" y="82" width="238" height="22" rx="5" class="dgm-surface-2" stroke="none"/>
  <rect x="36" y="82" width="238" height="22" rx="5" fill="none" stroke-width="1" class="dgm-muted-stroke"/>
  <text x="155" y="98" text-anchor="middle" font-size="10" class="dgm-muted">Full Node.js + npm + devDependencies</text>
  <rect x="36" y="110" width="238" height="22" rx="5" class="dgm-surface-2" stroke="none"/>
  <rect x="36" y="110" width="238" height="22" rx="5" fill="none" stroke-width="1" class="dgm-muted-stroke"/>
  <text x="155" y="126" text-anchor="middle" font-size="10" class="dgm-muted">Source code + test runner + build tools</text>
  <rect x="36" y="138" width="238" height="22" rx="5" class="dgm-surface-2" stroke="none"/>
  <rect x="36" y="138" width="238" height="22" rx="5" fill="none" stroke-width="1" class="dgm-muted-stroke"/>
  <text x="155" y="154" text-anchor="middle" font-size="10" class="dgm-muted">RUN npm ci &amp;&amp; npm run build  → /app/dist</text>
  <!-- Size badge -->
  <rect x="90" y="166" width="130" height="20" rx="5" class="dgm-surface-2" stroke="none"/>
  <text x="155" y="181" text-anchor="middle" font-size="11" font-weight="bold" class="dgm-muted">~1.2 GB  (discarded)</text>
  <!-- COPY arrow -->
  <line x1="292" y1="110" x2="356" y2="110" stroke-width="2" class="dgm-ink-stroke"/>
  <polygon points="356,105 368,110 356,115" class="dgm-ink"/>
  <text x="330" y="100" text-anchor="middle" font-size="10" class="dgm-ink">COPY</text>
  <text x="330" y="128" text-anchor="middle" font-size="9" class="dgm-muted">--from=builder</text>
  <text x="330" y="142" text-anchor="middle" font-size="9" class="dgm-muted">/app/dist only</text>
  <!-- Final stage (slim) -->
  <rect x="368" y="54" width="290" height="112" rx="8" class="dgm-accent-soft" stroke="none"/>
  <rect x="368" y="54" width="290" height="112" rx="8" fill="none" stroke-width="1.5" class="dgm-accent-stroke"/>
  <text x="513" y="78" text-anchor="middle" font-size="13" font-weight="bold" class="dgm-ink">Stage 2 — Final Image</text>
  <text x="513" y="94" text-anchor="middle" font-size="10" class="dgm-muted">FROM node:18-alpine  AS runner</text>
  <rect x="384" y="102" width="258" height="22" rx="5" class="dgm-accent-soft" stroke="none"/>
  <rect x="384" y="102" width="258" height="22" rx="5" fill="none" stroke-width="1" class="dgm-accent-stroke"/>
  <text x="513" y="118" text-anchor="middle" font-size="10" class="dgm-ink">Slim runtime + compiled /app/dist only</text>
  <rect x="384" y="130" width="258" height="22" rx="5" class="dgm-accent-soft" stroke="none"/>
  <rect x="384" y="130" width="258" height="22" rx="5" fill="none" stroke-width="1" class="dgm-accent-stroke"/>
  <text x="513" y="146" text-anchor="middle" font-size="10" class="dgm-ink">No build tools · no devDeps · no source code</text>
  <!-- Size badge -->
  <rect x="418" y="158" width="190" height="20" rx="5" class="dgm-accent-soft" stroke="none"/>
  <text x="513" y="173" text-anchor="middle" font-size="11" font-weight="bold" class="dgm-ink">~120 MB  (shipped to production)</text>
</svg>
<figcaption>Multi-stage builds keep the build toolchain in a throw-away stage and ship only the compiled artifact in a minimal final image, cutting image size by 80–90%.</figcaption>
</figure>

### Why Multi-Stage Builds?

The problem: build tools are needed at build time (compiler, test runner, devDependencies) but should not be in the production image. Without multi-stage builds, everything ends up in the final image — size explodes.

| Without Multi-Stage | With Multi-Stage |
|---|---|
| Build tools included (1.2 GB) | Only production artifacts (120 MB) |
| devDependencies included | Build tools discarded |
| Source code included | Source code discarded |
| Security risk (unnecessary tools) | Minimal attack surface |
| Slow to push/pull | Fast to push/pull |

```dockerfile
# BEFORE multi-stage: build tools in final image
FROM node:18
WORKDIR /app
COPY . .
RUN npm install      # devDependencies too — 500MB!
RUN npm run build
CMD ["node", "server.js"]
# Final image: ~1.2 GB

# AFTER multi-stage: only production artifacts
# ---- Stage 1: Builder ----
FROM node:18 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci              # ALL deps (devDeps for build)
COPY . .
RUN npm run build       # Create production bundle

# ---- Stage 2: Runner (final image) ----
FROM node:18-alpine AS runner
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production   # Production deps only
COPY --from=builder /app/dist ./dist   # Only built files!
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
# Final image: ~120 MB  (90% size reduction!)
```

> **Tip:** `COPY --from=builder` only copies the files you specify — not the entire builder stage. Everything else (node_modules, devDeps, source code, compiler) is automatically discarded. The final image contains only the content from the LAST `FROM` onwards.

### React App — Production-Ready Multi-Stage

```dockerfile
# ============================================
# React App — Production Dockerfile
# Multi-stage: Node builder → Nginx server
# Final size: ~25-30MB
# ============================================

# ---- Stage 1: Build ----
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG REACT_APP_API_URL=https://api.myapp.com
ARG REACT_APP_ENV=production
ARG REACT_APP_VERSION=1.0.0

ENV REACT_APP_API_URL=$REACT_APP_API_URL \
    REACT_APP_ENV=$REACT_APP_ENV \
    REACT_APP_VERSION=$REACT_APP_VERSION

RUN npm run build
# Output: /app/build/

# ---- Stage 2: Serve ----
FROM nginx:1.25-alpine AS production

LABEL maintainer="you@company.com" \
      version="1.0.0" \
      description="React App Production Image"

COPY --from=builder /app/build /usr/share/nginx/html

# Custom Nginx config (required for SPA routing!)
COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
```

```nginx
# nginx.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Handle React Router (SPA routing!)
    # Without this, refreshing /about gives a 404!
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Long-term cache for static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Health check endpoint
    location /health {
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json
               application/javascript text/xml application/xml;
    gzip_min_length 1000;
}
```

### Go Application — Scratch Image (10MB!)

```dockerfile
# ---- Stage 1: Go Binary Build ----
FROM golang:1.21-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Static binary build (no external dependencies)
RUN CGO_ENABLED=0 \
    GOOS=linux \
    GOARCH=amd64 \
    go build \
    -ldflags="-w -s" \
    -a -installsuffix cgo \
    -o app .

# ---- Stage 2: Scratch (empty base!) ----
FROM scratch

# SSL certificates (for HTTPS calls)
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Only the binary
COPY --from=builder /app/app /app

EXPOSE 8080

ENTRYPOINT ["/app"]

# Final image: ~8-10MB (just the binary!)
```

### Java Spring Boot Multi-Stage

```dockerfile
# ---- Stage 1: Maven Build ----
FROM maven:3.9-openjdk-17-slim AS builder

WORKDIR /app

# Copy pom.xml first (dependency caching!)
COPY pom.xml .
RUN mvn dependency:go-offline -B   # Download all dependencies

COPY src ./src
RUN mvn clean package -DskipTests -B

# ---- Stage 2: JRE Only (no JDK!) ----
FROM eclipse-temurin:17-jre-alpine AS production

WORKDIR /app

RUN addgroup --system --gid 1001 spring && \
    adduser --system --uid 1001 spring
USER spring

# Only the JAR (not Maven, not JDK)
COPY --from=builder /app/target/*.jar app.jar

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8080/actuator/health || exit 1

ENTRYPOINT ["java", \
  "-XX:+UseContainerSupport", \
  "-XX:MaxRAMPercentage=75.0", \
  "-jar", "app.jar"]
```

### Building Specific Stages

```bash
# Build up to a specific stage (useful for debugging!)
docker build --target builder -t myapp:builder .
docker build --target production -t myapp:prod .

# Open a shell in the builder stage
docker run --rm -it myapp:builder sh

# Separate development vs production builds
docker build --target development -t myapp:dev .
docker build --target production -t myapp:prod .
```

---

## Dockerfile Templates Library

These templates are copy-paste ready for production use. All are fully commented and follow security best practices. Customize the `EXPOSE` port, user names, and `CMD` for your project.

### Template 1: React App (Production-Ready)

```dockerfile
# ============================================
# React App — Production Dockerfile
# Multi-stage: Node builder → Nginx server
# Final size: ~25-30MB
# ============================================

# ---- Stage 1: Build ----
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG REACT_APP_API_URL=https://api.myapp.com
ARG REACT_APP_ENV=production
ARG REACT_APP_VERSION=1.0.0

ENV REACT_APP_API_URL=$REACT_APP_API_URL \
    REACT_APP_ENV=$REACT_APP_ENV \
    REACT_APP_VERSION=$REACT_APP_VERSION

RUN npm run build
# Output: /app/build/

# ---- Stage 2: Serve ----
FROM nginx:1.25-alpine AS production

LABEL maintainer="you@company.com" \
      version="1.0.0" \
      description="React App Production Image"

COPY --from=builder /app/build /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]

# ============================================
# Build commands:
# docker build -t myreactapp:latest .
# docker build --build-arg REACT_APP_API_URL=https://prod.api.com -t myreactapp:prod .
# docker run -p 8080:80 myreactapp:latest
# ============================================
```

### Template 2: Node.js Express API

```dockerfile
# ============================================
# Node.js Express API — Production Dockerfile
# Features: dumb-init, TypeScript support,
#           non-root user, health check
# Final size: ~80-120MB
# ============================================

FROM node:18-alpine AS base

# dumb-init: proper PID 1 handling + signal forwarding
RUN apk add --no-cache dumb-init

WORKDIR /app

# ---- Stage 1: Dependencies ----
FROM base AS deps

COPY package*.json ./
RUN npm ci

# ---- Stage 2: Build (for TypeScript projects) ----
FROM deps AS builder

COPY . .
RUN npm run build 2>/dev/null || echo "No build step found, skipping..."

# ---- Stage 3: Production ----
FROM base AS production

ENV NODE_ENV=production

LABEL maintainer="you@company.com" \
      description="Express API Production Image"

COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

COPY --from=builder /app/dist ./dist 2>/dev/null || true
COPY --from=deps /app/src ./src 2>/dev/null || true
COPY . .

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodeuser
RUN chown -R nodeuser:nodejs /app

USER nodeuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { \
    r.statusCode === 200 ? process.exit(0) : process.exit(1); \
  }).on('error', () => process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]

# ============================================
# Build commands:
# docker build -t myapi:latest .
# docker run -p 3000:3000 -e DB_URL=mongodb://... myapi:latest
#
# For TypeScript projects, change CMD to:
# CMD ["node", "dist/server.js"]
# ============================================
```

### Template 3: Python Flask App

```dockerfile
# ============================================
# Python Flask App — Production Dockerfile
# Features: Gunicorn WSGI, non-root user,
#           multi-stage, health check
# Final size: ~130-160MB
# ============================================

FROM python:3.11-slim AS base

RUN apt-get update && \
    apt-get upgrade -y && \
    rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --gid 1001 appuser

WORKDIR /app

# ---- Stage 2: Dependencies ----
FROM base AS deps

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ---- Stage 3: Production ----
FROM base AS production

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_ENV=production \
    PORT=5000

LABEL maintainer="you@company.com" \
      description="Flask API Production Image"

COPY --from=deps /root/.local /home/appuser/.local
ENV PATH=/home/appuser/.local/bin:$PATH

COPY --chown=appuser:appgroup . .

USER appuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health')" \
      || exit 1

CMD ["python", "-m", "gunicorn", \
     "--bind", "0.0.0.0:5000", \
     "--workers", "4", \
     "--timeout", "120", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "app:app"]

# ============================================
# requirements.txt must include:
# Flask==3.0.0
# gunicorn==21.2.0
# ============================================
```

### Template 4: Python FastAPI

```dockerfile
# ============================================
# FastAPI App — Production Dockerfile
# Features: Uvicorn ASGI, non-root user,
#           async support, health check
# Final size: ~130-150MB
# ============================================

FROM python:3.11-slim AS base

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --gid 1001 appuser

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

LABEL maintainer="you@company.com" \
      description="FastAPI Production Image"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=appuser:appgroup . .

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "4", \
     "--loop", "uvloop", \
     "--access-log"]

# ============================================
# requirements.txt must include:
# fastapi==0.109.0
# uvicorn[standard]==0.27.0
# uvloop==0.19.0
#
# main.py health endpoint:
# @app.get("/health")
# async def health(): return {"status": "healthy"}
# ============================================
```

### Template 5: Next.js Production

```dockerfile
# ============================================
# Next.js App — Production Dockerfile
# Features: Standalone output, optimized,
#           non-root, telemetry disabled
# Final size: ~100-150MB
# ============================================

FROM node:18-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ---- Stage 2: Dependencies ----
FROM base AS deps

COPY package*.json ./
RUN npm ci

# ---- Stage 3: Build ----
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# REQUIRED: next.config.js must have output: 'standalone'
RUN npm run build

# ---- Stage 4: Runner ----
FROM base AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

LABEL maintainer="you@company.com" \
      description="Next.js Production Image"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', r => \
    r.statusCode === 200 ? process.exit(0) : process.exit(1))"

CMD ["node", "server.js"]

# ============================================
# REQUIRED: next.config.js must include:
# const nextConfig = {
#   output: 'standalone',
# }
# module.exports = nextConfig
# ============================================
```

> **Caution:** For Next.js Docker images, `output: 'standalone'` in `next.config.js` is **required**. Without it, the `.next/standalone` folder will not be created and `COPY` will fail.

### Quick Reference: Which Template to Use

| Project Type | Template | Final Size | Server |
|---|---|---|---|
| React (CRA, Vite) | Template 1 | ~25-30MB | Nginx |
| Node.js / Express / Fastify | Template 2 | ~80-120MB | Node + dumb-init |
| Python Flask (sync) | Template 3 | ~130-160MB | Gunicorn |
| Python FastAPI (async) | Template 4 | ~130-150MB | Uvicorn |
| Next.js (full-stack) | Template 5 | ~100-150MB | Node standalone |

> **Note (Common Patterns in Every Template):**
> - Non-root USER — mandatory for security
> - HEALTHCHECK — so Docker/Kubernetes knows container health
> - Multi-stage builds — build tools not in final image
> - Cache optimization — package.json first, source code second
> - Exec form CMD — proper signal handling
> - Specific versions — reproducible builds
> - LABEL metadata — for traceability

## Networking Fundamentals

### Why Containers Need Networking

By default, every container runs in an isolated environment — its own filesystem, its own process space, and its own network namespace. However, real-world applications require containers to communicate with each other, connect to external databases, and serve clients. Understanding Docker's networking model is therefore essential.

Scenarios that require networking:

- **Container-to-Container:** A frontend container needs to communicate with a backend API
- **Container to External Services:** An application container needs to connect to AWS RDS or a third-party API
- **External Clients to Containers:** A browser sends a request and a container serves it
- **Multi-host Communication:** Containers on different servers still communicate with each other (Overlay networks)

### Container Networking Model (CNM)

Docker defines a standard networking architecture called the **Container Networking Model (CNM)**. It has three core concepts:

| Concept | Description | Real-World Analogy |
|---|---|---|
| **Network** | Isolated communication group where containers can talk to each other | An office floor — only people on that floor can communicate directly |
| **Endpoint** | A virtual NIC (network interface card) for a container on a network | An employee's desk phone extension |
| **Sandbox** | Container's isolated network namespace — its own IP, routing table, and DNS | An employee's complete communication profile |

> **Note:** **libnetwork — Docker's Networking Brain.** CNM is implemented by **libnetwork** — Docker's networking subsystem. It is written in Go and supports a pluggable driver architecture. This means you can use bridge, overlay, macvlan — any driver — on top of libnetwork.

**Network Driver Architecture:** libnetwork uses a plugin system. Built-in drivers include: `bridge`, `host`, `none`, `overlay`, and `macvlan`. Third-party drivers can also be installed (e.g., Weave, Calico).

### Docker Networking Model — Architecture Overview

Internet traffic arrives at the host → is forwarded to the `docker0` bridge → passes through to Container A on port 80 via host port 8080. Container A and Container B can communicate directly with each other using their `172.17.x.x` IP addresses through the bridge.

> **Tip:** **veth Pair — The Magic Behind Container Networking.** When Docker starts a container, it creates a **virtual ethernet pair (veth)** — like two ends of a virtual cable. One end lives inside the container (`eth0`) and the other end attaches to the `docker0` bridge. Data flows seamlessly from one end to the other.

---

## Network Types — Bridge, Host, None, Overlay, Macvlan

<figure class="dgm" role="img" aria-label="Docker bridge networking diagram showing a Host machine containing a docker0 bridge network. Container A (172.17.0.2) and Container B (172.17.0.3) are connected to the bridge. A published port arrow shows host port 8080 mapping to Container A port 80. The Host network interface connects the bridge to the internet">
<svg viewBox="0 0 680 280" width="680" height="280" xmlns="http://www.w3.org/2000/svg">
  <!-- Host outline -->
  <rect x="10" y="10" width="660" height="260" rx="8" class="dgm-surface-2" stroke="none"/>
  <rect x="10" y="10" width="660" height="260" rx="8" fill="none" stroke-width="1.5" class="dgm-stroke"/>
  <text x="340" y="32" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">Host Machine  (eth0: 192.168.1.10)</text>
  <!-- Bridge network outline -->
  <rect x="160" y="50" width="360" height="130" rx="8" class="dgm-accent-soft" stroke="none"/>
  <rect x="160" y="50" width="360" height="130" rx="8" fill="none" stroke-width="1.5" class="dgm-accent-stroke"/>
  <text x="340" y="70" text-anchor="middle" font-size="11" font-weight="bold" class="dgm-ink">docker0 bridge  (172.17.0.1/16)</text>
  <!-- Container A -->
  <rect x="175" y="82" width="150" height="80" rx="7" class="dgm-surface-2" stroke="none"/>
  <rect x="175" y="82" width="150" height="80" rx="7" fill="none" stroke-width="1.5" class="dgm-stroke"/>
  <text x="250" y="102" text-anchor="middle" font-size="11" font-weight="bold" class="dgm-ink">Container A</text>
  <text x="250" y="118" text-anchor="middle" font-size="10" class="dgm-muted">eth0: 172.17.0.2</text>
  <text x="250" y="133" text-anchor="middle" font-size="10" class="dgm-muted">port 80 (nginx)</text>
  <text x="250" y="148" text-anchor="middle" font-size="10" class="dgm-muted">veth0 ↔ bridge</text>
  <!-- Container B -->
  <rect x="355" y="82" width="150" height="80" rx="7" class="dgm-surface-2" stroke="none"/>
  <rect x="355" y="82" width="150" height="80" rx="7" fill="none" stroke-width="1.5" class="dgm-stroke"/>
  <text x="430" y="102" text-anchor="middle" font-size="11" font-weight="bold" class="dgm-ink">Container B</text>
  <text x="430" y="118" text-anchor="middle" font-size="10" class="dgm-muted">eth0: 172.17.0.3</text>
  <text x="430" y="133" text-anchor="middle" font-size="10" class="dgm-muted">port 3000 (api)</text>
  <text x="430" y="148" text-anchor="middle" font-size="10" class="dgm-muted">veth1 ↔ bridge</text>
  <!-- Container-to-container arrow -->
  <line x1="326" y1="122" x2="354" y2="122" stroke-width="1.5" class="dgm-ink-stroke" stroke-dasharray="4,3"/>
  <polygon points="354,117 362,122 354,127" class="dgm-ink"/>
  <!-- Published port arrow: external → host → container A -->
  <text x="340" y="215" text-anchor="middle" font-size="11" font-weight="bold" class="dgm-ink">Published Port Mapping</text>
  <!-- External request box -->
  <rect x="20" y="200" width="120" height="44" rx="7" class="dgm-surface-2" stroke="none"/>
  <rect x="20" y="200" width="120" height="44" rx="7" fill="none" stroke-width="1.5" class="dgm-stroke"/>
  <text x="80" y="221" text-anchor="middle" font-size="11" class="dgm-ink">External Client</text>
  <text x="80" y="237" text-anchor="middle" font-size="10" class="dgm-muted">browser / curl</text>
  <!-- Arrow to host port -->
  <line x1="141" y1="222" x2="195" y2="222" stroke-width="2" class="dgm-ink-stroke"/>
  <polygon points="195,217 206,222 195,227" class="dgm-ink"/>
  <!-- Host port box -->
  <rect x="206" y="208" width="130" height="28" rx="6" class="dgm-accent-soft" stroke="none"/>
  <rect x="206" y="208" width="130" height="28" rx="6" fill="none" stroke-width="1.5" class="dgm-accent-stroke"/>
  <text x="271" y="227" text-anchor="middle" font-size="10" class="dgm-ink">Host :8080 → Container :80</text>
  <!-- Arrow up into Container A -->
  <line x1="271" y1="208" x2="250" y2="165" stroke-width="1.5" class="dgm-ink-stroke"/>
  <polygon points="245,166 250,155 255,166" class="dgm-ink"/>
  <!-- Internet label outside -->
  <text x="80" y="182" text-anchor="middle" font-size="10" class="dgm-muted">Internet</text>
</svg>
<figcaption>The docker0 bridge connects containers on the same host using private IPs; a published port (-p 8080:80) uses iptables NAT to forward external traffic from the host into a specific container.</figcaption>
</figure>

### Bridge Network — The Most Common

When you start a container without the `--network` flag, it automatically joins the **default bridge network** (`docker0`). However, the default bridge has a significant limitation — **DNS resolution does not work**!

> **Caution:** **Common Beginner Mistake — No DNS on Default Bridge!** On the default bridge, containers cannot find each other by name — only by IP address. The IP address can change on every restart. Always use a **user-defined bridge**!

```bash
# Default bridge — no DNS!
docker run -d --name db mysql:8        # joins default bridge
docker run -d --name myapp myimage     # joins default bridge
# myapp CANNOT connect to "db" by hostname!
# Must use IP: mysql -h 172.17.0.2 (fragile!)

# User-defined bridge — DNS built-in!
docker network create mynetwork

docker run -d --name db --network mynetwork mysql:8
docker run -d --name myapp --network mynetwork myimage
# Now myapp can connect directly using the "db" hostname!
# MONGODB_URI=mongodb://db:27017/mydb  ← works!

# Create a user-defined bridge with options
docker network create \
  --driver bridge \
  --subnet 172.20.0.0/16 \
  --gateway 172.20.0.1 \
  my-custom-network
```

| Feature | Default Bridge | User-Defined Bridge |
|---|---|---|
| DNS Resolution (by name) | No | Yes (container name!) |
| Automatic Discovery | No | Yes |
| Recommended? | Legacy only | Always use this |
| Network Isolation | All containers share it | Per-network isolation |
| Connect/disconnect from running container | No | Yes |

### Host Network — Maximum Performance

```bash
# Container shares the host's network namespace
docker run --network host nginx
# nginx now listens directly on host port 80
# -p flag is not needed (and does not work)

# Benefits:
# - Best performance: no NAT overhead
# - Low latency: direct kernel network stack access

# Drawbacks:
# - No isolation: container can see all host interfaces
# - Port conflicts: container and host services cannot share the same port

# Use cases:
# - High-performance networking applications
# - Monitoring agents (Prometheus node_exporter)
# - Network packet inspection tools
```

### None Network — Complete Isolation

```bash
# No networking at all — completely isolated
docker run --network none myapp

# Inside the container:
# - No internet access
# - No communication with other containers
# - Only loopback (127.0.0.1) is available

# Use cases:
# - Batch data processing jobs (file input/output only)
# - Security-sensitive computations
# - Testing network-agnostic code
# - Malware analysis environments
```

### Overlay Network — Multi-Host Communication (Swarm)

```bash
# Multi-host networking — containers on different servers communicate with each other
# Requires: Docker Swarm mode (or Kubernetes)

# Initialize Swarm mode
docker swarm init

# Create an overlay network
docker network create --driver overlay myoverlay

# Attachable overlay (standalone containers can join too)
docker network create --driver overlay --attachable myoverlay

# Uses VXLAN tunneling automatically
# Containers are unaware they are on different hosts!
# 10.0.0.2 (Server 1) <-> 10.0.0.3 (Server 2) — transparent!
```

> **Note:** **Overlay = VXLAN Tunneling.** Inside an overlay network, Docker uses **VXLAN (Virtual Extensible LAN)** — one packet is wrapped inside another. A packet from a container on Server A is wrapped in UDP and sent to Server B, where it is unwrapped. Containers have no idea they are running on different machines.

### Macvlan — Container as a Physical Device

```bash
# Container gets its own MAC address
# Appears on the network like a real physical device

docker network create \
  --driver macvlan \
  --subnet=192.168.1.0/24 \
  --gateway=192.168.1.1 \
  -o parent=eth0 \
  mymacvlan

docker run -d \
  --name legacy-app \
  --network mymacvlan \
  --ip 192.168.1.50 \
  my-legacy-app

# The router treats 192.168.1.50 as a physical machine!

# Use cases:
# - Legacy applications that expect direct network access
# - Migrating VMs to containers
# - Network monitoring tools
```

> **Note:** **Bridge vs Host Network.** **Bridge:** Container has its own network namespace, communicates with the host via NAT, and requires port mapping. **Host:** Container shares the host's network namespace — no NAT, no port mapping, maximum performance. Use Bridge when isolation is required; use Host when performance is critical and isolation can be sacrificed.

> **Tip:** **Always Use User-Defined Bridges.** Never use the default bridge network in production. Create a dedicated user-defined network for each application stack. This provides DNS resolution, isolation, and security all in one. Docker Compose automatically creates a user-defined network for each project.

---

## Network Commands — Complete Reference

### docker network ls — Listing Networks

```bash
# List all networks
docker network ls
# NETWORK ID     NAME      DRIVER    SCOPE
# a1b2c3d4e5f6   bridge    bridge    local
# f6e5d4c3b2a1   host      host      local
# 0000000000000   none      null      local

# Show full IDs
docker network ls --no-trunc

# Filter by driver
docker network ls --filter driver=bridge

# Filter by name
docker network ls --filter name=mynetwork

# Custom format
docker network ls --format "table {{.ID}}\t{{.Name}}\t{{.Driver}}\t{{.Scope}}"
```

### docker network create — Creating a Network

```bash
# Simple bridge network
docker network create mynetwork

# Bridge with full options
docker network create \
  --driver bridge \
  --subnet 172.20.0.0/16 \
  --ip-range 172.20.240.0/20 \
  --gateway 172.20.0.1 \
  --label env=production \
  mynetwork

# Internal network (no external access)
# Containers cannot connect to the internet
docker network create --internal private-db-net

# Overlay network (in Swarm mode)
docker network create --driver overlay --attachable myoverlay

# Macvlan network
docker network create \
  --driver macvlan \
  --subnet=192.168.1.0/24 \
  --gateway=192.168.1.1 \
  -o parent=eth0 \
  mymacvlan
```

### docker network inspect — Viewing Details

```bash
# Full JSON details
docker network inspect mynetwork

# Specific field — IPAM config
docker network inspect --format '{{.IPAM.Config}}' mynetwork

# Find the gateway
docker network inspect --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}' mynetwork

# List connected containers (requires jq)
docker network inspect mynetwork | jq '.[0].Containers'

# Most useful: which containers are on this network
docker network inspect mynetwork \
  --format '{{range .Containers}}{{.Name}}: {{.IPv4Address}}{{"\n"}}{{end}}'
```

### docker network connect / disconnect — Runtime Changes

```bash
# Connect a running container to a new network
docker network connect mynetwork mycontainer

# Assign a specific IP
docker network connect --ip 172.20.0.100 mynetwork mycontainer

# Add an alias (other containers can reach this container via the alias)
docker network connect --alias db-primary mynetwork mycontainer

# Disconnect (container keeps running)
docker network disconnect mynetwork mycontainer

# Force disconnect
docker network disconnect --force mynetwork mycontainer

# Real use case: zero-downtime maintenance
# 1. Start new container on the new network
# 2. Gradually migrate old containers
# 3. Disconnect from the old network
```

> **Tip:** **Multiple Networks — One Container on Many Networks!** A container can be connected to more than one network simultaneously. For example, a "gateway" container can be connected to the frontend network on one side and the backend network on the other. This is useful in DMZ architectures where you want to control traffic flow.

### docker network rm / prune — Cleanup

```bash
# Remove a network (disconnect all containers first!)
docker network rm mynetwork
# Error: network mynetwork has active endpoints — if containers are attached

# Remove containers first, then the network
docker rm -f $(docker ps -q --filter network=mynetwork)
docker network rm mynetwork

# Remove multiple networks at once
docker network rm net1 net2 net3

# Remove all unused networks (none with connected containers)
docker network prune

# Skip confirmation prompt
docker network prune -f

# Filter by label before pruning
docker network prune --filter label=env=staging
```

> **Caution:** **docker network prune — Be Careful!** This command deletes all "unused" networks — meaning any network not connected to at least one container. If you created a network for future use, it will be deleted too. Always run `docker network ls` before running `prune` in production.

---

## Container-to-Container Communication

### Real-World Example: MERN Stack Communication

Consider deploying a MERN (MongoDB, Express, React, Node) application. All three services need to communicate with each other. Here is how to set this up in Docker:

```bash
# Step 1: Create a dedicated network
docker network create mern-network

# Step 2: Start MongoDB first (others depend on it)
docker run -d \
  --name mongodb \
  --network mern-network \
  -v mongo_data:/data/db \
  mongo:7

# Step 3: Start the Node.js API
# Use "mongodb" as the hostname — Docker DNS resolves it!
docker run -d \
  --name api \
  --network mern-network \
  -e MONGODB_URI=mongodb://mongodb:27017/mydb \
  -e PORT=5000 \
  -p 5000:5000 \
  myapi:latest

# Step 4: Start the React frontend
# Use "api" as the hostname
docker run -d \
  --name frontend \
  --network mern-network \
  -e REACT_APP_API_URL=http://api:5000 \
  -p 3000:3000 \
  myfrontend:latest

# Communication flow:
# Browser → Host:3000 → frontend container
# frontend → api:5000 (DNS resolution via Docker) → api container
# api → mongodb:27017 (DNS resolution via Docker) → mongodb container
```

### Testing DNS Resolution

```bash
# Test connectivity
docker exec frontend ping api -c 4
# PING api (172.20.0.3): 56 data bytes
# 64 bytes from 172.20.0.3: icmp_seq=0 ttl=64 time=0.089 ms

# DNS lookup
docker exec api nslookup mongodb
# Server:    127.0.0.11  <- Docker's built-in DNS server!
# Address 1: 127.0.0.11
# Name:      mongodb
# Address 1: 172.20.0.2 mongodb.mern-network

# Test HTTP connection
docker exec api wget -qO- http://mongodb:27017
# It looks like you are trying to access MongoDB over HTTP...
# (Connection succeeded — MongoDB responded)

# Test the API from the frontend using curl
docker exec frontend curl http://api:5000/health
# {"status":"ok","db":"connected"}
```

> **Note:** **127.0.0.11 — Docker's Secret DNS Server.** Whenever you use a user-defined network, Docker provides an embedded DNS server at **127.0.0.11** inside every container. It resolves container names to IP addresses. This happens automatically — no configuration required.

### Service Discovery Patterns — Best Practices

| Pattern | Example | When to Use |
|---|---|---|
| Container Name as Hostname | `mongodb://mongodb:27017` | Simple setups, same host |
| Docker Compose Service Name | `http://api:5000` | Compose-based deployments |
| Network Alias | `--network-alias db` | When the container name may change |
| Environment Variables | `DB_HOST=mongodb` | Externalizing configuration |

> **Caution:** **Never Hardcode IPs!** A very common mistake: `MONGODB_URI=mongodb://172.17.0.2:27017`. The IP can change when the container restarts. Always use the container name as the hostname: `mongodb://mongodb:27017`. The container name is stable; the IP is not.

> **Note:** **Production Pattern: Network Segmentation.** In real production environments, create separate networks: `frontend-net` (frontend + API) and `backend-net` (API + database). The database will not be directly accessible from the frontend — only through the API. This is the Zero Trust networking principle. In Docker Compose, this is easily configured with the `networks:` key.

---

## Port Management — EXPOSE vs -p vs -P

### EXPOSE vs -p — Clearing the Confusion

This is a classic point of confusion for beginners. Both `EXPOSE` and `-p` deal with ports, but they serve different purposes.

```bash
# EXPOSE in Dockerfile — documentation only!
EXPOSE 3000
# This only says "this container listens on port 3000"
# It does NOT publish anything to the HOST
# Other containers can read this information via inspect

# -p flag: ACTUALLY publishes the port on the host
docker run -p 8080:3000 myapp
# host:8080 → container:3000
# Requests arriving at host port 8080 are forwarded to container port 3000

# -P flag (capital P): publish ALL EXPOSEd ports to random host ports
docker run -P myapp
# If Dockerfile has EXPOSE 3000 3306:
# Docker allocates: 32768:3000, 32769:3306 (random!)

# Check which port was assigned
docker port myapp
# 3000/tcp -> 0.0.0.0:32768

docker port myapp 3000
# 0.0.0.0:32768
```

> **Tip:** **Mnemonic: EXPOSE = Advertisement, -p = Actually Open the Door.** EXPOSE is a "menu card" — it only describes what is available. The `-p` flag actually opens the door to the outside world. Without `-p`, services inside the container are not accessible from the host (though other containers on a custom network can still access them without port mapping).

### Port Mapping Patterns

```bash
# 1. Specific mapping (most common)
docker run -p 8080:80 nginx          # Host 8080 → Container 80

# 2. Multiple ports
docker run -p 80:80 -p 443:443 nginx

# 3. Default binding: 0.0.0.0 (all interfaces)
docker run -p 8080:80 nginx
# Any IP can reach port 8080 and hit the container
# curl localhost:8080 works
# curl 192.168.1.100:8080 works (accessible on LAN too)

# 4. Bind to localhost only (security)
docker run -p 127.0.0.1:8080:80 nginx
# Only accessible from the same machine
# curl localhost:8080 works
# curl 192.168.1.100:8080 does not work

# 5. Random port on all interfaces
docker run -p 0.0.0.0::80 nginx
# Docker chooses a random high port
docker port <container> 80
# 0.0.0.0:49153

# 6. UDP port
docker run -p 53:53/udp my-dns-server

# 7. Range of ports
docker run -p 8000-8010:8000-8010 myapp
```

### Handling Port Conflicts

```bash
# Error: Bind: address already in use
# docker: Error response from daemon: driver failed programming
# external connectivity on endpoint ...: Bind for 0.0.0.0:8080
# failed: port is already allocated

# Step 1: Find out who is using port 8080
sudo lsof -i :8080
sudo netstat -tulpn | grep 8080

# Step 2: Options:
# Option A: Use a different host port
docker run -p 9090:80 nginx

# Option B: Stop the conflicting process
sudo kill -9 <PID>

# Option C: Check if another Docker container is using the port
docker ps --format "table {{.Names}}\t{{.Ports}}" | grep 8080
docker stop old-nginx
docker run -p 8080:80 nginx

# Useful: view all mapped ports
docker ps --format "table {{.ID}}\t{{.Names}}\t{{.Ports}}"
```

> **Caution:** **Security: Bind to Localhost in Development.** When you use `-p 8080:80`, Docker automatically adds an iptables rule — even if UFW or firewalld is disabled. This means the service may be accessible from the internet. In development, always use `-p 127.0.0.1:8080:80` for sensitive services.

> **Note:** **EXPOSE vs -p — Interview Answer.** `EXPOSE` is only metadata/documentation — it does not actually publish any port. The `-p` flag creates an actual port mapping at runtime between the host and container using iptables rules. EXPOSE without `-p` is useless for host access (though it does provide information to other containers within the network).

---

## Storage Fundamentals — Why Persistence Matters

### Containers Are Ephemeral — Data Is Lost!

The most important concept in storage: **containers are ephemeral (temporary) by default**. When a container is deleted, all its data is deleted too.

> **Caution:** **"The container was deleted and the data went with it!" — Classic Production Disaster.** Imagine you started a MySQL container, added some data, and then accidentally ran `docker rm -f mysql`. The entire database is gone. This happens frequently in production. Solution: always use volumes for databases.

Container storage layers use a union filesystem (overlay2):

```
┌─────────────────────────────────────────┐
│  [Writable Layer]  ← Temporary!         │
│  The container's write area             │
│  Container deleted → THIS DATA IS GONE! │
├─────────────────────────────────────────┤
│  [App Layer]       ← Read-only          │
│  Your application code                  │
├─────────────────────────────────────────┤
│  [Base Image Layer] ← Read-only         │
│  ubuntu:22.04 or node:18 etc.           │
└─────────────────────────────────────────┘

# The bottom layers are part of the image — shared across containers!
# Only the writable layer is container-specific — and it is temporary
```

### Storage Drivers — The Underlying Filesystem

| Driver | Description | When to Use |
|---|---|---|
| **overlay2** | Default; uses Linux overlayfs | Almost always — best choice |
| devicemapper | Block device based | Legacy RHEL/CentOS (outdated) |
| btrfs | Btrfs filesystem | Only on Btrfs hosts |
| zfs | ZFS filesystem | Only on ZFS hosts |
| vfs | No layering, simple copy | Testing only — very slow |

```bash
# Check the current storage driver
docker info | grep "Storage Driver"
# Storage Driver: overlay2

# Where does Docker store data?
/var/lib/docker/
  ├── containers/     # Per-container metadata, logs
  ├── image/          # Image metadata and manifests
  ├── overlay2/       # Image layers (most data is here!)
  ├── volumes/        # Named volumes
  └── network/        # Network configs

# Check sizes
sudo du -sh /var/lib/docker/*
# 1.2G    /var/lib/docker/overlay2   # Most data here!
# 200M    /var/lib/docker/volumes
# 50M     /var/lib/docker/containers

# Docker summary
docker system df
# TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
# Images          15        5         3.2GB     2.1GB (65%)
# Containers      8         3         120MB     90MB (75%)
# Local Volumes   5         2         1.1GB     500MB (45%)

# Detailed breakdown
docker system df -v
```

> **Tip:** **Copy-on-Write (CoW) — The Secret of Efficiency.** overlay2 uses a **Copy-on-Write** strategy. If 10 containers use the same base image, the image layers are stored only once on disk. Only when a container writes something does it create its own copy of that file. This saves both disk space and startup time.

> **Note:** **Production Rule: Databases Always Need Volumes!** MySQL, PostgreSQL, MongoDB, Redis — whenever you run any database in a container, volumes are MANDATORY. Without a volume, all data is permanently lost when the container crashes or restarts. This is the number one cause of production disasters.

---

## Volume Types — Named, Bind Mount, tmpfs

### Named Volumes — Production's Best Friend

Named volumes are Docker's **managed volumes** — Docker decides where to store the data (`/var/lib/docker/volumes/`). They survive container restarts and deletions.

```bash
# Create a volume
docker volume create mydata

# Use with -v syntax
docker run -v mydata:/app/data myapp

# Use with --mount syntax (recommended)
docker run --mount type=volume,source=mydata,target=/app/data myapp

# Use with a database
docker run -d \
  --name postgres \
  -v postgres_data:/var/lib/postgresql/data \
  postgres:16

# Delete the container — THE VOLUME STAYS SAFE!
docker rm -f postgres
docker volume ls
# postgres_data  ← Still there!

# Start a new container with the same volume — data is back!
docker run -d --name postgres-new -v postgres_data:/var/lib/postgresql/data postgres:16
```

### Bind Mounts — Development's Superpower

With bind mounts, you specify the host path explicitly. This is extremely useful in development because your local changes are instantly reflected inside the container — **without rebuilding**!

```bash
# Specify the host path explicitly
docker run -v /home/pushkar/myproject:/app node:18

# Mount the current directory (most common in development!)
docker run -v $(pwd):/app node:18
# Edit code locally — changes appear inside the container immediately!
# Hot reload works!

# Node.js development example
docker run -d \
  --name dev-server \
  -v $(pwd):/app \
  -w /app \
  -p 3000:3000 \
  node:18 \
  npm run dev

# Read-only bind mount (for security — container cannot modify)
docker run -v /etc/nginx/conf:/etc/nginx/conf:ro nginx

# --mount syntax
docker run --mount type=bind,source=$(pwd),target=/app node:18
docker run --mount type=bind,source=/config,target=/config,readonly nginx
```

> **Tip:** **For React Developers: Bind Mount = Live Reload!** `docker run -v $(pwd):/app -p 3000:3000 node:18 npm start` — edit code in VS Code and React hot reload fires automatically inside the container. No rebuild needed for each change. This is a game-changer for development workflow.

### tmpfs Mounts — Sensitive Data In-Memory

```bash
# Stored in memory, never written to disk!
docker run --tmpfs /tmp nginx

# With a size limit
docker run --mount type=tmpfs,target=/tmp,tmpfs-size=100m myapp

# Multiple tmpfs locations
docker run \
  --tmpfs /tmp \
  --tmpfs /run \
  myapp

# Use cases:
# - Session data (passwords, tokens stored temporarily)
# - Sensitive computation results
# - Cache data that should never touch disk
# - High-speed temporary storage

# Container stops → data gone immediately (from RAM)
# Container crashes → data gone immediately
# Never persists to disk = more secure
```

### Comparison — Which Type to Use When?

| Feature | Named Volume | Bind Mount | tmpfs |
|---|---|---|---|
| Storage Location | /var/lib/docker/volumes | Any host path | Memory |
| Docker Managed | Yes | No | N/A |
| Data Persists | Yes | Yes | No (memory only) |
| Dev Workflow | OK | Best (hot reload!) | N/A |
| Production DB | Best | OK (path management) | Never |
| Easy Backup | Yes | Yes | No |
| Performance | Good | Best (NFS will be slow) | Excellent |
| Security | Container isolated | Host exposed | Most secure |

> **Note:** **Named Volume vs Bind Mount — Interview Answer.** **Named Volume:** Docker manages the location; it is portable, easy to back up, and best for production. **Bind Mount:** You control the specific host path; perfect for development (host files accessible directly in container), but path is host-specific — less portable. Prefer named volumes in production; use bind mounts in development for code changes.

---

## Volume Commands — Complete Reference

### docker volume create — Creating Volumes

```bash
# Simple named volume
docker volume create mydb-data

# Explicitly use the local driver (this is already the default)
docker volume create --driver local mydb-data

# NFS-backed volume (remote storage!)
docker volume create \
  --driver local \
  --opt type=nfs \
  --opt o=addr=192.168.1.100,rw,vers=4 \
  --opt device=:/exports/mydata \
  nfs-volume

# With labels (for management)
docker volume create \
  --label env=production \
  --label app=myapp \
  --label team=backend \
  mydb-data

# Volumes are automatically created if referenced in a run command
docker run -v newvolume:/data myapp
# "newvolume" is created automatically if it does not exist
```

### docker volume ls, inspect, rm, prune

```bash
# List all volumes
docker volume ls
# DRIVER    VOLUME NAME
# local     mydb-data
# local     postgres_data
# local     mongo_data

# Find dangling volumes (not connected to any container)
docker volume ls -f dangling=true

# Filter by label
docker volume ls --filter label=env=production

# Inspect — full details
docker volume inspect mydb-data
# [
#   {
#     "Name": "mydb-data",
#     "Driver": "local",
#     "Mountpoint": "/var/lib/docker/volumes/mydb-data/_data",
#     "Labels": {"env": "production"},
#     ...
#   }
# ]

# Get only the mount path
docker volume inspect --format '{{.Mountpoint}}' mydb-data
# /var/lib/docker/volumes/mydb-data/_data

# Remove — stop the container first!
docker volume rm mydb-data
# Error: volume is in use — if a container is running

# Correct approach: remove the container first
docker rm -f mycontainer
docker volume rm mydb-data

# Remove multiple at once
# (Remove containers first, then volumes)
docker volume prune

# Skip confirmation
docker volume prune -f

# Filter by label before pruning
docker volume prune --filter label=env=staging
```

### --mount vs -v Syntax — The Modern Way

```bash
# ─── OLD -v SYNTAX ──────────────────────────────────────
# Older style, still works, but less readable

# Named volume
docker run -v myvolume:/app/data myapp

# Bind mount
docker run -v /host/path:/container/path myapp

# Read-only bind mount
docker run -v /host/path:/container/path:ro myapp

# ─── NEW --mount SYNTAX ──────────────────────────────────
# Newer, explicit, recommended

# Named volume
docker run --mount type=volume,source=myvolume,target=/app/data myapp

# Bind mount
docker run --mount type=bind,source=/host/path,target=/app/path myapp

# Read-only bind mount
docker run --mount type=bind,source=/host/path,target=/app/path,readonly myapp

# tmpfs
docker run --mount type=tmpfs,target=/tmp,tmpfs-size=100m myapp

# Why --mount is better:
# - More explicit — type is clearly stated
# - Better error messages
# - Supports all options (tmpfs-size, etc.)
# - Recommended format in Docker Docs
# - More readable in scripts
# - Named parameters catch typos
```

> **Note:** **-v vs --mount: One Important Difference.** A subtle distinction: `-v /nonexistent:/data` will cause Docker to automatically create the host directory (sometimes with the wrong type). `--mount type=bind,source=/nonexistent,target=/data` returns an error if the source does not exist. **--mount is stricter and more predictable** — which makes it better for production.

> **Caution:** **docker volume prune — Be Very Careful in Production!** This command deletes "dangling" (unused) volumes. However, if you have temporarily stopped a container (intending to restore its data), its volume may be deleted too. In production, first run `docker volume ls -f dangling=true` to see which volumes are actually unused, then selectively use `docker volume rm`.

---

## Production Volume Patterns — Real-World Usage

### Database Persistence Patterns

#### PostgreSQL with Named Volume

```bash
# Step 1: Create the volume
docker volume create postgres_data

# Step 2: Run PostgreSQL with a proper production setup
docker run -d \
  --name postgres \
  -e POSTGRES_USER=admin \
  -e POSTGRES_PASSWORD=securepassword123 \
  -e POSTGRES_DB=myapp \
  -v postgres_data:/var/lib/postgresql/data \
  -p 127.0.0.1:5432:5432 \
  --restart unless-stopped \
  --health-cmd="pg_isready -U admin" \
  --health-interval=10s \
  postgres:16-alpine

# Verify
docker ps                                         # Check status and health
docker exec postgres psql -U admin -c "\l"        # List databases
```

#### MongoDB with Multiple Volumes

```bash
# MongoDB has two important paths:
# /data/db       — actual database files
# /data/configdb — configuration data

docker run -d \
  --name mongodb \
  -v mongo_data:/data/db \
  -v mongo_config:/data/configdb \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=securepass \
  -p 127.0.0.1:27017:27017 \
  --restart unless-stopped \
  mongo:7

# Verify
docker exec mongodb mongosh -u admin -p securepass --eval "db.adminCommand('listDatabases')"
```

### Backup Strategies

```bash
# ─── VOLUME BACKUP (any type of data) ─────────────────────
# Use a temporary container — read the volume, create a tar archive
docker run --rm \
  -v mydb_data:/data \
  -v $(pwd)/backups:/backup \
  alpine \
  tar czf /backup/mydb-$(date +%Y%m%d-%H%M%S).tar.gz /data

# Creates a file in /backup: mydb-20240115-142030.tar.gz

# ─── VOLUME RESTORE ────────────────────────────────────────
docker run --rm \
  -v mydb_data:/data \
  -v $(pwd)/backups:/backup \
  alpine \
  tar xzf /backup/mydb-20240115-142030.tar.gz -C /

# ─── POSTGRES DUMP (recommended for PostgreSQL) ────────────
# Logical backup — portable and version-aware
docker exec postgres pg_dump -U admin myapp > backup-$(date +%Y%m%d).sql

# Restore
docker exec -i postgres psql -U admin myapp < backup-20240115.sql

# Compressed backup
docker exec postgres pg_dump -U admin myapp | gzip > backup.sql.gz

# Restore compressed
gunzip -c backup.sql.gz | docker exec -i postgres psql -U admin myapp

# ─── MONGODB DUMP ──────────────────────────────────────────
docker exec mongodb mongodump -u admin -p securepass --out /tmp/backup
docker cp mongodb:/tmp/backup ./mongodb-backup

# Restore
docker cp ./mongodb-backup mongodb:/tmp/backup
docker exec mongodb mongorestore -u admin -p securepass /tmp/backup
```

### Shared Volumes Between Containers

```bash
# Pattern: one container writes, another reads
# No network communication required between them!
docker volume create shared-logs

# App container — writes logs
docker run -d \
  --name app1 \
  -v shared-logs:/var/log/app \
  myapp:latest

# Log viewer — read-only access to the same volume
docker run -d \
  --name log-viewer \
  -v shared-logs:/logs:ro \
  log-viewer-app:latest

# log-viewer can now read all of app1's logs
# No network communication needed!

# Real use case: Nginx serving React static files
docker volume create static-files

# Build container: build React, copy to volume
docker run --rm \
  -v static-files:/app/build \
  react-builder:latest

# Nginx container: serve files from the same volume
docker run -d \
  --name nginx \
  -v static-files:/usr/share/nginx/html:ro \
  -p 80:80 \
  nginx:alpine
```

### Cloud Volume Drivers — AWS EBS, Azure Disk

```bash
# AWS EBS-backed volumes (rexray plugin)
# If the host is replaced, data remains safe on AWS EBS!

# Install the plugin
docker plugin install rexray/ebs \
  EBS_ACCESSKEY=AKIAIOSFODNN7EXAMPLE \
  EBS_SECRETKEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# Create an EBS-backed volume
docker volume create \
  --driver rexray/ebs \
  --opt size=20 \
  --opt type=gp3 \
  --opt iops=3000 \
  myapp-data

# Use it — exactly like a regular volume
docker run -d \
  --name postgres \
  -v myapp-data:/var/lib/postgresql/data \
  postgres:16

# If the host crashes, detach and reattach the EBS volume to a new host
# Data is fully safe on AWS!

# For Azure: the cloudstor plugin is available
# For GCP: use the gcepd driver
```

> **Note:** **Production Reality: Cloud Volumes = True Persistence.** Local named volumes are tied to the Docker host — if the host machine is lost, the volumes are gone (EBS is not). In real production, use **AWS EFS/EBS**, **Azure Managed Disks**, or **GCP Persistent Disk** via volume drivers. Or better yet, use managed databases (RDS, Atlas) — that is the preferred approach.

> **Tip:** **Volume Best Practices Summary.**
> 1. **Production databases:** Named volumes or cloud-backed volumes (prefer RDS)
> 2. **Development:** Bind mounts for code, named volumes for databases
> 3. **Secrets/session data:** tmpfs
> 4. **Backups:** Automated cron + pg_dump/mongodump stored on separate storage
> 5. **Never:** Store critical data only in the container's writable layer

Also make sure your `.env` files are correctly structured — you can validate them with the [.env Example Checker](/env-example-checker) before deploying. Once your stack is wired up, put these skills to work with real scenarios in [Hands-on DevOps Projects](/learn/guides/devops-projects).

---

## Docker Compose Introduction

<figure class="dgm" role="img" aria-label="Docker Compose diagram showing a single docker-compose.yml file on the left with a 'docker compose up' arrow pointing to three service boxes on the right (web, db, cache) all sitting inside a shared network rectangle, with named volume cylinders below db and cache">
<svg viewBox="0 0 680 250" width="680" height="250" xmlns="http://www.w3.org/2000/svg">
  <!-- Compose file box -->
  <rect x="20" y="60" width="160" height="130" rx="8" class="dgm-surface-2" stroke="none"/>
  <rect x="20" y="60" width="160" height="130" rx="8" fill="none" stroke-width="1.5" class="dgm-stroke"/>
  <text x="100" y="84" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">docker-compose.yml</text>
  <text x="100" y="104" text-anchor="middle" font-size="10" class="dgm-muted">services:</text>
  <text x="100" y="120" text-anchor="middle" font-size="10" class="dgm-muted">  web: image: nginx</text>
  <text x="100" y="136" text-anchor="middle" font-size="10" class="dgm-muted">  db: image: postgres</text>
  <text x="100" y="152" text-anchor="middle" font-size="10" class="dgm-muted">  cache: image: redis</text>
  <text x="100" y="172" text-anchor="middle" font-size="10" class="dgm-muted">networks: app-net</text>
  <!-- Arrow + command label -->
  <line x1="182" y1="125" x2="240" y2="125" stroke-width="2" class="dgm-ink-stroke"/>
  <polygon points="240,120 252,125 240,130" class="dgm-ink"/>
  <text x="216" y="115" text-anchor="middle" font-size="10" class="dgm-ink">docker</text>
  <text x="216" y="143" text-anchor="middle" font-size="10" class="dgm-ink">compose up</text>
  <!-- Shared network outline -->
  <rect x="252" y="30" width="408" height="180" rx="8" class="dgm-accent-soft" stroke="none"/>
  <rect x="252" y="30" width="408" height="180" rx="8" fill="none" stroke-width="1.5" class="dgm-accent-stroke"/>
  <text x="456" y="52" text-anchor="middle" font-size="11" font-weight="bold" class="dgm-ink">Shared Network: app-net</text>
  <!-- Web service -->
  <rect x="268" y="64" width="114" height="72" rx="7" class="dgm-surface-2" stroke="none"/>
  <rect x="268" y="64" width="114" height="72" rx="7" fill="none" stroke-width="1.5" class="dgm-stroke"/>
  <text x="325" y="86" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">web</text>
  <text x="325" y="103" text-anchor="middle" font-size="10" class="dgm-muted">nginx / React</text>
  <text x="325" y="119" text-anchor="middle" font-size="10" class="dgm-muted">port 3000:80</text>
  <!-- DB service -->
  <rect x="399" y="64" width="114" height="72" rx="7" class="dgm-surface-2" stroke="none"/>
  <rect x="399" y="64" width="114" height="72" rx="7" fill="none" stroke-width="1.5" class="dgm-stroke"/>
  <text x="456" y="86" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">db</text>
  <text x="456" y="103" text-anchor="middle" font-size="10" class="dgm-muted">postgres:15</text>
  <text x="456" y="119" text-anchor="middle" font-size="10" class="dgm-muted">volume: pg_data</text>
  <!-- Cache service -->
  <rect x="530" y="64" width="114" height="72" rx="7" class="dgm-surface-2" stroke="none"/>
  <rect x="530" y="64" width="114" height="72" rx="7" fill="none" stroke-width="1.5" class="dgm-stroke"/>
  <text x="587" y="86" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">cache</text>
  <text x="587" y="103" text-anchor="middle" font-size="10" class="dgm-muted">redis:alpine</text>
  <text x="587" y="119" text-anchor="middle" font-size="10" class="dgm-muted">volume: redis_data</text>
  <!-- Named volume cylinders -->
  <!-- pg_data volume -->
  <ellipse cx="456" cy="175" rx="38" ry="10" class="dgm-accent-soft" stroke="none"/>
  <ellipse cx="456" cy="175" rx="38" ry="10" fill="none" stroke-width="1.5" class="dgm-accent-stroke"/>
  <rect x="418" y="175" width="76" height="20" class="dgm-accent-soft" stroke="none"/>
  <line x1="418" y1="175" x2="418" y2="195" stroke-width="1.5" class="dgm-accent-stroke"/>
  <line x1="494" y1="175" x2="494" y2="195" stroke-width="1.5" class="dgm-accent-stroke"/>
  <ellipse cx="456" cy="195" rx="38" ry="10" class="dgm-accent-soft" stroke="none"/>
  <ellipse cx="456" cy="195" rx="38" ry="10" fill="none" stroke-width="1.5" class="dgm-accent-stroke"/>
  <text x="456" y="191" text-anchor="middle" font-size="9" class="dgm-ink">pg_data</text>
  <!-- redis_data volume -->
  <ellipse cx="587" cy="175" rx="38" ry="10" class="dgm-accent-soft" stroke="none"/>
  <ellipse cx="587" cy="175" rx="38" ry="10" fill="none" stroke-width="1.5" class="dgm-accent-stroke"/>
  <rect x="549" y="175" width="76" height="20" class="dgm-accent-soft" stroke="none"/>
  <line x1="549" y1="175" x2="549" y2="195" stroke-width="1.5" class="dgm-accent-stroke"/>
  <line x1="625" y1="175" x2="625" y2="195" stroke-width="1.5" class="dgm-accent-stroke"/>
  <ellipse cx="587" cy="195" rx="38" ry="10" class="dgm-accent-soft" stroke="none"/>
  <ellipse cx="587" cy="195" rx="38" ry="10" fill="none" stroke-width="1.5" class="dgm-accent-stroke"/>
  <text x="587" y="191" text-anchor="middle" font-size="9" class="dgm-ink">redis_data</text>
  <!-- Connect volumes to services -->
  <line x1="456" y1="136" x2="456" y2="164" stroke-width="1.5" class="dgm-ink-stroke" stroke-dasharray="4,3"/>
  <line x1="587" y1="136" x2="587" y2="164" stroke-width="1.5" class="dgm-ink-stroke" stroke-dasharray="4,3"/>
</svg>
<figcaption>One Compose file declares the full application stack; <code>docker compose up</code> creates all services on a shared network with automatic DNS so containers resolve each other by service name.</figcaption>
</figure>

### Why Docker Compose Exists

Real-world applications do not fit in a single container. A MERN stack application requires:

- **MongoDB** — database
- **Express/Node** — backend API
- **React** — frontend (served via Nginx)
- **Redis** — caching / sessions

Without Compose, everything must be managed manually:

```bash
# Without Compose — run all of this by hand!
docker network create myapp-net

docker run -d \
  --name mongodb \
  --network myapp-net \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=secret \
  -v mongo_data:/data/db \
  mongo:7.0

docker run -d \
  --name api \
  --network myapp-net \
  -e MONGODB_URI=mongodb://admin:secret@mongodb:27017/myapp \
  -p 5000:5000 \
  myapp-api:latest

docker run -d \
  --name frontend \
  --network myapp-net \
  -p 3000:80 \
  myapp-frontend:latest

# Repeat all of this on every restart...
```

> **Tip:** Just as `package.json` lists all npm dependencies and `npm install` sets everything up — `docker-compose.yml` defines all your containers and `docker compose up` starts everything in one command.

With Compose, the same setup becomes:

```bash
# With Compose — just this!
docker compose up -d

# To shut everything down:
docker compose down
```

Convert an existing command with the [Docker run → Compose converter](/docker-run-to-compose).

### Compose v1 vs Compose v2 — What Is the Difference?

| Feature | Compose v1 (Old) | Compose v2 (Current) |
|---|---|---|
| Command | `docker-compose` (with dash) | `docker compose` (no dash!) |
| Installation | Separate Python binary | Built-in Docker plugin |
| Status | Deprecated (2023) | Active, standard |
| Performance | Slower | Faster (Go-based) |
| Features | Limited | Full feature set |
| 2026 standard | Do not use | Use this! |

> **Caution:** Use `docker compose` (no dash) — this is Compose v2 and the current standard. If an older tutorial uses `docker-compose` (with a dash), it is using v1 syntax. V2 is mostly backward compatible, but make it a habit to use v2.

```bash
# Check version — should show v2.x.x
docker compose version
# Output: Docker Compose version v2.24.5

# Old v1 (deprecated — do not use!)
docker-compose version

# If the Compose plugin is missing:
# Ubuntu/Debian
sudo apt update && sudo apt install docker-compose-plugin

# RHEL/CentOS/Fedora
sudo dnf install docker-compose-plugin

# macOS (auto-bundled with Docker Desktop)
# Windows (auto-bundled with Docker Desktop)
```

### Compose vs Kubernetes — When to Use Which?

| Use Case | Compose | Kubernetes |
|---|---|---|
| Local development | Perfect choice | Overkill |
| Small apps (< 5 containers) | Yes | Overkill |
| Single server deployment | Yes | Not needed |
| Auto-scaling | No | Yes |
| Multi-host clusters | No | Yes |
| Zero-downtime deploys | Limited | Yes |
| Production at scale | Limited | Yes |
| Learning curve | Easy (YAML) | Steep |
| Startup / small teams | Best fit | Overkill initially |

> **Note:** Start with Compose. Run a MERN stack locally using Compose; Compose is sufficient for a single VPS in production too. When traffic grows and auto-scaling becomes necessary, then invest in learning Kubernetes. The progression is: **Docker → Compose → Kubernetes**.

---

## Compose File Structure

### Annotated docker-compose.yml Structure

Understanding the full structure allows you to read any Compose file with ease:

```yaml
# docker-compose.yml
# In Compose v2, the version field is optional/deprecated
# version: '3.8'  ← no longer required!

services:          # All containers are defined here
  web:             # Service name (also becomes the DNS hostname!)
    image: nginx   # Which image to use
    # --- OR ---
    build: .       # Build from a local Dockerfile

  api:             # Another service
    build:
      context: ./api               # Build context folder
      dockerfile: Dockerfile.prod  # Specific Dockerfile name

  db:              # Database service
    image: postgres:16

networks:          # Define custom Docker networks
  frontend:        # Frontend network (public-facing)
  backend:         # Backend network (private, for DB communication)

volumes:           # Named volumes (data persistence)
  db_data:         # Database files stored here
  redis_data:      # Redis data persistence

configs:           # Inject config files
  nginx_config:
    file: ./nginx.conf

secrets:           # Sensitive data (mainly for Swarm mode)
  db_password:
    file: ./secrets/db_password.txt
```

> **Tip:** **Service Name = DNS Hostname!** In Compose, the service name automatically becomes the DNS hostname. If a service is named `db`, other containers can connect to it via `db:5432` — not `localhost` or an IP. Compose handles this automatically via Docker networking.

### YAML Best Practices in Compose

```yaml
# Use quotes for strings containing special characters
environment:
  - DATABASE_URL="postgresql://user:pass@db:5432/mydb"

# Use literal block (|) for multiline commands
command: |
  sh -c "
    until pg_isready; do sleep 1; done
    python manage.py migrate
    python manage.py runserver 0.0.0.0:8000
  "

# YAML Anchors — avoid repetition (DRY principle)
x-common-env: &common-env      # &common-env = define the anchor
  NODE_ENV: production
  LOG_LEVEL: info
  TZ: Asia/Kolkata

services:
  api:
    environment:
      <<: *common-env          # *common-env = use the anchor (merge)
      PORT: 3000
      SERVICE_NAME: api

  worker:
    environment:
      <<: *common-env          # Reuse the same env vars
      WORKER_TYPE: email
      CONCURRENCY: "4"
```

> **Note:** **YAML Anchors — DRY Principle.** YAML anchors (`&name`) and aliases (`*name`) let you write common configuration once and reuse it across multiple services. `<<: *common-env` means "merge all key-value pairs here." This is the same as the spread operator (`...commonProps`) in JavaScript.

### Override Files Pattern — Multiple Environments

One codebase, different configurations per environment — this pattern is used in production-grade applications:

```bash
# File structure:
docker-compose.yml              # Base config (common settings)
docker-compose.override.yml     # Dev overrides — AUTOMATICALLY loaded!
docker-compose.dev.yml          # Development specifics
docker-compose.prod.yml         # Production specifics
docker-compose.test.yml         # Testing / CI specifics

# Development (auto-loads base + override):
docker compose up -d

# Production (specify files explicitly):
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Testing:
docker compose -f docker-compose.yml -f docker-compose.test.yml up -d

# Validate the final merged config:
docker compose -f docker-compose.yml -f docker-compose.prod.yml config
```

```yaml
# docker-compose.yml (base)
services:
  api:
    image: myapp-api:latest
    environment:
      NODE_ENV: production

---
# docker-compose.override.yml (dev — auto-loaded!)
services:
  api:
    build: .                    # Build locally in dev
    volumes:
      - ./src:/app/src          # Bind mount for hot reload
    environment:
      NODE_ENV: development
      DEBUG: "true"
    ports:
      - "5000:5000"             # Expose port directly in dev

---
# docker-compose.prod.yml
services:
  api:
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M
    logging:
      driver: json-file
      options:
        max-size: "10m"
```

> **Tip:** **Best Practice: Override Files.** Keep common configuration in the base `docker-compose.yml`. Put environment-specific settings in override files. `docker-compose.override.yml` loads automatically for development — place bind mounts, debug ports, and dev-only tools there. The production file should contain resource limits, proper restart policies, and logging configuration.

---

## Service Configuration Deep Dive

### Complete Service Configuration Reference

All the options available in a service, annotated:

```yaml
services:
  myapp:
    # ──────────────────────────────────────────────
    # IMAGE vs BUILD — choose one
    # ──────────────────────────────────────────────
    # Option 1: Use a pre-built image
    image: nginx:1.25-alpine

    # Option 2: Build from a local Dockerfile
    build:
      context: .                    # Build context (folder with Dockerfile)
      dockerfile: Dockerfile        # Which Dockerfile? (default: Dockerfile)
      args:                         # Build-time arguments (ARG in Dockerfile)
        NODE_ENV: production
        APP_VERSION: "1.0.0"
      target: production            # Specific stage in a multi-stage build

    # ──────────────────────────────────────────────
    # CONTAINER NAME
    # ──────────────────────────────────────────────
    container_name: my-nginx
    # Warning: setting container_name prevents scaling!
    # docker compose up --scale myapp=3 will fail if container_name is set

    # ──────────────────────────────────────────────
    # PORTS — host:container
    # ──────────────────────────────────────────────
    ports:
      - "8080:80"                   # host 8080 → container 80
      - "443:443"                   # HTTPS
      - "127.0.0.1:9090:9090"       # Localhost only (secure!)

    # ──────────────────────────────────────────────
    # ENVIRONMENT VARIABLES
    # ──────────────────────────────────────────────
    environment:
      NODE_ENV: production
      DB_HOST: db                   # Use the service name — not localhost!
      DB_PORT: "5432"               # Use quotes for numeric values
      DB_NAME: mydb

    # Load from env_file
    env_file:
      - .env                        # Main .env file
      - .env.production             # Production-specific variables

    # ──────────────────────────────────────────────
    # VOLUMES — data persistence and bind mounts
    # ──────────────────────────────────────────────
    volumes:
      - ./src:/app/src:ro           # Bind mount, read-only (dev hot reload)
      - db_data:/var/lib/postgresql/data  # Named volume (production data)
      - /etc/localtime:/etc/localtime:ro  # Host timezone inside container

    # ──────────────────────────────────────────────
    # NETWORKS
    # ──────────────────────────────────────────────
    networks:
      - frontend                    # Public-facing network
      - backend                     # Private network (for DB communication)

    # ──────────────────────────────────────────────
    # DEPENDS_ON — startup order
    # ──────────────────────────────────────────────
    depends_on:
      db:
        condition: service_healthy  # Wait until db is healthy
      redis:
        condition: service_started  # Just started, not necessarily healthy

    # ──────────────────────────────────────────────
    # RESTART POLICY
    # ──────────────────────────────────────────────
    restart: unless-stopped
    # Options:
    # no           — do not restart (default)
    # always       — always restart
    # on-failure   — restart only on failure
    # unless-stopped — always restart unless manually stopped

    # ──────────────────────────────────────────────
    # COMMAND and ENTRYPOINT
    # ──────────────────────────────────────────────
    command: npm start              # String form
    command: ["node", "server.js"]  # Array form (preferred — shell injection safe)

    entrypoint: ["./docker-entrypoint.sh"]

    # ──────────────────────────────────────────────
    # HEALTHCHECK
    # ──────────────────────────────────────────────
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s       # Check every 30 seconds
      timeout: 10s        # Response must arrive within 10 seconds
      retries: 3          # Mark unhealthy after 3 failures
      start_period: 40s   # Wait this long after startup before checking

    # ──────────────────────────────────────────────
    # DEPLOY — resource limits
    # ──────────────────────────────────────────────
    deploy:
      resources:
        limits:
          cpus: "0.50"            # Max 50% of one CPU core
          memory: 512M            # Max 512 MB RAM
        reservations:
          cpus: "0.25"            # Minimum guaranteed CPU
          memory: 256M            # Minimum guaranteed RAM

    # ──────────────────────────────────────────────
    # PROFILES — optional services
    # ──────────────────────────────────────────────
    profiles:
      - debug   # Only starts with: docker compose --profile debug up

    # ──────────────────────────────────────────────
    # LOGGING
    # ──────────────────────────────────────────────
    logging:
      driver: json-file
      options:
        max-size: "10m"     # Log file max 10 MB
        max-file: "3"       # Max 3 log files (then rotate)

    # ──────────────────────────────────────────────
    # EXTRA HOSTS — /etc/hosts entries
    # ──────────────────────────────────────────────
    extra_hosts:
      - "host.docker.internal:host-gateway"  # Connect to host machine

    # ──────────────────────────────────────────────
    # DNS — custom DNS servers
    # ──────────────────────────────────────────────
    dns:
      - 8.8.8.8
      - 8.8.4.4
```

### depends_on and Healthchecks — A Common Gotcha

> **Caution:** **The Default depends_on Behavior Is Misleading!** A simple `depends_on: [db]` only guarantees that the `db` container has *started* — not that it is *ready*. PostgreSQL takes 5–10 seconds to initialize. If the `api` service tries to connect immediately, the connection will fail. Solution: use `condition: service_healthy` and define a `healthcheck` on the db service.

```yaml
services:
  db:
    image: postgres:16-alpine
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U myuser -d mydb"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s    # Give PostgreSQL time to initialize

  api:
    build: .
    depends_on:
      db:
        condition: service_healthy   # Wait until HEALTHY, not just STARTED!
```

> **Tip:** **Profiles — Make Dev Tools Optional.** Using `profiles`, you can make certain services optional. For example, `pgadmin` (a DB GUI) is only needed in development — give it `profiles: [debug]`. It will not start during a normal `docker compose up`. It will only start with `docker compose --profile debug up`. This prevents debug tools from accidentally running in production.

---

## Docker Compose Commands — Complete Reference

### docker compose up — Start Everything

```bash
# Basic — start in foreground (Ctrl+C to stop)
docker compose up

# Detached — start in background (for production)
docker compose up -d

# Rebuild images and start (after code changes)
docker compose up --build

# Force recreate containers (even if nothing changed)
docker compose up --force-recreate

# Start only specific services
docker compose up -d api db

# Run multiple instances (for load balancing)
docker compose up -d --scale api=3
# Note: container_name must not be set when scaling!

# Start with a specific profile
docker compose --profile debug up -d

# Use a custom .env file
docker compose --env-file .env.prod up -d

# Remove orphan containers (not defined in the compose file)
docker compose up -d --remove-orphans
```

### docker compose down — Stop and Clean Up

```bash
# Standard — remove containers and networks
docker compose down

# Also remove volumes (DATA LOSS — be careful!)
docker compose down -v

# Also remove images
docker compose down --rmi all     # All images
docker compose down --rmi local   # Only locally built images

# Stop but keep containers (do not remove)
docker compose stop

# Complete teardown — clean up everything
docker compose down -v --rmi all --remove-orphans
```

> **Caution:** **docker compose down -v — Data Will Be Deleted!** The `-v` flag removes all named volumes. This means all database data is gone. This is useful for a clean restart in development, but never use it carelessly in production. Take a backup first.

### docker compose logs — Debugging

```bash
# Logs from all services
docker compose logs

# Follow (live stream)
docker compose logs -f

# Logs from a specific service
docker compose logs -f api

# Last 100 lines
docker compose logs --tail 100

# With timestamps
docker compose logs -t

# Multiple services at once
docker compose logs -f api db

# Last 1 hour
docker compose logs --since 1h

# From a specific time
docker compose logs --since "2024-01-15T10:00:00"
```

### docker compose exec vs run — What Is the Difference?

| Feature | exec | run |
|---|---|---|
| Container | Runs inside an existing running container | Starts a new container |
| Use case | Debug a running service | One-off commands (migrations, etc.) |
| Service running? | Must be running | Service does not need to be running |
| Cleanup | Container remains as-is | Auto-cleanup with `--rm` |

```bash
# ── docker compose exec ──────────────────────────────
# Run a command in a running container
docker compose exec api bash
docker compose exec db psql -U admin -d mydb
docker compose exec redis redis-cli

# Without TTY (for automation/scripts)
docker compose exec -T api npm test

# As a specific user
docker compose exec --user root api bash

# ── docker compose run ──────────────────────────────
# One-off command in a new container
docker compose run api npm run migrate
docker compose run api python manage.py createsuperuser

# Auto-cleanup after run
docker compose run --rm api npm test

# Override the entrypoint
docker compose run --entrypoint bash api

# With custom env vars
docker compose run -e DEBUG=true api npm start
```

> **Tip:** **exec vs run — Simple Rule.** Need to do something in a running service (debug, inspect)? → `exec`. Need to run a one-off task alongside the service (DB migration, seed data, test run)? → `run --rm`. `docker compose run --rm web python manage.py migrate` is the standard pattern for Django/Rails migrations.

### Other Useful Commands

```bash
# List services
docker compose ps
docker compose ps -a             # Include stopped services
docker compose ps --format json  # JSON output

# Build only (do not start)
docker compose build
docker compose build --no-cache api      # Ignore cache
docker compose build --parallel          # Build all in parallel

# Pull latest images
docker compose pull

# Push images to registry
docker compose push

# Validate the compose file (shows final merged config)
docker compose config

# Show running processes
docker compose top

# Restart services
docker compose restart
docker compose restart api

# Pause/Unpause (stop CPU usage, keep memory)
docker compose pause
docker compose unpause

# Create without starting
docker compose create

# Stream events
docker compose events
```

> **Tip:** **Validate Your Compose File.** `docker compose config` is a very useful command that merges all override files and shows the final YAML. Catch typos, missing variables, and syntax errors before deploying. Use it in CI/CD too: `docker compose -f docker-compose.yml -f docker-compose.prod.yml config --quiet`.

---

## Production Compose Examples — Real-World Stacks

### Example 1: MERN Stack (React + Node + MongoDB)

Most relevant for React developers — a complete MERN stack with Compose:

```yaml
# docker-compose.yml — MERN Stack
# Usage: docker compose up -d
# Variables are loaded from a .env file

services:
  # ────────────────────────────────
  # MongoDB Database
  # ────────────────────────────────
  mongodb:
    image: mongo:7.0-jammy
    container_name: mern-mongodb
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER:-admin}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD:-password}
      MONGO_INITDB_DATABASE: ${MONGO_DB:-myapp}
    volumes:
      - mongo_data:/data/db
      - mongo_config:/data/configdb
      - ./mongo-init.js:/docker-entrypoint-initdb.d/init.js:ro
    networks:
      - backend          # Backend network only — no public access!
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  # ────────────────────────────────
  # Node.js API Server
  # ────────────────────────────────
  api:
    build:
      context: ./api
      dockerfile: Dockerfile
      target: production    # Use the production stage of a multi-stage build
    container_name: mern-api
    environment:
      NODE_ENV: production
      MONGODB_URI: mongodb://${MONGO_USER:-admin}:${MONGO_PASSWORD:-password}@mongodb:27017/${MONGO_DB:-myapp}?authSource=admin
      JWT_SECRET: ${JWT_SECRET:-changeme-in-production}
      PORT: 5000
    volumes:
      - api_logs:/app/logs
    networks:
      - backend              # For MongoDB communication
      - frontend             # For receiving requests from React
    depends_on:
      mongodb:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:5000/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
    deploy:
      resources:
        limits:
          cpus: "0.50"
          memory: 512M
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  # ────────────────────────────────
  # React Frontend (served via Nginx)
  # ────────────────────────────────
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        REACT_APP_API_URL: ${API_URL:-http://localhost:5000}
    container_name: mern-frontend
    ports:
      - "${FRONTEND_PORT:-3000}:80"
    networks:
      - frontend
    depends_on:
      api:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost/health"]
      interval: 30s
      timeout: 5s
      retries: 3

# ────────────────────────────────
# Volumes
# ────────────────────────────────
volumes:
  mongo_data:
    driver: local
    labels:
      - "com.myapp.description=MongoDB data volume"
  mongo_config:
  api_logs:

# ────────────────────────────────
# Networks
# ────────────────────────────────
networks:
  frontend:
    driver: bridge             # Public traffic comes here
  backend:
    driver: bridge
    internal: true             # No external access! Container-to-container only
```

> **Note:** **Production Pattern: Internal Networks.** Apply `internal: true` to the backend network. This means MongoDB is never directly accessible from the internet — only the `api` service can reach it. This is a security best practice. The flow is: Frontend → API (via frontend network), API → MongoDB (via backend network). MongoDB has no public port exposed.

### Example 2: Python Flask + PostgreSQL + Redis + Celery

Full-stack Python application with background task processing:

```yaml
# docker-compose.yml — Flask + Postgres + Redis + Celery

services:
  # ────────────────────────────────
  # PostgreSQL Database
  # ────────────────────────────────
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${DB_USER:-myuser}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-mypassword}
      POSTGRES_DB: ${DB_NAME:-mydb}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./sql/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    networks:
      - backend
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-myuser} -d ${DB_NAME:-mydb}"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ────────────────────────────────
  # Redis — Cache + Message Broker
  # ────────────────────────────────
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD:-redis_secret}
    # appendonly yes = persist data even after restart
    volumes:
      - redis_data:/data
    networks:
      - backend
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "--pass", "${REDIS_PASSWORD:-redis_secret}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3

  # ────────────────────────────────
  # Flask Web Application
  # ────────────────────────────────
  web:
    build: .
    environment:
      DATABASE_URL: postgresql://${DB_USER:-myuser}:${DB_PASSWORD:-mypassword}@postgres:5432/${DB_NAME:-mydb}
      REDIS_URL: redis://:${REDIS_PASSWORD:-redis_secret}@redis:6379/0
      FLASK_ENV: ${FLASK_ENV:-production}
      SECRET_KEY: ${SECRET_KEY:-change-in-production}
    ports:
      - "${APP_PORT:-5000}:5000"
    volumes:
      - app_logs:/app/logs
      - ./uploads:/app/uploads   # Persist user uploads
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - backend
      - frontend
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s

  # ────────────────────────────────
  # Celery Worker — Background Tasks
  # ────────────────────────────────
  celery_worker:
    build: .    # Same image as web!
    command: celery -A app.celery worker --loglevel=info --concurrency=4
    environment:
      DATABASE_URL: postgresql://${DB_USER:-myuser}:${DB_PASSWORD:-mypassword}@postgres:5432/${DB_NAME:-mydb}
      REDIS_URL: redis://:${REDIS_PASSWORD:-redis_secret}@redis:6379/0
    depends_on:
      - web
      - redis
    networks:
      - backend
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M

  # ────────────────────────────────
  # Celery Beat — Scheduled Tasks (Cron-like)
  # ────────────────────────────────
  celery_beat:
    build: .
    command: celery -A app.celery beat --loglevel=info
    environment:
      DATABASE_URL: postgresql://${DB_USER:-myuser}:${DB_PASSWORD:-mypassword}@postgres:5432/${DB_NAME:-mydb}
      REDIS_URL: redis://:${REDIS_PASSWORD:-redis_secret}@redis:6379/0
    depends_on:
      - web
    networks:
      - backend
    restart: unless-stopped
    # Beat should have only ONE instance — do not scale it!

  # ────────────────────────────────
  # Nginx Reverse Proxy
  # ────────────────────────────────
  nginx:
    image: nginx:1.25-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - web
    networks:
      - frontend
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  app_logs:

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true    # DB and Redis must not be directly accessible!
```

> **Tip:** **Same Image, Different Command!** Flask web, Celery worker, and Celery beat all use the same `build: .` (same Docker image) but with different `command` values. This is efficient: build one image, run different processes. When code changes, only one image needs to be rebuilt.

### Example 3: WordPress + MySQL

Classic CMS setup — useful for client projects:

```yaml
# docker-compose.yml — WordPress + MySQL + Nginx

services:
  # ────────────────────────────────
  # MySQL Database
  # ────────────────────────────────
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-rootpassword}
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wordpress
      MYSQL_PASSWORD: ${MYSQL_PASSWORD:-wppassword}
    volumes:
      - mysql_data:/var/lib/mysql
    networks:
      - wp-network
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "wordpress", "-pwppassword"]
      interval: 30s
      timeout: 10s
      retries: 5

  # ────────────────────────────────
  # WordPress (PHP-FPM)
  # ────────────────────────────────
  wordpress:
    image: wordpress:6.4-php8.2-fpm-alpine
    environment:
      WORDPRESS_DB_HOST: mysql:3306      # Use the service name!
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: ${MYSQL_PASSWORD:-wppassword}
      WORDPRESS_DB_NAME: wordpress
    volumes:
      - wp_content:/var/www/html/wp-content  # Themes, plugins, uploads
    depends_on:
      mysql:
        condition: service_healthy
    networks:
      - wp-network
    restart: unless-stopped

  # ────────────────────────────────
  # Nginx — Serve static files + PHP-FPM proxy
  # ────────────────────────────────
  nginx:
    image: nginx:1.25-alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx/wordpress.conf:/etc/nginx/conf.d/default.conf:ro
      - wp_content:/var/www/html/wp-content:ro   # Serve static files directly
    depends_on:
      - wordpress
    networks:
      - wp-network
    restart: unless-stopped

volumes:
  mysql_data:    # Database files
  wp_content:    # WordPress uploads, themes, plugins

networks:
  wp-network:
    driver: bridge
```

### Example 4: Monitoring Stack (Prometheus + Grafana + cAdvisor)

Monitoring production applications is essential. This stack tracks CPU, memory, and network usage of Docker containers:

```yaml
# docker-compose.yml — Monitoring Stack
# Usage: docker compose up -d
# Access: Grafana → http://localhost:3000 (admin/admin)
#         Prometheus → http://localhost:9090

services:
  # ────────────────────────────────
  # Prometheus — Metrics Collector
  # ────────────────────────────────
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.path=/prometheus
      - --web.enable-lifecycle         # Enable config hot-reload
    networks:
      - monitoring
    restart: unless-stopped

  # ────────────────────────────────
  # Grafana — Visualization Dashboard
  # ────────────────────────────────
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_USER: ${GRAFANA_USER:-admin}
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD:-admin}
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
      - ./grafana/datasources:/etc/grafana/provisioning/datasources:ro
    depends_on:
      - prometheus
    networks:
      - monitoring
    restart: unless-stopped

  # ────────────────────────────────
  # cAdvisor — Container Metrics
  # ────────────────────────────────
  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
    ports:
      - "8080:8080"
    networks:
      - monitoring
    restart: unless-stopped
    # cAdvisor communicates directly with the Docker daemon
    # which is why host paths need to be mounted

  # ────────────────────────────────
  # Node Exporter — Host Machine Metrics
  # ────────────────────────────────
  node_exporter:
    image: prom/node-exporter:latest
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - --path.procfs=/host/proc
      - --path.sysfs=/host/sys
    ports:
      - "9100:9100"
    networks:
      - monitoring
    restart: unless-stopped
    # Node Exporter exposes host CPU, RAM, disk, and network metrics

volumes:
  prometheus_data:   # Time-series metrics data
  grafana_data:      # Dashboards and settings

networks:
  monitoring:
    driver: bridge
```

> **Note:** **What the Monitoring Stack Tracks.** **cAdvisor** — CPU/RAM/network/disk usage for every Docker container. **Node Exporter** — hardware metrics for the host machine. **Prometheus** — collects and stores all data. **Grafana** — visualizes everything in dashboards. This monitoring setup is essential in production: you cannot improve what you cannot measure.

> **Note:** **Production Checklist for Compose Apps.**
> - Add `restart: unless-stopped` to all services
> - Configure `healthcheck` on database services
> - Use `internal: true` on networks for sensitive services
> - Store passwords in a `.env` file — never hardcode them in the compose file
> - Add the `.env` file to `.gitignore`
> - Set resource limits (`deploy.resources.limits`)
> - Configure log rotation (`max-size`, `max-file`)
> - Keep images updated with regular `docker compose pull`

---

## Container Registries

Just as **npm registry** stores packages, a Docker registry stores images. You build an image, push it to a registry, and anyone in the world can pull it.

> **Note:** A Docker registry is a storage and distribution system for Docker images. Docker Hub is the default public registry, but you can use private registries for proprietary images. Think of it as GitHub for code — but for images.

### Image Naming Convention

Every Docker image has a fully qualified name. The format is:

```bash
[registry/][username/]image[:tag][@digest]

# Examples — from simple to fully qualified:
ubuntu                                                        # Docker Hub official (implicit library/)
nginx:1.25-alpine                                             # Docker Hub official with tag
library/ubuntu:22.04                                          # Explicit official image path
username/myapp:v1.0                                           # Docker Hub user image

# Cloud registries
ghcr.io/username/myapp:latest                                 # GitHub Container Registry
123456789.dkr.ecr.ap-south-1.amazonaws.com/myapp:v1.0        # AWS ECR (India region)
asia.gcr.io/myproject/myapp:latest                            # Google Container Registry
registry.gitlab.com/group/project/myapp:1.0                   # GitLab Registry

# Digest (immutable — safer than a tag!)
ubuntu@sha256:45b23dee08af5e43a7fea6c4cf9c25ccf269ee113168c19722f87876677c5cb2
```

### Image Tagging Strategy

| Tag Type | Example | Use Case | Stable? |
|---|---|---|---|
| `latest` | `myapp:latest` | Development | No — changes! |
| Semantic Version | `myapp:v1.2.3` | Production releases | Yes |
| Git SHA | `myapp:a3f1b2c` | CI/CD traceability | Yes |
| Branch name | `myapp:main` | Branch-based testing | No |
| Date-based | `myapp:20240115` | Nightly builds | Yes |
| Digest | `myapp@sha256:abc...` | Pinned dependencies | Immutable |

> **Caution:** **Avoid the latest Tag!** Using the `latest` tag in production is dangerous. If a new image is pushed, your deployment may update unexpectedly. Always use specific version tags in production — `myapp:v1.2.3` or a Git SHA.

> **Tip:** **Best Practice: Multiple Tags.** Tag a single image with multiple tags: `myapp:v1.2.3`, `myapp:v1.2`, `myapp:v1`, and `myapp:latest`. This gives users flexibility while maintaining immutable specific versions.

---

## Docker Hub — The Default Registry

Docker Hub is the default public registry — like npm for JavaScript packages. Start with a free account and explore private registries once you hit the limits.

> **Note:** Create an account at [hub.docker.com](https://hub.docker.com). Free accounts include 1 private repository and unlimited public repositories. Use access tokens rather than passwords — they are safer.

### Complete Docker Hub Workflow

```bash
# Step 1: Login to Docker Hub
docker login
# Username: yourname
# Password: (enter password or access token)

# Better: login with an access token (Settings → Security → New Access Token)
docker login -u username --password-stdin <<< "your_access_token_here"

# Step 2: Tag your local image for Docker Hub
docker tag myapp username/myapp:v1.0.0
docker tag myapp username/myapp:latest

# Step 3: Push to Docker Hub
docker push username/myapp:v1.0.0
docker push username/myapp:latest

# Step 4: Pull from anywhere in the world
docker pull username/myapp:v1.0.0

# Step 5: Logout (important on shared machines!)
docker logout
```

### Rate Limits — Important for CI/CD

| Account Type | Pull Limit | Time Window |
|---|---|---|
| Anonymous (no login) | 100 pulls | Per 6 hours / IP |
| Free account (authenticated) | 200 pulls | Per 6 hours |
| Pro / Team / Business | Unlimited | — |

```bash
# Authenticate pulls in CI/CD to avoid rate limits
echo "$DOCKER_PASSWORD" | docker login -u "$DOCKER_USERNAME" --password-stdin

# Check your current rate limit status
TOKEN=$(curl -s "https://auth.docker.io/token?service=registry.docker.io&scope=repository:ratelimitpreview/test:pull" | jq -r .token)
curl -s --head -H "Authorization: Bearer $TOKEN" https://registry-1.docker.io/v2/ratelimitpreview/test/manifests/latest | grep -i ratelimit
```

### Rate Limit Workaround — Mirror Setup

```bash
# /etc/docker/daemon.json — configure a Docker Hub mirror
sudo nano /etc/docker/daemon.json
```

```json
{
  "registry-mirrors": [
    "https://mirror.gcr.io",
    "https://registry.docker-cn.com"
  ]
}
```

```bash
# Restart Docker daemon after the config change
sudo systemctl restart docker

# Verify the mirror is active
docker info | grep -A2 "Registry Mirrors"
```

> **Caution:** **CI/CD Rate Limit Problem.** If your CI/CD pipeline pulls images anonymously (no `docker login`), rate limits are hit quickly — especially in large teams. Solution: always authenticate in CI, or mirror images to your own private registry.

> **Tip:** **Use Access Tokens, Not Passwords.** Docker Hub Settings → Security → New Access Token. Tokens can be given specific permissions (read-only, read-write). If a token is compromised, only that token needs to be revoked — not the full account. Always use access tokens in CI/CD.

---

## Other Registries — AWS ECR, GitHub, GCR

Docker Hub is not the only option. If you deploy to AWS, ECR is the best choice. If you use GitHub Actions, `ghcr.io` is a perfect fit. Here is how to use each.

### AWS Elastic Container Registry (ECR)

> **Note:** **When to use ECR:** When your application is deployed to AWS (ECS, EKS, Lambda). ECR images integrate automatically with AWS services — no extra authentication is needed when running on AWS with proper IAM roles.

```bash
# Prerequisites: AWS CLI installed and configured (aws configure)

# Step 1: Authenticate with ECR (generates a 12-hour token)
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin \
  123456789.dkr.ecr.ap-south-1.amazonaws.com

# Step 2: Create a repository in ECR
aws ecr create-repository \
  --repository-name myapp \
  --region ap-south-1 \
  --image-scanning-configuration scanOnPush=true \
  --encryption-configuration encryptionType=AES256

# Step 3: Tag the image for ECR
ECR_URI="123456789.dkr.ecr.ap-south-1.amazonaws.com"
docker tag myapp:latest $ECR_URI/myapp:latest
docker tag myapp:latest $ECR_URI/myapp:v1.0.0

# Step 4: Push
docker push $ECR_URI/myapp:latest
docker push $ECR_URI/myapp:v1.0.0

# Step 5: Pull (from any authenticated source)
docker pull $ECR_URI/myapp:latest
```

```bash
# ECR Lifecycle Policy — auto-delete old images (save storage costs!)
aws ecr put-lifecycle-policy \
  --repository-name myapp \
  --lifecycle-policy '{
    "rules": [{
      "rulePriority": 1,
      "description": "Keep only last 10 images",
      "selection": {
        "tagStatus": "any",
        "countType": "imageCountMoreThan",
        "countNumber": 10
      },
      "action": {"type": "expire"}
    }]
  }'

# List images in ECR repository
aws ecr describe-images \
  --repository-name myapp \
  --region ap-south-1 \
  --query 'sort_by(imageDetails, &imagePushedAt)[-5:]'
```

### GitHub Container Registry (ghcr.io)

`GITHUB_TOKEN` is automatically available in GitHub Actions — perfect integration:

```bash
# Step 1: Create a Personal Access Token (PAT)
# GitHub → Settings → Developer Settings → Personal Access Tokens
# Required scopes: read:packages, write:packages, delete:packages

# Step 2: Login to ghcr.io
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Step 3: Tag and push
docker tag myapp ghcr.io/username/myapp:latest
docker push ghcr.io/username/myapp:latest

# Make the image public (default is private)
# GitHub → Package → Package Settings → Change Visibility
```

```yaml
# GitHub Actions — push to ghcr.io (automatic authentication!)
name: Build and Push
on:
  push:
    branches: [main]

jobs:
  push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write        # Required for ghcr.io!
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}  # Auto-available!
      
      - name: Build and Push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ghcr.io/${{ github.repository }}/myapp:latest
```

### Google Container Registry / Artifact Registry

```bash
# Authenticate gcloud with Docker
gcloud auth configure-docker asia.gcr.io

# New Artifact Registry (recommended over GCR)
gcloud auth configure-docker asia-south1-docker.pkg.dev

# Tag and push
docker tag myapp asia.gcr.io/my-project/myapp:v1.0
docker push asia.gcr.io/my-project/myapp:v1.0

# Artifact Registry (newer, more features)
docker tag myapp asia-south1-docker.pkg.dev/my-project/my-repo/myapp:v1.0
docker push asia-south1-docker.pkg.dev/my-project/my-repo/myapp:v1.0
```

### Registry Comparison

| Registry | Type | Cost | Best For |
|---|---|---|---|
| Docker Hub | Cloud | Free (limited) / Paid | Open source, small teams |
| AWS ECR | Cloud | Per storage + transfer | AWS deployments |
| Google GCR/AR | Cloud | Per storage + transfer | GCP deployments |
| GitHub Packages | Cloud | Free for public | Open source + CI/CD |
| Harbor | Self-hosted | Free (infra cost) | Enterprise, full control |
| Nexus Repository | Self-hosted | Free/Commercial | Enterprise artifact management |

> **Tip:** Deploying to AWS → use ECR (ap-south-1 Mumbai region). Using GitHub Actions → use ghcr.io (free for public repos). Startup or open source → start with the Docker Hub free tier.

---

## Pushing and Pulling Workflows — CI/CD Integration

Integrating the registry workflow with CI/CD is the core of production-ready DevOps. Here is a complete, real-world workflow for a React application.

> **Note:** **Workflow Overview:** Build → Tag (with version + Git SHA) → Authenticate → Push to Registry → Verify. Every step matters. Tagging with the Git SHA lets you know exactly which commit is running in production.

### Complete Registry Push Workflow

```bash
#!/bin/bash
# Full CI/CD workflow for a React app
set -e  # Exit on any error

IMAGE_NAME="myreactapp"
REGISTRY="123456789.dkr.ecr.ap-south-1.amazonaws.com"

# Generate meaningful version tags
VERSION=$(git describe --tags --always --dirty 2>/dev/null || echo "dev")
GIT_SHA=$(git rev-parse --short HEAD)
DATE=$(date +%Y%m%d)
BRANCH=$(git rev-parse --abbrev-ref HEAD | tr / -)

echo "Building version: $VERSION (SHA: $GIT_SHA)"

# Step 1: Build with build args for traceability
docker build \
  --build-arg BUILD_DATE=$DATE \
  --build-arg GIT_COMMIT=$GIT_SHA \
  --build-arg VERSION=$VERSION \
  -t $IMAGE_NAME:$VERSION \
  -t $IMAGE_NAME:$GIT_SHA \
  -t $IMAGE_NAME:latest \
  .

echo "Build complete"

# Step 2: Authenticate with ECR
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin $REGISTRY
echo "Authenticated with ECR"

# Step 3: Tag all versions for registry
docker tag $IMAGE_NAME:$VERSION $REGISTRY/$IMAGE_NAME:$VERSION
docker tag $IMAGE_NAME:$GIT_SHA $REGISTRY/$IMAGE_NAME:$GIT_SHA
docker tag $IMAGE_NAME:latest $REGISTRY/$IMAGE_NAME:latest

# Step 4: Push all tags
docker push $REGISTRY/$IMAGE_NAME:$VERSION
docker push $REGISTRY/$IMAGE_NAME:$GIT_SHA
docker push $REGISTRY/$IMAGE_NAME:latest
echo "All tags pushed"

# Step 5: Verify push was successful
echo "Recent images in ECR:"
aws ecr describe-images \
  --repository-name $IMAGE_NAME \
  --region ap-south-1 \
  --query 'sort_by(imageDetails, &imagePushedAt)[-5:].{Tags:imageTags,Size:imageSizeInBytes,Pushed:imagePushedAt}' \
  --output table
```

### GitHub Actions — Full CI/CD Pipeline

```yaml
name: Build, Scan, and Push
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  REGISTRY: 123456789.dkr.ecr.ap-south-1.amazonaws.com
  IMAGE_NAME: myreactapp

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for git describe
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-south-1
      
      - name: Login to Amazon ECR
        uses: aws-actions/amazon-ecr-login@v2
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Generate image metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=sha,prefix=sha-
            type=ref,event=branch
            type=semver,pattern={{version}}
            type=raw,value=latest,enable={{is_default_branch}}
      
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: ${{ github.event_name == 'push' }}  # Only push on merge to main
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha          # GitHub Actions cache
          cache-to: type=gha,mode=max
```

> **Caution:** **Do Not Push on Pull Requests!** Pull request builds should only build and test — do not push images. Push only when merging to main/master. That is why `push: ${{ github.event_name == 'push' }}` is used.

> **Tip:** **Speed Up Builds with Cache.** `cache-from: type=gha` and `cache-to: type=gha,mode=max` use GitHub Actions cache. The first build will be slow; subsequent builds are significantly faster — especially when dependencies have not changed.

## Container Security Fundamentals — Why It Matters

Docker containers share the host kernel. This means — **if a container escapes, an attacker can reach the host machine**. Do not treat security as an afterthought; you must think about it while writing your Dockerfile.

> **Caution:** Container escape is real. In 2019, a runc vulnerability (CVE-2019-5736) allowed attackers to access the host machine from inside a container. In 2020, a Docker Desktop vulnerability followed. This is not theoretical — production systems have been compromised. Always follow security fundamentals.

### Common Container Vulnerabilities

| # | Vulnerability | Risk Level | Impact |
|---|---------------|------------|--------|
| 1 | Running as root | Critical | Container escape, host access |
| 2 | Outdated base images (CVEs) | Critical | Known exploits in production |
| 3 | Hardcoded secrets in image | Critical | Credential theft via docker history |
| 4 | Privileged mode | Critical | Full host access |
| 5 | Excessive capabilities | High | Privilege escalation |
| 6 | No resource limits | High | Denial of Service (fork bomb) |
| 7 | Unscanned images | High | Unknown vulnerabilities |
| 8 | Docker socket exposed | Critical | Complete host compromise |

### Real Attack Scenarios

```bash
# Scenario 1: Secret leakage via docker history
docker history myapp:latest --no-trunc
# IMAGE     CREATED   CREATED BY
# abc123    ...       /bin/sh -c export API_KEY=sk-prod-secret123 && node setup.js
#                     ^^^^ VISIBLE TO ANYONE who pulls the image!

# Scenario 2: Crypto mining via compromised public image
# Attacker pushes malicious "ubuntu:latest" to a similarly-named registry
# Your CI/CD pulls it, runs a crypto miner in your cloud (you pay the bill!)

# Scenario 3: Docker socket exposure
docker run -v /var/run/docker.sock:/var/run/docker.sock myapp
# Attacker inside container can now:
docker run -v /:/host alpine chroot /host  # Read/write host filesystem!

# Scenario 4: Privileged container escape
docker run --privileged alpine
# Inside container:
mount /dev/sda1 /mnt  # Mount host disk
chroot /mnt           # Root access to host!
```

> **Caution:** Never mount `/var/run/docker.sock` into a container in production unless absolutely necessary (such as for CI agents). Any container that can access the Docker socket effectively has root access to the entire machine.

> **Note:** Container security is layered: secure Dockerfile → runtime security flags → network policies → image scanning → secrets management → monitoring. If one layer fails, the next catches it. This is the "defense in depth" model.

---

## Secure Dockerfile Practices — 20+ Best Practices

Security starts at build time. An insecure Dockerfile cannot be fixed at runtime. Follow these best practices for production-ready Dockerfiles.

### Complete Secure Dockerfile Template

```dockerfile
# ============================================
# SECURE DOCKERFILE TEMPLATE — React/Node App
# ============================================

# Best Practice #1: Use specific versions — never "latest" or just "node"
# The "latest" tag can change, breaking your build
FROM node:18.19.0-alpine3.19

# Best Practice #2: Use minimal base images
# Security risk order (most to least): ubuntu > debian > debian-slim > alpine > distroless
# Alpine has 98% fewer packages = smaller attack surface

# Best Practice #3: Update packages in base image (apply security patches)
RUN apk update && \
    apk upgrade && \
    rm -rf /var/cache/apk/*
# Note: Alpine uses apk; Debian/Ubuntu uses apt-get

# Best Practice #4: Create a non-root user EARLY
# Never run the app as root!
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --ingroup appgroup appuser

WORKDIR /app

# Best Practice #5: Copy dependency files FIRST (caching + security)
# Set proper ownership during COPY with --chown
COPY --chown=appuser:appgroup package*.json ./

# Best Practice #6: Install ONLY production dependencies
RUN npm ci --only=production && \
    npm cache clean --force
# npm ci = exact versions from package-lock.json (more reproducible)

# Best Practice #7: Copy app source with proper ownership
COPY --chown=appuser:appgroup . .

# Best Practice #8: Build (if needed) while still root for permissions
# Then switch to non-root for runtime
RUN npm run build

# Best Practice #9: Remove dev files and build artifacts
RUN rm -rf src/ tests/ *.test.js .env.* coverage/

# Best Practice #10: Switch to non-root user — everything below runs as appuser
USER appuser

# Best Practice #11: Expose ONLY required ports (documentation, not enforcement)
EXPOSE 3000

# Best Practice #12: Add HEALTHCHECK — K8s/Docker knows if app is actually working
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode===200?0:1))" || exit 1

# Best Practice #13: Use exec form CMD (not shell form)
# Shell form: CMD "node server.js" → /bin/sh -c "node server.js" (signals don't propagate!)
# Exec form: CMD ["node", "server.js"] → direct process (signals work correctly)
CMD ["node", "server.js"]
```

### Security Anti-Patterns — Never Do This

```dockerfile
# ❌ DANGEROUS: Hardcoded secrets visible in docker history!
ENV DATABASE_PASSWORD=mysupersecretpassword
ENV AWS_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# ❌ DANGEROUS: Even in RUN, it stays in layer history
RUN export API_KEY=abc123secret && npm run setup

# ❌ BAD: Copying entire directory without .dockerignore
COPY . .
# This might include: .env, .git/, node_modules/, passwords.txt, etc.

# ❌ BAD: Using latest tag
FROM node:latest  # Which version? Will break unexpectedly!

# ❌ BAD: Running as root (default if no USER instruction)
# root inside container → if compromised, easier to escalate

# ❌ BAD: Adding unnecessary packages
RUN apt-get install -y curl wget vim git build-essential
# More packages = larger attack surface

# ❌ BAD: Ignoring package-lock.json
RUN npm install  # Might install different versions each time!
```

### .dockerignore — First Line of Defense

```
# Always maintain a comprehensive .dockerignore!

# Secrets and config
.env
.env.*
.env.local
.env.production
secrets/
*.pem
*.key
*.cert

# Development artifacts
node_modules/
npm-debug.log*
yarn-error.log

# Git history (can contain old secrets!)
.git/
.gitignore

# Tests and coverage (not needed in production image)
tests/
__tests__/
*.test.js
*.spec.js
coverage/
.nyc_output/

# Documentation
README.md
docs/
*.md

# IDE files
.vscode/
.idea/
*.swp

# CI/CD configs (not needed in image)
.github/
.gitlab-ci.yml
Jenkinsfile

# Build artifacts (will be regenerated)
dist/
build/
```

> **Caution:** `.env` MUST be in `.dockerignore`. If you use `COPY . .` and `.env` is not excluded, all your secrets end up in the image. Anyone can see them via `docker history myapp` or image inspection. Real data breaches have happened this way.

> **Tip:** Multi-stage builds give you both security and smaller image sizes. Build tools (gcc, make, npm, pip) do not belong in a production image. Copy only the runtime artifacts into the final stage — no build tools means a smaller attack surface and 60–80% smaller images.

> **Note:** Google's distroless images contain no shell, no package manager, and no utilities — only the app runtime. An attacker cannot even open a shell. Use `gcr.io/distroless/nodejs18-debian11`. The trade-off is harder debugging — use the debug variant for that purpose.

---

## Runtime Security — Sandboxing Containers

After building a secure Dockerfile, apply security flags at runtime. These flags keep the container in a tight sandbox — even if the container is compromised, the damage is contained.

### Runtime Security Flags

```bash
# 1. Drop ALL capabilities, add back only what's needed
# Linux capabilities are specific privileges that root has
docker run --cap-drop ALL --cap-add NET_BIND_SERVICE nginx
# Drops 38 capabilities and adds back only port binding < 1024

# 2. Read-only filesystem — prevent tampering
docker run --read-only --tmpfs /tmp --tmpfs /var/run myapp
# --read-only: container filesystem is read-only
# --tmpfs /tmp: in-memory temp storage (data lost on restart)

# 3. No new privileges — prevent sudo/setuid escalation
docker run --security-opt no-new-privileges myapp
# Even if a setuid binary exists, it cannot escalate privileges

# 4. Custom seccomp profile — limit system calls
docker run --security-opt seccomp=/path/to/seccomp-profile.json myapp
# Default Docker seccomp blocks 44 of 300+ syscalls
# A custom profile can be more restrictive

# 5. AppArmor profile — Mandatory Access Control
docker run --security-opt apparmor=docker-default myapp

# 6. Resource limits — prevent Denial of Service
docker run \
  --memory=512m \           # Max RAM
  --memory-swap=512m \      # No swap (set equal to memory)
  --cpus=0.5 \              # Max 0.5 CPU cores
  --pids-limit=100 \        # Max 100 processes (prevents fork bombs!)
  --ulimit nofile=1024:1024 \  # Max open file descriptors
  myapp

# 7. NEVER use --privileged in production!
# docker run --privileged myapp  ← Gives container host-level access!

# Complete secure run command
docker run \
  --cap-drop ALL \
  --cap-add NET_BIND_SERVICE \
  --read-only \
  --tmpfs /tmp \
  --security-opt no-new-privileges \
  --memory=512m \
  --cpus=0.5 \
  --pids-limit=100 \
  --user 1001:1001 \
  myapp:v1.0.0
```

### Linux Capabilities — What to Grant and What to Deny

| Capability | Purpose | Use in Production? |
|---|---|---|
| `NET_BIND_SERVICE` | Bind ports < 1024 (80, 443) | Only if port < 1024 |
| `NET_ADMIN` | Configure networking | Only for network tools |
| `CHOWN` | Change file ownership | Very rarely |
| `DAC_OVERRIDE` | Bypass file permissions | Never |
| `FOWNER` | Bypass owner restrictions | Never |
| `SYS_ADMIN` | Broad system admin access | NEVER (equivalent to root!) |
| `SYS_PTRACE` | Process tracing (debuggers) | Never in production |
| `KILL` | Send signals to processes | Rarely needed |

### User Namespace Remapping (Advanced)

```json
// /etc/docker/daemon.json — User namespace remapping
// Container root (UID 0) becomes an unprivileged user on the host!
{
  "userns-remap": "default"
}
// After this: sudo systemctl restart docker
// Container root → host UID 100000 (non-privileged)
```

> **Caution:** Never use `--privileged` in production. The `--privileged` flag effectively makes the container root on the host, bypassing the security context entirely. If any tutorial asks you to use `--privileged` without explaining why, that tutorial is wrong. Use it only for specific, well-understood cases such as certain CI/CD systems.

> **Tip:** Docker's default seccomp profile already blocks 44+ dangerous syscalls. To tighten further, create a custom profile. Docker's documentation provides the default profile as a starting point.

---

## Image Scanning — Finding CVEs Before Production

Your image is built and pushed — but does it contain known vulnerabilities? Image scanning tools automatically check for CVEs (Common Vulnerabilities and Exposures) in your base image and dependencies.

> **Note:** A CVE (Common Vulnerability and Exposure) is the unique identifier for a publicly known security vulnerability. For example, `CVE-2021-44228` was the Log4Shell vulnerability. A scanner compares your image's packages against a CVE database.

### Trivy — Most Popular Free Scanner

```bash
# Install Trivy (Linux/macOS)
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | \
  sh -s -- -b /usr/local/bin

# macOS via Homebrew
brew install trivy

# Basic image scan
trivy image nginx:latest

# Scan with severity filter — only show HIGH and CRITICAL
trivy image --severity HIGH,CRITICAL nginx:latest

# Fail CI/CD if CRITICAL vulnerabilities found (exit code 1)
trivy image --exit-code 1 --severity CRITICAL myapp:latest

# Scan your local Dockerfile for misconfigurations
trivy config ./Dockerfile

# Scan docker-compose.yml for security issues
trivy config ./docker-compose.yml

# Output as JSON for automated processing
trivy image --format json --output results.json myapp:latest

# Scan a GitHub repository (without cloning)
trivy repo https://github.com/user/myrepo

# Generate SBOM (Software Bill of Materials)
trivy image --format cyclonedx --output sbom.json myapp:latest
```

```yaml
# GitHub Actions — Trivy scan in CI/CD
- name: Run Trivy vulnerability scanner
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: myapp:latest
    format: sarif
    output: trivy-results.sarif
    severity: CRITICAL,HIGH
    exit-code: 1  # Fail build on critical issues

- name: Upload Trivy results to GitHub Security tab
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: trivy-results.sarif
```

### Docker Scout — Built-in Scanner

```bash
# Docker Scout (built-in since Docker Desktop 4.17)

# Quick vulnerability overview
docker scout quickview myapp:latest

# Detailed CVE list
docker scout cves myapp:latest

# Filter by severity
docker scout cves --only-severity critical myapp:latest

# Compare two versions (what changed?)
docker scout compare --to myapp:v1.0 myapp:v2.0

# Get recommendations (what base image to use?)
docker scout recommendations myapp:latest

# Local filesystem scan
docker scout cves fs://./  # Scan current directory
```

### Snyk — Enterprise Scanner

```bash
# Install Snyk CLI
npm install -g snyk

# Authenticate (free account at snyk.io)
snyk auth

# Scan Docker image
snyk container test nginx:latest

# Scan with fail threshold
snyk container test --severity-threshold=high nginx:latest

# Monitor over time (track vulnerabilities as they are discovered)
snyk container monitor nginx:latest

# Snyk in CI/CD (GitHub Actions)
- name: Run Snyk to check Docker image for vulnerabilities
  uses: snyk/actions/docker@master
  env:
    SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
  with:
    image: myapp:latest
    args: --severity-threshold=high
```

> **Tip:** For development: use Docker Scout (built-in, no setup). For CI/CD: use Trivy (free, fast, no registration). For enterprise: use Snyk or Aqua Security (paid, more features). ECR users: enable "Scan on Push" in repository settings — it is automatic and free.

> **Note:** Achieving zero vulnerabilities is an unrealistic goal. Having LOW/MEDIUM vulnerabilities in production images is normal — fixing everything is not feasible. Focus on: always fix CRITICAL, fix or document exceptions for HIGH, address MEDIUM only if exploitable. False positives also occur — triage carefully.

---

## Secrets Management — Never Bake Secrets Into Images

The most common mistake in container security is hardcoding secrets (passwords, API keys, tokens) into Docker images. Once an image is pushed to a registry, **anyone who pulls it can inspect the secrets**.

> **Caution:** `docker history` is a secret leakage tool. Every Dockerfile instruction creates an image layer. `ENV API_KEY=secret` is permanently baked into that layer — even if you unset it later. Anyone can see it via `docker history --no-trunc myapp`. Real incident: a company put API keys in their Dockerfile, pushed the image as public to Docker Hub, and received a $50,000 AWS bill from crypto mining.

### Never Do This

```dockerfile
# ❌ EXTREMELY DANGEROUS — visible in docker history forever!
ENV DATABASE_PASSWORD=mysupersecretpassword123
ENV AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
ENV JWT_SECRET=my-jwt-secret-key

# ❌ ALSO DANGEROUS — even in RUN, it stays in the layer!
RUN export API_KEY=sk-prod-abc123 && ./configure.sh

# ❌ BAD — copying .env file into image
COPY .env /app/.env  # .env is now inside the image layers!

# Check what's visible (run this on your image)
docker history --no-trunc myapp | grep -i "password\|secret\|key\|token"
```

### Approach 1: Runtime Environment Variables

```bash
# Pass at runtime — not baked into the image
docker run -e DATABASE_PASSWORD=secret myapp

# From a file — more manageable (file security is your responsibility)
docker run --env-file secrets.env myapp

# secrets.env format (add this file to .gitignore!)
# DATABASE_URL=postgresql://user:pass@host:5432/db
# API_KEY=sk-prod-abc123
# JWT_SECRET=super-secret-jwt-key

# CAVEAT: Still visible in 'docker inspect'!
docker inspect myapp | jq '.[0].Config.Env'
# [
#   "DATABASE_PASSWORD=secret",  ← Visible to anyone with docker inspect!
#   "PATH=/usr/local/sbin:..."
# ]
```

### Approach 2: Docker Secrets (Swarm Mode)

```bash
# Create a Docker secret (stored encrypted in Swarm Raft)
echo "mysupersecretpassword" | docker secret create db_password -
printf "sk-prod-abc123secret" | docker secret create api_key -

# List secrets (values NOT shown)
docker secret ls

# Use in service (mounted as file at /run/secrets/secretname)
docker service create \
  --secret db_password \
  --secret api_key \
  --env DB_PASSWORD_FILE=/run/secrets/db_password \
  --env API_KEY_FILE=/run/secrets/api_key \
  myapp

# Inside container, secrets are files:
cat /run/secrets/db_password  # mysupersecretpassword
cat /run/secrets/api_key      # sk-prod-abc123secret
```

```yaml
# docker-compose.yml with secrets (Swarm mode)
version: "3.8"

secrets:
  db_password:
    external: true    # Secret already created via docker secret create
  api_key:
    external: true

services:
  api:
    image: myapp:latest
    secrets:
      - db_password
      - api_key
    environment:
      # Point to secret files, not actual values
      - DB_PASSWORD_FILE=/run/secrets/db_password
      - API_KEY_FILE=/run/secrets/api_key
```

### Approach 3: AWS Secrets Manager (Production Best Practice)

```bash
#!/bin/sh
# entrypoint.sh — Fetch secrets at startup from AWS Secrets Manager
# Container uses an IAM role (no hardcoded AWS credentials needed!)

set -e

echo "Fetching secrets from AWS Secrets Manager..."

# Fetch database password
export DB_PASSWORD=$(aws secretsmanager get-secret-value \
  --secret-id prod/myapp/db_password \
  --query SecretString \
  --output text \
  --region ap-south-1)

# Fetch API key
export API_KEY=$(aws secretsmanager get-secret-value \
  --secret-id prod/myapp/api_key \
  --query SecretString \
  --output text \
  --region ap-south-1)

echo "Secrets loaded successfully"

# Execute the main command (e.g., node server.js)
exec "$@"
```

### Approach 4: BuildKit Secret Mounts (Build-time Secrets)

```dockerfile
# syntax=docker/dockerfile:1
FROM node:18-alpine

WORKDIR /app

# Secret mounted ONLY during this RUN — not stored in the image layer!
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm install  # Can access private npm registry using .npmrc secret

# Private repo clone during build
RUN --mount=type=ssh \
    git clone git@github.com:myorg/private-repo.git /app/lib
```

```bash
# Build with secret (secret never enters the image!)
docker build \
  --secret id=npmrc,src=$HOME/.npmrc \
  -t myapp .

# SSH forwarding for private repos
eval $(ssh-agent)
ssh-add ~/.ssh/id_rsa
docker build --ssh default -t myapp .
```

> **Tip:** Always add `.env` to both `.gitignore` and `.dockerignore`. Commit a `.env.example` template without values so team members know which variables are required. In production, never use `.env` files — use a proper secrets management solution.

> **Note:** Secrets manager options include: AWS Secrets Manager (paid, excellent rotation support), HashiCorp Vault (free, powerful, complex), Kubernetes Secrets (base64-encoded — not truly secret!), Doppler (developer-friendly SaaS), Azure Key Vault, and GCP Secret Manager. Choose based on your cloud provider.

---

## BuildKit — Modern Docker Build Engine

BuildKit is the default build engine in Docker 23+. It is **much faster, safer, and more feature-rich** than the older builder. Parallel builds, better caching, secret mounts — all of these come from BuildKit.

> **Note:** Old builder: sequential layers, no cache import/export, no secret mounts. BuildKit: parallel stage builds, registry cache, secret mounts, SSH forwarding, multi-arch support. Master BuildKit once and CI/CD build times improve dramatically.

### Enabling BuildKit

```bash
# Check if BuildKit is available
docker buildx version
# github.com/docker/buildx v0.12.0 docker-desktop

# Docker 23+ enables it automatically
# For older versions:

# Option 1: Per-build environment variable
DOCKER_BUILDKIT=1 docker build -t myapp .

# Option 2: Enable permanently in daemon.json
sudo nano /etc/docker/daemon.json
# Add: { "features": { "buildkit": true } }
sudo systemctl restart docker

# Option 3: Set DOCKER_BUILDKIT in shell profile
echo 'export DOCKER_BUILDKIT=1' >> ~/.bashrc
```

### BuildKit Special Features — syntax=docker/dockerfile:1

```dockerfile
# This comment enables the latest BuildKit Dockerfile syntax
# syntax=docker/dockerfile:1

FROM node:18-alpine

WORKDIR /app

# Feature 1: Secret mounts — never stored in image layers!
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm install --legacy-peer-deps

# Feature 2: Cache mounts — persist between builds!
RUN --mount=type=cache,target=/root/.npm \
    npm ci  # npm cache persists across builds = MUCH faster!

# Feature 3: Bind mounts — mount host directory without COPY
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    npm ci

# Feature 4: SSH forwarding
RUN --mount=type=ssh \
    git clone git@github.com:private/repo.git
```

### docker buildx Commands

```bash
# List all builders
docker buildx ls

# Create a new builder with docker-container driver (more features)
docker buildx create \
  --name mybuilder \
  --driver docker-container \
  --bootstrap
docker buildx use mybuilder

# Inspect builder (shows supported platforms)
docker buildx inspect mybuilder

# Build for current platform (like regular docker build)
docker buildx build -t myapp .

# Build for a specific platform
docker buildx build --platform linux/amd64 -t myapp:amd64 --load .
docker buildx build --platform linux/arm64 -t myapp:arm64 --load .

# Build and push multi-arch image in one command!
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t username/myapp:latest \
  --push \
  .

# Remove builder
docker buildx rm mybuilder
```

### Registry Cache — CI/CD Game Changer

```bash
# Export cache to registry (persists between CI runs)
docker buildx build \
  --cache-to type=registry,ref=myapp:buildcache,mode=max \
  --cache-from type=registry,ref=myapp:buildcache \
  -t myapp:latest \
  --push \
  .
# mode=max: Cache all intermediate layers (maximum cache hits)
# mode=min: Cache only final layer (smaller cache size)
```

```yaml
# GitHub Actions — Optimal BuildKit caching
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3

- name: Build and push with cache
  uses: docker/build-push-action@v5
  with:
    context: .
    push: true
    tags: myapp:latest
    cache-from: type=gha          # GitHub Actions cache (free!)
    cache-to: type=gha,mode=max   # Save cache for next run
    # Result: 5-minute builds → 45-second builds on cache hit!
```

> **Tip:** Without caching: a Node app build takes 4–5 minutes. With caching (dependencies unchanged): 30–60 seconds. For large enterprise apps: 20 minutes → 2 minutes. This difference directly affects production deployment frequency.

> **Note:** With multi-arch builds, `--load` (local image) and `--push` (registry) cannot be used simultaneously in most cases. For single-arch builds use `--load`; for multi-arch, push directly to the registry with `--push`.

---

## Multi-Architecture Images — Supporting ARM and x86

You develop on a MacBook M1/M2/M3 (ARM64) and deploy to AWS EC2 (amd64). Multi-arch images work on both platforms without issues — no need for separate Dockerfiles.

> **Note:** Apple Silicon Macs (ARM64) have become standard dev machines. AWS Graviton instances (ARM64) offer the same performance at 40% lower cost than x86. If your image only supports amd64, ARM machines will produce a "wrong platform" error. Build multi-arch images to support everyone.

### Setup and Build

```bash
# Step 1: Install QEMU (enables emulation of other architectures)
docker run --privileged --rm tonistiigi/binfmt --install all
# Installs QEMU user-space emulators for ARM, etc.

# Verify QEMU installation
ls /proc/sys/fs/binfmt_misc/
# Should show: qemu-aarch64, qemu-arm, etc.

# Step 2: Create a multi-arch capable builder
docker buildx create \
  --name multiarch-builder \
  --driver docker-container \
  --bootstrap
docker buildx use multiarch-builder

# Step 3: Inspect — verify which platforms are supported
docker buildx inspect multiarch-builder --bootstrap
# Platforms: linux/amd64, linux/arm64, linux/arm/v7, linux/386...

# Step 4: Build and push multi-arch image in one command
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag username/myapp:latest \
  --tag username/myapp:v1.0.0 \
  --push \
  .

# Step 5: Verify multi-arch manifest
docker manifest inspect username/myapp:latest
# Shows separate manifests for each architecture
```

### Platform-Specific Handling in Dockerfile

```dockerfile
# syntax=docker/dockerfile:1

# BuildKit injects these automatically
ARG TARGETPLATFORM
ARG TARGETARCH
ARG TARGETOS

FROM node:18-alpine

# Platform-specific commands (if needed)
RUN case "$TARGETARCH" in \
    amd64) echo "Building for x86_64" ;; \
    arm64) echo "Building for ARM64" ;; \
    arm)   echo "Building for ARM v7" ;; \
    esac

# Most Node.js apps need no platform-specific code
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

### GitHub Actions — Multi-Arch CI/CD

```yaml
name: Multi-Arch Build
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up QEMU (ARM emulation)
        uses: docker/setup-qemu-action@v3
        with:
          platforms: linux/amd64,linux/arm64
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_TOKEN }}
      
      - name: Build and push multi-arch
        uses: docker/build-push-action@v5
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: username/myapp:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

> **Note:** QEMU emulation makes ARM64 builds 5–10x slower on an amd64 machine. Solutions: use native ARM builders (GitHub has paid ARM64 runners), or run matrix builds (amd64 and arm64 in parallel). QEMU is fine for small images.

> **Tip:** AWS Graviton3 (arm64) instances are 20–40% cheaper than equivalent x86 instances for the same workload. Build one multi-arch image, deploy on Graviton — significant cost savings at scale. t4g instances are cheaper than t3, c7g instances are cheaper than c6i.

---

## Docker Context — Managing Multiple Docker Hosts

Docker contexts let you manage multiple Docker hosts from one machine — local, staging server, production server — all with the same `docker` command. Switch context and all commands go there.

> **Note:** Contexts are useful when you want to run Docker commands on remote servers without SSH-ing in manually, or when managing multiple environments (dev, staging, production) from a CI/CD workflow.

### Context Management Commands

```bash
# List all contexts (* = currently active)
docker context ls
# NAME           DESCRIPTION   DOCKER ENDPOINT               KUBERNETES ENDPOINT
# default *      ...           unix:///var/run/docker.sock
# remote-server  ...           ssh://deploy@203.0.113.10

# Create context for a remote server (uses SSH)
docker context create remote-server \
  --description "Production server" \
  --docker "host=ssh://deploy@203.0.113.10"

# Create context with a specific SSH key
docker context create staging \
  --docker "host=ssh://ubuntu@staging.myapp.com"

# Switch to remote context
docker context use remote-server
# All docker commands now go to the remote host!

docker ps      # Shows containers on remote server!
docker images  # Shows images on remote server!
docker run -d nginx  # Runs on remote server!

# Switch back to local
docker context use default

# One-off command in a specific context (without switching)
docker --context remote-server ps
docker --context remote-server logs myapp -f

# Inspect a context
docker context inspect remote-server
```

### Export/Import Contexts

```bash
# Export context (share with team)
docker context export remote-server > production.dockercontext

# Import on another machine
docker context import production-server production.dockercontext

# Remove a context
docker context rm old-server
```

### Context with AWS ECS

```bash
# Create ECS context (deploy directly to ECS!)
docker context create ecs myecscontext
# Prompts for AWS credentials/profile

# Switch to ECS context
docker context use myecscontext

# Now docker compose commands deploy to ECS!
docker compose up  # Deploys to ECS Fargate!
```

> **Tip:** Define hosts in `~/.ssh/config`, then reference them in a context: `docker context create prod --docker "host=ssh://prod-server"`. SSH config can include jump hosts and identity files — complex infrastructure can be managed cleanly this way.

> **Caution:** A common mistake is switching to a remote context, doing some work, and forgetting about it. The next local command runs on the remote host instead. Always check the current context with `docker context ls`. Consider showing the current context in your shell prompt using Starship or oh-my-zsh plugins.

---

## Docker Plugins — Extending Functionality

Docker plugins extend Docker daemon capabilities with custom volume drivers, network drivers, and authorization plugins. They are useful in enterprise environments and for integrating cloud storage.

> **Note:** Plugin types — Volume plugins: connect cloud storage (AWS EBS, NFS, GlusterFS) to Docker volumes. Network plugins: custom networking (Weave, Calico, Flannel). Authorization plugins: centralized access control defining what each container is allowed to do.

### Volume Plugins

```bash
# List installed plugins
docker plugin ls

# Install NFS volume plugin (mount NFS shares as Docker volumes)
docker plugin install vieux/sshfs DEBUG=1

# Install local-persist plugin (volumes survive container removal)
docker plugin install cwspear/docker-local-persist-volume-plugin

# Enable/disable plugin
docker plugin enable pluginname
docker plugin disable pluginname

# Remove plugin
docker plugin rm pluginname

# Inspect plugin
docker plugin inspect vieux/sshfs
```

```bash
# SSHFS Plugin — Mount a remote directory as a Docker volume
# Useful for: shared config files, remote storage

# First install the plugin
docker plugin install vieux/sshfs

# Create volume using plugin
docker volume create \
  --driver vieux/sshfs \
  --opt sshcmd=user@remote-host:/path/to/dir \
  --opt password=mysshpassword \
  remote-data

# Use volume in container
docker run -v remote-data:/app/data myapp

# AWS EBS volume plugin (for persistent EBS volumes)
docker plugin install rexray/ebs \
  EBS_REGION=ap-south-1

docker volume create \
  --driver rexray/ebs \
  --opt size=20 \
  my-ebs-volume
```

### Authorization Plugins — Enterprise Security

```bash
# OPA (Open Policy Agent) authorization plugin
# Define policies: what each container is allowed to do

# Install
docker plugin install openpolicyagent/opa-docker-authz-local:v0.2 \
  policy-file=/etc/docker/policies/authz.rego

# authz.rego policy example (Rego language)
# package docker.authz
# allow {
#   not deny
# }
# deny {
#   input.Body.HostConfig.Privileged == true  # Block privileged containers
# }

# Enable in daemon.json:
# {
#   "authorization-plugins": ["openpolicyagent/opa-docker-authz-local:v0.2"]
# }
```

> **Caution:** Docker plugins run with daemon-level access. Only use trusted, well-maintained plugins. Review permissions carefully when installing — a malicious plugin can compromise the entire Docker daemon.

> **Tip:** Many plugin use cases are now better handled by Kubernetes and CSI (Container Storage Interface) drivers. If you are using Kubernetes, explore CSI drivers instead of Docker plugins — the ecosystem is better and offers more options.

---

## Resource Management — Limiting Container Resources

Without resource limits, a misbehaving container can consume all the memory and CPU on the host, crashing everything else. Apply limits to every container in production.

> **Caution:** `:(){ :|:& };:` is a bash fork bomb. Without `--pids-limit`, this can crash an entire machine from a single container. In the real world, buggy code leaks memory or spawns infinite processes. Always set limits.

### Memory Limits

```bash
# Hard memory limit — OOM killer triggers if exceeded
docker run --memory=512m myapp

# Memory + swap limit
docker run --memory=512m --memory-swap=1g myapp
# RAM: 512MB, Swap: 512MB (total 1GB, swap = total - ram)

# Disable swap for container
docker run --memory=512m --memory-swap=512m myapp

# Soft limit — suggestion, not enforced (for low-memory situations)
docker run --memory-reservation=256m myapp

# OOM kill disable (risky — lets container grow without being killed)
docker run --oom-kill-disable myapp  # Use with extreme caution!
```

### CPU Limits

```bash
# Hard CPU limit — cannot exceed X cores
docker run --cpus=1.5 myapp       # Max 1.5 CPU cores
docker run --cpus=0.25 myapp      # Max 25% of one CPU core

# CPU shares — relative weight (soft limit, when contention exists)
docker run --cpu-shares=512 myapp  # Default is 1024; gets half the CPU when contested
docker run --cpu-shares=2048 myapp # Gets double the default CPU priority

# Pin to specific CPU cores (NUMA optimization, isolation)
docker run --cpuset-cpus=0,1 myapp  # Only use CPUs 0 and 1
docker run --cpuset-cpus=2-5 myapp  # Use CPUs 2, 3, 4, 5
```

### I/O and Other Limits

```bash
# Disk I/O limits
docker run --device-read-bps /dev/sda:100mb myapp    # Max 100MB/s read
docker run --device-write-bps /dev/sda:50mb myapp    # Max 50MB/s write
docker run --device-read-iops /dev/sda:1000 myapp    # Max 1000 IOPS read

# PID limit (prevent fork bombs!)
docker run --pids-limit=100 myapp  # Max 100 processes/threads

# Open file descriptor limit
docker run --ulimit nofile=1024:1024 myapp
# Format: soft_limit:hard_limit

# Update limits on a RUNNING container (no restart needed!)
docker update --memory=1g --cpus=2 myapp

# Check resource usage (real-time)
docker stats                     # All containers
docker stats myapp               # Specific container
docker stats --no-stream myapp   # Snapshot, not live
```

### Production Resource Sizing Guide

| Service Type | CPU | Memory | Notes |
|---|---|---|---|
| Web API (Node.js) | 0.5–1.0 | 256–512MB | Scale horizontally |
| Database (PostgreSQL) | 2.0+ | 1–4GB | Depends on dataset size |
| Cache (Redis) | 0.25 | 256–512MB | Set maxmemory in Redis config |
| Background Worker | 1.0 | 512MB–1GB | Depends on task type |
| Message Queue | 0.5 | 512MB | RabbitMQ/Kafka varies |
| Monitoring Agent | 0.1 | 64–128MB | Should be minimal |
| Nginx Proxy | 0.25 | 128MB | Very lightweight |

```yaml
# docker-compose.yml with resource limits
services:
  api:
    image: myapi:latest
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 512M
        reservations:
          cpus: "0.25"
          memory: 256M
  
  db:
    image: postgres:15-alpine
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 2G
        reservations:
          cpus: "1.0"
          memory: 1G
```

> **Tip:** Strategy for setting limits: first run without limits and observe actual usage with `docker stats`. Then set limit = actual_peak × 1.5 (with buffer). Test on staging to verify the app works correctly within limits. Deploy to production and track OOM kills and CPU throttling via monitoring.

---

## Debugging Containers — When Nothing Works

"It works on my machine" — everyone has heard this. Containers have their own issues. Here is a systematic debugging methodology for quickly resolving production problems.

> **Note:** Debugging order: Status → Logs → Resources → Exec into container → Processes → Network → Events. Follow this order — 80% of issues are resolved via logs or exec. Advanced tools are only needed when the basics fail.

### Systematic Debugging Playbook

```bash
# ===== STEP 1: Container Status =====
docker ps -a  # -a shows stopped containers too
# STATUS: Up 2 hours (good) | Exited (1) 5 min ago (bad) | Restarting (crash loop!)

# Detailed status
docker inspect myapp | jq '.[0].State'
# {
#   "Status": "exited",
#   "Running": false,
#   "ExitCode": 137,  ← 137 = OOM kill! 1 = app error, 0 = clean exit
#   "OOMKilled": true,
#   "Error": ""
# }

# ===== STEP 2: Logs =====
docker logs myapp              # All logs
docker logs myapp --tail 100   # Last 100 lines
docker logs myapp -f           # Follow (like tail -f)
docker logs myapp --since 30m  # Last 30 minutes
docker logs myapp 2>&1 | grep -i error  # Filter errors

# ===== STEP 3: Resource Usage =====
docker stats myapp --no-stream
# CONTAINER  CPU %  MEM USAGE / LIMIT   MEM %   NET I/O    BLOCK I/O
# myapp      95.2%  490MiB / 512MiB    95.7%   1.2GB/500MB  0B/0B
# ← 95% memory → OOM kill is imminent!

# ===== STEP 4: Shell into Running Container =====
docker exec -it myapp bash    # bash shell (Debian/Ubuntu)
docker exec -it myapp sh      # sh shell (Alpine)
docker exec -it myapp /bin/sh # explicit path

# Run a specific command without interactive shell
docker exec myapp env          # Check environment variables
docker exec myapp cat /app/config.json

# ===== STEP 5: Check Processes =====
docker top myapp               # Processes running in container
docker exec myapp ps aux       # More detailed process list

# ===== STEP 6: Network Debugging =====
docker inspect myapp | jq '.[0].NetworkSettings.Networks'
docker exec myapp netstat -tulpn    # Listening ports
docker exec myapp curl -v http://othercontainer:8080/health

# Test DNS resolution in container
docker exec myapp nslookup db        # Can container resolve service name?
docker exec myapp ping -c3 db        # Can container reach db?

# ===== STEP 7: Docker Events =====
docker events --filter 'container=myapp'
docker events --filter 'container=myapp' --since 1h
# Shows: die, kill, oom, start, stop, restart events
```

### Debugging Containers That Won't Start

```bash
# Container crashes immediately — override the entrypoint
docker run -it --entrypoint /bin/sh myapp:latest
# Or bash:
docker run -it --entrypoint /bin/bash myapp:latest

# Then manually run the CMD to see the exact error:
$ node server.js
# Error: Cannot find module 'express'  ← npm install was never run!

# Debug with a minimal command
docker run -it myapp:latest echo "container works"
docker run -it myapp:latest ls /app    # Check if files are present
docker run -it myapp:latest env        # Check env vars

# Check image layers/history for clues
docker history myapp:latest
docker inspect myapp:latest | jq '.[0].Config'
```

### Advanced Network Debugging — netshoot

```bash
# nicolaka/netshoot — network debugging toolkit
# Contains: curl, wget, dig, nslookup, netstat, tcpdump, etc.

# Share network namespace with target container
docker run -it \
  --net container:myapp \
  nicolaka/netshoot

# Now you have full network tools in myapp's network namespace
$ netstat -tulpn      # See what myapp is listening on
$ curl localhost:3000 # Test myapp's API
$ tcpdump -i eth0     # Capture traffic

# Share both network AND pid namespace
docker run -it \
  --net container:myapp \
  --pid container:myapp \
  nicolaka/netshoot

# Check for OOM kills in system logs
dmesg | grep oom
journalctl -k | grep oom | tail -20
```

> **Tip:** Decoding exit codes — `Exited (0)`: clean exit (intentional). `Exited (1)`: application error. `Exited (137)`: killed by OOM killer (memory limit exceeded). `Exited (139)`: segfault. `Exited (143)`: SIGTERM received (graceful stop). Exit codes reveal a lot before you even read the logs.

> **Caution:** Alpine base images do not include bash, curl, or netstat by default. Install them temporarily for debugging: `docker exec myapp apk add --no-cache curl bash net-tools`. For distroless images, use ephemeral debug containers (a Kubernetes feature).

---

## Docker Health Checks — Container Self-Assessment

A running container does not mean the application is healthy. The process may be alive but unable to connect to the database, or not listening on the expected port. Health checks tell Docker whether the app is actually working.

> **Note:** Health check states — `starting`: within the start_period, checks are ignored. `healthy`: the most recent check passed. `unhealthy`: retries exhausted, all checks failed. Docker Swarm and Kubernetes automatically restart unhealthy containers.

### Dockerfile Health Check Options

```dockerfile
# HTTP endpoint check (for REST APIs)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
# --interval: How often to check (default: 30s)
# --timeout: How long to wait for one check (default: 30s)
# --start-period: Startup grace period — failed checks don't count (default: 0s)
# --retries: How many times to retry before marking unhealthy (default: 3)
# curl -f: Fails silently on HTTP errors (4xx, 5xx)

# TCP port check (for databases or non-HTTP services)
HEALTHCHECK --interval=30s --timeout=3s \
  CMD nc -z localhost 5432 || exit 1
# nc -z: Check if port is open (no data sent)

# Node.js application check (when curl is not available)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })" || exit 1

# Custom script (for complex checks)
COPY healthcheck.sh /usr/local/bin/healthcheck
RUN chmod +x /usr/local/bin/healthcheck
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD /usr/local/bin/healthcheck

# Disable inherited healthcheck (from base image)
HEALTHCHECK NONE
```

### Complex Health Check Script

```bash
#!/bin/sh
# healthcheck.sh — Multiple checks in one script
set -e

# Check 1: HTTP endpoint response
http_status=$(curl -sL -w "%{http_code}" http://localhost:3000/health -o /dev/null --max-time 3)
if [ "$http_status" != "200" ]; then
  echo "UNHEALTHY: HTTP check failed with status $http_status"
  exit 1
fi

# Check 2: Database connectivity
if ! nc -z db 5432 2>/dev/null; then
  echo "UNHEALTHY: Cannot reach database on port 5432"
  exit 1
fi

# Check 3: Disk space (prevent crash due to full disk)
disk_usage=$(df /app | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$disk_usage" -gt 90 ]; then
  echo "UNHEALTHY: Disk usage too high: ${disk_usage}%"
  exit 1
fi

echo "HEALTHY: All checks passed"
exit 0
```

### Health Check in Docker Compose

```yaml
version: "3.8"

services:
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_PASSWORD: secret
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s   # PostgreSQL takes time to start!
  
  api:
    image: myapi:latest
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 40s
    depends_on:
      db:
        condition: service_healthy  # Wait for db to be HEALTHY, not just running!
  
  worker:
    image: myworker:latest
    depends_on:
      api:
        condition: service_healthy  # Start worker only when api is healthy
      db:
        condition: service_healthy

# depends_on with service_healthy = proper startup ordering!
# Without this: api starts before db is ready → connection error!
```

### Checking Health Status

```bash
# docker ps shows health status
docker ps
# CONTAINER ID  IMAGE    STATUS
# abc123        myapp    Up 5 minutes (healthy)
# def456        mydb     Up 2 minutes (starting)
# ghi789        worker   Up 10 minutes (unhealthy)  ← Problem!

# Get health status
docker inspect --format '{{.State.Health.Status}}' myapp
# healthy

# Detailed health info with history
docker inspect --format '{{json .State.Health}}' myapp | jq
# {
#   "Status": "healthy",
#   "FailingStreak": 0,
#   "Log": [
#     {
#       "Start": "2024-01-15T...",
#       "End": "2024-01-15T...",
#       "ExitCode": 0,
#       "Output": "HEALTHY: All checks passed"
#     }
#   ]
# }

# Wait for container to be healthy (useful in scripts)
until [ "$(docker inspect --format '{{.State.Health.Status}}' myapp)" == "healthy" ]; do
  echo "Waiting for myapp to be healthy..."
  sleep 5
done
echo "myapp is healthy!"
```

> **Tip:** Design a dedicated `/health` endpoint that returns HTTP 200 when healthy and 503 when unhealthy. It should check database connectivity, required external services, and application state. Response time should be under 100ms — the health check itself should not be slow.

> **Caution:** If `start_period` is too short and your app starts slowly, the container will immediately be marked "unhealthy" and enter a restart loop. Java apps may take 30–60 seconds. Node.js typically takes 5–10 seconds. Set the value based on your app's actual startup time.

> **Note:** Docker's `HEALTHCHECK` instruction does not work in Kubernetes — it is a Docker Compose feature. Kubernetes has its own `livenessProbe`, `readinessProbe`, and `startupProbe`. The concept is the same, but the syntax differs. When migrating to Kubernetes, convert Dockerfile HEALTHCHECKs to Kubernetes probes.

---

## Development Workflows with Docker

### Docker for Local Development — The Real Game Changer

Docker development environments ensure every developer — whether on Windows, Mac, or Linux — runs the exact same stack. New developer onboarding becomes: `git clone && docker compose up` — done in under 5 minutes.

> **Tip:** Docker dev environments eliminate "works on my machine" issues permanently. Every developer gets an identical stack, regardless of operating system.

```yaml
# docker-compose.dev.yml - Development setup
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile.dev  # Dev dockerfile with hot reload
    volumes:
      - .:/app                    # Mount source code!
      - /app/node_modules         # Keep container's node_modules
    environment:
      NODE_ENV: development
      DEBUG: "true"
    ports:
      - "9229:9229"               # Node.js debug port
    command: npm run dev          # Hot reload command

  # Development tools
  mailhog:
    image: mailhog/mailhog        # Email testing
    ports:
      - "8025:8025"               # Web UI
      - "1025:1025"               # SMTP
    profiles:
      - dev-tools

  redis-commander:
    image: rediscommander/redis-commander
    environment:
      REDIS_HOSTS: "local:redis:6379"
    ports:
      - "8081:8081"
    profiles:
      - dev-tools
```

Use profiles to start dev tools only when needed: `docker compose --profile dev-tools up`

### Dockerfile.dev — Node.js with Hot Reload

```dockerfile
# Dockerfile.dev - Development only
FROM node:18-alpine

# Install nodemon for hot reload
RUN npm install -g nodemon

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install  # All deps including devDependencies

# Don't COPY source - it's mounted via volume!

EXPOSE 3000 9229

# Hot reload with nodemon
CMD ["nodemon", "--inspect=0.0.0.0:9229", "src/server.js"]
```

### Development vs Production — Key Differences

| Aspect | Development | Production |
|---|---|---|
| Base Image | node:18 (full) | node:18-alpine |
| devDependencies | Installed | Excluded |
| Source Code | Via bind mount | COPYed into image |
| Hot Reload | nodemon | Not needed |
| Debug Ports | 9229 exposed | No debug |
| Image Size | ~1GB acceptable | < 200MB target |
| Multi-stage Build | Not needed | Yes |

### Benefits of Docker for Development

- **Same Environment**: Every developer runs an identical stack. "Works on my machine" becomes irrelevant.
- **Instant Onboarding**: New developer joins: `git clone && docker compose up` = fully running stack in 5 minutes.
- **No Version Conflicts**: Switch between Node 16, 18, 20 projects without juggling version managers. Each project is isolated.
- **Exact Production Parity**: Test with the exact same database version (Postgres 16, MongoDB 7) as production.

---

## Docker for React/Node Development

> **Note:** This section covers CRA, Vite, Next.js, and full MERN stack setups with Docker, including real-world pitfalls that trip up beginners.

### 1. Dockerize Create React App (CRA) with Hot Reload

```dockerfile
# Dockerfile.dev for React CRA
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
# Don't copy source - mounted via volume
EXPOSE 3000
CMD ["npm", "start"]
```

```yaml
# docker-compose.yml for React dev
services:
  react-app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    volumes:
      - .:/app
      - /app/node_modules          # Prevent overwriting container's node_modules!
    ports:
      - "3000:3000"
    environment:
      - CHOKIDAR_USEPOLLING=true   # Required for file watching in Docker!
      - REACT_APP_API_URL=http://localhost:5000
    stdin_open: true               # Required for CRA
    tty: true
```

### 2. Dockerize Vite React App

> **Caution:** Vite by default only listens on `localhost` inside the container. The `--host 0.0.0.0` flag is required to access it from outside the container.

```dockerfile
# Dockerfile.dev for Vite
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
# --host 0.0.0.0 is CRITICAL! Otherwise Vite only listens on localhost inside container
```

```yaml
services:
  vite-app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    volumes:
      - .:/app
      - /app/node_modules
    ports:
      - "5173:5173"
    environment:
      - VITE_API_URL=http://localhost:3001
```

### 3. Production React App with Nginx

```dockerfile
# Dockerfile.prod - Complete production build
FROM node:18-alpine AS builder

WORKDIR /app

ARG REACT_APP_API_URL
ARG REACT_APP_ENV=production

ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_ENV=$REACT_APP_ENV

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production: Nginx serving
FROM nginx:1.25-alpine

# Custom nginx config for React SPA
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built React app
COPY --from=builder /app/build /usr/share/nginx/html

# Health endpoint
RUN echo "healthy" > /usr/share/nginx/html/health

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
```

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;
    
    # React Router support — REQUIRED for SPAs!
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # API proxy (optional)
    location /api/ {
        proxy_pass http://api:5000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # Cache static assets aggressively
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css application/json application/javascript;
}
```

### 4. Next.js Production — Official Recommended Dockerfile

```dockerfile
FROM node:18-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

### 5. Full MERN Stack Development Setup

```yaml
# docker-compose.yml - Full MERN Dev Stack
services:
  # React Frontend
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    volumes:
      - ./frontend:/app
      - /app/node_modules
    ports:
      - "3000:3000"
    environment:
      - REACT_APP_API_URL=http://localhost:5000
      - CHOKIDAR_USEPOLLING=true
    depends_on:
      - api

  # Node.js API
  api:
    build:
      context: ./api
      dockerfile: Dockerfile.dev
    volumes:
      - ./api:/app
      - /app/node_modules
    ports:
      - "5000:5000"
      - "9229:9229"   # Debug port
    environment:
      NODE_ENV: development
      MONGODB_URI: mongodb://mongodb:27017/myapp
      JWT_SECRET: dev-secret-key
    depends_on:
      - mongodb

  # MongoDB
  mongodb:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    environment:
      MONGO_INITDB_DATABASE: myapp

  # Redis cache
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  # Mongo Express - GUI for MongoDB (localhost:8081)
  mongo-express:
    image: mongo-express
    ports:
      - "8081:8081"
    environment:
      ME_CONFIG_MONGODB_SERVER: mongodb
      ME_CONFIG_BASICAUTH_USERNAME: admin
      ME_CONFIG_BASICAUTH_PASSWORD: admin
    depends_on:
      - mongodb

volumes:
  mongo_data:
```

### Common React + Docker Problems and Fixes

| Problem | Cause | Fix |
|---|---|---|
| Hot reload not working | File watching broken in Docker | Set `CHOKIDAR_USEPOLLING=true` |
| Can't access Vite app | Vite binding to localhost only | Add `--host 0.0.0.0` to dev command |
| node_modules overwritten | Host volume masks container deps | Add `/app/node_modules` as anonymous volume |
| Build fails: env vars missing | REACT_APP_ prefix not passed at build time | Use `ARG` + `ENV` in Dockerfile |
| Very slow Docker builds | Large build context with node_modules | Add `node_modules` to `.dockerignore` |

---

## Debugging Dockerized Apps

### Node.js Remote Debugging

You can debug a Node.js app running inside a container using Chrome DevTools or VS Code.

```bash
# Start Node.js container in debug mode
docker run -d \
  --name api-debug \
  -p 9229:9229 \
  -v $(pwd):/app \
  node:18 \
  node --inspect=0.0.0.0:9229 src/server.js

# Then open Chrome: chrome://inspect
# Your server will appear under "Remote Target"
```

```json
// VS Code launch.json
{
  "configurations": [
    {
      "type": "node",
      "request": "attach",
      "name": "Docker: Attach to Node",
      "port": 9229,
      "address": "localhost",
      "localRoot": "${workspaceFolder}",
      "remoteRoot": "/app",
      "restart": true
    }
  ]
}
```

### Python Debugging with debugpy

```bash
# Python debugging with debugpy
docker run -d \
  -p 5678:5678 \
  -v $(pwd):/app \
  python:3.11 \
  python -m debugpy --listen 0.0.0.0:5678 --wait-for-client app.py

# In VS Code, use the Python: Remote Attach configuration
# Port: 5678, Host: localhost
```

### Network Debugging with netshoot

> **Tip:** `nicolaka/netshoot` contains curl, tcpdump, netstat, nslookup, traceroute, dig — everything you need. Attach to any container's network namespace and debug immediately.

```bash
# Network debugging with netshoot
docker run -it --rm \
  --network container:myapp \
  nicolaka/netshoot

# Now inside myapp's network namespace with full tooling:
# curl, tcpdump, netstat, nslookup, traceroute, dig, etc.

# Check DNS resolution inside container network
docker run --rm --network mynetwork nicolaka/netshoot nslookup api

# Check if port is reachable between services
docker run --rm --network mynetwork nicolaka/netshoot nc -zv api 5000

# Capture TCP traffic
docker run --rm --network container:myapp nicolaka/netshoot tcpdump -i eth0 port 5000
```

### General Container Debugging Commands

```bash
# Open a shell inside the container
docker exec -it myapp sh

# View logs with timestamps
docker logs -f --timestamps myapp

# Process list inside container
docker exec myapp ps aux

# Check environment variables
docker exec myapp env | grep -i api

# Full container config
docker inspect myapp | jq '.[0].NetworkSettings'

# Browse the filesystem
docker exec -it myapp find /app -name "*.log"

# Copy files out of container for inspection
docker cp myapp:/app/logs/error.log ./error.log
```

---

## Production Readiness Checklist

> **Caution:** Before going to production, verify all items below. Common mistakes in production Dockerfiles and compose files create security vulnerabilities, crashes, or performance issues. Bookmark this checklist.

### Production Dockerfile Checklist

| Check | Why It Matters | Status |
|---|---|---|
| Specific base image version (not `latest`) | Reproducible builds, no surprise updates | ☐ |
| Multi-stage build used | Smaller final image, no build tools in prod | ☐ |
| Non-root user configured | Security — limits blast radius of a breach | ☐ |
| .dockerignore present | Smaller build context, no secrets leaked | ☐ |
| HEALTHCHECK configured | Orchestrators can detect unhealthy containers | ☐ |
| WORKDIR explicitly set | Predictable file paths | ☐ |
| package*.json COPY before source COPY | Better layer caching | ☐ |
| No secrets in image/Dockerfile | Security — images can be inspected | ☐ |
| Image size < 500MB (ideally < 200MB) | Faster pulls, lower storage cost | ☐ |
| LABEL with version/maintainer info | Traceability in production | ☐ |
| Graceful shutdown handled (SIGTERM) | Zero-downtime deployments | ☐ |

### Graceful Shutdown in Node.js

When Docker stops a container, it sends `SIGTERM` first, then `SIGKILL` after 10 seconds. If you do not handle SIGTERM, in-flight requests are dropped.

```javascript
// server.js - Handle SIGTERM for graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('HTTP server closed');
    // Close DB connections
    mongoose.connection.close(false, () => {
      console.log('MongoDB disconnected');
      process.exit(0);
    });
  });
  
  // Force exit after 30 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcing exit');
    process.exit(1);
  }, 30000);
});
```

### Image Versioning Strategy

```bash
# Tagging strategy for production
IMAGE="myapp"
REGISTRY="123456789.dkr.ecr.ap-south-1.amazonaws.com"
GIT_TAG=$(git describe --tags --always)
GIT_SHA=$(git rev-parse --short HEAD)
DATE=$(date +%Y%m%d)

# Always push with multiple tags
docker build -t $IMAGE .
docker tag $IMAGE $REGISTRY/$IMAGE:$GIT_TAG       # v1.2.3
docker tag $IMAGE $REGISTRY/$IMAGE:$GIT_SHA       # abc1234
docker tag $IMAGE $REGISTRY/$IMAGE:$DATE          # 20240115
docker tag $IMAGE $REGISTRY/$IMAGE:latest         # latest (don't use in deploys!)

# Deploy using a specific version, not latest!
docker pull $REGISTRY/$IMAGE:v1.2.3
```

> **Caution:** Never deploy using the `:latest` tag in production. If someone pushes and the service restarts, an unexpected version may be deployed. Always use a git SHA or semantic version tag for deployments.

---

## Docker with CI/CD Pipelines

### Complete GitHub Actions Workflow — Build, Test, Push

Before writing your pipeline, validate your workflow syntax with the [GitHub Actions Validator](/github-actions-validator) to catch errors early.

```yaml
# .github/workflows/docker-build-push.yml
name: Build and Push Docker Image

on:
  push:
    branches: [main]
    tags: ['v*']
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run tests
        run: |
          docker build --target test -t myapp:test .
          docker run --rm myapp:test npm test

  build-push:
    needs: test
    runs-on: ubuntu-latest
    if: github.event_name != 'pull_request'
    permissions:
      contents: read
      packages: write
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Extract metadata (tags, labels)
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=sha,prefix=sha-
            type=raw,value=latest,enable={{is_default_branch}}
      
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha          # Use GitHub Actions cache!
          cache-to: type=gha,mode=max
          platforms: linux/amd64,linux/arm64   # Multi-arch build
```

### Deploy to AWS ECS via CI/CD

```yaml
  deploy:
    needs: build-push
    runs-on: ubuntu-latest
    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-south-1
      
      - name: Download task definition
        run: |
          aws ecs describe-task-definition \
            --task-definition myapp \
            --query taskDefinition > task-definition.json
      
      - name: Update ECS task definition
        id: task-def
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: task-definition.json
          container-name: myapp
          image: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest
      
      - name: Deploy to ECS
        uses: aws-actions/amazon-ecs-deploy-task-definition@v1
        with:
          task-definition: ${{ steps.task-def.outputs.task-definition }}
          service: myapp-service
          cluster: production
          wait-for-service-stability: true   # Wait for deploy to complete
```

If you are using GitLab CI instead, validate your `.gitlab-ci.yml` syntax with the [GitLab CI Validator](/gitlab-ci-validator) before pushing.

### CI/CD Pipeline Flow

1. **Code Push**: Developer runs `git push` → GitHub Actions triggers automatically.
2. **Test**: Docker image builds with test target → tests run inside the container.
3. **Build and Push**: Multi-arch production image builds and pushes to registry with proper tags.
4. **Deploy**: ECS task definition updates → service performs a rolling deploy with zero downtime.

> **Note:** "Our CI/CD pipeline runs on GitHub Actions. Every push to main automatically builds the Docker image, runs tests inside the container, then pushes to ECR and does an ECS rolling deploy — all automated. Manual production deployments never happen."

---

## Monitoring Docker Containers

### Docker Built-in Monitoring Commands

```bash
# Real-time stats — CPU, Memory, Network, IO
docker stats                    # All containers
docker stats myapp --no-stream  # One-time snapshot (no live update)

# Human-readable format
docker stats --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# Events stream — what is happening in the system
docker events --since 1h

# Filter events by type
docker events --filter type=container --filter event=die

# Logs with time range
docker logs --since 1h --until 30m myapp
docker logs --since "2024-01-15T10:00:00" myapp

# Formatted logs
docker logs --timestamps myapp 2>&1 | grep ERROR
```

### Full Monitoring Stack: cAdvisor + Prometheus + Grafana

```yaml
# monitoring/docker-compose.monitoring.yml
services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.retention.time=30d
      
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"             # Port 3000 reserved for app
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD:-admin123}
    volumes:
      - grafana_data:/var/lib/grafana
      
  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
    ports:
      - "8080:8080"

volumes:
  prometheus_data:
  grafana_data:
```

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'docker'
    static_configs:
      - targets: ['cadvisor:8080']    # Container metrics

  - job_name: 'myapp'
    static_configs:
      - targets: ['myapp:3000']
    metrics_path: '/metrics'          # App must expose a /metrics endpoint
```

### What to Monitor

- **CPU Usage**: Detect container CPU throttling. Consistently above 80% means scale out or raise resource limits.
- **Memory**: Detect memory leaks. Check for OOM kills with `docker events --filter event=oom`.
- **Network I/O**: Detect unusual traffic patterns. Track high egress costs in AWS.
- **Container Restarts**: Frequent restarts indicate a crash loop. Check the RESTARTS column in `docker ps`.

---

## Docker Orchestration Introduction

### Docker Swarm vs Kubernetes

| Feature | Docker Swarm | Kubernetes |
|---|---|---|
| Complexity | Simple | Complex |
| Setup Time | Minutes | Hours/Days |
| Auto-scaling | Basic | Advanced (HPA, VPA) |
| Ecosystem | Docker only | Massive (CNCF) |
| Rolling Updates | Yes | Yes |
| Self-healing | Yes | Yes |
| Multi-host | Yes | Yes |
| Industry Adoption (2026) | Declining/Legacy | Dominant Standard |
| Cloud Native Support | Limited | First-class |
| Learning Curve | Low | High |

> **Note:** Swarm is now mostly legacy. In 2026, Kubernetes is the industry standard. That said, mastering Docker Compose and core Docker concepts makes learning Kubernetes significantly easier — the concepts are the same, just with greater complexity.

### When Do You Need Orchestration?

- **Scale: 10+ Containers**: Docker Compose runs on a single machine. Deploying across multiple machines requires orchestration.
- **High Availability**: If a node dies and the app automatically shifts to another node — that is orchestration.
- **Auto-scaling**: Automatically scale containers up when traffic increases and scale down when it drops.
- **Zero-downtime Deploys**: Rolling deployments where the old version keeps running until the new version is healthy.

### Transition Path

> **Tip:** Learning path: Docker basics → Docker Compose (multi-container) → Kubernetes (multi-host, production-grade). Each step builds on the previous one. Master Docker concepts and Kubernetes will feel natural. When you are ready to take the next step, the [Kubernetes for DevOps](/learn/guides/kubernetes-for-devops) guide picks up exactly where containers leave off.

```bash
# Docker Swarm quick demo (educational only)
docker swarm init                       # Initialize swarm on current node
docker service create --name web nginx  # Create a service
docker service scale web=5              # Scale to 5 replicas (auto-distributed!)
docker service ls                       # List services
docker service ps web                   # See where each replica runs
docker swarm leave --force              # Leave swarm

# Equivalent nginx deployment in Kubernetes
kubectl create deployment web --image=nginx
kubectl scale deployment web --replicas=5
kubectl get deployments
kubectl get pods                        # See 5 pods running
```

## AWS Container Services

### AWS Container Services Overview

| Service | What It Is | When to Use |
|---|---|---|
| **ECR** | Elastic Container Registry — private image registry | Store Docker images for AWS deployments |
| **ECS** | Managed container orchestration service | Production workloads, teams familiar with Docker |
| **Fargate** | Serverless containers — no EC2 management | Simple deployments, variable load, no infrastructure operations |
| **EKS** | Managed Kubernetes service | Complex microservices, existing Kubernetes expertise |
| **App Runner** | Fully managed container platform | Simple web apps, fastest time-to-deploy |

### ECS Architecture

Understanding how ECS maps to Docker concepts:

- **Task Definition** — Blueprint for container configuration, similar to a `docker-compose.yml`. Defines image, ports, environment variables, CPU and memory limits.
- **Task** — A running instance of a task definition. Equivalent to a running container or group of containers.
- **Service** — Maintains the desired task count, automatically replaces failed tasks, and integrates with a load balancer.
- **Cluster** — A group of EC2 instances or Fargate compute resources on which tasks are scheduled.

### ECS Task Definition — Complete Example

```json
{
  "family": "myapp",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::123456789:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::123456789:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "myapp",
      "image": "123456789.dkr.ecr.ap-south-1.amazonaws.com/myapp:v1.0",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:ap-south-1:123456789:secret:myapp/db-url"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/myapp",
          "awslogs-region": "ap-south-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

> **Note:** Never store secrets directly in environment variable definitions. Use AWS Secrets Manager or Parameter Store. ECS automatically injects secrets as environment variables at runtime — they are not stored in the image.

---

## Practical AWS Deployment Workflows

### Complete Deployment Script — React App to AWS Fargate

> **Tip:** Copy this script into your project, set the variables to match your setup, and deploy your entire application with a single command: `bash deploy.sh`

```bash
#!/bin/bash
# deploy.sh - Complete deployment script

set -e   # Stop the script if any step fails

# Variables — set your own values here
APP_NAME="myreactapp"
AWS_ACCOUNT_ID="123456789012"
AWS_REGION="ap-south-1"
ECR_REGISTRY="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
IMAGE_TAG=$(git rev-parse --short HEAD)   # Use Git SHA as tag

echo "Starting deployment of $APP_NAME:$IMAGE_TAG"

# Step 1: Build image
echo "Building Docker image..."
docker build \
  --build-arg REACT_APP_API_URL=https://api.myapp.com \
  -t $APP_NAME:$IMAGE_TAG \
  .

# Step 2: Authenticate with ECR
echo "Authenticating with ECR..."
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin $ECR_REGISTRY

# Step 3: Tag for ECR
docker tag $APP_NAME:$IMAGE_TAG $ECR_REGISTRY/$APP_NAME:$IMAGE_TAG
docker tag $APP_NAME:$IMAGE_TAG $ECR_REGISTRY/$APP_NAME:latest

# Step 4: Push to ECR
echo "Pushing to ECR..."
docker push $ECR_REGISTRY/$APP_NAME:$IMAGE_TAG
docker push $ECR_REGISTRY/$APP_NAME:latest

# Step 5: Update ECS service (force new deployment)
echo "Updating ECS service..."
aws ecs update-service \
  --cluster production \
  --service $APP_NAME-service \
  --force-new-deployment \
  --region $AWS_REGION

# Step 6: Wait for deployment to stabilize
echo "Waiting for deployment to stabilize..."
aws ecs wait services-stable \
  --cluster production \
  --services $APP_NAME-service \
  --region $AWS_REGION

echo "Deployment successful! Image: $ECR_REGISTRY/$APP_NAME:$IMAGE_TAG"
```

### AWS Fargate with Application Load Balancer

```bash
# Create ECS cluster (Fargate mode)
aws ecs create-cluster --cluster-name production

# Create ALB target group
aws elbv2 create-target-group \
  --name myapp-tg \
  --protocol HTTP \
  --port 3000 \
  --vpc-id vpc-12345 \
  --target-type ip \              # Use 'ip' for Fargate, not 'instance'
  --health-check-path /health

# Create ECS service with Fargate — 2 replicas for high availability
aws ecs create-service \
  --cluster production \
  --service-name myapp-service \
  --task-definition myapp:1 \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-1,subnet-2],securityGroups=[sg-123],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=myapp,containerPort=3000"
```

### ECR — Common Operations

```bash
# Create ECR repository
aws ecr create-repository \
  --repository-name myapp \
  --image-scanning-configuration scanOnPush=true \   # Enable vulnerability scanning
  --region ap-south-1

# List images in repository
aws ecr list-images --repository-name myapp --region ap-south-1

# Delete old images (cost management)
aws ecr batch-delete-image \
  --repository-name myapp \
  --image-ids imageTag=old-tag

# Lifecycle policy — automatically delete old images
aws ecr put-lifecycle-policy \
  --repository-name myapp \
  --lifecycle-policy-text '{
    "rules": [{
      "rulePriority": 1,
      "description": "Keep last 10 images",
      "selection": {
        "tagStatus": "any",
        "countType": "imageCountMoreThan",
        "countNumber": 10
      },
      "action": {"type": "expire"}
    }]
  }'
```

---

## 10 Hands-On Docker Projects

> **Tip:** Build all of these projects and push them to GitHub. Each project can become a resume bullet point. Recruiters and interviewers want to see working code — that is far more impactful than simply claiming Docker knowledge.

### Project 1: React Portfolio Site

**Difficulty:** Beginner | **Stack:** React, Nginx, Docker | **Concepts:** Multi-stage build, static file serving

Convert a React application into a production-ready Docker image using Nginx for serving and optimal caching.

```dockerfile
# Stage 1: Build React app
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:1.25-alpine
COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

```bash
docker build -t portfolio .
docker run -d -p 8080:80 --name portfolio portfolio
# Visit: http://localhost:8080

# Check image size
docker images portfolio
```

> **Tip:** Resume bullet — *"Containerized React portfolio using Docker multi-stage builds with Nginx, achieving 90%+ image size reduction vs non-optimized builds; deployed via CI/CD pipeline."*

### Project 2: Secure Node.js REST API

**Difficulty:** Beginner | **Stack:** Node.js, Express, Docker | **Concepts:** Non-root user, health checks, production dependencies only

```dockerfile
FROM node:18-alpine

# Security: create a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production    # Only production dependencies

COPY --chown=appuser:appgroup . .

USER appuser                    # Switch to non-root user

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "server.js"]
```

```bash
docker build -t node-api .
docker run -d -p 3000:3000 node-api

# Check health check status
docker inspect --format='{{.State.Health.Status}}' $(docker ps -q)

# Test the API
curl http://localhost:3000/health
```

### Project 3: Python FastAPI Data App

**Difficulty:** Beginner | **Stack:** Python, FastAPI, Uvicorn | **Concepts:** Python containerization, pip caching

```dockerfile
FROM python:3.11-slim           # slim = smaller than full python image

WORKDIR /app

# Copy requirements first for better layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1          # Python logs appear in Docker logs

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```bash
docker build -t fastapi-app .
docker run -d -p 8000:8000 fastapi-app

# Interactive API docs
# http://localhost:8000/docs
```

### Project 4: Full MERN Stack Application

**Difficulty:** Intermediate | **Stack:** React, Node.js, MongoDB, Redis | **Concepts:** Multi-service Compose, service discovery, volumes

```yaml
# docker-compose.yml - Full MERN Stack
services:
  frontend:
    build:
      context: ./frontend
      args:
        - REACT_APP_API_URL=http://localhost:5000
    ports:
      - "3000:80"               # Production: nginx serving
    depends_on:
      - backend

  backend:
    build: ./backend
    ports:
      - "5000:5000"
    environment:
      MONGODB_URI: mongodb://mongodb:27017/mern_db
      REDIS_URL: redis://redis:6379
    depends_on:
      - mongodb
      - redis

  mongodb:
    image: mongo:7
    volumes:
      - mongo_data:/data/db

  redis:
    image: redis:7-alpine

  mongo-express:              # MongoDB GUI — development only
    image: mongo-express
    ports:
      - "8081:8081"
    environment:
      ME_CONFIG_MONGODB_SERVER: mongodb
    depends_on:
      - mongodb

volumes:
  mongo_data:
```

```bash
# Start the complete MERN stack
docker compose up -d --build

# Check all services
docker compose ps

# Follow API logs
docker compose logs -f backend

# Access points:
# Frontend: http://localhost:3000
# Backend API: http://localhost:5000
# MongoDB GUI: http://localhost:8081

# Stop the stack (data is preserved)
docker compose down
```

> **Tip:** Resume bullet — *"Containerized full MERN stack using Docker Compose with service discovery, named volumes for data persistence, and Mongo Express GUI for development; reduced environment setup time from 2 hours to 5 minutes."*

### Project 5: WordPress + MySQL — Classic Stack

**Difficulty:** Intermediate | **Stack:** WordPress, MySQL 8 | **Concepts:** Health checks with conditions, restart policies, named volumes

```yaml
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wordpress
      MYSQL_PASSWORD: wordpresspassword
    volumes:
      - mysql_data:/var/lib/mysql
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      retries: 5
      start_period: 30s

  wordpress:
    image: wordpress:latest
    ports:
      - "8080:80"
    environment:
      WORDPRESS_DB_HOST: mysql:3306
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: wordpresspassword
      WORDPRESS_DB_NAME: wordpress
    volumes:
      - wordpress_data:/var/www/html
    depends_on:
      mysql:
        condition: service_healthy    # Wait until MySQL is healthy
    restart: unless-stopped

volumes:
  mysql_data:
  wordpress_data:
```

```bash
docker compose up -d
# MySQL health check will be satisfied before WordPress starts
docker compose ps

# Visit: http://localhost:8080
# Complete the WordPress setup wizard
```

### Project 6: Microservices with Nginx API Gateway

**Difficulty:** Intermediate | **Stack:** Node.js microservices, Nginx gateway, PostgreSQL | **Concepts:** API gateway pattern, service isolation, multiple databases

```yaml
services:
  # Single entry point — all traffic routes through here
  api-gateway:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx/gateway.conf:/etc/nginx/conf.d/default.conf
    depends_on:
      - user-service
      - product-service

  user-service:
    build: ./user-service
    environment:
      DB_URL: postgresql://postgres:password@user-db:5432/users
    # No ports exposed externally — only accessible through the gateway
    depends_on:
      - user-db

  product-service:
    build: ./product-service
    environment:
      DB_URL: postgresql://postgres:password@product-db:5432/products
    depends_on:
      - product-db

  # Each service has its own database
  user-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: users
      POSTGRES_PASSWORD: password
    volumes:
      - user_db_data:/var/lib/postgresql/data

  product-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: products
      POSTGRES_PASSWORD: password
    volumes:
      - product_db_data:/var/lib/postgresql/data

volumes:
  user_db_data:
  product_db_data:
```

> **Tip:** Resume bullet — *"Designed and containerized microservices architecture with Nginx API gateway, service isolation, and per-service databases using Docker Compose; demonstrating event-driven service communication patterns."*

### Project 7: Image Size Optimization Challenge

**Difficulty:** Intermediate | **Goal:** 1.2 GB → under 100 MB | **Concepts:** Multi-stage builds, Alpine, production deps, .dockerignore

```dockerfile
# BEFORE: Naive approach — DO NOT USE in production
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y nodejs npm
COPY . /app
WORKDIR /app
RUN npm install              # All deps including devDependencies
# Final image size: ~1.2 GB
```

```dockerfile
# AFTER: Optimized multi-stage build
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci                   # All deps for building
COPY . .
RUN npm run build            # Compile/transpile

FROM node:18-alpine          # Fresh slim base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production # Production deps only
COPY --from=builder /app/dist ./dist
USER node                    # Non-root
CMD ["node", "dist/server.js"]
# Final image size: ~85 MB (93% reduction)
```

```bash
# Compare before and after sizes
docker build -f Dockerfile.before -t app:before .
docker build -f Dockerfile.after -t app:after .
docker images | grep app

# Detailed layer analysis
docker history app:after

# Layer-by-layer analysis with dive
docker run --rm -it \
  -v /var/run/docker.sock:/var/run/docker.sock \
  wagoodman/dive app:after
```

### Project 8: Full Monitoring Stack

**Difficulty:** Advanced | **Stack:** App + Prometheus + Grafana + cAdvisor | **Concepts:** Metrics collection, dashboards, alerting

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    # App must expose a /metrics endpoint (use prom-client npm package)

  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus

  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"            # Use 3001 to avoid conflict with the app
    volumes:
      - grafana_data:/var/lib/grafana
    depends_on:
      - prometheus

  cadvisor:
    image: gcr.io/cadvisor/cadvisor
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker:/var/lib/docker:ro
    ports:
      - "8080:8080"

volumes:
  prometheus_data:
  grafana_data:
```

```bash
docker compose up -d

# Access points:
# App: http://localhost:3000
# Prometheus: http://localhost:9090
# Grafana: http://localhost:3001 (admin/admin)
# cAdvisor: http://localhost:8080

# In Grafana:
# 1. Add data source: Prometheus, URL = http://prometheus:9090
# 2. Import dashboard: ID 893 (Docker monitoring)
# 3. Watch container metrics in real time
```

### Project 9: Complete CI/CD Pipeline

**Difficulty:** Advanced | **Stack:** GitHub Actions, Docker Hub, SSH Deploy | **Concepts:** Automated build, test, push, deploy

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main]
    tags: ['v*']

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run tests in Docker
        run: |
          docker build --target test -t test-image .
          docker run --rm test-image npm test

  build-push:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: |
            ${{ secrets.DOCKERHUB_USERNAME }}/myapp:latest
            ${{ secrets.DOCKERHUB_USERNAME }}/myapp:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build-push
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to server via SSH
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ubuntu
          key: ${{ secrets.SSH_KEY }}
          script: |
            docker pull ${{ secrets.DOCKERHUB_USERNAME }}/myapp:latest
            docker stop myapp || true
            docker rm myapp || true
            docker run -d \
              --name myapp \
              --restart unless-stopped \
              -p 80:3000 \
              ${{ secrets.DOCKERHUB_USERNAME }}/myapp:latest
            echo "Deployment complete!"
```

> **Tip:** Resume bullet — *"Implemented end-to-end CI/CD pipeline using GitHub Actions: automated Docker image build and test on every push, Docker Hub publish with semantic versioning, and zero-touch SSH deployment to production server."*

### Project 10: Full Observability Stack (ELK + Jaeger + Prometheus)

**Difficulty:** Advanced | **Stack:** OpenTelemetry, Jaeger, Prometheus, ELK Stack | **Concepts:** Metrics + Tracing + Logging — the three pillars of observability

```yaml
services:
  # Your application
  app:
    build: .
    environment:
      OTEL_SERVICE_NAME: myapp
      OTEL_EXPORTER_OTLP_ENDPOINT: http://otel-collector:4318
    depends_on:
      - otel-collector

  # OpenTelemetry Collector — central data routing hub
  otel-collector:
    image: otel/opentelemetry-collector-contrib
    volumes:
      - ./otel-config.yml:/etc/otelcol-contrib/config.yaml
    ports:
      - "4318:4318"   # OTLP HTTP

  # Distributed tracing — request flows across services
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"   # Jaeger UI

  # Metrics — numeric time-series data
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  # Dashboards — metrics visualization
  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin123

  # Logs — structured log storage
  elasticsearch:
    image: elasticsearch:8.11.0
    environment:
      discovery.type: single-node
      xpack.security.enabled: "false"
    volumes:
      - es_data:/usr/share/elasticsearch/data
    ports:
      - "9200:9200"

  # Log visualization
  kibana:
    image: kibana:8.11.0
    ports:
      - "5601:5601"
    environment:
      ELASTICSEARCH_HOSTS: http://elasticsearch:9200
    depends_on:
      - elasticsearch

volumes:
  es_data:
```

```bash
# Start full observability stack
docker compose up -d

# Wait for Elasticsearch to finish starting
docker compose logs -f elasticsearch | grep "started"

# Access points:
# App:          http://localhost:3000
# Jaeger UI:    http://localhost:16686  (request traces)
# Prometheus:   http://localhost:9090   (raw metrics)
# Grafana:      http://localhost:3001   (metric dashboards)
# Kibana:       http://localhost:5601   (log analysis)

# Generate some traffic
for i in {1..20}; do curl http://localhost:3000/api/users; done
```

> **Tip:** Resume bullet — *"Implemented complete observability stack using Docker Compose: OpenTelemetry instrumentation, Jaeger distributed tracing, Prometheus + Grafana metrics dashboards, and ELK stack log aggregation — full visibility into system behavior."*

### Projects Summary — Difficulty Progression

| # | Project | Difficulty | Key Skill | Resume Impact |
|---|---|---|---|---|
| 1 | React Portfolio | Beginner | Multi-stage build | High |
| 2 | Node.js API | Beginner | Security, health checks | High |
| 3 | Python FastAPI | Beginner | Python containerization | Medium |
| 4 | MERN Stack | Intermediate | Multi-service Compose | Very High |
| 5 | WordPress + MySQL | Intermediate | Health check conditions | Medium |
| 6 | Microservices | Intermediate | API gateway pattern | Very High |
| 7 | Size Optimization | Intermediate | Layer optimization | High |
| 8 | Monitoring Stack | Advanced | Prometheus + Grafana | Very High |
| 9 | CI/CD Pipeline | Advanced | GitHub Actions | Very High |
| 10 | Observability Stack | Advanced | OTel + ELK + Jaeger | Exceptional |

---

## Common Errors and Solutions

The following errors are encountered by almost every Docker developer at some point. Each includes the root cause, solution, and prevention guidance.

### Error: Cannot connect to the Docker daemon

```
Error: Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?
```

**Root Cause:** The Docker daemon (dockerd) has not started or has crashed.

```bash
# Check daemon status
sudo systemctl status docker

# Start the daemon
sudo systemctl start docker

# Enable on boot
sudo systemctl enable docker

# Verify
docker info
```

**Prevention:** Always enable the Docker service on boot with `systemctl enable docker`. On Mac, ensure Docker Desktop is running before using the CLI.

### Error: Permission denied on Docker socket

```
Got permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock
```

**Root Cause:** The current user is not a member of the `docker` group.

```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Apply group change immediately (or log out and back in)
newgrp docker

# Verify
docker run hello-world
```

**Prevention:** Add the user to the docker group during initial Docker installation. In CI/CD pipelines, add the runner user to the docker group.

### Error: Port is already allocated

```
docker: Error response from daemon: driver failed programming external connectivity on endpoint myapp: Bind for 0.0.0.0:8080 failed: port is already allocated.
```

**Root Cause:** Host port 8080 is already in use by another process or container.

```bash
# Find what is using the port
sudo lsof -i :8080
sudo ss -tulpn | grep :8080

# Kill the process (replace PID)
kill -9 <PID>

# OR use a different host port
docker run -p 8081:80 nginx

# Find running containers using the port
docker ps | grep 8080
```

**Prevention:** Use environment variables for port configuration. Run `docker ps` before starting new containers.

### Error: No space left on device

```
ERROR: failed to solve: ... write /var/lib/docker/...: no space left on device
```

**Root Cause:** The Docker daemon's disk space is exhausted — old images, containers, and volumes have consumed all available space.

```bash
# Check disk usage
df -h
docker system df

# Full cleanup (removes everything unused)
docker system prune -a --volumes

# Selective cleanup
docker image prune -a    # Remove unused images
docker container prune   # Remove stopped containers
docker volume prune      # Remove unused volumes
```

**Prevention:** Set up a cron job for `docker system prune`. Monitor `/var/lib/docker` size. Use multi-stage builds to keep images small.

### Error: Container exits immediately

**Root Cause:** The container's main process (CMD/ENTRYPOINT) completed, or it crashed with an error.

```bash
# Check logs first
docker logs container_id
docker logs container_id --tail 50

# Check exit code
docker inspect --format '{{.State.ExitCode}}' container_id

# Run interactively to debug
docker run -it myapp bash

# Bad: CMD nginx (exits immediately — starts as daemon)
# Good: CMD ["nginx", "-g", "daemon off;"]

# Override entrypoint for debugging
docker run -it --entrypoint bash myapp
```

**Prevention:** Use foreground commands in CMD. Test CMD locally first. Add proper health checks.

### Error: Pull access denied

```
Error response from daemon: pull access denied for myapp, repository does not exist or may require 'docker login'
```

**Root Cause:** The image name is incorrect, authentication is missing for a private registry, or the image does not exist.

```bash
# Login to Docker Hub
docker login

# Login to a private registry
docker login registry.mycompany.com -u username -p password

# Check exact image name and tag
docker pull myapp:latest

# Full path required for private registries
docker pull registry.mycompany.com/team/myapp:v1.0
```

**Prevention:** Use full image paths. Store credentials in Docker credential stores, not plain text. Set up registry mirrors for CI/CD.

### Error: Build context is extremely large

```
Sending build context to Docker daemon  2.5GB
```

**Root Cause:** A `.dockerignore` file is missing, so Docker sends the entire project directory (including `node_modules`, `.git`, etc.) to the daemon.

```bash
# Create .dockerignore file
cat > .dockerignore << 'EOF'
node_modules/
dist/
build/
.git/
.env
.env.local
*.log
npm-debug.log*
.DS_Store
coverage/
.nyc_output
EOF

# Verify build context size after
docker build --no-cache . 2>&1 | head -5
```

**Prevention:** Always create a `.dockerignore` when starting a new Docker project. Commit it to version control alongside your code.

### Error: Docker Hub rate limit exceeded

```
Error response from daemon: toomanyrequests: You have reached your pull rate limit.
```

**Root Cause:** Docker Hub anonymous pull limit has been hit (100 pulls per 6 hours unauthenticated, 200 for free accounts).

```bash
# Authenticate first to increase the limit
docker login
docker pull nginx

# OR configure a registry mirror in /etc/docker/daemon.json:
{
  "registry-mirrors": ["https://mirror.gcr.io"]
}

# Restart Docker after configuration change
sudo systemctl restart docker
```

**Prevention:** Always authenticate in CI/CD. Use ECR or GCR as a pull-through cache.

### Error: Container OOMKilled — exit code 137

**Root Cause:** The container exceeded its memory limit. The Linux OOM Killer forcefully terminated the process. Exit code 137 = 128 + 9 (SIGKILL).

```bash
# Check if OOM killed
docker inspect myapp | jq '.[0].State.OOMKilled'

# Check kernel logs for OOM
dmesg | grep -i "oom\|killed process"

# Increase memory limit
docker run --memory=1g --memory-swap=2g myapp

# Monitor memory usage
docker stats myapp
```

**Prevention:** Profile application memory in development. Set realistic limits based on actual usage plus a 20% buffer. Add memory monitoring alerts in production.

### Error: ECONNREFUSED connecting to database

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Root Cause:** The application inside the container is using `127.0.0.1` or `localhost` to connect to the database. Inside a container, `localhost` refers to the container itself — not another container.

```bash
# WRONG - localhost inside container = the container itself
DB_HOST=localhost  # ❌
DB_HOST=127.0.0.1  # ❌

# CORRECT - use the container name or service name
DB_HOST=postgres   # ✅ (with docker compose)
DB_HOST=db         # ✅ (compose service name)

# Verify connectivity
docker exec myapp ping postgres
docker exec myapp nslookup postgres
```

**Prevention:** Never hardcode localhost for inter-container communication. Use environment variables for hostnames. Use user-defined networks for DNS resolution.

### Error: Volume mount permission denied

```
Error: Permission denied: '/app/data'
```

**Root Cause:** The container process user does not own the host volume directory.

```bash
# Option 1: Match user/group
docker run -u $(id -u):$(id -g) -v $(pwd)/data:/app/data myapp

# Option 2: Fix host directory permissions
sudo chown -R 1000:1000 ./data

# Option 3: Fix permissions in Dockerfile
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

# Option 4: Use named volume (Docker manages permissions)
docker run -v myapp_data:/app/data myapp
```

### Error: DNS resolution failure between containers

```
Error: getaddrinfo ENOTFOUND api-service
```

**Root Cause:** The default bridge network does not provide automatic DNS resolution between containers. Only user-defined networks include the embedded DNS server.

```bash
# Create a user-defined network
docker network create app-network

# Run both containers on the same network
docker run --name api-service --network app-network myapi
docker run --name frontend --network app-network myfrontend

# Now 'api-service' is resolvable by name
docker exec frontend curl http://api-service:3000
```

**Prevention:** Always use user-defined networks for multi-container applications. Docker Compose sets this up automatically.

### Error: COPY file not found in build context

```
COPY failed: file not found in build context or excluded by .dockerignore: stat package.json: file not found
```

**Root Cause:** The file does not exist in the build context, `.dockerignore` has excluded it, or the Dockerfile is being run from the wrong directory.

```bash
# Check if file exists
ls -la package.json

# Check .dockerignore isn't excluding it
cat .dockerignore | grep package

# Build from the correct directory
docker build -t myapp .   # note the dot — build context = current directory

# To build from a parent directory
docker build -t myapp -f ./subdir/Dockerfile .
```

### Error: exec format error

```
exec /docker-entrypoint.sh: exec format error
```

**Root Cause:** The image was built for a different CPU architecture (e.g., built on an M1 Mac for `arm64`, then run on a `linux/amd64` server).

```bash
# Check image platform
docker inspect myapp | jq '.[0].Architecture'

# Build for a specific platform
docker build --platform linux/amd64 -t myapp .

# Build a multi-platform image using buildx
docker buildx create --use
docker buildx build --platform linux/amd64,linux/arm64 \
  -t myapp:latest --push .
```

**Prevention:** Always use `--platform linux/amd64` when building for production servers from an M1/M2 Mac.

### Error: Cache keeps invalidating — npm install runs every time

**Root Cause:** `COPY . .` is placed before `RUN npm install`, so any file change invalidates the cache and forces `npm install` to re-run.

```dockerfile
# WRONG - cache breaks on every file change
FROM node:18
WORKDIR /app
COPY . .          # ❌ Any change = cache miss
RUN npm install   # Re-runs every time
CMD ["node", "server.js"]

# CORRECT - npm install only re-runs when package.json changes
FROM node:18
WORKDIR /app
COPY package*.json ./      # ✅ Only copy dependency manifest
RUN npm ci                 # Only runs when package.json changes
COPY . .                   # Source code (frequently changing)
CMD ["node", "server.js"]
```

**Prevention:** Always separate dependency installation from source code copying. This is one of the most important Dockerfile optimizations.

### Error: No configuration file provided (Docker Compose)

```
no configuration file provided: not found
```

**Root Cause:** Docker Compose cannot find a `docker-compose.yml` or `compose.yml` in the current directory.

```bash
# Check the current directory
ls -la | grep -i compose

# Navigate to the correct directory and run again
cd /path/to/your/project
docker compose up

# OR specify the file explicitly
docker compose -f /path/to/docker-compose.yml up

# Compose searches for these files in order:
# 1. compose.yaml
# 2. compose.yml
# 3. docker-compose.yaml
# 4. docker-compose.yml
```

### Error: Container status is unhealthy

**Root Cause:** The `HEALTHCHECK` command is failing. The application has not properly started, or the health endpoint is not responding.

```bash
# Inspect health check output
docker inspect --format '{{json .State.Health}}' myapp | jq .

# See the last 5 health check results
docker inspect myapp | jq '.[0].State.Health.Log'

# Manually run the health check command
docker exec myapp curl -f http://localhost:3000/health

# Temporarily disable to debug
docker run --no-healthcheck myapp
```

**Prevention:** Test health check commands manually before adding them to the Dockerfile. Use `--start-period` for applications that take time to start. Implement a `/health` endpoint in your application.

### Error: OOMKilled on Python — ModuleNotFoundError

```
ModuleNotFoundError: No module named 'flask'
```

**Root Cause:** `requirements.txt` was not copied correctly, or `pip install` ran in the wrong directory.

```dockerfile
# Correct Dockerfile order
FROM python:3.11-slim
WORKDIR /app                           # Set WORKDIR first
COPY requirements.txt .                # Copy requirements
RUN pip install --no-cache-dir -r requirements.txt  # Install
COPY . .                               # Then copy code
CMD ["python", "app.py"]
```

```bash
# Debug: check if packages are installed
docker exec -it myapp pip list | grep flask

# Rebuild without cache
docker build --no-cache -t myapp .
```

### Error: nginx bind permission denied on port 80

```
nginx: [emerg] bind() to 0.0.0.0:80 failed (13: Permission denied)
```

**Root Cause:** A non-root user cannot bind to privileged ports below 1024.

```bash
# Option 1: Use port 8080 (non-privileged)
# In nginx.conf: listen 8080;
docker run -p 80:8080 nginx-custom

# Option 2: Add NET_BIND_SERVICE capability
docker run --cap-add NET_BIND_SERVICE -p 80:80 nginx-custom

# Option 3: Use the nginx-unprivileged image (uses port 8080 by default)
FROM nginxinc/nginx-unprivileged
```

> **Tip:** When using a non-root user with nginx, always configure `nginx.conf` to listen on port 8080 or higher. Use `nginxinc/nginx-unprivileged` as the base image for a secure, non-root nginx setup.

> **Tip:** `docker logs` and `docker inspect` are your best debugging tools. 90% of Docker errors can be diagnosed with just these two commands.

---

## Debugging Methodology

### Systematic Debugging — Step by Step

When something stops working, follow this systematic checklist. Do not make random changes without first diagnosing the problem.

> **Note:** Approach Docker debugging like a doctor: check symptoms first, then diagnose, then treat. Never make changes without a clear diagnosis.

### Step 1: Is the Container Running?

```bash
# Show running containers
docker ps

# Show ALL containers (including stopped)
docker ps -a

# Pretty format with useful columns
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Filter by container name
docker ps -a --filter name=myapp
# Check the STATUS column: "Exited (1) 2 minutes ago" = crashed
# "Exited (0) 2 minutes ago" = completed normally
```

### Step 2: What Do the Logs Say?

```bash
# Last 100 lines of logs
docker logs --tail 100 myapp

# Follow logs in real time
docker logs -f myapp

# Logs from the last 1 hour
docker logs --since 1h myapp

# Logs with timestamps
docker logs -t myapp

# Filter for errors
docker logs myapp 2>&1 | grep -i "error\|fatal\|critical"

# Logs persist even for stopped containers until the container is removed
docker logs myapp
```

### Step 3: What Is the Exit Code?

```bash
# Get exit code
docker inspect --format '{{.State.ExitCode}}' myapp

# Get full state information
docker inspect --format '{{json .State}}' myapp | jq .

# Exit code reference:
# 0   = Normal exit (success, or CMD completed)
# 1   = General error (application error)
# 2   = Misuse of shell command
# 125 = Docker daemon error
# 126 = Container command cannot be invoked
# 127 = Container command not found
# 130 = Container terminated by Ctrl+C (SIGINT)
# 137 = SIGKILL (OOM kill or docker kill)
# 139 = Segmentation fault
# 143 = SIGTERM (graceful shutdown)
```

### Step 4: Can You Enter the Container?

```bash
# Enter a running container (bash for ubuntu/debian)
docker exec -it myapp bash

# For Alpine Linux (no bash by default)
docker exec -it myapp sh

# Run specific commands inside
docker exec myapp ls -la /app
docker exec myapp cat /app/config.json
docker exec myapp env | grep DB_

# If the container keeps crashing, override entrypoint to debug
docker run -it --entrypoint bash myapp
docker run -it --entrypoint sh myapp  # Alpine
```

### Step 5: Check Resource Usage

```bash
# Live stats for a specific container
docker stats myapp

# Live stats for all containers
docker stats

# One-time snapshot (no streaming)
docker stats --no-stream

# Check process list inside container
docker top myapp

# Check resource limits set on container
docker inspect --format '{{json .HostConfig.Memory}}' myapp
```

### Step 6: Network Inspection

```bash
# Inspect a network
docker network inspect app-network

# Check container's network settings
docker inspect --format '{{json .NetworkSettings}}' myapp | jq .

# Test DNS resolution from inside the container
docker exec myapp nslookup postgres
docker exec myapp nslookup google.com

# Test connectivity
docker exec myapp curl -v http://api-service:3000/health
docker exec myapp ping -c 3 postgres

# Check which networks the container is on
docker inspect --format '{{json .NetworkSettings.Networks}}' myapp | jq 'keys'

# Show port mappings
docker port myapp
```

### Step 7: Check Events

```bash
# All events in the last hour
docker events --since 1h

# Filter by container
docker events --since 1h --filter container=myapp

# Filter by event type
docker events --filter type=container --filter event=oom

# Watch events live
docker events

# Events by image
docker events --filter image=myapp:latest
```

### Step 8: Full Configuration Inspect

```bash
# Full JSON inspection
docker inspect myapp | jq .

# Specific fields
docker inspect myapp | jq '.[0].Config.Env'        # Environment variables
docker inspect myapp | jq '.[0].Mounts'             # Volume mounts
docker inspect myapp | jq '.[0].HostConfig'         # Host config (ports, limits)
docker inspect myapp | jq '.[0].NetworkSettings'    # Network information

# Image inspection
docker inspect myimage:tag | jq '.[0].Config.Cmd'
docker inspect myimage:tag | jq '.[0].Config.Entrypoint'
```

> **Note:** Do not include debugging tools in production images — they increase image size and expand the attack surface. Instead, maintain a separate debug image built from your production image plus debugging tools.

### Quick Diagnosis Reference

| Problem Symptom | First Command | Common Fix |
|---|---|---|
| Container not running | `docker ps -a` | Check exit code, check logs |
| App not responding | `docker logs myapp` | Look for errors in startup output |
| Containers cannot communicate | `docker network inspect` | Add both to the same user-defined network |
| Data not persisting | `docker inspect` (Mounts section) | Add a volume mount |
| High memory usage | `docker stats` | Add `--memory` limit |
| Slow builds | `docker build --no-cache` | Fix Dockerfile layer order |
| Port not accessible | `docker port myapp` | Add `-p` flag, check binding |
| Container keeps restarting | `docker logs myapp --tail 20` | Fix application error, check exit code |

---

## Common Docker Interview Questions

The following 15 questions cover the most important Docker topics you will encounter in engineering interviews. Each includes a concise answer, a detailed explanation, and common pitfalls to avoid.

---

**Q1. What is the difference between a Docker image and a container?**

A Docker image is an immutable, read-only template made of layered filesystems containing everything needed to run an application. A container is a running instance of that image — it adds a thin writable layer on top. Multiple containers can run from the same image simultaneously.

- **Key point:** Image = blueprint (immutable). Container = running instance (has a writable layer).
- **Red flag:** Saying "image and container are the same thing" immediately signals a foundational misunderstanding.

---

**Q2. How does Docker image layer caching work?**

Docker caches each instruction's result as a layer. On rebuild, if an instruction and its inputs are unchanged, Docker reuses the cached layer and skips re-execution. Once any layer is invalidated, all subsequent layers are rebuilt. This is why Dockerfile instruction order matters — place rarely-changing instructions (install dependencies) before frequently-changing ones (copy source code).

```dockerfile
# Good - npm install only re-runs when package.json changes
COPY package*.json ./
RUN npm ci
COPY . .   # source changes only invalidate this layer and below
```

- **Red flag:** Not structuring Dockerfiles to exploit layer caching. A 3-minute `npm install` running on every CI build is an immediate code review concern.

---

**Q3. What are multi-stage builds and why use them?**

Multi-stage builds use multiple `FROM` statements in one Dockerfile. You compile/build in a full environment, then `COPY --from=stage` only the compiled artifacts into a minimal runtime image. This keeps build tools out of the final image, dramatically reducing size and attack surface.

```dockerfile
FROM golang:1.21 AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o server .

FROM scratch AS runtime
COPY --from=builder /app/server /server
CMD ["/server"]
# Result: ~10 MB image vs ~800 MB with full Go toolchain
```

- **Red flag:** Not knowing that you can have more than two stages, or that you can target specific stages with `docker build --target=stagename`.

---

**Q4. What is the difference between CMD and ENTRYPOINT?**

`ENTRYPOINT` sets the fixed executable that always runs. `CMD` provides default arguments that can be overridden at runtime. Together: `ENTRYPOINT` is "what to run" and `CMD` is "with what default arguments." `CMD` alone is fully overridable by passing arguments to `docker run`.

```dockerfile
ENTRYPOINT ["python", "app.py"]   # always runs python app.py
CMD ["--port", "8080"]             # default arg, overridable

# docker run myapp                  → python app.py --port 8080
# docker run myapp --port 9090      → python app.py --port 9090
```

- **Red flag:** Using shell form for CMD/ENTRYPOINT (`CMD node server.js`). Shell form runs your command via `/bin/sh -c`, meaning the shell is PID 1 — not your application. SIGTERM is not forwarded, breaking graceful shutdown.

---

**Q5. What is the difference between volumes and bind mounts?**

Bind mounts link a specific host path into the container — you control the location. Named volumes are managed by Docker, stored at `/var/lib/docker/volumes/`. Named volumes are preferred in production for persistent data (databases). Bind mounts are preferred in development for live code reloading.

| Type | Storage | Best For |
|---|---|---|
| Named Volume | Docker-managed | DB data, persistent app data |
| Bind Mount | Specific host path | Development hot reload, config files |
| tmpfs | Host RAM (never on disk) | Secrets, temporary cache |

- **Red flag:** Using bind mounts in production — they create host-container coupling and can expose host files if misconfigured.

---

**Q6. Explain Docker networking — bridge, host, and overlay.**

- **bridge** (default): Isolated virtual network on the host. Containers communicate via container names on user-defined bridge networks (with automatic DNS). Requires `-p` to expose ports to the host.
- **host**: Container shares the host's network stack directly. No NAT overhead, but no network isolation. Only works on Linux.
- **overlay**: Spans multiple Docker hosts using VXLAN tunneling. Required for Docker Swarm multi-host communication.

The default bridge network does not provide automatic DNS — containers must use IPs. User-defined bridge networks resolve container names via Docker's embedded DNS at `127.0.0.11`.

- **Red flag:** Using the default bridge network in production. Default bridge has no DNS and all containers on it can communicate with each other — no isolation.

---

**Q7. What are Dockerfile best practices?**

Key best practices:

1. Use minimal base images (alpine, distroless)
2. Use multi-stage builds for compiled languages and build-step frameworks
3. Exploit layer caching — copy dependency manifests before source code
4. Use `.dockerignore` to exclude `node_modules`, `.git`, `.env`
5. Run as a non-root user (`USER node`)
6. Use exec form for CMD and ENTRYPOINT (`["node", "server.js"]`)
7. Combine `RUN` commands to minimize layers, clean up in the same instruction
8. Add `HEALTHCHECK` for production images
9. Pin base image versions — avoid `:latest`
10. Never pass secrets via `ARG` or `ENV`

---

**Q8. What does `depends_on` do in Docker Compose — does it guarantee the service is ready?**

`depends_on` controls startup order — it ensures the dependent container starts before the dependent service. By default it only waits for the container to start (`service_started`), not for the application inside to be ready.

To actually wait for a service to be ready, combine `depends_on` with `condition: service_healthy` and a proper `healthcheck`:

```yaml
api:
  depends_on:
    postgres:
      condition: service_healthy   # waits for healthcheck to pass

postgres:
  image: postgres:15
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U postgres"]
    interval: 5s
    retries: 5
```

- **Red flag:** Using `depends_on` without `condition: service_healthy` and then being surprised when the application crashes on startup because the database was not ready.

---

**Q9. How do you secure a Docker container in production?**

A hardened container uses multiple layers of defense:

```bash
docker run \
  --user 1000:1000 \              # non-root user
  --cap-drop=ALL \                # drop all capabilities
  --cap-add=NET_BIND_SERVICE \    # add only what is needed
  --read-only \                   # read-only root filesystem
  --tmpfs /tmp:size=50m \         # writable RAM-backed temp
  --no-new-privileges \           # prevent privilege escalation
  --security-opt seccomp=/etc/docker/seccomp.json \
  myapp
```

Checklist: non-root USER, no `--privileged`, `--read-only` filesystem, drop all capabilities, minimal base image, no `docker.sock` mount, scan with Trivy, use BuildKit secret mounts (never `ARG`/`ENV` for secrets).

---

**Q10. What is the difference between `docker stop` and `docker kill`?**

`docker stop` sends SIGTERM to allow graceful shutdown, waits 10 seconds (configurable), then sends SIGKILL. `docker kill` immediately sends SIGKILL without waiting.

Graceful shutdown matters: SIGTERM lets applications finish active requests, close database connections, and flush logs. Applications should handle SIGTERM explicitly. Always use `docker stop` in production scripts — `docker kill` can cause data corruption if the app is mid-write.

---

**Q11. What is BuildKit and what advantages does it provide?**

BuildKit is Docker's next-generation build engine (default since Docker 23.0). Key advantages over the classic builder:

- Parallel stage execution in multi-stage builds
- Improved layer caching (including registry-based cache)
- Secret mounts (`RUN --mount=type=secret`) — secrets are never stored in any layer
- SSH agent forwarding for private repositories
- Multi-platform builds with buildx
- Significantly faster build times

```bash
# BuildKit secret mount (secret is never baked into image)
RUN --mount=type=secret,id=npmrc \
    cp /run/secrets/npmrc ~/.npmrc && \
    npm install && \
    rm ~/.npmrc

docker build --secret id=npmrc,src=$HOME/.npmrc .
```

- **Red flag:** Not knowing BuildKit secret mounts exist, and instead passing secrets via `ARG` or `ENV`, which appear in `docker history`.

---

**Q12. How do you implement zero-downtime deployments with Docker?**

Use blue-green or rolling update strategies. The key principle: start the new container and verify it is healthy before stopping the old one — never the reverse.

```bash
# Blue-green pattern
# 1. Start new (green) container
docker run -d --name myapp-green --network app myapp:new

# 2. Health check green
docker exec myapp-green curl -sf http://localhost:3000/health

# 3. Switch traffic (update nginx upstream, then reload)
# nginx -s reload

# 4. Stop old (blue)
docker stop myapp-blue && docker rm myapp-blue
```

In Kubernetes, use rolling updates with `maxUnavailable: 0` and `maxSurge: 1` combined with readiness probes.

---

**Q13. How do you handle secrets in Docker?**

Never store secrets in `ARG`, `ENV`, or files copied into an image. The correct approaches are:

- **Build-time secrets:** Use BuildKit `--mount=type=secret` — the secret is available during the build RUN instruction but is never stored in any image layer.
- **Runtime secrets:** Inject via environment variables at `docker run` time (values are not in the image), Docker Compose secrets (mounted as files at `/run/secrets/`), or external secret managers (AWS Secrets Manager, HashiCorp Vault).

Verify: `docker history myimage` and `docker inspect myimage` should never reveal secret values.

---

**Q14. What is the difference between `docker exec` and `docker attach`?**

`docker exec` starts a new process inside a running container — it is safe for debugging. `docker attach` connects your terminal to the container's existing PID 1 process. If you press Ctrl+C while attached, you send SIGINT to PID 1 and stop the container.

Always use `docker exec -it mycontainer /bin/sh` for debugging. Use `docker attach` only when you specifically need to interact with PID 1, and detach with Ctrl+P, Ctrl+Q.

---

**Q15. How do you optimize Docker builds in CI/CD for speed?**

Five key techniques:

1. **Registry-based layer caching** — reuse layers from previous builds with `--cache-from`
2. **Dockerfile layer order** — dependency installation before source code copy
3. **BuildKit inline cache** — export cache to registry with `--cache-to type=registry,mode=max`
4. **Multi-stage parallelism** — BuildKit builds independent stages in parallel
5. **GitHub Actions/GitLab cache** — use `type=gha` cache for persistent caching between runs

```yaml
# GitHub Actions example
- uses: docker/build-push-action@v5
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

A well-optimized pipeline can reduce build times from 10 minutes to under 2 minutes.

Prepping for interviews? See [Docker Interview Questions](/learn/guides/docker-interview-questions).

---

## Complete Docker Cheat Sheet

### Container Commands

| Command | Description |
|---|---|
| `docker run -d -p 8080:80 --name app nginx` | Run detached with port mapping and name |
| `docker run -it --rm ubuntu bash` | Interactive shell, auto-remove on exit |
| `docker run -e ENV=prod --env-file .env app` | With environment variables |
| `docker run -v vol:/data --memory=512m app` | With volume and memory limit |
| `docker ps` | List running containers |
| `docker ps -a` | List ALL containers |
| `docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"` | Custom format output |
| `docker stop myapp` | Graceful stop (SIGTERM then SIGKILL) |
| `docker kill myapp` | Immediate kill (SIGKILL) |
| `docker rm myapp` | Remove stopped container |
| `docker rm -f myapp` | Force remove running container |
| `docker logs -f --tail 100 myapp` | Follow last 100 log lines |
| `docker exec -it myapp bash` | Enter container shell |
| `docker exec myapp cat /app/config.json` | Run command in container |
| `docker cp myapp:/app/file.txt ./` | Copy file from container |
| `docker cp ./file.txt myapp:/app/` | Copy file to container |
| `docker stats --no-stream` | Snapshot resource usage |
| `docker top myapp` | Show processes in container |
| `docker inspect myapp` | Full container JSON information |
| `docker inspect --format '{{.NetworkSettings.IPAddress}}' myapp` | Get container IP |
| `docker update --restart=always --memory=1g myapp` | Update running container settings |
| `docker rename myapp newname` | Rename container |
| `docker pause myapp` | Freeze container |
| `docker unpause myapp` | Unfreeze container |
| `docker container prune` | Remove all stopped containers |
| `docker events --filter type=container` | Live container events |

### Image Commands

| Command | Description |
|---|---|
| `docker pull nginx:1.25-alpine` | Pull specific tag |
| `docker pull ubuntu@sha256:abc123` | Pull by digest (immutable) |
| `docker images` | List local images |
| `docker build -t myapp:v1.0 .` | Build from Dockerfile in current directory |
| `docker build -f Dockerfile.prod -t myapp:prod .` | Use specific Dockerfile |
| `docker build --no-cache -t myapp .` | Force fresh build |
| `docker build --build-arg NODE_ENV=prod -t myapp .` | With build argument |
| `docker build --target production -t myapp .` | Build specific stage |
| `docker tag myapp:latest registry/myapp:v1.0` | Tag for registry |
| `docker push registry/myapp:v1.0` | Push to registry |
| `docker rmi myapp:latest` | Remove image |
| `docker history myapp` | Show image layers |
| `docker history --no-trunc myapp` | Full layer commands |
| `docker inspect myapp` | Image JSON details |
| `docker save -o myapp.tar myapp:latest` | Export to tar archive |
| `docker load -i myapp.tar` | Import from tar archive |
| `docker image prune` | Remove dangling images |
| `docker image prune -a` | Remove all unused images |
| `docker system df` | Disk usage summary |
| `docker system prune -af --volumes` | Full cleanup of all unused resources |

### Network Commands

| Command | Description |
|---|---|
| `docker network ls` | List networks |
| `docker network create mynet` | Create bridge network |
| `docker network create --internal secure` | Internal network (no internet access) |
| `docker network inspect mynet` | Network details |
| `docker network connect mynet mycontainer` | Connect running container to network |
| `docker network disconnect mynet mycontainer` | Disconnect container from network |
| `docker network rm mynet` | Remove network |
| `docker network prune` | Remove unused networks |
| `docker run --network mynet myapp` | Run in specific network |
| `docker run --network host myapp` | Use host network |
| `docker run --network none myapp` | No networking |
| `docker run -p 8080:80 myapp` | Publish port |
| `docker run -p 127.0.0.1:8080:80 myapp` | Bind to localhost only |
| `docker port myapp` | Show port mappings |

### Volume Commands

| Command | Description |
|---|---|
| `docker volume create mydata` | Create named volume |
| `docker volume ls` | List volumes |
| `docker volume inspect mydata` | Volume details |
| `docker volume rm mydata` | Remove volume |
| `docker volume prune` | Remove unused volumes |
| `docker run -v mydata:/app/data myapp` | Mount named volume |
| `docker run -v $(pwd):/app myapp` | Bind mount current directory |
| `docker run -v /app/node_modules myapp` | Anonymous volume |
| `docker run --mount type=volume,source=mydata,target=/data myapp` | Mount syntax |
| `docker run --mount type=bind,source=$(pwd),target=/app myapp` | Bind mount syntax |
| `docker run --mount type=tmpfs,target=/tmp myapp` | tmpfs mount |
| `docker run -v /host/path:/container/path:ro myapp` | Read-only mount |

### Docker Compose Commands

| Command | Description |
|---|---|
| `docker compose up -d` | Start all services detached |
| `docker compose up -d --build` | Rebuild and start |
| `docker compose up -d --scale api=3` | Start with 3 api replicas |
| `docker compose down` | Stop and remove containers and networks |
| `docker compose down -v` | Also remove volumes (destructive — use with care) |
| `docker compose ps` | List services |
| `docker compose logs -f api` | Follow api logs |
| `docker compose exec api bash` | Shell into running service |
| `docker compose run --rm api npm test` | One-off command in new container |
| `docker compose build --no-cache` | Force rebuild |
| `docker compose pull` | Pull latest images |
| `docker compose config` | Validate and show resolved configuration |
| `docker compose restart api` | Restart specific service |
| `docker compose --profile dev up -d` | Start with profile |
| `docker compose -f base.yml -f prod.yml up -d` | Multiple compose files |

### Dockerfile Quick Reference

| Instruction | Syntax | Purpose |
|---|---|---|
| `FROM` | `FROM node:18-alpine AS builder` | Base image |
| `LABEL` | `LABEL version="1.0" maintainer="x@y.com"` | Metadata |
| `RUN` | `RUN apt-get update && apt-get install -y curl` | Execute during build |
| `CMD` | `CMD ["node", "server.js"]` | Default command (overridable) |
| `ENTRYPOINT` | `ENTRYPOINT ["npm", "start"]` | Fixed executable |
| `COPY` | `COPY --chown=node:node . /app` | Copy files from build context |
| `ADD` | `ADD archive.tar.gz /app/` | Copy and auto-extract archives |
| `WORKDIR` | `WORKDIR /app` | Set working directory |
| `ENV` | `ENV NODE_ENV=production PORT=3000` | Runtime environment variable |
| `ARG` | `ARG NODE_VERSION=18` | Build-time variable only |
| `EXPOSE` | `EXPOSE 3000` | Document port (does not publish) |
| `VOLUME` | `VOLUME /app/data` | Declare mount point |
| `USER` | `USER node` | Switch to non-root user |
| `HEALTHCHECK` | `HEALTHCHECK --interval=30s CMD curl -f http://localhost/health` | Health monitoring |
| `STOPSIGNAL` | `STOPSIGNAL SIGQUIT` | Override stop signal |

### Power One-Liners

| One-liner | Purpose |
|---|---|
| `docker system prune -af --volumes` | Complete cleanup |
| `docker stop $(docker ps -q)` | Stop all running containers |
| `docker rm $(docker ps -aq)` | Remove all containers |
| `docker rmi $(docker images -q)` | Remove all images |
| `docker rm $(docker ps -aq -f status=exited)` | Remove only exited containers |
| `docker inspect --format '{{.NetworkSettings.IPAddress}}' myapp` | Get container IP |
| `docker inspect --format '{{.State.ExitCode}}' myapp` | Get exit code |
| `docker logs myapp 2>&1 \| grep -i error` | Filter error logs |
| `docker logs --since 1h --tail 100 myapp` | Recent logs |
| `docker events --filter 'event=die'` | Watch for container deaths |
| `docker images --format "{{.Size}}\t{{.Repository}}:{{.Tag}}" \| sort -h` | Sort images by size |
| `docker run --rm -v $(pwd):/app node:18-alpine npm install` | Run npm install via Docker |
| `docker exec myapp env` | List container environment variables |
| `docker diff myapp` | Show filesystem changes in container |

---

## Production Workflows

Real-world Docker workflows used daily in production environments.

### Daily DevOps Docker Checklist

```bash
# ===== Morning Health Check =====
docker ps                                    # Are all containers running?
docker stats --no-stream                     # Is resource usage normal?
docker logs myapp --since 8h | grep -iE 'error|fatal|panic'  # Overnight errors?
df -h /var/lib/docker                        # Is disk space OK?

# ===== Deployment Workflow =====
# 1. Build
VERSION=$(git describe --tags --always)
docker build -t myapp:$VERSION .

# 2. Test
docker run --rm myapp:$VERSION npm test

# 3. Tag and push
docker tag myapp:$VERSION registry/myapp:$VERSION
docker push registry/myapp:$VERSION

# 4. Deploy (rolling update on server)
docker pull registry/myapp:$VERSION
docker stop myapp-old || true
docker rename myapp myapp-old || true
docker run -d \
  --name myapp \
  --restart unless-stopped \
  -p 80:3000 \
  registry/myapp:$VERSION

# 5. Verify
sleep 5 && docker ps | grep myapp
curl -f http://localhost:80/health

# 6. Clean up old container
docker rm myapp-old
```

### Rollback Workflow

```bash
PREV_VERSION="v1.2.2"
docker pull registry/myapp:$PREV_VERSION
docker stop myapp && docker rm myapp
docker run -d --name myapp registry/myapp:$PREV_VERSION
```

> **Caution:** Never run `docker rmi` on the last known-good image until the new deployment has been stable for at least 30 minutes. Tag the last working image as `:stable` or `:prev` to enable instant rollback.

### Monthly Maintenance

```bash
# Clean up unused resources older than 30 days
docker system prune -a --filter "until=720h"
docker volume prune -f

# Update base images and rebuild with latest security patches
docker pull node:18-alpine
docker build --no-cache .
```

### Zero-Downtime Deployment Pattern

```bash
#!/bin/bash
# zero-downtime-deploy.sh
set -e

NEW_IMAGE="registry/myapp:$1"
CONTAINER_NAME="myapp"
BLUE="${CONTAINER_NAME}-blue"
GREEN="${CONTAINER_NAME}-green"

echo "Pulling new image..."
docker pull $NEW_IMAGE

# Determine which container is active
if docker ps | grep -q $BLUE; then
  ACTIVE=$BLUE; INACTIVE=$GREEN
else
  ACTIVE=$GREEN; INACTIVE=$BLUE
fi

echo "Starting $INACTIVE..."
docker run -d --name $INACTIVE --network app $NEW_IMAGE

# Health check loop
for i in {1..30}; do
  if docker exec $INACTIVE curl -sf http://localhost:3000/health; then
    echo "Health check passed!"
    break
  fi
  sleep 2
done

# Switch traffic (update nginx/load balancer upstream here)
echo "Switching traffic to $INACTIVE..."

# Stop old container
docker stop $ACTIVE && docker rm $ACTIVE
echo "Deployment complete! Active: $INACTIVE"
```

### Incident Response Commands

```bash
# Container crashed — investigate
docker logs myapp --tail 200
docker inspect myapp | jq '.[0].State'  # Check exit code, OOMKilled flag
docker events --since 1h

# High CPU or Memory
docker stats --no-stream
docker exec myapp top

# Network issues
docker exec myapp curl -v http://db:5432
docker network inspect myapp_default
```

---

## Docker Compose Patterns

Battle-tested Compose patterns used in real production environments.

### Pattern 1: Base + Override (Development vs Production)

The most common pattern — one base file with environment-specific overrides.

```yaml
# docker-compose.yml (base — committed to git)
services:
  api:
    image: ${REGISTRY:-myapp}/api:${TAG:-latest}
    ports: ["3000:3000"]
    networks: [app]
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes: [pgdata:/var/lib/postgresql/data]
    networks: [app]
  redis:
    image: redis:7-alpine
    networks: [app]

volumes:
  pgdata:

networks:
  app:
```

```yaml
# docker-compose.override.yml (development overrides — add to .gitignore)
# Auto-loaded when you run: docker compose up
services:
  api:
    build: .                          # Build locally instead of pulling
    volumes:
      - .:/app                        # Live code reload
      - /app/node_modules             # Preserve installed node_modules
    environment:
      DEBUG: "true"
      NODE_ENV: development
      DATABASE_URL: postgres://user:pass@db:5432/myapp
    command: npm run dev              # Use dev server with hot reload
  # Development-only extras
  mailhog:
    image: mailhog/mailhog
    ports: ["8025:8025"]             # Fake email server for testing
  redis-ui:
    image: rediscommander/redis-commander
    ports: ["8081:8081"]
    profiles: [debug]                 # Only starts with --profile debug
```

```yaml
# docker-compose.prod.yml (production overrides)
services:
  api:
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
        reservations:
          cpus: "0.25"
          memory: 256M
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
  nginx:
    image: nginx:1.25-alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx/prod.conf:/etc/nginx/conf.d/default.conf:ro
      - ./ssl:/etc/ssl:ro
    networks: [app]
    restart: unless-stopped
```

```bash
# Development (auto-loads override file)
docker compose up -d

# Production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Validate the merged configuration
docker compose -f docker-compose.yml -f docker-compose.prod.yml config
```

### Pattern 2: Microservices with Profiles

```yaml
services:
  # Core services (always start)
  gateway:
    image: myapp/gateway:latest
    ports: ["80:80"]
    networks: [app]

  auth-service:
    image: myapp/auth:latest
    networks: [app]

  # Optional services — start only with a profile
  monitoring:
    image: prom/prometheus
    profiles: [monitoring]
    volumes: [./prometheus.yml:/etc/prometheus/prometheus.yml]
    ports: ["9090:9090"]
    networks: [app]

  grafana:
    image: grafana/grafana
    profiles: [monitoring]
    ports: ["3001:3000"]
    networks: [app]

  # Integration test dependencies
  test-db:
    image: postgres:15-alpine
    profiles: [testing]
    environment:
      POSTGRES_DB: testdb
      POSTGRES_PASSWORD: testpass

networks:
  app:
```

```bash
# Start core services only
docker compose up -d

# Start with monitoring stack
docker compose --profile monitoring up -d

# Start with testing dependencies
docker compose --profile testing up -d

# Start everything
docker compose --profile monitoring --profile testing up -d
```

### Pattern 3: Dependency Management with Health Checks

```yaml
services:
  db:
    image: postgres:15-alpine
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d myapp"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      retries: 3

  api:
    build: .
    depends_on:
      db:
        condition: service_healthy    # Wait for db health check to pass
      redis:
        condition: service_healthy    # Wait for redis health check to pass
    environment:
      DATABASE_URL: postgres://user:pass@db:5432/myapp
      REDIS_URL: redis://redis:6379
```

> **Note:** Plain `depends_on` only waits for the container to start — not for the service inside to be ready. Always combine with `condition: service_healthy` and a proper `healthcheck` block to avoid startup race conditions.

---

## Docker Tools Ecosystem

Essential tools that every Docker practitioner should know.

### Portainer — Web GUI

Web-based interface for managing Docker containers, images, networks, and volumes. Ideal for teams and for environments where a GUI is preferred.

```bash
docker volume create portainer_data
docker run -d \
  -p 9000:9000 \
  --name portainer \
  --restart always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
# Visit: http://localhost:9000
```

### Lazydocker — Terminal UI

Terminal UI for Docker. View containers, logs, stats, and images interactively without typing commands.

```bash
curl https://raw.githubusercontent.com/jesseduffield/lazydocker/master/scripts/install_via_bash.sh | bash
lazydocker
```

### dive — Image Layer Analyzer

Inspect Docker image layers interactively. Identify which files are added at each layer and find what is bloating image size.

```bash
# Ubuntu
sudo snap install dive
# macOS
brew install dive
# Analyze any image
dive myapp:latest
```

### hadolint — Dockerfile Linter

Lint your Dockerfiles for best practice violations, security issues, and layer ordering problems.

```bash
# Run via Docker (no installation required)
docker run --rm -i hadolint/hadolint < Dockerfile

# Install locally on macOS
brew install hadolint

hadolint Dockerfile
```

### Trivy — Security Scanner

Comprehensive vulnerability scanner for container images. Detects CVEs in OS packages, language dependencies, and misconfigurations.

```bash
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh

# Scan image for HIGH and CRITICAL CVEs only
trivy image --severity HIGH,CRITICAL myapp:latest

# Fail CI on CRITICAL findings
trivy image --exit-code 1 --severity CRITICAL myapp:latest

# Scan a Dockerfile for misconfigurations
trivy config Dockerfile
```

### Watchtower — Automatic Container Updates

Automatically updates running containers when new images are pushed to the registry. Recommended for development and staging environments only.

```bash
docker run -d \
  --name watchtower \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower \
  --interval 86400   # Check daily
```

### ctop — Container Resource Monitor

Real-time CPU, memory, network, and I/O metrics in a clean terminal interface — like `htop` for Docker.

```bash
# macOS
brew install ctop

# Any OS via Docker
docker run --rm -ti \
  --name ctop \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  quay.io/vektorlab/ctop
```

### Tools Comparison

| Tool | Type | Best For | Free? |
|---|---|---|---|
| Portainer | Web GUI | Team management, beginners | Yes (CE) |
| Lazydocker | Terminal UI | Developers, quick inspection | Yes |
| dive | CLI | Image size optimization | Yes |
| hadolint | Linter | Dockerfile quality in CI | Yes |
| trivy | Security | CVE scanning, compliance | Yes |
| watchtower | Daemon | Auto-updates (dev/staging) | Yes |
| ctop | TUI | Real-time monitoring | Yes |
| Docker Desktop | GUI | Mac/Windows developers | Freemium |
| VS Code Extension | IDE | Development workflow | Yes |

> **Tip:** Recommended starter stack — install **Lazydocker** for daily use, **dive** to check image size before every push, and integrate **hadolint** and **trivy** into your CI/CD pipeline. These four tools will catch most common issues automatically.

---

## Further Learning Resources

### Top Learning Resources

| Resource | Type | URL | Why It Is Valuable |
|---|---|---|---|
| Docker Official Docs | Documentation | `docs.docker.com` | Authoritative source, updated with every release |
| Play with Docker | Interactive Lab | `labs.play-with-docker.com` | Free browser-based Docker playground — no installation needed |
| TechWorld with Nana | YouTube | `youtube.com/@TechWorldwithNana` | Best free Docker course on YouTube, extremely clear explanations |
| Bret Fisher | YouTube / Course | `youtube.com/@BretFisher` | Deep DevOps focus, Docker Swarm, real-world production tips |
| KodeKloud | Course Platform | `kodekloud.com` | Hands-on browser labs, great for beginners, Kubernetes learning path |
| Docker Deep Dive (Nigel Poulton) | Book | Amazon / Leanpub | Best Docker book — concise, practical, updated regularly |
| awesome-docker | GitHub List | `github.com/veggiemonk/awesome-docker` | Curated list of Docker tools, tutorials, and resources |
| Docker Official Blog | Blog | `docker.com/blog` | Latest Docker updates, best practices, case studies |
| Ivan Velichko's Blog | Blog | `iximiuz.com` | Deep internals: containers, namespaces, cgroups explained with clarity |

### 4-Week Practice Plan

```
Week 1: Install Docker, run official images (nginx, postgres, redis, ubuntu)
        → docker run, docker ps, docker logs, docker exec
        → Understand port mapping, volume mounting, environment variables

Week 2: Write Dockerfiles for your existing React/Node projects
        → .dockerignore, layer caching, multi-stage builds
        → Optimize: get below 200 MB for your application image

Week 3: Docker Compose — build a full MERN/PERN stack locally
        → depends_on, healthchecks, named volumes
        → Development vs production compose files, profiles

Week 4: Security, multi-stage builds, push to ECR, deploy to ECS/Fargate
        → Non-root USER, trivy scan, hadolint check
        → GitHub Actions pipeline: build → push → deploy
```

### Certification Paths

**Docker Certified Associate (DCA)**
Official Docker certification covering installation, configuration, networking, security, and orchestration. A solid credential for validating foundational knowledge.
Format: 55 MCQ, 90 minutes | Cost: approximately $195 USD

**CKA — Certified Kubernetes Administrator**
The natural next step after mastering Docker. Kubernetes is Docker at scale, and your Docker knowledge maps directly to Kubernetes concepts.
Format: Hands-on practical exam, 2 hours | Cost: approximately $395 USD

**AWS Solutions Architect**
Includes deep coverage of ECS, Fargate, ECR, and EKS. Highly valued in the job market for senior DevOps and cloud engineering roles.
Format: 65 MCQ, 130 minutes | Cost: approximately $150 USD

---

## What's Next? Your Docker Mastery Roadmap

You now have the knowledge — the next step is execution. Here is a precise 30-day plan to go from Docker learner to production-ready DevOps engineer.

### 30-Day Docker Mastery Plan

| Days | Topic | Task / Goal |
|---|---|---|
| 1–2 | Installation and First Steps | Install Docker on Ubuntu, run hello-world, nginx, postgres — understand what each does |
| 3–5 | Container Commands | Practice all docker run flags, docker logs, exec, inspect, stats — build muscle memory |
| 6–8 | Images Deep Dive | Pull images, run docker history, inspect layers with dive, understand image size |
| 9–12 | Dockerfile Mastery | Write Dockerfiles for React, Node.js, and Python apps from scratch |
| 13–15 | Multi-Stage Builds | Optimize your apps: push image size from 1 GB down to 100 MB or less |
| 16–18 | Networking | Create custom networks, wire up MERN stack containers, test DNS resolution |
| 19–21 | Volumes and Persistence | Database persistence across restarts, dev bind mounts, tmpfs for secrets |
| 22–25 | Docker Compose | Full stack with Compose: health checks, depends_on, dev/prod override files, profiles |
| 26–27 | Security Hardening | Non-root USER, trivy scan (zero HIGH/CRITICAL), hadolint (zero warnings), secrets management |
| 28–29 | CI/CD Pipeline | GitHub Actions: auto-build on push → push to Docker Hub or ECR → deploy to server |
| 30 | AWS Deployment | Push to ECR, create ECS task definition, deploy to Fargate — live in production |

### Docker to Kubernetes Transition Map

Every Docker concept has a direct Kubernetes equivalent. Your Docker knowledge is your Kubernetes head start.

| Docker Concept | Kubernetes Equivalent | Notes |
|---|---|---|
| `Container` | `Pod` (wraps one or more containers) | Pods are the smallest deployable unit in Kubernetes |
| `docker run` | `kubectl run` / Deployment | Deployments add replicas, rollouts, rollbacks |
| `docker-compose.yml` | Deployment + Service YAML | Compose maps to multiple Kubernetes manifest files |
| `Docker network` | Service + NetworkPolicy | Kubernetes Services provide stable DNS endpoints for pods |
| `Docker volume` | PersistentVolume (PV/PVC) | PVCs allow dynamic storage provisioning |
| `docker compose up` | `kubectl apply -f` | Declarative — Kubernetes reconciles desired state |
| `Docker Swarm service` | Deployment with replicas | Kubernetes has much more sophisticated scheduling |
| `HEALTHCHECK` | readinessProbe + livenessProbe | Kubernetes has separate readiness, liveness, and startup probes |
| `docker secret` | Kubernetes Secret | Kubernetes Secrets can be mounted as files or environment variables |
| `--env-file` | ConfigMap + Secret | ConfigMaps for non-sensitive config, Secrets for sensitive values |

Need to plan resource requests for Kubernetes? Use the [Kubernetes Resource Calculator](/kubernetes-resource-calculator).

### Portfolio Projects for Senior DevOps Roles

Build these five projects to make your GitHub profile stand out to technical recruiters:

1. **Dockerized MERN Stack** — Full MERN (MongoDB, Express, React, Node) stack with Docker Compose. Proper health checks, named volumes, multi-stage build for React. Include a detailed README with an architecture diagram.

2. **CI/CD Pipeline** — GitHub Actions workflow that automatically builds an image on push to main, runs tests, pushes to ECR with a version tag, and deploys to ECS/Fargate. Include a rollback workflow.

3. **Microservices Application** — Three or more services (auth, products, orders) each in separate containers with an API gateway. Service discovery via Docker DNS, isolated databases, event-driven communication.

4. **Security-Hardened Image** — Dockerfile that passes a trivy scan with zero HIGH/CRITICAL CVEs, passes hadolint with zero warnings, runs as a non-root user, and uses multi-stage builds. Include scan reports in the README.

5. **Monitoring Stack** — Application with Prometheus, Grafana, and Alertmanager in Docker Compose. Custom dashboards showing container metrics, application metrics, and alerting rules.

### Moving Forward

Completing this guide means you can confidently write production-grade Dockerfiles, deploy multi-container applications with Compose, use AWS ECR and ECS with Fargate, follow Docker security best practices, and tackle DevOps interviews with confidence.

Your Docker knowledge is the foundation for everything in modern DevOps. The concepts of containers, immutable images, service isolation, and declarative configuration carry directly into the Kubernetes ecosystem.

Ready to orchestrate at scale? Continue with [Kubernetes for DevOps](/learn/guides/kubernetes-for-devops).
