# AlertLint engine — Phase 0 proof-of-concept (Go → WASM)

This directory holds the **Phase 0 PoC** for the OpsCanopy AlertLint engine: a
minimal Go program, compiled to WebAssembly, that evaluates a Loki-style alert
rule and returns a JSON `{ summary, results }` verdict to JavaScript.

> **Status: source-only.** Go is **not installed** in the environment this repo
> was scaffolded in, so **`public/engine.wasm` has not been built yet**. The
> source, build scripts, and docs here are complete and buildable — run
> [`build.cmd`](./build.cmd) / [`build.sh`](./build.sh) on a machine with Go
> 1.22+ to produce the artifacts. No binary has been fabricated.

---

## Goal

Prove the end-to-end pipeline before investing in the real engine:

```
browser JS  --(rulesYaml, testYaml)-->  window.alertlintRunTests(...)
  -> Go program (GOOS=js GOARCH=wasm)
  -> evaluate a minimal alert rule against synthetic logs
  -> return JSON { ok, summary, results }  -->  back to JS
```

If that round-trip works, Phase 1 can swap the minimal evaluator for Loki's own
query engine without changing the JS contract.

### What the PoC evaluates

Standard-library only — **no Loki packages, no third-party YAML** in the PoC. It
hand-parses the narrow slice of the Grafana Loki ruler + promtool test format
that the bundled playground examples already use:

- **Rule expr:** `sum(count_over_time({selector} |= "needle" [<N>m])) <op> <K>`
  (`<op>` ∈ `> >= < <= ==`)
- **Test logs:** `"<offset>m  <message>"` — minute offsets from `t=0`
- **Assertion:** `alert_rule_test[]` with `exp_alerts` (an **empty** `exp_alerts`
  list asserts the alert must **not** fire — the negative test)

Anything outside this subset is reported as an error rather than guessed. The
clock is **synthetic** (derived from log offsets + `eval_time`), so runs are
reproducible.

The output JSON shape intentionally mirrors
[`src/lib/alertlint/types.ts`](../../src/lib/alertlint/types.ts) (`RunResult` /
`RunSummary` / `TestResult`) so the WASM engine is a drop-in alternative to the
existing TypeScript preview engine in
[`src/lib/alertlint/engine.ts`](../../src/lib/alertlint/engine.ts).

---

## Prerequisites

- **Go 1.22 or newer** — install from <https://go.dev/dl/>, then verify:

  ```sh
  go version
  ```

No other dependencies. The module (`go.mod`) declares zero external requires.

---

## Build

From this directory, run the script for your platform:

```sh
# macOS / Linux
./build.sh
```

```bat
REM Windows
build.cmd
```

Each script:

1. Checks that `go` is on `PATH`.
2. Builds with `GOOS=js GOARCH=wasm go build -o ../../public/engine.wasm .`
3. Copies the matching runtime shim into `../../public/wasm_exec.js`:
   - **Go 1.24+:** `$(go env GOROOT)/lib/wasm/wasm_exec.js`
   - **Older toolchains:** `$(go env GOROOT)/misc/wasm/wasm_exec.js`

> Always copy `wasm_exec.js` from the **same** Go toolchain that built
> `engine.wasm` — the shim and the binary are version-coupled.

Resulting artifacts:

```
public/engine.wasm
public/wasm_exec.js
```

---

## How the web playground loads it

The shim defines a `Go` class; instantiate the module, run it, then call the
exported global. The Go side blocks on `select{}` so the exported function stays
alive for the page's lifetime, and invokes an optional `window.onAlertlintReady`
callback once registration is complete.

```html
<script src="/wasm_exec.js"></script>
<script type="module">
  const go = new Go();

  // Optional: flip the UI from "loading" to "ready" when the engine registers.
  window.onAlertlintReady = () => {
    /* enable the Run button */
  };

  const { instance } = await WebAssembly.instantiateStreaming(
    fetch('/engine.wasm'),
    go.importObject,
  );
  go.run(instance); // registers window.alertlintRunTests, then blocks on select{}

  // Call it: two YAML strings in, a JSON string out.
  const json = window.alertlintRunTests(rulesYaml, testYaml);
  const result = JSON.parse(json);
  // result => { ok, error?, summary: { total, passed, failed, durationMs }, results: [...] }
</script>
```

Notes:

- Serve `engine.wasm` with `Content-Type: application/wasm` so
  `instantiateStreaming` works; otherwise fall back to
  `WebAssembly.instantiate(await (await fetch('/engine.wasm')).arrayBuffer(), …)`.
- `alertlintRunTests` never throws into JS — on any internal failure it returns
  `{ ok: false, error }`, so the caller has a single shape to parse.

---

## Migration path to Loki `pkg/logql`

Phase 1 replaces the minimal evaluator with Loki's real query path while keeping
the `js.FuncOf` bridge and the `{ summary, results }` JSON contract **unchanged**:

1. Add `github.com/grafana/loki/v3` to `go.mod`.
2. In `main.go`, replace `run()`'s hand-rolled parsing + `countMatches` with:
   - `github.com/grafana/loki/pkg/logql/syntax` to parse the rule `expr`.
   - `github.com/grafana/loki/pkg/logql` to build and run the query engine over
     an in-memory log source fed from the test's `input_streams`.
   - Loki's ruler test types for the promtool-style assertions.
3. Keep `alertlintRunTests` and the `runResult` / `testResult` structs exactly as
   they are — only the **evaluation core** changes. The web playground does not
   change at all.

---

## Documented RISK and fallback

**Risk:** `pkg/logql` (and its transitive dependencies) **may not compile to
`js/wasm`.** Loki pulls in packages that assume a server environment — file
system, networking, cgo, build-tagged platform code — any of which can fail
under `GOOS=js GOARCH=wasm`. This is the single biggest unknown in Phase 1 and
is exactly why this PoC validates the pipeline with a stdlib-only evaluator
first.

**Fallback (if `pkg/logql` will not build to WASM):** ship AlertLint — and
**only** AlertLint — as a tiny **Cloudflare Worker**. The same Go evaluation core
(or a thin server build) runs at the edge; the browser POSTs `{ rulesYaml,
testYaml }` and receives the identical `{ summary, results }` JSON. The
playground UI and result-rendering code stay the same; only the transport
(in-page WASM call vs. `fetch` to the Worker) differs. Every other OpsCanopy tool
remains fully client-side — the Worker is scoped to AlertLint alone.

---

## Files

| File        | Purpose                                                            |
| ----------- | ------------------------------------------------------------------ |
| `go.mod`    | Module definition (`github.com/opscanopy/alertlint`, `go 1.22`).   |
| `main.go`   | Minimal stdlib-only evaluator + `syscall/js` bridge (`//go:build js && wasm`). |
| `build.cmd` | Windows build + shim-copy script.                                  |
| `build.sh`  | POSIX build + shim-copy script.                                    |
| `README.md` | This document.                                                     |
