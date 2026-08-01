/**
 * Fixtures for the six PRE-EXISTING networking tools that share `src/lib/ip-core.ts`.
 *
 * These six shipped long before the journey suite existed, so unlike the ten
 * rollout tools they were never built against the UX contract as a checklist.
 * Bringing them into the matrix is a MEASUREMENT, not a conformance claim: three
 * of them (mac-address-formatter, reverse-dns-ptr, subnet-splitter) predate the
 * playground UX contract entirely and fail several journeys for real, structural
 * reasons that are recorded per-entry below. Do not "fix" the fixtures to make
 * those green — the failures are the finding.
 *
 * One module per batch, composed by ../tools.fixtures.ts. Field rules live in
 * ../tools.fixtures.ts — read that doc comment first.
 *
 * ── VERIFIED 2026-08-01 (the run these fixtures were authored blind against) ──
 *
 * 78 journeys (6 tools × 13). 43 pass, 35 fail. NOT ONE failure was a fixture
 * bug: every `slug`, `family`, `hashKey`, `seededResultString`, `invalidInput`,
 * `calmErrorString`, `inputSelector` and `resultsSelector` below survived
 * contact with a real run unchanged. The 35 failures split into contract
 * violations in four playgrounds that predate the contract, plus three
 * structural limits the journey shape cannot express. Per-tool tallies:
 *
 *   subnet-calculator      13/13  ✅ clean sweep
 *   cidr-checker           12/13  J2 only (no calm-error hold, no aria-invalid)
 *   ip-address-converter    7/13  J1×2 J2 J3 J6 J8
 *   mac-address-formatter   4/13  J1×2 J2 J3 J5×2 J6 J7 J8
 *   reverse-dns-ptr         4/13  J1×2 J2 J3 J5×2 J6 J7 J8
 *   subnet-splitter         3/13  J1×2 J2 J3 J4 J5×2 J6 J7 J8
 *
 * THE HEADLINE FINDING — the calm-error hold exists in exactly one of six.
 * `ERROR_HOLD_MS` appears only in SubnetCalculatorPlayground.astro (line 674).
 * The other five render the diagnostic the instant their debounce fires, so J2
 * measured the error surfacing at 394ms (cidr-checker, 220ms debounce), 259ms
 * (ip-converter, 140ms), 146ms (mac, 140ms), 166ms (ptr, 140ms) and 355ms
 * (splitter, 220ms) after the last keystroke — all inside the 500ms calm
 * window, all far short of the contract's ~600ms hold. Crucially J2 reported
 * `diagnostic: true` in every case, which is the run PROVING each
 * `calmErrorString` below is byte-exact: the string the tool rendered is the
 * string pinned here. The tools are wrong about WHEN, not about WHAT.
 *
 * Only ip-address-converter sets `aria-invalid` at all; cidr-checker, mac, ptr
 * and splitter leave it unset even after the diagnostic is on screen.
 *
 * ── What every entry here has in common ──────────────────────────────────────
 *
 * All six are `family: 'textarea'`: not one of them lazy-imports
 * `@codemirror/state` (the CM set is the 13 listed in CLAUDE.md, none of which is
 * a networking tool). So no entry participates in J5's Escape-releases-focus step.
 *
 * `calmErrorString` is taken byte-for-byte from each engine's vitest vectors
 * where the engine HAS per-input vectors (subnet-calculator, ip-address-converter,
 * cidr-checker all pin exact diagnostic strings). Three engines
 * (mac-formatter, ptr-helper, subnet-splitter) expose a single module-level
 * error CONSTANT instead of per-input diagnostics, so the pinned string is that
 * constant, copied from the engine source — there is no more specific string to
 * pin because the engine never produces one. That is itself a deviation from the
 * contract's "return *specific* diagnostics from the engine … not a generic
 * 'invalid'" bullet, and it is why those three `calmErrorString` values read the
 * same for every possible malformed input.
 */
import type { ToolFixture } from '../tools.fixtures';

