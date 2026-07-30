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
const PREVIEW_ORIGIN = 'http://localhost:4321';

export default defineConfig({
  testDir: 'tests/e2e',
  // Explicit, so the helper modules (`tools.fixtures.ts`, `_shared.ts`) are
  // never mistaken for specs and `.test.ts` is never collected here.
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
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
    command: 'npm run preview',
    url: PREVIEW_ORIGIN,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
