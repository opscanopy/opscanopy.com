/**
 * J4 — Snapshots: save → select restores → delete.
 *
 * Identical for every tool because all ten wire the same helper,
 * `wireSnapshotUI` from `src/lib/tool-state/wire.ts`. The controls are found by
 * id SUFFIX (`-snap-save` / `-snap-select` / `-snap-delete`) since every
 * playground uses a different id prefix but all follow that suffix convention.
 *
 * Observable contract of the helper, all asserted below:
 *   - the `<select>` starts disabled with a single "No snapshots yet" option;
 *   - saving enables it, adds one timestamped option, and flips the button to
 *     "Saved" for 1500ms;
 *   - choosing an option calls `setValue`, which restores the input AND
 *     re-evaluates (so the results panel must come back too);
 *   - the delete button is hidden until a snapshot is selected;
 *   - deleting the last snapshot returns the control to its empty state.
 */
import { expect, test } from '@playwright/test';
import { SEL, openTool, resultsOf, setInput } from './_shared';
import { TOOL_FIXTURES } from './tools.fixtures';

test.describe('J4 snapshots', () => {
  for (const fixture of TOOL_FIXTURES) {
    test(`${fixture.slug}: save → restore → delete`, async ({ page }) => {
      await openTool(page, fixture);

      const saveBtn = page.locator(SEL.snapSave);
      const select = page.locator(SEL.snapSelect);
      const deleteBtn = page.locator(SEL.snapDelete);
      const results = resultsOf(page, fixture);

      await expect(saveBtn, 'every tool wires wireSnapshotUI').toBeVisible();
      await expect(select).toBeDisabled();
      await expect(deleteBtn).toBeHidden();

      // Snapshot the boot-seeded state, whose result string is pinned.
      await expect(results).toContainText(fixture.seededResultString);

      await saveBtn.click();
      await expect(select).toBeEnabled();
      // Placeholder + exactly one saved entry.
      await expect(select.locator('option')).toHaveCount(2);

      // Move away from the saved state so "restore" has something to undo.
      await setInput(page, fixture, fixture.invalidInput);
      await expect(results).not.toContainText(fixture.seededResultString);

      await select.selectOption('0');
      await expect(deleteBtn).toBeVisible();
      await expect(
        results,
        'selecting a snapshot must restore the input AND re-evaluate',
      ).toContainText(fixture.seededResultString);

      await deleteBtn.click();
      await expect(select).toBeDisabled();
      await expect(select.locator('option')).toHaveCount(1);
      await expect(deleteBtn).toBeHidden();
    });
  }
});
