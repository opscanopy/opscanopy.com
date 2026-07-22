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

/** One "quick check" question — a sibling of interviewQA, optional and
 *  progressive: a day with no `check` field is exactly as valid as one with
 *  1-3 questions. `answerIndex` is refined against THIS question's own
 *  `options` length so a malformed index fails validation at build time
 *  rather than silently rendering an unanswerable question. */
const m90CheckQuestion = z
  .object({
    q: z.string(),
    options: z.array(z.string()).min(2).max(5),
    answerIndex: z.number().int().min(0),
    explain: z.string().optional(),
  })
  .refine((c) => c.answerIndex < c.options.length, {
    message: 'answerIndex must be a valid index into options',
    path: ['answerIndex'],
  });

const mission90Days = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/mission90' }),
  schema: z.object({
    day: z.number().int().min(1).max(90),
    title: z.string(),
    description: z.string(),
    phase: z.number().int().min(1).max(5),
    minutes: z.number().int().positive(),
    goals: z.array(z.string()).length(3),
    tomorrow: z.string().optional(),
    interviewQA: z.array(z.object({
      q: z.string(), a: z.string(),
      track: z.enum(['service', 'product', 'both']).default('both'),
    })).min(3).max(5),
    check: z.array(m90CheckQuestion).min(1).max(3).optional(),
    goDeeperMinutes: z.number().int().positive().optional(),
    updatedDate: z.coerce.date().optional(),
    draft: z.boolean().default(false),
  }),
});

/** One MCQ. correctAnswers indices are refined against THIS question's options
 *  length (mirrors m90CheckQuestion's answerIndex refine) so a bad index fails
 *  the build. Number-to-select is derived from correctAnswers.length, never stored. */
const practiceTestQuestion = z
  .object({
    id: z.string(),                                  // stable within the test, e.g. 'q1'
    /** Scenario prompt as ordered paragraphs (one entry per paragraph). The
     *  LAST paragraph is the actual question sentence, used as the concise
     *  <legend>/aria label; earlier paragraphs render as the scenario block. */
    prompt: z.array(z.string()).min(1),
    options: z.array(z.string()).min(2).max(6),
    correctAnswers: z.array(z.number().int().min(0)).min(1),
    explanation: z.string(),
  })
  .refine((q) => q.correctAnswers.every((i) => i < q.options.length), {
    message: 'every correctAnswers index must be a valid index into options',
    path: ['correctAnswers'],
  })
  .refine((q) => new Set(q.correctAnswers).size === q.correctAnswers.length, {
    message: 'correctAnswers must not contain duplicate indices',
    path: ['correctAnswers'],
  });

const practiceTestQuestions = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/tests' }),
  schema: z
    .object({
      category: z.string(),      // must match a TestCategory.slug (checked in getStaticPaths)
      test: z.string(),          // must match a PracticeTest.slug
      questions: z.array(practiceTestQuestion).min(1),
    })
    .refine((f) => new Set(f.questions.map((q) => q.id)).size === f.questions.length, {
      message: 'question ids must be unique within a test',
      path: ['questions'],
    }),
});

export const collections = { blog, guides, mission90Days, practiceTestQuestions };
