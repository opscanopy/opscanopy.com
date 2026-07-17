---
title: "AWS for DevOps Engineers: The Core Services You Actually Need"
description: "A practical guide to AWS for DevOps engineers — IAM, EC2, VPC, S3, RDS, Lambda, the CLI, plus cost and security best practices."
track: aws
order: 1
difficulty: beginner
estMinutes: 55
updatedDate: 2026-06-27
tags: ["aws", "cloud", "devops", "iam", "ec2", "vpc"]
relatedTools: ["subnet-calculator", "cidr-checker"]
seoTitle: "AWS for DevOps Engineers: Core Services Guide"
metaDescription: "A practical guide to AWS for DevOps engineers — IAM, EC2, VPC, S3, RDS, Lambda, the CLI, plus cost and security best practices. Free, hands-on."
faqs:
  - q: "Which AWS services should a DevOps engineer learn first?"
    a: "Start with IAM (identity), EC2 (compute), VPC (networking), and S3 (storage), then RDS and Lambda. These cover the foundation most pipelines and workloads build on."
  - q: "What is the difference between an IAM role and an IAM policy?"
    a: "A policy is a JSON document granting permissions; a role is an identity that can be assumed (by a user, service, or EC2 instance) and has policies attached. Roles avoid long-lived keys."
  - q: "When should I use Lambda vs EC2?"
    a: "Use Lambda for short, event-driven, bursty workloads with no server management; use EC2 when you need long-running processes, full OS control, or predictable steady load."
  - q: "How do IAM roles work for EC2 instances?"
    a: "Attach an instance profile (role) to the EC2 instance; the SDK/CLI then fetches temporary credentials from instance metadata automatically — no access keys to store."
  - q: "What are the best AWS cost optimization practices for DevOps?"
    a: "Right-size instances, use auto-scaling and spot where appropriate, set budgets/alerts, clean up unused EBS/EIPs, apply S3 lifecycle rules, and tag resources for cost attribution."
  - q: "What is the difference between a security group and a network ACL?"
    a: "Security groups are stateful, instance-level allow rules; network ACLs are stateless, subnet-level allow/deny rules. Use security groups for most cases and NACLs for coarse subnet controls."
---

A focused, interview-ready guide built for a developer moving into DevOps. Depth on the services that actually show up in DevOps work and interviews — not all 200+ AWS offerings. This guide covers Regions and AZs, IAM, EC2, Lambda, containers, VPC networking, S3/EBS/EFS storage, RDS and DynamoDB, the AWS CLI, and cost and security guardrails. See the [AWS roadmap](/learn/roadmaps/aws/) for a structured learning path through certifications and deeper specialisations.

## AWS Fundamentals

Before you touch a single EC2 instance, you need the mental map: **where** your stuff runs (Regions & AZs), **who is responsible** for what (Shared Responsibility), and **how you pay** for it (Billing & Free Tier). Get these three right and you avoid 90% of the surprises beginners hit.

### Regions and Availability Zones

AWS physically runs in **Regions** (e.g. `us-east-1` = N. Virginia, `eu-west-1` = Ireland, `ap-southeast-1` = Singapore). Each Region is a cluster of isolated datacenters grouped into **Availability Zones (AZs)**. An AZ is one or more physical datacenters with independent power, cooling, and networking, but AZs in the same Region are linked by low-latency private fiber.

- **Region** = a city (N. Virginia). A geographic area you pick.
- **AZ** = separate neighborhoods in that city (`us-east-1a`, `us-east-1b`, `us-east-1c`), each with its own power grid, far enough apart that one flood/fire won't take down another.
- **Edge Location** = a corner shop close to your house — used by CloudFront (CDN) and Route 53 to cache content near users for speed.

> **Note:** Think of a Region like a big housing society in one city. Each AZ is a separate building (Tower A, B, C) with its *own* generator and water tank. If Tower A's power trips, Tower B is fine. So you spread your app across multiple towers — that's **Multi-AZ**. Edge Locations are the ATMs scattered all over the city so you don't have to drive to the main bank for cash.

#### Why Multi-AZ Matters for High Availability

If you run everything in one AZ and that AZ goes down, your app goes down. Period. Running across 2+ AZs means a failure in one is automatically absorbed by the others.

- **Multi-AZ RDS**: a standby DB copy sits in another AZ; on failure AWS auto-promotes it (failover in ~60–120s).
- **EC2 + ELB Auto Scaling**: spread instances across AZs; the load balancer routes around the dead AZ.
- **Multi-Region** is the next level up — for disaster recovery (DR) and global latency, not just AZ failure. It costs more and is harder (data replication, DNS failover).

> **Note:** A fintech runs its API on EC2 across `us-east-1a` and `us-east-1b` behind an Application Load Balancer, with RDS in Multi-AZ mode. When AWS had an AZ-level network issue, the ALB stopped sending traffic to the unhealthy AZ and RDS failed over to the standby. End users saw a 90-second blip instead of an outage. Single-AZ would have meant hours of downtime.

#### How to Choose a Region

| Factor | What to check |
|---|---|
| **Latency** | Pick the Region closest to your *users*. Users in Southeast Asia → `ap-southeast-1`. Test with cloudping or RTT measurements. |
| **Cost** | Prices differ per Region. `us-east-1` is usually cheapest; some Regions (e.g. Sydney, São Paulo) can be pricier. Same instance, different bill. |
| **Compliance / Data residency** | Customer/financial data may legally need to stay in-country → pick the matching Region. GDPR data → an EU Region like `eu-west-1`. |
| **Service availability** | Newest services launch in `us-east-1` first. Some Regions lag. Check before committing. |

> **Tip:** Some services are **global**, not regional: IAM, Route 53, CloudFront, and WAF (for CloudFront). But the AWS console quietly defaults a lot of regional resources to `us-east-1` — always confirm your selected Region (top-right of the console) before creating resources, or you'll "lose" an EC2 instance that's actually running (and billing) in the wrong Region.

#### Region vs AZ vs Edge Location

| | Region | Availability Zone | Edge Location |
|---|---|---|---|
| **What it is** | Geographic area (a city) | 1+ isolated datacenters in a Region | Small CDN/cache PoP near users |
| **Count** | 30+ globally | Usually 3+ per Region | 400+ globally |
| **Used for** | Choosing where to deploy | HA & fault tolerance within a Region | Caching content close to users (low latency) |
| **Example service** | Picked when launching EC2/RDS | Multi-AZ RDS, Auto Scaling groups | CloudFront, Route 53, Global Accelerator |
| **Isolation** | Fully isolated from other Regions | Independent power/cooling/network | Not for compute — caching only |

> **Tip:** Classic question: "What's the difference between Multi-AZ and Multi-Region?" Answer crisply: **Multi-AZ = High Availability** within one Region (handles datacenter/AZ failure, automatic, low cost). **Multi-Region = Disaster Recovery + global reach** across Regions (handles a whole-Region failure, more complex, costlier, needs data replication and DNS failover). Don't conflate them.

### Shared Responsibility Model

AWS does NOT secure everything for you. Security and compliance are **shared**. The line is simple to remember:

- **AWS is responsible for the security OF the cloud** — the hardware, the physical datacenters, the host hypervisor, networking backbone, and the managed-service infrastructure.
- **You are responsible for security IN the cloud** — your data, your OS patches (on EC2), your IAM users/roles, your security groups, your application code, encryption settings.

> **Note:** AWS is like a rental apartment building. The landlord (AWS) handles the building structure, the main gate security, the foundation, electricity supply. But *inside your flat* — locking your own door, what you keep inside, who you give a duplicate key to (IAM keys!) — that's on you. If you leave your flat door wide open, you can't blame the landlord.

| AWS — "OF the cloud" | You (DevOps) — "IN the cloud" |
|---|---|
| Physical datacenter & hardware security | IAM users, roles, groups, MFA, least privilege |
| Hypervisor & host OS patching | Guest OS patching on EC2 (you own the AMI/instance) |
| Global network infrastructure | Security Groups, NACLs, VPC subnet design |
| Managed service uptime (S3, RDS engine, Lambda runtime) | Your data, client/server-side encryption, S3 bucket policies (don't make it public by accident!) |
| Decommissioning/wiping failed disks | Your application code & its vulnerabilities |

> **Caution:** The responsibility line *shifts* with the service type. On **EC2 (IaaS)** you patch the OS. On **RDS (PaaS)** AWS patches the DB engine but you still manage users, schemas, and encryption. On **Lambda/S3 (serverless/managed)** AWS handles even more, but data security and access policies are *always* yours. The most common breach in the news? A publicly-exposed S3 bucket — 100% the customer's fault, never AWS's.

### Billing and Free Tier

AWS pricing is fundamentally **pay-as-you-go**: no upfront cost (unless you choose to commit), you pay only for what you actually use — per second/hour of compute, per GB of storage, per GB of data transfer out. No usage = (mostly) no bill. But "mostly" is where beginners get bitten.

> **Note:** Pay-as-you-go is like an electricity meter, not a fixed monthly rent. You only pay for the units you burn. But some things keep the meter running even when you're "not using" them — like a reserved parking spot you booked but left empty (an idle Elastic IP), or a security guard you hired and forgot to send home (a running NAT Gateway). The meter doesn't care that you forgot.

#### The 3 Types of Free Tier

| Type | How long | Examples |
|---|---|---|
| **Always Free** | Forever (within limits) | Lambda 1M requests/month, DynamoDB 25 GB, CloudWatch basic metrics |
| **12-Month Free** | 12 months from signup | EC2 `t2.micro`/`t3.micro` 750 hrs/mo, S3 5 GB, RDS 750 hrs/mo |
| **Trials** | Short fixed window (e.g. 30/90 days) | Short-term service trials like certain SageMaker/Inspector features |

> **Caution:** What surprises beginners and quietly inflates the bill — even on "free tier": **1) Data transfer OUT:** data going INTO AWS is free, but data going OUT to the internet costs money beyond the small free allowance. **2) Idle Elastic IPs (EIPs):** an EIP is free *only while attached to a running instance*. Allocate one and leave it unattached and you pay hourly. **3) NAT Gateway:** charges both an hourly rate AND per-GB processed — and it is NOT free tier. Spin one up in a tutorial, forget it, and it bleeds money 24/7. This is the #1 "why is my bill so high?" culprit.

