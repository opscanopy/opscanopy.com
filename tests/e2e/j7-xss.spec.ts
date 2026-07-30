/**
 * J7 — XSS probe.
 *
 * Every playground injects results with `innerHTML`, so every value that
 * reaches the DOM must pass through `escapeHtml()` (`src/lib/escape-html.ts`).
 * This journey feeds each tool a payload that is VALID in its own grammar — a
 * YAML string value, a URL query param, a crafted PEM subject, a Terraform
 * resource name — so the engine really does echo it back into the results.
 *
 * What is asserted:
 *   - no dialog is ever raised (an `alert(1)` payload that executed would);
 *   - `document.title` is unchanged (the classic marker for a payload that got
 *     to run and mutate the document);
 *   - the payload appears as TEXT in the results, and its markup does NOT
 *     appear as markup in that container's innerHTML;
 *   - no `<script>` or event-handler attribute was materialized inside the
 *     playground.
 */
import { expect, test } from '@playwright/test';
import { SEL, openTool, resultsOf, setInput } from './_shared';
import { TOOL_FIXTURES } from './tools.fixtures';

/** `<img …` → `img`; used to prove the tag never became real markup. */
function firstTagName(payload: string): string | null {
  const match = /<\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(payload);
  return match ? match[1].toLowerCase() : null;
}

test.describe('J7 XSS probe', () => {
  for (const fixture of TOOL_FIXTURES) {
    test(`${fixture.slug}: payload renders as escaped text`, async ({ page }) => {
      const dialogs: string[] = [];
      await openTool(page, fixture);
      page.on('dialog', async (dialog) => {
        dialogs.push(dialog.message());
        await dialog.dismiss();
      });

      const titleBefore = await page.title();

      await setInput(page, fixture, fixture.xssPayload);
      const results = resultsOf(page, fixture);
      await expect(results).not.toBeEmpty();

      const tag = firstTagName(fixture.xssPayload);
      expect(tag, 'xssPayload must contain markup to be a meaningful probe').not.toBeNull();

      // ── Security assertions first ──────────────────────────────────────
      // These must hold whatever the engine did with the payload, so they are
      // never skipped by a fixture whose payload turns out not to be echoed.
      const html = (await results.innerHTML()).toLowerCase();
      expect(html, 'payload markup was written to the DOM unescaped').not.toContain(`<${tag}`);
      await expect(page.locator(`${SEL.island} script`)).toHaveCount(0);
      await expect(
        page.locator(`${SEL.island} [onerror], ${SEL.island} [onload], ${SEL.island} iframe`),
      ).toHaveCount(0);
      expect(await page.title(), 'document.title was mutated — the payload ran').toBe(titleBefore);
      expect(dialogs, 'the payload raised a dialog — it executed').toEqual([]);

      // ── Then the precondition that gives them meaning ──────────────────
      // Escaping can only be proven on a payload the tool actually echoes. A
      // tool that strips or rewrites the markup (case-converter tokenizes it
      // away, for instance) passes the checks above vacuously — so the fixture
      // must supply a payload that survives into the results.
      await expect(
        results,
        `this tool did not echo ${fixture.xssPayload} into its results, so nothing about ` +
          `escaping was proven — pick an xssPayload that is valid in this tool's grammar ` +
          `and reaches the output (see tools.fixtures.ts)`,
      ).toContainText(`<${tag}`);
      expect(html, 'escapeHtml() output expected').toContain('&lt;');
    });
  }
});
