/**
 * Fixtures for the five security + encoding tools that shipped BEFORE the
 * playground UX contract and were never added to the E2E matrix:
 * jwt-decoder, hash-generator, cve-ignore-converter, base64-encoder-decoder,
 * timestamp-converter.
 *
 * One module per batch, composed by ../tools.fixtures.ts. Field rules live in
 * that file's doc comment — read it first.
 *
 * ── READ THIS BEFORE "FIXING" A FAILING JOURNEY ─────────────────────────────
 *
 * Unlike the ten rollout tools, these five predate the contract, so several
 * journeys fail against them for reasons that are IN THE TOOLS, not in this
 * table. Every value below was verified against the built `dist/` through the
 * real journeys; none was chosen to make a journey go green. The known gaps,
 * per tool, are recorded in the comments on each entry. Do not weaken a journey
 * and do not invent a diagnostic to paper one over — fix the playground.
 *
 * Three gaps are shared by all five and are stated once here rather than five
 * times below:
 *
 *   1. NO EXAMPLE CHIPS. Four of the five drive examples from a `<select>`
 *      (`#hash-example`, `#b64-example`, `#cv-example`, `#ts-example`) — the
 *      exact affordance the contract replaced. jwt-decoder DOES use chips but
 *      labels the group `aria-label="Example tokens"`, and `SEL.chips` keys on
 *      the repo-wide `aria-label="Examples"`. So `SEL.chips` resolves to zero
 *      elements on all five, which is what fails J3's chip test, J6's
 *      `chipsMeasured > 0`, and J8's locale chip click.
 *   2. NO CALM-ERROR HOLD. Only jwt-decoder implements `ERROR_HOLD_MS`, and
 *      only on its ENCODE panel; the decode panel (and base64 / timestamp)
 *      renders the diagnostic straight after the debounce — 220ms, 140ms and
 *      140ms respectively, all inside J2's 500ms calm window.
 *   3. NO `aria-invalid`. All five flag an error with a CSS class
 *      (`b64-input--error`, `ts-input--error`) or with nothing at all, so
 *      `errorSignals().ariaInvalid` is never true and J2's closing assertion
 *      cannot pass even once the diagnostic is up.
 *
 * `hashKey` is `null` on three of these five and that is CORRECT, not a gap:
 * jwt-decoder, hash-generator and base64-encoder-decoder deliberately ship no
 * deep link because their input may be a live credential. All three say so on
 * screen ("No share links on this tool — inputs may be secrets.") and hand off
 * to each other through `src/lib/tool-state/handoff.ts` (sessionStorage) instead
 * of a fragment. J3 asserts they never write one.
 */
import type { ToolFixture } from '../tools.fixtures';

