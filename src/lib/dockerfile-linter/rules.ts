/**
 * The rule set: DF001–DF017, and nothing else.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  WHAT THIS IS                                                            │
 * │                                                                          │
 * │  Seventeen high-signal rules, not a hundred. Every one of them describes  │
 * │  a Dockerfile that BUILDS but is wrong: an image that changes under you,  │
 * │  a cache that serves a stale package index, a secret written into image   │
 * │  history, a container that runs as root, an exec form Docker silently     │
 * │  demotes to a shell string.                                              │
 * │                                                                          │
 * │  Severity is a promise, not a mood:                                       │
 * │    error   — Docker or the build itself rejects or silently mis-runs it.  │
 * │    warning — it builds and it is wrong.                                   │
 * │    info    — worth knowing; no defect implied.                            │
 * │                                                                          │
 * │  ── DELIBERATELY SILENT (each of these was considered and rejected) ───   │
 * │                                                                          │
 * │  • Version pinning beyond the tag. `apt-get install curl` with no         │
 * │    version, `pip install django` with no `==`, a tag instead of a digest: │
 * │    all legitimate, all context-dependent. DF002 asks for a tag, never a   │
 * │    digest.                                                               │
 * │  • EXPOSE. A missing EXPOSE breaks nothing (it is metadata) and an extra  │
 * │    one costs nothing. Pure opinion.                                       │
 * │  • HEALTHCHECK. Ignored outright by Kubernetes, which is where this       │
 * │    audience runs images. Noise for them.                                 │
 * │  • pip / npm download caches (`--no-cache-dir`, `npm cache clean`).       │
 * │    Real but small, and the flags differ per tool version.                 │
 * │  • `;`-joined update+install. `apt-get update; apt-get install` hides a    │
 * │    failed update, but both commands ARE in the same layer, so DF007 has   │
 * │    nothing to say and a separate shell-semantics rule would be noise.    │
 * │  • FROM references whose tag comes from an unresolvable `$VAR`. The real  │
 * │    tag is chosen at build time by `--build-arg`; guessing would be wrong. │
 * │  • `COPY --from=<registry image>`. Anything with a `/`, `:` or `@` is a    │
 * │    legal external image reference, so DF003 stays quiet.                  │
 * │  • Deep shell semantics. No shell AST: no `set -e` reasoning, no exit-code │
 * │    analysis, no variable tracking. The scanner is quote-aware and stops    │
 * │    there.                                                                │
 * │  • Inside an exec-form `RUN ["sh","-c","…"]` the argv is not scanned as    │
 * │    shell text.                                                           │
 * │  • Unterminated heredocs, unbalanced quotes and `# syntax=` dialects.      │
 * │    Reported by Docker itself, and a partial parse must not invent a rule. │
 * │  • `.dockerignore`. Not in the file, so not detectable here — it lives in │
 * │    DF017's fix text and in the page FAQ instead.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { EXEC_FORM_KEYWORDS, maskQuoted, segmentShell, splitWords } from './parse';
import type {
  Finding,
  Instruction,
  ParsedDockerfile,
  RuleId,
  ShellSegment,
  ShellText,
  Stage,
} from './types';

/* ────────────────────────────────────────────────────────────────────────── *
 *  Rule context — shared, memoised analysis so seventeen rules walk the tree
 *  once each rather than re-deriving shell segments per rule.
 * ────────────────────────────────────────────────────────────────────────── */

export interface RuleContext {
  parsed: ParsedDockerfile;
  add: (finding: Finding) => void;
  /** Quote-aware command segments of a RUN: folded argument text + every heredoc body. */
  shellOf: (instr: Instruction) => ShellSegment[];
  /** All shell text of a RUN concatenated (arg text + heredoc bodies), quote-masked. */
  maskedTextOf: (instr: Instruction) => string;
  /** The RUN's shell texts, in scan order. */
  shellTextsOf: (instr: Instruction) => ShellText[];
}

