/**
 * Resolves the per-tool OG image for a locale-neutral page key, if one
 * exists. Consumed by SEO.astro after it computes `pageKey` — since that key
 * is already locale-stripped, a localized tool page (e.g. /de/subnet-calculator)
 * resolves to the exact same English-authored PNG as its English original.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getTool } from '../data/tools';

const cache = new Map<string, string | undefined>();

/** `/tools-og/<slug>-og.png` for a live tool's page key, or undefined if the
 *  key isn't a single-segment tool slug, the tool isn't live, or its image
 *  hasn't been generated (`npm run gen:og`) yet. */
export function toolOgImage(pageKey: string): string | undefined {
  if (cache.has(pageKey)) return cache.get(pageKey);
  const result = resolve(pageKey);
  cache.set(pageKey, result);
  return result;
}

function resolve(pageKey: string): string | undefined {
  const slug = pageKey.replace(/^\/+|\/+$/g, '');
  if (!slug || slug.includes('/')) return undefined;

  const tool = getTool(slug);
  if (!tool || tool.status !== 'live') return undefined;

  const publicPath = `/tools-og/${tool.slug}-og.png`;
  const diskPath = join(process.cwd(), 'public', 'tools-og', `${tool.slug}-og.png`);
  return existsSync(diskPath) ? publicPath : undefined;
}
