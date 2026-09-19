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

Prefer serving the **production build** — it is what deploys, and the dev server
cannot be started from an agent harness: the background-task runner kills it with
"Dev server failed to start within 30s" before Astro finishes warming up, and a
Bash `&` does not survive between tool calls.

```bash
npm run build                                   # never bare `astro build`
cd dist && python -m http.server 4332 --bind 127.0.0.1   # as a background task
```

`_headers` and `_redirects` are Cloudflare-applied and NOT served this way — for
CSP, cache-control or redirect behaviour, point the same checks at
`https://opscanopy.com` instead.

Interactive from a terminal, the dev server still works:

```powershell
npm run dev        # READ THE PORT from output — stale dev/preview processes
                   # often occupy 4321-4323, so it may bind 4324+
```

## Drive interactively (CDP) — for anything a DOM dump cannot see

Keyboard contracts, `location.hash` after a debounce, computed colours, focus:
launch Chrome with `--remote-debugging-port=9223 --user-data-dir=$(mktemp -d)` as a
background task and drive it from a Node script over the DevTools protocol. `ws` is
in `node_modules`, but a script outside the repo must `require()` it by absolute
path. Dispatch real `KeyboardEvent`s, read `getComputedStyle(el).color`, poll
`location.hash`. This is how the Ctrl+Enter contract and the slab contrast fix were
confirmed on 2026-09-18 — a `--dump-dom` cannot observe either.

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
- Reuse of one `--user-data-dir` across several page loads lets the service worker
  from the first load serve its **"You're offline" fallback** to later navigations
  under a virtual-time budget. Use a fresh `mktemp -d` profile per URL.
- `/tests/<cat>/<test>/` renders "Question 1 of 65" and the "0 of 2 selected"
  counters **server-side**, so their presence in a dump proves nothing about the
  runner script. To prove boot, drive it over CDP (`--remote-debugging-port`):
  click `[data-next]` and check the second `[data-q]` fieldset unhides; answers
  register only through `input.click()` (the runner listens for `change`).