export function makeContext(parsed: ParsedDockerfile, add: (f: Finding) => void): RuleContext {
  const segCache = new Map<Instruction, ShellSegment[]>();
  const textCache = new Map<Instruction, string>();
  const shellCache = new Map<Instruction, ShellText[]>();

  const shellTextsOf = (instr: Instruction): ShellText[] => {
    const hit = shellCache.get(instr);
    if (hit) return hit;
    // An exec-form RUN is argv, not a shell string — see DELIBERATELY SILENT.
    const texts: ShellText[] =
      instr.execArgv !== undefined ? [] : [instr.argShell, ...instr.heredocs.map((h) => h.body)];
    shellCache.set(instr, texts);
    return texts;
  };

  const shellOf = (instr: Instruction): ShellSegment[] => {
    const hit = segCache.get(instr);
    if (hit) return hit;
    const segments = shellTextsOf(instr).flatMap((text) => segmentShell(text));
    segCache.set(instr, segments);
    return segments;
  };

  const maskedTextOf = (instr: Instruction): string => {
    const hit = textCache.get(instr);
    if (hit !== undefined) return hit;
    const masked = shellTextsOf(instr)
      .map((t) => maskQuoted(t.text))
      .join('\n');
    textCache.set(instr, masked);
    return masked;
  };

  return { parsed, add, shellOf, maskedTextOf, shellTextsOf };
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Shared helpers.
 * ────────────────────────────────────────────────────────────────────────── */

function runsOf(parsed: ParsedDockerfile): Instruction[] {
  return parsed.instructions.filter((i) => i.keyword === 'RUN');
}

/** The words of an instruction's argument text, or its argv for the exec form. */
function argWords(instr: Instruction): string[] {
  if (instr.execArgv !== undefined) return instr.execArgv;
  return splitWords(instr.argText).map((w) => w.text);
}

function unquote(value: string): string {
  const t = value.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1);
  }
  return t;
}

/** Segment text with quoted spans blanked out — offsets preserved. */
function masked(segment: ShellSegment): string {
  return maskQuoted(segment.text).trim();
}