> **Tip:** On day one: set a **Billing Alarm** in CloudWatch (or AWS Budgets) for a low threshold like $5–$10. Enable **Cost Explorer** and check it weekly. Also stop/terminate tutorial resources when done — `stop` halts EC2 compute charges but you still pay for the EBS volume; `terminate` kills it fully. Tag resources by project so you can see exactly what's costing what.

---

## IAM — Identity and Access Management

IAM is the **front gate and key system** of your entire AWS account: who can log in, and what they're allowed to do. It's the #1 DevOps interview area because almost every security incident traces back to bad IAM. IAM is **global** (not regional) and, importantly, **free**.

<figure class="dgm" role="img" aria-label="IAM relationships: user and EC2 role both attach to a policy which grants access to an AWS resource">
<svg viewBox="0 0 660 220" width="660" height="220" xmlns="http://www.w3.org/2000/svg">
  <!-- IAM User box -->
  <rect x="20" y="30" width="130" height="48" rx="7" fill="none" class="dgm-stroke" stroke-width="1.5"/>
  <text x="85" y="50" text-anchor="middle" font-size="11" class="dgm-ink">IAM User</text>
  <text x="85" y="67" text-anchor="middle" font-size="10" class="dgm-muted">(person / service acct)</text>
  <!-- IAM Role + EC2 box -->
  <rect x="20" y="140" width="130" height="52" rx="7" fill="none" class="dgm-stroke" stroke-width="1.5"/>
  <text x="85" y="160" text-anchor="middle" font-size="11" class="dgm-ink">IAM Role</text>
  <text x="85" y="175" text-anchor="middle" font-size="10" class="dgm-muted">assumed by EC2</text>
  <text x="85" y="188" text-anchor="middle" font-size="10" class="dgm-muted">(instance profile)</text>
  <!-- Arrows from User and Role to Policy -->
  <line x1="150" y1="54" x2="248" y2="90" stroke-width="1.5" fill="none" class="dgm-ink-stroke"/>
  <polygon points="248,90 236,84 240,96" class="dgm-ink"/>
  <line x1="150" y1="166" x2="248" y2="120" stroke-width="1.5" fill="none" class="dgm-ink-stroke"/>
  <polygon points="248,120 236,126 240,114" class="dgm-ink"/>
  <!-- Policy box (centre) -->
  <rect x="250" y="78" width="140" height="54" rx="7" class="dgm-accent-soft" stroke-width="1.5" class="dgm-accent-stroke"/>
  <text x="320" y="101" text-anchor="middle" font-size="12" class="dgm-ink">Policy</text>
  <text x="320" y="118" text-anchor="middle" font-size="10" class="dgm-muted">(permissions JSON)</text>
  <!-- Arrow from Policy to Resource -->
  <line x1="390" y1="105" x2="488" y2="105" stroke-width="1.5" fill="none" class="dgm-ink-stroke"/>
  <polygon points="488,105 476,99 476,111" class="dgm-ink"/>
  <text x="439" y="98" text-anchor="middle" font-size="10" class="dgm-muted">grants access</text>
  <!-- AWS Resource box -->
  <rect x="490" y="78" width="148" height="54" rx="7" fill="none" class="dgm-stroke" stroke-width="1.5"/>
  <text x="564" y="101" text-anchor="middle" font-size="12" class="dgm-ink">AWS Resource</text>
  <text x="564" y="118" text-anchor="middle" font-size="10" class="dgm-muted">(S3, DynamoDB…)</text>
  <!-- STS label on role arrow -->
  <text x="55" y="135" text-anchor="middle" font-size="10" class="dgm-muted">STS temp creds</text>
</svg>
<figcaption>An IAM user or an EC2 instance role both attach to a policy, which defines which AWS resources and actions are permitted.</figcaption>
</figure>

### Root User vs IAM User

When you create an AWS account, you get a **root user** (the email you signed up with). The root user has unlimited, unrestricted power — it can do *anything*, including close the account and change billing. That's exactly why you should almost never use it.

- **Root user**: full god-mode access. Use it only for a tiny set of tasks that *require* root (e.g. changing account settings, closing the account).
- **IAM user**: an identity you create for a person or app, with *only* the permissions they need.

> **Note:** The root user is the **master key** to the whole building — opens every door, the safe, the main switchboard, everything. You don't carry the master key around daily; you lock it in a vault, put a heavy alarm (MFA) on it, and hand out individual room keys (IAM users) for day-to-day work. If you lose the master key, the whole building is compromised.

> **Caution:** Lock away root immediately: (1) enable **MFA on root**, (2) delete any root **access keys** — root should never have programmatic keys, (3) create an admin IAM user (or, better, use IAM Identity Center / SSO) for daily work, (4) never share or hardcode root credentials. A leaked root key = total account takeover, including running up massive bills and deleting all your data.

### Users vs Groups

Attaching policies to each user individually doesn't scale. **Groups** are collections of users — you attach policies to the group, and every member inherits them.

- **User**: a single identity (a person or a service account).
- **Group**: e.g. `Developers`, `Admins`, `ReadOnly`. Add a user to the group and they get its permissions. Remove them and access goes away instantly.
- A group is NOT an identity — you can't make a group the "principal" of an action, and groups can't be nested.

### Policies — The Rules of Access

A **policy** is a JSON document defining permissions. Two big ways to categorize them:

| | Identity-based policy | Resource-based policy |
|---|---|---|
| **Attached to** | An IAM user, group, or role | A resource (e.g. S3 bucket, SQS queue, KMS key) |
| **Answers** | "What can this identity do?" | "Who can access this resource?" |
| **Has a Principal?** | No (the identity is the principal) | Yes — specifies *who* (account/user/service) |
| **Cross-account** | Not directly | Yes — great for sharing across accounts |
| **Example** | "Devs can read S3 bucket X" | "S3 bucket policy: allow account B to read" |

Managed vs inline:

- **AWS Managed**: prebuilt by AWS (e.g. `AmazonS3ReadOnlyAccess`). Convenient, auto-updated, but often broader than you need.
- **Customer Managed**: you create and reuse them across identities. Best for least privilege — version-controlled, reusable.
- **Inline**: embedded directly into one user/group/role, 1:1, deleted with it. Use sparingly — for strict one-off relationships only.

#### Policy JSON Structure

Every statement has an **Effect** (Allow/Deny), **Action** (the API calls), **Resource** (the ARN it applies to), and optionally a **Condition**. This one lets a user list a specific bucket and read/write objects only under the `app/` prefix:

```bash
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListTheBucket",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::my-app-bucket",
      "Condition": {
        "StringLike": { "s3:prefix": "app/*" }
      }
    },
    {
      "Sid": "ReadWriteAppObjects",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::my-app-bucket/app/*"
    }
  ]
}
```

> **Tip:** Remember the evaluation logic: **everything is implicitly denied by default**. An explicit `Allow` grants access, but an explicit `Deny` *always wins* over any Allow. So you can broadly allow, then surgically deny sensitive actions. Interviewers love asking "Allow vs Deny — which wins?" Answer: **explicit Deny always trumps Allow.**

### IAM Roles — Why Roles Beat Long-Lived Keys

A **role** is an identity with permissions but **no permanent credentials**. Instead, a trusted entity *assumes* the role and gets **temporary credentials** (via STS) that auto-expire. This is the single most important IAM best practice.

> **Note:** An access key is like a permanent house key you cut and hand out — if it leaks, it works forever until someone notices and changes the lock. A role is like a **hotel keycard**: the front desk (STS) issues a fresh card that stops working after checkout. Even if someone copies it, it's useless in a few hours. This is why roles always beat long-lived keys.

Where roles shine:

- **EC2 Instance Profile**: attach a role to an EC2 instance so your app calls AWS APIs without ever storing keys on the box. The SDK auto-fetches rotating temp creds from instance metadata.
- **AssumeRole**: a user/service calls `sts:AssumeRole` to temporarily become the role.
- **Cross-account access**: account A's role trusts account B; B's users assume it — no shared keys between accounts.
- **Service roles**: e.g. Lambda execution role, ECS task role — the AWS service assumes the role to act on your behalf.

