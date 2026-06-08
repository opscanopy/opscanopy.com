// Package main — PURE evaluation logic for the AlertLint PoC.
//
// This file holds everything the engine does that does NOT touch the browser:
// the parsed-document types, duration parsing, the tiny stdlib-only YAML reader,
// parseRules / parseTest / parseExpr / countMatches / alertFires, and the
// top-level run() plus its result structs.
//
// It carries NO build tag and does NOT import syscall/js, so it compiles on the
// host and is unit-testable with plain `go test` (see eval_test.go). The JS
// bridge that exports run() to the browser lives in main.go behind a
// `//go:build js && wasm` tag.
//
// ┌────────────────────────────────────────────────────────────────────────┐
// │  THIS IS A MINIMAL, STANDALONE EVALUATOR — NOT THE REAL LOKI ENGINE.     │
// │                                                                          │
// │  It deliberately depends on the Go STANDARD LIBRARY ONLY (no Loki        │
// │  packages, no third-party YAML). It hand-parses the narrow slice of      │
// │  the Grafana Loki ruler + promtool test format that the bundled          │
// │  playground examples use, just enough to return an honest pass/fail:     │
// │                                                                          │
// │    rule expr :  sum(count_over_time({sel} |= "needle" [<N>m])) <op> <K>  │
// │    test logs :  "<offset>m  <message>"  (minute offsets from t=0)        │
// │    assertion :  alert_rule_test[] with exp_alerts (empty == no-fire)     │
// │                                                                          │
// │  Recording rules are OUT of PoC scope: the PoC evaluates ALERT rules     │
// │  only. recording_rule_test items (which carry `record:` but no           │
// │  `alertname:`) are skipped rather than reported as spurious failures.    │
// │                                                                          │
// │  MIGRATION PATH: the real build swaps this evaluator for Loki's own      │
// │  query path — github.com/grafana/loki/pkg/logql — keeping the js.Func    │
// │  wrapper in main.go and the { summary, results } JSON contract           │
// │  unchanged so the web playground does not have to change.                │
// └────────────────────────────────────────────────────────────────────────┘
//
// The JSON shape below intentionally mirrors src/lib/alertlint/types.ts
// (RunResult / RunSummary / TestResult) so the WASM engine is a drop-in
// alternative to the TypeScript preview engine.
package main

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────────
//  Output contract — mirrors src/lib/alertlint/types.ts (RunResult).
// ─────────────────────────────────────────────────────────────────────────────

type runSummary struct {
	Total      int `json:"total"`
	Passed     int `json:"passed"`
	Failed     int `json:"failed"`
	DurationMs int `json:"durationMs"`
}

type testResult struct {
	Name     string `json:"name"`
	EvalTime string `json:"evalTime"`
	Status   string `json:"status"` // "pass" | "fail"
	Kind     string `json:"kind"`   // "alert" | "recording"
	Message  string `json:"message"`
}

type runResult struct {
	OK      bool         `json:"ok"`
	Error   string       `json:"error,omitempty"`
	Summary runSummary   `json:"summary"`
	Results []testResult `json:"results"`
}

// ─────────────────────────────────────────────────────────────────────────────
//  Minimal parsed-document shapes (loose — user input is validated as we read).
// ─────────────────────────────────────────────────────────────────────────────

type rule struct {
	alert string            // alert name (empty for recording rules in this PoC)
	expr  string            // the threshold expression
	forD  int               // `for:` window, in seconds
	label map[string]string // rule labels merged onto firing alerts
}

type logEntry struct {
	t      int               // synthetic seconds from t=0
	labels map[string]string // stream labels
	line   string            // raw log line text
}

type expAlert struct {
	expLabels map[string]string
}

type alertAssertion struct {
	evalTime    string
	evalSeconds int
	alertname   string
	expAlerts   []expAlert // empty slice == assert NO alert fires
}

// ─────────────────────────────────────────────────────────────────────────────
//  Duration parsing. Supports s, m, h, d, w (and compounds like "1h30m").
// ─────────────────────────────────────────────────────────────────────────────

var unitSeconds = map[byte]int{'s': 1, 'm': 60, 'h': 3600, 'd': 86400, 'w': 604800}

var durationRe = regexp.MustCompile(`(\d+)\s*([smhdw])`)

