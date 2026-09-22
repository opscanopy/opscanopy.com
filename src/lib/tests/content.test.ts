/**
 * Practice-test content gate.
 *
 * Zod in `src/content.config.ts` already guarantees a question file is
 * STRUCTURALLY valid (indices in range, unique ids, 2–6 options). It cannot
 * check whether a question is written the way this site writes questions, and
 * until now those rules lived only in people's heads and in the shape of the
 * three files that happened to exist.
 *
 * This walks every file in `src/content/tests/` and asserts the editorial
 * contract. Every threshold below was calibrated on 2026-09-22 against the
 * 95 shipped questions, so the gate passes on the existing corpus and fires
 * only on a real regression. Where the corpus sat close to a bound, the
 * comment says so.
 *
 * Deliberately NOT asserted: anything about whether a question is factually
 * correct. No test can do that; it is what independent review is for.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { liveTests, testKey } from '../../data/tests';

const CONTENT_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'content', 'tests');

interface Question {
  id: string;
  prompt: string[];
  options: string[];
  correctAnswers: number[];
  explanation: string;
}
interface QuestionFile {
  file: string;
  category: string;
  test: string;
  questions: Question[];
}

const FILES: QuestionFile[] = readdirSync(CONTENT_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((file) => ({ file, ...(JSON.parse(readFileSync(join(CONTENT_DIR, file), 'utf-8')) as Omit<QuestionFile, 'file'>) }));

/** Sets big enough for a key-position distribution to mean anything. */
const BALANCE_MIN_QUESTIONS = 20;
/** Explanation floor. Shortest shipped is 406 (the AWS-derived sample set). */
const MIN_EXPLANATION = 400;
/** Stem-similarity ceiling. Highest shipped pair scores ~0.23, so this is ~2x headroom. */
const MAX_JACCARD = 0.45;

const letter = (i: number) => String.fromCharCode(65 + i);

