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
  },
});