func parseDuration(raw string) (int, error) {
	s := strings.TrimSpace(raw)
	if s == "" || s == "0" {
		return 0, nil
	}
	matches := durationRe.FindAllStringSubmatch(s, -1)
	if len(matches) == 0 {
		return 0, fmt.Errorf("could not parse duration %q (use units like 30s, 5m, 1h)", raw)
	}
	total := 0
	for _, m := range matches {
		n, err := strconv.Atoi(m[1])
		if err != nil {
			return 0, fmt.Errorf("could not parse duration %q", raw)
		}
		total += n * unitSeconds[m[2][0]]
	}
	return total, nil
}

// ─────────────────────────────────────────────────────────────────────────────
//  A tiny indentation-aware YAML reader.
//
//  We do NOT pull in a third-party YAML package for the PoC (stdlib only), so
//  this reads just the narrow structure the bundled examples use. The real
//  build will use a proper parser (or Loki's own loaders). It is forgiving:
//  unknown keys are ignored rather than guessed.
// ─────────────────────────────────────────────────────────────────────────────

type yamlLine struct {
	indent int    // leading-space count
	dash   bool   // line begins a list item ("- ...")
	key    string // map key (empty when the line is a bare scalar / list item)
	value  string // scalar value (already unquoted/trimmed)
	raw    string // remainder after the dash/key, for nested parsing
}

func tokenizeYAML(src string) []yamlLine {
	var out []yamlLine
	for _, rawLine := range strings.Split(src, "\n") {
		// Drop comments (only when not inside quotes — examples keep them simple).
		line := stripComment(rawLine)
		if strings.TrimSpace(line) == "" {
			continue
		}
		indent := len(line) - len(strings.TrimLeft(line, " "))
		content := strings.TrimLeft(line, " ")

		yl := yamlLine{indent: indent}
		if strings.HasPrefix(content, "- ") || content == "-" {
			yl.dash = true
			content = strings.TrimPrefix(content, "-")
			content = strings.TrimLeft(content, " ")
		}
		yl.raw = content

		if k, v, ok := splitKeyValue(content); ok {
			yl.key = k
			yl.value = unquote(v)
		} else {
			yl.value = unquote(content)
		}
		out = append(out, yl)
	}
	return out
}

// stripComment removes a trailing "# ..." comment that is outside double quotes.
func stripComment(line string) string {
	inQuote := false
	for i := 0; i < len(line); i++ {
		c := line[i]
		if c == '"' && (i == 0 || line[i-1] != '\\') {
			inQuote = !inQuote
		}
		if c == '#' && !inQuote {
			return strings.TrimRight(line[:i], " ")
		}
	}
	return line
}

// splitKeyValue splits "key: value" where the colon is outside quotes.
func splitKeyValue(s string) (key, value string, ok bool) {
	inQuote := false
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c == '"' && (i == 0 || s[i-1] != '\\') {
			inQuote = !inQuote
		}
		if c == ':' && !inQuote {
			// A colon followed by end-of-line or a space is a key/value split.
			if i+1 == len(s) || s[i+1] == ' ' {
				return strings.TrimSpace(s[:i]), strings.TrimSpace(s[i+1:]), true
			}
		}
	}
	return "", "", false
}

// unquote strips a single matching pair of double or single quotes.
func unquote(s string) string {
	s = strings.TrimSpace(s)
	if len(s) >= 2 {
		if (s[0] == '"' && s[len(s)-1] == '"') || (s[0] == '\'' && s[len(s)-1] == '\'') {
			inner := s[1 : len(s)-1]
			inner = strings.ReplaceAll(inner, `\"`, `"`)
			return inner
		}
	}
	return s
}

// ─────────────────────────────────────────────────────────────────────────────
//  Rules-file parsing: groups[].rules[] with alert/expr/for/labels.
// ─────────────────────────────────────────────────────────────────────────────

