/**
 * Fixtures for the five security + encoding tools that shipped BEFORE the
 * playground UX contract and were never added to the E2E matrix:
 * jwt-decoder, hash-generator, cve-ignore-converter, base64-encoder-decoder,
 * timestamp-converter.
 *
 * One module per batch, composed by ../tools.fixtures.ts. Field rules live in
 * that file's doc comment — read it first.
 *
 * ── VERIFICATION STATUS ─────────────────────────────────────────────────────
 *
 * RUN, against a prebuilt `dist/` served by `astro preview`: 28 passed /
 * 38 failed (66 tests). Every data value in the table below survived that run:
 * all five `seededResultString`s render, all five `calmErrorString`s are
 * byte-exact against their engine source, all three `hashKey`s behave as
 * declared, and every `family`/`inputSelector`/`resultsSelector` resolves. NOT
 * ONE VALUE WAS CHANGED TO MAKE A JOURNEY GO GREEN.
 *
 * An earlier revision of this header claimed the values had been "verified
 * against the built dist/ through the real journeys". They had not — the
 * authoring agents were killed before running a single journey. The claim is
 * now true, and the per-journey outcomes are recorded below so the next reader
 * does not have to re-derive them.
 *
 * The 38 failures are 30 tool defects, 7 structural limits and 1 harness race.
 * NONE of them is a wrong value here. Do not "fix" this table to dodge one.
 *
 * ── FOUR CONTRACT GAPS SHARED ACROSS THE BATCH ──────────────────────────────
 *
 *   1. NO EXAMPLE CHIPS (all five, so 10 failures — J3 chip-2 and J6 for every
 *      tool). Four drive examples from a `<select>` (`#hash-example`,
 *      `#b64-example`, `#cv-example`, `#ts-example`) — the exact affordance the
 *      contract replaced. jwt-decoder DOES ship chips but labels the group
 *      `aria-label="Example tokens"`; `SEL.chips` keys on `aria-label=
 *      "Examples"`, which is what the other 16 chip-bearing playgrounds use, so
 *      it resolves to zero elements on all five.
 *   2. NO CALM-ERROR HOLD. jwt-decoder is the only one with an `ERROR_HOLD_MS`
 *      and it is 400ms (contract: ~600ms) and wired to the ENCODE panel only.
 *      The decode panel and timestamp render the diagnostic straight after the
 *      debounce — J2 observed it at 459ms and 175ms after the last keystroke,
 *      both inside the 500ms calm window. cve-ignore-converter has no debounce
 *      at all (see its entry).
 *   3. NO `aria-invalid`, anywhere in the batch. b64 and ts flag an error with a
 *      CSS class (`b64-input--error`, `ts-input--error`); jwt, hash and cve flag
 *      the input with nothing at all. `errorSignals().ariaInvalid` is therefore
 *      never true and J2's closing assertion cannot pass even once the
 *      diagnostic is up.
 *   4. NO `data-copy-all`, except on jwt-decoder — which is why J1 fails on the
 *      other four. Likewise the hint line ("Results update as you type — press
 *      Enter to run now.") exists only on jwt-decoder, which is why J8 fails on
 *      the other four.
 *
 * `hashKey` is `null` on three of these five and that is CORRECT, not a gap:
 * jwt-decoder, hash-generator and base64-encoder-decoder deliberately ship no
 * deep link because their input may be a live credential. All three say so on
 * screen ("No share links on this tool — inputs may be secrets.") and hand off
 * to each other through `src/lib/tool-state/handoff.ts` (sessionStorage) instead
 * of a fragment. J3 asserts they never write one, and all three pass that.
 */
import type { ToolFixture } from '../tools.fixtures';

