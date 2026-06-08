/**
 * Env Example Checker — bundled, runnable examples for the playground.
 *
 * Each example pairs a `code` snippet with an `.env.example` template so that
 * `check(code, envExample)` (in `engine.ts`) produces a meaningful result. The
 * set is chosen to demonstrate the tool's range:
 *
 *   (a) Node / Next.js  — a var read in code that the example FORGOT (the
 *       headline "missing" case), plus an unused key in the example.
 *   (b) Python (Flask)  — os.getenv / os.environ access; all in sync (the
 *       "clean run, no drift" case).
 *   (c) Polyglot        — Vite, Deno, Ruby, Go, Java and PHP access shapes in
 *       one file, showing the scanner is language-agnostic, with drift in both
 *       directions.
 *
 * `code` is written exactly as a user would paste it; `envExample` matches the
 * KEY=value template format of a real `.env.example`, comments and all.
 */

export interface EnvExample {
  /** Stable id used by the playground selector. */
  id: string;
  /** Short human label for the example option. */
  label: string;
  /** Source code to scan for environment-variable reads. */
  code: string;
  /** The `.env.example` template to compare against. */
  envExample: string;
}

/* (a) Node / Next.js API route. The code reads STRIPE_SECRET_KEY, but the
   example template never declares it → it shows up in missingInExample. The
   example also declares LEGACY_API_URL, which no code path reads → it shows up
   in unusedInExample. DATABASE_URL and SENTRY_DSN are correctly in both. */
const nodeMissing: EnvExample = {
  id: 'node-missing-key',
  label: 'Node — a key missing from .env.example',
  code: `import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const db = connect(process.env["DATABASE_URL"]);

export async function POST(req) {
  Sentry.init({ dsn: process.env.SENTRY_DSN });
  const charge = await stripe.charges.create({ amount: req.amount });
  return Response.json({ id: charge.id });
}`,
  envExample: `# Database
DATABASE_URL=postgres://localhost:5432/app

# Observability
SENTRY_DSN=

# Deprecated — slated for removal
LEGACY_API_URL=https://old.example.com
`,
};

/* (b) Python Flask config — every variable the code reads is declared in the
   example, and the example declares nothing extra. A clean, no-drift result. */
const pythonInSync: EnvExample = {
  id: 'python-in-sync',
  label: 'Python — fully in sync',
  code: `import os

class Config:
    SECRET_KEY = os.getenv("SECRET_KEY")
    DATABASE_URL = os.environ["DATABASE_URL"]
    REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
    DEBUG = os.getenv("FLASK_DEBUG") == "1"`,
  envExample: `SECRET_KEY=change-me
DATABASE_URL=postgresql://localhost/app
REDIS_URL=redis://localhost:6379
FLASK_DEBUG=0
`,
};

/* (c) One file touching many ecosystems at once. The scanner recognises every
   access shape regardless of language. Drift runs both ways: MAIL_FROM is read
   but not declared (missing), and UNUSED_TOKEN is declared but never read. */
const polyglot: EnvExample = {
  id: 'polyglot',
  label: 'Polyglot — Vite, Deno, Ruby, Go, Java, PHP',
  code: `// Vite (browser)
const apiBase = import.meta.env.VITE_API_BASE;

// Deno
const port = Deno.env.get("PORT");

// Ruby
queue = ENV.fetch("REDIS_URL")
host = ENV["APP_HOST"]

// Go
region := os.Getenv("AWS_REGION")

// Java
String key = System.getenv("API_KEY");

// PHP
$from = getenv("MAIL_FROM");
$env = $_ENV["APP_ENV"];`,
  envExample: `VITE_API_BASE=http://localhost:3000
PORT=8000
REDIS_URL=redis://localhost:6379
APP_HOST=localhost
AWS_REGION=us-east-1
API_KEY=
APP_ENV=development

# Declared but no longer referenced anywhere in the code
UNUSED_TOKEN=
`,
};

export const examples: EnvExample[] = [
  nodeMissing,
  pythonInSync,
  polyglot,
];
