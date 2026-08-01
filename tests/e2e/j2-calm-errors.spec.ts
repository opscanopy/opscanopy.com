/**
 * J2 — Calm errors.
 *
 * The contract (CLAUDE.md, "Calm errors"): never flash a red border
 * mid-composition. Hold the error until ~600ms idle, blur, or Enter — and then
 * show a SPECIFIC engine diagnostic, not a generic "invalid".
 *
 * The reference implementation's constants (SubnetCalculatorPlayground.astro):
 * `DEBOUNCE_MS = 130`, `ERROR_HOLD_MS = 600`, so the diagnostic surfaces ~730ms
 * after the last keystroke — measured at 713ms on this repo. This spec brackets
 * that: nothing at all in the first ~500ms, the pinned string by ~800ms idle.
 *
 * "Nothing at all" is measured with `errorSignals`, which checks all three
 * signals at once — the pinned diagnostic text, `aria-invalid="true"` on the
 * input (the red-border flag), and any `role="alert"` card. Deliberately NOT a
 * single selector: `role="alert"` is optional by design in these playgrounds
 * (see the note in `_shared.ts`), so a selector-only check would pass
 * vacuously on any tool that omits it.
 *
 * THE PRECONDITION, and why the retry loop exists: this journey only measures
 * anything if the typing burst is faster than the hold. `pressSequentially`
 * runs over CDP, so on a loaded machine (this suite runs 4 workers) an
 * inter-key gap can exceed 130ms + 600ms. When that happens an intermediate
 * value's diagnostic is already on screen before the last keystroke lands, and
 * it stays there because each keystroke only reschedules the debounce — the
 * result is a reported "contract violation" that is really just a slow burst.
 * So the run is validated before it is trusted: if the state is not calm the
 * instant typing ends, the attempt is discarded and retried.
 */
import { expect, test } from '@playwright/test';
import { errorSignals, isCalm, openTool, resultsOf, typeInput } from './_shared';
import { TOOL_FIXTURES } from './tools.fixtures';

/** Guarded window after the last keystroke during which nothing may go red. */
const CALM_WINDOW_MS = 500;
/** Slack over the contract's ~600ms hold before we insist on the diagnostic. */
const DIAGNOSTIC_TIMEOUT_MS = 4_000;
/** Per-key delay; the plan pins 40ms. */
const KEY_DELAY_MS = 40;
const MAX_ATTEMPTS = 3;

test.describe('J2 calm errors', () => {
  for (const fixture of TOOL_FIXTURES) {
    test(`${fixture.slug}: holds the error mid-typing, then names the problem`, async ({ page }) => {
      await openTool(page, fixture);

      let measured = false;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !measured; attempt += 1) {
        await typeInput(page, fixture, fixture.invalidInput, KEY_DELAY_MS);
        const lastKeystrokeAt = Date.now();

        const atEnd = await errorSignals(page, fixture);
        if (!isCalm(atEnd)) {
          if (attempt < MAX_ATTEMPTS) {
            // The burst may simply have stalled past the hold — see this file's
            // header. Discard and retry.
            continue;
          }
          // Attempts exhausted. Do NOT report this as "the machine was too slow":
          // a tool with NO hold at all reaches this branch every time, because any
          // eval firing during the burst leaves its diagnostic up permanently, so
          // isCalm() can never be true. Blaming the harness there hides a real
          // contract violation behind an "unmeasurable" message — it misread a
          // zero-hold tool as flaky infrastructure roughly half the time.
          // Measure the truth instead: retype from empty and time the first error.
          await typeInput(page, fixture, '', 0);
          await page.waitForTimeout(CALM_WINDOW_MS);
          await typeInput(page, fixture, fixture.invalidInput, KEY_DELAY_MS);
          const t0 = Date.now();
          let firstErrorAt: number | null = null;
          while (Date.now() - t0 < CALM_WINDOW_MS && firstErrorAt === null) {
            if (!isCalm(await errorSignals(page, fixture))) firstErrorAt = Date.now() - t0;
            else await page.waitForTimeout(40);
          }
          expect(
            firstErrorAt,
            firstErrorAt === null
              ? `the calm window could not be measured after ${MAX_ATTEMPTS} attempts`
              : `no calm-error hold: the error surfaced ${firstErrorAt}ms after the last ` +
                `keystroke, but the contract holds it for ~${CALM_WINDOW_MS}ms. ` +
                `This is a tool defect, not a slow machine.`,
          ).toBeNull();
          continue;
        }

        // Nothing may go red inside the calm window. Sample repeatedly rather
        // than sleeping once, so an error that flashes and clears is caught.
        while (Date.now() - lastKeystrokeAt < CALM_WINDOW_MS) {
          const signals = await errorSignals(page, fixture);
          expect(
            isCalm(signals),
            `error surfaced ${Date.now() - lastKeystrokeAt}ms after the last keystroke ` +
              `(contract holds it for ~600ms): ${JSON.stringify(signals)}`,
          ).toBe(true);
          await page.waitForTimeout(60);
        }
        measured = true;
      }
      expect(measured, 'the calm window was never measured').toBe(true);

      // After the hold: the exact, specific diagnostic the engine returns.
      await expect(resultsOf(page, fixture)).toContainText(fixture.calmErrorString, {
        timeout: DIAGNOSTIC_TIMEOUT_MS,
      });

      // The diagnostic replaced the result rather than blanking the panel, and
      // the input is flagged so the field itself shows the problem.
      await expect(resultsOf(page, fixture)).not.toBeEmpty();
      const settled = await errorSignals(page, fixture);
      expect(settled.ariaInvalid, 'the input should carry aria-invalid once the error shows').toBe(
        true,
      );
    });
  }
});
