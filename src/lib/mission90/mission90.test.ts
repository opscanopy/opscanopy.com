import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  program,
  phases,
  days,
  missions,
  liveDays,
  getDay,
  phaseForDay,
  totalCoreMinutes,
} from '../../data/mission90';

/** Canonical phase day-ranges from the curriculum table. */
const PHASE_RANGES: Record<number, [number, number]> = {
  1: [1, 20],
  2: [21, 45],
  3: [46, 65],
  4: [66, 85],
  5: [86, 90],
};

/** Project blocks: 41–45 (Project 1), 62–65 (Project 2), 81–85 (Project 3). */
const PROJECT_DAYS = [41, 42, 43, 44, 45, 62, 63, 64, 65, 81, 82, 83, 84, 85];

/**
 * Mission days — a deliberate deviation from strict every-7th cadence so
 * missions never land inside a project block.
 */
const MISSION_DAYS = [7, 14, 21, 28, 40, 49, 56, 73, 80, 90];

describe('mission90 registry integrity', () => {
  it('program metadata is canonical', () => {
    expect(program.name).toBe('Mission 90 Days DevOps');
    expect(program.route).toBe('/mission-90/');
    expect(program.totalDays).toBe(90);
    expect(program.description.length).toBeGreaterThan(0);
  });

  it('has exactly 90 days with unique, contiguous day numbers 1..90', () => {
    expect(days).toHaveLength(90);
    const nums = [...days.map((d) => d.day)].sort((a, b) => a - b);
    nums.forEach((n, i) => {
      expect(n, `day numbers must be contiguous at position ${i}`).toBe(i + 1);
    });
  });

  it('all day slugs are unique', () => {
    const slugs = new Set(days.map((d) => d.slug));
    expect(slugs.size).toBe(days.length);
  });

  it('has exactly 5 phases whose day-ranges match the curriculum table', () => {
    expect(phases).toHaveLength(5);
    for (const p of phases) {
      expect(p.days, `phase ${p.id} ("${p.slug}") day-range`).toEqual(PHASE_RANGES[p.id]);
    }
  });

  it("every day's phase matches phaseForDay(day)", () => {
    for (const d of days) {
      expect(phaseForDay(d.day)?.id, `day ${d.day} phase`).toBe(d.phase);
    }
  });

  it('getDay(n) resolves days and returns undefined out of range', () => {
    expect(getDay(1)?.day).toBe(1);
    expect(getDay(90)?.day).toBe(90);
    expect(getDay(0)).toBeUndefined();
    expect(getDay(91)).toBeUndefined();
  });

  it('project days are exactly 41–45, 62–65, 81–85', () => {
    const projectDays = days
      .filter((d) => d.isProjectDay)
      .map((d) => d.day)
      .sort((a, b) => a - b);
    expect(projectDays).toEqual(PROJECT_DAYS);
    for (const d of days) {
      expect(d.isProjectDay, `day ${d.day} isProjectDay`).toBe(PROJECT_DAYS.includes(d.day));
    }
  });

  it('mission days (hasMission) are exactly [7,14,21,28,40,49,56,73,80,90]', () => {
    const missionDays = days
      .filter((d) => d.hasMission)
      .map((d) => d.day)
      .sort((a, b) => a - b);
    expect(missionDays).toEqual(MISSION_DAYS);
  });

  it('hasMission days ↔ mission ids form a bijection', () => {
    expect(missions).toHaveLength(10);
    const missionIds = new Set(missions.map((m) => m.id));
    expect(missionIds.size, 'mission ids must be unique').toBe(missions.length);

    const dayByNumber = new Map(days.map((d) => [d.day, d]));
    for (const m of missions) {
      const d = dayByNumber.get(m.unlockAfterDay);
      expect(d?.hasMission, `mission "${m.id}" → day ${m.unlockAfterDay} must be a mission day`).toBe(true);
      expect(d?.missionId, `day ${m.unlockAfterDay} must carry missionId "${m.id}"`).toBe(m.id);
    }

    for (const d of days) {
      if (d.hasMission) {
        expect(
          d.missionId !== undefined && missionIds.has(d.missionId),
          `day ${d.day} → unknown mission "${d.missionId}"`,
        ).toBe(true);
      } else {
        expect(d.missionId, `day ${d.day} has no mission but carries a missionId`).toBeUndefined();
      }
    }
  });

  it("every mission's week agrees with its unlockAfterDay", () => {
    for (const m of missions) {
      expect(m.week, `mission "${m.id}" week must be ceil(${m.unlockAfterDay}/7)`).toBe(
        Math.ceil(m.unlockAfterDay / 7),
      );
    }
  });

  it('days 1–65 are live and liveDays reflects status filtering', () => {
    const live = days.filter((d) => d.status === 'live');
    expect(live.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65]);
    expect(liveDays).toEqual(live);
  });

  it('live missions are week1-4, week6, week7 and week8', () => {
    const live = missions.filter((m) => m.status === 'live');
    expect(live.map((m) => m.id)).toEqual(['week1-server-down', 'week2-dns-detective', 'week3-locked-file', 'week4-docker-rescue', 'week6-broken-pipeline', 'week7-aws-bill-shock', 'week8-database-recovery']);
  });

  it('totalCoreMinutes sums all 90 day minutes and lands near 80 hours', () => {
    const sum = days.reduce((acc, d) => acc + d.minutes, 0);
    expect(totalCoreMinutes).toBe(sum);
    expect(totalCoreMinutes).toBeGreaterThanOrEqual(4600);
    expect(totalCoreMinutes).toBeLessThanOrEqual(4900);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Content ↔ registry cross-checks. The Astro content collection can't be
 * imported in a vitest node env, so we read the `---` frontmatter and body of
 * each day markdown file straight off disk. Only top-level scalar frontmatter
 * fields (day, title, minutes, phase, draft) are parsed — no YAML dependency.
 * Everything enumerates the files actually present so the suite scales as days
 * are authored (it does not hardcode day-001).
 * ──────────────────────────────────────────────────────────────────────── */
const M90_DIR = 'src/content/mission90';

interface DayFile {
  file: string;
  day: number;
  title: string;
  minutes: number;
  phase: number;
  draft: boolean;
  body: string;
}

/** Read one top-level `key: value` scalar from a frontmatter block. */
function fmScalar(fm: string, key: string): string | undefined {
  const m = fm.match(new RegExp(`^${key}:[ \\t]*(.+?)[ \\t]*$`, 'm'));
  if (!m) return undefined;
  return m[1].replace(/^["']|["']$/g, '');
}

function loadDayFiles(): DayFile[] {
  if (!existsSync(M90_DIR)) return [];
  const out: DayFile[] = [];
  for (const file of readdirSync(M90_DIR)) {
    if (!file.endsWith('.md') || file.startsWith('_')) continue;
    const raw = readFileSync(join(M90_DIR, file), 'utf8').replace(/\r\n/g, '\n');
    const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!m) continue;
    const [, fm, body] = m;
    const dayStr = fmScalar(fm, 'day');
    if (dayStr === undefined) continue;
    out.push({
      file,
      day: Number(dayStr),
      title: fmScalar(fm, 'title') ?? '',
      minutes: Number(fmScalar(fm, 'minutes')),
      phase: Number(fmScalar(fm, 'phase')),
      draft: fmScalar(fm, 'draft') === 'true',
      body,
    });
  }
  return out;
}

const dayFiles = loadDayFiles();
const nonDraftFiles = dayFiles.filter((f) => !f.draft);
const nonDraftByDay = new Map(nonDraftFiles.map((f) => [f.day, f]));

describe('mission90 registry ↔ content collection', () => {
  it('every live registry day has a matching non-draft file on disk', () => {
    expect(liveDays.length, 'expected at least one live day').toBeGreaterThan(0);
    for (const d of liveDays) {
      const f = nonDraftByDay.get(d.day);
      expect(
        f,
        `no non-draft file in ${M90_DIR} for live registry day ${d.day} ("${d.slug}")`,
      ).toBeDefined();
    }
  });

  it("registry title/minutes/phase match each live day's file frontmatter", () => {
    for (const d of liveDays) {
      const f = nonDraftByDay.get(d.day);
      if (!f) continue; // absence is reported by the existence test above
      expect(f.title, `day ${d.day} title`).toBe(d.title);
      expect(f.minutes, `day ${d.day} minutes`).toBe(d.minutes);
      expect(f.phase, `day ${d.day} phase`).toBe(d.phase);
    }
  });
});

// The errors section is "Real Errors I Hit" for author-run days (verbatim errors
// from a real WSL2 run — e.g. Day 1) and "Common Errors & Fixes" for authored
// days whose errors are curated, not first-person. Both are accepted at H2[2].
const FIXED = {
  lab: 'Hands-On Lab',
  errors: 'Real Errors I Hit',
  errorsAuthored: 'Common Errors & Fixes',
  goDeeper: 'Go Deeper',
} as const;
const ERRORS_HEADINGS: string[] = [FIXED.errors, FIXED.errorsAuthored];

/** All body `## ` headings (excludes `###`+), in document order, with offsets.
 *  Fence-aware: `## ` lines INSIDE fenced code blocks (```/~~~) are example
 *  content (e.g. a keep-a-changelog sample), not document structure, so they
 *  are skipped. Offsets are preserved into the original body for section slicing. */
function h2Headings(body: string): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  const headingRe = /^##(?!#)[ \t]+(.+?)[ \t]*$/;
  const fenceRe = /^[ \t]*(```|~~~)/;
  let offset = 0;
  let inFence = false;
  for (const line of body.split('\n')) {
    if (fenceRe.test(line)) {
      inFence = !inFence;
    } else if (!inFence) {
      const m = headingRe.exec(line);
      if (m) out.push({ text: m[1], start: offset, end: offset + line.length });
    }
    offset += line.length + 1; // + newline
  }
  return out;
}

/** Prose word count — strips diagrams (figure/svg), any HTML tags, and fenced
 *  code so SVG markup and command blocks don't inflate the concept budget. */
function conceptWordCount(text: string): number {
  const stripped = text
    .replace(/<figure[\s\S]*?<\/figure>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ');
  return stripped.split(/\s+/).filter((t) => /[A-Za-z0-9]/.test(t)).length;
}

describe('mission90 day content shape', () => {
  it('at least one non-draft day file exists to validate', () => {
    expect(nonDraftFiles.length).toBeGreaterThan(0);
  });

  for (const f of nonDraftFiles) {
    describe(`${f.file} (day ${f.day})`, () => {
      const h2s = h2Headings(f.body);

      it('body H2s follow the fixed order: concept → Hands-On Lab → Real Errors I Hit → interview → [Go Deeper]', () => {
        expect(h2s.length, 'expected 4 or 5 body H2 headings').toBeGreaterThanOrEqual(4);
        expect(h2s.length, 'expected 4 or 5 body H2 headings').toBeLessThanOrEqual(5);
        // [0] concept heading — topic-specific, not a fixed label, not the interview H2
        expect(h2s[0].text.length, 'concept H2 must not be empty').toBeGreaterThan(0);
        expect(
          [FIXED.lab, FIXED.errors, FIXED.errorsAuthored, FIXED.goDeeper],
          'first H2 must be the concept, not a fixed label',
        ).not.toContain(h2s[0].text);
        expect(h2s[0].text, 'first H2 must be the concept, not the interview H2').not.toMatch(
          /Interview Questions$/,
        );
        // [1] lab, [2] errors (real or authored), [3] interview
        expect(h2s[1].text).toBe(FIXED.lab);
        expect(ERRORS_HEADINGS, 'third H2 must be the errors section').toContain(h2s[2].text);
        expect(h2s[3].text, 'fourth H2 must be the interview heading').toMatch(/Interview Questions$/);
        // [4] optional Go Deeper
        if (h2s.length === 5) expect(h2s[4].text).toBe(FIXED.goDeeper);
      });

      it('concept section (first H2 → Hands-On Lab) is ≤600 words', () => {
        expect(h2s.length).toBeGreaterThanOrEqual(2);
        const concept = f.body.slice(h2s[0].end, h2s[1].start);
        expect(conceptWordCount(concept)).toBeLessThanOrEqual(600);
      });

      it('Hands-On Lab section has ≤12 fenced code blocks', () => {
        expect(h2s.length).toBeGreaterThanOrEqual(3);
        const lab = f.body.slice(h2s[1].end, h2s[2].start);
        const fences = (lab.match(/^```/gm) ?? []).length;
        expect(Math.floor(fences / 2)).toBeLessThanOrEqual(12);
      });
    });
  }
});