function hasCacheMount(instr: Instruction): boolean {
  return instr.flags.some((f) => f.name === 'mount' && /type=cache/.test(f.value));
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  DF001 — the first instruction must be FROM.
 * ────────────────────────────────────────────────────────────────────────── */

function df001(ctx: RuleContext): void {
  const { instructions, stages } = ctx.parsed;
  if (instructions.length === 0) return;

  if (stages.length === 0) {
    ctx.add({
      id: 'DF001',
      severity: 'error',
      title: 'No FROM instruction — nothing tells Docker what to build from.',
      detail:
        'A Dockerfile must contain at least one FROM. Only ARG, comments and parser directives may come before it.',
      line: instructions[0].line,
      remediation: 'Start the file with a base image, e.g. `FROM node:22-bookworm-slim`.',
    });
    return;
  }

  for (const instr of instructions) {
    if (instr.stageIndex >= 0) break; // reached the first stage
    if (instr.keyword === 'ARG' || instr.keyword === 'FROM') continue;
    ctx.add({
      id: 'DF001',
      severity: 'error',
      title: `${instr.keyword} appears before the first FROM.`,
      detail:
        'Only ARG may precede FROM. Docker fails the build with "no build stage in current context" when any other instruction comes first, because there is no image for it to act on yet.',
      line: instr.line,
      remediation:
        'Move this instruction below the FROM, or turn it into an `ARG` if it only declares a build-time variable.',
    });
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  DF002 — the base image tag.
 * ────────────────────────────────────────────────────────────────────────── */

/** Split a reference into its tag, ignoring a `host:port` colon before the last `/`. */
export function refParts(ref: string): { hasTag: boolean; tag: string; hasDigest: boolean } {
  const atIndex = ref.lastIndexOf('@');
  const slashIndex = ref.lastIndexOf('/');
  const hasDigest = atIndex > slashIndex && atIndex !== -1;
  const withoutDigest = hasDigest ? ref.slice(0, atIndex) : ref;
  const lastPart = withoutDigest.slice(withoutDigest.lastIndexOf('/') + 1);
  const colon = lastPart.indexOf(':');
  return {
    hasTag: colon !== -1,
    tag: colon === -1 ? '' : lastPart.slice(colon + 1),
    hasDigest,
  };
}

function df002(ctx: RuleContext): void {
  const { stages } = ctx.parsed;
  const detail =
    'An untagged or :latest reference resolves to a different image every time the publisher pushes. A rebuild months from now can pull a new major version, and nothing in this file records which one you tested.';
  const remediation =
    'Pin a tag you have actually tested, e.g. `node:22-bookworm-slim`. Add the digest (`@sha256:…`) as well when you need byte-identical rebuilds.';

  stages.forEach((stage, index) => {
    const ref = stage.resolvedImage.trim();
    if (ref === '' || stage.unresolved) return;
    if (ref.toLowerCase() === 'scratch') return;
    // A reference to an earlier stage is not an image at all.
    const lower = ref.toLowerCase();
    if (stages.slice(0, index).some((s) => s.name === lower)) return;

    const { hasTag, tag, hasDigest } = refParts(ref);
    if (hasDigest) return;
    if (hasTag && tag.toLowerCase() !== 'latest') return;

    ctx.add({
      id: 'DF002',
      severity: 'warning',
      title: hasTag
        ? `Base image “${ref}” is pinned to the moving :latest tag.`
        : `Base image “${ref}” has no tag, so Docker resolves it to :latest.`,
      detail,
      line: stage.line,
      remediation,
    });
  });
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  DF003 — COPY --from.
 * ────────────────────────────────────────────────────────────────────────── */

function df003(ctx: RuleContext): void {
  const { instructions, stages } = ctx.parsed;
  const detail =
    '`--from` must name a stage defined EARLIER in the file, a stage index (counting from 0), or an external image reference. Anything else fails the build with "invalid from flag value".';

  for (const instr of instructions) {
    if (instr.keyword !== 'COPY' || instr.stageIndex < 0) continue;
    const flag = instr.flags.find((f) => f.name === 'from');
    if (!flag) continue;
    const value = flag.value.trim();
    if (value === '') continue;

    if (/^\d+$/.test(value)) {
      const target = Number(value);
      if (target < instr.stageIndex) continue;
      ctx.add({
        id: 'DF003',
        severity: 'error',
        title: `COPY --from=${value} points at stage ${value}, which is not built yet.`,
        detail:
          'Stages are numbered from 0 in file order, and a stage can only copy from one that came before it. ' +
          detail,
        line: instr.line,
        remediation:
          'Point it at an earlier index, or name the stage (`FROM … AS deps`) and copy with `--from=deps`.',
      });
      continue;
    }

    const lower = value.toLowerCase();
    const targetIndex = stages.findIndex((s) => s.name === lower);
    if (targetIndex === -1) {
      // Anything with a registry, path, tag or digest is a legal image reference.
      if (/[/:@]/.test(value)) continue;
      ctx.add({
        id: 'DF003',
        severity: 'error',
        title: `COPY --from=${value} names no stage in this file.`,
        detail: `“${value}” matches no \`AS\` name, and it carries no registry, tag or digest, so Docker cannot read it as an image either. ${detail}`,
        line: instr.line,
        remediation: `Check it against your \`AS\` names. If you meant an image, write it with a tag — for example \`${value}:latest\`.`,
      });
      continue;
    }
    if (targetIndex < instr.stageIndex) continue;
    ctx.add({
      id: 'DF003',
      severity: 'error',
      title:
        targetIndex === instr.stageIndex
          ? `COPY --from=${value} points at stage “${value}”, which is the stage doing the copying.`
          : `COPY --from=${value} points at stage “${value}”, which is defined later in the file.`,
      detail,
      line: instr.line,
      remediation:
        'Move that stage above this one, or copy from a stage that is already built at this point.',
    });
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  DF004 / DF005 — ADD.
 * ────────────────────────────────────────────────────────────────────────── */

const REMOTE_RE = /^(?:https?|ftp):\/\//i;
const TAR_RE = /\.(?:tar|tar\.gz|tgz|tar\.bz2|tbz|tbz2|tar\.xz|txz|tar\.zst|tzst)$/i;

function addSources(instr: Instruction): string[] {
  const words = argWords(instr).filter((w) => w.length > 0);
  return words.length > 1 ? words.slice(0, -1) : [];
}

function df004(ctx: RuleContext): void {
  for (const instr of ctx.parsed.instructions) {
    if (instr.keyword !== 'ADD') continue;
    const sources = addSources(instr);
    if (sources.length === 0) continue;
    // A remote ADD is DF005's business, not DF004's.
    if (sources.some((s) => REMOTE_RE.test(s) || s.includes('://') || s.startsWith('git@'))) continue;
    // Auto-extracting a tar archive is the one thing ADD does that COPY cannot.
    if (sources.every((s) => TAR_RE.test(s))) continue;
    ctx.add({
      id: 'DF004',
      severity: 'warning',
      title: 'ADD copies a local path — COPY is the predictable choice.',
      detail:
        'ADD silently auto-extracts local tar archives and can fetch URLs. For an ordinary file or directory that behaviour is a surprise rather than a feature, which is why ADD is discouraged for plain copies.',
      line: instr.line,
      remediation: 'Use `COPY` instead. Keep `ADD` only where you want a tar archive extracted.',
    });
  }
}

function df005(ctx: RuleContext): void {
  for (const instr of ctx.parsed.instructions) {
    if (instr.keyword !== 'ADD') continue;
    const remote = addSources(instr).find((s) => REMOTE_RE.test(s));
    if (!remote) continue;
    if (instr.flags.some((f) => f.name === 'checksum' && f.value.trim() !== '')) continue;
    ctx.add({
      id: 'DF005',
      severity: 'warning',
      title: `ADD downloads “${remote}” with no checksum.`,
      detail:
        'A remote ADD bakes whatever the server returns into an image layer, and nothing in the build notices when that changes. The download also re-runs on every cache miss.',
      line: instr.line,
      remediation:
        'Add `--checksum=sha256:…` (BuildKit), or download with `RUN curl -fsSL … -o file` and verify it with `sha256sum -c` in the same layer.',
    });
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  DF006 — WORKDIR.
 * ────────────────────────────────────────────────────────────────────────── */

function df006(ctx: RuleContext): void {
  for (const instr of ctx.parsed.instructions) {
    if (instr.keyword !== 'WORKDIR') continue;
    const raw = instr.argText.trim();
    if (raw === '') continue;
    const path = unquote(raw);
    if (path === '') continue;
    if (
      path.startsWith('/') ||
      path.startsWith('\\') ||
      path.startsWith('$') ||
      path.startsWith('%') ||
      /^[A-Za-z]:[\\/]/.test(path)
    ) {
      continue;
    }
    ctx.add({
      id: 'DF006',
      severity: 'warning',
      title: `WORKDIR “${path}” is a relative path.`,
      detail:
        'A relative WORKDIR is resolved against whatever the previous WORKDIR was, so the directory this instruction actually selects depends on the lines above it — and changes the moment they are reordered.',
      line: instr.line,
      remediation: 'Use an absolute path, e.g. `WORKDIR /app`.',
    });
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  DF007 / DF008 — package-manager layers.
 *
 *  Both walk the RUN's quote-aware segments (folded argument text plus every
 *  heredoc body) so `apt-get update` on physical line 4 of a continuation is
 *  reported on line 4.
 * ────────────────────────────────────────────────────────────────────────── */

const APT_UPDATE_RE = /\b(apt-get|apt)\s+(?:-[^\s]+\s+)*update\b/;
const APT_INSTALL_RE = /\b(?:apt-get|apt)\s+(?:-[^\s]+\s+)*install\b/;
const APK_UPDATE_RE = /\bapk\s+(?:--?[^\s]+\s+)*update\b/;
const APK_ADD_RE = /\bapk\s+(?:--?[^\s]+\s+)*add\b/;
const RPM_INSTALL_RE = /\b(dnf|yum|microdnf)\s+(?:-[^\s]+\s+)*(?:install|groupinstall)\b/;
const RPM_CLEAN_RE = /\b(?:dnf|yum|microdnf)\s+clean\s+all\b/;

function df007(ctx: RuleContext): void {
  const detail =
    'Each RUN is its own layer. When the update layer is served from cache while a later install layer is rebuilt, the install works from a package index that can be months old — and installs stale or missing versions.';

  for (const instr of runsOf(ctx.parsed)) {
    const segments = ctx.shellOf(instr);
    if (segments.length === 0) continue;
    const all = ctx.maskedTextOf(instr);

    const aptUpdate = segments.find((s) => APT_UPDATE_RE.test(masked(s)));
    if (aptUpdate && !APT_INSTALL_RE.test(all)) {
      const label = /\bapt-get\b/.test(masked(aptUpdate)) ? 'apt-get' : 'apt';
      ctx.add({
        id: 'DF007',
        severity: 'warning',
        title: `${label} update runs without an install in the same RUN.`,
        detail,
        line: aptUpdate.line,
        remediation:
          'Join them: `RUN apt-get update && apt-get install -y --no-install-recommends <packages>`.',
      });
    }

    const apkUpdate = segments.find((s) => APK_UPDATE_RE.test(masked(s)));
    if (apkUpdate && !APK_ADD_RE.test(all)) {
      ctx.add({
        id: 'DF007',
        severity: 'warning',
        title: 'apk update runs without an install in the same RUN.',
        detail,
        line: apkUpdate.line,
        remediation:
          'Drop the update entirely and use `RUN apk add --no-cache <packages>`, which fetches a fresh index in the same layer.',
      });
    }
  }
}

function df008(ctx: RuleContext): void {
  for (const instr of runsOf(ctx.parsed)) {
    if (hasCacheMount(instr)) continue; // the cache lives outside the image
    const segments = ctx.shellOf(instr);
    if (segments.length === 0) continue;
    const all = ctx.maskedTextOf(instr);

    const apt = segments.find((s) => APT_INSTALL_RE.test(masked(s)));
    if (apt && !/\/var\/lib\/apt\/lists/.test(all)) {
      ctx.add({
        id: 'DF008',
        severity: 'warning',
        title: 'apt-get install leaves the package lists in the image.',
        detail:
          'The /var/lib/apt/lists index adds tens of megabytes to this layer and is useless at run time. Deleting it in a LATER RUN does not help: the bytes are already committed to this layer.',
        line: apt.line,
        remediation: 'End the same RUN with `&& rm -rf /var/lib/apt/lists/*`.',
      });
    }

    const apk = segments.find((s) => APK_ADD_RE.test(masked(s)));
    if (apk && !/--no-cache/.test(masked(apk)) && !/\/var\/cache\/apk/.test(all)) {
      ctx.add({
        id: 'DF008',
        severity: 'warning',
        title: 'apk add caches the package index in the image.',
        detail:
          'Without --no-cache, apk writes its index to /var/cache/apk and leaves it in the layer. Removing it afterwards does not shrink the layer it was committed to.',
        line: apk.line,
        remediation: 'Use `apk add --no-cache <packages>`.',
      });
    }

    const rpm = segments.find((s) => RPM_INSTALL_RE.test(masked(s)));
    if (rpm && !RPM_CLEAN_RE.test(all)) {
      const label = RPM_INSTALL_RE.exec(masked(rpm))?.[1] ?? 'dnf';
      ctx.add({
        id: 'DF008',
        severity: 'warning',
        title: `${label} install leaves its metadata cache in the image.`,
        detail:
          'The downloaded packages and repository metadata stay in the layer once it is committed, so cleaning them up in a later RUN cannot reclaim the space.',
        line: rpm.line,
        remediation: `End the same RUN with \`&& ${label} clean all\`.`,
      });
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  DF009 — secrets in ENV / ARG.
 * ────────────────────────────────────────────────────────────────────────── */

const SECRET_NAME_RE =
  /(?:PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|CREDENTIAL|^PASS$|_PASS$)/i;

function df009(ctx: RuleContext): void {
  for (const instr of ctx.parsed.instructions) {
    if (instr.keyword !== 'ENV' && instr.keyword !== 'ARG') continue;
    const words = splitWords(instr.argText);
    if (words.length === 0) continue;

    /** name → value pairs, with the offset of the name for line attribution. */
    const pairs: { name: string; value: string; offset: number }[] = [];
    if (instr.keyword === 'ENV' && !words[0].text.includes('=')) {
      // Legacy form: `ENV KEY the rest of the line is the value`.
      pairs.push({
        name: words[0].text,
        value: words
          .slice(1)
          .map((w) => w.text)
          .join(' '),
        offset: words[0].start,
      });
    } else {
      for (const word of words) {
        const eq = word.text.indexOf('=');
        if (eq <= 0) continue;
        pairs.push({
          name: word.text.slice(0, eq),
          value: word.text.slice(eq + 1),
          offset: word.start,
        });
      }
    }

    for (const pair of pairs) {
      if (!SECRET_NAME_RE.test(pair.name)) continue;
      if (unquote(pair.value) === '') continue;
      ctx.add({
        id: 'DF009',
        severity: 'warning',
        title:
          instr.keyword === 'ENV'
            ? `ENV “${pair.name}” looks like a secret, and its value is baked into the image.`
            : `ARG “${pair.name}” looks like a secret, and its default value is baked into the image.`,
        detail:
          'Every ENV and ARG value is stored in the image history, where anyone who can pull the image can read it with docker history. Overwriting or unsetting it in a later layer does not remove it.',
        line: instr.argShell.lineAt[pair.offset] ?? instr.line,
        remediation:
          'Pass it at run time (`docker run -e NAME=…`) or mount it at build time with `RUN --mount=type=secret`, which never enters a layer.',
      });
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  DF010 — root in the final stage.
 * ────────────────────────────────────────────────────────────────────────── */

function df010(ctx: RuleContext): void {
  const stage: Stage | undefined = ctx.parsed.stages[ctx.parsed.stages.length - 1];
  if (!stage) return;

  const users = stage.instructions.filter(
    (i) => i.keyword === 'USER' && !i.onbuild && i.argText.trim() !== '',
  );

  if (users.length === 0) {
    ctx.add({
      id: 'DF010',
      severity: 'warning',
      title: 'The final stage never sets USER, so the container runs as root.',
      detail:
        'Without a USER instruction the process runs as uid 0 inside the container. A writable bind mount, a container escape or one compromised dependency then acts as root.',
      line: stage.line,
      remediation:
        'Create an unprivileged user and switch to it before CMD, e.g. `USER node`, or `RUN adduser --system app` then `USER app`.',
    });
    return;
  }

  const last = users[users.length - 1];
  const account = unquote(last.argText.trim()).split(':')[0];
  if (account !== 'root' && account !== '0') return;
  ctx.add({
    id: 'DF010',
    severity: 'warning',
    title: 'The final stage switches back to USER root.',
    detail:
      'The LAST USER in a stage is the one the container runs as, so this undoes any earlier switch to an unprivileged account.',
    line: last.line,
    remediation:
      'Move the root-only steps above the final `USER`, or switch back to the unprivileged account after them.',
  });
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  DF011 / DF012 / DF015 — shell scanning inside RUN.
 * ────────────────────────────────────────────────────────────────────────── */

function df011(ctx: RuleContext): void {
  for (const instr of runsOf(ctx.parsed)) {
    const hit = ctx.shellOf(instr).find((s) => /^cd(?:\s|$)/.test(masked(s)));
    if (!hit) continue;
    ctx.add({
      id: 'DF011',
      severity: 'warning',
      title: 'cd inside RUN only lasts for that RUN.',
      detail:
        "Each RUN starts in the stage's WORKDIR, so a directory change here is invisible to the next instruction — a common cause of \"no such file or directory\" on the COPY or CMD that follows.",
      line: hit.line,
      remediation: 'Set `WORKDIR /path` instead; it applies to every later instruction in the stage.',
    });
  }
}

/**
 * `curl … | bash` / `wget … | sh` (and `| sudo bash`, `|sh`, …).
 *
 * COPIED VERBATIM, with credit, from `src/lib/gha-validator/engine.ts`
 * (`PIPE_TO_SHELL_RE`, around line 246), where it is module-private and
 * deliberately not exported. The same pattern is the right detector here, and
 * duplicating it keeps both tools' rules independent of each other's internals.
 */
const PIPE_TO_SHELL_RE = /(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z|k|da)?sh\b/i;

/**
 * How much text before a pipe DF012 examines. `[^\n|]*` in the regex above
 * cannot cross a pipe, so a match always lives in the window between two pipes
 * — but a single 200 KB "segment" full of the word `curl` would still make the
 * scan quadratic. One kilobyte is far more than any real `curl … | sh` needs,
 * and the cap is stated in the page's own limits note rather than hidden here.
 */
const PIPE_WINDOW = 1_000;

function df012(ctx: RuleContext): void {
  for (const instr of runsOf(ctx.parsed)) {
    const texts = ctx.shellTextsOf(instr);
    for (const shell of texts) {
      const segments = segmentShell(shell);
      for (let i = 1; i < segments.length; i += 1) {
        if (segments[i].sepBefore !== '|') continue;
        const prev = segments[i - 1];
        const left = prev.text.length > PIPE_WINDOW ? prev.text.slice(-PIPE_WINDOW) : prev.text;
        if (!/curl|wget/i.test(left)) continue;
        const probe = `${left}|${segments[i].text.slice(0, 60)}`;
        if (!PIPE_TO_SHELL_RE.test(probe)) continue;
        // Attribute the finding to the line the DOWNLOAD is written on, which is
        // not necessarily the line carrying the pipe.
        const inLeft = /curl|wget/i.exec(left);
        const absolute = prev.start + (prev.text.length - left.length) + (inLeft?.index ?? 0);
        ctx.add({
          id: 'DF012',
          severity: 'warning',
          title: 'Piping a download straight into a shell.',
          detail:
            'curl … | sh runs whatever the server returns, with no signature and no checksum. A hijacked domain, a compromised CDN or a man-in-the-middle then executes arbitrary code inside your build.',
          line: shell.lineAt[absolute] ?? prev.line,
          remediation:
            'Download to a file, verify a checksum or signature, then run it — or install the package from your distribution instead.',
        });
      }
    }
  }
}

function df015(ctx: RuleContext): void {
  for (const instr of runsOf(ctx.parsed)) {
    const hit = ctx.shellOf(instr).find((s) => /(?:^|\s)sudo(?:\s|$)/.test(masked(s)));
    if (!hit) continue;
    ctx.add({
      id: 'DF015',
      severity: 'warning',
      title: 'sudo in a RUN has nothing to escalate from.',
      detail:
        "A build step already runs as the stage's USER — root unless you changed it — with no TTY, and most base images do not ship sudo at all. The command either fails or behaves differently than it does on a workstation.",
      line: hit.line,
      remediation:
        'Drop `sudo`. If a step genuinely needs root, switch with `USER root`, run it, and switch back.',
    });
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  DF013 — superseded CMD / ENTRYPOINT.
 * ────────────────────────────────────────────────────────────────────────── */

function df013(ctx: RuleContext): void {
  for (const stage of ctx.parsed.stages) {
    for (const keyword of ['CMD', 'ENTRYPOINT'] as const) {
      const hits = stage.instructions.filter((i) => i.keyword === keyword && !i.onbuild);
      if (hits.length < 2) continue;
      const winner = hits[hits.length - 1];
      const ignored = hits.slice(0, -1).map((i) => i.line);
      ctx.add({
        id: 'DF013',
        severity: 'warning',
        title: `Stage has ${hits.length} ${keyword} instructions — only the last one runs.`,
        detail: `Docker keeps the last ${keyword} in a stage and silently discards the earlier ones (${
          ignored.length === 1 ? `line ${ignored[0]}` : `lines ${ignored.join(', ')}`
        }).`,
        line: winner.line,
        remediation: `Delete the ${keyword} you do not want, or move it into the stage it belongs to.`,
      });
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  DF014 — JSON that is not JSON.
 * ────────────────────────────────────────────────────────────────────────── */

function df014(ctx: RuleContext): void {
  for (const instr of ctx.parsed.instructions) {
    if (!instr.brokenJson || !EXEC_FORM_KEYWORDS.has(instr.keyword)) continue;
    ctx.add({
      id: 'DF014',
      severity: 'error',
      title: `${instr.keyword} looks like a JSON array but is not valid JSON.`,
      detail:
        'Docker only treats the argument as an exec-form array when it parses as JSON — and JSON requires double quotes around every string. This one does not parse, so Docker silently runs it as shell form via /bin/sh -c, with the brackets and quotes as part of the command.',
      line: instr.line,
      remediation: 'Use double quotes: `CMD ["nginx", "-g", "daemon off;"]`.',
    });
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  DF016 — MAINTAINER.
 * ────────────────────────────────────────────────────────────────────────── */

function df016(ctx: RuleContext): void {
  for (const instr of ctx.parsed.instructions) {
    if (instr.keyword !== 'MAINTAINER') continue;
    ctx.add({
      id: 'DF016',
      severity: 'info',
      title: 'MAINTAINER is deprecated.',
      detail:
        'MAINTAINER was deprecated in Docker 1.13 (2017). It still builds, but no tooling reads it, and it carries none of the OCI metadata that registries and scanners display.',
      line: instr.line,
      remediation:
        'Use a label instead: `LABEL org.opencontainers.image.authors="you@example.com"`.',
    });
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  DF017 — layer-cache order.
 * ────────────────────────────────────────────────────────────────────────── */

const DEP_INSTALL_RE =
  /\b(?:npm\s+(?:ci|install|i)\b|yarn\s+install\b|yarn\s*$|pnpm\s+(?:install|i)\b|pip3?\s+install\b[^\n]*\s-r\b|bundle\s+install\b|composer\s+install\b|go\s+mod\s+download\b|cargo\s+build\b)/;

function copiesWholeContext(instr: Instruction): boolean {
  if (instr.keyword !== 'COPY' || instr.onbuild) return false;
  const words = argWords(instr).filter((w) => w.length > 0);
  if (words.length < 2) return false;
  return words.slice(0, -1).some((w) => w === '.' || w === './');
}

function isDependencyInstall(ctx: RuleContext, instr: Instruction): boolean {
  if (instr.keyword !== 'RUN' || instr.onbuild) return false;
  return ctx.shellOf(instr).some((s) => DEP_INSTALL_RE.test(masked(s)));
}

function df017(ctx: RuleContext): void {
  for (const stage of ctx.parsed.stages) {
    const copyAll = stage.instructions.find(copiesWholeContext);
    if (!copyAll) continue;
    const install = stage.instructions.find(
      (i) => i.line > copyAll.line && isDependencyInstall(ctx, i),
    );
    if (!install) continue;
    ctx.add({
      id: 'DF017',
      severity: 'info',
      title: `COPY . copies the whole build context before the dependency install on line ${install.line}.`,
      detail:
        'Copy the dependency manifest first, install, then copy the rest — a source-only change currently reinstalls every dependency.',
      line: copyAll.line,
      remediation:
        'Reorder to `COPY package*.json ./` → `RUN npm ci` → `COPY . .` (same shape for pip, bundler, composer or go), and add a `.dockerignore` so node_modules, .git and build output never enter the context at all.',
    });
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  The catalog. Seventeen entries, in id order — which is also the order the
 *  total-findings cap drops from, so the least important rules lose first.
 * ────────────────────────────────────────────────────────────────────────── */

export interface Rule {
  id: RuleId;
  run: (ctx: RuleContext) => void;
}

export const RULES: readonly Rule[] = [
  { id: 'DF001', run: df001 },
  { id: 'DF002', run: df002 },
  { id: 'DF003', run: df003 },
  { id: 'DF004', run: df004 },
  { id: 'DF005', run: df005 },
  { id: 'DF006', run: df006 },
  { id: 'DF007', run: df007 },
  { id: 'DF008', run: df008 },
  { id: 'DF009', run: df009 },
  { id: 'DF010', run: df010 },
  { id: 'DF011', run: df011 },
  { id: 'DF012', run: df012 },
  { id: 'DF013', run: df013 },
  { id: 'DF014', run: df014 },
  { id: 'DF015', run: df015 },
  { id: 'DF016', run: df016 },
  { id: 'DF017', run: df017 },
];
