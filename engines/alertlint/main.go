//go:build js && wasm

// Command alertlint is the Phase 0 proof-of-concept for the OpsCanopy AlertLint
// engine. Its ONLY job is to prove the JS -> Go(WASM) -> JSON pipeline:
//
//	browser JS  --(two YAML strings)-->  window.alertlintRunTests(...)
//	  -> this Go program (compiled GOOS=js GOARCH=wasm)
//	  -> evaluates a minimal Loki-style alert rule against synthetic logs
//	  -> returns a JSON string { summary, results } back to JS.
//
// This file is ONLY the browser bridge. All PURE evaluation logic — types,
// duration parsing, the stdlib-only YAML reader, parseRules / parseTest /
// parseExpr / countMatches / alertFires, run(), and the result structs — lives
// in eval.go (package main, no build tag, no syscall/js import) so it can be
// unit-tested on the host with `go test`. See eval.go for the engine and the
// documented Loki migration path; see eval_test.go for the host tests.
package main

import (
	"encoding/json"
	"syscall/js"
)

// ─────────────────────────────────────────────────────────────────────────────
//  JS bridge.
// ─────────────────────────────────────────────────────────────────────────────

// alertlintRunTests is the function registered on the JS global. Signature:
//
//	window.alertlintRunTests(rulesYaml: string, testYaml: string): string  // JSON
//
// It always returns a JSON string (never throws into JS): on any internal
// failure it returns a { ok:false, error } payload so the caller has one shape
// to parse. The actual evaluation is delegated to run() in eval.go.
func alertlintRunTests(this js.Value, args []js.Value) any {
	mkErr := func(msg string) string {
		b, _ := json.Marshal(runResult{
			OK:      false,
			Error:   msg,
			Summary: runSummary{},
			Results: []testResult{},
		})
		return string(b)
	}

	if len(args) < 2 || args[0].Type() != js.TypeString || args[1].Type() != js.TypeString {
		return mkErr("alertlintRunTests(rulesYaml, testYaml): expected two string arguments.")
	}

	result := run(args[0].String(), args[1].String())
	b, err := json.Marshal(result)
	if err != nil {
		return mkErr("failed to serialize result: " + err.Error())
	}
	return string(b)
}

func main() {
	// Register the bridge on the JS global object.
	fn := js.FuncOf(alertlintRunTests)
	js.Global().Set("alertlintRunTests", fn)

	// Signal readiness so the page can flip from "loading" to "ready".
	if cb := js.Global().Get("onAlertlintReady"); cb.Type() == js.TypeFunction {
		cb.Invoke()
	}

	// Keep the Go program (and therefore the registered FuncOf) alive for the
	// lifetime of the page. A WASM main that returns would tear down the runtime
	// and invalidate the exported function. `select{}` blocks forever.
	select {}
}
