// Rasterize OG/Twitter link-preview PNGs (1200x630).
//
// Three jobs:
//  0. Program heroes — BUILDS the Mission 90 programme / per-day heroes and the
//     Verify-the-AI hero SVGs (public/mission-90/*-hero.svg,
//     public/verify-ai/verify-ai-hero.svg) on the Field Manual plate, with
//     every glyph outlined (scripts/og-text.mjs). Their copy lives in
//     PROGRAM_HEROES below; edit it there, never in the SVG.
//  1. Hero rasterization — converts each `*-hero.svg` (the blog covers written
//     by scripts/gen-blog-heroes.mjs, plus job 0's heroes) straight to PNG.
//  2. Tool card generation — BUILDS one card per live tool from the tools
//     registry (name, tagline, category, figure number) on the same plate,
//     then rasterizes it the same way.
// `npm run gen:heroes` runs the blog-cover generator and then this script;
// `npm run gen:og` runs this script alone. Output is deterministic: running
// it twice produces byte-identical SVGs and PNGs.
//
// No SVG drawn here contains <text> or a font-family: librsvg (sharp's
// rasteriser) only sees system fonts, so the text is outlined IBM Plex instead.
//
// The PNGs are committed static assets (copied to dist/ on build) — nothing
// generates them at request time.
import sharp from 'sharp';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tools, liveTools, categoryHue } from '../src/data/tools.ts';
import {
  fonts,
  fitText,
  measure,
  num,
  textPath,
  textRuns,
  beginDoc,
  svgDoc,
  esc,
  plate,
  captionRow,
  footer,
  wordmark,
  INK,
  X,
  RIGHT,
} from './og-text.mjs';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const heroSrcDirs = [join(publicDir, 'blog'), join(publicDir, 'mission-90'), join(publicDir, 'verify-ai')];
const toolOgDir = join(publicDir, 'tools-og');

// ── Job 0: programme heroes ───────────────────────────────────────────────────

/** Title lines are given explicitly (they sit beside a motif); the size steps down until the widest fits. */
function fixedLines(lines, sizes, maxWidth, baseline, lh) {
  const { sans } = fonts();
  const size = sizes.find((s) => lines.every((l) => measure(sans, l, s) <= maxWidth));
  if (!size) throw new Error(`gen-og-images: ${JSON.stringify(lines)} does not fit ${maxWidth}px`);
  return lines.map((l, i) => textPath(sans, l, X, baseline + i * Math.round(size * lh), size, { fill: INK.fg })).join('\n');
}

/** The Mission 90 terminal motif, centred on (980,315): a 344x264 instrument with a cap, a command, a progress bar. */
function terminalMotif({ command, sub, day }) {
  const { mono, monoBold, sans } = fonts();
  const ox = 980;
  const oy = 315;
  const cmd = textRuns(monoBold, [
    { text: '$', fill: INK.leaf },
    { text: ` ${command}`, fill: INK.fg },
  ], ox - 150, oy - 40, 24);
  // Plex Mono's latin subset has no arrow, so a "→" in the sub-line is set in Plex Sans.
  const subRuns = sub.split(/(→)/).filter(Boolean).map((t) => ({ text: t, fill: INK.mute, font: t === '→' ? sans : mono }));
  const fillW = Math.max(16, Math.round((300 * day) / 90));
  return `<g>
<rect x="${ox - 172}" y="${oy - 132}" width="344" height="264" rx="8" fill="#0f0e0c" stroke="#ffffff" stroke-opacity="0.14" stroke-width="2"/>
<circle cx="${ox - 150}" cy="${oy - 108}" r="7" fill="${INK.dots[0]}"/>
<circle cx="${ox - 126}" cy="${oy - 108}" r="7" fill="${INK.dots[1]}"/>
<circle cx="${ox - 102}" cy="${oy - 108}" r="7" fill="${INK.dots[2]}"/>
<rect x="${ox - 172}" y="${oy - 85}" width="344" height="2" fill="#ffffff" fill-opacity="0.1"/>
${cmd.svg}
<rect x="${num(cmd.endX + 8)}" y="${oy - 59}" width="13" height="24" fill="${INK.leaf}" fill-opacity="0.85"/>
${textRuns(mono, subRuns, ox - 150, oy - 4, 20).svg}
<rect x="${ox - 150}" y="${oy + 26}" width="300" height="18" rx="4" fill="#ffffff" fill-opacity="0.12"/>
<rect x="${ox - 150}" y="${oy + 26}" width="${fillW}" height="18" rx="4" fill="${INK.leaf}"/>
${textPath(mono, `day ${day} / 90`, ox - 150, oy + 86, 20, { fill: INK.fg })}
</g>`;
}

function missionHero({ ariaLabel, caption, lines, subtitle, url, motif }) {
  beginDoc();
  const { sans } = fonts();
  return svgDoc(
    ariaLabel,
    [
      plate(INK.leaf),
      captionRow(caption, 'traffic'),
      fixedLines(lines, [68, 64, 60, 56], 700, 300, 1.24),
      textPath(sans, subtitle, X, 452, 28, { fill: INK.mute }),
      terminalMotif(motif),
      footer(url),
    ].join('\n'),
  );
}

