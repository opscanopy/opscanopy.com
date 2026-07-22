/**
 * Practice Tests — pure MCQ grading engine.
 *
 * No DOM, no I/O. The runner island dynamically imports this so the grading
 * logic code-splits away from the page shell (matches the mission-sim engine).
 *
 * Grading contract:
 *   - Selected indices are normalized (deduped + ascending) before comparison.
 *   - A question is graded all-or-nothing: the selected set must EXACTLY equal
 *     the correct set (single- and multi-answer share this rule).
 *   - An empty selection is `answered: false` and always `isCorrect: false`.
 */

/** Minimal per-question input the engine grades against. */
export interface QuestionInput {
  id: string;
  correctAnswers: number[];
}

/** Grade of a single question, independent of which question it is. */
export interface QuestionGrade {
  /** Normalized user selection (deduped, ascending). */
  selected: number[];
  /** Normalized correctAnswers (deduped, ascending). */
  correct: number[];
  /** Whether the user selected anything (selected.length > 0). */
  answered: boolean;
  /** Exact set match between selected and correct. */
  isCorrect: boolean;
}

/** A QuestionGrade tagged with its question id, as assembled by gradeTest. */
export interface GradedQuestion extends QuestionGrade {
  questionId: string;
}

/** Full result of grading a whole test submission. */
export interface TestResult {
  graded: GradedQuestion[];
  total: number;
  correctCount: number;
  /** Math.round(correctCount / total * 100); 0 when total === 0. */
  scorePct: number;
  passThreshold: number;
  /** scorePct >= passThreshold. */
  passed: boolean;
}

/** Dedupe + sort ascending — the canonical normal form for an index set. */
function normalize(indices: number[]): number[] {
  return Array.from(new Set(indices)).sort((a, b) => a - b);
}

/** Two already-normalized arrays are equal iff same length + element-wise equal. */
function sameSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Number of options a question expects — the deduped count of correct answers.
 * Drives the "Select N" caption and single-vs-multi UI.
 */
export function selectCount(correctAnswers: number[]): number {
  return new Set(correctAnswers).size;
}

/** True when a question expects more than one answer (checkbox / "Select N"). */
export function isMulti(correctAnswers: number[]): boolean {
  return selectCount(correctAnswers) > 1;
}

/**
 * Grade a single question independent of its id. Normalizes both `selected`
 * and `correct`, marks `answered` from the selection size, and grades correct
 * only on exact set equality.
 */
export function gradeQuestion(correct: number[], selected: number[]): QuestionGrade {
  const normSelected = normalize(selected);
  const normCorrect = normalize(correct);
  const answered = normSelected.length > 0;
  return {
    selected: normSelected,
    correct: normCorrect,
    answered,
    // An empty selection is never correct, even if correctAnswers is also
    // empty (two empty sets compare equal) — the "unanswered ⇒ incorrect"
    // contract wins over set equality.
    isCorrect: answered && sameSet(normSelected, normCorrect),
  };
}

/**
 * Grade a full submission. Iterates `questions` in their authoritative order
 * (never the submission map) so the graded list always matches the test's
 * question order. A missing submission key grades as an empty selection;
 * unknown submission keys are ignored.
 */
export function gradeTest(
  questions: QuestionInput[],
  submission: Record<string, number[]>,
  passThreshold: number,
): TestResult {
  const graded: GradedQuestion[] = questions.map((q) => {
    const selected = Object.prototype.hasOwnProperty.call(submission, q.id)
      ? submission[q.id]
      : [];
    return { questionId: q.id, ...gradeQuestion(q.correctAnswers, selected) };
  });

  const total = graded.length;
  const correctCount = graded.reduce((sum, g) => sum + (g.isCorrect ? 1 : 0), 0);
  const scorePct = total === 0 ? 0 : Math.round((correctCount / total) * 100);

  return {
    graded,
    total,
    correctCount,
    scorePct,
    passThreshold,
    passed: scorePct >= passThreshold,
  };
}
