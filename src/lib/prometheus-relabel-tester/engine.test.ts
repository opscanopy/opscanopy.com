/**
 * Prometheus Relabel Tester — engine tests.
 *
 * Vectors are taken from the official Prometheus relabeling documentation and
 * the upstream `pkg/relabel` semantics:
 *   • regex is FULLY ANCHORED (^(?:regex)$)
 *   • replace expands $1/${1} and DELETES the target on an empty expansion
 *   • keep/drop gate the whole target
 *   • keepequal/dropequal compare the joined source to the target value
 *   • hashmod uses MD5: the joined source is MD5-summed, its last 8 bytes
 *     (h[8..16)) are read as a big-endian uint64, then `% modulus` — exactly
 *     as Prometheus `pkg/relabel` does. Cross-checked against a real MD5
 *     reference: md5("foo") = acbd18db4cc2f85cedef654fccc4a4d8, so the last 8
 *     bytes (cedef654fccc4a4d8) BE = 17145033699835028696, and % 1000 = 696.
 *   • labelmap / labeldrop / labelkeep operate on label NAMES
 *   • lowercase / uppercase set the target to the cased joined source
 *
 * Every test also implicitly proves the engine never throws on its inputs.
 */
import { describe, it, expect } from 'vitest';
import { applyRelabel } from './engine';
import type { TargetResult } from './types';

/** Convenience: pull the single result's output as a plain {name: value} map. */
function outputMap(r: TargetResult): Record<string, string> {
  const o: Record<string, string> = {};
  for (const p of r.output) o[p.name] = p.value;
  return o;
}

