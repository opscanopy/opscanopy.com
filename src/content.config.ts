/**
 * Astro 6 content layer — collection definitions.
 * The "blog" collection is sourced from local markdown via the glob loader.
 * Schema field names and the collection key are consumed by:
 *   - src/pages/blog/index.astro      (getCollection("blog"))
 *   - src/pages/blog/[...slug].astro  (getCollection("blog") + render())
 * Keep these in sync if you rename anything.
 */
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    tags: z.array(z.string()).optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