> **Caution:** Never hardcode access keys in code, Dockerfiles, environment files committed to Git, or AMIs. Leaked keys on public GitHub are scraped by bots within *minutes* and used to spin up crypto-mining fleets — landing you a five-figure bill. On EC2/ECS/Lambda, always use a role instead.

#### IAM User vs IAM Role

| | IAM User | IAM Role |
|---|---|---|
| **Credentials** | Long-lived (password / access keys) | Temporary, auto-expiring (via STS) |
| **Who uses it** | A specific person/app, persistently | Anyone/anything trusted who assumes it |
| **Best for** | Human console login | EC2/Lambda/ECS, cross-account, federation |
| **Rotation** | Manual, easy to forget | Automatic — handled by AWS |
| **Leak risk** | High (keys live forever) | Low (creds expire in minutes/hours) |

### IAM CLI Examples

Create a user, put them in a group, attach a managed policy:

```bash
# Create an IAM user
aws iam create-user --user-name riya-dev

# Create a group and attach an AWS managed policy to it
aws iam create-group --group-name Developers
aws iam attach-group-policy \
  --group-name Developers \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess

# Add the user to the group (inherits the group's permissions)
aws iam add-user-to-group --user-name riya-dev --group-name Developers

# Enforce MFA-friendly console access (set a login profile / password)
aws iam create-login-profile \
  --user-name riya-dev --password 'Temp#Pass123' --password-reset-required
```

Create a **role** with a trust policy so EC2 can assume it, then give the role permissions:

```bash
# 1) Trust policy: WHO is allowed to assume this role (here: the EC2 service)
cat > trust-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ec2.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# 2) Create the role with that trust policy
aws iam create-role \
  --role-name app-s3-role \
  --assume-role-policy-document file://trust-policy.json

# 3) Attach a permissions policy (WHAT the role can do)
aws iam attach-role-policy \
  --role-name app-s3-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess

# 4) Wrap it in an instance profile and attach to EC2 (no keys needed!)
aws iam create-instance-profile --instance-profile-name app-s3-profile
aws iam add-role-to-instance-profile \
  --instance-profile-name app-s3-profile --role-name app-s3-role
```

> **Tip:** Two policy types per role: the **trust policy** (the `assume-role-policy-document`) controls *WHO can assume* the role, and the **permissions policy** controls *WHAT* the role can do once assumed. Interviewers often probe this distinction — keep them separate in your head.

### Least Privilege

**Grant only the minimum permissions needed to do the job — nothing more.** Start with zero, add permissions as required, and scope tightly (specific actions, specific resource ARNs, conditions).

- Prefer specific actions (`s3:GetObject`) over wildcards (`s3:*` or `*`).
- Scope `Resource` to exact ARNs, not `"*"`.
- Use **IAM Access Analyzer** to generate least-privilege policies from real CloudTrail usage.
- Review with the **IAM Policy Simulator** before rollout. Audit with Access Analyzer / credential reports regularly.

### MFA and Access Key Best Practices

- **MFA everywhere**: mandatory on root and all human users. Add a virtual/hardware MFA device. You can even *require* MFA in policies via a `Condition` (`aws:MultiFactorAuthPresent`).
- **Access keys**: only for programmatic CLI/SDK use where roles aren't possible. Rotate them regularly, never commit to Git, and delete unused keys.
- **Prefer roles** over access keys whenever the workload runs inside AWS (EC2/ECS/Lambda) — zero keys to manage.
- **Audit**: use IAM credential reports and CloudTrail to find stale keys and unused permissions.

---

## Compute — EC2, Lambda, Containers

Compute is "where your code actually runs." On AWS you pick how much control you want versus how much AWS manages for you. More control = more responsibility (EC2). Less control = AWS handles the boring stuff (Lambda, Fargate). As a DevOps engineer your job is choosing the right one for the workload.

<figure class="dgm" role="img" aria-label="Compute choice: EC2 (long-running, full OS control) versus Lambda (event-driven, fully managed, scales to zero)">
<svg viewBox="0 0 620 210" width="620" height="210" xmlns="http://www.w3.org/2000/svg">
  <!-- EC2 box -->
  <rect x="30" y="30" width="250" height="150" rx="8" fill="none" class="dgm-stroke" stroke-width="2"/>
  <rect x="30" y="30" width="250" height="36" rx="8" class="dgm-accent-soft"/>
  <rect x="30" y="54" width="250" height="12" rx="0" class="dgm-accent-soft"/>
  <text x="155" y="55" text-anchor="middle" font-size="13" class="dgm-ink" font-weight="600">EC2</text>
  <text x="155" y="88"  text-anchor="middle" font-size="11" class="dgm-ink">Long-running virtual server</text>
  <text x="155" y="110" text-anchor="middle" font-size="10" class="dgm-muted">Full OS control (you patch it)</text>
  <text x="155" y="128" text-anchor="middle" font-size="10" class="dgm-muted">Manual / Auto Scaling</text>
  <text x="155" y="146" text-anchor="middle" font-size="10" class="dgm-muted">Billed per second (even idle)</text>
  <text x="155" y="164" text-anchor="middle" font-size="10" class="dgm-muted">Best: steady traffic, legacy, DBs</text>
  <!-- VS label -->
  <text x="310" y="112" text-anchor="middle" font-size="13" class="dgm-ink" font-weight="600">vs</text>
  <!-- Lambda box -->
  <rect x="340" y="30" width="250" height="150" rx="8" fill="none" class="dgm-stroke" stroke-width="2"/>
  <rect x="340" y="30" width="250" height="36" rx="8" class="dgm-surface-2"/>
  <rect x="340" y="54" width="250" height="12" rx="0" class="dgm-surface-2"/>
  <text x="465" y="55" text-anchor="middle" font-size="13" class="dgm-ink" font-weight="600">Lambda</text>
  <text x="465" y="88"  text-anchor="middle" font-size="11" class="dgm-ink">Event-driven function</text>
  <text x="465" y="110" text-anchor="middle" font-size="10" class="dgm-muted">Fully managed runtime</text>
  <text x="465" y="128" text-anchor="middle" font-size="10" class="dgm-muted">Auto-scales per request</text>
  <text x="465" y="146" text-anchor="middle" font-size="10" class="dgm-muted">Billed per ms; $0 when idle</text>
  <text x="465" y="164" text-anchor="middle" font-size="10" class="dgm-muted">Best: spiky, event-driven, APIs</text>
</svg>
<figcaption>EC2 gives full OS control for long-running workloads; Lambda is event-driven and fully managed, scaling to zero between invocations.</figcaption>
</figure>

> **Note:** Think of renting a place. **EC2** is renting an empty flat — you bring furniture, fix the plumbing, control everything. **Lambda** is a hotel room you only pay for the minutes you're inside. **Fargate** is a serviced apartment — your stuff, but housekeeping (servers) is handled. Same "shelter," very different effort.

### EC2 — Elastic Compute Cloud

EC2 is a virtual server (a VM) in AWS's data center. You choose the OS, CPU, RAM, disk, and you SSH in like any Linux box. It's the foundational "rent a server" service.

#### Instance Families and Types

Instances are grouped into **families** optimized for different workloads. The naming follows a pattern: `m5.large` = family `m`, generation `5`, size `large`. Bigger size = more vCPU + RAM (and roughly double the price each step up).

- **General purpose (t, m)** — balanced CPU/RAM. `t3.micro` (burstable, cheap, great for dev/small web), `m5.large` (steady workloads, app servers).
- **Compute optimized (c)** — high CPU per RAM. `c5.xlarge` for batch processing, gaming servers, CI build runners.
- **Memory optimized (r, x)** — lots of RAM. `r5.large` for databases, in-memory caches (Redis), big data.
- **Storage optimized (i, d)** — high disk throughput/IOPS. `i3.large` for NoSQL, data warehousing, large local datasets.

> **Tip:** `t`-family instances are *burstable* — they earn CPU credits when idle and spend them during spikes. Perfect for spiky low-traffic apps, but a constantly-busy server will run out of credits and throttle. For steady load, use `m`/`c`.

#### AMIs (Amazon Machine Images)

An AMI is the template an instance boots from — OS + pre-installed software + config. Think of it as a snapshot/golden image. You launch from an AWS-provided AMI (Amazon Linux, Ubuntu) or bake your own with your app baked in (faster, repeatable deploys — a core DevOps practice with tools like Packer).

#### Key Pairs (SSH)

To log into a Linux EC2 instance you use SSH key-based auth — no passwords. AWS gives you the **public** key (placed on the instance), you keep the **private** `.pem` file. Lose the private key and you're locked out.

```bash
# Create a key pair and save the private key locally
aws ec2 create-key-pair \
  --key-name my-devops-key \
  --query 'KeyMaterial' \
  --output text > my-devops-key.pem

# Lock down permissions (SSH refuses world-readable keys)
chmod 400 my-devops-key.pem

# Later, connect to the instance
ssh -i my-devops-key.pem ec2-user@<PUBLIC_IP>
```

#### User Data (Bootstrap Script)

User data is a script that runs **once, on first boot**, as root. This is how you bootstrap a fresh instance — install packages, pull config, start your app — without manually SSHing in. Essential for automation and Auto Scaling.