describe('applyRelabel — happy paths', () => {
  it('replace: builds a new label from joined source via $1 expansion', () => {
    const configs = `
- source_labels: [__meta_kubernetes_pod_name]
  action: replace
  regex: (.+)
  target_label: pod
  replacement: $1
`;
    const res = applyRelabel(configs, '__meta_kubernetes_pod_name="api-7d9", job="api"');
    expect(res.ok).toBe(true);
    const r = res.results![0];
    expect(r.dropped).toBe(false);
    expect(outputMap(r).pod).toBe('api-7d9');
    expect(outputMap(r).job).toBe('api');
  });

  it('replace: joins multiple source_labels with the separator before matching', () => {
    // Default separator is ";" — Prometheus joins all source values with it.
    const configs = `
- source_labels: [__address__, __meta_port]
  action: replace
  regex: ([^:]+)(?::\\d+)?;(\\d+)
  replacement: $1:$2
  target_label: __address__
`;
    const res = applyRelabel(configs, '__address__="10.0.0.4:8080", __meta_port="9100"');
    expect(res.ok).toBe(true);
    expect(outputMap(res.results![0]).__address__).toBe('10.0.0.4:9100');
  });

  it('replace: regex is fully anchored — a partial match does NOT apply', () => {
    // regex "api" must match the WHOLE value; "api-server" should not match.
    const configs = `
- source_labels: [job]
  action: replace
  regex: api
  target_label: matched
  replacement: "yes"
`;
    const res = applyRelabel(configs, 'job="api-server"');
    expect(res.ok).toBe(true);
    // No match → labels unchanged, so "matched" was never added.
    expect(outputMap(res.results![0]).matched).toBeUndefined();
  });

  it('replace: empty expansion DELETES the target label (not set to "")', () => {
    // From the docs: a replace whose value resolves to "" removes the label.
    const configs = `
- source_labels: [tmp]
  action: replace
  regex: (.*)
  target_label: instance
  replacement: $1
`;
    const res = applyRelabel(configs, 'instance="old", tmp=""');
    expect(res.ok).toBe(true);
    const r = res.results![0];
    expect(outputMap(r).instance).toBeUndefined();
    expect(r.changes.find((c) => c.name === 'instance')?.kind).toBe('removed');
  });

  it('keep: drops the target when the joined source does NOT match', () => {
    const configs = `
- source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
  action: keep
  regex: "true"
`;
    const res = applyRelabel(
      configs,
      '__meta_kubernetes_pod_annotation_prometheus_io_scrape="true", app="api"\n\n' +
        '__meta_kubernetes_pod_annotation_prometheus_io_scrape="false", app="batch"',
    );
    expect(res.ok).toBe(true);
    expect(res.results![0].dropped).toBe(false);
    expect(res.results![1].dropped).toBe(true);
    expect(res.results![1].droppedByAction).toBe('keep');
  });

  it('drop: drops the target when the joined source matches', () => {
    const configs = `
- source_labels: [__name__]
  action: drop
  regex: go_gc_.*
`;
    const res = applyRelabel(
      configs,
      '__name__="go_gc_duration_seconds", job="api"\n\n__name__="http_requests_total", job="api"',
    );
    expect(res.ok).toBe(true);
    expect(res.results![0].dropped).toBe(true);
    expect(res.results![0].droppedByAction).toBe('drop');
    expect(res.results![1].dropped).toBe(false);
  });

  it('labelmap: maps __meta_kubernetes_pod_label_* to a top-level label', () => {
    const configs = `
- action: labelmap
  regex: __meta_kubernetes_pod_label_(.+)
`;
    const res = applyRelabel(
      configs,
      '__meta_kubernetes_pod_label_app="api", __meta_kubernetes_pod_label_tier="backend"',
    );
    expect(res.ok).toBe(true);
    const o = outputMap(res.results![0]);
    expect(o.app).toBe('api');
    expect(o.tier).toBe('backend');
    // The original __meta_* labels are preserved (labelmap adds, never removes).
    expect(o.__meta_kubernetes_pod_label_app).toBe('api');
  });

  it('labeldrop: removes labels whose NAME matches the regex', () => {
    const configs = `
- action: labeldrop
  regex: __meta_.+
`;
    const res = applyRelabel(configs, '__name__="up", job="web", __meta_x="1", __meta_y="2"');
    expect(res.ok).toBe(true);
    const o = outputMap(res.results![0]);
    expect(o.__meta_x).toBeUndefined();
    expect(o.__meta_y).toBeUndefined();
    expect(o.job).toBe('web');
    expect(o.__name__).toBe('up');
  });

  it('labelkeep: removes labels whose NAME does NOT match the regex', () => {
    const configs = `
- action: labelkeep
  regex: (job|instance)
`;
    const res = applyRelabel(configs, 'job="web", instance="1.2.3.4", extra="drop-me"');
    expect(res.ok).toBe(true);
    const o = outputMap(res.results![0]);
    expect(o.job).toBe('web');
    expect(o.instance).toBe('1.2.3.4');
    expect(o.extra).toBeUndefined();
  });

  it('lowercase / uppercase: set the target to the cased joined source', () => {
    const lower = applyRelabel(
      '- source_labels: [environment]\n  action: lowercase\n  target_label: environment',
      'environment="PRODUCTION"',
    );
    expect(outputMap(lower.results![0]).environment).toBe('production');

    const upper = applyRelabel(
      '- source_labels: [code]\n  action: uppercase\n  target_label: code',
      'code="abc"',
    );
    expect(outputMap(upper.results![0]).code).toBe('ABC');
  });

  it('keepequal / dropequal: compare joined source to the target value', () => {
    // keepequal keeps only when joined source == target_label value.
    const keep = applyRelabel(
      '- source_labels: [__port]\n  action: keepequal\n  target_label: port',
      '__port="80", port="80"\n\n__port="80", port="443"',
    );
    expect(keep.results![0].dropped).toBe(false);
    expect(keep.results![1].dropped).toBe(true);
    expect(keep.results![1].droppedByAction).toBe('keepequal');

    // dropequal drops when they are equal.
    const drop = applyRelabel(
      '- source_labels: [__port]\n  action: dropequal\n  target_label: port',
      '__port="80", port="80"\n\n__port="80", port="443"',
    );
    expect(drop.results![0].dropped).toBe(true);
    expect(drop.results![0].droppedByAction).toBe('dropequal');
    expect(drop.results![1].dropped).toBe(false);
  });

  it('hashmod: uses MD5, then keep retains only the matching shard', () => {
    // MD5 mod 3 over 10.0.0.{1..4}:9100 → [2,0,2,2] (verified against a real MD5
    // reference), so with the canonical sharding recipe only 10.0.0.2 (index 1)
    // lands on shard 0 and survives `keep: "0"`.
    const configs = `
- source_labels: [__address__]
  action: hashmod
  modulus: 3
  target_label: __tmp_shard
- source_labels: [__tmp_shard]
  action: keep
  regex: "0"
`;
    const input =
      '__address__="10.0.0.1:9100"\n\n__address__="10.0.0.2:9100"\n\n' +
      '__address__="10.0.0.3:9100"\n\n__address__="10.0.0.4:9100"';
    const res = applyRelabel(configs, input);
    expect(res.ok).toBe(true);
    expect(res.results!.map((r) => r.dropped)).toEqual([true, false, true, true]);
    // The surviving target carries shard 0.
    expect(outputMap(res.results![1]).__tmp_shard).toBe('0');
    // A parity note is surfaced as a warning whenever hashmod is used.
    expect(res.warnings.some((w) => /MD5/i.test(w))).toBe(true);
  });

  it('hashmod: exact shard values match Prometheus MD5 (last 8 bytes BE % modulus)', () => {
    // MD5 mod 3 over 10.0.0.{1..4}:9100: .1→2, .2→0, .3→2, .4→2.
    const configs = `
- source_labels: [__address__]
  action: hashmod
  modulus: 3
  target_label: shard
`;
    const input =
      '__address__="10.0.0.1:9100"\n\n__address__="10.0.0.2:9100"\n\n' +
      '__address__="10.0.0.3:9100"\n\n__address__="10.0.0.4:9100"';
    const res = applyRelabel(configs, input);
    const shards = res.results!.map((r) => outputMap(r).shard);
    expect(shards).toEqual(['2', '0', '2', '2']);
  });

  it('hashmod: fixed scalar vector matches a real MD5 reference (regression guard)', () => {
    // md5("foo") = acbd18db4cc2f85cedef654fccc4a4d8; the last 8 bytes
    // (cedef654fccc4a4d8) as a big-endian uint64 = 17145033699835028696, and
    // 17145033699835028696 % 1000 = 696. The old FNV-1a code produced a
    // different value, so this asserts a regression back to FNV would fail.
    const configs = `
- source_labels: [v]
  action: hashmod
  modulus: 1000
  target_label: shard
`;
    const res = applyRelabel(configs, 'v="foo"');
    expect(res.ok).toBe(true);
    expect(outputMap(res.results![0]).shard).toBe('696');
  });

  it('rules apply in order; a later rule sees an earlier rule’s output', () => {
    const configs = `
- source_labels: [__name__]
  action: replace
  regex: (.+)
  target_label: metric
  replacement: $1
- source_labels: [metric]
  action: replace
  regex: http_(.+)
  target_label: stripped
  replacement: $1
`;
    const res = applyRelabel(configs, '__name__="http_requests_total"');
    const o = outputMap(res.results![0]);
    expect(o.metric).toBe('http_requests_total');
    expect(o.stripped).toBe('requests_total');
  });

  it('replace: template-expands target_label through the same match ($1 in target name)', () => {
    // Prometheus expands the target name too: target_label: __param_$1 with a
    // capture of "token" names the resulting label __param_token.
    const configs = `
- source_labels: [__meta_key]
  action: replace
  regex: (.+)
  target_label: __param_$1
  replacement: fixed
`;
    const res = applyRelabel(configs, '__meta_key="token"');
    expect(res.ok).toBe(true);
    const o = outputMap(res.results![0]);
    expect(o.__param_token).toBe('fixed');
    // The un-expanded literal name must NOT be present.
    expect(o['__param_$1']).toBeUndefined();
  });

  it('expand: ${1} brace form and pre$1post adjacency expand correctly', () => {
    const configs = `
- source_labels: [job]
  action: replace
  regex: (.+)
  target_label: out
  replacement: pre\${1}post
`;
    const res = applyRelabel(configs, 'job="api"');
    expect(outputMap(res.results![0]).out).toBe('preapipost');
  });

  it('expand: $$ is a literal dollar sign', () => {
    const configs = `
- source_labels: [job]
  action: replace
  regex: (.+)
  target_label: out
  replacement: $$$1
`;
    const res = applyRelabel(configs, 'job="api"');
    expect(outputMap(res.results![0]).out).toBe('$api');
  });

  it('expand: named capture group via ${name}', () => {
    const configs = `
- source_labels: [addr]
  action: replace
  regex: (?<svc>.+)
  target_label: service
  replacement: \${svc}
`;
    const res = applyRelabel(configs, 'addr="checkout"');
    expect(outputMap(res.results![0]).service).toBe('checkout');
  });

  it('expand: an out-of-range group ($9) expands to empty (deletes the target)', () => {
    const configs = `
- source_labels: [job]
  action: replace
  regex: (.+)
  target_label: missing
  replacement: $9
`;
    const res = applyRelabel(configs, 'existing="x", job="api"');
    const o = outputMap(res.results![0]);
    // $9 → "" → empty expansion deletes (the never-created) target; "existing" stays.
    expect(o.missing).toBeUndefined();
    expect(o.existing).toBe('x');
  });

  it('lowercase/uppercase: case the ;-joined value of TWO source_labels', () => {
    const lower = applyRelabel(
      '- source_labels: [a, b]\n  action: lowercase\n  target_label: joined',
      'a="FOO", b="BAR"',
    );
    // Default separator ";" joins "FOO;BAR" → lowercased "foo;bar".
    expect(outputMap(lower.results![0]).joined).toBe('foo;bar');

    const upper = applyRelabel(
      '- source_labels: [a, b]\n  action: uppercase\n  target_label: joined',
      'a="foo", b="bar"',
    );
    expect(outputMap(upper.results![0]).joined).toBe('FOO;BAR');
  });

  it('accepts a scrape_config snippet with a relabel_configs: key', () => {
    const configs = `
relabel_configs:
  - source_labels: [__name__]
    action: keep
    regex: up
`;
    const res = applyRelabel(configs, '__name__="up"\n\n__name__="down"');
    expect(res.ok).toBe(true);
    expect(res.results!.map((r) => r.dropped)).toEqual([false, true]);
  });

  it('parses quoted values containing commas and spaces', () => {
    const res = applyRelabel(
      '- source_labels: [msg]\n  action: keep\n  regex: ".*hello.*"',
      'msg="say hello, world", job="api"',
    );
    expect(res.ok).toBe(true);
    expect(res.results![0].dropped).toBe(false);
    expect(outputMap(res.results![0]).msg).toBe('say hello, world');
  });

  it('reports the per-label diff (added / changed / removed)', () => {
    const configs = `
- source_labels: [job]
  action: replace
  regex: (.+)
  target_label: service
  replacement: $1
`;
    const res = applyRelabel(configs, 'job="api"');
    const change = res.results![0].changes.find((c) => c.name === 'service');
    expect(change?.kind).toBe('added');
    expect(change?.after).toBe('api');
  });
});

