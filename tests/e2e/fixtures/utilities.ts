/**
 * Fixtures for the four pre-existing utility tools that never got E2E coverage:
 * uuid-ulid-generator, case-converter, slugify, chmod-calculator.
 *
 * One module per batch, composed by ../tools.fixtures.ts. Field rules live in
 * that file's doc comment — read it first.
 *
 * ── WHAT IS DIFFERENT ABOUT THIS BATCH ──────────────────────────────────────
 *
 * The ten tools in `rollout-tools.ts` were BUILT against the journey matrix.
 * These four predate it, and three structural facts about them are load-bearing
 * for anyone reading a red run here. None of them is fixable in this file:
 *
 *   1. NO SNAPSHOT ROW. None of the four imports `src/lib/tool-state/wire.ts`
 *      (35 other playgrounds do; `grep -l snap-save src/components` proves it).
 *      There is no `[id$="-snap-save"]`, so J4's very first assertion
 *      ("every tool wires wireSnapshotUI") fails on all four. That is a real,
 *      honest gap — J4 has nothing to drive — not a selector mistake here.
 *
 *   2. NO ~600ms CALM-ERROR HOLD. Only CaseConverterPlayground defines an
 *      `ERROR_HOLD_MS`. Slugify, chmod and the UUID inspect field render their
 *      diagnostic straight out of the 140ms debounce, so J2's 500ms calm window
 *      is violated at ~140ms. And of the four, only chmod + the UUID inspect
 *      field ever set `aria-invalid` at all, so J2's closing
 *      `settled.ariaInvalid` assertion fails on case-converter and slugify even
 *      though their hold behaviour is otherwise right.
 *
 *   3. CLOSED OUTPUT ALPHABET ⇒ J7 CANNOT PROVE ESCAPING. Every one of the four
 *      emits only characters it generates itself — recombined `\p{L}\p{N}`
 *      tokens (case-converter), `[a-z0-9]` + the separator (slugify), `[0-7]` /
 *      `rwxst-` (chmod), hex / Crockford base32 (uuid). No `<`, `>`, `&` or `"`
 *      can reach a result row by construction, and every error card renders a
 *      STATIC message that does not quote the input. So J7's security assertions
 *      pass, and then its precondition ("this tool did not echo … so nothing
 *      about escaping was proven") fails — correctly. The `xssPayload`s below are
 *      the strongest available probes, chosen so the payload is at least VALID in
 *      the tool's grammar where a valid form exists; they are documented per
 *      entry rather than faked into something that would echo.
 */
import type { ToolFixture } from '../tools.fixtures';

