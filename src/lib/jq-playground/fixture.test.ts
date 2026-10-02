/**
 * jq Playground — the build-time seed fixture is REAL jq output.
 *
 * The playground server-renders its first example's result (CLAUDE.md, "Every
 * tool's result panel is server-rendered from examples[0]"), but the result
 * needs the jq WebAssembly binary, which the build does not run. So the output
 * is checked in as `fixtures/example-1.out.json` and seeded from there — and
 * this test runs the REAL jq 1.8.2 binary in node (jq-wasm reads its `.wasm`
 * from node_modules, as engine.test.ts does) on the same example and asserts
 * the fixture is byte-for-byte what jq produces today. If jq, the engine or
 * the example changes, this fails instead of the page shipping a stale answer.
 *
 * Regenerate after a deliberate change:
 *   JQ_FIXTURE_WRITE=1 npx vitest run src/lib/jq-playground/fixture.test.ts
 * (then review the diff — the fixture is a claim the page makes).
 *
 * `elapsedMs` is the only field left out: it is a property of one run, and
 * the static page never states it (render.ts `okSummary(result, false)`).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runJq } from './engine';
import { examples } from './examples';
import { okHtml, okSummary } from './render';
import { escapeHtml } from '../escape-html';
import type { JqFlags, JqOk } from './types';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'example-1.out.json');

type Fixture = {
  example: { id: string; program: string; input: string; flags: JqFlags };
  result: Omit<JqOk, 'elapsedMs'>;
};

async function realRun(): Promise<Fixture> {
  const ex = examples[0];
  const result = await runJq(ex.program, ex.input, ex.flags);
  if (!result.ok) throw new Error(`examples[0] failed under real jq: ${result.errorKind}: ${result.error}`);
  const { elapsedMs: _elapsed, ...rest } = result;
  return { example: { id: ex.id, program: ex.program, input: ex.input, flags: ex.flags }, result: rest };
}

describe('jq seed fixture', () => {
  it('fixtures/example-1.out.json equals what real jq 1.8.2 prints for examples[0]', async () => {
    const real = await realRun();
    if (process.env.JQ_FIXTURE_WRITE) {
      mkdirSync(dirname(FIXTURE), { recursive: true });
      writeFileSync(FIXTURE, `${JSON.stringify(real, null, 2)}\n`);
    }
    const fixture = JSON.parse(readFileSync(FIXTURE, 'utf-8')) as Fixture;
    expect(fixture).toEqual(real);
  });

  it('is a non-trivial, exact, untruncated result (so the seed proves something)', () => {
    const fixture = JSON.parse(readFileSync(FIXTURE, 'utf-8')) as Fixture;
    expect(fixture.result.ok).toBe(true);
    expect(fixture.result.outputs.length).toBeGreaterThan(0);
    expect(fixture.result.outputsExact).toBe(true);
    expect(fixture.result.truncated).toBe(false);
    expect(fixture.result.version).toMatch(/^jq-1\.8\.2$/);
  });

  it('renders the seed the island renders (one card per output, no timing in the summary)', () => {
    const fixture = JSON.parse(readFileSync(FIXTURE, 'utf-8')) as Fixture;
    const seed = { ...fixture.result, elapsedMs: 0 } as JqOk;
    const html = okHtml(seed);
    expect(html.match(/class="jqp-out"/g)?.length).toBe(fixture.result.outputs.length);
    for (const row of fixture.result.outputs) expect(html).toContain(escapeHtml(row));
    expect(okSummary(seed, false)).not.toMatch(/ms\b/);
  });
});