describe('applyRelabel — malformed / empty input never throws', () => {
  it('empty configs → ok:false with an error, no throw', () => {
    const res = applyRelabel('', '__name__="up"');
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
    expect(res.warnings).toEqual([]);
  });

  it('empty label sets → ok:false with an error, no throw', () => {
    const res = applyRelabel('- action: keep\n  regex: up', '');
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('garbage / non-list YAML → ok:false, no throw', () => {
    const res = applyRelabel('::: not yaml at all : [', '__name__="up"');
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it('a YAML scalar (not a list) → ok:false', () => {
    const res = applyRelabel('just a string', '__name__="up"');
    expect(res.ok).toBe(false);
  });

  it('an unknown action → ok:false with a helpful error', () => {
    const res = applyRelabel('- action: explode\n  regex: up', '__name__="up"');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/unknown action/i);
  });

  it('an invalid regex → ok:false, no throw', () => {
    const res = applyRelabel('- action: keep\n  regex: "([unclosed"', '__name__="up"');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/regex/i);
  });

  it('hashmod without modulus → ok:false', () => {
    const res = applyRelabel(
      '- source_labels: [__address__]\n  action: hashmod\n  target_label: shard',
      '__address__="x"',
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/modulus/i);
  });

  it('replace without target_label → ok:false', () => {
    const res = applyRelabel('- source_labels: [job]\n  action: replace', 'job="api"');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/target_label/i);
  });

  it('keepequal without target_label → ok:false (matches Prometheus config load)', () => {
    const res = applyRelabel('- source_labels: [__port]\n  action: keepequal', '__port="80"');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/target_label/i);
  });

  it('dropequal without target_label → ok:false (matches Prometheus config load)', () => {
    const res = applyRelabel('- source_labels: [__port]\n  action: dropequal', '__port="80"');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/target_label/i);
  });

  it('non-string arguments → ok:false, no throw', () => {
    // @ts-expect-error — intentionally violating the contract at runtime.
    const res = applyRelabel(null, undefined);
    expect(res.ok).toBe(false);
    expect(res.warnings).toEqual([]);
  });

  it('an empty list of rules → ok:false', () => {
    const res = applyRelabel('[]', '__name__="up"');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/empty/i);
  });

  it('label lines with no valid assignments → ok:false (no sets found)', () => {
    const res = applyRelabel('- action: keep\n  regex: up', 'this is not a label set');
    // "this", "is", "not"… are not key=value, so no sets are parsed.
    expect(res.ok).toBe(false);
  });
});