/**
 * `192.168.1.` + markup, with `+` where a real payload would use spaces.
 *
 * Both dotted-decimal engines tokenize on whitespace BEFORE they parse octets
 * (subnet-calculator splits an "address netmask" pair on spaces, and
 * ip-converter's dotted branch is only reached for a single token), so a payload
 * containing a literal space is rejected by a shape check that quotes nothing —
 * and J7 would then prove nothing about escaping. A payload containing `/` is
 * just as bad for subnet-calculator: `lastIndexOf('/')` would split the markup
 * and only the fragment before the last slash would be echoed. `+` keeps the
 * whole payload inside one octet token, which is what both engines quote back
 * verbatim into `"…" is not a decimal octet (0–255).` — the one place either
 * tool renders untrusted text.
 */
const OCTET_XSS = '192.168.1.<img+src=x+onerror=alert(1)>';

export const NETWORKING_FIXTURES: ToolFixture[] = [
  {
    // Subnet / CIDR Calculator — the CONTRACT REFERENCE implementation, and the
    // only one of the six that implements the calm-error hold (its script pins
    // `DEBOUNCE_MS = 130`, `ERROR_HOLD_MS = 600`, which is where J2's timing
    // model came from in the first place).
    //
    // `seededResultString` is the Details group's "Address type" for the
    // boot-seeded first chip (192.168.1.0/24). Chosen non-mono on purpose: the
    // mono rows are rendered through `monoHtml()`, which injects `<wbr>` after
    // every `.` and `:`, so a dotted value is only contiguous in `textContent`
    // and not in a layout-aware read. "Private (RFC 1918)" has no separators to
    // break and vanishes wholesale when `renderError` replaces the card, which
    // is what J4's "restore undoes the change" step needs.
    //
    // `invalidInput` is pinned by `engine.test.ts` → "targeted diagnostics
    // (exact strings)". Note BOTH dashes: an em dash (U+2014) before "each" and
    // an en dash (U+2013) in "0–255". Also note that every PREFIX of it ends in
    // a digit or a dot, and the playground suppresses the error timer entirely
    // while the value ends in `[.:\s]` — so a slow keystroke burst degrades into
    // "no diagnostic yet" rather than into a DIFFERENT diagnostic, which is what
    // makes J2's calm window measurable here rather than accidental.
    //
    // VERIFIED: 13/13. The only tool in the batch that passes every journey.
    slug: 'subnet-calculator',
    family: 'textarea',
    hashKey: '#ip=',
    seededResultString: 'Private (RFC 1918)',
    invalidInput: '192.168.300.1/24',
    calmErrorString: 'Octet 300 is greater than 255 — each octet runs 0–255.',
    xssPayload: OCTET_XSS,
    inputSelector: '#snc-input',
    resultsSelector: '#snc-results',
  },
  {
    // CIDR / Subnet Checker — the other implementation CLAUDE.md names as a
    // reference. It satisfies the structural half of the contract (chips, the
    // exact hint line, `data-copy-all`, an sr-only copy-status span, a results
    // box that is not `aria-live`) but NOT the calm-error half: its script has a
    // 220 ms debounce and no error hold at all, and it never sets `aria-invalid`
    // on the textarea. See the findings note — J2 fails here for the tool's
    // reasons, not the fixture's.
    //
    // `hashKey` is `#list=` (not `#ip=`): this is the multi-line list tool, so it
    // WRITES `#list=` via `buildListHash` and only READS `#ip=` as an inbound
    // deep link from the other five.
    //
    // `seededResultString` is the membership verdict from example 1, whose input
    // is a `#` comment plus one bare IP plus two ranges. The verdict card is the
    // thing this tool exists to render; the `role="status"` summary
    // ("in range — 3 valid · 1 block") lives OUTSIDE the results container.
    //
    // `invalidInput` is a single line, so nothing parses, so `result.valid` is
    // false and the playground renders its `role="alert"` card plus the parsed-
    // input block. The pinned string is the PER-LINE diagnostic from
    // `engine.test.ts` → "per-line diagnostics", which lands in the bad row's
    // `.cdc-line__meta`, not the alert title.
    //
    // `xssPayload` is deliberately TWO lines, one valid. That keeps
    // `result.valid === true`, so the engine takes the normal render path and
    // echoes the offending line through `escapeHtml(e.line)` into a
    // `cdc-line--bad` row — untrusted input reaching the output on the SUCCESS
    // path, which is a stronger probe than reaching it through an error card.
    //
    // VERIFIED: 12/13. J2 is the sole failure and it is the tool's, exactly as
    // predicted above — the diagnostic (the pinned string, matched) surfaced
    // 394ms after the last keystroke with `aria-invalid` still unset. The
    // stronger-probe J7 payload works: it passes, so the success-path escaping
    // really is proven here and not vacuously.
    slug: 'cidr-checker',
    family: 'textarea',
    hashKey: '#list=',
    seededResultString: 'is inside 10.0.0.0/24',
    invalidInput: '10.0.0.256',
    calmErrorString: 'Octet 256 is greater than 255.',
    xssPayload: '10.0.0.5\n<img src=x onerror=alert(1)>',
    inputSelector: '#cdc-input',
    resultsSelector: '#cdc-results',
  },
  {
    // IP Address Converter. CLAUDE.md explicitly warns that this playground
    // PREDATES the UX contract and violates two of its own bullets — it uses a
    // `<select id="ipc-example">` instead of example chips, and it ships no hint
    // line. Both are load-bearing for the journeys (J3/J6/J8 need
    // `[role="group"][aria-label="Examples"] button`; J8 needs the hint line), so
    // those failures are expected and recorded, not fixture bugs.
    //
    // The island has TWO inputs (Single / Bulk mode). `inputSelector` points at
    // the SINGLE-mode field, which is the boot-seeded one — the Bulk textarea is
    // `hidden` until the mode toggle is pressed, and it is also the only place
    // this tool renders a `Copy all` control (which carries `data-copy`, not
    // `data-copy-all`, so the shared selector never sees it).
    //
    // `seededResultString` is the detected-format line for the seeded first
    // example (192.168.1.10), rendered into `.ipc-title__detected`. Non-mono, so
    // no `<wbr>` injection, and it disappears the moment `renderError` runs.
    //
    // `invalidInput` and its diagnostic are pinned by `engine.test.ts` →
    // "targeted errors (exact strings)".
    //
    // VERIFIED: 7/13, and every failure is one of the two documented
    // violations or a consequence of them. J3-chip2 and J6 die on
    // `SEL.chips` counting 0 (the `<select>`); J8 dies on the missing hint
    // line; J1 dies on `[data-copy-all]` not existing (its "Copy all" carries
    // `data-copy` + `data-copy-label`, so the shared copy-all selector finds
    // nothing). J2 is the batch-wide missing hold. Everything the tool DOES
    // implement passes: J3 boot-seed, J3 junk-hash (so the `#ip=` READ path is
    // confirmed), J4, all three J5s, J7.
    slug: 'ip-address-converter',
    family: 'textarea',
    hashKey: '#ip=',
    seededResultString: 'read as dotted decimal',
    invalidInput: '192.168.1.999',
    calmErrorString: 'Octet 999 is greater than 255.',
    xssPayload: OCTET_XSS,
    inputSelector: '#ipc-input',
    resultsSelector: '#ipc-results',
  },
  {
    // MAC Address Formatter — the least contract-conformant of the six. It uses a
    // `<select id="mac-example">`, ships no hint line, has no `data-copy-all`, no
    // `data-copy-link`, no `aria-invalid`, no Enter-to-run binding, no sr-only
    // copy-status span, and its per-row copy buttons carry `data-copy-value`
    // rather than the repo-wide `data-copy`, so the shared `SEL.copyRow`
    // selector matches its two labeled header buttons instead of a result row.
    //
    // `hashKey` is `#mac=`: the script builds its fragment with
    // `createHashState('mac')`, not with `ip-hash.ts`.
    //
    // `seededResultString` is the derived IPv6 link-local for the seeded first
    // example (00:1a:2b:3c:4d:5e), pinned byte-for-byte by `engine.test.ts`
    // ("derives a link-local for other unicast addresses"). This playground
    // escapes but does NOT run values through `monoHtml`, so the colons are
    // contiguous in the DOM.
    //
    // `calmErrorString` is the engine's `ERR_PARSE` constant, copied from
    // `src/lib/mac-formatter/engine.ts`. The engine has exactly two error
    // strings (empty and parse) and no per-input diagnostics at all, so this is
    // the most specific string that exists — `engine.test.ts` only asserts
    // `typeof r.error === 'string'` for the whole bad-input table.
    //
    // `xssPayload` is a MAC-shaped string carrying the markup in the last group.
    // It CANNOT satisfy J7's echo precondition and no other payload can either:
    // the engine strips `[\s:.\-]`, demands exactly 12 hex digits, and returns a
    // constant string on failure, while the success path renders only bytes it
    // re-encoded itself. There is no code path in this tool that renders
    // untrusted text — good for security, but it means J7's "the payload must
    // reach the output" precondition is structurally unreachable. Reported, not
    // worked around.
    //
    // VERIFIED: 4/13. Every prediction in this comment held. J7 confirmed the
    // XSS-immunity claim empirically — the results read "Could not read that
    // address / Not a valid 48-bit MAC address…", i.e. the constant, with the
    // payload nowhere in the DOM. All five of J7's security assertions passed;
    // only the echo PRECONDITION failed, so this is a structural limit, not a
    // security gap. J1 got PAST `SEL.copyRow` (it matched `#mac-share`, exactly
    // as predicted) and then died — together with both J5 failures — on
    // `.sr-only[role="status"]` counting 0. J3-chip2, J6 and J8 are the
    // `<select>` / no-hint-line pair. Note the `data-copy-value` divergence is
    // NOT an analytics break: `Layout.astro`'s `isCopyControl` (line 144)
    // matches `[data-copy-value]` too, so `result_copied` does fire.
    slug: 'mac-address-formatter',
    family: 'textarea',
    hashKey: '#mac=',
    seededResultString: 'fe80::21a:2bff:fe3c:4d5e',
    invalidInput: '00:1a:2b:3c:4d:5g',
    calmErrorString:
      'Not a valid 48-bit MAC address. Expected 12 hex digits, e.g. 00:1a:2b:3c:4d:5e.',
    xssPayload: '00:1a:2b:3c:4d:<img src=x onerror=alert(1)>',
    inputSelector: '#mac-input',
    resultsSelector: '#mac-results',
  },
  {
    // Reverse DNS / PTR Helper.
    //
    // `hashKey: null` is a MEASUREMENT, not a design decision like tools 5/7/10's:
    // this playground imports `readIpHash` only. It CONSUMES the `#ip=` deep link
    // the converter and calculator write, and never writes a fragment of its own,
    // so there is no payload deep link and no `data-copy-link`. J3's null-hash
    // branch is therefore the right assertion — an unknown `#s=` key must be
    // ignored (it is: `readIpHash` returns null for any prefix but `#ip=`) and the
    // boot seed must still run.
    //
    // `seededResultString` is the PTR record name for the seeded first example
    // (192.0.2.1) — octets reversed under `in-addr.arpa`, which is the single
    // thing this tool exists to compute.
    //
    // `calmErrorString` is the engine's `ERR_PARSE` constant (the only error
    // string in `src/lib/ptr-helper/engine.ts`); as with the MAC formatter there
    // is no per-input diagnostic to pin.
    //
    // `xssPayload` cannot satisfy J7's echo precondition here either: every row
    // this engine emits is rebuilt from the parsed BigInt (PTR name, zone, note,
    // `dig -x`), and the failure path is the constant above. Nothing untrusted
    // reaches the results container. Reported, not worked around.
    //
    // VERIFIED: 4/13. `hashKey: null` is confirmed correct — BOTH null-branch
    // assertions passed, so the boot seed really does run with an unknown `#s=`
    // key present and the tool really never writes a fragment. J7 confirmed the
    // XSS-immunity claim: results read "Could not read that address / Enter an
    // IP or IP/prefix…", the constant, with all security assertions green and
    // only the echo precondition unmet. J1 and J5-keyboard both died EARLIER
    // than the mac formatter did — `SEL.copyRow` matched ZERO nodes, because
    // this playground has no `[data-copy]` attribute anywhere (its row buttons
    // are `data-copy-value` only, and unlike mac it has no `#…-share` button
    // carrying plain `data-copy`). J5-live-regions: `.sr-only[role="status"]`
    // counts 0. J3-chip2, J6 and J8 are the `<select>` / no-hint-line pair.
    slug: 'reverse-dns-ptr',
    family: 'textarea',
    hashKey: null,
    seededResultString: '1.2.0.192.in-addr.arpa',
    invalidInput: '192.0.2.999',
    calmErrorString: 'Enter an IP or IP/prefix, e.g. 192.0.2.1, 192.0.2.0/24, or 2001:db8::1.',
    xssPayload: '192.0.2.<img src=x onerror=alert(1)>',
    inputSelector: '#ptr-input',
    resultsSelector: '#ptr-results',
  },
  {
    // Subnet Splitter. Three inputs: `#spl-parent`, `#spl-prefix` (a
    // `type="number"`), and the `#spl-allocated` textarea.
    //
    // `inputSelector` is `#spl-parent` and that choice is forced, not aesthetic:
    // the parent field is the one the boot seed, the `#ip=` inbound deep link,
    // `getRestoredLastInput` and `wireSnapshotUI` all read and write, so it is
    // the only field where J2's typing and J4's save/restore mean anything. The
    // cost is J7: the ONLY place this tool echoes untrusted text is an
    // unparseable line in `#spl-allocated` (rendered through
    // `escapeHtml(a.cidr)`, correctly escaped), and the parent field's failure
    // path is the `ERR_PARENT` constant, which quotes nothing. Pointing
    // `inputSelector` at the allocated textarea to win J7 would break J2 and J4,
    // because a bad allocation line leaves `result.valid === true` and the seeded
    // result on screen. Reported as a single-input-selector limitation.
    //
    // `hashKey: null` — like the PTR helper, this playground only READS `#ip=`
    // (the calculator's "Split this subnet" chip writes it) and never writes a
    // fragment.
    //
    // `seededResultString` is the first FREE block of the seeded example
    // (10.0.0.0/24 with 10.0.0.0/26 and 10.0.0.128/26 already allocated), which
    // `engine.test.ts` also pins as `nextFree`. It is engine output rather than a
    // static heading, so it really does vanish when the parent stops parsing.
    //
    // `invalidInput` has to carry a `/prefix` that is SHORTER than the seeded
    // "Split into /26" value still sitting in `#spl-prefix`: the playground runs
    // its own pre-engine check (`newPrefix <= parentPrefix`) before calling the
    // engine, and a parent like `10.0.0.0/99` would trip THAT instead and render
    // the prefix-mismatch message. `999.0.0.0/8` keeps 26 > 8, so the engine is
    // reached and returns `ERR_PARENT`. Every prefix of it is slash-free and also
    // fails to the same constant.
    //
    // VERIFIED: 3/13 — the worst in the batch, and it turned up ONE failure
    // this comment did not predict.
    //
    // J4 fails, and it cannot be made to pass by any choice of
    // `seededResultString`. `wireSnapshotUI` is wired with
    // `getValue: () => parentInput.value.trim()` and a `setValue` that assigns
    // the parent and then WIPES the other two fields
    // (`prefixInput.value = ''; allocatedInput.value = '';`, lines 731-738).
    // So a snapshot stores 1 of the tool's 3 inputs and restoring one destroys
    // the other 2. Restoring the seeded state re-renders as
    // "Free space (minimal CIDRs) · 1 block · 10.0.0.0/24 · Allocations · None"
    // — the whole /24 free, no split section, no allocations — which shares no
    // substring with the seeded render (free 10.0.0.64/26 + 10.0.0.192/26,
    // "Split into /26", two allocation rows; the literal "10.0.0.0/24" never
    // appears in it). J4 needs one string present in BOTH renders and no such
    // string exists. Left failing on purpose: see the findings note.
    //
    // J7 fails on the echo precondition exactly as reasoned above — results
    // read "Nothing to split / Enter a valid parent CIDR…", and
    // `src/lib/subnet-splitter/engine.ts` confirms `ERR_PARENT` (line 22) is
    // the only string the parent path can produce. All security assertions
    // passed. J1 and J5-keyboard die on `SEL.copyRow` matching zero nodes:
    // this playground has NO copy control of any kind — not `data-copy`, not
    // `data-copy-value`, not `data-copy-all`. J5-live-regions: no sr-only
    // status. J3-chip2, J6, J8: `<select>` / no hint line. The `hashKey: null`
    // claim is confirmed by both null-branch assertions passing.
    slug: 'subnet-splitter',
    family: 'textarea',
    hashKey: null,
    seededResultString: '10.0.0.64/26',
    invalidInput: '999.0.0.0/8',
    calmErrorString: 'Enter a valid parent CIDR, e.g. 10.0.0.0/24 or 2001:db8::/48.',
    xssPayload: '10.0.0.<img src=x onerror=alert(1)>/24',
    inputSelector: '#spl-parent',
    resultsSelector: '#spl-results',
  },
];