func parseRules(src string) (map[string]rule, error) {
	lines := tokenizeYAML(src)
	rules := map[string]rule{}

	var cur *rule
	inLabels := false
	labelsIndent := -1

	flush := func() {
		if cur != nil && cur.alert != "" {
			rules[cur.alert] = *cur
		}
		cur = nil
	}

	for _, l := range lines {
		// A new list item that carries `alert:` starts a fresh rule.
		if l.dash && l.key == "alert" {
			flush()
			cur = &rule{alert: l.value, label: map[string]string{}}
			inLabels = false
			continue
		}
		if cur == nil {
			continue
		}

		// Leaving the labels block once indentation drops back.
		if inLabels && l.indent <= labelsIndent {
			inLabels = false
		}

		switch {
		case inLabels && l.key != "":
			cur.label[l.key] = l.value
		case l.key == "expr":
			cur.expr = l.value
		case l.key == "for":
			d, err := parseDuration(l.value)
			if err != nil {
				return nil, fmt.Errorf("rule %q: %w", cur.alert, err)
			}
			cur.forD = d
		case l.key == "labels":
			inLabels = true
			labelsIndent = l.indent
		}
	}
	flush()

	if len(rules) == 0 {
		return nil, fmt.Errorf("no alerting rules found — expected groups[].rules[] with an `alert:` and `expr:`")
	}
	for name, r := range rules {
		if strings.TrimSpace(r.expr) == "" {
			return nil, fmt.Errorf("rule %q is missing a string `expr`", name)
		}
	}
	return rules, nil
}

// ─────────────────────────────────────────────────────────────────────────────
//  Test-file parsing: input_streams[] + alert_rule_test[].
// ─────────────────────────────────────────────────────────────────────────────

type testCase struct {
	store      []logEntry
	assertions []alertAssertion
}

// Top-level section the reader is currently inside. We only care about two:
// the synthetic log streams and the alert assertions.
type testSection int

const (
	secNone testSection = iota
	secInputStreams
	secAlertTests
)

// Sub-context within a section, tracked by the indentation at which it opened.
type subContext int

const (
	subNone subContext = iota
	subStreamLabels // we are reading a stream's label map
	subLogs         // we are reading a stream's log lines
	subExpLabels    // we are reading an expected alert's exp_labels map
)

func parseTest(src string) (*testCase, error) {
	lines := tokenizeYAML(src)
	tc := &testCase{}

	section := secNone
	sub := subNone
	subIndent := -1 // indentation at which the current sub-context opened

	var curLabels map[string]string // current stream's labels
	var curAssertion *alertAssertion
	var curExpAlert *expAlert

	flushExpAlert := func() {
		if curExpAlert != nil && curAssertion != nil {
			curAssertion.expAlerts = append(curAssertion.expAlerts, *curExpAlert)
		}
		curExpAlert = nil
	}
	flushAssertion := func() {
		flushExpAlert()
		// Only alerting assertions carry an alertname. The PoC scopes itself to
		// alert rules, so recording_rule_test items (which have `record:` but no
		// `alertname:`) are skipped rather than reported as spurious failures.
		if curAssertion != nil && curAssertion.alertname != "" {
			tc.assertions = append(tc.assertions, *curAssertion)
		}
		curAssertion = nil
	}

	for _, l := range lines {
		// Close an open sub-context once indentation falls back to or above the
		// level the sub-context opened at (and the line is not part of its list).
		if sub != subNone && l.indent <= subIndent && !(l.dash && sub == subLogs) {
			if sub == subLogs || sub == subStreamLabels || sub == subExpLabels {
				sub = subNone
			}
		}

		// ── Top-level section switches ──────────────────────────────────────
		switch l.key {
		case "input_streams":
			flushAssertion()
			section = secInputStreams
			sub = subNone
			continue
		case "alert_rule_test", "recording_rule_test":
			section = secAlertTests
			sub = subNone
			continue
		}

		// ── input_streams reading ───────────────────────────────────────────
		if section == secInputStreams {
			switch l.key {
			case "stream":
				curLabels = map[string]string{}
				sub = subStreamLabels
				subIndent = l.indent
				continue
			case "logs":
				sub = subLogs
				subIndent = l.indent
				continue
			}
			switch sub {
			case subStreamLabels:
				if l.key != "" {
					curLabels[l.key] = l.value
				}
			case subLogs:
				if l.value != "" {
					entry, err := parseLogLine(l.value, curLabels)
					if err != nil {
						return nil, err
					}
					tc.store = append(tc.store, entry)
				}
			}
			continue
		}

		// ── alert_rule_test reading ─────────────────────────────────────────
		if section == secAlertTests {
			// A dashed item that is NOT inside exp_alerts starts a new assertion.
			// (The first field may be eval_time OR alertname — order-agnostic.)
			if l.dash && curExpAlert == nil && sub != subExpLabels && l.key != "exp_labels" && l.key != "exp_annotations" {
				flushAssertion()
				curAssertion = &alertAssertion{}
			}

			switch l.key {
			case "alertname":
				if curAssertion != nil {
					curAssertion.alertname = l.value
				}
				continue
			case "eval_time":
				if curAssertion != nil {
					curAssertion.evalTime = l.value
					d, err := parseDuration(l.value)
					if err != nil {
						return nil, fmt.Errorf("alert_rule_test eval_time: %w", err)
					}
					curAssertion.evalSeconds = d
				}
				continue
			case "exp_alerts":
				// Presence of the key marks a (possibly empty) expectation list.
				// An empty list (no child items follow) asserts NO alert fires.
				if curAssertion != nil && curAssertion.expAlerts == nil {
					curAssertion.expAlerts = []expAlert{}
				}
				sub = subNone
				continue
			}

			// A dashed item under exp_alerts begins a new expected alert.
			if l.dash && curAssertion != nil && (l.key == "exp_labels" || l.key == "exp_annotations" || l.key == "") {
				flushExpAlert()
				curExpAlert = &expAlert{expLabels: map[string]string{}}
				if l.key == "exp_labels" {
					sub = subExpLabels
					subIndent = l.indent
				}
				continue
			}
			if l.key == "exp_labels" {
				sub = subExpLabels
				subIndent = l.indent
				if curExpAlert != nil {
					curExpAlert.expLabels = map[string]string{}
				}
				continue
			}
			if sub == subExpLabels && l.key != "" && curExpAlert != nil {
				curExpAlert.expLabels[l.key] = l.value
			}
		}
	}
	flushAssertion()

	if len(tc.assertions) == 0 {
		return nil, fmt.Errorf("test file must define at least one alert_rule_test with an `alertname` (the PoC evaluates alerting rules only)")
	}
	return tc, nil
}