export const SECURITY_ENCODING_FIXTURES: ToolFixture[] = [
  {
    // ── JWT Decoder & Encoder — the largest playground in the repo (~75 KB).
    //
    // `family: 'textarea'` despite the size: the token field is a plain
    // `<textarea id="jwt-input">` and the component imports no CodeMirror at
    // all (0 hits for `@codemirror`), so the J5 Escape-releases-focus branch
    // correctly does not apply.
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
    //
    // `xssPayload` is a structurally VALID compact JWS whose payload `sub` is
    // the markup (base64url) AND whose signature segment is the markup as
    // literal text. Two echo paths in one token: the PAYLOAD block prints the
    // decoded JSON and `signatureBlock()` prints `parts[2]` verbatim, both
    // through `escapeHtml`. The literal copy in the signature is not decoration
    // — J7 derives the tag name by regexing the payload STRING, which would
    // return null if the markup only existed inside base64. `decode()` never
    // validates the signature segment as base64url, so the token still parses.
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
    // ── Hash Generator.
    //
    // `hashKey: null` — deliberate and permanent (the input may be a password
    // or a secret; the page says so, and the tool hands off to Base64 through
    // sessionStorage instead).
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
    //   It is not expected to raise anything.
    //
    //   J7 — the results container renders four hex digests and nothing else.
    //   The input is never echoed anywhere, so there is no untrusted-text path
    //   to escape and no payload can reach the output. J7's security half
    //   passes; its echo precondition cannot be satisfied by any payload.
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
    // J5 Escape branch applies and passes).
    //
    // The island has TWO CodeMirror editors. `inputSelector` points at the
    // SOURCE one; the converted policy lands in the read-only output editor,
    // and `resultsSelector` is the NOTES panel `#cv-messages` — that is where
    // both the warnings and the error diagnostic render, so it is the container
    // J1/J2/J3 need. (`#cv-editor-output` holds the emitted YAML but never a
    // diagnostic.)
    //
    // The boot seed is example 1, "Trivy → Snyk": every entry lacks a path, so
    // Snyk's emitter defaults one and warns per entry. `seededResultString` is
    // the first of those three notes, verified against the rendered panel. The
    // quotes around * are U+201C/U+201D, from the engine's own template.
    //
    // THIS TOOL IS NOT A LIVE-EVAL PLAYGROUND. There is no `updateListener` on
    // the input editor: conversion runs only from the Convert button, ⌘/Ctrl+
    // Enter, an example/format change, or a snapshot restore. That single fact
    // is what fails J2 (typing never produces a diagnostic), J4 (`setInput`
    // leaves the seeded notes on screen), and J7 (`setInput` never re-renders
    // the panel, so the poll times out). It is a contract gap in the tool, not
    // a wrong value below.
    //
    // `invalidInput` is a line that fails the engine's `ID_RE`, and
    // `calmErrorString` is the engine's byte-exact skip warning for it —
    // reachable, input-derived and specific, but only AFTER a Convert. Note
    // that the obvious-looking 'not-a-cve-id' would NOT work: it matches
    // `^[A-Za-z][A-Za-z0-9]*-[A-Za-z0-9][A-Za-z0-9-]*$` and parses as a valid
    // id. The quotes are again U+201C/U+201D.
    //
    // `xssPayload` is a single trivyignore line whose markup fails `ID_RE`
    // (spaces are not allowed in an id), so the parser quotes it straight back
    // into that same warning — the one place this tool renders untrusted text
    // in `#cv-messages`.
    //
    // `hashKey: '#s='` is right (`encodeState()` writes exactly that prefix and
    // a user-initiated convert `replaceState`s it), but J3's junk-hash step
    // cannot pass: the `#s=` payload is a base64url-encoded `{src,dst,text}`
    // blob, not the raw input, so `'#s=' + encodeURIComponent(invalidInput)` is
    // an unparseable state that `decodeState()` correctly discards, falling
    // back to the seeded example. The tool is behaving correctly; the harness
    // assumes the fragment carries raw tool input.
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
    // ── Base64 Encoder / Decoder.
    //
    // `hashKey: null` — deliberate and permanent (secrets; the page says so).
    //
    // The boot seed is example 1, "Encode — hello world", so THE SEEDED
    // DIRECTION IS ENCODE, and both payloads below have to be read that way
    // (tools.fixtures.ts, trap 2). `seededResultString` is that encode's
    // output, the RFC 4648 vector for "hello world".
    //
    // ENCODE HAS NO INVALID INPUT: `convert(text, 'encode', …)` only fails on
    // the empty string, and empty is not an error state here — it renders the
    // idle placeholder. So, exactly as with hash-generator, `invalidInput` is
    // just text that changes the output (which is all J4 needs of it), and
    // `calmErrorString` is pinned byte-for-byte from
    // `src/lib/base64-codec/engine.ts` for documentation: it is the diagnostic
    // this input WOULD produce after flipping the toggle to Decode, and a
    // fixture cannot flip the toggle. J2 is unmeetable in the seeded direction.
    //
    // J7 is unmeetable for the same reason: in encode mode the results panel
    // contains base64 and a byte count, so no payload can be echoed as markup.
    // Its security half passes; the echo precondition cannot.
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
    // ── Timestamp Converter.
    //
    // `hashKey: '#t='` — `createHashState('t')`, written only on a valid
    // user-initiated eval, exactly as the contract prescribes. The full J3
    // hash round trip (write → reload → same results) is the one deep-link
    // behaviour in this batch that is genuinely exercised.
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
    // `src/lib/timestamp-converter/engine.ts`, byte for byte.
    //
    // J7 is unmeetable: every rendered row is a value the engine DERIVED from
    // the instant, and the error path prints a fixed sentence, so the input is
    // never echoed and there is no untrusted-text path to escape.
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