```bash
#!/bin/bash
# user-data.sh — bootstrap a simple web server on first boot
yum update -y
yum install -y nginx
echo "<h1>Deployed via user data</h1>" > /usr/share/nginx/html/index.html
systemctl enable nginx
systemctl start nginx
```

#### Launching an Instance via CLI

```bash
# Launch a t3.micro with the bootstrap script and our key
aws ec2 run-instances \
  --image-id ami-0abcdef1234567890 \
  --instance-type t3.micro \
  --key-name my-devops-key \
  --security-group-ids sg-0123456789abcdef0 \
  --subnet-id subnet-0123456789abcdef0 \
  --user-data file://user-data.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=web-01}]'

# See what's running (handy filtered view)
aws ec2 describe-instances \
  --filters "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].{ID:InstanceId,Type:InstanceType,IP:PublicIpAddress}' \
  --output table
```

#### Pricing Models

Same instance, very different bill depending on how you buy it. Interviewers love this.

- **On-Demand** — pay per second, no commitment. Most expensive per hour, max flexibility. Use for unpredictable/short workloads and testing.
- **Reserved Instances (RI)** — commit to a specific instance type for 1 or 3 years. Up to ~72% off. Use for steady, predictable baseline load.
- **Savings Plans** — commit to a $/hour spend for 1–3 years; more flexible than RIs (applies across families/regions). The modern preferred way to save on steady load.
- **Spot Instances** — bid on spare AWS capacity, up to ~90% off, but AWS can reclaim them with a 2-minute warning. Use for fault-tolerant, stateless, interruptible work (CI builds, batch jobs, big data).

> **Note:** A typical production setup mixes them: **Reserved/Savings Plans** for the always-on baseline (web servers running 24/7), **Spot** for the Auto Scaling group that handles traffic spikes and nightly batch jobs, and **On-Demand** as fallback when Spot capacity isn't available. This can cut a compute bill by half or more.

### Lambda vs EC2 — Serverless or Server?

**Lambda** runs your code in response to events (an HTTP request via API Gateway, a file landing in S3, a message in a queue) with zero servers to manage. AWS provisions, scales, and bills only for execution time (per millisecond). You give it a function; it runs it. But it's short-lived (15-min max), stateless, and you don't control the OS.

| Aspect | EC2 | Lambda |
|---|---|---|
| Model | Long-running virtual server | Event-driven function (serverless) |
| You manage | OS, patching, scaling, capacity | Just your code |
| Scaling | Manual / Auto Scaling groups | Automatic, instant, per-request |
| Billing | Per second while running (even idle) | Per ms of execution; $0 when idle |
| Max runtime | Runs forever | 15 minutes per invocation |
| State | Stateful (local disk, memory persist) | Stateless (cold starts possible) |
| Best for | Steady traffic, full control, legacy apps, databases | Spiky/event-driven work, APIs, glue code, cron jobs |

> **Tip:** "When would you NOT use Lambda?" Strong answer: long-running jobs (>15 min), workloads needing predictable low latency (cold starts hurt), apps requiring specific OS/runtime control, or steady high-volume traffic where always-on EC2 is actually cheaper. Lambda shines for bursty, event-driven, "scale-to-zero" workloads.

### Containers: ECS vs EKS vs Fargate

First, separate two things: the **orchestrator** (decides where containers run, restarts them, scales them) from the **compute** (the actual machines they run on).

- **ECS** (Elastic Container Service) — AWS's own orchestrator. Simpler, deeply AWS-integrated, no K8s knowledge needed.
- **EKS** (Elastic Kubernetes Service) — managed Kubernetes. Industry-standard, portable across clouds, bigger learning curve.
- **Fargate** — NOT an orchestrator; it's a *serverless compute engine*. It runs containers for ECS or EKS without you managing any EC2 nodes. "Containers without servers."

| | ECS | EKS | Fargate |
|---|---|---|---|
| What it is | AWS-native orchestrator | Managed Kubernetes orchestrator | Serverless compute for containers |
| Runs on | EC2 or Fargate | EC2 or Fargate | N/A (it IS the compute) |
| Learning curve | Low (AWS-specific) | High (full K8s) | Low — no servers to manage |
| Portability | AWS-locked | Portable (standard K8s) | AWS-only billing model |
| You manage nodes? | Yes (if EC2 mode) | Yes (if EC2 mode) | No — AWS handles it |
| Best for | Simple AWS-only container apps | K8s-standard, multi-cloud, complex orchestration | Anyone who wants containers without managing servers |

> **Tip:** "ECS vs EKS" and "Fargate" are not three competitors — Fargate is a *launch type* for ECS or EKS. A common combo is "ECS on Fargate": AWS-native simplicity + zero server management. Pick EKS only when you genuinely need Kubernetes (portability, team already knows K8s, complex workloads).

---

## Networking — VPC and Friends

Networking is where a lot of DevOps engineers get stuck — and where interviewers love to probe. The good news: you already know networking basics (IPs, CIDR, routing). AWS just gives you software-defined versions of the same physical concepts. For a deeper treatment of subnets, CIDR design, and routing, see [Networking for DevOps](/learn/guides/networking-for-devops/).

<figure class="dgm" role="img" aria-label="VPC layout: public subnet containing an Internet Gateway and NAT Gateway, private subnet containing an EC2 instance, with traffic-flow arrows">
<svg viewBox="0 0 680 310" width="680" height="310" xmlns="http://www.w3.org/2000/svg">
  <!-- Outer VPC box -->
  <rect x="10" y="10" width="660" height="290" rx="8" fill="none" class="dgm-stroke" stroke-width="2"/>
  <text x="340" y="30" text-anchor="middle" font-size="12" class="dgm-muted">VPC  10.0.0.0/16</text>
  <!-- Public subnet -->
  <rect x="30" y="40" width="290" height="240" rx="7" class="dgm-surface-2" stroke-width="1.5" class="dgm-stroke"/>
  <text x="175" y="62" text-anchor="middle" font-size="11" class="dgm-ink" font-weight="600">Public Subnet  10.0.1.0/24</text>
  <!-- Internet Gateway box -->
  <rect x="50" y="78" width="120" height="44" rx="6" fill="none" class="dgm-accent-stroke" stroke-width="1.5"/>
  <text x="110" y="97" text-anchor="middle" font-size="11" class="dgm-ink">Internet</text>
  <text x="110" y="112" text-anchor="middle" font-size="11" class="dgm-ink">Gateway (IGW)</text>
  <!-- NAT Gateway box -->
  <rect x="185" y="78" width="120" height="44" rx="6" fill="none" class="dgm-stroke" stroke-width="1.5"/>
  <text x="245" y="97" text-anchor="middle" font-size="11" class="dgm-ink">NAT</text>
  <text x="245" y="112" text-anchor="middle" font-size="11" class="dgm-ink">Gateway</text>
  <!-- Arrow: Internet to IGW -->
  <line x1="110" y1="40" x2="110" y2="78" stroke-width="1.5" fill="none" class="dgm-ink-stroke"/>
  <polygon points="110,78 104,66 116,66" class="dgm-ink"/>
  <text x="112" y="65" font-size="10" class="dgm-muted">internet</text>
  <!-- Arrow: IGW to NAT (outbound path label) -->
  <line x1="170" y1="100" x2="185" y2="100" stroke-width="1.5" fill="none" class="dgm-ink-stroke"/>
  <polygon points="185,100 173,94 173,106" class="dgm-ink"/>
  <!-- Route table note in public subnet -->
  <rect x="50" y="148" width="250" height="32" rx="5" fill="none" class="dgm-muted-stroke" stroke-width="1"/>
  <text x="175" y="163" text-anchor="middle" font-size="10" class="dgm-muted">Route table: 0.0.0.0/0 → IGW</text>
  <text x="175" y="176" text-anchor="middle" font-size="10" class="dgm-muted">(makes this subnet public)</text>
  <!-- Private subnet -->
  <rect x="360" y="40" width="290" height="240" rx="7" fill="none" class="dgm-stroke" stroke-width="1.5"/>
  <text x="505" y="62" text-anchor="middle" font-size="11" class="dgm-ink" font-weight="600">Private Subnet  10.0.2.0/24</text>
  <!-- EC2 box -->
  <rect x="405" y="78" width="200" height="52" rx="6" fill="none" class="dgm-accent-stroke" stroke-width="1.5"/>
  <text x="505" y="100" text-anchor="middle" font-size="12" class="dgm-ink">EC2 Instance</text>
  <text x="505" y="118" text-anchor="middle" font-size="10" class="dgm-muted">(no public IP)</text>
  <!-- Route table note in private subnet -->
  <rect x="380" y="148" width="250" height="32" rx="5" fill="none" class="dgm-muted-stroke" stroke-width="1"/>
  <text x="505" y="163" text-anchor="middle" font-size="10" class="dgm-muted">Route table: 0.0.0.0/0 → NAT GW</text>
  <text x="505" y="176" text-anchor="middle" font-size="10" class="dgm-muted">(outbound only — inbound blocked)</text>
  <!-- Arrow: NAT GW to EC2 (outbound reply) -->
  <line x1="320" y1="100" x2="405" y2="100" stroke-width="1.5" fill="none" class="dgm-ink-stroke" stroke-dasharray="5,3"/>
  <polygon points="405,100 393,94 393,106" class="dgm-ink"/>
  <text x="362" y="94" text-anchor="middle" font-size="10" class="dgm-muted">outbound</text>
  <!-- SG guard icon (simple small rect) -->
  <rect x="397" y="74" width="12" height="12" rx="2" class="dgm-accent-soft" stroke-width="1" class="dgm-accent-stroke"/>
  <text x="403" y="84" text-anchor="middle" font-size="8" class="dgm-ink">SG</text>
