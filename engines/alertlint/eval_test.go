package main

// Host-side unit tests for the PURE evaluation core in eval.go. These call
// run(rulesYaml, testYaml) directly — no syscall/js, no WASM — so they run with
// a plain `go test ./...` on the host.
//
// Scope note: the PoC evaluates ALERT rules only. Recording rules are OUT of
// PoC scope (recording_rule_test items carry `record:` but no `alertname:` and
// are skipped by parseTest), so they are intentionally not exercised here.
//
// The two canonical cases mirror the documented promtool-style semantics:
//   (a) positive — HighAuthFailureRate fires when failed-login lines in the
//       range window exceed the threshold (non-empty exp_alerts).
//   (b) negative — an EMPTY exp_alerts list asserts NO alert fires when volume
//       stays below the threshold.

import "testing"

// A single rules document drives every case: a "needle" line filter on
// failed-login messages, counted over a 5m window, firing above 5.
const authRulesYAML = `groups:
  - name: auth
    rules:
      - alert: HighAuthFailureRate
        expr: sum(count_over_time({app="auth"} |= "failed login" [5m])) > 5
        labels:
          severity: page`

// Positive test: 8 failed-login lines land inside the (eval-5m, eval] window at
// eval_time 5m, so count (8) > 5 and the alert MUST fire. exp_alerts is
// non-empty, so the expectation is "fires" and the case should PASS.
const authPositiveTestYAML = `tests:
  - input_streams:
      - stream:
          app: auth
        logs:
          - "1m failed login for user alice"
          - "1m failed login for user bob"
          - "2m failed login for user carol"
          - "2m failed login for user dave"
          - "3m failed login for user erin"
          - "3m failed login for user frank"
          - "4m failed login for user grace"
          - "4m failed login for user heidi"
    alert_rule_test:
      - eval_time: 5m
        alertname: HighAuthFailureRate
        exp_alerts:
          - exp_labels:
              severity: page
              app: auth`

// Negative test: only 2 failed-login lines in the window, so count (2) is NOT
// > 5 and the alert must NOT fire. exp_alerts is the empty list `[]`, which
// asserts "no alert fires" — the case should PASS by firing nothing.
const authNegativeTestYAML = `tests:
  - input_streams:
      - stream:
          app: auth
        logs:
          - "1m failed login for user alice"
          - "2m failed login for user bob"
          - "3m user carol logged in"
          - "4m user dave logged in"
    alert_rule_test:
      - eval_time: 5m
        alertname: HighAuthFailureRate
        exp_alerts: []`

func TestRun(t *testing.T) {
	tests := []struct {
		name       string
		rulesYAML  string
		testYAML   string
		wantOK     bool
		wantTotal  int
		wantPassed int
		wantFailed int
		// per-result expectations, indexed positionally
		wantStatus []string
		wantName   []string
	}{
		{
			name:       "positive: HighAuthFailureRate fires above threshold",
			rulesYAML:  authRulesYAML,
			testYAML:   authPositiveTestYAML,
			wantOK:     true,
			wantTotal:  1,
			wantPassed: 1,
			wantFailed: 0,
			wantStatus: []string{"pass"},
			wantName:   []string{"HighAuthFailureRate"},
		},
		{
			name:       "negative: empty exp_alerts asserts no fire below threshold",
			rulesYAML:  authRulesYAML,
			testYAML:   authNegativeTestYAML,
			wantOK:     true,
			wantTotal:  1,
			wantPassed: 1,
			wantFailed: 0,
			wantStatus: []string{"pass"},
			wantName:   []string{"HighAuthFailureRate"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := run(tt.rulesYAML, tt.testYAML)

			if got.OK != tt.wantOK {
				t.Fatalf("OK = %v, want %v (error: %q)", got.OK, tt.wantOK, got.Error)
			}
			if got.Summary.Total != tt.wantTotal {
				t.Errorf("summary.total = %d, want %d", got.Summary.Total, tt.wantTotal)
			}
			if got.Summary.Passed != tt.wantPassed {
				t.Errorf("summary.passed = %d, want %d", got.Summary.Passed, tt.wantPassed)
			}
			if got.Summary.Failed != tt.wantFailed {
				t.Errorf("summary.failed = %d, want %d", got.Summary.Failed, tt.wantFailed)
			}

			if len(got.Results) != len(tt.wantStatus) {
				t.Fatalf("len(results) = %d, want %d (results: %+v)", len(got.Results), len(tt.wantStatus), got.Results)
			}
			for i, res := range got.Results {
				if res.Status != tt.wantStatus[i] {
					t.Errorf("results[%d].status = %q, want %q (message: %q)", i, res.Status, tt.wantStatus[i], res.Message)
				}
				if res.Name != tt.wantName[i] {
					t.Errorf("results[%d].name = %q, want %q", i, res.Name, tt.wantName[i])
				}
				if res.Kind != "alert" {
					t.Errorf("results[%d].kind = %q, want %q (PoC evaluates alert rules only)", i, res.Kind, "alert")
				}
			}
		})
	}
}

// TestRunParseErrors confirms run() never panics on malformed input and instead
// reports a structured { ok:false, error } result — the same contract the JS
// bridge in main.go relies on.
func TestRunParseErrors(t *testing.T) {
	tests := []struct {
		name      string
		rulesYAML string
		testYAML  string
	}{
		{
			name:      "no alerting rules in rules file",
			rulesYAML: "groups: []",
			testYAML:  authPositiveTestYAML,
		},
		{
			name:      "no alert_rule_test in test file",
			rulesYAML: authRulesYAML,
			testYAML:  "tests: []",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := run(tt.rulesYAML, tt.testYAML)
			if got.OK {
				t.Fatalf("OK = true, want false for malformed input")
			}
			if got.Error == "" {
				t.Errorf("error message is empty, want a non-empty explanation")
			}
			if got.Results == nil {
				t.Errorf("results = nil, want non-nil empty slice (stable JSON shape)")
			}
		})
	}
}
