---
title: "Stop shipping a stale .env.example"
description: "Your .env.example is documentation that silently rots. Here is why env drift breaks onboarding and deploys, how to detect missing and unused keys, and how to keep the example file honest."
pubDate: 2026-06-02
tags: ["configuration", "developer-experience", "twelve-factor"]
---

A `.env.example` is the one file in your repo that nobody runs, nobody tests, and everybody trusts. It’s the contract a new teammate reads on day one to answer the only question that matters: which environment variables do I need to set before this thing boots? When that file is right, onboarding is a five-minute copy-and-fill. When it’s wrong, you get the most demoralising kind of bug — the app crashes on startup with `undefined is not a function`, or worse, runs happily with a feature silently disabled because a flag defaulted to off.

The problem is that `.env.example` is documentation, and documentation drifts. Code that reads `process.env.STRIPE_WEBHOOK_SECRET` ships in a feature branch. The example file doesn’t get the new key because adding it isn’t part of “make the feature work” — it’s part of “be kind to the next person,” and that step is invisible until someone hits it. Multiply that across a year of merges and the example file becomes a museum of variables you used to need, missing half the ones you actually do.

## How drift actually happens

Drift is never a single dramatic event. It’s the accumulation of small, reasonable omissions:

- A new integration adds `SENTRY_DSN` and `SENTRY_ENVIRONMENT`. The PR author has them in their local `.env`, so the app works for them — and the example file never learns about them.
- A feature gets ripped out. The code referencing `LEGACY_BILLING_URL` is deleted, but the key lingers in `.env.example` forever, so newcomers dutifully fill in a value that does nothing.
- A variable gets renamed from `DB_URL` to `DATABASE_URL` in code, but the example still advertises the old name. Now the file is actively misleading.
- A key is read in only one rarely-touched worker, so it never surfaces in casual testing — until that worker is deployed to a fresh environment with no value set.

None of these trip your linter, your type checker, or your tests. The example file isn’t part of the build graph, so nothing tells you it’s out of sync. The only feedback loop is a human getting burned.

## The two failure modes

There are exactly two ways the example file can be wrong, and they fail in opposite directions:

**Missing keys** are variables your code reads that the example doesn’t mention. These are the dangerous ones. A missing key means a fresh checkout boots into an undefined state — a crash if you’re lucky, a silent misconfiguration if you’re not.

**Unused keys** are variables the example advertises that no code reads anymore. These are merely wasteful: they make the file longer, they make people provision secrets they don’t need, and they erode trust in the file as a source of truth. If three keys turn out to be dead, why would you believe the other twenty?

A healthy example file has neither. Every variable the code reads appears in the example, and every variable in the example is actually read somewhere.

## What “reads a variable” looks like across languages

Detecting drift means parsing two things: the set of variables your code references, and the set of keys your example declares. The reference side is the tricky half because every ecosystem spells it differently:

```javascript
// Node.js — the classic
const key = process.env.STRIPE_SECRET_KEY;
const { DATABASE_URL, REDIS_URL } = process.env;

// Vite / browser builds
const api = import.meta.env.VITE_API_BASE;
```

```python
# Python — os.environ and os.getenv
import os
secret = os.environ["DJANGO_SECRET_KEY"]
debug = os.getenv("DEBUG", "false")
```

```go
// Go — os.Getenv and os.LookupEnv
addr := os.Getenv("LISTEN_ADDR")
token, ok := os.LookupEnv("GITHUB_TOKEN")
```

```bash
# Shell — direct expansion
: "${WEBHOOK_URL:?must be set}"
echo "$DEPLOY_ENV"
```

The example side is comparatively uniform — a list of `KEY=value` lines, often with comments and blank sections:

```bash
# .env.example
# --- Core ---
DATABASE_URL=postgres://localhost:5432/app
REDIS_URL=redis://localhost:6379

# --- Payments ---
STRIPE_SECRET_KEY=
# STRIPE_WEBHOOK_SECRET is set in code but missing here ↓
```

Set-subtract the two and the drift falls right out. Keys referenced in code but absent from the example are **missing**. Keys present in the example but referenced nowhere are **unused**. Everything in the intersection is fine.

## Why a quick diff beats a `grep`

You can absolutely cobble this together with `grep -rhoE 'process\.env\.[A-Z_]+'` piped through `sort -u` and compared against `cut -d= -f1 .env.example`. People do, and it half-works. The trouble is the edge cases that a one-off regex always misses:

- Destructured access (`const { FOO } = process.env`) that the naive pattern doesn’t catch.
- Commented-out keys in the example that shouldn’t count as “declared.”
- Quoted values, `export` prefixes, and inline comments that throw off a dumb `cut`.
- Multiple frameworks in one repo (`process.env` and `import.meta.env` and `os.getenv`), each needing a different pattern.

By the time you’ve handled all of those, your “quick” shell pipeline is a brittle script nobody wants to maintain. A purpose-built checker handles the access patterns and the example-file quirks consistently, and it does it without you pasting secrets into a remote service.

## Keeping the file honest

Detection is the first step; keeping drift from coming back is the second. A few habits help:

- **Make the example the source of truth.** Some teams load `.env.example` at startup in development and warn on any key in code that isn’t declared there. The file stops being optional.
- **Check it in review.** Treat a new `process.env.X` without a matching example line the same way you’d treat a new public function without a doc comment.
- **Prune on delete.** When you remove a feature, search the example for its keys too. Dead keys are easy to leave behind.
- **Run the diff before you open the PR.** Catching drift takes seconds and saves the next person an afternoon.

## Catch it before you commit

The fastest way to know your example file is honest is to diff it against your actual code. **Env Example Checker** does exactly that in the browser: paste your source and your `.env.example`, and it reports the variables your code uses but the example is missing, plus the keys the example declares that nothing reads. It runs entirely client-side — your code and secrets never leave the page — so you can run it on a private repo without a second thought.

Before your next pull request, give the next developer a `.env.example` they can actually trust.

[Check your .env.example for drift →](/env-example-checker)