</svg>
<figcaption>A VPC with a public subnet (IGW + NAT Gateway) and a private subnet (EC2); public traffic enters via the IGW while EC2 reaches the internet outbound through the NAT Gateway.</figcaption>
</figure>

> **Note:** A **VPC** is your own private gated society (housing colony) inside AWS's huge city. **Subnets** are blocks within the society. The **route table** is the society's road map (which road leads where). The **Internet Gateway** is the main gate to the outside world. **Security Groups** are guards at each house's door; **NACLs** are guards at the block's entrance.

### VPC (Virtual Private Cloud)

A VPC is your own isolated virtual network inside AWS. Nothing outside it can reach in unless you explicitly allow it. You define its IP range using a **CIDR block**, e.g. `10.0.0.0/16` — that gives you ~65,536 private IP addresses to carve up. Size your VPC subnets with the [Subnet Calculator](/subnet-calculator/) and validate CIDR ranges with the [CIDR Checker](/cidr-checker/).

### CIDR Blocks — Quick Refresher

CIDR notation = IP + "how many bits are fixed." `/16` fixes the first 16 bits → `10.0.x.x` is yours (65,536 IPs). `/24` fixes 24 bits → `10.0.1.x` (256 IPs). Smaller number after the slash = bigger network. You give the VPC a large block (`/16`) and slice subnets out of it (`/24`).

> **Tip:** AWS reserves **5 IPs in every subnet** (network address, VPC router, DNS, future use, broadcast). So a `/24` subnet gives you 256 − 5 = 251 usable IPs, not 256. This trips people up when sizing subnets.

### Subnets: Public vs Private

A subnet is a slice of the VPC, and it lives in **one Availability Zone**. The big question: *what actually makes a subnet "public"?*

It's NOT a checkbox called "public." A subnet is **public** if and only if its **route table has a route to an Internet Gateway** (`0.0.0.0/0 → igw-xxxx`). A **private** subnet has no such route — its traffic can't reach the internet directly.

> **Tip:** Classic question: "What makes a subnet public?" Wrong answer: "it has public IPs." Correct answer: **its route table routes `0.0.0.0/0` to an Internet Gateway.** An instance also needs a public IP to be reachable, but the defining factor is the route to the IGW.

### Route Tables

A route table is a set of rules deciding where network traffic goes. Each subnet is associated with exactly one route table. Every table has a **local** route (so subnets within the VPC can talk to each other automatically). You add routes for outside traffic — to an IGW (public) or a NAT Gateway (private).

### Internet Gateway (IGW)

The IGW is a horizontally-scaled, highly-available component attached to your VPC that allows **two-way** communication between the VPC and the internet. One IGW per VPC. Without it, nothing in your VPC can reach the public internet, period.

### NAT Gateway — Why Private Subnets Need It

