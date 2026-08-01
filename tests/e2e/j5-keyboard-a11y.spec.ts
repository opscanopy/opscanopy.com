/**
 * J5 — Keyboard-only operation + axe.
 *
 * Covers the a11y half of the UX contract:
 *   - the results container is NOT `aria-live` (it re-renders wholesale; making
 *     it live would read the entire panel out on every keystroke);
 *   - the one-line summary is the sole live region, with an sr-only copy-status
 *     span alongside it;
 *   - Escape releases CodeMirror focus, so Tab is not trapped in the editor
 *     (`{key:'Escape', run: view => { view.contentDOM.blur(); return true; }}`
 *     in every CM playground's keymap) — `cm` and `cm-wasm` families only;
 *   - Enter runs the evaluation immediately;
 *   - a copy control is reachable and operable by keyboard, and updates the
 *     sr-only status.
 *
 * DEVIATION, deliberate: the plan's J5 shorthand says "exactly one role=status".
 * Taken literally that fails against the reference implementations —
 * CidrChecker and SubnetCalculator both carry TWO: the visible summary
 * (`#…-summary`) and the sr-only copy-status span (`#…-copy-status`), which is
 * exactly what CLAUDE.md's contract prescribes ("a one-line role=status summary
 * is the sole live region, plus an sr-only copy-status span"). So this asserts
 * the shape the contract actually defines: exactly one VISIBLE summary
 * `role="status"` and exactly one sr-only `role="status"`. A third would fail.
 */
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  SEL,
  focusIsInCodeMirror,
  inputOf,
  openTool,
  resultsOf,
} from './_shared';
import { TOOL_FIXTURES } from './tools.fixtures';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test.describe('J5 keyboard + a11y', () => {
  for (const fixture of TOOL_FIXTURES) {
    test(`${fixture.slug}: live regions are exactly the contract's two`, async ({ page }) => {
      await openTool(page, fixture);

      const results = resultsOf(page, fixture);
      expect(
        await results.getAttribute('aria-live'),
        'the results container must NOT be a live region',
      ).toBeNull();
      expect(await results.getAttribute('role')).not.toBe('status');

      await expect(page.locator(SEL.summaryStatus)).toHaveCount(1);
      await expect(page.locator(SEL.copyStatus)).toHaveCount(1);
    });

    test(`${fixture.slug}: axe finds no violations in #playground`, async ({ page }) => {
      await openTool(page, fixture);
      let builder = new AxeBuilder({ page }).include(SEL.playground).withTags(AXE_TAGS);
      if (fixture.family !== 'textarea') {
        // CodeMirror sets tabindex="-1" on its own .cm-scroller and puts the keyboard path on
        // the contenteditable .cm-content inside it — arrow keys DO scroll the region. axe's
        // heuristic only inspects the scrolling element, so it reports a keyboard trap that
        // does not exist. Overriding CM's tabindex to satisfy the rule would break its focus
        // management, so the rule is dropped for CM-backed editors only. It stays enforced for
        // the textarea family, and every other rule stays enforced here.
        // Note: the violation only appears when the seeded document overflows the editor,
        // which is why the 13 CM playgrounds that predate this suite never tripped it.
        builder = builder.disableRules(['scrollable-region-focusable']);
      }
      const scan = await builder.analyze();
      expect(
        scan.violations.map((v) => `${v.id}: ${v.nodes.length} node(s) — ${v.help}`),
        'axe violations inside #playground',
      ).toEqual([]);
    });

    test(`${fixture.slug}: keyboard runs the tool and operates copy`, async ({ page }) => {
      await openTool(page, fixture);

      const input = inputOf(page, fixture);
      await input.focus();
      await expect(input).toBeFocused();

      // Enter commits immediately (no waiting out the debounce).
      await page.keyboard.press('Enter');
      const results = resultsOf(page, fixture);
      await expect(results).not.toBeEmpty();

      // Wait for the results to STOP changing before resolving a copy control.
      // `not.toBeEmpty()` is satisfied instantly by the render that was already on
      // screen, but Enter also starts a debounce — and in a tool whose eval is
      // async (hash-generator re-runs Web Crypto, rewriting #hash-results at
      // ~+207ms) the container is replaced wholesale a moment later. Focusing
      // before that lands puts focus on a button that is then destroyed, so
      // `toBeFocused()` re-resolves against its replacement and fails on a tool
      // that is behaving perfectly. Same stale-read class as the J7 and J3 bugs.
      let previous = '';
      await expect
        .poll(
          async () => {
            const now = await results.innerHTML();
            const settled = now === previous && now.length > 0;
            previous = now;
            return settled;
          },
          { message: 'results never stopped re-rendering after Enter', timeout: 7000 },
        )
        .toBe(true);

      // A copy control takes focus and Enter activates it, updating sr-only status.
      const copyRow = page.locator(SEL.copyRow).first();
      await expect(copyRow).toBeVisible();
      await copyRow.focus();
      await expect(copyRow).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator(SEL.copyStatus).first()).toContainText(/copied/i);
    });

    if (fixture.family === 'cm' || fixture.family === 'cm-wasm') {
      test(`${fixture.slug}: Escape releases the CodeMirror focus trap`, async ({ page }) => {
        await openTool(page, fixture);

        const input = inputOf(page, fixture);
        await input.click();
        expect(await focusIsInCodeMirror(page), 'clicking the editor should focus it').toBe(true);

        // Inside CM, Tab indents (indentWithTab) instead of moving focus — Escape
        // is the documented escape hatch.
        await page.keyboard.press('Escape');
        expect(
          await focusIsInCodeMirror(page),
          'Escape must blur the editor so Tab can leave it',
        ).toBe(false);

        // And Tab now moves focus onward, to something outside the editor.
        await page.keyboard.press('Tab');
        expect(await focusIsInCodeMirror(page)).toBe(false);
      });
    }
  }
});
