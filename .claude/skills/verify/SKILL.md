---
name: verify
description: Runtime-verify OpsCanopy tool pages — build/launch recipe and headless-Chrome drive protocol for this fully static Astro site (no backend; every tool is a client-side playground island).
---

# Verifying OpsCanopy tool changes

All tools are 100% client-side Astro islands: the playground `<script>` boots on
page load, lazily imports its engine, seeds an example, and renders results into
the DOM. So a headless-Chrome DOM dump after JS settles IS runtime observation —
if the seed evaluated and the results markup is present, the whole chain
(boot → dynamic import → engine → render) executed.

## Launch

```powershell
npm run dev        # background; READ THE PORT from output — stale dev/preview
                   # processes often occupy 4321-4323, so it may bind 4324+
```

## Drive (headless Chrome, no Playwright needed)

Chrome lives at `C:\Program Files\Google\Chrome\Application\chrome.exe`.
Use Git Bash for clean byte-exact stdout redirection:

```bash
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
ud=$(mktemp -d)   # fresh profile per run avoids lock clashes
"$CHROME" --headless=new --disable-gpu --no-first-run --user-data-dir="$ud" \
  --virtual-time-budget=9000 --dump-dom "http://localhost:<port>/<slug>/" > dump.html
# screenshots: swap --dump-dom for --screenshot=out.png --window-size=1280,1500
# mobile: --window-size=390,1700
```

- `--virtual-time-budget=9000` lets the lazy engine import + debounced evaluate settle.
- Headless `new` mode renders with `prefers-color-scheme: dark` → you get the
  dark theme for free; light theme needs a real browser or CDP emulation.
- Hash deep links (`#ip=`, `#list=`) pass through fine on the CLI URL.
- Textarea seeded content IS visible in dump-dom (child text node); `<input>`
  values are NOT (property, not attribute) — assert on rendered results instead.

## Flows worth driving

- Fresh load of the tool page → seeded example's results markup present.
- Deep links: `#ip=<addr>` (cross-tool chips), `#list=<encoded>` (cidr-checker).
- A junk deep link → specific diagnostic error card, not a blank/red flash.
- One locale page (`/de/<slug>/`) → playground still boots there.
- Grep dumps for exact user-facing strings (verdicts, summary line, glosses).

## Gotchas

- Run vitest from PowerShell (`C:/` capital drive). A lowercase-`c:/` cwd breaks
  Vitest 4 collection ("reading 'config'" at every describe).
- `npm run build` (~30s, 312 pages) type-checks every locale page — run it
  before calling page-frontmatter changes done.
- Kill your dev server when finished; orphaned ones accumulate on 4321+.
