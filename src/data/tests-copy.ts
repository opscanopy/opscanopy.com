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
  /** Optional link to the Learn study guide for this certification, rendered under the domains. */
  studyGuide?: { label: string; href: string };
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
  'aws-ai-practitioner': {
    examCode: 'AIF-C01',
    metaDescription:
      'Free 65-question AWS Certified AI Practitioner (AIF-C01) mock exam. Every answer explained: Bedrock, SageMaker AI, agentic AI, responsible AI, and AI security.',
    intro: [
      'AIF-C01 is a foundational exam: 65 questions in 90 minutes, 50 of them scored, and a scaled pass mark of 700 out of 1,000. It is written for people who use AI on AWS rather than build it — analysts, product managers, and developers adding AI literacy — and it asks for no code, no maths, and no hands-on configuration. This mock follows exam guide v1.1 (April 2026), which added agentic AI, Amazon Bedrock AgentCore, Kiro, Strands Agents, and Amazon Nova to the syllabus.',
      'Almost every question is a service-selection or approach-selection scenario. A company describes a goal and a constraint — "least operational overhead", "no ML expertise", "must not leave the VPC", "needs current internal documents" — followed by four options that all sound plausible. The skill being tested is knowing which AWS AI service, or which customisation approach (prompt engineering, RAG, fine-tuning, distillation), the qualifier points to, and why the other three miss it.',
      'The questions here are original, written to match the style and difficulty of the real exam. They are not reproduced exam content: publishing that breaches the AWS Certification Agreement, and memorising leaked items does not survive contact with a scenario you have not seen. The real exam also uses ordering and matching items, which this runner does not reproduce; the concepts those items test are covered here as multiple-choice and multiple-response questions.',
    ],
    domains: [
      { name: 'Fundamentals of AI and ML', weight: '20%' },
      { name: 'Fundamentals of generative AI', weight: '24%' },
      { name: 'Applications of foundation models', weight: '28%' },
      { name: 'Guidelines for responsible AI', weight: '14%' },
      { name: 'Security, compliance, and governance for AI solutions', weight: '14%' },
    ],
    studyGuide: {
      label: 'Read the 14-day AIF-C01 study guide',
      href: '/learn/guides/aws-ai-practitioner-study-guide/',
    },
  },
};
