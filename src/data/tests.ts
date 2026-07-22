/**
 * Practice Tests — typed registry. Single source of truth for the /tests hub,
 * category pages, and test-taking pages: category/test metadata, URLs,
 * accent/icon, live/draft status, and the practice pass mark.
 *
 * Mirrors the role of src/data/mission90.ts and src/data/tools.ts. Question
 * BODIES live in the `practiceTestQuestions` content collection (one JSON file
 * per test); this module only owns structure.
 *
 * Build-time validation runs once at module import (see the bottom of the file)
 * and throws actionable errors, failing the build on any registry mistake.
 */
import type { ToolAccent } from './tools';

export interface TestCategory {
  /** URL segment, e.g. 'aws-devops-professional'. */
  slug: string;
  /** Full certification name. */
  name: string;
  /** Card/breadcrumb label, e.g. 'AWS DevOps Engineer'. */
  shortName: string;
  description: string;
  /** Brand gradient accent — reuse accentEdgeClass/accentGradients from src/data/tools.ts. */
  accent: ToolAccent;
  /** Inline SVG inner markup, viewBox "0 0 48 48", stroke-based (like track-icons). */
  icon: string;
  status: 'live' | 'draft';
}

export interface PracticeTest {
  /** URL segment within its category. */
  slug: string;
  /** FK → TestCategory.slug. */
  categorySlug: string;
  name: string;
  description: string;
  /** 0–100 practice pass mark (OpsCanopy's mark, not the vendor's). */
  passThreshold: number;
  /** Optional soft time budget in minutes (display only, never enforced). */
  minutes?: number;
  status: 'live' | 'draft';
}

export const categories: TestCategory[] = [
  {
    slug: 'aws-devops-professional',
    name: 'AWS Certified DevOps Engineer – Professional (DOP-C02)',
    shortName: 'AWS DevOps Engineer',
    description:
      'Scenario-based practice for the DOP-C02 exam — CI/CD, multi-Region resilience, and monitoring on AWS.',
    accent: 'preview',
    // AWS-cloud mark (stroke-based, viewBox "0 0 48 48"), matching track-icons convention.
    icon: '<path d="M15 33h18a6.5 6.5 0 0 0 .8-13A9 9 0 0 0 16.4 17 6.5 6.5 0 0 0 15 33z"/>',
    status: 'live',
  },
];

export const tests: PracticeTest[] = [
  {
    slug: 'dop-c02-sample-exam',
    categorySlug: 'aws-devops-professional',
    name: 'Practice Set 1',
    description:
      "Five scenario questions derived from AWS's official DOP-C02 sample exam (© Amazon Web Services). The 75% pass mark is OpsCanopy's practice mark, not AWS's official passing score.",
    passThreshold: 75,
    minutes: 20,
    status: 'live',
  },
];

/** Categories that have shipped — drives the hub grid. */
export const liveCategories = categories.filter((c) => c.status === 'live');
/** Tests that have shipped — drives counts, links, and hub badge lookups. */
export const liveTests = tests.filter((t) => t.status === 'live');

export function getCategory(slug: string): TestCategory | undefined {
  return categories.find((c) => c.slug === slug);
}

export function getTest(categorySlug: string, slug: string): PracticeTest | undefined {
  return tests.find((t) => t.categorySlug === categorySlug && t.slug === slug);
}

/**
 * ALL tests in a category (any status), in registry order — for the
 * category-page listing that renders draft tests as "Coming soon".
 */
export function testsInCategory(categorySlug: string): PracticeTest[] {
  return tests.filter((t) => t.categorySlug === categorySlug);
}

/** LIVE tests only in a category — for counts, links, and hub badge lookups. */
export function liveTestsInCategory(categorySlug: string): PracticeTest[] {
  return liveTests.filter((t) => t.categorySlug === categorySlug);
}

/**
 * Canonical progress key for a test: `${categorySlug}/${slug}`. Shared by the
 * page, runner, and progress module. Keep slugs stable once shipped — changing
 * one orphans a user's local best score (acceptable, no migration).
 */
export function testKey(categorySlug: string, slug: string): string {
  return `${categorySlug}/${slug}`;
}

/**
 * Build-time registry validation — runs once at module import. Throws with an
 * actionable message (failing the build) on any structural mistake.
 */
function validateRegistry(): void {
  // Category slugs are unique.
  const seenCategories = new Set<string>();
  for (const c of categories) {
    if (seenCategories.has(c.slug)) {
      throw new Error(`[tests] Duplicate category slug "${c.slug}" in src/data/tests.ts.`);
    }
    seenCategories.add(c.slug);
  }

  const seenKeys = new Set<string>();
  for (const t of tests) {
    const key = testKey(t.categorySlug, t.slug);

    // (categorySlug, slug) test keys are unique.
    if (seenKeys.has(key)) {
      throw new Error(`[tests] Duplicate test key "${key}" in src/data/tests.ts.`);
    }
    seenKeys.add(key);

    // Every test's categorySlug resolves to a category (FK integrity).
    const category = getCategory(t.categorySlug);
    if (!category) {
      throw new Error(
        `[tests] Test "${key}" references categorySlug "${t.categorySlug}", which has no TestCategory in src/data/tests.ts.`,
      );
    }

    // Every passThreshold is a finite number in 0..100.
    if (!Number.isFinite(t.passThreshold) || t.passThreshold < 0 || t.passThreshold > 100) {
      throw new Error(
        `[tests] Test "${key}" has passThreshold ${t.passThreshold}; it must be a finite number in 0..100.`,
      );
    }

    // No status:'live' test sits under a draft/missing category.
    if (t.status === 'live' && category.status !== 'live') {
      throw new Error(
        `[tests] Test "${key}" is 'live' but its category "${t.categorySlug}" is '${category.status}'.`,
      );
    }
  }
}

validateRegistry();