export const UTILITIES_FIXTURES: ToolFixture[] = [
  {
    // ── UUID / ULID Generator ────────────────────────────────────────────────
    //
    // A GENERATOR, and the fixture shape (one input → one results container)
    // does not fit it cleanly. The island has TWO independent panels:
    //   - the generate panel (`#uug-results`), driven by the mode segment /
    //     count / Generate button — no text input at all, and boot-seeded;
    //   - the inspect panel (`#uug-inspect-result`), driven by the one text
    //     field (`#uug-inspect`), which starts EMPTY on boot.
    // `resultsSelector` therefore points at the generate panel (the only
    // boot-seeded output, which J1/J3/J6/J8 all need) while `inputSelector`
    // points at the inspect field (the only typeable surface, which J2/J5 need).
    // Those two are not wired to each other, which is exactly why J2 and J7
    // cannot pass — see the report, not this file, for the verdict.
    //
    // `seededResultString` is `-4`: the boot seed is mode v4 / count 5, so the
    // five rows are cryptographically random and NOTHING about them is fixed
    // except the canonical shape `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`. The
    // version nibble is pinned to `4` by RFC 4122 and by the engine
    // (`bytes[6] = (bytes[6] & 0x0f) | 0x40`), and it is the only nibble that
    // is — the variant nibble is one of 8/9/a/b. So `-4` is the one stable,
    // meaningful substring the generate panel can be relied on to render. It is
    // scoped to `#uug-results`, so no page-shell label can satisfy it.
    //
    // `hashKey: null` is a statement of fact, not a size-cap decision like
    // tools 5/7/10: the playground READS `#mode=&n=&uc=` on boot (`readHash`)
    // but never calls `history.replaceState`, so `location.hash` is never
    // written. Unlike the other null-hash tools it still ships a
    // `data-copy-link` button — the share URL carries the CONTROL state, which
    // is the only reproducible thing about a random generator.
    //
    // `calmErrorString` is the engine's `INSPECT_ERROR`, byte-for-byte from
    // `src/lib/uuid-ulid-generator/engine.ts`. NOT pinned by a vitest vector —
    // `engine.test.ts` only asserts `typeof r.error === 'string'`.
    slug: 'uuid-ulid-generator',
    family: 'textarea',
    hashKey: null,
    seededResultString: '-4',
    invalidInput: 'not-a-uuid',
    calmErrorString:
      'Not a UUID (expected 32 hex digits in 8-4-4-4-12 form) or a 26-character ULID.',
    // The inspect panel's VALID branch is the only place this tool echoes input
    // (`escapeHtml(value)` into `.uug-kv-title__net`), and reaching it requires a
    // real UUID/ULID — a closed alphabet that cannot carry markup. So this probe
    // lands on the invalid branch, whose message is static. Kept as a UUID with
    // the markup appended so it is the closest thing to "valid grammar" here.
    xssPayload: 'f47ac10b-58cc-4372-a567-0e02b2c3d479<img src=x onerror=alert(1)>',
    inputSelector: '#uug-inspect',
    resultsSelector: '#uug-results',
  },
  {
    // ── Case Converter ───────────────────────────────────────────────────────
    //
    // Boot seeds example 1 (`userProfileID`). The engine NORMALIZES acronyms, so
    // the tokens are [user, profile, id] and the snake_case row is
    // `user_profile_id` — a row VALUE, not one of the static row labels
    // (`snake_case` is a label the empty state also renders).
    //
    // `invalidInput` is `-_./`: four separator characters, so `tokenize()`
    // returns no tokens and `convertCases` reports `{ valid:false }`. Pinned as
    // a case by `engine.test.ts` (`expect(convertCases('-_./').valid).toBe(false)`)
    // though the MESSAGE itself is not pinned there — `calmErrorString` is copied
    // byte-for-byte out of `engine.ts`. Chosen so every prefix (`-`, `-_`, `-_.`)
    // is ALSO token-less with the SAME diagnostic, which is what makes J2's calm
    // window a measurement rather than an accident. It also stays non-empty after
    // `trim()`, so the playground routes it through `evaluate('type')` (the held
    // error path) instead of short-circuiting to its empty state.
    //
    // `xssPayload` is VALID input — the tokenizer happily splits it into
    // [img, src, x, onerror, alert, 1] and the engine returns `valid:true`. But
    // `<`, `>`, `=`, `(`, `)` are all word separators, so they are consumed and
    // never reach a row value: J7's escaping precondition is unsatisfiable for
    // this tool by construction. j7-xss.spec.ts's own header names
    // case-converter as the example of exactly this.
    slug: 'case-converter',
    family: 'textarea',
    hashKey: '#q=',
    seededResultString: 'user_profile_id',
    invalidInput: '-_./',
    calmErrorString: 'Enter some text to convert, e.g. "userProfileID".',
    xssPayload: '<img src=x onerror=alert(1)>',
    inputSelector: '#cc-input',
    resultsSelector: '#cc-results',
  },
  {
    // ── Slugify ──────────────────────────────────────────────────────────────
    //
    // Boot seeds example 1 (`Blog post: Héllo Wörld!`) with the default options
    // (sep `-`, max 60, lowercase on) → `blog-post-hello-world`.
    //
    // `hashKey: '#q='` — the playground writes a MULTI-parameter fragment
    // (`#q=…&sep=-&max=60&lc=1`, its own `buildHash`, not `hash-state.ts`), and
    // `q` is first, so the `'#q='` prefix J3 looks for is what actually appears.
    //
    // `invalidInput`/`calmErrorString` are the honest best available, and both
    // deserve the caveat: the slugify ENGINE's only `{ valid:false }` paths are a
    // non-`-_.` separator (unreachable — the UI is a three-button segment that
    // falls back to `-`) and empty input (short-circuited by the playground to
    // its empty state). So this tool has NO reachable error diagnostic at all.
    // `+++` is the nearest thing: valid input from which nothing slug-worthy
    // survives, which the playground reports as the engine's own
    // "No slug characters" note (byte-for-byte from `engine.ts`; the dash is
    // U+2014). It renders in a `.slug-note`, NOT the `.slug-error` card, and sets
    // no `aria-invalid` — so J2 measures a state that is informational rather
    // than an error. That is a finding about the tool, not a fixture choice.
    //
    // `xssPayload` is a perfectly valid title; the engine slugs it to
    // `img-src-x-onerror-alert-1`. Every markup character is outside `[a-z0-9]`
    // and is replaced by the separator, so nothing to escape ever reaches the
    // output — J7's precondition cannot hold here either.
    slug: 'slugify',
    family: 'textarea',
    hashKey: '#q=',
    seededResultString: 'blog-post-hello-world',
    invalidInput: '+++',
    calmErrorString: 'No slug characters — the title has no letters or digits.',
    xssPayload: '<img src=x onerror=alert(1)>',
    inputSelector: '#slug-input',
    resultsSelector: '#slug-results',
  },
  {
    // ── chmod Calculator ─────────────────────────────────────────────────────
    //
    // Boot seeds example 1 (`755`) into the octal field. `seededResultString` is
    // the Command row (`chmod 755 file`) — the engine's locked canonical command
    // form, and the one output row whose text cannot be confused with the octal
    // the user typed or with the reference tables elsewhere on the page.
    //
    // `inputSelector` is the OCTAL field, which is the one the boot seed and the
    // example chips drive; the symbolic field is a second, independent entry
    // point (`evalSymbolic`) with its own diagnostics. So `invalidInput` is
    // octal-grammar-invalid, not symbolic-grammar-invalid.
    //
    // `calmErrorString` is `parseOctal`'s out-of-grammar message, byte-for-byte
    // from `engine.ts` — NOTE the dash in `0–7` is U+2013 EN DASH, not a hyphen,
    // and the vitest suite only asserts `typeof r.error === 'string'`, so nothing
    // pins this wording but this line.
    //
    // `invalidInput: '888'` cannot be made to satisfy J3's junk-hash branch, and
    // no other value can either: the boot reader's guard
    // (`/^#m=([0-7]{3,4})$/`) is the SAME grammar `parseOctal` enforces, so every
    // fragment the engine would reject is a fragment the reader silently
    // discards in favour of the seeded example. There is no input that is
    // accepted by the fragment reader and rejected by the engine. Reported, not
    // worked around.
    //
    // `xssPayload` has no valid form here at all — the entire output alphabet is
    // `[0-7]`, `rwxsStT-`, `chmod` and `file`, all synthesized by the engine, and
    // `renderError` prints a static message that never quotes the input. This is
    // the invalid-branch probe; J7's precondition is unsatisfiable.
    slug: 'chmod-calculator',
    family: 'textarea',
    hashKey: '#m=',
    seededResultString: 'chmod 755 file',
    invalidInput: '888',
    calmErrorString: 'Octal mode must be 3 or 4 digits, each 0–7 (e.g. 755 or 4755).',
    xssPayload: '755<img src=x onerror=alert(1)>',
    inputSelector: '#chmod-octal',
    resultsSelector: '#chmod-results',
  },
];
