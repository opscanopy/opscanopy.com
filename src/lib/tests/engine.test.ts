/**
 * Practice Tests — grading engine tests. Pure functions only: no DOM, no I/O.
 *
 * Grading is all-or-nothing (exact set equality) for both single- and
 * multi-answer questions; selected indices are normalized (deduped + ascending)
 * before comparison; an empty selection is unanswered and never correct.
 */
import { describe, it, expect } from 'vitest';
import {
  selectCount,
  isMulti,
  gradeQuestion,
  gradeTest,
  type QuestionInput,
} from './engine';
import seed from '../../content/tests/aws-devops-professional__dop-c02-sample-exam.json';

describe('gradeQuestion() — single answer', () => {
  it('is correct on the exact correct index (no questionId in the shape)', () => {
    const g = gradeQuestion([1], [1]);
    expect(g).toEqual({ selected: [1], correct: [1], answered: true, isCorrect: true });
    expect(g).not.toHaveProperty('questionId');
  });

  it('is wrong on a different index', () => {
    expect(gradeQuestion([1], [0]).isCorrect).toBe(false);
  });

  it('is unanswered + wrong on an empty selection', () => {
    const g = gradeQuestion([1], []);
    expect(g.answered).toBe(false);
    expect(g.isCorrect).toBe(false);
  });
});

describe('gradeQuestion() — multi answer (all-or-nothing)', () => {
  const correct = [1, 2, 5];

  it('is correct on the exact set regardless of order', () => {
    expect(gradeQuestion(correct, [5, 1, 2]).isCorrect).toBe(true);
  });

  it('is wrong when one is missing', () => {
    expect(gradeQuestion(correct, [1, 2]).isCorrect).toBe(false);
  });

  it('is wrong on a superset (extra pick)', () => {
    expect(gradeQuestion(correct, [1, 2, 5, 3]).isCorrect).toBe(false);
  });

  it('is unanswered + wrong on an empty selection', () => {
    const g = gradeQuestion(correct, []);
    expect(g.answered).toBe(false);
    expect(g.isCorrect).toBe(false);
  });
});

describe('gradeQuestion() — normalization', () => {
  it('grades duplicate/unsorted selections identically to deduped-sorted', () => {
    const messy = gradeQuestion([1, 2, 5], [5, 5, 1, 2, 2]);
    expect(messy.isCorrect).toBe(true);
    expect(messy.selected).toEqual([1, 2, 5]);
  });

  it('normalizes selected and correct in the returned grade', () => {
    const g = gradeQuestion([5, 1, 2, 1], [2, 2, 1]);
    expect(g.correct).toEqual([1, 2, 5]);
    expect(g.selected).toEqual([1, 2]);
  });
});

describe('gradeTest()', () => {
  const questions: QuestionInput[] = [
    { id: 'a', correctAnswers: [0] },
    { id: 'b', correctAnswers: [1, 2] },
    { id: 'c', correctAnswers: [3] },
  ];

  it('attaches questionId and preserves question order', () => {
    const result = gradeTest(questions, {}, 75);
    expect(result.graded.map((g) => g.questionId)).toEqual(['a', 'b', 'c']);
    result.graded.forEach((g, i) => expect(g.questionId).toBe(questions[i].id));
  });

  it('scores a mixed submission with correct rounding (3/5 → 60)', () => {
    const five: QuestionInput[] = [
      { id: 'q1', correctAnswers: [0] },
      { id: 'q2', correctAnswers: [1] },
      { id: 'q3', correctAnswers: [2] },
      { id: 'q4', correctAnswers: [3] },
      { id: 'q5', correctAnswers: [0] },
    ];
    const result = gradeTest(
      five,
      { q1: [0], q2: [1], q3: [2], q4: [0], q5: [1] }, // q4, q5 wrong
      75,
    );
    expect(result.correctCount).toBe(3);
    expect(result.total).toBe(5);
    expect(result.scorePct).toBe(60);
    expect(result.passed).toBe(false);
  });

  it('ignores unknown submission keys and treats missing keys as unanswered', () => {
    const result = gradeTest(questions, { a: [0], zzz: [9] }, 75);
    expect(result.correctCount).toBe(1);
    expect(result.graded.find((g) => g.questionId === 'b')!.answered).toBe(false);
    // Unknown keys never appear in the graded list.
    expect(result.graded.map((g) => g.questionId)).toEqual(['a', 'b', 'c']);
  });

  it('passes at the exact threshold and fails one below', () => {
    const two: QuestionInput[] = [
      { id: 'a', correctAnswers: [0] },
      { id: 'b', correctAnswers: [0] },
    ];
    // 1/2 = 50%
    expect(gradeTest(two, { a: [0] }, 50).passed).toBe(true);
    expect(gradeTest(two, { a: [0] }, 51).passed).toBe(false);
  });

  it('scores 0 with no divide-by-zero on an empty test', () => {
    const result = gradeTest([], {}, 75);
    expect(result.scorePct).toBe(0);
    expect(result.total).toBe(0);
    expect(result.passed).toBe(false);
  });
});

describe('selectCount() / isMulti()', () => {
  it('derive from correctAnswers, deduping repeats', () => {
    expect(selectCount([0])).toBe(1);
    expect(selectCount([1, 2, 5])).toBe(3);
    expect(selectCount([2, 2, 2])).toBe(1);
    expect(isMulti([0])).toBe(false);
    expect(isMulti([1, 2])).toBe(true);
    expect(isMulti([2, 2])).toBe(false);
  });
});

describe('real seed fixture', () => {
  const questions: QuestionInput[] = seed.questions.map((q) => ({
    id: q.id,
    correctAnswers: q.correctAnswers,
  }));

  it('scores 100 and passes when every answer is correct', () => {
    const submission = Object.fromEntries(seed.questions.map((q) => [q.id, q.correctAnswers]));
    const result = gradeTest(questions, submission, 75);
    expect(result.total).toBe(5);
    expect(result.correctCount).toBe(5);
    expect(result.scorePct).toBe(100);
    expect(result.passed).toBe(true);
  });

  it('scores a specific mixed submission (3/5 → 60, fails 75)', () => {
    // Correct on the three single-answer questions (q1, q3, q5), wrong on the
    // two multi-answer ones (q2, q4) by dropping an index.
    const submission: Record<string, number[]> = {
      q1: [1],
      q2: [1, 2], // missing index 5 → wrong
      q3: [2],
      q4: [1, 3], // missing index 4 → wrong
      q5: [2],
    };
    const result = gradeTest(questions, submission, 75);
    expect(result.correctCount).toBe(3);
    expect(result.scorePct).toBe(60);
    expect(result.passed).toBe(false);
  });
});
