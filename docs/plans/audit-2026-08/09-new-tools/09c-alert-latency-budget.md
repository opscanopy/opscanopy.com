# 09c — alert latency budget: "how long until the page?"

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** Enter the five knobs — `scrape_interval`, `evaluation_interval`, `for`, `group_wait`, `group_interval` — and get best/worst-case time-to-page with a visual breakdown of where the minutes go. Every postmortem asks this; nobody computes it right by hand.

**Files:**
- Create: `src/lib/alert-latency/engine.ts`, `engine.test.ts`
- Create: `src/components/AlertLatencyPlayground.astro`, `src/pages/alert-latency-budget.astro` + 4 locale pages
- Modify: `src/data/tools.ts` (Observability), E2E batch module

### Task 1: engine

The model (document it in the module header, each term cited to Prometheus/Alertmanager docs):

- **Detection**: condition becomes true just *after* a scrape → worst adds one full `scrape_interval` before the breach is even sampled.
- **Evaluation**: rule fires on an evaluation tick → worst adds one `evaluation_interval` (breach sampled just after a tick).
- **Pending**: `for` requires the condition continuously true across evaluations; the alert transitions Firing on the first evaluation where age ≥ `for` → contributes `for` rounded **up** to the next evaluation tick.
- **Dispatch**: new group → `group_wait`; existing group → next `group_interval` flush (worst = full `group_interval`).
- Best case = breach lands just before a scrape, tick alignment perfect, new group: `≈ 0 + 0 + for + group_wait`.

- [ ] **Step 1: Failing tests**

```ts
import { budget } from './engine';

it('the canonical example: 30s scrape, 1m eval, 5m for, 30s group_wait', () => {
  const b = budget({ scrapeInterval: 30, evaluationInterval: 60, forDuration: 300, groupWait: 30, groupInterval: 300 });
  // worst: 30 (missed scrape) + 60 (missed tick) + 300 (for, tick-aligned: 300 is a multiple of 60) + 30 (new group)
  expect(b.worst.newGroup).toBe(420);
  expect(b.best.newGroup).toBe(330);
  // existing group swaps group_wait for a full group_interval in the worst case
  expect(b.worst.existingGroup).toBe(30 + 60 + 300 + 300);
});
it('for not tick-aligned rounds up: for=90s on a 60s eval → 120s pending', () => {
  const b = budget({ scrapeInterval: 15, evaluationInterval: 60, forDuration: 90, groupWait: 30, groupInterval: 300 });
  expect(b.worst.newGroup).toBe(15 + 60 + 120 + 30);
});
it('for: 0 still waits one evaluation', () => {
  const b = budget({ scrapeInterval: 15, evaluationInterval: 15, forDuration: 0, groupWait: 30, groupInterval: 300 });
  expect(b.worst.newGroup).toBe(15 + 15 + 0 + 30);
});
it('breakdown rows sum to the total and name each phase', () => {
  const b = budget({ scrapeInterval: 30, evaluationInterval: 60, forDuration: 300, groupWait: 30, groupInterval: 300 });
  expect(b.breakdown.map((r) => r.phase)).toEqual(['detection', 'evaluation', 'pending', 'dispatch']);
  expect(b.breakdown.reduce((s, r) => s + r.worst, 0)).toBe(b.worst.newGroup);
});
it('duration strings parse like Prometheus: "5m", "90s", "1h30m"', () => {
  expect(budget({ scrapeInterval: '30s', evaluationInterval: '1m', forDuration: '5m', groupWait: '30s', groupInterval: '5m' }).worst.newGroup).toBe(420);
  expect(budget({ scrapeInterval: 'nope', evaluationInterval: '1m', forDuration: '5m', groupWait: '30s', groupInterval: '5m' }).valid).toBe(false);
});
it('sanity warnings: for shorter than one evaluation; scrape > eval', () => {
  const b = budget({ scrapeInterval: '2m', evaluationInterval: '1m', forDuration: '30s', groupWait: '30s', groupInterval: '5m' });
  expect(b.warnings.some((w) => /scrape.*longer than.*evaluation/i.test(w))).toBe(true);
  expect(b.warnings.some((w) => /for.*shorter than one evaluation/i.test(w))).toBe(true);
});
```

- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement: Prometheus duration grammar (`(\d+(ms|s|m|h|d|w|y))+`), the four-phase model, `{valid, best, worst, breakdown, warnings}`. Integer seconds throughout — no floats. **Before committing, hand-verify the canonical example against the Prometheus docs' alerting lifecycle description and one real-world write-up; adjust the model (not the test) if a phase is misattributed — the module header must cite what was checked.**
- [ ] **Step 4:** Commit `feat(alert-latency): four-phase time-to-page model with tick-alignment rounding`.

### Task 2: playground + page

- [ ] **Step 1:** Five duration inputs pre-filled with the Prometheus/Alertmanager defaults (`1m`/`1m`/`5m`/`30s`/`5m`) — defaults ARE the seed example; chips swap in "Kubernetes mixin defaults" and "aggressive paging" presets. Output: worst-case headline ("You get paged up to **7m 00s** after it breaks — new group"), best-case line, and a horizontal stacked bar of the four phases (pure CSS on the dark instrument-slab surface `--color-inverse`, amber phase labels; **consult the dataviz skill before building the bar** — it's a chart). Per-row copy; `data-copy-all` = Markdown table for the postmortem doc; share link (tiny state, well under cap — hash the five values).
- [ ] **Step 2:** Warnings render as amber annotations ("your `for: 30s` is shorter than one evaluation interval — it rounds up to 1m").
- [ ] **Step 3:** Page: why-section = the postmortem story ("'why did this take 12 minutes to page' has a computable answer"); reference table of each phase with the doc citation; FAQ ("does `group_interval` delay the *first* page?" — no, only repeats and joiners — this is the most-confused knob, lead with it). Five locales, one commit. Register (Observability), fixture, promote.
- [ ] **Step 4:** Cross-links: alertmanager-route-tester (its group_wait/group_interval are these knobs) and loki-alert-rule-tester's `for:` docs both link here; ToolCrossLinks handles category siblings automatically.
- [ ] **Step 5:** Commit `feat(alert-latency-budget): playground + pages, registry, fixtures — all locales`.
