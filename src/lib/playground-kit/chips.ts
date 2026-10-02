/**
 * Example-chip state for the kit's ExampleChips.astro (plan "Batch C").
 *
 * The chip row is `[data-chips]` holding `button.chip[aria-pressed]`; the
 * pressed state IS the selected state (the global `.chip[aria-pressed='true']`
 * rule draws it, and assistive tech announces it), so there is no `is-active`
 * class to keep in step with it. Hover is a different look on purpose.
 *
 * DOM-shaped, so chips.test.ts drives it with fakes in node.
 */

export const CHIP_SELECTOR = '.chip[aria-pressed]';

/** Read through attributes, not `dataset`, so a plain `Element` (what querySelectorAll returns) fits. */
export interface ChipLike {
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
}
export interface ChipGroupLike {
  querySelectorAll(sel: string): ArrayLike<ChipLike> & Iterable<ChipLike>;
}

/** Every chip in a group, in document order. */
export function chipsIn(group: ChipGroupLike | null | undefined): ChipLike[] {
  return group ? Array.from(group.querySelectorAll(CHIP_SELECTOR)) : [];
}

/** Press the chips `isActive` accepts and release the rest. Returns how many are pressed. */
export function syncChips(group: ChipGroupLike | null | undefined, isActive: (chip: ChipLike, index: number) => boolean): number {
  let pressed = 0;
  chipsIn(group).forEach((chip, i) => {
    const on = isActive(chip, i);
    if (on) pressed++;
    chip.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  return pressed;
}

/** Press the chip whose `data-input` equals `value` (value-keyed rows, e.g. the subnet calculator). */
export function syncChipsByInput(group: ChipGroupLike | null | undefined, value: string): number {
  return syncChips(group, (c) => (c.getAttribute('data-input') ?? '') === value);
}

/** Press the chip at example index `idx`, or none for null (index-keyed rows). */
export function syncChipsByIndex(group: ChipGroupLike | null | undefined, idx: number | null): number {
  return syncChips(group, (c) => idx !== null && c.getAttribute('data-example-idx') === String(idx));
}

/** Release every chip (the visitor typed, so no example is selected). */
export function clearChips(group: ChipGroupLike | null | undefined): void {
  syncChips(group, () => false);
}
