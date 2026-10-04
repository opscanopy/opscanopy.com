// Blog dating guard: one English post per day, nothing future-dated, locale
// copies carry their English source's pubDate, updatedDate never precedes it.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fmDate, fmDraft } from '../../scripts/lastmod-core.mjs';

const BLOG = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'blog');
const posts = readdirSync(BLOG).flatMap((lang) =>
  readdirSync(join(BLOG, lang))
    .filter((f) => f.endsWith('.md'))
    .map((file) => ({ lang, file, src: readFileSync(join(BLOG, lang, file), 'utf8') }))
    .filter((p) => !fmDraft(p.src))
    .map((p) => ({ ...p, pub: fmDate(p.src, 'pubDate'), upd: fmDate(p.src, 'updatedDate') })),
);
const en = new Map(posts.filter((p) => p.lang === 'en').map((p) => [p.file, p.pub]));

describe('blog dates', () => {
  it('English pubDates are unique', () => {
    const seen = new Map<string, string[]>();
    for (const p of posts.filter((p) => p.lang === 'en')) seen.set(p.pub!, [...(seen.get(p.pub!) ?? []), p.file]);
    expect([...seen].filter(([, f]) => f.length > 1).map(([d, f]) => `${d}: ${f.join(', ')}`)).toEqual([]);
  });

  it('no pubDate is in the future, updatedDate >= pubDate, locale copy = English', () => {
    const today = new Date().toISOString().slice(0, 10);
    const bad = posts.flatMap((p) => [
      !p.pub && `${p.lang}/${p.file}: no pubDate`,
      p.pub! > today && `${p.lang}/${p.file}: pubDate ${p.pub} after ${today}`,
      p.upd && p.upd < p.pub! && `${p.lang}/${p.file}: updatedDate ${p.upd} < pubDate ${p.pub}`,
      p.lang !== 'en' && en.has(p.file) && en.get(p.file) !== p.pub && `${p.lang}/${p.file}: ${p.pub} != en ${en.get(p.file)}`,
    ]).filter(Boolean);
    expect(bad).toEqual([]);
  });
});