Your app servers sit in a **private** subnet (no IGW route — good, attackers can't reach them). But they still need to download OS updates, pull packages, call external APIs. How do they reach *out* without being reachable *in*?

Answer: a **NAT Gateway**. It lives in a *public* subnet and does Network Address Translation. Private instances route `0.0.0.0/0 → NAT Gateway`; the NAT forwards their outbound requests to the internet using its own public IP, and returns the responses. Crucially, NAT only allows **outbound-initiated** traffic — the outside world cannot start a connection back in.

> **Note:** NAT Gateway is like a hotel front desk. Guests (private servers) can call out for room service or order food from outside, but no outsider can directly walk to your room — they only reach the front desk. Calls go out, randos can't come in.

> **Caution:** NAT Gateways are NOT free — you pay per hour *and* per GB processed. They're a common surprise on AWS bills. Also, a NAT Gateway lives in one AZ; for high availability you deploy one per AZ. Don't put it in a private subnet by mistake (it needs the IGW route to work).

### Request Flow: User to App

Walking through a request to a web app makes it click:

1. User's browser sends a request to your app's public IP / load balancer.
2. Traffic hits the **Internet Gateway** (the VPC's front gate).
3. The **public subnet's route table** directs it to the resource (e.g. a load balancer or web server with a public IP).
4. The **NACL** (block-level guard) checks subnet rules, then the **Security Group** (door-level guard) checks if the port is allowed.
5. The web tier forwards to app servers in the **private subnet** over the VPC's internal `local` route.
6. Response travels back out the same path. Because SGs are stateful, the return traffic is automatically allowed.

### Security Groups vs NACLs

This is one of the most asked AWS interview questions. Both are virtual firewalls, but they operate at different levels and behave differently.

- **Security Group (SG)** — attached to the **instance/ENI** (the door). **Stateful**: if you allow inbound traffic, the response is automatically allowed out (and vice versa). **Allow rules only** — you can't write a "deny" rule; anything not allowed is implicitly denied.
- **NACL (Network ACL)** — attached to the **subnet** (the block gate). **Stateless**: you must explicitly allow both inbound AND the return outbound traffic. Supports **allow AND deny** rules, evaluated in numbered order.

| Feature | Security Group | NACL |
|---|---|---|
| Level | Instance / ENI | Subnet |
| State | Stateful (return traffic auto-allowed) | Stateless (must allow both directions) |
| Rules | Allow only | Allow AND Deny |
| Rule evaluation | All rules evaluated together | In numbered order, first match wins |
| Default behavior | Deny all inbound, allow all outbound | Default NACL allows all; custom denies all |
| Use case | Primary, everyday instance firewall | Coarse subnet-wide rules, blocking specific IPs |

> **Tip:** Memorize the one-liner: **"SG = stateful, instance-level, allow-only. NACL = stateless, subnet-level, allow + deny."** Follow-up: "Can you block a single malicious IP?" → Yes, with a NACL *deny* rule (SGs can't deny). In practice, 95% of your work is in Security Groups; NACLs are a secondary, coarse layer.

### Building VPC with the CLI

```bash
# 1. Create the VPC (grab the returned VpcId)
aws ec2 create-vpc \
  --cidr-block 10.0.0.0/16 \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=my-vpc}]'

# 2. Create a public subnet inside it
aws ec2 create-subnet \
  --vpc-id vpc-0123456789abcdef0 \
  --cidr-block 10.0.1.0/24 \
  --availability-zone ap-south-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=public-1a}]'

# 3. Create a security group in the VPC
aws ec2 create-security-group \
  --group-name web-sg \
  --description "Allow HTTP and SSH" \
  --vpc-id vpc-0123456789abcdef0

# 4. Allow inbound HTTP (80) from anywhere and SSH (22) from your IP
aws ec2 authorize-security-group-ingress \
  --group-id sg-0123456789abcdef0 \
  --protocol tcp --port 80 --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id sg-0123456789abcdef0 \
  --protocol tcp --port 22 --cidr 203.0.113.25/32
```

> **Caution:** Never open SSH (port 22) to `0.0.0.0/0` — that exposes your server to the entire internet's brute-force bots. Always restrict to your own IP (`/32`) or use a bastion host / AWS Systems Manager Session Manager (no open SSH port at all). This is a top finding in every security audit.

---

## Storage — S3, EBS, EFS

AWS storage comes in three fundamental flavors, and knowing which to reach for is core DevOps knowledge: **object** storage (S3), **block** storage (EBS), and **file** storage (EFS).

<figure class="dgm" role="img" aria-label="Storage comparison: S3 (object storage, HTTPS API), EBS (block volume attached to one EC2), EFS (shared file system mounted by many EC2s)">
<svg viewBox="0 0 660 210" width="660" height="210" xmlns="http://www.w3.org/2000/svg">
  <!-- S3 box -->
  <rect x="20" y="20" width="190" height="170" rx="8" fill="none" class="dgm-stroke" stroke-width="2"/>
  <rect x="20" y="20" width="190" height="38" rx="8" class="dgm-accent-soft"/>
  <rect x="20" y="46" width="190" height="12" rx="0" class="dgm-accent-soft"/>
  <text x="115" y="46" text-anchor="middle" font-size="13" class="dgm-ink" font-weight="600">S3</text>
  <text x="115" y="76" text-anchor="middle" font-size="11" class="dgm-ink">Object Storage</text>
  <text x="115" y="96" text-anchor="middle" font-size="10" class="dgm-muted">Access: HTTPS API</text>
  <text x="115" y="114" text-anchor="middle" font-size="10" class="dgm-muted">Scales: infinite, automatic</text>
  <text x="115" y="132" text-anchor="middle" font-size="10" class="dgm-muted">Use: assets, backups,</text>
  <text x="115" y="148" text-anchor="middle" font-size="10" class="dgm-muted">logs, static sites</text>
  <text x="115" y="170" text-anchor="middle" font-size="10" class="dgm-muted">Not mountable as a disk</text>
  <!-- EBS box -->
  <rect x="235" y="20" width="190" height="170" rx="8" fill="none" class="dgm-stroke" stroke-width="2"/>
  <rect x="235" y="20" width="190" height="38" rx="8" class="dgm-surface-2"/>
  <rect x="235" y="46" width="190" height="12" rx="0" class="dgm-surface-2"/>
  <text x="330" y="46" text-anchor="middle" font-size="13" class="dgm-ink" font-weight="600">EBS</text>
  <text x="330" y="76" text-anchor="middle" font-size="11" class="dgm-ink">Block Storage</text>
  <text x="330" y="96" text-anchor="middle" font-size="10" class="dgm-muted">Attached to 1 EC2 instance</text>
  <text x="330" y="114" text-anchor="middle" font-size="10" class="dgm-muted">AZ-bound (same AZ only)</text>
  <text x="330" y="132" text-anchor="middle" font-size="10" class="dgm-muted">Use: OS root disk,</text>
  <text x="330" y="148" text-anchor="middle" font-size="10" class="dgm-muted">databases, app data</text>
  <text x="330" y="170" text-anchor="middle" font-size="10" class="dgm-muted">Behaves like a local SSD</text>
  <!-- EFS box -->
  <rect x="450" y="20" width="190" height="170" rx="8" fill="none" class="dgm-stroke" stroke-width="2"/>
  <rect x="450" y="20" width="190" height="38" rx="8" class="dgm-surface-2"/>
  <rect x="450" y="46" width="190" height="12" rx="0" class="dgm-surface-2"/>
  <text x="545" y="46" text-anchor="middle" font-size="13" class="dgm-ink" font-weight="600">EFS</text>
  <text x="545" y="76" text-anchor="middle" font-size="11" class="dgm-ink">Shared File Storage (NFS)</text>
  <text x="545" y="96" text-anchor="middle" font-size="10" class="dgm-muted">Many EC2s mount at once</text>
  <text x="545" y="114" text-anchor="middle" font-size="10" class="dgm-muted">Multi-AZ, elastic size</text>
  <text x="545" y="132" text-anchor="middle" font-size="10" class="dgm-muted">Use: shared uploads,</text>
  <text x="545" y="148" text-anchor="middle" font-size="10" class="dgm-muted">CMS files, web fleet assets</text>
  <text x="545" y="170" text-anchor="middle" font-size="10" class="dgm-muted">Behaves like a network drive</text>
</svg>
<figcaption>S3 is object storage accessed over HTTPS; EBS is a block volume attached to a single EC2 instance; EFS is a shared NFS file system mountable by many instances simultaneously.</figcaption>
</figure>

> **Note:** **EBS (block)** = a hard drive plugged into one computer — fast, personal, one machine at a time. **EFS (file)** = a shared network drive in the office that everyone mounts at once. **S3 (object)** = a giant warehouse where you drop labelled boxes and fetch them by name via a web address — infinite shelves, but you can't "edit" a box, you replace it.

### S3 — Simple Storage Service

S3 is object storage: you store **objects** (files + metadata) inside **buckets** (globally-unique named containers). It's accessed over HTTPS via an API/URL, scales infinitely, and is 99.999999999% (11 nines) durable. You don't mount it like a disk — you GET/PUT objects by key.

> **Caution:** Bucket names are **globally unique across all AWS accounts on Earth** — like domain names. If someone took `my-bucket`, you can't. Use a prefix like `mycompany-prod-logs-2026`.

#### Versioning

Enable versioning and S3 keeps every version of an object. Overwrite or delete? The old version is retained (a "delete marker" is added instead of true deletion). This protects against accidental overwrites and ransomware. Once enabled, it can only be suspended, not fully disabled.

#### Lifecycle Policies

Rules that automatically move or expire objects over time to save money. Example: keep logs in Standard for 30 days, move to Infrequent Access, then to Glacier after 90 days, and delete after a year — all automatic. This is how you control storage costs at scale.

#### Storage Classes

- **S3 Standard** — frequent access, lowest latency. Default for active data, website assets.
- **S3 Standard-IA (Infrequent Access)** — cheaper storage, but you pay a retrieval fee. For data accessed rarely but needed instantly (backups, older logs).
- **S3 Glacier (Flexible / Deep Archive)** — dirt cheap archival; retrieval takes minutes to hours. For compliance archives, long-term backups you rarely touch.
- **S3 Intelligent-Tiering** — AWS auto-moves objects between tiers based on access patterns. Set-and-forget cost optimization.

> **Tip:** Don't manually guess tiers for unpredictable access — use **Intelligent-Tiering** and let AWS optimize. Use explicit **lifecycle policies** when you KNOW the pattern (e.g., "logs are useless after 90 days").

#### Static Website Hosting

S3 can serve a static website (HTML/CSS/JS) directly — perfect for your React build output. Upload the build, enable website hosting, set the index document. Pair it with CloudFront (CDN) + an ACM certificate for HTTPS and global caching.

```bash
# Create a bucket
aws s3 mb s3://mycompany-react-app-2026 --region ap-south-1

# Upload your React production build
aws s3 sync ./build s3://mycompany-react-app-2026 --delete

# Enable static website hosting
aws s3 website s3://mycompany-react-app-2026 \
  --index-document index.html \
  --error-document index.html
```

#### Security: Block Public Access and Bucket Policies

Leaky S3 buckets are the most famous cause of data breaches. AWS now enables **Block Public Access** by default — a master switch that overrides any policy trying to make a bucket public. Access is otherwise controlled by **bucket policies** (JSON rules on the bucket) and IAM policies (rules on users/roles).

```bash
# Lock down public access (the safe default)
aws s3api put-public-access-block \
  --bucket mycompany-react-app-2026 \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# Enable versioning for safety
aws s3api put-bucket-versioning \
  --bucket mycompany-react-app-2026 \
  --versioning-configuration Status=Enabled
```

> **Caution:** For a public website, the modern best practice is NOT to make the S3 bucket public. Instead keep Block Public Access ON and serve through **CloudFront with an Origin Access Control (OAC)**, so only CloudFront can read the bucket. Public buckets should be a deliberate, rare exception.

### EBS — Elastic Block Store

EBS is a **block storage** volume — a virtual hard disk you attach to a single EC2 instance. You format it, mount it, and it behaves like a local SSD. It's the root disk of most instances and where databases store data. It lives in **one AZ** and (traditionally) attaches to **one instance at a time**.

```bash
# Create a 50 GB gp3 SSD volume in a specific AZ
aws ec2 create-volume \
  --volume-type gp3 \
  --size 50 \
  --availability-zone ap-south-1a \
  --tag-specifications 'ResourceType=volume,Tags=[{Key=Name,Value=db-data}]'

# Attach it to an instance (volume must be in the same AZ as the instance)
aws ec2 attach-volume \
  --volume-id vol-0123456789abcdef0 \
  --instance-id i-0123456789abcdef0 \
  --device /dev/sdf
```

> **Tip:** EBS and EC2 must be in the **same Availability Zone** to attach — block storage is AZ-bound. To move data across AZs, take a **snapshot** (stored in S3 behind the scenes) and create a new volume from it in the target AZ.

### EFS — Elastic File System

EFS is **file storage** — a managed NFS share that **many EC2 instances mount simultaneously**, across multiple AZs. It grows and shrinks automatically. Use it when a fleet of servers needs to read/write the same files (shared uploads, CMS content, web cluster assets).

### Block vs File vs Object — When to Use Which

| | S3 (Object) | EBS (Block) | EFS (File) |
|---|---|---|---|
| Type | Object store | Block volume (virtual disk) | Shared file system (NFS) |
| Access | HTTPS API / URL | Mounted to one EC2 | Mounted to many EC2s |
| Attaches to | Anything over the internet | 1 instance (1 AZ) | Many instances, multi-AZ |
| Scaling | Infinite, automatic | Fixed size (resize manually) | Automatic, elastic |
| Can edit in place? | No — replace whole object | Yes — random read/write | Yes — random read/write |
| Best for | Assets, backups, logs, static sites, big data | OS root disk, databases, single-server data | Shared storage across a server fleet |

> **Tip:** The killer interview line: **"EBS = one disk for one server; EFS = one shared drive for many servers; S3 = object storage accessed over HTTP, not mounted."** If asked "where do you store database files?" → EBS (low latency block). "Shared files across an Auto Scaling group?" → EFS. "Static assets / backups?" → S3.

---

## Databases — RDS and DynamoDB

As a DevOps engineer, the database is the part nobody wants to babysit at 3am — so AWS gives you **managed** database services. You stop being a DBA and start being an operator who scripts the boring stuff away.

> **Note:** Running a DB on a raw EC2 instance is like buying a car and also building your own service garage — you patch the engine, change the oil, handle backups. A *managed* database (RDS/DynamoDB) is like a chauffeur-driven car with a maintenance contract: you write business logic, AWS handles patching, backups, and failover.

### Amazon RDS — Managed Relational

RDS = your familiar SQL world (tables, joins, foreign keys, transactions) but AWS handles provisioning, patching, backups, and failover. You pick an **engine** and AWS runs it for you.

- **Engines:** PostgreSQL, MySQL, MariaDB, Oracle, SQL Server, and Amazon Aurora (AWS's high-performance MySQL/Postgres-compatible engine).
- **Multi-AZ (High Availability):** AWS keeps a synchronous standby replica in a second Availability Zone. If the primary dies, RDS automatically fails over to the standby (DNS endpoint stays the same). This is about *survival*, not speed — the standby does not serve reads.
- **Read Replicas (Scale):** Asynchronous copies you can read from to offload heavy SELECT traffic (reporting, dashboards). This is about *scaling reads*, not failover. You can promote a replica to standalone, but it isn't automatic HA.
- **Automated backups:** Daily snapshot + transaction logs enable point-in-time recovery (PITR) within your retention window (up to 35 days). **Manual snapshots** live until you delete them — good for "before the migration" safety copies.
- **Parameter groups:** tune engine settings (e.g. `max_connections`) without touching a config file. **Subnet groups:** tell RDS which subnets (across AZs) it may launch into — almost always your *private* subnets.

> **Caution:** Multi-AZ and Read Replica are constantly confused in interviews. **Multi-AZ = HA/failover (sync, same endpoint, no read offload). Read Replica = scaling reads (async, separate endpoint).** You can have both at once.

> **Note:** An e-commerce app runs RDS Postgres Multi-AZ for the orders database. The analytics team was hammering it with giant reports, slowing checkout. The fix: add two Read Replicas and point the reporting tool at the replica endpoint. Checkout latency dropped instantly — writes stayed on the primary, reads spread out.

Create a Multi-AZ Postgres instance in private subnets:

```bash
aws rds create-db-instance \
  --db-instance-identifier prod-orders-db \
  --db-instance-class db.t3.medium \
  --engine postgres \
  --engine-version 16.3 \
  --master-username appadmin \
  --master-user-password 'ChangeMe-UseSecretsManager!' \
  --allocated-storage 50 \
  --storage-type gp3 \
  --multi-az \
  --db-subnet-group-name prod-private-subnets \
  --vpc-security-group-ids sg-0a1b2c3d4e5f67890 \
  --backup-retention-period 7 \
  --storage-encrypted \
  --no-publicly-accessible
```

> **Tip:** Never bake the DB password into CLI/Terraform. Use **AWS Secrets Manager** (RDS can even auto-rotate it) or `--manage-master-user-password` so AWS stores and rotates it for you.

#### Why Managed Beats Self-Hosted on EC2

- Automated patching, backups, and PITR — no cron jobs you forget about.
- One-flag HA (`--multi-az`) instead of hand-building replication and failover scripts.
- Push-button read scaling and storage autoscaling.
- You still own schema, queries, and indexes — i.e. the stuff that's actually your job.

### Amazon DynamoDB — Managed NoSQL

DynamoDB is a fully managed key-value / document store. No servers, no engine versions, no connection pools — just an API. It delivers **single-digit millisecond latency at any scale**, which is why it powers shopping carts, session stores, and leaderboards.

- **Partition key (PK):** determines which physical partition stores the item — choose a high-cardinality key so traffic spreads evenly (avoid "hot partitions").
- **Sort key (SK):** optional; lets you store many related items under one PK and query ranges (e.g. PK=`USER#42`, SK=`ORDER#2026-06-01`). PK + SK together form the primary key.
- **On-demand capacity:** pay per request, scales instantly — perfect for spiky or unknown traffic.
- **Provisioned capacity:** you set read/write capacity units (with optional auto-scaling) — cheaper for steady, predictable load.

```bash
aws dynamodb create-table \
  --table-name UserOrders \
  --attribute-definitions \
    AttributeName=UserId,AttributeType=S \
    AttributeName=OrderId,AttributeType=S \
  --key-schema \
    AttributeName=UserId,KeyType=HASH \
    AttributeName=OrderId,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --tags Key=env,Value=prod
```

> **Tip:** `HASH` = partition key, `RANGE` = sort key in DynamoDB CLI terminology. `PAY_PER_REQUEST` = on-demand; switch to `PROVISIONED` with `--provisioned-throughput` once your traffic is predictable.

### RDS vs DynamoDB — When to Pick What

**Pick RDS** when you have relational data, complex joins, transactions, and ad-hoc queries (finance, orders, anything with strong consistency and relationships). **Pick DynamoDB** when you need massive scale, predictable access patterns by key, ultra-low latency, and zero ops (carts, sessions, IoT, gaming, event logs).

| Aspect | Amazon RDS | DynamoDB |
|---|---|---|
| Data model | Relational (tables, joins) | NoSQL key-value / document |
| Query flexibility | Full SQL, ad-hoc queries | Key-based access; design schema around access patterns |
| Scaling | Vertical + read replicas | Horizontal, virtually unlimited, automatic |
| Latency | Low (ms), depends on instance | Single-digit ms at any scale |
| HA | Multi-AZ failover | Built-in, multi-AZ by default |
| Ops overhead | Low (you pick instance size, params) | Near zero (serverless) |
| Best for | Orders, finance, complex relationships | Carts, sessions, IoT, leaderboards |

> **Tip:** "How do you scale reads on RDS without hurting writes?" → **Read Replicas**, point read-only traffic at the replica endpoint. "How do you make RDS highly available?" → **Multi-AZ**. Saying the right one for the right reason instantly signals you understand the difference.

---

## How It All Fits Together

You've met the building blocks one by one — IAM, VPC, subnets, EC2, S3, RDS, Security Groups, gateways, ALB. Now let's snap them together like Lego and deploy a typical web app. This is the mental model interviewers want to hear, and it's the diagram you'll draw on a whiteboard for the rest of your career.

> **Note:** Think of your AWS account as a gated township. **IAM** = the security desk deciding who enters and what they can touch. **VPC** = the township's boundary wall. **Subnets** = individual lanes (some facing the main road = public, some tucked inside = private). **IGW** = the main gate to the public road. **NAT** = a one-way courier so inside residents can order online without strangers walking in. **Security Groups** = the lock on each house's door.

### The 3-Tier Architecture (Web / App / Data)

Almost every classic web app splits into three tiers, and AWS maps cleanly onto them:

- **Web / presentation tier:** the public entry point. An **Application Load Balancer (ALB)** sits in *public subnets* and accepts user traffic on 80/443. Static assets (images, JS bundles, your React build) often live in **S3** and/or behind a CDN.
- **App / logic tier:** your **EC2** instances (or containers) running the backend, in *private subnets*. They never get a public IP — the ALB forwards traffic to them.
- **Data tier:** **RDS** (and/or DynamoDB) in *private subnets*, reachable only from the app tier. Nothing on the internet can touch the database directly.

Each tier lives in its own subnet layer, spread across at least **two Availability Zones** for resilience, all inside one VPC.

### The Deployment, Step by Step

1. **IAM first.** Create roles, not long-lived keys. An EC2 *instance role* lets the app read from S3 and pull DB credentials from Secrets Manager — no keys on disk.
2. **Build the VPC.** Carve a CIDR (e.g. `10.0.0.0/16`) and create public + private subnets across two AZs.
3. **Attach an Internet Gateway (IGW)** to the VPC and route public subnets' `0.0.0.0/0` to it. Add a **NAT Gateway** in a public subnet so private instances can reach the internet outbound (for updates/patches) without being reachable inbound.
4. **Launch EC2 app servers** in the private subnets, behind an Auto Scaling Group ideally.
5. **Create the ALB** in the public subnets, with a target group pointing at the EC2 instances. Health checks decide which instances get traffic.
6. **Provision RDS** (Multi-AZ) in the private subnets via a DB subnet group.
7. **Wire Security Groups (the real glue):** ALB SG allows 443 from `0.0.0.0/0`; EC2 SG allows the app port *only from the ALB's SG*; RDS SG allows 5432/3306 *only from the EC2 SG*. Referencing SGs by ID (not IP ranges) is the clean, least-privilege way.
8. **Point your domain** (Route 53) at the ALB and attach a TLS cert (ACM) for HTTPS.

### Request Flow, End to End

1. User's browser resolves your domain via **Route 53** → gets the ALB's address.
2. Request enters the VPC through the **IGW** and hits the **ALB** in a public subnet (TLS terminated by ACM cert).
3. ALB picks a healthy **EC2** instance in a private subnet and forwards the request — allowed because the EC2 Security Group trusts the ALB's SG.
4. The app reads/writes **RDS** (private), pulls static files or uploads to **S3**, and uses its **IAM instance role** for those calls.
5. If the app needs to call an external API, traffic exits via the **NAT Gateway** — outbound only.
6. Response flows back through the ALB to the user. The database and app servers were never exposed to the internet.

> **Note:** A SaaS dashboard runs exactly this shape: ALB in two public subnets, an Auto Scaling Group of EC2 in two private subnets, RDS Postgres Multi-AZ in the data tier, and the React build served from S3 + CloudFront. When a marketing email caused a traffic spike, the ASG added instances and the ALB spread load — zero manual intervention, no downtime.

### Where CI/CD and IaC Fit

You'd never click all of the above by hand in production. **Infrastructure as Code** — Terraform or CloudFormation — defines the VPC, subnets, SGs, ALB, RDS, and IAM roles as version-controlled files. You `plan` and `apply` to create identical environments (dev/staging/prod) repeatably.

**CI/CD** (GitHub Actions, GitLab CI, CodePipeline) handles the *application*: on every git push it builds, tests, and deploys your code to the EC2/containers and pushes the React bundle to S3. IaC builds the house; CI/CD keeps moving the furniture in.

> **Tip:** When asked "walk me through deploying a web app on AWS," structure your answer as **tiers (web/app/data) + the security boundaries between them**. Emphasize that databases and app servers live in *private* subnets, the ALB is the only public entry, and Security Groups reference each other by ID. That one paragraph signals senior-level thinking.

---

## Hands-on AWS CLI

The console is great for learning, but DevOps lives in the terminal — scriptable, repeatable, automatable. The AWS CLI is your daily driver. Let's install it, configure credentials, and build a cheat sheet you'll actually reuse.

### Install on Ubuntu 24.04

Use the official v2 bundle (the `apt` package is often outdated):

```bash
sudo apt update && sudo apt install -y unzip curl
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
aws --version   # confirm: aws-cli/2.x.x ...
```

### Configure Credentials

`aws configure` walks you through four prompts: Access Key ID, Secret Access Key, default region, and output format (`json`, `table`, or `text`).

```bash
aws configure
# AWS Access Key ID [None]: AKIAEXAMPLE...
# AWS Secret Access Key [None]: wJalr...EXAMPLEKEY
# Default region name [None]: ap-south-1
# Default output format [None]: json
```

### Named Profiles and Where Credentials Live

One laptop, many accounts (dev, prod, client). **Named profiles** keep them separate. Credentials and settings are stored in two plaintext files in your home directory:

- `~/.aws/credentials` — the secret keys (per profile).
- `~/.aws/config` — region, output format, and SSO/role settings (per profile).

```bash
# Create a named profile
aws configure --profile prod

# Use it per-command
aws s3 ls --profile prod

# Or set it for the whole shell session
export AWS_PROFILE=prod
aws sts get-caller-identity

# Inspect the files
cat ~/.aws/config
cat ~/.aws/credentials
```

> **Caution:** `~/.aws/credentials` stores your secret key in **plaintext**. Never commit this file, never paste keys into Slack, and on shared/CI machines prefer IAM roles or AWS SSO over long-lived keys.

### Cheat Sheet — Identity and STS

Your "whoami" — always run this first to confirm which identity/account you're operating as:

```bash
aws sts get-caller-identity            # who am I? which account?
aws configure list                     # active profile, region, source
aws configure list-profiles            # all configured profiles
```

### Cheat Sheet — S3

```bash
aws s3 ls                                      # list buckets
aws s3 ls s3://my-app-assets/                  # list objects
aws s3 cp ./build/app.js s3://my-app-assets/   # upload one file
aws s3 sync ./build/ s3://my-app-assets/ --delete   # mirror a dir (great for React builds)
aws s3 rb s3://old-bucket --force              # remove bucket + contents
```

### Cheat Sheet — EC2

```bash
aws ec2 describe-instances \
  --query 'Reservations[].Instances[].{ID:InstanceId,State:State.Name,Type:InstanceType,IP:PrivateIpAddress}' \
  --output table
aws ec2 describe-security-groups --group-ids sg-0a1b2c3d
aws ec2 stop-instances  --instance-ids i-0123456789abcdef0
aws ec2 start-instances --instance-ids i-0123456789abcdef0
```

### Cheat Sheet — IAM

```bash
aws iam list-users
aws iam list-roles --query 'Roles[].RoleName' --output text
aws iam list-attached-role-policies --role-name app-ec2-role
```

### Cheat Sheet — CloudWatch Logs

```bash
aws logs describe-log-groups
aws logs tail /aws/lambda/my-func --follow         # live tail, like tail -f
aws logs tail /ecs/web-app --since 1h --format short
```

> **Tip:** Two habits that save careers: (1) keep a separate profile per account and run a quick `aws sts get-caller-identity` before any destructive command — confirm you're not in prod. (2) For mutating EC2 actions, add `--dry-run`: it checks permissions and returns *"would have succeeded"* without actually doing anything. Combine with `--output table` and `--query` (JMESPath) to keep output readable.

---

## Cost and Security Guardrails

Two ways to get fired fast in cloud: a surprise five-figure bill, or a leaked access key that lets attackers mine crypto on your account. Both are 100% preventable with guardrails you set up once.

### Cost Guardrails

- **Billing alerts / AWS Budgets:** set a monthly budget and get emailed at 50/80/100% — your early-warning system.
- **Cost Explorer:** visualize spend by service, account, and tag to find what's actually eating money.
- **Tagging strategy:** tag every resource with `env`, `team`, `project`, `owner`. Without tags you can't attribute cost or clean up safely.
- **Right-sizing:** most instances run at <20% CPU. Use Compute Optimizer to downsize over-provisioned EC2/RDS.
- **Spot and Savings Plans:** Spot Instances (up to ~90% off) for fault-tolerant/batch workloads; Savings Plans / Reserved Instances for steady baseline compute.
- **Kill idle resources** — the silent money drains:
  - **Unattached Elastic IPs** — an EIP not associated with a running instance is billed hourly.
  - **NAT Gateways** — billed per hour AND per GB; idle ones in dev accounts are a classic leak.
  - **Unattached EBS volumes and old snapshots** — keep getting billed after the instance is long gone.
  - **Idle load balancers and stopped-but-not-terminated dev instances.**

> **Caution:** Free-tier traps: the free tier is **12 months and capped**. NAT Gateways, Elastic IPs, inter-AZ data transfer, and provisioned RDS storage are *not* free. A forgotten `t2.micro` beyond the cap, or one NAT Gateway left running, quietly bills you for months. Always set a Budget on day one.

Set a $50 monthly budget with an 80% email alert via CLI:

```bash
cat > budget.json <<'EOF'
{ "BudgetName": "monthly-50usd", "BudgetLimit": {"Amount":"50","Unit":"USD"},
  "TimeUnit": "MONTHLY", "BudgetType": "COST" }
EOF

cat > notify.json <<'EOF'
[ { "Notification": {"NotificationType":"ACTUAL","ComparisonOperator":"GREATER_THAN",
      "Threshold":80,"ThresholdType":"PERCENTAGE"},
    "Subscribers":[{"SubscriptionType":"EMAIL","Address":"your@email.com"}] } ]
EOF

aws budgets create-budget \
  --account-id 123456789012 \
  --budget file://budget.json \
  --notifications-with-subscribers file://notify.json
```

> **Tip:** Set your very first Budget before launching anything. Add a second alert with `NotificationType: FORECASTED` so AWS warns you when it *predicts* you'll blow the budget — not just after you already have.

### Security Guardrails

- **MFA on the root account** — then lock the root keys away and never use root for daily work.
- **Least privilege** — grant only the permissions a role/user actually needs; start narrow and widen if required.
- **Never commit access keys** — no keys in Git, Dockerfiles, or env files in repos. Use a `.gitignore` and a secrets scanner in CI.
- **Roles, not keys** — EC2/Lambda/ECS use IAM roles for temporary, auto-rotating credentials. Long-lived keys are the #1 breach vector.
- **Encryption** — at rest with **KMS** (enable on S3, EBS, RDS), in transit with TLS everywhere.
- **CloudTrail + GuardDuty** — CloudTrail logs every API call (the audit trail); GuardDuty uses ML to flag suspicious behavior (e.g. crypto-mining, anomalous API calls).
- **Security Groups least-open** — never `0.0.0.0/0` on SSH/RDP/DB ports. Reference SGs by ID and open only what's needed.
- **S3 Block Public Access** — keep it ON at the account level unless a bucket is deliberately a public website.

> **Caution:** The classic disaster: a developer commits an access key to a public GitHub repo. Bots scan GitHub within *minutes* and spin up expensive GPU instances for crypto mining. Use IAM roles instead of keys, and enable a secret scanner so a key never reaches the repo in the first place.

Enable a virtual MFA device for an IAM user:

```bash
# Create the virtual MFA device
aws iam create-virtual-mfa-device \
  --virtual-mfa-device-name my-mfa \
  --outfile /tmp/qr.png --bootstrap-method QRCodePNG

# Scan QR in your authenticator app, then enable with two consecutive codes
aws iam enable-mfa-device \
  --user-name myuser \
  --serial-number arn:aws:iam::123456789012:mfa/my-mfa \
  --authentication-code1 123456 \
  --authentication-code2 654321
```

```bash
# Turn ON account-wide S3 public access block
aws s3control put-public-access-block \
  --account-id 123456789012 \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

> **Tip:** A simple priority order for any new account: (1) MFA on root, (2) a Budget alert, (3) CloudTrail on, (4) S3 Block Public Access on, (5) IAM roles instead of keys. Five steps, fifteen minutes, and you've dodged the most common cost and security incidents.

> **Note:** Prefer a day-by-day path? This is covered in [**Mission 90 Days 46–65**](/mission-90/) — a free 90-day guided DevOps program with browser terminal missions.

---

Running containers on AWS? Continue with [Kubernetes for DevOps](/learn/guides/kubernetes-for-devops/).
