---
title: "DevOps Projects: Hands-On Guides to Build Your Portfolio"
description: "Build real DevOps portfolio projects step by step: deploy a containerized app on EC2, a Docker Compose stack, automated deploy with monitoring, and a CI/CD pipeline."
track: projects
order: 1
difficulty: beginner
estMinutes: 75
updatedDate: 2026-06-27
tags: ["devops", "projects", "portfolio", "ci-cd", "docker", "aws"]
relatedTools: ["docker-run-to-compose", "github-actions-validator", "prometheus-relabel-tester"]
seoTitle: "Hands-On DevOps Projects (Step-by-Step)"
metaDescription: "Build real DevOps portfolio projects: deploy a containerized app on EC2, Docker Compose, a CI/CD pipeline, and monitoring. Free, step-by-step guides."
faqs:
  - q: "What are good DevOps projects to put on a resume?"
    a: "Projects that show the full delivery loop: deploying a containerized app to a cloud VM, a multi-service Docker Compose stack, a CI/CD pipeline, and monitoring with Prometheus/Grafana."
  - q: "How do I deploy a containerized app on an EC2 instance?"
    a: "Launch an EC2 instance, install Docker, build or pull your image, run the container with the right ports and env, and put it behind a reverse proxy or security group rules. This guide walks through it."
  - q: "How do I build a CI/CD pipeline with GitHub Actions and Docker?"
    a: "On push, a workflow builds the Docker image, runs tests, pushes to a registry, then deploys to the server over SSH. The mini-pipeline project here shows a working example."
  - q: "What DevOps projects help me land my first job?"
    a: "Employers want evidence you can ship and operate software: a deployed app with a public URL, a reproducible pipeline, and basic monitoring/alerting beat tutorials-only knowledge."
  - q: "How do I set up Prometheus and Grafana monitoring for a project?"
    a: "Run Prometheus to scrape your app/exporters, run Grafana for dashboards, and wire alert rules. The monitoring project covers a Docker Compose setup."
  - q: "How many projects do I need for a DevOps portfolio?"
    a: "Three to four well-documented, end-to-end projects with READMEs and architecture notes are more convincing than many shallow ones."
---

Four portfolio-worthy projects that progressively weave together Linux, Networking, Docker, and AWS. Every command is real and copy-pasteable — no placeholders, no hand-waving. The path: one container on one server → a multi-container stack behind nginx → an automated monitored deploy → a full mini CI/CD pipeline with rollback. By Project 4 you will see exactly how the four skills click together. Not sure where to start? Follow the [DevOps roadmap](/learn/roadmaps/devops/) first.

New to the fundamentals? Start with [Docker for DevOps](/learn/guides/docker-for-devops/) and [AWS for DevOps Engineers](/learn/guides/aws-for-devops-engineers/).

> **Note:** Treat each project like a ticket you would get on the job: read "What you'll build", study the architecture, then work the steps top to bottom. Push every project to GitHub with the README template provided — that repo *is* your interview portfolio.

---

## Project 1 — Deploy a Containerized Web App on a Single EC2

> **Real-World Example:** This is exactly how a 2-person startup ships its first product. No Kubernetes, no fancy CI/CD — just one Linux box on AWS running a container, reachable from the internet. Think of it as your app's "garage phase". Stripe, GitHub, basically everyone started on a single server. You learn the full path: from *"code on my laptop"* to *"a stranger in another country can open my URL"*. Master this and the rest of DevOps is just adding layers on top.

This is the highest-value project in the portfolio for learning the complete end-to-end deploy path. Mastering it — the EC2 instance, Docker container, security group, OS firewall, and Elastic IP — gives you the foundation everything else builds on.

### What you'll build

A small web app (a Node.js HTTP server) packaged into a Docker image, running as a container on a single Ubuntu 24.04 EC2 instance, exposed to the world on port 80, with a hardened OS, a properly-scoped security group, and a stable Elastic IP you could point a real domain at.

> **Tip:** Your container is like a built React bundle — a frozen, reproducible artifact. The EC2 instance is the "computer" that serves it. The security group is the **bouncer** at the club door deciding who gets in. Docker is the **tiffin box** — your app plus everything it needs to run, sealed, so it behaves identically on your laptop and on AWS. "It works on my machine" dies here.

### Prerequisites and time estimate

| You need | Notes |
|---|---|
| AWS account (free tier active) | t3.micro is free-tier eligible for 12 months in most regions; otherwise ~$7–8/mo if left running 24×7. |
| Linux basics | cd, ls, sudo, editing files with nano/vim. |
| Networking basics | What an IP, port, and firewall are. |
| Docker installed locally (optional) | Nice for testing the build before you push to EC2, but you can build on the server too. |
| Terminal with SSH | Mac/Linux built-in; Windows use PowerShell or WSL. |

**Time:** ~3–4 hours total. Don't rush the security group / firewall step — that's where 80% of beginners get stuck and it's the most interview-relevant part.

### Architecture

Two firewalls stack here: the **security group** (AWS network-level, outside the box) and **ufw** (inside the OS). Defense in depth — both must allow a port for traffic to actually reach your container.

```
Internet → User browser
        → Elastic IP (static public IPv4)
        → Security Group (allow 22 from your IP, allow 80 from 0.0.0.0/0)
        → EC2 Ubuntu 24.04 (t3.micro)
        → ufw firewall (OS-level, second layer)
        → Docker container (node app on :3000 → host :80)
```

<figure class="dgm" role="img" aria-label="Architecture: User browser reaches an EC2 instance running a Docker container via Elastic IP and layered firewalls">
<svg viewBox="0 0 680 160" width="680" height="160" xmlns="http://www.w3.org/2000/svg">
  <!-- Browser -->
  <rect x="10" y="56" width="90" height="48" rx="7" fill="none" class="dgm-stroke" stroke-width="1.5"/>
  <text x="55" y="77" text-anchor="middle" font-size="11" class="dgm-ink">User</text>
  <text x="55" y="93" text-anchor="middle" font-size="11" class="dgm-ink">Browser</text>
  <!-- Arrow 1 -->
  <line x1="100" y1="80" x2="128" y2="80" class="dgm-ink-stroke" stroke-width="1.5" fill="none"/>
  <polygon points="128,76 136,80 128,84" class="dgm-ink"/>
  <!-- Elastic IP -->
  <rect x="136" y="56" width="90" height="48" rx="7" class="dgm-accent-soft" fill="none" stroke-width="0"/>
  <rect x="136" y="56" width="90" height="48" rx="7" fill="none" class="dgm-accent-stroke" stroke-width="1.5"/>
  <text x="181" y="77" text-anchor="middle" font-size="11" class="dgm-ink">Elastic IP</text>
  <text x="181" y="93" text-anchor="middle" font-size="10" class="dgm-muted">(static)</text>
  <!-- Arrow 2 -->
  <line x1="226" y1="80" x2="254" y2="80" class="dgm-ink-stroke" stroke-width="1.5" fill="none"/>
  <polygon points="254,76 262,80 254,84" class="dgm-ink"/>
  <!-- Security Group -->
  <rect x="262" y="44" width="100" height="72" rx="7" fill="none" class="dgm-stroke" stroke-width="1.5"/>
  <text x="312" y="66" text-anchor="middle" font-size="10" class="dgm-muted">Security</text>
  <text x="312" y="80" text-anchor="middle" font-size="10" class="dgm-muted">Group</text>
  <text x="312" y="96" text-anchor="middle" font-size="9" class="dgm-muted">22 (my IP)</text>
  <text x="312" y="108" text-anchor="middle" font-size="9" class="dgm-muted">80 (0.0.0.0/0)</text>
  <!-- Arrow 3 -->
  <line x1="362" y1="80" x2="390" y2="80" class="dgm-ink-stroke" stroke-width="1.5" fill="none"/>
  <polygon points="390,76 398,80 390,84" class="dgm-ink"/>
  <!-- EC2 box -->
  <rect x="398" y="32" width="130" height="96" rx="7" class="dgm-surface-2" fill="none" stroke-width="0"/>
  <rect x="398" y="32" width="130" height="96" rx="7" fill="none" class="dgm-stroke" stroke-width="2"/>
  <text x="463" y="52" text-anchor="middle" font-size="10" class="dgm-muted">EC2 Ubuntu 24.04</text>
  <!-- ufw inside EC2 -->
  <rect x="408" y="58" width="50" height="30" rx="6" fill="none" class="dgm-accent-stroke" stroke-width="1.5"/>
  <text x="433" y="77" text-anchor="middle" font-size="10" class="dgm-ink">ufw</text>
  <!-- Arrow inside EC2 -->
  <line x1="458" y1="73" x2="468" y2="73" class="dgm-ink-stroke" stroke-width="1.5" fill="none"/>
  <polygon points="468,70 474,73 468,76" class="dgm-ink"/>
  <!-- Docker container inside EC2 -->
  <rect x="474" y="56" width="46" height="34" rx="6" class="dgm-accent-soft" fill="none" stroke-width="0"/>
  <rect x="474" y="56" width="46" height="34" rx="6" fill="none" class="dgm-accent-stroke" stroke-width="1.5"/>
  <text x="497" y="72" text-anchor="middle" font-size="9" class="dgm-ink">Docker</text>
  <text x="497" y="84" text-anchor="middle" font-size="9" class="dgm-ink">:3000</text>
  <!-- port label -->
  <text x="463" y="120" text-anchor="middle" font-size="9" class="dgm-muted">host :80 → container :3000</text>
</svg>
<figcaption>Browser traffic flows through an Elastic IP and dual-layer firewalls (Security Group and ufw) to the Docker container running inside the EC2 instance.</figcaption>
</figure>

### Services and ports

| Port | Service | Source | Why |
|---|---|---|---|
| 22/tcp | SSH | Your IP only (e.g. 203.0.113.5/32) | Admin access. Never open SSH to 0.0.0.0/0. |
| 80/tcp | HTTP (your app) | 0.0.0.0/0 (anywhere) | It's a public website; everyone reaches it. |
| 443/tcp | HTTPS | 0.0.0.0/0 (later) | Add when you put TLS in front. |
| 3000/tcp | Node app (inside container) | localhost only — NOT in the SG | Docker maps host 80 → container 3000. Never expose 3000 publicly. |

### IAM and permissions

| Identity | Permission needed | Note |
|---|---|---|
| Your IAM user (laptop/CLI) | ec2:RunInstances, ec2:\*SecurityGroup\*, ec2:AllocateAddress, ec2:AssociateAddress, ec2:CreateTags | Use an IAM user with these via a policy — never your root account for daily work. |
| EC2 instance role (optional now) | None required for this project | In later projects you'll attach a role so the instance can pull from ECR / read SSM params without storing keys. |
| Key pair | SSH private key (.pem) | This is not IAM — it's the SSH credential. Keep it chmod 400 and out of git. |

> **Tip:** Tag every resource the moment you create it: `Name=web01`, `Environment=dev`, `Owner=pushkar`. Untagged resources are how startups end up with a $400 bill from a forgotten instance nobody can identify. Tags = accountability + cost attribution.

### Step 1 — Launch the EC2 instance