func parseLogLine(text string, labels map[string]string) (logEntry, error) {
	idx := strings.IndexAny(text, " \t")
	if idx == -1 {
		return logEntry{}, fmt.Errorf("log line %q must be \"<offset> <message>\", e.g. \"0m Failed login\"", text)
	}
	offset := text[:idx]
	line := strings.TrimLeft(text[idx+1:], " \t")
	t, err := parseDuration(offset)
	if err != nil {
		return logEntry{}, err
	}
	// Copy labels so later mutation of the stream map cannot alias entries.
	cp := make(map[string]string, len(labels))
	for k, v := range labels {
		cp[k] = v
	}
	return logEntry{t: t, labels: cp, line: line}, nil
}

// ─────────────────────────────────────────────────────────────────────────────
//  Expression evaluation (the PoC's narrow LogQL subset):
//
//    sum( count_over_time( {sel} |= "needle" [<N>m] ) ) <op> <K>
//
//  Only what the bundled examples need. Anything else is reported as an error
//  rather than silently guessed.
// ─────────────────────────────────────────────────────────────────────────────

var exprRe = regexp.MustCompile(
	`^\s*sum\s*\(\s*count_over_time\s*\(\s*\{([^}]*)\}\s*(.*?)\s*\[\s*([0-9smhdw]+)\s*\]\s*\)\s*\)\s*(>=|<=|==|>|<)\s*(-?\d+(?:\.\d+)?)\s*$`,
)

var matcherRe = regexp.MustCompile(`([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"([^"]*)"`)
var filterRe = regexp.MustCompile(`\|=\s*"([^"]*)"`)

type parsedExpr struct {
	matchers  map[string]string
	needle    string // optional |= line filter ("" == no filter)
	rangeSecs int
	op        string
	threshold float64
}

func parseExpr(expr string) (parsedExpr, error) {
	m := exprRe.FindStringSubmatch(expr)
	if m == nil {
		return parsedExpr{}, fmt.Errorf(
			"unsupported expr %q — the PoC only evaluates "+
				"sum(count_over_time({selector} |= \"needle\" [Nm])) <op> N", expr)
	}
	pe := parsedExpr{matchers: map[string]string{}, op: m[4]}

	for _, mm := range matcherRe.FindAllStringSubmatch(m[1], -1) {
		pe.matchers[mm[1]] = mm[2]
	}
	if fm := filterRe.FindStringSubmatch(m[2]); fm != nil {
		pe.needle = fm[1]
	}
	d, err := parseDuration(m[3])
	if err != nil {
		return parsedExpr{}, err
	}
	pe.rangeSecs = d

	thr, err := strconv.ParseFloat(m[5], 64)
	if err != nil {
		return parsedExpr{}, fmt.Errorf("could not parse threshold in %q", expr)
	}
	pe.threshold = thr
	return pe, nil
}

