/**
 * Long-form copy for the `/tests/<category>/` pages.
 *
 * Kept out of `tests.ts` for the same reason `category-copy.ts` is kept out of
 * `tools.ts`: that file is a validated registry, and prose would bury it.
 *
 * Why it exists: the category page's `<title>`, `<meta description>` and its only
 * body paragraph were all fed by the single 14-word `category.description` string —
 * one string doing three jobs, giving the page 59 words of prose total. That is the
 * weakest kind of page to put in front of a query owned by sites with thousands of
 * questions and years of links.
 *
 * `intro` is the body copy. `metaDescription` exists so the meta tag can stop being
 * a duplicate of the visible lead.
 */
export interface TestCategoryCopy {
  /** Exam code, e.g. "DOP-C02". Kept out of prose so it can also badge the page. */
  examCode: string;
  /** Written for the meta tag specifically — not reused as the visible lead. */
  metaDescription: string;
  /** Body paragraphs rendered under the test list. */
  intro: string[];
  /** The exam's own objective domains, with the weighting AWS publishes. */
  domains: { name: string; weight: string }[];
}

export const testCategoryCopy: Record<string, TestCategoryCopy> = {
  'aws-devops-professional': {
    examCode: 'DOP-C02',
    metaDescription:
    'Free scenario-based practice questions for the AWS Certified DevOps Engineer – Professional (DOP-C02) exam, with a full explanation of every answer.',
    intro: [
      'DOP-C02 is not a recall exam. Almost nothing on it can be answered by knowing what a service does — the questions describe a running system with a constraint, list four or five approaches that would all technically work, and ask which one meets the requirement. The difficulty is in the qualifier: "without downtime", "at the lowest cost", "within the existing account structure", "and no notification for other pipelines".',
      'That is why practice matters more here than on associate-level exams, and why a question bank of stems without explanations is close to useless. Getting an item wrong tells you nothing; knowing why the option you picked fails the qualifier is the whole lesson. Every question in these sets carries a full teardown — not just why the right answer is right, but what each distractor would actually do if you deployed it.',
      'The questions here are original, written to match the style and difficulty of the real exam. They are not reproduced exam content: publishing that breaches the AWS Certification Agreement, and memorising leaked items does not survive contact with a scenario you have not seen. If you can explain why a distractor fails, you can answer the variant of the question you get on the day.',
    ],
    domains: [
      { name: 'SDLC automation', weight: '22%' },
      { name: 'Configuration management and IaC', weight: '17%' },
      { name: 'Resilient cloud solutions', weight: '15%' },
      { name: 'Monitoring and logging', weight: '15%' },
      { name: 'Incident and event response', weight: '14%' },
      { name: 'Security and compliance', weight: '17%' },
    ],
  },
};