Easiest path first: the AWS Console. EC2 → Launch instance → name it `web01` → choose **Ubuntu Server 24.04 LTS** → instance type **t3.micro** → create/select a key pair (download the `.pem`) → for now let the wizard create a security group (you'll lock it down in Step 5). Add tags `Environment=dev`, `Owner=pushkar`.

For the CLI-minded — the same thing, scriptable and repeatable:

```bash
# Find the latest official Ubuntu 24.04 AMI for your region
aws ec2 describe-images \
  --owners 099720109477 \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*" \
            "Name=state,Values=available" \
  --query 'reverse(sort_by(Images, &CreationDate))[0].ImageId' \
  --output text
```

```bash
# Launch it (swap in the AMI id from above and your key name)
aws ec2 run-instances \
  --image-id ami-xxxxxxxxxxxxxxxxx \
  --instance-type t3.micro \
  --key-name my-key \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=web01},{Key=Environment,Value=dev},{Key=Owner,Value=pushkar}]' \
  --query 'Instances[0].InstanceId' --output text
```

> **Tip:** Why **t3.micro** and not t2.micro? t3 is the newer generation — faster baseline, same free-tier eligibility in most regions, and "burstable" so it's snappy for a tiny app. Why **Ubuntu 24.04 LTS**? "LTS" = Long Term Support (5 yrs) — stable, huge community, and almost every tutorial assumes it. Predictability > novelty in infra.

> **Caution:** Free tier covers **750 hours/month of t3.micro** — basically one instance running full-time. Spin up two and you blow past it. When you're done for the day, **Stop** the instance (you stop paying for compute; you still pay a few cents for the EBS disk). `aws ec2 stop-instances --instance-ids i-xxxx`.

> **Note:** "What's the difference between stop and terminate?" **Stop** = power off, keep the disk & data, restart later (public IP changes unless you use an EIP). **Terminate** = delete the instance and (by default) its root volume — gone forever. Knowing this cold signals you've actually run things, not just read about them.

### Step 2 — SSH into the box

Grab the instance's public IP from the console (or CLI), then connect. The default login user for Ubuntu AMIs is `ubuntu`.

```bash
# Lock down the key file — SSH REFUSES keys that are world-readable
chmod 400 my-key.pem

# Connect (replace with your IP)
ssh -i my-key.pem ubuntu@<public-ip>
```

> **Caution:** If SSH yells `UNPROTECTED PRIVATE KEY FILE`, you skipped `chmod 400`. SSH treats a private key like a house key — if anyone else on the machine can read it, SSH assumes it's compromised and refuses. Run the chmod and retry.

> **Tip:** SSH key auth is a **matched lock & key**. AWS put your *public* key (the lock) on the server at launch. Your `.pem` is the *private* key (the only key that opens it). No key = no entry. This is why password login is off by default — passwords get brute-forced, keys effectively can't.

### Step 3 — Basic OS hardening

A fresh server on a public IP gets scanned by bots within minutes. Harden before you put anything on it. Run these *on the EC2 box*.

```bash
# 1. Patch everything
sudo apt update && sudo apt -y upgrade

# 2. OS firewall (ufw): default-deny, then allow only what we need
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH        # keeps your SSH session alive!
sudo ufw allow 80/tcp         # the web app
sudo ufw --force enable
sudo ufw status verbose
```

```bash
# 3. Disable SSH password auth (force key-only). Confirm key login works FIRST.
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh

# 4. Install fail2ban — auto-bans IPs that brute-force SSH
sudo apt -y install fail2ban
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd
```

> **Caution:** Run `sudo ufw allow OpenSSH` **before** `ufw enable`. Forget it and ufw will slam port 22 shut — you'll lose your session and can't reconnect. Always keep one open session as a safety net when disabling password auth.

> **Note:** "Why both a security group AND ufw — isn't that redundant?" That's **defense in depth**. The SG is AWS-managed and can be changed by anyone with console access; ufw lives inside the box. If a misconfigured SG accidentally opens a port, ufw still blocks it. Layers fail independently.

### Step 4 — Install Docker (Ubuntu 24.04 official repo)

Install from Docker's official apt repository — **not** the stale `docker.io` package in Ubuntu's default repo. Run on the EC2 box.

```bash
# Add Docker's official GPG key
sudo apt update
sudo apt -y install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add the repo for Ubuntu 24.04 (noble)
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu \
$(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install engine + CLI + compose plugin + buildx
sudo apt update
sudo apt -y install docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
```

```bash
# Run docker without sudo: add your user to the docker group
sudo usermod -aG docker $USER

# IMPORTANT: log out and back in (or run this) so the new group takes effect
newgrp docker

# Verify
docker run --rm hello-world
```

> **Caution:** The #1 gotcha: you added yourself to the `docker` group but your current shell session still has the old group set. **Fix:** log out and SSH back in, or run `newgrp docker`. Group membership is only read at login.

> **Tip:** Adding a user to the `docker` group is effectively granting root (the daemon runs as root). On a personal learning box that's fine; on a shared/prod box, prefer `sudo docker` or rootless Docker. Know the trade-off — interviewers love this one.

### Step 5 — Write the app and Dockerfile

A tiny Node app — no framework, no npm install needed, so it builds instantly. On the EC2 box, make a folder and three files.

```bash
mkdir -p ~/myapp && cd ~/myapp
```

**server.js** — a plain HTTP server:

```bash
// server.js
const http = require('http');
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok' }));
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<h1>Hello from EC2 + Docker!</h1><p>Served by ' +
          require('os').hostname() + '</p>');
});

server.listen(PORT, () => console.log('Listening on ' + PORT));
```

**package.json** — minimal metadata:

```bash
{
  "name": "myapp",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": { "start": "node server.js" }
}
```

**Dockerfile** — the recipe to freeze your app into an image:

```dockerfile
# Dockerfile
FROM node:20-alpine

# Don't run as root inside the container (security)
WORKDIR /app

# Copy manifest first so Docker caches the (empty) install layer
COPY package.json ./
# RUN npm ci   # <- uncomment when you add real dependencies

# Copy the rest of the app
COPY . .

# Document the port the app listens on
EXPOSE 3000

# Drop to the built-in non-root 'node' user
USER node

CMD ["npm", "start"]
```

**.dockerignore** — keep junk out of the image (faster builds, smaller image):

```bash
node_modules
npm-debug.log
.git
*.pem
.env
```

> **Tip:** `node:20-alpine` is a tiny base image (~50 MB vs ~1 GB) — faster to build, ship, and pull. Copying `package.json` *before* the source code lets Docker **cache** the dependency layer: change your code, only the last layers rebuild. This is the same dependency-caching idea as your React build, just at the image level.

> **Tip:** Never run containers as root. The `USER node` line means even if someone breaks into your app, they're not root inside the container. And never `COPY` secrets or `.pem` files into an image — bake nothing sensitive into a layer (layers are forever and inspectable).

### Step 6 — Build and run the container

```bash
cd ~/myapp

# Build the image and tag it
docker build -t myapp:1.0 .

# Run it: host port 80 -> container port 3000, auto-restart on reboot/crash
docker run -d --name web --restart unless-stopped -p 80:3000 myapp:1.0

# Confirm it's up
docker ps
docker logs web
```

> **Tip:** Format for `-p` is `HOST:CONTAINER`. The app inside listens on 3000; you publish it on the host's port 80 so browsers (which default to 80 for http) hit it without a port in the URL. `--restart unless-stopped` means if the box reboots, Docker brings your app back automatically — your first taste of "self-healing".

> **Caution:** "port is already allocated" means something already owns port 80 (often a previous container). `docker ps -a` to find it, then `docker rm -f web` and re-run. Or `sudo lsof -i :80` to see what's holding it.

### Step 7 — Open the security group and test

ufw is already set. Now the AWS-level firewall. In the Console: EC2 → Security Groups → your SG → **Inbound rules** → Edit. Keep SSH (22) restricted to **My IP**, and add HTTP (80) from **Anywhere (0.0.0.0/0)**. CLI version:

```bash
# Allow HTTP from the world
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxx \
  --protocol tcp --port 80 --cidr 0.0.0.0/0

# Tighten SSH to ONLY your current IP (find it with: curl ifconfig.me)
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxx \
  --protocol tcp --port 22 --cidr <your-ip>/32
```

```bash
# Test from your laptop
curl http://<public-ip>
# Expect: <h1>Hello from EC2 + Docker!</h1>...

# Or just open http://<public-ip> in your browser
```

> **Tip:** SSH (22) should **never** be open to 0.0.0.0/0. Scope it to your IP with a `/32`. Web (80/443) is meant to be public, so that's fine wide open. The rule of thumb: open the minimum surface area needed for the thing to work.

> **Note:** "What does the `/32` in a CIDR mean?" It's a single IP address (32 mask bits = no host bits free). `0.0.0.0/0` = every IP on the internet. Showing you can read CIDR notation instantly separates you from people who only clicked through the console.

### Step 8 — Elastic IP and domain mapping

A plain EC2 public IP changes every stop/start — useless for a real site. An **Elastic IP** is a static IP you own and pin to the instance.

```bash
# Allocate an Elastic IP
aws ec2 allocate-address --domain vpc \
  --query '{ip:PublicIp, alloc:AllocationId}' --output table

# Attach it to your instance
aws ec2 associate-address \
  --instance-id i-xxxxxxxx \
  --allocation-id eipalloc-xxxxxxxx
```

**Pointing a domain at it:** in your DNS provider (Route 53, Namecheap, Cloudflare, etc.), create an **A record**: `app.yourdomain.com → <your-elastic-ip>`. After DNS propagates (minutes to an hour), `http://app.yourdomain.com` hits your container.

| DNS Record | Type | Value |
|---|---|---|
| app.yourdomain.com | A | your-elastic-ip |
| www.yourdomain.com | CNAME | app.yourdomain.com |

> **Caution:** An Elastic IP is free **only while it's attached to a running instance**. Allocate one and leave it unattached (or attached to a stopped instance) and AWS charges a small hourly fee. When you tear the project down, **release the EIP**: `aws ec2 release-address --allocation-id eipalloc-xxxx`.

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Can't SSH (timeout) | SG doesn't allow 22 from your IP, or your home IP changed | Re-check inbound rule; update the /32 to your current IP (`curl ifconfig.me`). |
| SSH "Permission denied (publickey)" | Wrong key, wrong user, or key perms too open | `chmod 400 my-key.pem`; use user `ubuntu`; confirm it's the key pair you launched with. |
| Site won't load in browser | Container not running / SG 80 closed / ufw 80 closed / wrong port mapping | `docker ps` (running?); SG inbound 80 from 0.0.0.0/0; `sudo ufw status` shows 80 ALLOW; mapping is `-p 80:3000`. |
| curl works on the box but not from outside | App is up; firewall is blocking | `curl localhost` on the box proves the app; then open port 80 in BOTH ufw and the SG. |
| "permission denied" running docker | User not in docker group / shell not refreshed | `sudo usermod -aG docker $USER` then re-login or `newgrp docker`. |
| "port is already allocated" | Another process/container owns port 80 | `sudo lsof -i :80` / `docker ps -a`, then stop/remove it and re-run. |
| Site dies after instance reboot | Container had no restart policy | Run with `--restart unless-stopped`. |

### GitHub README template

```bash
# myapp — Containerized Web App on a Single EC2

A minimal Node.js HTTP server packaged with Docker and deployed to a
single Ubuntu 24.04 EC2 instance. Demonstrates a full deploy path:
build image → run container → expose via security group + ufw → serve
on a static Elastic IP.

## Architecture
Internet → Elastic IP → Security Group (22 from me, 80 from all)
→ EC2 (Ubuntu 24.04) → ufw → Docker container (node :3000 → host :80)

## Stack
- AWS EC2 (t3.micro, Ubuntu 24.04 LTS)
- Docker (official apt repo)
- Node.js 20 (alpine base image)
- ufw + fail2ban for OS hardening

## Run locally
docker build -t myapp:1.0 .
docker run -d -p 80:3000 myapp:1.0
curl http://localhost

## Deploy to EC2
1. Launch t3.micro Ubuntu 24.04, attach a key pair.
2. SSH in, harden (apt upgrade, ufw, disable password auth, fail2ban).
3. Install Docker from the official repo.
4. Clone this repo, docker build, docker run -d -p 80:3000.
5. Open 80 in the security group; attach an Elastic IP.

## Endpoints
| Path      | Response                  |
|-----------|---------------------------|
| /         | HTML hello page           |
| /health   | {"status":"ok"} (200)     |

## License
MIT
```

> **Tip:** Resume bullets to lift into your LinkedIn (tweak the numbers to your reality):
> - Deployed a containerized Node.js web application to AWS EC2 (Ubuntu 24.04), cutting environment-related "works-on-my-machine" defects to zero by standardizing runtime in a Docker image.
> - Hardened a public-facing Linux instance using layered firewalls (AWS security groups + ufw), fail2ban, and key-only SSH, reducing exposed attack surface to 2 ports and blocking automated brute-force attempts.
> - Configured a static Elastic IP and DNS A-record mapping for a stable public endpoint, and used resource tagging plus stop/start scheduling to keep monthly cloud spend within the AWS free tier.

### Level it up

> **Note:** You've got a live site — now make it production-shaped:
> - **HTTPS** — put **Caddy** in front (it auto-fetches Let's Encrypt certs with near-zero config) or use Nginx + Certbot. Open 443, redirect 80→443.
> - **Custom domain** — move DNS to Route 53, point your real domain, and combine with the TLS step above.
> - **systemd unit** — wrap `docker run` in a systemd service for clean start/stop/status and proper boot ordering.
> - **Docker Compose** — once you add a second container (a database, a reverse proxy), juggling `docker run` flags gets painful. Compose declares the whole stack in one YAML file. **This is exactly where Project 2 picks up.**

---

## Project 2 — Multi-Container App with Docker Compose

> **Real-World Example:** This is the exact shape of 90% of early-stage SaaS products. Think of a tiny B2B dashboard: nginx is the front door (security guard + traffic cop), Flask is the office where work happens, Postgres is the locked filing room in the back. Customers walk up to the front door (port 80/443) — they never see the filing room. When the company grows, the filing room moves to a managed building (RDS) and you add more offices (horizontal scaling), but the front-door pattern stays.

Want to automate converting your `docker run` commands to Compose? Try the [Docker run → Compose converter](/docker-run-to-compose/).

### What you'll build

A small SaaS-style stack running on a single EC2 instance, wired together with Docker Compose: a **web app** (Flask), a **Postgres database**, and an **nginx reverse proxy** sitting in front. The browser only ever talks to nginx on port 80; nginx forwards traffic to the app; the app talks to Postgres privately. Nothing about the database is exposed to the internet.

### Architecture

The EC2 instance lives in a **public subnet** (it has a route to the internet gateway so users can reach nginx). Inside it, Compose runs three containers on one private user-defined bridge network. In real production the DB would sit in a **private subnet** with no internet route.

```
Browser
  → Internet Gateway (IGW)
  → Public subnet 10.0.1.0/24
  → EC2 (Docker Compose)
    → nginx :80 → web (Flask) :3000 → db (Postgres) :5432
    (all on appnet user-defined bridge network)
  (prod: DB lives in Private subnet 10.0.2.0/24, no IGW route)
```

<figure class="dgm" role="img" aria-label="Docker Compose stack: nginx, Flask web app, and Postgres database on a shared private bridge network">
<svg viewBox="0 0 680 200" width="680" height="200" xmlns="http://www.w3.org/2000/svg">
  <!-- Browser -->
  <rect x="10" y="76" width="80" height="44" rx="7" fill="none" class="dgm-stroke" stroke-width="1.5"/>
  <text x="50" y="96" text-anchor="middle" font-size="11" class="dgm-ink">Browser</text>
  <text x="50" y="111" text-anchor="middle" font-size="9" class="dgm-muted">:80</text>
  <!-- Arrow to nginx -->
  <line x1="90" y1="98" x2="120" y2="98" class="dgm-ink-stroke" stroke-width="1.5" fill="none"/>
  <polygon points="120,94 128,98 120,102" class="dgm-ink"/>
  <!-- EC2 outer box -->
  <rect x="128" y="14" width="532" height="170" rx="8" fill="none" class="dgm-stroke" stroke-width="1.5"/>
  <text x="394" y="30" text-anchor="middle" font-size="10" class="dgm-muted">EC2 instance — Docker Compose</text>
  <!-- appnet network box -->
  <rect x="140" y="38" width="508" height="134" rx="7" class="dgm-surface-2" fill="none" stroke-width="0"/>
  <rect x="140" y="38" width="508" height="134" rx="7" fill="none" class="dgm-stroke" stroke-width="1.5" stroke-dasharray="5,3"/>
  <text x="394" y="54" text-anchor="middle" font-size="9" class="dgm-muted">appnet (user-defined bridge — service-name DNS)</text>
  <!-- nginx box -->
  <rect x="154" y="62" width="110" height="84" rx="7" class="dgm-accent-soft" fill="none" stroke-width="0"/>
  <rect x="154" y="62" width="110" height="84" rx="7" fill="none" class="dgm-accent-stroke" stroke-width="2"/>
  <text x="209" y="87" text-anchor="middle" font-size="12" class="dgm-ink">nginx</text>
  <text x="209" y="104" text-anchor="middle" font-size="10" class="dgm-muted">reverse proxy</text>
  <text x="209" y="118" text-anchor="middle" font-size="10" class="dgm-muted">published :80</text>
  <text x="209" y="132" text-anchor="middle" font-size="9" class="dgm-muted">→ web:3000</text>
  <!-- Arrow nginx to web -->
  <line x1="264" y1="104" x2="298" y2="104" class="dgm-ink-stroke" stroke-width="1.5" fill="none"/>
  <polygon points="298,100 306,104 298,108" class="dgm-ink"/>
  <!-- web box -->
  <rect x="306" y="62" width="120" height="84" rx="7" fill="none" class="dgm-stroke" stroke-width="2"/>
  <text x="366" y="87" text-anchor="middle" font-size="12" class="dgm-ink">web</text>
  <text x="366" y="104" text-anchor="middle" font-size="10" class="dgm-muted">Flask + gunicorn</text>
  <text x="366" y="118" text-anchor="middle" font-size="10" class="dgm-muted">internal :3000</text>
  <text x="366" y="132" text-anchor="middle" font-size="9" class="dgm-muted">not published</text>
  <!-- Arrow web to db -->
  <line x1="426" y1="104" x2="460" y2="104" class="dgm-ink-stroke" stroke-width="1.5" fill="none"/>
  <polygon points="460,100 468,104 460,108" class="dgm-ink"/>
  <!-- db box -->
  <rect x="468" y="62" width="160" height="84" rx="7" fill="none" class="dgm-stroke" stroke-width="2"/>
  <text x="548" y="87" text-anchor="middle" font-size="12" class="dgm-ink">db</text>
  <text x="548" y="104" text-anchor="middle" font-size="10" class="dgm-muted">Postgres 16-alpine</text>
  <text x="548" y="118" text-anchor="middle" font-size="10" class="dgm-muted">internal :5432</text>
  <text x="548" y="132" text-anchor="middle" font-size="9" class="dgm-muted">pgdata volume (named)</text>
</svg>
<figcaption>nginx is the only published port; web and db communicate privately over the appnet bridge network, with the database never exposed to the internet.</figcaption>
</figure>

### Prerequisites and time estimate

- Project 1 done: you can launch an EC2 instance, SSH in, and you have Docker + the Compose plugin installed (`docker compose version` works).
- A security group you can edit, and your VPC ID + subnet ID handy.
- Basic comfort with the Linux shell and a text editor (nano/vim).
- **Time:** ~2 to 3 hours for the core build; +30 min for the HTTPS concept section.

### Step 1 — Project layout and the .env file

**Why a layout matters:** Compose reads files relative to the project directory. Keeping the app, the proxy config, and secrets in predictable folders means your `docker-compose.yml` can use clean relative paths and your teammates instantly understand the repo.

SSH into your EC2 box and create this structure:

```bash
mkdir -p ~/saas-stack/app ~/saas-stack/nginx
cd ~/saas-stack

# the tree we're aiming for:
# saas-stack/
# ├── app/
# │   ├── app.py
# │   ├── requirements.txt
# │   └── Dockerfile
# ├── nginx/
# │   └── default.conf
# ├── docker-compose.yml
# ├── .env            <-- secrets, NEVER commit
# └── .gitignore
```

Create the `.env` file. Compose auto-loads a file literally named `.env` from the project root:

```bash
cat > .env <<'EOF'
POSTGRES_USER=saas_admin
POSTGRES_PASSWORD=ch4nge_me_super_secret
POSTGRES_DB=saas_db
# app reads these to build its connection string
DB_HOST=db
DB_PORT=5432
EOF
```

Now make sure git never sees it:

```bash
cat > .gitignore <<'EOF'
.env
__pycache__/
*.pyc
EOF
```

> **Caution:** The single most common security mistake: committing `.env` with real passwords. Once it's in git history, it's leaked forever even if you delete it later. Add it to `.gitignore` *before* your first commit. Commit a `.env.example` with empty/dummy values instead.

> **Tip:** Secrets belong in `.env` (or a secrets manager), **never baked into the image**. An image is shareable and ends up in registries — anyone who pulls it can run `docker history` and read baked-in env. Keep credentials at runtime, not build time.

### Step 2 — The Flask app, requirements and Dockerfile

The app does one meaningful thing: it connects to Postgres using host `db` (the service name) and reports whether the DB is reachable. This proves container-to-container networking works.

`app/app.py`:

```bash
import os
from flask import Flask, jsonify
import psycopg2

app = Flask(__name__)

def db_conn():
    return psycopg2.connect(
        host=os.environ.get("DB_HOST", "db"),     # service name on appnet
        port=os.environ.get("DB_PORT", "5432"),
        dbname=os.environ["POSTGRES_DB"],
        user=os.environ["POSTGRES_USER"],
        password=os.environ["POSTGRES_PASSWORD"],
    )

@app.route("/")
def home():
    try:
        with db_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT version();")
            ver = cur.fetchone()[0]
        return jsonify(status="ok", db="reachable", postgres=ver)
    except Exception as e:
        return jsonify(status="error", db="unreachable", detail=str(e)), 500

@app.route("/healthz")
def healthz():
    return "ok", 200

if __name__ == "__main__":
    # bind 0.0.0.0 so it's reachable from other containers, not just localhost
    app.run(host="0.0.0.0", port=3000)
```

`app/requirements.txt`:

```bash
flask==3.0.3
psycopg2-binary==2.9.9
gunicorn==22.0.0
```

`app/Dockerfile` — pinned base image, non-root user, gunicorn for production:

```dockerfile
# pin the version — 'python:latest' silently changes under you
FROM python:3.12-slim

WORKDIR /app

# install deps first so this layer caches when only code changes
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

# don't run as root inside the container
RUN useradd --create-home appuser
USER appuser

EXPOSE 3000

# gunicorn = real WSGI server; 'app:app' = module:flask_object
CMD ["gunicorn", "--bind", "0.0.0.0:3000", "--workers", "2", "app:app"]
```

> **Tip:** Copy `requirements.txt` and install *before* copying `app.py`. Docker caches layers; if your code changes but deps don't, the slow `pip install` layer is reused and rebuilds take seconds. This layer-ordering trick is asked about in interviews.

> **Note:** "Why not just use `flask run` in production?" Flask's dev server is single-threaded and explicitly not for production. Gunicorn handles concurrency, worker management, and graceful restarts. Knowing this distinction signals you understand the dev/prod boundary.

### Step 3 — nginx reverse proxy config

**Analogy:** nginx is the receptionist at the front desk. Visitors (browsers) only talk to the receptionist on port 80. The receptionist forwards them to the right office (`web:3000`) and writes down who they were (forwarded headers) so the office knows the real visitor, not just "the receptionist sent me."

`nginx/default.conf`:

```bash
upstream app_upstream {
    # 'web' resolves via Docker DNS to the web container on appnet
    server web:3000;
}

server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://app_upstream;

        # pass the real client info downstream to Flask
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 5s;
        proxy_read_timeout    30s;
    }
}
```

> **Caution:** If nginx returns **502 Bad Gateway**, the upstream isn't reachable: the `web` container isn't up yet, or you typed the wrong service name/port (e.g. `web:5000` when the app listens on 3000). Both containers must be on `appnet`.

> **Tip:** Always forward `X-Forwarded-For` and `X-Forwarded-Proto`. Without them your app logs every request as coming from the proxy's IP, and it can't tell HTTP from HTTPS — which breaks secure-cookie and redirect logic once you add TLS.

### Step 4 — The docker-compose.yml (the heart of it)

This single file declares all three services, the shared network, the named volume, healthchecks, restart policies, and dependency ordering. Read the comments carefully — each one encodes a best practice.

```yaml
services:
  db:
    image: postgres:16-alpine          # pinned version, not 'latest'
    restart: unless-stopped
    env_file: .env                     # POSTGRES_USER / PASSWORD / DB
    volumes:
      - pgdata:/var/lib/postgresql/data   # NAMED volume = data persists
    networks:
      - appnet
    # NO 'ports:' here on purpose — DB must NOT be exposed to the host/internet
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 5s
      timeout: 3s
      retries: 5

  web:
    build: ./app                       # builds app/Dockerfile
    restart: unless-stopped
    env_file: .env
    networks:
      - appnet
    # also NOT published — only nginx reaches it, over appnet
    depends_on:
      db:
        condition: service_healthy     # wait until DB passes healthcheck

  nginx:
    image: nginx:1.27-alpine
    restart: unless-stopped
    ports:
      - "80:80"                        # the ONLY published port
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
    networks:
      - appnet
    depends_on:
      - web

networks:
  appnet:
    driver: bridge                     # user-defined bridge = service-name DNS

volumes:
  pgdata:                              # managed by Docker, survives 'down'
```

> **Tip:** The `$$POSTGRES_USER` double-dollar in the healthcheck is intentional: Compose treats a single `$` as its own variable substitution, so you escape it with `$$` to pass a literal `$` into the container's shell.

> **Tip:** `depends_on: condition: service_healthy` is the fix for the classic "DB connection refused on startup" race. Plain `depends_on` only waits for the container to *start*, not for Postgres to actually *accept connections*. The healthcheck closes that gap.

> **Tip:** `restart: unless-stopped` means a crashed container comes back automatically, but it won't restart things you deliberately stopped. `always` ignores manual stops; `no` gives you nothing — `unless-stopped` is the sensible default for long-running services.

### Step 5 — Bring it up and verify the service mesh

```bash
cd ~/saas-stack

# build the app image and start everything in the background
docker compose up -d --build

# watch the status — db should become 'healthy', then web/nginx come up
docker compose ps

# tail logs if something looks off
docker compose logs -f web
```

Test the whole chain from the EC2 host (browser → nginx → web → db):

```bash
curl http://localhost/
# expect: {"db":"reachable","postgres":"PostgreSQL 16...","status":"ok"}
```

Now from your laptop, open `http://<EC2-PUBLIC-IP>/` in a browser (your security group must allow inbound 80).

**Prove service-name DNS works.** Exec into the web container and resolve the db service by name:

```bash
docker compose exec web sh -c "getent hosts db"
# prints something like: 172.18.0.2   db
# the name 'db' resolves because both containers share the appnet network
```

> **Note:** On a **user-defined** bridge network, Docker runs an embedded DNS server at 127.0.0.11 inside each container. That's why `db`, `web`, and `nginx` resolve to each other with zero config. The legacy default bridge does *not* do this — you'd be stuck with brittle `--link` flags or hardcoded IPs. This is the #1 reason to always define your own network in Compose.

**Container-to-container networking ports:**

| Service | Image | Internal port | Published to host? | Reachable by |
|---|---|---|---|---|
| nginx | nginx:1.27-alpine | 80 | Yes — 80:80 | Internet (via SG) |
| web | built from ./app | 3000 | No | nginx only (over appnet) |
| db | postgres:16-alpine | 5432 | No (on purpose) | web only (over appnet) |

> **Caution:** It is tempting to add `ports: "5432:5432"` to Postgres "so you can connect from your laptop with a GUI." **Don't** — that opens your database to anything that can reach the host. If you need temporary access, use an SSH tunnel: `ssh -L 5432:localhost:5432 ...` and only ever bind to `127.0.0.1:5432:5432`, never `0.0.0.0`.

### Step 6 — VPC thinking: public vs private subnets and the security group

Your EC2 sits in a **public subnet**: that simply means its route table has an entry `0.0.0.0/0 → Internet Gateway`, so packets can flow to and from the internet. A **private subnet** has no such route — nothing on the internet can initiate a connection to it. In real production, **the database goes in the private subnet**.

| | Public subnet | Private subnet |
|---|---|---|
| Route to IGW | Yes (0.0.0.0/0 → igw) | No |
| Reachable from internet | Yes (if SG allows) | No, ever |
| Outbound internet | Directly via IGW | Via NAT gateway (if needed) |
| What lives here | nginx / load balancer / bastion | App servers, RDS / databases |
| Why | Must accept public traffic | Blast-radius reduction — DB never internet-facing |

**Why the DB must not be public:** a database is your crown jewels. If it's directly reachable, every credential-stuffing bot and port scanner on the internet can hammer it. By placing it in a private subnet (or, here, by simply never publishing its port), the only path in is through your app — which you control and can rate-limit, authenticate, and monitor.

```bash
# list your VPCs
aws ec2 describe-vpcs \
  --query 'Vpcs[].{VpcId:VpcId,Cidr:CidrBlock,Default:IsDefault}' \
  --output table

# list subnets in a VPC and whether they auto-assign public IPs
aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=vpc-0123456789abcdef0" \
  --query 'Subnets[].{Subnet:SubnetId,Cidr:CidrBlock,AZ:AvailabilityZone,PublicIP:MapPublicIpOnLaunch}' \
  --output table
```

Creating a private subnet (teaching example):

```bash
# a private subnet is just a subnet with NO route to the IGW
aws ec2 create-subnet \
  --vpc-id vpc-0123456789abcdef0 \
  --cidr-block 10.0.2.0/24 \
  --availability-zone us-east-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=saas-private-a},{Key=Project,Value=saas-stack}]'
# (then create a route table WITHOUT a 0.0.0.0/0 -> igw entry and associate it)
```

Lock the security group down to least-open:

```bash
# HTTP open to everyone
aws ec2 authorize-security-group-ingress \
  --group-id sg-0abc123 \
  --protocol tcp --port 80 --cidr 0.0.0.0/0

# SSH ONLY from your current IP, never 0.0.0.0/0
aws ec2 authorize-security-group-ingress \
  --group-id sg-0abc123 \
  --protocol tcp --port 22 --cidr "$(curl -s https://checkip.amazonaws.com)/32"
```

> **Tip:** Security groups are **stateful** and default-deny inbound — open only the ports you truly need. Never open 22 to `0.0.0.0/0`; that's how instances get crypto-mined within hours.

> **Note:** "Public vs private subnet — what's the actual difference?" It's entirely the **route table**. A subnet is "public" if its associated route table sends `0.0.0.0/0` to an Internet Gateway. There's no checkbox called 'public' — it's a property of routing. Saying this precisely scores points.

### Step 7 — Prove data persistence with the named volume

Containers are ephemeral — when one is recreated, its writable layer is thrown away. A **named volume** stores Postgres's data on the host, outside that throwaway layer, so it survives container recreation. Let's prove it.

Write some data:

```bash
docker compose exec db psql -U saas_admin -d saas_db -c \
  "CREATE TABLE IF NOT EXISTS notes(id serial PRIMARY KEY, body text);
   INSERT INTO notes(body) VALUES ('survives a down/up');
   SELECT * FROM notes;"
```

Now stop and remove the containers (but keep volumes), then bring them back:

```bash
docker compose down        # removes containers + network, KEEPS named volumes
docker compose up -d       # recreates everything

# the data is still there:
docker compose exec db psql -U saas_admin -d saas_db -c "SELECT * FROM notes;"
#  id |        body
# ----+---------------------
#   1 | survives a down/up
```

> **Caution:** `docker compose down **-v**` deletes named volumes too — your data is gone permanently. Treat `-v` like `rm -rf` for your database. There is no undo.

> **Tip:** The bug behind "my data keeps disappearing on restart" is usually an **anonymous volume** (you wrote `- /var/lib/postgresql/data` with no name) or no volume at all. Always give DB volumes a name (`pgdata:/var/lib/postgresql/data`) so Docker tracks and preserves them.

### Step 8 — HTTPS concept: adding TLS the right way

Right now you're on plain HTTP (port 80). For production you terminate **TLS at nginx**: the browser connects over 443 with a valid certificate, nginx decrypts, and forwards plain HTTP to `web:3000` over the private network. You also redirect 80 → 443 so nobody stays on insecure HTTP.

**Option A — Let's Encrypt via certbot (free, real certs, needs a domain)**

You need a domain name pointing an A record at your EC2's public IP first. Then:

```bash
# on the host, install certbot's nginx plugin
sudo apt-get update && sudo apt-get install -y certbot python3-certbot-nginx

# certbot gets a cert and rewrites your nginx config to use it
sudo certbot --nginx -d app.example.com -d www.app.example.com

# certs auto-renew via a systemd timer; test the renewal path:
sudo certbot renew --dry-run
```

The 80 → 443 redirect certbot adds looks like this in nginx:

```bash
server {
    listen 80;
    server_name app.example.com;
    return 301 https://$host$request_uri;   # force everyone to HTTPS
}

server {
    listen 443 ssl;
    server_name app.example.com;

    ssl_certificate     /etc/letsencrypt/live/app.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;

    location / {
        proxy_pass http://app_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

> **Tip:** If you'd rather not manage nginx + certbot by hand, swap nginx for **Caddy**. Caddy gets and renews Let's Encrypt certs automatically with a two-line Caddyfile — `app.example.com { reverse_proxy web:3000 }` — and that's it, HTTPS done.

**Option B — self-signed cert (testing only, no domain needed)**

```bash
# generates a cert your browser will warn about — fine for local testing
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/selfsigned.key \
  -out nginx/selfsigned.crt \
  -subj "/CN=localhost"
```

> **Caution:** Self-signed certs throw scary browser warnings and are **never** for production — they prove encryption works but not identity. Use them only to test your TLS wiring, then switch to Let's Encrypt for anything real. Also: open port 443 in your security group, or HTTPS simply won't connect.

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| App returns `db unreachable` at startup | Web started before Postgres was accepting connections | Use `depends_on: condition: service_healthy` + a `pg_isready` healthcheck (Step 4) |
| nginx `502 Bad Gateway` | Upstream not up, or wrong service name/port in `proxy_pass` | Check `docker compose ps`; confirm `web:3000` matches the app's listen port |
| Data disappears after `down`/`up` | Anonymous volume, or you ran `down -v` | Use a **named** volume `pgdata:/var/lib/postgresql/data`; never use `-v` unless you mean it |
| Browser can't reach the site from outside | Security group doesn't allow inbound 80/443 | `aws ec2 authorize-security-group-ingress ... --port 80 --cidr 0.0.0.0/0` |
| `password authentication failed` for Postgres | Changed creds in `.env` but old data in the volume still has the old password | The DB only initializes creds on *first* run; either match the old creds or `down -v` to reinit (loses data) |
| `web` can't resolve `db` | Services on different networks, or using the default bridge | Put both on the same user-defined network `appnet` (Step 4) |
| Secrets visible in `docker history` | You baked env into the Dockerfile | Pass secrets at runtime via `env_file`/`environment`, never `ENV PASSWORD=...` |

### GitHub README template

```bash
# SaaS Stack — Dockerized Web + Postgres + nginx

A multi-container web application orchestrated with Docker Compose and
deployed on AWS EC2 inside a VPC. Demonstrates reverse proxying,
service-name networking, persistent storage, and least-privilege security.

## Architecture
- nginx (reverse proxy) — terminates :80/:443, routes to the app
- web (Flask + gunicorn) — application logic, listens on :3000 internally
- db (Postgres 16) — private, never published, data on a named volume

Browser -> nginx :80 -> web :3000 -> db :5432   (all over a private bridge net)

## Stack
Docker, Docker Compose, Python/Flask, PostgreSQL, nginx, AWS EC2 + VPC

## Quick start
cp .env.example .env        # then fill in real secrets
docker compose up -d --build
curl http://localhost/      # {"status":"ok","db":"reachable", ...}

## Key decisions
- Database port is NOT published — reachable only by the app over the internal network
- depends_on: service_healthy prevents startup race conditions
- Named volume pgdata persists data across docker compose down/up
- Secrets live in .env (gitignored), never baked into images
- Security group: 80/443 open to internet, 22 restricted to my IP

## HTTPS
Production uses Let's Encrypt via certbot (or Caddy) with an 80 -> 443 redirect.

## License
MIT
```

> **Tip:** Resume bullets:
> - Designed and deployed a multi-container SaaS stack (Flask, PostgreSQL, nginx) on AWS EC2 using Docker Compose, with service-name DNS over a user-defined bridge network and an nginx reverse proxy fronting the application.
> - Hardened the deployment by isolating the database from public access, enforcing least-open security-group rules, externalizing secrets via environment files, and adding container healthchecks with dependency-ordered startup to eliminate connection-race failures.
> - Implemented persistent storage with named Docker volumes and documented a TLS strategy (Let's Encrypt/certbot with HTTP→HTTPS redirect), plus VPC public/private subnet design for production-grade network isolation.

### Level it up

- **Multiple environments** — split config with `docker-compose.override.yml` for dev and a `compose.prod.yml` for prod.
- **Secrets manager** — graduate from `.env` to AWS Secrets Manager or SSM Parameter Store; have the instance fetch creds at boot via its IAM role.
- **Move the DB to RDS** — replace the `db` container with a managed Postgres on RDS in a private subnet. You get automated backups, patching, and failover; the app just changes `DB_HOST` to the RDS endpoint.
- **Real subnet separation** — put RDS in a dedicated private subnet across two AZs (a DB subnet group), and allow only the app's security group to reach 5432.

---

## Project 3 — Automated Deploy + Monitoring

> **What you'll build:** A **one-command server bootstrap**: an idempotent `provision.sh` script that takes a fresh Ubuntu EC2 box from zero to "running my containerized app behind a firewall, backing itself up to S3, and reporting its own health" — with **no secrets stored on the machine**. You ship your app image to a registry (Docker Hub *and* AWS ECR), the box pulls it, runs it, health-checks it on a timer, and tars its data nightly to S3 using an **IAM instance role**. Re-running the script changes nothing that's already correct.

For testing your Prometheus relabel rules when you add metrics later, use the [Prometheus Relabel Tester](/prometheus-relabel-tester/).

> **Real-world scenario:** Imagine your ops team gets a new server every time traffic spikes. Nobody wants to SSH in and run 30 commands by hand (and forget step 17). You hand them `./provision.sh`. They run it once. The box is identical to every other box. This is the gateway drug to Infrastructure-as-Code (Ansible/Terraform in Project 4) — doing it in plain bash first teaches you *why* those tools exist.

### Architecture

Dev builds an image, pushes it to a registry, the EC2 box pulls it and runs it. The box wears an **IAM role** (like a security badge clipped to the server itself) so it can write to S3 without ever holding a password.

```
Dev laptop (docker build + docker push)
  → Image Registry (Docker Hub / ECR)
  → EC2 (Ubuntu, Docker + ufw, IAM role attached)
      pulls image from registry
      runs container :8080
      backs up to S3 bucket (aws s3 cp via IAM role, no keys on disk)
```

<figure class="dgm" role="img" aria-label="Monitoring architecture: app exposes /metrics, Prometheus scrapes it, Grafana reads Prometheus for dashboards and fires alerts">
<svg viewBox="0 0 680 170" width="680" height="170" xmlns="http://www.w3.org/2000/svg">
  <!-- App box -->
  <rect x="10" y="60" width="130" height="64" rx="7" fill="none" class="dgm-stroke" stroke-width="2"/>
  <text x="75" y="86" text-anchor="middle" font-size="12" class="dgm-ink">App Container</text>
  <text x="75" y="103" text-anchor="middle" font-size="10" class="dgm-muted">:8080</text>
  <text x="75" y="116" text-anchor="middle" font-size="10" class="dgm-muted">GET /metrics</text>
  <!-- scrape arrow label -->
  <text x="196" y="48" text-anchor="middle" font-size="9" class="dgm-muted">scrapes /metrics</text>
  <line x1="155" y1="92" x2="215" y2="92" class="dgm-ink-stroke" stroke-width="1.5" fill="none" stroke-dasharray="4,3"/>
  <polygon points="215,88 223,92 215,96" class="dgm-ink"/>
  <!-- Prometheus box -->
  <rect x="223" y="52" width="140" height="80" rx="7" class="dgm-accent-soft" fill="none" stroke-width="0"/>
  <rect x="223" y="52" width="140" height="80" rx="7" fill="none" class="dgm-accent-stroke" stroke-width="2"/>
  <text x="293" y="82" text-anchor="middle" font-size="12" class="dgm-ink">Prometheus</text>
  <text x="293" y="98" text-anchor="middle" font-size="10" class="dgm-muted">time-series store</text>
  <text x="293" y="113" text-anchor="middle" font-size="9" class="dgm-muted">alert rules</text>
  <!-- Arrow to Grafana -->
  <line x1="363" y1="92" x2="413" y2="92" class="dgm-ink-stroke" stroke-width="1.5" fill="none"/>
  <polygon points="413,88 421,92 413,96" class="dgm-ink"/>
  <text x="388" y="84" text-anchor="middle" font-size="9" class="dgm-muted">queries</text>
  <!-- Grafana box -->
  <rect x="421" y="52" width="130" height="80" rx="7" fill="none" class="dgm-stroke" stroke-width="2"/>
  <text x="486" y="82" text-anchor="middle" font-size="12" class="dgm-ink">Grafana</text>
  <text x="486" y="98" text-anchor="middle" font-size="10" class="dgm-muted">dashboards</text>
  <text x="486" y="113" text-anchor="middle" font-size="9" class="dgm-muted">:3000</text>
  <!-- Arrow to Alerts -->
  <line x1="551" y1="92" x2="601" y2="92" class="dgm-ink-stroke" stroke-width="1.5" fill="none"/>
  <polygon points="601,88 609,92 601,96" class="dgm-ink"/>
  <!-- Alerts box -->
  <rect x="609" y="64" width="60" height="56" rx="7" fill="none" class="dgm-stroke" stroke-width="1.5"/>
  <text x="639" y="88" text-anchor="middle" font-size="10" class="dgm-ink">Alerts</text>
  <text x="639" y="103" text-anchor="middle" font-size="9" class="dgm-muted">SNS/</text>
  <text x="639" y="114" text-anchor="middle" font-size="9" class="dgm-muted">Slack</text>
  <!-- systemd timer label below -->
  <text x="75" y="145" text-anchor="middle" font-size="9" class="dgm-muted">healthcheck.timer (systemd)</text>
  <line x1="75" y1="124" x2="75" y2="140" class="dgm-muted-stroke" stroke-width="1" fill="none"/>
</svg>
<figcaption>The app exposes a /metrics endpoint; Prometheus scrapes it on a schedule and evaluates alert rules; Grafana reads Prometheus to render dashboards and forward alerts.</figcaption>
</figure>

**Deploy pipeline flow:**
1. `provision.sh` — idempotent bootstrap
2. Install deps (docker, ufw) — each guarded by a check
3. Push image (from dev) to Hub / ECR
4. Pull image on the box (`docker pull`)
5. Run container `:8080` with `--restart unless-stopped`
6. Healthcheck — `curl` with retry + backoff on a systemd timer
7. S3 backup — `aws s3 cp` via IAM role nightly

### Prerequisites and time estimate

| You need | Why |
|---|---|
| An EC2 Ubuntu 22.04 box (t3.micro is fine) with SSH access | The target server |
| A containerized app image (reuse Project 2's, or any image like `nginx`) | Something to deploy |
| Docker Hub account + an AWS account with IAM/S3/ECR rights | The two registries + backup target |
| AWS CLI v2 on your laptop | To create roles, buckets, ECR repos |
| Comfort with Project 1 (Linux/SSH) and Project 2 (Docker) | This builds on both |

**Time:** ~3–4 hours the first time (most of it understanding IAM roles). Re-runs: 2 minutes.

### Step 1 — Write the idempotent provision.sh

**WHY idempotent?** "Idempotent" means running it twice does the same thing as running it once — no duplicates, no errors. Think of a light switch labelled "ON" vs a toggle: you can press "ON" ten times and the light is just on. A non-idempotent script is the toggle — run it twice and the light goes back off. Production scripts must be the "ON" button, because boxes get re-provisioned, retried, and re-run constantly.

Three habits make bash safe:
- `set -euo pipefail` — **e**: exit on any error; **u**: error on undefined variables; **o pipefail**: a failure anywhere in a pipe fails the whole line.
- **Check before you act**: `command -v docker &>/dev/null || install_docker` — only install if missing.
- **Quote everything**: `"$VAR"` not `$VAR`, so paths with spaces don't explode.

```bash
#!/usr/bin/env bash
# provision.sh — idempotent bootstrap for a containerized app on Ubuntu.
# Safe to re-run. Run as root (or via sudo).  Usage: sudo ./provision.sh
set -euo pipefail

# ---- Config (override via env, e.g. IMAGE=myrepo/app:2.0 ./provision.sh) ----
IMAGE="${IMAGE:-docker.io/library/nginx:stable}"   # registry image to run
APP_NAME="${APP_NAME:-myapp}"                        # container name
APP_PORT="${APP_PORT:-8080}"                         # host:container port
SSH_PORT="${SSH_PORT:-22}"                           # keep SSH open!
DATA_DIR="${DATA_DIR:-/srv/${APP_NAME}/data}"        # persistent volume

log()  { printf '\033[1;36m[provision]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[fatal]\033[0m %s\n' "$*" >&2; exit 1; }

require_root() {
  [[ "${EUID}" -eq 0 ]] || die "Run as root: sudo ./provision.sh"
}

install_docker() {
  if command -v docker &>/dev/null; then
    log "Docker already installed ($(docker --version)). Skipping."
    return
  fi
  log "Installing Docker Engine..."
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  fi
  # Idempotent repo add: write the file (overwrite), never append blindly.
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin
  systemctl enable --now docker
}

configure_firewall() {
  if ! command -v ufw &>/dev/null; then
    log "Installing ufw..."
    apt-get install -y ufw
  fi
  # CRITICAL: allow SSH FIRST or you lock yourself out.
  ufw allow "${SSH_PORT}/tcp"
  ufw allow "${APP_PORT}/tcp"
  ufw --force enable          # --force = non-interactive, idempotent
  log "Firewall: SSH(${SSH_PORT}) + app(${APP_PORT}) allowed."
}

deploy_container() {
  mkdir -p "${DATA_DIR}"
  log "Pulling ${IMAGE}..."
  docker pull "${IMAGE}"
  # Idempotent run: remove old container if present, then start fresh.
  if docker ps -a --format '{{.Names}}' | grep -qx "${APP_NAME}"; then
    log "Replacing existing container '${APP_NAME}'."
    docker rm -f "${APP_NAME}" >/dev/null
  fi
  docker run -d \
    --name "${APP_NAME}" \
    --restart unless-stopped \
    -p "${APP_PORT}:80" \
    -v "${DATA_DIR}:/data" \
    "${IMAGE}"
  log "Container '${APP_NAME}' running on port ${APP_PORT}."
}

main() {
  require_root
  install_docker
  configure_firewall
  deploy_container
  log "Done. Re-run anytime — it's idempotent."
}

main "$@"
```

> **Tip:** Best practices applied: `set -euo pipefail`; every install guarded by a check; SSH allowed *before* enabling the firewall; repo file *overwritten* not appended; container removed-then-recreated; all variables quoted; **no secrets anywhere in the script**.

> **Caution:** **Non-idempotent repo add**: using `echo ... >> docker.list` (append) re-adds the line every run → apt warns about duplicate sources. Use `>` (overwrite). **ufw lockout**: enabling ufw before allowing your SSH port drops your live session and you can't reconnect — you'd need the EC2 serial console to recover. Always allow SSH first.

> **Note:** "How do you make a shell script safe to run repeatedly?" → idempotency: check current state before changing it, prefer declarative writes over appends, use `set -euo pipefail`. Bonus: "this is exactly the problem Ansible/Terraform solve declaratively — bash is the manual version."

### Step 2 — Push the image to a registry (Docker Hub + ECR)

A registry is a "warehouse for images" — like npm is for packages. You build once, push to the warehouse, and any server pulls it by name.

**Option A — Docker Hub**

```bash
# 1. Log in (creates a token in ~/.docker/config.json — not a password on disk)
docker login -u YOUR_DOCKERHUB_USER

# 2. Tag your local image with username/repo:version
docker tag myapp:latest YOUR_DOCKERHUB_USER/myapp:1.0.0

# 3. Push
docker push YOUR_DOCKERHUB_USER/myapp:1.0.0

# On the server, IMAGE=YOUR_DOCKERHUB_USER/myapp:1.0.0 ./provision.sh
```

**Option B — AWS ECR (private)**

```bash
# Variables
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=ap-south-1
REPO=myapp

# 1. Create the repository (idempotent-ish: ignore "already exists")
aws ecr create-repository --repository-name "$REPO" --region "$REGION" \
  || echo "repo exists, continuing"

# 2. Authenticate Docker to ECR (token is valid for 12 HOURS)
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS \
      --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

# 3. Tag with the full ECR URI
docker tag myapp:latest \
  "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPO}:1.0.0"

# 4. Push
docker push "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPO}:1.0.0"

# On the server (which has the IAM role from Step 4), it pulls after the
# same get-login-password | docker login dance, then:
# IMAGE="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPO}:1.0.0" ./provision.sh
```

> **Caution:** The ECR login token **expires after 12 hours**. If a push or pull fails with `denied: Your authorization token has expired`, just re-run the `get-login-password | docker login` command. On servers, automate this in a wrapper before every pull.

> **Tip:** Tag with real **semantic versions** (`1.0.0`), not just `latest`. `latest` is ambiguous — two servers can pull "latest" on different days and run different code. Versioned tags make deploys reproducible and rollbacks trivial.

### Step 3 — Health-check script and timer

A container that's "running" isn't necessarily "working" — it might be deadlocked or returning 500s. A health check actually *asks* the app "are you okay?" by hitting an HTTP endpoint, with retries. It's the difference between "the engine is on" and "the car actually drives."

```bash
#!/usr/bin/env bash
# healthcheck.sh — verify the app responds; restart the container on repeated failure.
set -euo pipefail

URL="${URL:-http://localhost:8080/health}"   # use / if no /health route
CONTAINER="${CONTAINER:-myapp}"
MAX_RETRIES="${MAX_RETRIES:-5}"
RESTART_ON_FAIL="${RESTART_ON_FAIL:-true}"

attempt=1
delay=2
while (( attempt <= MAX_RETRIES )); do
  # -f: fail on HTTP >=400; -s: silent; -S: show errors; --max-time: hard timeout
  if curl -fsS --max-time 5 "${URL}" >/dev/null; then
    echo "OK: ${URL} healthy (attempt ${attempt})"
    exit 0
  fi
  echo "WARN: ${URL} failed (attempt ${attempt}/${MAX_RETRIES}); retrying in ${delay}s"
  sleep "${delay}"
  delay=$(( delay * 2 ))        # exponential backoff: 2,4,8,16...
  attempt=$(( attempt + 1 ))
done

echo "CRITICAL: ${URL} unhealthy after ${MAX_RETRIES} attempts" >&2
if [[ "${RESTART_ON_FAIL}" == "true" ]]; then
  echo "Restarting container '${CONTAINER}'..."
  docker restart "${CONTAINER}" || echo "restart failed" >&2
fi
exit 1     # non-zero exit => systemd/cron records the failure
```

**Wire it to a systemd timer** (preferred over cron: better logging via journald, accurate scheduling). Create two files:

```bash
# /etc/systemd/system/healthcheck.service
[Unit]
Description=App health check

[Service]
Type=oneshot
ExecStart=/usr/local/bin/healthcheck.sh
Environment=URL=http://localhost:8080/ CONTAINER=myapp
```

```bash
# /etc/systemd/system/healthcheck.timer
[Unit]
Description=Run health check every minute

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
Unit=healthcheck.service

[Install]
WantedBy=timers.target
```

```bash
# Enable it
sudo install -m 0755 healthcheck.sh /usr/local/bin/healthcheck.sh
sudo systemctl daemon-reload
sudo systemctl enable --now healthcheck.timer
systemctl list-timers healthcheck.timer    # confirm it's scheduled
```

**Prefer cron?** Same job, simpler logging:

```bash
# crontab -e  (runs every minute, logs to a file)
* * * * * URL=http://localhost:8080/ /usr/local/bin/healthcheck.sh >> /var/log/healthcheck.log 2>&1
```

> **Tip:** Exit `0` = healthy, non-zero = failure. systemd and monitoring tools watch exit codes — that's how alerting knows something's wrong. A script that always exits 0 is invisible to monitoring.

> **Caution:** Using `curl` without `-f` means a `500 Internal Server Error` still "succeeds" because curl got a response. `-f` makes curl fail on HTTP 4xx/5xx. Also: no `--max-time` means a hung app makes your check hang forever.

### Step 4 — S3 backups via an IAM instance role (no keys!)

**WHY a role instead of access keys?** An access key is a long-lived username+password for AWS. If you paste one onto a server and that server is compromised (or you accidentally `git push` the key), the attacker has your AWS account — and the key works forever until you notice. An **IAM instance role** is different: AWS clips a "temporary badge" to the EC2 box itself. The box automatically gets short-lived credentials (rotated every few hours, by AWS, invisibly). **Nothing sensitive is ever stored on disk.** If the box dies, the badge dies with it.

> **Tip:** Access keys = giving someone a permanent house key they could copy. Instance role = a hotel keycard the front desk re-issues automatically and that only works while you're checked into *that* room. Role is always better.

**4a. Create the least-privilege policy** — only `PutObject` on one bucket's path:

```bash
# backup-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::my-app-backups-2026/*"
    }
  ]
}
```

**4b. Create the role, attach the policy, wrap it in an instance profile, attach to the box:**

```bash
# Trust policy: lets EC2 assume this role
cat > trust.json <<'EOF'
{ "Version": "2012-10-17", "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "ec2.amazonaws.com" },
    "Action": "sts:AssumeRole" }]}