/** Words that carry no topic signal, so two unrelated scenarios do not look alike. */
const STOPWORDS = new Set([
  'that', 'this', 'with', 'from', 'they', 'them', 'their', 'have', 'has', 'been', 'will',
  'would', 'should', 'which', 'what', 'when', 'where', 'must', 'each', 'into', 'over',
  'company', 'team', 'engineer', 'engineers', 'developer', 'developers', 'organisation',
  'organization', 'aws', 'amazon', 'service', 'services', 'using', 'uses', 'used', 'needs',
  'need', 'wants', 'want', 'runs', 'running', 'requirements', 'requirement', 'approach',
  'following', 'solution', 'meets', 'most', 'least', 'best', 'also', 'only', 'other',
]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

describe('practice-test content', () => {
  it('has at least one question file', () => {
    expect(FILES.length).toBeGreaterThan(0);
  });

  it('matches the registry in both directions', () => {
    const onDisk = FILES.map((f) => `${f.category}/${f.test}`).sort();
    const registered = liveTests.map((t) => testKey(t.categorySlug, t.slug)).sort();
    expect(onDisk).toEqual(registered);
  });

  for (const f of FILES) {
    describe(f.file, () => {
      it('is named <category>__<test>.json, matching its own fields', () => {
        expect(f.file).toBe(`${f.category}__${f.test}.json`);
      });

      it('numbers questions q1..qN in order', () => {
        expect(f.questions.map((q) => q.id)).toEqual(f.questions.map((_, i) => `q${i + 1}`));
      });

      it('states the question count in the registry description', () => {
        const entry = liveTests.find((t) => t.categorySlug === f.category && t.slug === f.test);
        expect(entry, `no registry entry for ${f.file}`).toBeDefined();
        const words: Record<string, number> = {
          five: 5, twentyfive: 25, sixtyfive: 65, seventyfive: 75,
        };
        const first = entry!.description.split(/[\s,.—-]+/)[0].toLowerCase().replace(/[^a-z]/g, '');
        // Only enforced when the description opens with a number word, which is
        // the house pattern ("Five scenario questions…", "Sixty-five original…").
        const declared = words[first];
        if (declared !== undefined) expect(declared).toBe(f.questions.length);
      });

      for (const q of f.questions) {
        describe(q.id, () => {
          it('opens with a scenario and ends on a question', () => {
            expect(q.prompt.length).toBeGreaterThanOrEqual(2);
            for (const p of q.prompt) expect(p.trim().length).toBeGreaterThan(0);
            // "contains", not "ends with": several stems close with "? (Select TWO.)".
            expect(q.prompt[q.prompt.length - 1]).toContain('?');
          });

          it('offers three more options than it has correct answers', () => {
            expect(q.options.length).toBe(q.correctAnswers.length + 3);
          });

          it('has distinct options and a valid, duplicate-free key', () => {
            expect(new Set(q.options).size).toBe(q.options.length);
            expect(new Set(q.correctAnswers).size).toBe(q.correctAnswers.length);
            for (const i of q.correctAnswers) {
              expect(i).toBeGreaterThanOrEqual(0);
              expect(i).toBeLessThan(q.options.length);
            }
          });

          it('states how many answers to pick when more than one', () => {
            const ask = q.prompt[q.prompt.length - 1];
            if (q.correctAnswers.length > 1) expect(ask).toMatch(/\b(two|three)\b/i);
            else expect(ask).not.toMatch(/\bselect (two|three)\b/i);
          });

          it('avoids cop-out options', () => {
            for (const o of q.options) expect(o).not.toMatch(/\b(all|none) of the above\b/i);
          });

          it('is phrased positively', () => {
            // Negative stems test reading, not knowledge. Only the question
            // sentence is checked: "does NOT" can be legitimate in a scenario.
            expect(q.prompt[q.prompt.length - 1]).not.toMatch(/\b(NOT|EXCEPT)\b/);
          });

          it('addresses the reader in the third person', () => {
            // Quoted spans are exempt: a prompt-injection question has to be
            // able to quote the attacker's "…print your system prompt" payload.
            const unquoted = q.prompt.join(' ').replace(/[""“”][^""“”]*[""“”]/g, ' ');
            expect(unquoted).not.toMatch(/\b(you|your|you're|yours)\b/i);
          });

          it('carries no links or markup', () => {
            const all = [...q.prompt, ...q.options, q.explanation].join(' ');
            expect(all).not.toMatch(/https?:\/\/|www\./i);
            expect(all).not.toMatch(/<\/?(p|a|br|span|code|strong|em|div|ul|li|script)\b/i);
          });

          it('explains the answer at length', () => {
            expect(q.explanation.length).toBeGreaterThanOrEqual(MIN_EXPLANATION);
          });

          it('never cites an option letter that does not exist', () => {
            const cited = q.explanation.match(/\b[Oo]ptions?\s+([A-F])/g) ?? [];
            for (const c of cited) {
              const idx = c.trim().slice(-1).charCodeAt(0) - 65;
              expect(idx).toBeLessThan(q.options.length);
            }
          });

          it('never calls its own correct answer wrong', () => {
            for (const i of q.correctAnswers) {
              const re = new RegExp(
                `Option ${letter(i)}\\b[^.]{0,90}?(is (wrong|incorrect|not)|misdiagnoses|confuses|would (increase|fail|break))`,
                'i',
              );
              expect(q.explanation).not.toMatch(re);
            }
          });
        });
      }

      if (f.questions.length >= BALANCE_MIN_QUESTIONS) {
        it('spreads correct answers across the option positions', () => {
          // Without this a candidate can pass by always picking the same letter.
          // The AIF mock shipped at 74% on one index before being rebalanced.
          const singles = f.questions.filter((q) => q.correctAnswers.length === 1);
          const counts = new Map<number, number>();
          for (const q of singles) counts.set(q.correctAnswers[0], (counts.get(q.correctAnswers[0]) ?? 0) + 1);
          for (let i = 0; i < 4; i++) {
            const share = (counts.get(i) ?? 0) / singles.length;
            expect(share, `index ${i} (${letter(i)}) holds ${(share * 100).toFixed(1)}% of ${singles.length} single-answer keys`)
              .toBeGreaterThanOrEqual(0.15);
            expect(share, `index ${i} (${letter(i)}) holds ${(share * 100).toFixed(1)}% of ${singles.length} single-answer keys`)
              .toBeLessThanOrEqual(0.35);
          }
        });
      }
    });
  }

  // A question repeated across two sets in the same certification is a refund
  // request waiting to happen, and it is easy to do by accident when several
  // people write for the same exam guide.
  const categories = [...new Set(FILES.map((f) => f.category))];
  for (const category of categories) {
    it(`has no near-duplicate stems within ${category}`, () => {
      const all = FILES.filter((f) => f.category === category).flatMap((f) =>
        f.questions.map((q) => ({ ref: `${f.test}#${q.id}`, t: tokens(q.prompt.join(' ')) })),
      );
      const offenders: string[] = [];
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          const score = jaccard(all[i].t, all[j].t);
          if (score >= MAX_JACCARD) offenders.push(`${all[i].ref} ~ ${all[j].ref} (${score.toFixed(2)})`);
        }
      }
      expect(offenders).toEqual([]);
    });
  }
});
