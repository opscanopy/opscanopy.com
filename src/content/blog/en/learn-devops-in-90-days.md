---
title: "Learn DevOps in 90 Days: the free, incident-first path from developer to DevOps engineer"
description: "Why we built Mission: 90 Days DevOps — a free day-by-day path from Linux to Kubernetes with playable incident missions. The full plan, the design decisions, and the honest tradeoffs."
pubDate: 2026-07-12
tags: ["devops", "career", "learning"]
relatedTool:
  name: "Mission: 90 Days DevOps"
  href: "/mission-90/"
---

![Learn DevOps in 90 days: a free, incident-first path from developer to DevOps engineer](/blog/learn-devops-in-90-days-hero.svg)

There is a moment every new ops engineer remembers: the first time something real breaks. The tutorial ended weeks ago, the happy path is nowhere in sight, and a pod is stuck in `CrashLoopBackOff` — or a cron job silently stopped, or the whole site answers 502. Tutorials teach commands. Incidents teach engineers.

That gap is why we built [Mission: 90 Days DevOps](/mission-90/) — a free, guided program that takes you from your first terminal command to job-ready in 90 days, one focused lesson a day, with a story-driven incident mission to fix at the end of every week. All 90 days and all 10 missions are live now. No signup, no email wall, no paywall; your progress saves in your own browser. This post explains what's in it, the order and why, and the design decisions behind it — including the ones with real tradeoffs.

## The ordering rule: every layer must let you debug the layer above it

Most DevOps roadmaps fail in one of two ways. Either they hand you a 200-node skill tree with no sequence, or they start with the shiny thing — Kubernetes before Linux, which is how people end up copy-pasting `kubectl` commands they can't debug.

The program's order comes from one rule: **every layer must let you debug the layer above it.**

- Kubernetes problems are usually container problems.
- Container problems are usually Linux problems.
- Cloud networking problems are usually DNS-and-ports problems you can learn on localhost.

So the 90 days run Linux first, containers second, cloud third, orchestration fourth, and job preparation last — 45 to 60 minutes a day, roughly 80 hours of core work in total. That is a real commitment, not a "10 minutes a day" promise, but it fits alongside a full-time job, and 90 days is short enough that you can see the finish line from Day 1.

![The 90-day path: five phases from Linux fundamentals to job-ready, with an incident mission capping every week](/blog/learn-devops-in-90-days-diagram.svg)

## The five phases

**Phase 1 — Linux & the terminal (Days 1–21).** Three weeks on files, permissions, processes, systemd, logs, DNS and ports, bash, cron and SSH. It feels long when Kubernetes is calling, but nearly every incident ends with someone SSH'd into a box reading logs — this is where that stops being scary. Everything runs locally on WSL2 or any Linux machine. Cost: zero.

**Phase 2 — Docker & CI/CD (Days 22–45).** Packaging software and shipping it automatically, deliberately paired: images, Dockerfiles, volumes, networks and compose on one side; real Git workflows and GitHub Actions pipelines on the other. The phase ends with **Project 1**: containerizing `linkstash`, a FastAPI URL shortener, database included. Still fully local, still zero cost.

**Phase 3 — AWS (Days 46–65).** IAM and VPC first — because most AWS confusion is "why can't this thing talk to that thing", and the answer is almost always a security group or a subnet route — then S3, RDS, load balancers and monitoring. **Project 2** deploys the same `linkstash` container properly: ECS Fargate behind an ALB with RDS Postgres across two availability zones.

**Phase 4 — Kubernetes & Terraform (Days 66–85).** Pods, Services, config, probes, ingress and Helm — practiced on local `kind` clusters first, so mistakes are free — then Terraform, so infrastructure becomes reviewable code instead of console clicks. **Project 3** is the capstone: `linkstash` again, now on k3s on a single EC2 instance, provisioned entirely by Terraform, packaged as a Helm chart, served over real TLS by Traefik and cert-manager.

