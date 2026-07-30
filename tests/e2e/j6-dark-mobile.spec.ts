/**
 * J6 — Dark theme + mobile, in one pass.
 *
 * `colorScheme: 'dark'` exercises Layout.astro's no-flash pre-paint script,
 * which sets `html[data-theme]` from `localStorage.theme` or
 * `prefers-color-scheme` before first paint. 390×844 is iPhone-class, the
 * narrowest layout the design system targets. `hasTouch: true` is what makes
 * Chromium report `(pointer: coarse)`, which is the media query the contract's
 * 44px tap-target rules are written against — without it the coarse styles never
 * apply and the height assertions would test nothing.
 *
 * Screenshots are attached to the HTML report for eyeballing, not compared:
 * this repo has no committed baselines, and pixel baselines across machines are
 * a maintenance tax we deliberately do not take on here.
 *
 * DEVIATION, deliberate: the plan's J6 line says "every chip/copy button
 * boundingBox ≥44px". Applied to every copy control that is stricter than the
 * reference implementation the builders port from, so it would fail every new
 * tool on day one. SubnetCalculatorPlayground.astro's `(pointer: coarse)` block
 * sets THREE tiers on purpose:
 *
 *     .snc-chip              → min-height: 44px
 *     .snc-copy-btn          → 44 × 44   (icon-only, per-row)
 *     .snc-copy-btn--labeled → min-height: 36px  (the "Copy all" / "Copy link"
 *                              header buttons, which are wide text targets and
 *                              are not the primary in-result action)
 *
 * So this spec asserts 44px on chips and per-row copy buttons — the controls the
 * contract's 44px bullet actually names — and 36px on the labeled header
 * controls. Both are hard assertions; neither is skipped.
 */
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { SEL, assertTapTargets, openTool, resultsOf } from './_shared';
import { TOOL_FIXTURES } from './tools.fixtures';

/** Chips + icon-only per-row copy buttons. */
const ICON_FLOOR_PX = 44;
/** Labeled "Copy all" / "Copy link" header buttons. */
const LABELED_FLOOR_PX = 36;

test.use({
  colorScheme: 'dark',
  viewport: { width: 390, height: 844 },
  hasTouch: true,
});

test.describe('J6 dark + mobile', () => {
  for (const fixture of TOOL_FIXTURES) {
    test(`${fixture.slug}: dark theme, 390px, 44px tap targets`, async ({ page }, testInfo) => {
      await openTool(page, fixture);

      // Dark theme resolved before paint, from prefers-color-scheme.
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

      // Precondition for the 44px rules. Soft, so a harness/emulation change
      // reports itself instead of masquerading as a styling regression.
      const coarse = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
      expect
        .soft(coarse, 'hasTouch must map to (pointer: coarse) or the 44px styles never apply')
        .toBe(true);

      // The tool still works at 390px.
      await expect(resultsOf(page, fixture)).toContainText(fixture.seededResultString);

      // No horizontal overflow — the page body must never scroll sideways.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, 'page scrolls horizontally at 390px').toBeLessThanOrEqual(1);

      // Chips and icon-only per-row copy buttons: the full 44px floor.
      const chipsMeasured = await assertTapTargets(page, SEL.chips, ICON_FLOOR_PX);
      expect(chipsMeasured, 'no example chips were measured').toBeGreaterThan(0);
      const copyMeasured = await assertTapTargets(page, SEL.copyRow, ICON_FLOOR_PX);
      expect(copyMeasured, 'no per-row copy buttons were measured').toBeGreaterThan(0);

      // The labeled header controls (Copy all / Copy link) sit at a lower floor
      // BY DESIGN — see the deviation note in this file's header.
      await assertTapTargets(page, `${SEL.copyAll}, ${SEL.copyLink}`, LABELED_FLOOR_PX);

      // Contrast is the one axe rule that genuinely differs per colour scheme.
      const scan = await new AxeBuilder({ page })
        .include(SEL.playground)
        .withRules(['color-contrast'])
        .analyze();
      expect(
        scan.violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`),
        'dark-theme contrast violations inside #playground',
      ).toEqual([]);

      await testInfo.attach(`${fixture.slug}-dark-390`, {
        body: await page.locator(SEL.playground).screenshot(),
        contentType: 'image/png',
      });
    });
  }
});