// countMatches returns the number of log lines that match the selector +
// optional line filter within the window (evalT-range, evalT].
func countMatches(pe parsedExpr, store []logEntry, evalT int) int {
	windowStart := evalT - pe.rangeSecs
	n := 0
	for _, e := range store {
		if e.t <= windowStart || e.t > evalT {
			continue
		}
		match := true
		for k, v := range pe.matchers {
			if e.labels[k] != v {
				match = false
				break
			}
		}
		if !match {
			continue
		}
		if pe.needle != "" && !strings.Contains(e.line, pe.needle) {
			continue
		}
		n++
	}
	return n
}

func compare(value, threshold float64, op string) bool {
	switch op {
	case ">":
		return value > threshold
	case ">=":
		return value >= threshold
	case "<":
		return value < threshold
	case "<=":
		return value <= threshold
	case "==":
		return value == threshold
	}
	return false
}

// ─────────────────────────────────────────────────────────────────────────────
//  Evaluation: does the alert fire at evalT, honoring `for:`?
// ─────────────────────────────────────────────────────────────────────────────

// alertFires samples the expression across the [evalT-for, evalT] window at a
// 60s cadence and requires every sample to exceed the threshold (a simplified
// Prometheus `for:` model — good enough to prove the pipeline).
func alertFires(r rule, pe parsedExpr, store []logEntry, evalT int) bool {
	step := 60
	for t := evalT - r.forD; t < evalT; t += step {
		if t < 0 {
			continue
		}
		if !compare(float64(countMatches(pe, store, t)), pe.threshold, pe.op) {
			return false
		}
	}
	return compare(float64(countMatches(pe, store, evalT)), pe.threshold, pe.op)
}

// ─────────────────────────────────────────────────────────────────────────────
//  Top-level run: parse both docs, evaluate every assertion, roll up summary.
//  Never panics on user input — failures become a JSON error string.
// ─────────────────────────────────────────────────────────────────────────────

func run(rulesYaml, testYaml string) runResult {
	start := time.Now()
	mkSummary := func(total, passed int) runSummary {
		return runSummary{
			Total:      total,
			Passed:     passed,
			Failed:     total - passed,
			DurationMs: int(time.Since(start).Milliseconds()),
		}
	}

	rules, err := parseRules(rulesYaml)
	if err != nil {
		return runResult{OK: false, Error: "Could not parse rules YAML: " + err.Error(), Summary: mkSummary(0, 0), Results: []testResult{}}
	}
	tc, err := parseTest(testYaml)
	if err != nil {
		return runResult{OK: false, Error: "Could not parse test YAML: " + err.Error(), Summary: mkSummary(0, 0), Results: []testResult{}}
	}

	results := make([]testResult, 0, len(tc.assertions))
	passed := 0

	for _, a := range tc.assertions {
		evalLabel := a.evalTime
		if evalLabel == "" {
			evalLabel = "0m"
		}
		res := testResult{Name: a.alertname, EvalTime: evalLabel, Kind: "alert"}

		r, ok := rules[a.alertname]
		if !ok {
			res.Status = "fail"
			res.Message = fmt.Sprintf("No alerting rule named %q was found in the rules file.", a.alertname)
			results = append(results, res)
			continue
		}

		pe, perr := parseExpr(r.expr)
		if perr != nil {
			res.Status = "fail"
			res.Message = perr.Error()
			results = append(results, res)
			continue
		}

		fired := alertFires(r, pe, tc.store, a.evalSeconds)
		count := countMatches(pe, tc.store, a.evalSeconds)
		expectFire := len(a.expAlerts) > 0

		switch {
		case expectFire && fired:
			res.Status = "pass"
			res.Message = fmt.Sprintf("Alert fired as expected (count %d %s %g).", count, pe.op, pe.threshold)
			passed++
		case !expectFire && !fired:
			res.Status = "pass"
			res.Message = fmt.Sprintf("No alert fired, as expected (count %d, threshold %s %g).", count, pe.op, pe.threshold)
			passed++
		case expectFire && !fired:
			res.Status = "fail"
			res.Message = fmt.Sprintf("Expected the alert to fire, but it did not (count %d %s %g was false).", count, pe.op, pe.threshold)
		default: // !expectFire && fired
			res.Status = "fail"
			res.Message = fmt.Sprintf("Expected no alert to fire, but it did (count %d %s %g was true).", count, pe.op, pe.threshold)
		}
		results = append(results, res)
	}

	return runResult{OK: true, Summary: mkSummary(len(results), passed), Results: results}
}
