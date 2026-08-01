import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the E2E UX journey suite (`tests/e2e/`, journeys J1–J8).
 *
 * Runs against a PREBUILT `dist/` through `astro preview`, not the dev server:
 * the journeys must exercise the production bundles (hashed engine chunks, the
 * CodeMirror vendor split, jq's hashed WASM asset) — a dev-server run proves
 * none of that. Build first (`npm run build`) or the preview server serves a
 * stale/absent `dist/`.
 *
 * `astro preview` binds http://localhost:4321 (astro.config.mjs sets no
 * `server` block, so the Astro default stands). `baseURL` matches, so specs
 * navigate with root-relative paths like `/cidr-checker/`.
 *
 * Runner separation: vitest's `include` is `src/**\/*.test.ts` (vitest.config.ts)
 * and this suite lives at `tests/e2e/*.spec.ts` — different directory AND
 * different suffix, so neither runner can ever collect the other's files. No
 * vitest `exclude` was needed. Kept deliberately: e2e specs must stay `.spec.ts`
 * under `tests/`, engine tests must stay `.test.ts` under `src/`.
 */
/**
 * Port override, because `reuseExistingServer: true` below is a footgun when more
 * than one checkout of this repo exists on the machine: it silently attaches to
 * whatever `astro preview` already owns 4321 and then tests THAT build. That
 * happened for real in Wave 1 (all 14 journeys failed against the wrong dist/).
 * Set `OC_PREVIEW_PORT` to give a worktree its own port; the default is
 * unchanged, so a single-checkout run behaves exactly as before.
 */
const PREVIEW_PORT = Number(process.env.OC_PREVIEW_PORT ?? 4321);
const PREVIEW_ORIGIN = `http://localhost:${PREVIEW_PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  // Explicit, so the helper modules (`tools.fixtures.ts`, `_shared.ts`) are
  // never mistaken for specs and `.test.ts` is never collected here.
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  // These journeys assert TIMING contracts — a 130-220ms debounce and a ~600ms
  // calm-error hold — so the runner's own CPU contention is a measurement error,
  // not a property of the tool. At 4 workers on this machine, J2 saw
  // `pressSequentially` stall past the hold window often enough to report a
  // stale intermediate diagnostic as a contract violation (~1 run in 3 with only
  // four tools in the table; it gets worse as the matrix grows to ten).
  // Two workers keeps most of the wall-clock win while making the timing
  // assertions trustworthy. Raise it only for a suite with no timing assertions.
  workers: 2,
  // Flake must fail loudly rather than be papered over by a rerun — the
  // journeys assert timing contracts (debounce, calm-error hold) where a
  // silent retry would hide a real regression.
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'test-results/html-report', open: 'never' }]],
  // Must differ from the html reporter's folder — Playwright refuses to start
  // if the two collide.
  outputDir: 'test-results/artifacts',
  timeout: 60_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: PREVIEW_ORIGIN,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  // Chromium only. The suite is a UX-contract regression gate, not a
  // cross-browser matrix; every tool is plain ES modules + CodeMirror + WASM
  // with no engine-specific code paths.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run preview -- --port ${PREVIEW_PORT}`,
    url: PREVIEW_ORIGIN,
    // Do NOT reuse whatever happens to be on this port. Reuse cost this project
    // hours across three separate incidents: once a leftover `astro preview`
    // from the main checkout served the PREVIOUS build to a worktree's tests, and
    // once a stray `astro dev` was adopted — a dev server renders from source
    // rather than dist/, so pages that exist in the build 404'd and every journey
    // failed with "#playground not found". Both times the suite looked like it
    // had found real regressions and had actually tested the wrong thing.
    //
    // Starting our own server means a busy port is a loud, immediate error
    // instead of a silent wrong answer. If you are iterating locally and want to
    // keep a server warm, set OC_E2E_REUSE=1 deliberately.
    reuseExistingServer: process.env.OC_E2E_REUSE === '1',
    timeout: 120_000,
  },
});