function verifyHero() {
  beginDoc();
  const { sans, mono } = fonts();
  const list = ['Subnets', 'Cron', 'Timestamps', 'Base64'].flatMap((t, i) => [
    ...(i ? [{ text: '  ·  ', fill: INK.mute }] : []),
    { text: t, fill: INK.mute },
  ]);
  return svgDoc(
    'Verify the AI — deterministic checks for ChatGPT and Claude math mistakes',
    [
      plate(INK.leaf),
      captionRow([
        { text: 'verify-ai', fill: INK.leaf },
        { text: ' · deterministic checks', fill: INK.mute },
      ]),
      fixedLines(['AI is a brilliant guesser.', 'This checks the math.'], [72, 68, 64, 60], RIGHT - X, 272, 1.18),
      textPath(sans, 'Recompute a ChatGPT or Claude answer exactly, locally.', X, 430, 30, { fill: INK.mute }),
      textRuns(mono, list, X, 482, 20).svg,
      footer('opscanopy.com/verify-ai'),
      wordmark(RIGHT, 566),
    ].join('\n'),
  );
}

const PROGRAM_HEROES = [
  {
    file: join(publicDir, 'mission-90', 'mission-90-hero.svg'),
    svg: () =>
      missionHero({
        ariaLabel: 'Mission 90 Days DevOps — from developer to DevOps engineer in 90 days',
        caption: [
          { text: 'mission 90', fill: INK.leaf },
          { text: ' · the 90-day devops program', fill: INK.mute },
        ],
        lines: ['Mission 90 Days', 'DevOps'],
        subtitle: 'From developer to DevOps engineer in 90 days',
        url: 'opscanopy.com',
        motif: { command: './mission start', sub: 'dev → devops · 90 days', day: 76 },
      }),
  },
  // One entry per day that has a per-day card (src/pages/mission-90/day/[day].astro
  // uses day-NN-og.png when it exists, else the programme card).
  {
    file: join(publicDir, 'mission-90', 'day-01-hero.svg'),
    svg: () =>
      missionHero({
        ariaLabel: 'Mission 90 Days DevOps — Day 1: What DevOps actually is',
        caption: [
          { text: 'mission 90', fill: INK.leaf },
          { text: ' · day 01', fill: INK.amber },
        ],
        lines: ['What DevOps', 'actually is'],
        subtitle: 'Phase 1 · Foundations',
        url: 'opscanopy.com/mission-90',
        motif: { command: './day01 start', sub: 'foundations · 50 min', day: 1 },
      }),
  },
  { file: join(publicDir, 'verify-ai', 'verify-ai-hero.svg'), svg: verifyHero },
];

// ── Job 2's card ──────────────────────────────────────────────────────────────

/** Build the 1200x630 OG card SVG for one live tool. */
function toolOgSvg(tool) {
  beginDoc();
  const { sans } = fonts();
  const hue = categoryHue[tool.category]?.dark ?? INK.leaf;
  const figNo = String(tools.indexOf(tool) + 1).padStart(2, '0');
  const name = fitText(sans, tool.name, [80, 72, 64, 56], RIGHT - X, 2);
  const nameLh = Math.round(name.size * 1.1);
  const nameFirst = 250;
  const nameLast = nameFirst + (name.lines.length - 1) * nameLh;
  // The full tagline, wrapped (≤ 2 lines) — never truncated mid-thought.
  const tag = fitText(sans, tool.tagline, [32, 30, 28], RIGHT - X, 2);
  const tagFirst = nameLast + 66;
  const tagLh = Math.round(tag.size * 1.32);

  return svgDoc(
    `${esc(tool.name)} — ${esc(tool.tagline)}`,
    [
      plate(hue),
      // The figure cap the tool's result panel carries: fig. NN — slug · category.
      captionRow([
        { text: `fig. ${figNo}`, fill: INK.amber },
        { text: ` — ${tool.slug} · `, fill: INK.mute },
        { text: tool.category.toLowerCase(), fill: hue },
      ]),
      name.lines.map((l, i) => textPath(sans, l, X, nameFirst + i * nameLh, name.size, { fill: INK.fg })).join('\n'),
      tag.lines.map((l, i) => textPath(sans, l, X, tagFirst + i * tagLh, tag.size, { fill: INK.mute })).join('\n'),
      footer(`opscanopy.com/${tool.slug}`),
      wordmark(RIGHT, 566),
    ].join('\n'),
  );
}

let count = 0;

// Job 0 — programme hero SVGs.
for (const hero of PROGRAM_HEROES) {
  await writeFile(hero.file, hero.svg());
}

// Job 1 — every *-hero.svg → PNG.
for (const dir of heroSrcDirs) {
  const heroes = (await readdir(dir)).filter((f) => f.endsWith('-hero.svg')).sort();
  for (const file of heroes) {
    const out = file.replace(/-hero\.svg$/, '-og.png');
    // density bumps the SVG rasterization resolution so text/edges stay crisp at 1200px.
    await sharp(join(dir, file), { density: 144 })
      .resize(1200, 630, { fit: 'cover' })
      .png()
      .toFile(join(dir, out));
    count++;
  }
}

// Job 2 — programmatically generated tool cards → PNG.
await mkdir(toolOgDir, { recursive: true });
for (const tool of liveTools) {
  const svg = toolOgSvg(tool);
  await sharp(Buffer.from(svg), { density: 144 })
    .resize(1200, 630)
    .png()
    .toFile(join(toolOgDir, `${tool.slug}-og.png`));
  count++;
}

console.log(
  `Generated ${count} OG image(s) (1200x630 PNG): public/blog/, public/mission-90/, public/verify-ai/, public/tools-og/ (${liveTools.length} tools)`,
);