EOF

# 1. Create the role
aws iam create-role --role-name app-backup-role \
  --assume-role-policy-document file://trust.json

# 2. Attach the least-privilege policy inline
aws iam put-role-policy --role-name app-backup-role \
  --policy-name s3-backup-putobject \
  --policy-document file://backup-policy.json

# 3. Create an instance profile and put the role in it
aws iam create-instance-profile --instance-profile-name app-backup-profile
aws iam add-role-to-instance-profile \
  --instance-profile-name app-backup-profile --role-name app-backup-role

# 4. Attach the profile to the running EC2 instance
aws ec2 associate-iam-instance-profile \
  --instance-id i-0123456789abcdef0 \
  --iam-instance-profile Name=app-backup-profile

# 5. Verify from ON the box — should print backup-role creds metadata:
curl -s http://169.254.169.254/latest/meta-data/iam/security-credentials/
```

**4c. The backup script:**

```bash
#!/usr/bin/env bash
# backup.sh — tar app data, push to S3 (auth via instance role), prune old local files.
set -euo pipefail

DATA_DIR="${DATA_DIR:-/srv/myapp/data}"
BUCKET="${BUCKET:-my-app-backups-2026}"
LOCAL_DIR="${LOCAL_DIR:-/var/backups/myapp}"
KEEP_LOCAL="${KEEP_LOCAL:-3}"          # keep the 3 newest local tarballs