export const SECURITY_ENCODING_FIXTURES: ToolFixture[] = [
  {
    // ── JWT Decoder & Encoder — the largest playground in the repo (~75 KB).
    // 9/13 green, the best in the batch.
    //
    // PASSES: J1 (both consent runs), J3 boot + junk hash, J4, J5 live regions
    // are fine except for the count noted below, J5 keyboard, J7 in full
    // (payload echoed AND escaped), J8.
    // FAILS: J2 (no decode-side hold, no aria-invalid), J3 chip 2 + J6 (chip
    // group aria-label), J5 live-region count (3, see below — journey limit).
    //
    // `family: 'textarea'` despite the size: the token field is a plain
    // `<textarea id="jwt-input">` and the component imports no CodeMirror at
    // all (verified: 0 hits for `@codemirror`), so the J5 Escape-releases-focus
    // branch correctly does not apply.
    //
    // `hashKey: null` — deliberate and permanent (secrets; see the header).
    //
    // `seededResultString` is the `name` member of the boot-seeded HS256
    // sample's payload, taken from the rendered PAYLOAD block. The engine
    // re-indents the segment's OWN JSON text (`json-source.ts`) rather than
    // re-serializing it, so the two-space form below is what actually paints.
    //
    // `invalidInput` is nine characters with no dot, so every prefix of it
    // ('n', 'no', 'not'…) is also a one-part token producing the SAME "found 1"
    // diagnostic — J2 therefore measures the hold rather than tripping over an
    // intermediate message. `calmErrorString` is the engine's own wording from
    // `src/lib/jwt-decoder/engine.ts`; the dash is U+2014 EM DASH and the
    // apostrophe in "doesn't" is ASCII U+0027 (the playground's error TITLE,
    // "Can't decode this token", uses U+2019 — do not confuse the two).
    // Confirmed reachable: J2 reported `{"diagnostic":true,…}` at 459ms.
    //
    // `xssPayload` is a structurally VALID compact JWS whose payload `sub` is
    // the markup (base64url) AND whose signature segment is the markup as
    // literal text. Two echo paths in one token: the PAYLOAD block prints the
    // decoded JSON and `signatureBlock()` prints `parts[2]` verbatim, both
    // through `escapeHtml`. The literal copy in the signature is not decoration
    // — J7 derives the tag name by regexing the payload STRING, which would
    // return null if the markup only existed inside base64. `decode()` never
    // validates the signature segment as base64url, so the token still parses.
    // J7 passes end to end on this token, escaping proof included.
    //
    // J5 LIVE-REGION COUNT IS A JOURNEY LIMIT, NOT A DEFECT. This is a
    // three-mode playground (decode / encode / generate keys) with one summary
    // per mode: `#jwt-summary`, `#jwt-enc-status`, `#jwt-keys-status`. Two of
    // the three sit inside panels carrying `hidden`, so at most one is ever in
    // the a11y tree — the contract's "sole live region" holds. J5's
    // `toHaveCount(1)` counts DOM matches regardless of visibility and sees 3.
    slug: 'jwt-decoder',
    family: 'textarea',
    hashKey: null,
    seededResultString: '"name": "John Doe"',
    invalidInput: 'not-a-jwt',
    calmErrorString:
      "This doesn't look like a JWT — expected 3 dot-separated parts (header.payload.signature), found 1.",
    xssPayload:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI8aW1nIHNyYz14IG9uZXJyb3I9YWxlcnQoMSk-IiwiaWF0IjoxNTE2MjM5MDIyfQ.<img src=x onerror=alert(1)>',
    inputSelector: '#jwt-input',
    resultsSelector: '#jwt-results',
  },
  {
    // ── Hash Generator. 6/13 green.
    //
    // PASSES: J3 (all three), J4, J5 live regions, J5 axe.
    // FAILS: J1 ×2 (no `data-copy-all`), J2 + J7 (structural, below), J3 chip 2
    // + J6 (`<select>` examples; J6 also finds 26px per-row copy buttons at
    // `(pointer: coarse)`, half the 44px floor — it never reaches that
    // assertion because the chip count trips first), J8 (no hint line).
    // J5 keyboard is FLAKY and the flake is a harness race, not a defect — see
    // the note at the bottom of this entry.
    //
    // `hashKey: null` — deliberate and permanent (the input may be a password
    // or a secret; the page says so, and the tool hands off to Base64 through
    // sessionStorage instead). J3 confirms no fragment is ever written.
    //
    // `seededResultString` is MD5("abc"), the boot-seeded first example and a
    // canonical test vector: 900150983cd24fb0d6963f7d28e17f72.
    //
    // TWO JOURNEYS ARE STRUCTURALLY UNMEETABLE HERE, and neither is a defect:
    //
    //   J2 — there is NO invalid input. `hash()` UTF-8-encodes whatever it is
    //   given and every byte string has digests (the empty string included —
    //   it is example 4 on purpose). The engine's single diagnostic, pinned
    //   below byte-for-byte from `src/lib/hash-generator/engine.ts`, fires only
    //   when `crypto.subtle` is missing (an insecure context), never from
    //   input. So `invalidInput` below is simply DIFFERENT text, chosen so J4's
    //   "move away from the saved state" step really changes all four digests.
    //   It is not expected to raise anything, and the run confirms it does not:
    //   J2 timed out with four fresh digests on screen.
    //
    //   J7 — the results container renders four hex digests, the word "Copy"
    //   and a "View as Base64 →" handoff chip. The input is never echoed, so
    //   there is no untrusted-text path to escape and no payload can reach the
    //   output. J7's security half passes; its echo precondition cannot be
    //   satisfied by any payload. This is XSS-immunity by construction.
    //
    // HARNESS RACE on J5 keyboard (observed 2 fails / 1 pass in three isolated
    // runs; it passed in the full-batch run). J5 presses Enter, which in this
    // textarea inserts a newline, then focuses a copy button. The newline
    // starts a 180ms debounce whose async Web-Crypto re-render replaces
    // `#hash-results` wholesale: measured at +207ms, after `focus()` has
    // already landed, so `document.activeElement` falls back to `<body>` and
    // `toBeFocused()` fails against a button that no longer exists. The tool is
    // behaving correctly.
    slug: 'hash-generator',
    family: 'textarea',
    hashKey: null,
    seededResultString: '900150983cd24fb0d6963f7d28e17f72',
    invalidInput: 'zzz-not-the-abc-vector',
    calmErrorString:
      'Could not compute hashes — the Web Crypto API is unavailable (this page must be served over HTTPS or localhost).',
    xssPayload: '<img src=x onerror=alert(1)>',
    inputSelector: '#hash-input',
    resultsSelector: '#hash-results',
  },
  {
    // ── CVE-Ignore Converter — the one `cm` fixture in this batch (17
    // `@codemirror` imports; its keymap does carry the Escape binding, so the
    // J5 Escape branch applies and passes). 4/14 green, the worst in the batch.
    //
    // PASSES: J3 boot, J5 live regions, J5 keyboard, J5 Escape.
    // FAILS: J1 ×2, J2, J3 chip 2, J3 junk hash, J4, J5 axe, J6, J7, J8.
    //
    // The island has TWO CodeMirror editors. `inputSelector` points at the
    // SOURCE one; the converted policy lands in the read-only output editor,
    // and `resultsSelector` is the NOTES panel `#cv-messages` — that is where
    // both the warnings and the error diagnostic render, so it is the container
    // J1/J2/J3 need. (`#cv-editor-output` holds the emitted YAML but never a
    // diagnostic.) Both confirmed by the run.
    //
    // The boot seed is example 1, "Trivy → Snyk": every entry lacks a path, so
    // Snyk's emitter defaults one and warns per entry. `seededResultString` is
    // the first of those three notes, verified against the rendered panel. The
    // quotes around * are U+201C/U+201D, from the engine's own template.
    //
    // THIS TOOL IS NOT A LIVE-EVAL PLAYGROUND. There is no `updateListener` on
    // the input editor and no debounce: conversion runs only from the Convert
    // button, ⌘/Ctrl+Enter, a snapshot restore, or boot. That single fact is
    // what fails J2 (typing never produces a diagnostic — the panel still held
    // the three seeded notes when the 4s timeout expired), J4 (`setInput`
    // leaves the seeded notes on screen), and J7 (`setInput` never re-renders
    // the panel, so the poll times out). It is a contract gap in the tool, not
    // a wrong value below.
    //
    // CORRECTION to an earlier revision of this comment, which listed "an
    // example/format change" among the things that convert. It is not: the
    // `#cv-example`, `#cv-from` and `#cv-to` change handlers all call
    // `resetOutput()`, which clears the output editor and renders the EMPTY
    // placeholder into `#cv-messages`. Driven directly: selecting example 2
    // leaves "Pick a source format, paste a suppression file…" on screen.
    //
    // `invalidInput` is a line that fails the engine's `ID_RE`, and
    // `calmErrorString` is the engine's byte-exact skip warning for it —
    // reachable, input-derived and specific, but only AFTER a Convert. Driven
    // directly with the Convert button, the panel renders exactly this string.
    // Note that the obvious-looking 'not-a-cve-id' would NOT work: it matches
    // `^[A-Za-z][A-Za-z0-9]*-[A-Za-z0-9][A-Za-z0-9-]*$` and parses as a valid
    // id. The quotes are again U+201C/U+201D.
    //
    // `xssPayload` is a single trivyignore line whose markup fails `ID_RE`
    // (spaces are not allowed in an id), so the parser quotes it straight back
    // into that same warning — the one place this tool renders untrusted text
    // in `#cv-messages`. Driven directly with the Convert button: the panel
    // shows `Skipped line 1: “<img src=x onerror=alert(1)>” is not a
    // recognized vulnerability ID.` with the markup escaped. So the payload is
    // right; only the missing live eval keeps J7 from proving it.
    //
    // `hashKey: '#s='` is right — `encodeState()` writes exactly that prefix,
    // a user-initiated convert `replaceState`s it (449 chars for the seeded
    // example), and reloading or opening the link in a fresh context rebuilds
    // the same notes. But J3's junk-hash step cannot pass: the `#s=` payload is
    // a base64url-encoded `{src,dst,text}` blob, not the raw input, so
    // `'#s=' + encodeURIComponent(invalidInput)` is an unparseable state that
    // `decodeState()` correctly discards, falling back to the seeded example.
    // The tool is behaving correctly; the harness assumes the fragment carries
    // raw tool input.
    slug: 'cve-ignore-converter',
    family: 'cm',
    hashKey: '#s=',
    seededResultString: 'Snyk requires a path; defaulted to “*” for CVE-2023-44487.',
    invalidInput: '!!bogus!!',
    calmErrorString: 'Skipped line 1: “!!bogus!!” is not a recognized vulnerability ID.',
    xssPayload: '<img src=x onerror=alert(1)>',
    inputSelector: '#cv-editor-input .cm-content',
    resultsSelector: '#cv-messages',
  },
  {
    // ── Base64 Encoder / Decoder. 5/13 green.
    //
    // PASSES: J3 (all three), J4, J5 live regions, J5 axe.
    // FAILS: J1 ×2 and J5 keyboard (no copy attribute at all — see below),
    // J2 + J7 (structural), J3 chip 2 + J6 (`<select>` examples), J8 (no hint).
    //
    // `hashKey: null` — deliberate and permanent (secrets; the page says so).
    //
    // The `#b64-copy` button carries NO `data-copy*` attribute of any kind, so
    // `SEL.copyRow` matches zero elements here — the only tool in the batch
    // where that is true. That is also why it never reports `result_copied`:
    // Layout.astro's listener keys on
    // `[data-copy],[data-copy-value],[data-copy-all],[data-copy-link]`.
    //
    // The boot seed is example 1, "Encode — hello world", so THE SEEDED
    // DIRECTION IS ENCODE, and both payloads below have to be read that way
    // (tools.fixtures.ts, trap 2). `seededResultString` is that encode's
    // output, the RFC 4648 vector for "hello world".
    //
    // ENCODE HAS NO INVALID INPUT: `convert(text, 'encode', …)` only fails on
    // the empty string (`ERR_EMPTY_ENCODE`), and empty is not an error state
    // here — it renders the idle placeholder. So, exactly as with
    // hash-generator, `invalidInput` is just text that changes the output
    // (which is all J4 needs of it), and `calmErrorString` is pinned
    // byte-for-byte from `src/lib/base64-codec/engine.ts` for documentation: it
    // is the diagnostic this input WOULD produce after flipping the toggle to
    // Decode, and a fixture cannot flip the toggle. J2 is unmeetable in the
    // seeded direction — the run confirms it, timing out with
    // `ISEhbm90IGJhc2U2NCEhIQ==` on screen.
    //
    // J7 is unmeetable for the same reason: in encode mode the results panel
    // contains base64, a byte count and a fixed handoff-chip label, so no
    // payload can be echoed as markup. Its security half passes; the echo
    // precondition cannot. XSS-immunity by construction, in this direction.
    slug: 'base64-encoder-decoder',
    family: 'textarea',
    hashKey: null,
    seededResultString: 'aGVsbG8gd29ybGQ=',
    invalidInput: '!!!not base64!!!',
    calmErrorString:
      'That is not valid base64 — it contains characters outside the base64 alphabet.',
    xssPayload: '<img src=x onerror=alert(1)>',
    inputSelector: '#b64-input',
    resultsSelector: '#b64-output',
  },
  {
    // ── Timestamp Converter. 4/13 green.
    //
    // PASSES: J3 (all three, including the junk-hash diagnostic), J4, J5 axe.
    // FAILS: J1 ×2 and J5 keyboard (no sr-only `role="status"` in the island,
    // so nothing ever announces "Copied"), J2 (error at 175ms, no
    // aria-invalid), J3 chip 2 + J6 (`<select>` examples; J6 would also find
    // 26px per-row copy buttons), J5 live regions (copy-status count 0),
    // J7 (structural), J8 (no hint line).
    //
    // `hashKey: '#t='` — `createHashState('t')`, written only on a valid
    // user-initiated eval, exactly as the contract prescribes. VERIFIED by
    // direct drive as well as by J3: boot leaves the hash empty, typing
    // `1700000000` writes `#t=1700000000`, and picking example 2 writes
    // `#t=1516239022000`. So the J3 chip-2 round trip would pass as soon as the
    // `<select>` becomes a chip group — the deep link itself is not the
    // problem.
    //
    // `seededResultString` is the ISO-8601 UTC row of the boot-seeded first
    // example (1516239022). Chosen over the LOCAL / RELATIVE rows on purpose:
    // those depend on the runner's timezone and on wall-clock drift ("8 years
    // ago"), and over the raw epoch because the epoch is also the input.
    //
    // `invalidInput` parses as neither an epoch nor a date, and every prefix of
    // it ('n', 'no', 'not', 'not-'…) is equally unparseable with the SAME
    // diagnostic, so J2 measures the hold rather than an intermediate message.
    // `calmErrorString` is `ERR_PARSE` from
    // `src/lib/timestamp-converter/engine.ts`, byte for byte. J3's junk-hash
    // test renders it from the fragment, which is independent proof.
    //
    // Per-row copy buttons use `data-copy-value`, not `data-copy`. Layout.astro
    // accepts both for analytics, but `SEL.copyRow` — the repo-wide convention
    // taken from the two reference playgrounds — only matches `[data-copy]`, so
    // the rows are invisible to J1/J5/J6. The two controls that DO match are
    // `#ts-share` and `#ts-md`, which are header buttons and should be carrying
    // `data-copy-link` instead.
    //
    // J7 is unmeetable: every rendered row is a value the engine DERIVED from
    // the instant, and the error path prints a fixed sentence, so the input is
    // never echoed and there is no untrusted-text path to escape. The run
    // confirms it — the payload rendered "Could not read that timestamp" and
    // nothing else. XSS-immunity by construction.
    slug: 'timestamp-converter',
    family: 'textarea',
    hashKey: '#t=',
    seededResultString: '2018-01-18T01:30:22.000Z',
    invalidInput: 'not-a-timestamp',
    calmErrorString: 'Could not read that as a Unix timestamp or a date string.',
    xssPayload: '<img src=x onerror=alert(1)>',
    inputSelector: '#ts-input',
    resultsSelector: '#ts-results',
  },
];
