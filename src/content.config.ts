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
    /** Optional revision date; renders a "Last updated" line + feeds JSON-LD dateModified. */
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).optional(),
    draft: z.boolean().default(false),
    /** Locale of this post; normally derived from the folder, declared for clarity. */
    lang: z.enum(['en', 'es', 'de', 'fr', 'pt-br']).optional(),
    /** Neutral slug of the English source this is a translation of. */
    translationOf: z.string().optional(),
    /** Byline attribution; defaults to the site author so existing posts validate. */
    author: z.string().default('OpsCanopy'),
    /** Optional in-article conversion CTA linking the post to the tool it discusses. */
    relatedTool: z
      .object({
        name: z.string(),
        href: z.string(),
      })
      .optional(),
  }),
});

const guides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    track: z.enum(['linux', 'docker', 'aws', 'kubernetes', 'networking', 'projects']),
    order: z.number(),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
    updatedDate: z.coerce.date().optional(),
    estMinutes: z.number().optional(),
    tags: z.array(z.string()).optional(),
    relatedTools: z.array(z.string()).optional(),
    draft: z.boolean().default(false),
    lang: z.enum(['en', 'es', 'de', 'fr', 'pt-br']).default('en'),
    translationOf: z.string().optional(),
    author: z.string().default('OpsCanopy'),
    seoTitle: z.string().optional(),
    metaDescription: z.string().optional(),
    faqs: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
  }),
});

export const collections = { blog, guides };
