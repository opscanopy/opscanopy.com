/**
 * Every registry tool needs public/tool-art/<slug>.svg. ToolArt derives the
 * path from the slug with no registry field, so a missing file is not a build
 * error — it ships as a broken-image icon on every /tools/ card. Three tools
 * (fig. 40–42) did exactly that until 2026-10-07.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tools } from '../data/tools';

const artDir = fileURLToPath(new URL('../../public/tool-art/', import.meta.url));

describe('tool art', () => {
  it('exists for every tool in the registry', () => {
    expect(tools.filter((t) => !existsSync(`${artDir}${t.slug}.svg`)).map((t) => t.slug)).toEqual([]);
  });
});
