import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the client-side tool engines. Engines are pure TypeScript
 * (no DOM), so the default node environment is all we need. Tests live next to
 * each engine as src/lib/<tool>/engine.test.ts.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Node 24 + Vitest 4 crash the worker-thread pool on Windows when running
    // many files in parallel (every file errors at collection with "reading
    // 'config'"), even though each file passes in isolation. Run files in one
    // process — the engine suites are tiny (≈2s total), so we lose nothing.
    fileParallelism: false,
  },
});
