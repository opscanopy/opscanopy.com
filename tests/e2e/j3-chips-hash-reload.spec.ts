/**
 * J3 — Example chips → deep-link hash → reload.
 *
 * Three rules from CLAUDE.md ("Deep-link hashes") that are easy to regress:
 *
 *   1. NEVER WRITE ON BOOT. The boot seed (shared hash → restored last input →
 *      first example) evaluates with `userInitiated = false` and must leave the
 *      URL untouched. A boot-seed write would make every first visit produce a
 *      shareable URL for input the visitor never typed, and would poison the
 *      back button.
 *   2. Write only on a valid, user-initiated eval — tapping a chip counts.
 *   3. Reload restores from the fragment.
 *
 * Tools with `hashKey: null` (5/7/10 — inputs exceed the ~2000-char cap, so
 * they omit `data-copy-link` entirely) must never write a fragment at all.
 *
 * A junk fragment must degrade into the calm diagnostic, never a blank
 * playground — the fragment is attacker/typo-controlled input like any other.
 */
import { expect, test } from '@playwright/test';
import {
  SEL,
  errorSignals,
  isCalm,
  openTool,
  readHash,
  resultsOf,
  waitForEngineReady,
} from './_shared';
import { TOOL_FIXTURES } from './tools.fixtures';

/** Long enough for debounce (~130–220ms) plus the calm-error hold (~600ms). */
const SETTLE_MS = 1_000;

test.describe('J3 chips → hash → reload', () => {
  for (const fixture of TOOL_FIXTURES) {
    test(`${fixture.slug}: boot seeds without writing the hash`, async ({ page }) => {
      await openTool(page, fixture);
      await expect(resultsOf(page, fixture)).toContainText(fixture.seededResultString);
      // The boot seed already evaluated (result is on screen) — so an empty
      // fragment here is proof the write was suppressed, not proof of a race.
      expect(await readHash(page), 'boot seed must not write the deep-link hash').toBe('');
    });

    test(`${fixture.slug}: chip 2 evaluates, ${
      fixture.hashKey ? `writes ${fixture.hashKey} and survives reload` : 'writes no hash'
    }`, async ({ page }) => {
      await openTool(page, fixture);

      const chips = page.locator(SEL.chips);
      const chipCount = await chips.count();
      expect(chipCount, 'the contract requires example chips, not a <select>').toBeGreaterThan(1);

      const secondChip = chips.nth(1);
      await expect(secondChip).toBeVisible();
      await secondChip.click();

      const results = resultsOf(page, fixture);
      await expect(results).not.toBeEmpty();
      expect(isCalm(await errorSignals(page, fixture)), 'chip 2 must evaluate cleanly').toBe(true);
      const resultsBefore = (await results.innerText()).trim();
      expect(resultsBefore.length).toBeGreaterThan(0);

      if (fixture.hashKey === null) {
        await page.waitForTimeout(SETTLE_MS);
        expect(
          await readHash(page),
          'this tool ships no payload deep link — it must never write a fragment',
        ).toBe('');
        return;
      }

      await expect
        .poll(() => readHash(page), { message: 'user-initiated eval must write the hash' })
        .toContain(fixture.hashKey);

      // Reload: the fragment alone must rebuild input + results.
      await page.reload();
      await waitForEngineReady(page, fixture);
      expect(await readHash(page)).toContain(fixture.hashKey);
      // Compare rendered results rather than the editor's text: CodeMirror
      // virtualizes long documents, so its DOM is not a faithful mirror of the
      // document — the results panel is the user-visible round trip.
      //
      // Polled, not read once: the island boots and re-evaluates asynchronously
      // (dynamic engine import), so a single read right after `reload()` catches
      // the empty-state placeholder — which is non-empty text and would sail
      // past a `not.toBeEmpty()` guard.
      await expect
        .poll(async () => (await results.innerText()).trim(), {
          message: 'the deep-link fragment must rebuild the same results after reload',
        })
        .toBe(resultsBefore);
    });

    test(`${fixture.slug}: a junk hash renders a diagnostic, not a blank page`, async ({ page }) => {
      const junkKey = fixture.hashKey ?? '#s=';
      const junkHash = junkKey + encodeURIComponent(fixture.invalidInput);
      await openTool(page, fixture, { hash: junkHash });

      const results = resultsOf(page, fixture);
      await expect(results, 'a junk fragment must never blank the playground').not.toBeEmpty();

      if (fixture.hashKey === null) {
        // No fragment contract: the unknown key is ignored and the normal boot
        // seed still runs. Assert exactly that, so an ignored key cannot
        // silently become a parsed one.
        await expect(results).toContainText(fixture.seededResultString);
        expect(await readHash(page)).toBe(junkHash);
        return;
      }

      // The fragment IS this tool's payload, and it is invalid. Boot-seeded
      // input is not mid-composition, so the diagnostic shows without the hold.
      await expect(results).toContainText(fixture.calmErrorString);
    });
  }
});
