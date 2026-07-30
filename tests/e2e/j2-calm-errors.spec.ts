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
          // The burst stalled past the hold — see this file's header. Discard.
          expect(
            attempt,
            `typing kept stalling past the calm hold, so the hold could never be ` +
              `measured. Last state: ${JSON.stringify(atEnd)}`,
          ).toBeLessThan(MAX_ATTEMPTS);
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
