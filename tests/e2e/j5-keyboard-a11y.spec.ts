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
      const scan = await new AxeBuilder({ page }).include(SEL.playground).withTags(AXE_TAGS).analyze();
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
      await expect(resultsOf(page, fixture)).not.toBeEmpty();

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