mkdir -p "${LOCAL_DIR}"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="${LOCAL_DIR}/myapp-${STAMP}.tar.gz"

echo "Creating ${ARCHIVE}"
tar -czf "${ARCHIVE}" -C "${DATA_DIR}" .

echo "Uploading to s3://${BUCKET}/backups/"
# NO --profile, NO keys: the CLI reads the instance-role creds automatically.
aws s3 cp "${ARCHIVE}" "s3://${BUCKET}/backups/myapp-${STAMP}.tar.gz"

echo "Pruning local backups (keeping newest ${KEEP_LOCAL})"
ls -1t "${LOCAL_DIR}"/myapp-*.tar.gz 2>/dev/null \
  | tail -n +"$(( KEEP_LOCAL + 1 ))" \
  | xargs -r rm -f

echo "Backup complete: ${STAMP}"
```

Schedule nightly (cron at 2am):

```bash
# crontab -e
0 2 * * * /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1
```

**IAM permissions for this project (least privilege):**

| Action | Resource | Used by | Why scoped this tight |
|---|---|---|---|
| `s3:PutObject` | `arn:aws:s3:::my-app-backups-2026/*` | backup.sh (instance role) | Can only write into ONE bucket. Can't read, can't delete, can't touch other buckets. |
| `ecr:GetAuthorizationToken` | `*` (required to be *) | ECR docker login | AWS requires `*` for the token call itself; harmless on its own. |
| `ecr:BatchGetImage`, `ecr:GetDownloadUrlForLayer` | repo ARN of `myapp` | docker pull from ECR | Pull only the one repo — not every image in the account. |
| `ecr:PutImage`, `ecr:UploadLayerPart` | repo ARN (dev/CI only) | docker push | Push rights belong to CI, not the runtime box. |

> **Caution:** If `aws s3 cp` returns `AccessDenied` or `Unable to locate credentials`: the role isn't attached (step 4b #4), or the policy's bucket ARN doesn't match, or you scoped the resource to `arn:aws:s3:::bucket` instead of `arn:aws:s3:::bucket/*` (object actions need the `/*`). Verify the badge with the metadata curl in 4b #5.

> **Tip:** Add an S3 **lifecycle rule** to auto-delete backups older than 30 days (or transition to Glacier) so the bucket doesn't grow forever and bill you.

### Step 5 — Log monitoring and what to look for

When something breaks at 2am, logs are the only witness.

**Monitoring commands cheat sheet:**

| Command | What it shows | When to reach for it |
|---|---|---|
| `docker logs -f --tail 100 myapp` | Last 100 lines of the container, then stream live | App is misbehaving right now |
| `docker logs --timestamps myapp` | Container logs with timestamps | Correlating an error to a deploy time |
| `journalctl -u docker` | The Docker daemon's own logs | Container won't start at all |
| `journalctl -u docker -f` | Stream daemon logs live | Watching during a restart |
| `journalctl -u healthcheck.service --since "10 min ago"` | Output of your health-check timer | Did the check fail and restart? |
| `tail -f /var/log/backup.log` | Backup script output live | Did last night's S3 backup work? |
| `journalctl -f` | Everything on the box, live | "Something" is wrong, casting a wide net |
| `docker stats myapp` | Live CPU/memory of the container | App feels slow / OOM suspected |

> **Tip:** **Repeated restarts** in `docker ps` (the `STATUS` column shows "Restarting") = a crash loop. **OOMKilled** in `docker inspect myapp` = ran out of memory. **Connection refused / timeout** in healthcheck logs = app not listening on the expected port. **AccessDenied** in backup.log = IAM role issue. Look for the *first* error in a burst — the rest are usually fallout.

Cap container log growth in `/etc/docker/daemon.json`:

```bash
// /etc/docker/daemon.json  — then: sudo systemctl restart docker
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
```

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| SSH dead right after running provision.sh | ufw enabled before allowing SSH port | Use EC2 serial console / instance reboot; ensure `ufw allow 22/tcp` runs first |
| `docker push` → `denied: token expired` | ECR login token >12h old | Re-run `aws ecr get-login-password \| docker login ...` |
| apt warns "duplicate sources" each run | Repo line appended (`>>`) not overwritten | Write the `docker.list` file with `>` |
| `aws s3 cp` → `AccessDenied` | Role not attached, or ARN missing `/*` | Attach instance profile; resource = `bucket/*` for object actions |
| `aws ... Unable to locate credentials` | No instance role and no keys | Attach the instance profile (Step 4b) |
| Container "running" but app unreachable | Port mapping wrong, or firewall blocks app port | Check `docker ps` ports + `ufw status`; allow `APP_PORT` |
| Healthcheck always passes despite 500s | `curl` missing `-f` | Add `-f` so HTTP >=400 fails |
| Disk full, everything crashing | Unbounded container logs | Set `max-size`/`max-file` in daemon.json |

### GitHub README template

```bash
# Automated Deploy + Monitoring

One-command, idempotent bootstrap for a containerized app on Ubuntu/EC2.
Pulls from a registry, runs behind a firewall, health-checks itself, and
backs up to S3 using an IAM instance role (zero credentials on the box).

## Architecture
Dev -> Image Registry (Docker Hub / ECR) -> EC2 (Docker + ufw + IAM role) -> S3

## Scripts
| File           | Purpose                                        |
|----------------|------------------------------------------------|
| provision.sh   | Idempotent bootstrap (Docker, ufw, run app)    |
| healthcheck.sh | curl + retry/backoff; restarts on failure      |
| backup.sh      | tar data, upload to S3 via role, prune local   |

## Usage
# On a fresh EC2 box:
IMAGE=YOUR_USER/myapp:1.0.0 APP_PORT=8080 sudo ./provision.sh

## Monitoring
docker logs -f --tail 100 myapp
journalctl -u healthcheck.service --since "10 min ago"
tail -f /var/log/backup.log

## Security
- No long-lived AWS keys: EC2 uses an IAM instance role (s3:PutObject only).
- ufw allows SSH + app port only.
- No secrets committed to this repo.

## License
MIT
```

> **Tip:** Resume bullets:
> - Authored an **idempotent bash provisioning script** (`set -euo pipefail`, guarded installs) that bootstraps a fresh Ubuntu EC2 host to a firewalled, containerized app in one command, cutting manual server setup from ~30 steps to a single re-runnable invocation.
> - Implemented **keyless S3 backups via an IAM instance role** with a least-privilege policy (`s3:PutObject` on a single bucket), eliminating long-lived access keys from production hosts and reducing credential-leak risk.
> - Built an automated **health-check + monitoring layer** (curl with exponential backoff on a systemd timer, container log rotation, journald-based observability) with auto-restart on repeated failure.

### Level it up

> **Note:** Where to go next:
> - **Metrics, not just logs**: install the **CloudWatch agent** (or run **Prometheus + Grafana**) to graph CPU/memory/request rate over time instead of eyeballing `docker stats`.
> - **Alerting**: wire health-check failures to an **SNS topic** or Slack webhook so you're paged before users complain.
> - **S3 lifecycle + versioning**: automate Glacier transition and 30-day expiry; enable bucket versioning so a bad backup can't overwrite a good one.
> - **From bash to IaC**: this hand-rolled idempotency is exactly what **Ansible/Terraform** do declaratively — the perfect on-ramp to **Project 4**, where a **CI pipeline** builds the image, pushes to ECR, and triggers this deploy automatically on every git push.

---

## Project 4 — Mini CI-Style Deploy Pipeline

A complete, hand-built **CI/CD pipeline** that takes a code change from your laptop all the way to a running container on an EC2 server — automatically, repeatably, and with a **rollback safety net**. You'll build it by hand first so you understand the magic, then see the exact same thing as a real GitHub Actions workflow.

Validate your GitHub Actions YAML before pushing with the [GitHub Actions Validator](/github-actions-validator/).

> **Real-world scenario:** A real CI/CD pipeline (Vercel, GitHub Actions, Jenkins, GitLab CI) does five things on every push: **(1)** checkout code, **(2)** build an artifact (here: a Docker image), **(3)** store it somewhere versioned (here: Amazon ECR), **(4)** deploy it to servers, **(5)** verify it's healthy and roll back if not. Companies pay for this so a junior dev can ship safely at 5pm on a Friday. You're going to build all five stages from scratch — that's the difference between someone who *uses* CI and someone who can *fix* CI when it breaks at 2am.

### Architecture — end to end

```
Dev laptop (git push)
  → Build (docker build)
  → Amazon ECR (tag = git SHA + :latest)
  → EC2 host (pull + redeploy + healthcheck)
  → Users (:80 / :443)

  Rollback path: healthcheck fails → pull PREVIOUS_TAG from ECR
  Secrets path: EC2 pulls secrets from SSM Parameter Store at deploy time
```

<figure class="dgm" role="img" aria-label="CI/CD pipeline flow: git push triggers build, test, image push to registry, then deploy to server">
<svg viewBox="0 0 680 120" width="680" height="120" xmlns="http://www.w3.org/2000/svg">
  <!-- git push -->
  <rect x="8" y="36" width="84" height="48" rx="7" fill="none" class="dgm-stroke" stroke-width="1.5"/>
  <text x="50" y="58" text-anchor="middle" font-size="11" class="dgm-ink">git push</text>
  <text x="50" y="74" text-anchor="middle" font-size="9" class="dgm-muted">main branch</text>
  <!-- arrow -->
  <line x1="92" y1="60" x2="112" y2="60" class="dgm-ink-stroke" stroke-width="1.5" fill="none"/>
  <polygon points="112,56 120,60 112,64" class="dgm-ink"/>
  <!-- CI Build -->
  <rect x="120" y="28" width="98" height="64" rx="7" class="dgm-accent-soft" fill="none" stroke-width="0"/>
  <rect x="120" y="28" width="98" height="64" rx="7" fill="none" class="dgm-accent-stroke" stroke-width="2"/>
  <text x="169" y="54" text-anchor="middle" font-size="11" class="dgm-ink">CI: Build</text>
  <text x="169" y="70" text-anchor="middle" font-size="10" class="dgm-muted">docker build</text>
  <text x="169" y="83" text-anchor="middle" font-size="9" class="dgm-muted">tag: git SHA</text>
  <!-- arrow -->
  <line x1="218" y1="60" x2="238" y2="60" class="dgm-ink-stroke" stroke-width="1.5" fill="none"/>
  <polygon points="238,56 246,60 238,64" class="dgm-ink"/>
  <!-- Test -->
  <rect x="246" y="28" width="88" height="64" rx="7" fill="none" class="dgm-stroke" stroke-width="2"/>
  <text x="290" y="54" text-anchor="middle" font-size="11" class="dgm-ink">Test</text>
  <text x="290" y="70" text-anchor="middle" font-size="10" class="dgm-muted">run tests</text>
  <text x="290" y="83" text-anchor="middle" font-size="9" class="dgm-muted">exit 0 = pass</text>
  <!-- arrow -->
  <line x1="334" y1="60" x2="354" y2="60" class="dgm-ink-stroke" stroke-width="1.5" fill="none"/>
  <polygon points="354,56 362,60 354,64" class="dgm-ink"/>
  <!-- Push registry -->
  <rect x="362" y="28" width="104" height="64" rx="7" fill="none" class="dgm-stroke" stroke-width="2"/>
  <text x="414" y="50" text-anchor="middle" font-size="11" class="dgm-ink">Push</text>
  <text x="414" y="66" text-anchor="middle" font-size="10" class="dgm-muted">ECR registry</text>
  <text x="414" y="79" text-anchor="middle" font-size="9" class="dgm-muted">SHA + :latest</text>
  <!-- arrow -->
  <line x1="466" y1="60" x2="486" y2="60" class="dgm-ink-stroke" stroke-width="1.5" fill="none"/>
  <polygon points="486,56 494,60 486,64" class="dgm-ink"/>
  <!-- Deploy -->
  <rect x="494" y="28" width="110" height="64" rx="7" class="dgm-accent-soft" fill="none" stroke-width="0"/>
  <rect x="494" y="28" width="110" height="64" rx="7" fill="none" class="dgm-accent-stroke" stroke-width="2"/>
  <text x="549" y="50" text-anchor="middle" font-size="11" class="dgm-ink">Deploy</text>
  <text x="549" y="66" text-anchor="middle" font-size="10" class="dgm-muted">EC2 pull</text>
  <text x="549" y="79" text-anchor="middle" font-size="9" class="dgm-muted">healthcheck</text>
  <!-- arrow -->
  <line x1="604" y1="60" x2="626" y2="60" class="dgm-ink-stroke" stroke-width="1.5" fill="none"/>
  <polygon points="626,56 634,60 626,64" class="dgm-ink"/>
  <!-- Live -->
  <rect x="634" y="36" width="40" height="48" rx="7" fill="none" class="dgm-stroke" stroke-width="1.5"/>
  <text x="654" y="56" text-anchor="middle" font-size="10" class="dgm-ink">Live</text>
  <text x="654" y="70" text-anchor="middle" font-size="9" class="dgm-muted">:80</text>
  <!-- rollback note -->
  <text x="549" y="106" text-anchor="middle" font-size="9" class="dgm-muted">healthcheck fail → auto-rollback to PREVIOUS_TAG</text>
</svg>
<figcaption>Every git push to main triggers the pipeline: build image, run tests, push to ECR with an immutable SHA tag, deploy to EC2 with a healthcheck gate, and auto-rollback on failure.</figcaption>
</figure>

The two dashed paths: the **rollback path** (if the new version is sick, the host redeploys the previous SHA) and the **secrets path** (the host pulls secrets from SSM at deploy time, so nothing sensitive ever lives in the image).

### Prerequisites and time

| You need | Why |
|---|---|
| Projects 1–3 done (Linux, networking, Docker, an EC2 host) | This capstone glues them together |
| An ECR repository created (e.g. `myapp`) | Versioned image storage |
| AWS CLI v2 configured locally + on the EC2 instance | ECR login, SSM reads |
| A small app with a `Dockerfile` and a `/health` endpoint | Healthcheck-gated deploys need it |
| SSH access to the EC2 host (key pair) | The dev machine drives the redeploy over SSH |

**Time:** ~3–4 hours for the hand-built version, +1 hour to convert it to GitHub Actions.

### Pipeline walkthrough

1. **Code change** — commit + git SHA
2. **Build image** — `docker build`
3. **Push to ECR** — SHA tag + latest
4. **Pull on EC2** — ECR login + pull
5. **Redeploy** — stop old, run new (on side port)
6. **Healthcheck** — `curl /health` with retry
7. **Rollback** — if healthcheck fails, re-run `PREVIOUS_TAG`
8. **Live + healthy** — serve users

### Step 1 — Version images by immutable git SHA, not :latest

Every build gets tagged with the exact commit it came from. `git rev-parse --short HEAD` gives you something like `a1b2c3d` — a permanent, unique fingerprint of that code. Push **two** tags: the immutable SHA tag (for rollback) and a moving `:latest` (for "what's current").

```bash
SHA=$(git rev-parse --short HEAD)   # e.g. a1b2c3d
echo "Building version: $SHA"
```

**Why this matters:** Think of `:latest` like a sticky note that says "the newest one." If you only ever tag `:latest` and today's build is broken, there is **no other version to go back to** — `:latest` got overwritten. The old good image still exists in ECR but you have no name to refer to it by. With SHA tags, every version has its own permanent label, so rollback is just "pull the previous SHA." Immutable tags are the **foundation** that makes the whole rollback story possible.

> **Tip:** Tag by **immutable git SHA** (or a build number that never repeats). Treat `:latest` as a convenience pointer, never as something you roll back to. In ECR, you can even enable **tag immutability** so a SHA tag physically cannot be overwritten — extra safety.

> **Caution:** Deploying `:latest` only. Six weeks later prod is broken, your boss says "roll back," and you realize you literally cannot — there's no tag pointing at the last good image. `:latest` for rollback is the #1 way teams paint themselves into a corner.

### Step 2 — The build and push script (deploy.sh on the dev side)

This script runs on your laptop (later: in CI). It builds the image, tags it with the SHA **and** latest, logs in to ECR, and pushes both.

```bash
#!/usr/bin/env bash
set -euo pipefail
# -e  exit on any error      -u  error on unset variable
# -o pipefail  fail if any command in a pipe fails

# ---- config ----
AWS_REGION="ap-south-1"
ACCOUNT_ID="123456789012"
REPO="myapp"
ECR="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
SHA="$(git rev-parse --short HEAD)"

echo "==> Building ${REPO}:${SHA}"
docker build -t "${REPO}:${SHA}" .

# tag for ECR: both the immutable SHA and the moving latest
docker tag "${REPO}:${SHA}" "${ECR}/${REPO}:${SHA}"
docker tag "${REPO}:${SHA}" "${ECR}/${REPO}:latest"

echo "==> Logging in to ECR"
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ECR}"

echo "==> Pushing"
docker push "${ECR}/${REPO}:${SHA}"
docker push "${ECR}/${REPO}:latest"

echo "==> Done. Deployed version: ${SHA}"
```

**Why `set -euo pipefail`?** Without `-e`, a failed `docker build` would happily continue to push a stale image. Without `-u`, a typo'd variable becomes an empty string. Without `pipefail`, the `get-login-password | docker login` pipe could "succeed" even when login failed. These three flags turn silent disasters into loud, early failures.

> **Tip:** The ECR login token from `get-login-password` is valid for **12 hours**. If a long-lived box logged in yesterday, today's `docker push` fails with `no basic auth credentials`. Always log in fresh inside the same script run.

> **Caution:** Never pass secrets via `--build-arg API_KEY=...` or bake an `.env` into the image. Build args and every layer command are visible forever in `docker history`. Secrets go in at *deploy time* (Step 4), not build time.

### Step 3 — Least-privilege IAM for the CI principal and the instance

Two different identities, two minimal policies. The **CI principal** (your build) only needs to *push* to one ECR repo. The **EC2 instance role** only needs to *pull* from that repo and *read* secrets under one SSM path. Neither gets `*`.

**CI principal — push to ONE repo only:**

```bash
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EcrAuth",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "PushToOneRepo",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage"
      ],
      "Resource": "arn:aws:ecr:ap-south-1:123456789012:repository/myapp"
    }
  ]
}
```

`GetAuthorizationToken` has no resource scope in the API, so it must be `"*"` — but it only mints a login token, it can't push anything by itself. The actual push actions are locked to the single `myapp` repo ARN.

**EC2 instance role — pull + read secrets under one path:**

```bash
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EcrPull",
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ReadSecretsOnPath",
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:GetParametersByPath"
      ],
      "Resource": "arn:aws:ssm:ap-south-1:123456789012:parameter/myapp/prod/*"
    }
  ]
}
```

| Identity | Can do | Cannot do |
|---|---|---|
| CI principal | Push images to `myapp` only | Delete repos, push to other repos, read secrets, touch EC2 |
| EC2 instance role | Pull `myapp` images, read `/myapp/prod/*` secrets | Push images, read other apps' secrets, write SSM |

> **Tip:** Scope by **resource ARN** and by **SSM path prefix**. If the CI key ever leaks, the blast radius is "push to one repo" — not "delete our whole AWS account."

> **Note:** "Why does `ecr:GetAuthorizationToken` use `Resource: *` but the push actions don't?" That API call isn't tied to a specific repository in IAM — it only returns a temporary login token. The privilege that actually matters (PutImage) is scoped to one repo. Showing you understand this distinction signals real IAM depth.

### Step 4 — Secrets at deploy time (SSM Parameter Store, never in the image)

The image must be **generic** — the same image runs in dev, staging, prod, with no secrets baked in. Secrets are injected at the moment of running the container. Store them once in SSM:

```bash
# store a secret (encrypted with KMS) — do this once
aws ssm put-parameter \
  --name "/myapp/prod/DB_PASSWORD" \
  --type SecureString \
  --value "s3cr3t-not-in-git" \
  --region ap-south-1
```

At deploy time, the EC2 host pulls and decrypts it, writes an env file with locked perms:

```bash
ENV_FILE="/etc/myapp/prod.env"
sudo mkdir -p /etc/myapp

# pull the secret with decryption, write to a 600-perm env file
DB_PASSWORD="$(aws ssm get-parameter \
  --name /myapp/prod/DB_PASSWORD \
  --with-decryption \
  --query 'Parameter.Value' --output text \
  --region ap-south-1)"

umask 077                                   # new file = owner-only
printf 'DB_PASSWORD=%s\n' "$DB_PASSWORD" | sudo tee "$ENV_FILE" >/dev/null
sudo chmod 600 "$ENV_FILE"                  # only root can read

# run the container with secrets injected at runtime
docker run -d --name myapp --env-file "$ENV_FILE" -p 80:8080 "$IMAGE"
```

| Approach | Pro | Con |
|---|---|---|
| Bake into image | Simple | Leaks via `docker history`; can't rotate; same image can't go to two envs. **Never do this.** |
| Locked-perm env file on host | Easy, works with `--env-file` | Secret sits on disk (mode 600); rotate by re-deploying |
| SSM Parameter Store (SecureString) | Central, encrypted, audited, IAM-scoped, rotatable | Tiny deploy-time latency; needs the instance role from Step 3 |
| AWS Secrets Manager | Auto-rotation, versioning | Costs per secret; overkill for a learning project |

> **Caution:** (1) Committing `.env` to git — add it to `.gitignore` day one. (2) Putting the secret on the `docker run` command line — it shows in `ps` and shell history. Use `--env-file` instead. (3) Logging the secret value — never `echo` it in CI.

> **Tip:** SSM **Standard** parameters are free; Secrets Manager charges ~$0.40/secret/month. For a portfolio project, SSM Standard SecureString gives you encryption + IAM scoping at zero cost.

### Step 5 — The redeploy script on EC2 with automatic rollback

This is the heart of the capstone. It runs on the EC2 host (or you SSH into it). It records the **currently running SHA as PREVIOUS_TAG**, deploys the new SHA, healthchecks it, and if the healthcheck fails it **automatically rolls back** to the previous SHA. The new container is started on a temporary name and only swapped in *after* it's proven healthy — no race.

```bash
#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="ap-south-1"
ECR="123456789012.dkr.ecr.${AWS_REGION}.amazonaws.com"
REPO="myapp"
NEW_TAG="${1:?Usage: redeploy.sh <git-sha>}"   # passed in by the build side
PORT=80
APP_PORT=8080
ENV_FILE="/etc/myapp/prod.env"
HEALTH_URL="http://localhost:${PORT}/health"
STATE_FILE="/etc/myapp/current_tag"

# ---- 1. remember what is currently live (for rollback) ----
PREVIOUS_TAG="$(cat "$STATE_FILE" 2>/dev/null || echo "")"
echo "==> Current live tag: ${PREVIOUS_TAG:-none}"
echo "==> Deploying new tag: ${NEW_TAG}"

# ---- 2. ECR login (token good for 12h) and pull the new image ----
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR"
docker pull "${ECR}/${REPO}:${NEW_TAG}"

# ---- 3. start the NEW container on a temp name + temp port ----
docker rm -f myapp_new 2>/dev/null || true
docker run -d --name myapp_new \
  --env-file "$ENV_FILE" \
  -p 18080:${APP_PORT} \
  "${ECR}/${REPO}:${NEW_TAG}"

# ---- 4. healthcheck the new container BEFORE swapping ----
ok=0
for i in $(seq 1 15); do
  if curl -fsS "http://localhost:18080/health" >/dev/null 2>&1; then
    ok=1; break
  fi
  echo "   waiting for new container... ($i)"; sleep 2
done

rollback() {
  echo "!!  Healthcheck FAILED — rolling back"
  docker rm -f myapp_new 2>/dev/null || true
  if [ -n "$PREVIOUS_TAG" ]; then
    docker rm -f myapp 2>/dev/null || true
    docker run -d --name myapp --env-file "$ENV_FILE" -p ${PORT}:${APP_PORT} \
      "${ECR}/${REPO}:${PREVIOUS_TAG}"
    echo "==> Rolled back to ${PREVIOUS_TAG}"
  else
    echo "==> No previous tag to roll back to. Manual fix needed."
  fi
  exit 1
}

[ "$ok" -eq 1 ] || rollback

# ---- 5. healthy! swap: stop old, promote new to real name + port ----
echo "==> New container healthy. Promoting."
docker rm -f myapp_new                          # remove temp
docker rm -f myapp 2>/dev/null || true          # stop old live one
docker run -d --name myapp --env-file "$ENV_FILE" -p ${PORT}:${APP_PORT} \
  "${ECR}/${REPO}:${NEW_TAG}"

# final smoke test on the real port; rollback if it somehow fails
if ! curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then rollback; fi

# ---- 6. record the new live tag for next time's rollback ----
echo "$NEW_TAG" | sudo tee "$STATE_FILE" >/dev/null
echo "==> Deploy complete. Live tag is now ${NEW_TAG}"
```

**Why the temp container + temp port?** This avoids the classic **race condition**: if you stop the old container *before* the new one is proven healthy, users get a hard outage during the gap — and if the new one is broken, you've taken the site down for nothing. By bringing the new one up on a side port first, healthchecking it, and only then swapping, the live site stays up the whole time.

> **Tip:** Deploys are **gated on health** (no green check, no promotion) and **idempotent** (running the script twice with the same SHA leaves you in the same state, thanks to `docker rm -f ... || true`). Both are hallmarks of production-grade automation.

> **Caution:** **Race condition:** `docker stop old && docker run new` with no health gate = guaranteed downtime when new is broken. **ECR token expiry:** a host that logged in 13 hours ago fails the pull — log in fresh every run. **No PREVIOUS_TAG persisted:** if you don't write `current_tag` to disk, a fresh shell has nothing to roll back to.

### Step 6 — Rollback strategy: simple previous-tag vs blue/green

You just built **simple previous-tag rollback**: one live container, keep a pointer to the last good SHA, and on failure re-run that SHA. It's cheap and easy to reason about.

**Blue/green** runs *two* full environments — "blue" (current) and "green" (new) — both live at once behind a load balancer. You deploy to green, healthcheck it, then flip the load balancer to point 100% of traffic at green. Rollback = flip back to blue, instantly, with zero rebuild. **Canary** is the same idea but you send only 5% of traffic to green first, watch metrics, then ramp up.

| Strategy | How rollback works | Cost / complexity | Downtime |
|---|---|---|---|
| Previous-tag (this project) | Re-run last good SHA | Lowest — one host, one container | Near-zero (side-port swap) |
| Blue/green | Flip LB back to blue | 2× infra while both run | Zero, instant rollback |
| Canary | Shift traffic % back to old | Highest — needs metrics + traffic splitting | Zero, gradual |

> **Tip:** Every one of these depends on the **immutable SHA tags** from Step 1 and a **healthcheck** from Step 5. The tag gives you a thing to roll back *to*; the healthcheck gives you the signal to *decide*. Master those two and you can implement any of these strategies — they only differ in how traffic is switched.

### Step 7 — Where Jenkins / GitHub Actions fit (real workflow with OIDC)

Everything you did by hand maps one-to-one onto a CI tool. CI just runs your scripts on a fresh machine, triggered by `git push`.

| Manual step | CI equivalent |
|---|---|
| You run `deploy.sh` on your laptop | GitHub Actions runner runs it on `push` |
| `git rev-parse --short HEAD` | `${{ github.sha }}` |
| `aws configure` with your keys | OIDC assume-role — short-lived creds, no stored keys |
| SSH into EC2 to run `redeploy.sh` | `appleboy/ssh-action` or `aws ssm send-command` |
| You eyeball the healthcheck output | Workflow fails red if the script exits non-zero |

```yaml
# .github/workflows/deploy.yml
name: deploy
on:
  push:
    branches: [main]

permissions:
  id-token: write      # REQUIRED for OIDC
  contents: read

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    env:
      AWS_REGION: ap-south-1
      ECR: 123456789012.dkr.ecr.ap-south-1.amazonaws.com
      REPO: myapp
    steps:
      - uses: actions/checkout@v4

      # OIDC: GitHub presents a signed token, AWS hands back
      # short-lived creds. No access keys ever stored in GitHub.
      - name: Configure AWS via OIDC
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-ci-deploy
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to ECR
        run: |
          aws ecr get-login-password --region "$AWS_REGION" \
            | docker login --username AWS --password-stdin "$ECR"

      - name: Build & push (SHA + latest)
        run: |
          SHA="${GITHUB_SHA::7}"
          docker build -t "$ECR/$REPO:$SHA" -t "$ECR/$REPO:latest" .
          docker push "$ECR/$REPO:$SHA"
          docker push "$ECR/$REPO:latest"
          echo "SHA=$SHA" >> "$GITHUB_ENV"

      - name: Redeploy on EC2 over SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ec2-user
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            /home/ec2-user/redeploy.sh ${{ env.SHA }}
```

> **Tip:** With OIDC, GitHub proves its identity to AWS for each run and gets **short-lived** credentials scoped to one role — nothing long-lived to leak. The old way (storing `AWS_ACCESS_KEY_ID` as a GitHub secret) means a permanent key that, if exposed, works until someone manually rotates it. The role's trust policy pins it to your repo:

```bash
"Condition": {
  "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
  "StringLike": { "token.actions.githubusercontent.com:sub": "repo:my-org/myapp:ref:refs/heads/main" }
}
```

> **Note:** Jenkins vs GitHub Actions: Jenkins = you host the server yourself, pipelines in a `Jenkinsfile`, huge plugin ecosystem, common in older/enterprise shops. GitHub Actions = managed, YAML in your repo, tightly integrated with the code, OIDC built in. The *concepts* are identical — checkout, build, push, deploy, gate on tests. Say that and you sound tool-agnostic, which is exactly what hiring managers want.

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `no basic auth credentials` on push/pull | ECR token expired (>12h) or never logged in | Re-run `aws ecr get-login-password \| docker login` in the same script |
| Push denied: `not authorized to perform ecr:PutImage` | IAM policy scoped to wrong repo ARN or region | Match the ARN in Step 3 to your repo + region exactly |
| Healthcheck always fails | Wrong port, app not listening yet, no `/health` route | Increase retry loop, confirm `APP_PORT`, add the route |
| Rollback says "no previous tag" | `STATE_FILE` empty (first deploy or never written) | Expected on first deploy; ensure Step 5's final `tee` runs |
| OIDC: `Not authorized to perform sts:AssumeRoleWithWebIdentity` | Trust policy `sub` doesn't match repo/branch, or `id-token: write` missing | Fix the `StringLike` condition + add the permissions block |
| Secret is empty in container | SSM path wrong, instance role lacks `ssm:GetParameter`, or missing `--with-decryption` | Check Step 3 instance policy + Step 4 command |
| Brief outage on every deploy | Old container stopped before new is healthy (race) | Use the side-port deploy from Step 5 |

### GitHub README template

```bash
# myapp — Mini CI/CD Deploy Pipeline

Hand-built CI/CD: build → push to ECR → pull & redeploy on EC2,
with healthcheck-gated deploys and automatic rollback.

## Architecture
git push → docker build → ECR (tag = git SHA + latest)
        → EC2 pull → side-port deploy → healthcheck
        → promote (or auto-rollback to PREVIOUS_TAG)

## Stack
- Docker, Amazon ECR, EC2 (Amazon Linux)
- AWS SSM Parameter Store for secrets (SecureString)
- GitHub Actions with OIDC (no long-lived keys)

## Key decisions
- Images tagged by immutable git SHA so rollback is always possible.
- Secrets injected at runtime via --env-file; never baked into the image.
- Least-privilege IAM: CI can only push to one repo; instance can only
  pull + read /myapp/prod/* secrets.
- Deploys are healthcheck-gated and idempotent; failed deploys auto-roll-back.

## Deploy
    ./deploy.sh                 # build + push from dev (or via CI on push to main)
    ./redeploy.sh <git-sha>     # runs on EC2: pull, deploy, healthcheck, rollback

## Rollback
Automatic on failed healthcheck. Manual:
    ./redeploy.sh <previous-sha>
```

> **Tip:** Resume bullets:
> - Built a containerized CI/CD pipeline (Docker + Amazon ECR + EC2) with **immutable git-SHA image tags** and **healthcheck-gated deploys**, enabling zero-downtime releases and one-command rollback.
> - Implemented **automatic rollback**: new builds deploy to a side port, are healthchecked before promotion, and fall back to the previous SHA on failure — eliminating broken-deploy outages.
> - Hardened the pipeline with **least-privilege IAM** (CI scoped to a single ECR repo, instance role scoped to one SSM path), **runtime secret injection via SSM SecureString**, and **GitHub Actions OIDC** to remove all long-lived AWS keys.

### Level it up

- **Managed orchestration:** move from a single EC2 to **ECS** or **EKS** — they give you rolling deploys, healthchecks, and rollback as built-in features instead of bash. See [Kubernetes for DevOps](/learn/guides/kubernetes-for-devops/) for a full walkthrough.
- **GitOps:** **ArgoCD** watches a git repo and reconciles your cluster to match — deploy = merge a PR; rollback = revert the commit.
- **Canary:** shift 5% of traffic to the new version via an ALB or service mesh, watch error rates, then ramp to 100%.
- **IaC:** define the ECR repo, IAM roles, and EC2/ECS in **Terraform** so the whole platform is reproducible and code-reviewed.
- **Observability:** ship logs/metrics to CloudWatch or Grafana so a failing deploy alerts you *and* can auto-trigger rollback on error-rate spikes, not just a single healthcheck.

> **Note:** Step back and look at what just happened. **Linux** (bash scripting, file permissions, env files), **Networking** (ports, healthcheck endpoints, the side-port swap, SSH), **Docker** (build, tag, registry, run, lifecycle), and **AWS** (ECR, EC2, IAM, SSM, OIDC) — all four pillars working together in one pipeline you understand down to the line. You're no longer someone who *uses* a deploy button; you're someone who could *build* the button. That's the DevOps mindset. Go ship something.

---

## Interview-Prep Cheat Sheet

You've now built the full stack of a small production system by hand. These are the connect-the-dots questions interviewers love — and you can answer every one from your own projects.

| Question | Your answer comes from |
|---|---|
| "Walk me through what happens when a request hits your app." | Project 2 — DNS → SG → nginx :80 → reverse proxy → app container on the docker network → DB. |
| "How do you avoid putting AWS keys on a server?" | Project 3 — IAM **instance role** / instance profile; the SDK pulls temporary creds from the metadata endpoint. |
| "How would you roll back a bad deploy?" | Project 4 — immutable image tags (git SHA), keep PREVIOUS_TAG, healthcheck-gated redeploy auto-reverts. |
| "Why a private subnet for the database?" | Project 2 — no route to the internet gateway = no inbound from the internet; blast-radius reduction. |
| "What makes a deploy script production-safe?" | Project 3 — `set -euo pipefail`, idempotency, no secrets in the script, least-privilege IAM. |
| "Difference between a security group and ufw?" | Project 1 — SG = cloud firewall at the ENI (stateful, AWS-side); ufw = host firewall inside the OS. Defense in depth. |

> **Note:** When asked any "how would you…" question, answer with "In my project I did X because Y, and in production I'd extend it with Z." That structure shows hands-on experience *and* awareness of the next step — exactly what hiring managers want from a career-switcher.

> **Tip:** Across all four projects, five habits repeat: least-privilege IAM, never bake secrets into images, tag every resource (Name/Environment/Owner), make scripts idempotent, and gate deploys on health checks. Mention these unprompted and you'll stand out.

> **Note:** Prefer a day-by-day path? This is covered in [**Mission 90 Days 41–45**](/mission-90/) — a free 90-day guided DevOps program with browser terminal missions.
