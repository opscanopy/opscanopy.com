/**
 * The pure HTML builders shared by the playground's server-rendered seed and
 * its client re-render. If these two ever diverge, a no-JS visitor (and every
 * AI crawler, which does not run JS) sees different markup from a browser.
 *
 * `convert()` is pure and synchronous and emits an `OnCalendar=` expression,
 * not a next-run time — so the whole result is safe to bake at build time.
 */
import { describe, it, expect } from 'vitest';
import { convert } from './engine';
import { examples } from './examples';
import { notesHtml, notesSummaryText, onCalendarText, errorHtml, EMPTY_HTML, LOADING_HTML } from './render';

const seed = convert(examples[0].cron, { unitName: 'cron-job' }); // 0 3 * * * /usr/bin/backup.sh

describe('the seeded example', () => {
  it('converts to a fixed daily OnCalendar that the strip and the timer unit both carry', () => {
    expect(seed.valid).toBe(true);
    expect(onCalendarText(seed)).toBe('*-*-* 03:00:00');
    expect(seed.timerUnit).toContain('OnCalendar=*-*-* 03:00:00');
    expect(seed.serviceUnit).toContain('ExecStart=/usr/bin/backup.sh');
  });

  it('renders its notes panel and summary the way the client does', () => {
    const html = notesHtml(seed.notes);
    if (seed.notes.length === 0) {
      expect(html).toContain('Converted cleanly');
      expect(notesSummaryText(seed.notes)).toBe('Converted');
    } else {
      expect(html).toContain('Migration note');
      for (const note of seed.notes) expect(html).toContain(note.replace(/&/g, '&amp;'));
      expect(notesSummaryText(seed.notes)).toMatch(/^\d+ notes?$/);
    }
  });
});

describe('onCalendarText', () => {
  it('falls back to an em dash when there is no expression', () => {
    expect(onCalendarText(convert(''))).toBe('—');
  });
});

describe('notesHtml', () => {
  it('pluralises the title and escapes each note', () => {
    const one = notesHtml(['use <Persistent=true>']);
    expect(one).toContain('Migration note</p>');
    expect(one).toContain('&lt;Persistent=true&gt;');
    expect(one).not.toContain('<Persistent');
    expect(notesSummaryText(['a'])).toBe('1 note');

    const two = notesHtml(['a', 'b']);
    expect(two).toContain('Migration notes</p>');
    expect(two.match(/cs-note__item/g)?.length).toBe(2);
    expect(notesSummaryText(['a', 'b'])).toBe('2 notes');
  });
});

describe('errorHtml / static states', () => {
  it('escapes the diagnostic message', () => {
    expect(errorHtml('bad <input>')).toContain('bad &lt;input&gt;');
    expect(errorHtml('x')).toContain('role="alert"');
  });

  it('keeps the empty and loading states stable strings', () => {
    expect(EMPTY_HTML).toMatch(/^<p class="cs-empty/);
    expect(LOADING_HTML).toContain('Converting…');
  });
});
