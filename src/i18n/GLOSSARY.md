# Translation glossary & rules (OpsCanopy i18n)

This file is the binding contract for every translation task. Read it fully before translating.

## What you are doing

You translate a full Astro page (`.astro`) or Markdown (`.md`) file from English into a target
locale, writing a complete translated copy to a new path. You translate **only human-facing prose**.
You keep **everything else byte-for-byte identical**: structure, markup, attributes, imports,
component usage, code blocks, and the do-not-translate terms below.

## NEVER translate / NEVER alter

- Object keys, variable names, type names, `import` statements, component names/props.
- HTML/JSX structure, tag names, `class`/`class:list` values, `id`, `slot`, `aria-controls`,
  `href` targets (the URL path itself), `data-*` attributes, inline styles.
- Any text inside `<span class="code-mono">`, `<code>`, `translate="no"`, `<CodeBlock … code={…}>`,
  fenced code blocks, or template literals holding code/examples.
- Brand: `OpsCanopy` (and `site.name`), `@opscanopy`, `opscanopy.com`, the GitHub URL.
- Tool brand names: `AlertLint`, and every tool's `name` field — keep verbatim.
- Trademarks / products: `Grafana`, `Grafana Labs`, `Raintank, Inc.`, `Loki`, `Prometheus`,
  `Kubernetes`/`k8s`, `Trivy`, `Grype`, `Snyk`, `osv-scanner`, `GitHub Actions`, `systemd`,
  `cron`/`crontab`, `Quartz`, `PromQL`, `LogQL`.
- Syntax & literals: cron expressions (`*/15 9-17 * * 1-5`, `@daily`, `@reboot`), `OnCalendar`,
  `.timer`, `.service`, `[Timer]`, `Persistent=true`, regex, PromQL/LogQL, CLI commands, env var
  names, filenames (`.trivyignore`, `.grype.yaml`, `.snyk`, `.env.example`, `osv-scanner.toml`),
  and field range literals in tables (`0–59`, `1–31`, `JAN–DEC`, `SUN–SAT`, 24-hour clock values).
- Keep the Grafana/Raintank trademark disclaimer factually identical (only translate the connective
  prose, never the names).

## DO translate

- Visible sentence/paragraph prose, headings, `eyebrow` labels, hero `headline`/`lead`,
  FAQ questions & answers, pipeline step titles/bodies, `badges` labels, button text,
  `note` columns in tables, the page `title` and `description` props, `og`/meta descriptive text,
  Markdown body prose and headings, image `alt` text.
- Translate prose that surrounds an inline `<span class="code-mono">…</span>` or `<a>…</a>` — keep
  the span/anchor and its inner code/URL intact, translate the words around and any human link text.

## Preserve exactly when copying a page file

- Do **not** change `import` paths' correctness: a page moved from `src/pages/foo.astro` to
  `src/pages/<locale>/foo.astro` is ONE directory deeper, so `../components/X` becomes
  `../../components/X`, `../data/tools` becomes `../../data/tools`, `../lib/jsonld` becomes
  `../../lib/jsonld`, etc. Adjust every relative import by adding one `../`.
- Leave `canonical` exactly as the English page key (e.g. `canonical="/cron-expression-tester"`).
  Do NOT add the locale prefix — the SEO component derives the localized canonical from the active
  locale automatically.
- Keep all `href` values that point to tool/site routes as their English page keys
  (e.g. `href="/cron-to-systemd"`). Site chrome localizes links automatically; in-page content
  links may stay as English page keys (they resolve at root) — do not invent localized paths.

## Locale conventions

- **es** (Spanish): neutral/international Spanish, no region slang. Use `¿` `¡`. Keep widely-used
  English dev terms developers actually use.
- **de** (German): formal **"Sie"**. German compound nouns. Low-high quotes „…". Decimal comma.
  Keep English dev terms Germans use (Container, Request/Limit, Workflow, Pod…).
- **fr** (French): vouvoiement. Guillemets « … » with non-breaking spaces. Decimal comma.
  Keep idiomatic English dev terms.
- **pt-br** (Brazilian Portuguese): "você", "arquivo" (not "ficheiro"), "tela" (not "ecrã").
  Decimal comma. Brazilian dev loanwords.

## SEO keywords (when present)

Where a file has a `keywords` list, produce **localized search intent** — terms a native developer
would actually Google — not literal translations. Mixing in the common English term is fine when
that's what people search. Keep the same array length.

## Output

Write the COMPLETE translated file to the target path. Nothing else. It must be valid and build.