**Phase 5 — Job-Ready (Days 86–90).** The part every roadmap skips: turning the work into a hire. A resume rebuilt around the three projects, portfolio and GitHub polish, incident-management fundamentals — severity levels, blameless postmortems, error budgets — and an interview drill. Every day of the program ends with three to five interview questions, so by Day 86 you have already answered more than 300.

## One app, carried up the whole stack

The design decision we would defend hardest: the program builds **one application three ways**, not three throwaway projects.

`linkstash` is containerized in Phase 2, deployed to AWS in Phase 3, and orchestrated on Kubernetes in Phase 4. In an interview, that turns "I did some tutorials" into "here is one system I have run three ways, and here is why each layer exists." The compare-and-contrast — compose file versus task definition versus Helm chart, `depends_on` versus target groups versus readiness probes — is precisely the story interviewers ask for.

## Incidents are the curriculum, not a bonus

Reading about `journalctl` and using it at 00:14 during an outage are different skills, and only one of them is a job. So the week caps are not quizzes — they are **missions**: story-driven incident simulations that run in a terminal in your browser. No setup, no cloud account, no code required.

You start week one with *Server Down!* — a production web server is down at 2 a.m. and you have to find the runaway process, kill it, and bring nginx back. By the final week you face *The Midnight Outage*: a SEV-1 where a single security-group change cascades into failed load-balancer health checks, a DNS failover, and pods in the failover region that cannot start because someone deleted the Secret they mount. The fix has to land **upstream-first** — reopen the network path, restore the Secret, then confirm DNS healed — in that order, because restarting pods was never the problem.

In between: a DNS mystery, a permissions lockout, a crash-looping container stack, a broken CI pipeline, a surprise AWS bill, a dropped production table, a Kubernetes cluster in chaos, and a stale Terraform state lock. Ten missions, each rehearsing the exact diagnostic loop its week taught.

## Designed to cost (almost) nothing

A learning path that quietly runs up a cloud bill is a broken learning path. So the budget rules are structural:

- Phases 1, 2 and the Kubernetes fundamentals run **entirely locally** — WSL2, Docker, `kind`, and local Terraform providers. Zero cloud spend.
- Every AWS day opens with a **cost box** stating exactly what the lab costs and under what conditions it is free, and ends with a **mandatory teardown**.
- The Kubernetes capstone uses k3s on one t3.small (about $19/month if you forget it, effectively free on the free tier with same-day teardown) instead of EKS, whose control plane alone costs about $73/month. Same Kubernetes API, same manifests, same Helm — you just don't pay AWS to hold the API server. The tradeoff, stated honestly: you won't touch EKS-specific glue like IRSA or managed node groups, which is fine to learn on the job.

## What a day looks like

Every one of the 90 days has the same shape, so you always know what "done" means:

1. **A short concept** — under 600 words, one diagram, one real-world analogy. Read it in five minutes.
2. **A hands-on lab** — real commands with real output, reproducible on your machine.
3. **Common errors & fixes** — the actual error strings you will hit, why they happen, and how you'd spot them in production.
4. **Interview Q&A** — three to five questions with answers worth saying out loud.

Optional "Go Deeper" extras exist for the days you have more time, and are never assumed by the next lesson.

## The honest tradeoffs

- **90 days makes you hireable-junior, not senior.** You'll contribute and debug from week one on the job; depth comes with pager time.
- **It's opinionated.** GitHub Actions rather than Jenkins, AWS rather than Azure, k3s rather than EKS. Each slot got the highest-leverage default; your target job may differ.
- **Self-paced means self-discipline.** Progress tracking helps; it doesn't replace showing up daily.
- **The AWS phase needs a card on file.** The teardown discipline keeps spend near zero, but the risk is never exactly zero.

## Start today

Everything is live: [all 90 days](/mission-90/), the [ten missions](/mission-90/missions/), and the three projects. Start with Day 1 — or, if you want to feel the point of the whole program in ten minutes, play *Server Down!* first. It needs nothing but a browser tab, and it ends the way every good incident does: with the site back up, and you knowing exactly why.
