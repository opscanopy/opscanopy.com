/**
 * jq Playground — island behaviour that has no DOM in vitest, pinned against
 * the component source (the type-scale / playground-kit gates do the same).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runJq } from './engine';

const source = readFileSync(new URL('../../components/JqPlayground.astro', import.meta.url), 'utf8');

function fnBody(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  expect(start, `function ${name} not found`).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('\n    }\n', start));
}

describe('JqPlayground error state', () => {
  it('a compile error (.items[] |) carries no outputs of its own', async () => {
    const result = await runJq('.items[] |', '{"items":[1,2]}');
    expect(result).toMatchObject({ ok: false, errorKind: 'compile', partialOutputs: [] });
  });

  it('renderErr clears the previous OUTPUT list instead of leaving it under the card', () => {
    const body = fnBody('renderErr');
    expect(body).toContain("resultsBox!.innerHTML = ''");
    expect(body).not.toContain("setAttribute('data-stale'");
  });
});
