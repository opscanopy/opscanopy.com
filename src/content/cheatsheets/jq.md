---
title: jq cheat sheet
seoTitle: jq Cheat Sheet — select, map, filter and reshape JSON
description: jq filters for pulling fields, filtering arrays, reshaping objects and emitting CSV or shell lines, each one run against the sample file on this page.
command: jq
verifiedWith: jq 1.8.2
pubDate: 2026-10-09
updatedDate: 2026-10-09
order: 3
relatedTools:
  - jq-playground
  - json-yaml-converter
sources:
  - title: jq 1.8 Manual
    url: https://jqlang.org/manual/
  - title: jq 1.8 Manual — Invoking jq (command-line options)
    url: https://jqlang.org/manual/#invoking-jq
  - title: jq 1.8 Manual — Format strings and escaping
    url: https://jqlang.org/manual/#format-strings-and-escaping
faqs:
  - q: How do I get a value without the quotes?
    a: Add -r (raw output). jq '.name' prints "api" as a JSON string with quotes; jq -r '.name' prints api, which is what you want when the result goes into a shell variable.
  - q: How do I pass a shell variable into a jq filter?
    a: Use --arg for strings and --argjson for numbers, booleans or JSON. For example jq --arg env "$ENV" '.services[] | select(.env == $env)'. Never splice the variable into the filter text with double quotes; it breaks on quotes and can change what the filter does.
  - q: Why does jq print null instead of an error?
    a: Asking for a key that does not exist returns null rather than failing. Use the alternative operator (.region // "unknown") to supply a default, or -e so the exit status tells a script the last result was null or false.
---

Five jq filters cover most work: `.field` to read a value, `.[]` to walk an array, `select(...)` to keep only matching items, `{a, b}` to build a smaller object, and `-r` with `@tsv` or string interpolation to get plain text out for a shell. Every example below runs against the sample file shown first, and every one without a special flag is executed by this site's test suite with the same jq build the [jq Playground](/jq-playground/) runs in your browser.

The sample, saved as `services.json`:

```json
{
  "cluster": "prod-eu",
  "updated": "2026-10-01T12:00:00Z",
  "services": [
    {
      "name": "api",
      "env": "prod",
      "replicas": 3,
      "image": "registry.example.com/api:1.4.2",
      "ports": [8080],
      "labels": { "team": "core", "tier": "backend" }
    },
    {
      "name": "web",
      "env": "prod",
      "replicas": 2,
      "image": "registry.example.com/web:2.0.0",
      "ports": [80, 443],
      "labels": { "team": "frontend" }
    },
    {
      "name": "worker",
      "env": "staging",
      "replicas": 1,
      "image": "registry.example.com/worker:0.9.1",
      "ports": [],
      "labels": { "team": "core", "tier": "batch" }
    }
  ]
}
```

## Read values

| Command | What it does |
|---|---|
| `jq '.' services.json` | Pretty-print and validate. A syntax error in the file is reported with its line and column. |
| `jq -c '.' services.json` | The whole document on one line. |
| `jq '.cluster' services.json` | One field, as JSON: `"prod-eu"`. |
| `jq -r '.cluster' services.json` | The same without quotes: `prod-eu`. |
| `jq '.services[0].name' services.json` | Index into an array; counting starts at 0. |
| `jq '.services[-1].name' services.json` | Negative indexes count from the end: `"worker"`. |
| `jq '.services[1:]' services.json` | A slice: every service after the first. |
| `jq '.services[].name' services.json` | One output per array element. |
| `jq '.services \| length' services.json` | How many items: `3`. |
| `jq 'keys' services.json` | The top-level keys, sorted. |
| `jq '.region // "unknown"' services.json` | A default when the key is missing or null. |
| `jq '.. \| .image? // empty' services.json` | Find a key at any depth. |
| `jq 'getpath(["services", 0, "name"])' services.json` | Read a value from a path held as data. |

## Filter

| Command | What it does |
|---|---|
| `jq '.services[] \| select(.env == "prod") \| .name' services.json` | Names of production services. |
| `jq '.services[] \| select(.replicas > 1) \| .name' services.json` | Numeric comparison. |
| `jq '.services[] \| select(.labels.tier == "batch") \| .name' services.json` | Match on a nested field. |
| `jq '.services[] \| select(.name \| test("^w")) \| .name' services.json` | Regular-expression match. |
| `jq '.services[] \| select(.ports \| index(443)) \| .name' services.json` | Items whose array contains a value. |
| `jq '.services[] \| select(.ports \| length == 0) \| .name' services.json` | Items with an empty array. |
| `jq 'any(.services[]; .replicas == 0)' services.json` | `true` if any item matches. |
| `jq 'all(.services[]; .image \| startswith("registry.example.com/"))' services.json` | `true` only if every item matches. |
| `jq 'first(.services[] \| select(.env == "prod")) \| .name' services.json` | Stop at the first match. |
| `jq 'limit(2; .services[]) \| .name' services.json` | At most two results. |

## Reshape

| Command | What it does |
|---|---|
| `jq '.services[] \| {name, replicas}' services.json` | A smaller object per item; `{name}` is short for `{name: .name}`. |
| `jq -c '.services[] \| {name, tag: (.image \| split(":")[1])}' services.json` | Rename and compute fields. |
| `jq '[.services[].name]' services.json` | Collect results back into an array. |
| `jq '.services \| map(.name)' services.json` | The same with `map`. |
| `jq '.services \| map({(.name): .replicas}) \| add' services.json` | Turn an array into an object keyed by name. |
| `jq '.services \| sort_by(.replicas) \| map(.name)' services.json` | Sort by a field. |
| `jq '.services \| max_by(.replicas) \| .name' services.json` | The item with the largest value. |
| `jq '.services \| group_by(.env) \| map({env: .[0].env, count: length})' services.json` | Group and count. |
| `jq '.services \| map(.labels.team) \| unique' services.json` | Distinct values. |
| `jq '[.services[].replicas] \| add' services.json` | Sum a field: `6`. |
| `jq 'reduce .services[] as $s (0; . + $s.replicas)' services.json` | The same sum with an explicit accumulator. |
| `jq '.services[0].labels \| to_entries' services.json` | An object as a list of `{key, value}` pairs. |
| `jq 'with_entries(select(.key != "services"))' services.json` | Drop keys by a rule. |
| `jq -c 'paths(type == "number")' services.json` | The path to every number in the document. |

## Edit

| Command | What it does |
|---|---|
| `jq '.services[].replicas += 1' services.json` | Update every matching value in place; the rest of the document is kept. |
| `jq '.services[0].env = "canary"' services.json` | Set one value. |
| `jq '.services \|= map(select(.env == "prod"))' services.json` | Replace an array with a filtered copy. |
| `jq 'del(.updated)' services.json` | Remove a key. |
| `jq 'del(.services[] \| select(.env == "staging"))' services.json` | Remove matching array items. |
| `jq '. + {owner: "platform"}' services.json` | Merge in new keys. |

jq never edits the file itself. To save a change, write to a temporary file and move it over the original once jq succeeds.

## Text output for scripts

| Command | What it does |
|---|---|
| `jq -r '.services[] \| "\(.name)=\(.replicas)"' services.json` | String interpolation, one line per item. |
| `jq -r '.services[] \| [.name, .env, .replicas] \| @tsv' services.json` | Tab-separated rows, ready for `column -t` or `cut`. |
| `jq -r '.services[] \| [.name, .replicas] \| @csv' services.json` | CSV with strings quoted. |
| `jq -r '.services[] \| @sh "docker pull \(.image)"' services.json` | Shell commands with each value safely quoted. |
| `jq -r '.cluster \| @base64' services.json` | Base64-encode a value; `@base64d` decodes. |
| `jq -r '.cluster as $c \| .services[] \| "\($c)/\(.name)"' services.json` | Keep an outer value in a variable while walking inside. |
| `jq -r '.updated \| fromdate \| strftime("%Y-%m-%d")' services.json` | Parse an ISO 8601 timestamp and reformat it. |
| `jq -r '.services[] \| try (.labels.tier \| ascii_upcase) catch "no tier"' services.json` | Handle an error per item instead of stopping: `web` has no `tier`, so it prints `no tier` between `BACKEND` and `BATCH`. |

## Several inputs, or none

| Command | What it does |
|---|---|
| `jq -s 'length' services.json` | Slurp every JSON value in the input into one array first. |
| `jq -s '.[0].cluster' services.json` | Read from the slurped array. |
| `jq -n '{name: "api", replicas: 3}'` | Build JSON from scratch, reading no input. |
| `jq -n '[inputs \| .cluster]' services.json` | With `-n`, read the input stream yourself with `inputs`. |

## Flags you will want

These change how jq is invoked rather than what the filter does.

| Command | What it does |
|---|---|
| `jq --arg env prod '.services[] \| select(.env == $env) \| .name' services.json` | Pass a shell value in as the string `$env`. |
| `jq --argjson min 2 '.services[] \| select(.replicas >= $min) \| .name' services.json` | Pass a number or JSON value as `$min`. |
| `jq -e '.services[] \| select(.name == "api")' services.json` | Exit 1 if the last result is `false` or `null`, and 4 if there was no result, so `if jq -e …` works in scripts. |
| `jq -R 'split(",")'` | Read raw lines of text instead of JSON, one string per line. |
| `jq -S '.' services.json` | Sort object keys in the output, handy before a `diff`. |
| `jq -j '.services[].name' services.json` | Raw output without a newline after each result. |
| `jq --tab '.' services.json` | Indent with tabs instead of two spaces. |

## Gotchas

> **Gotcha:** quote the filter in single quotes on Linux and macOS. Inside double quotes the shell expands `$name` and backticks before jq ever sees them.

> **Gotcha:** redirecting jq's output into its own input file (`> services.json`) empties it, because the shell truncates the file before jq reads it. Write to a temporary file, then move it over the original.

> **Gotcha:** a missing key is `null`, not an error, so a typo in a field name prints `null` and exits 0. Use `-e` when a script must notice.

> **Gotcha:** `.[]` on an object iterates its values, not its keys. Use `keys` or `to_entries` when you need the names.

Go deeper: paste your own JSON into the [jq Playground](/jq-playground/) to try any line above, or convert it to YAML with the [JSON to YAML converter](/json-yaml-converter/). For JSON that comes out of `docker inspect`, the [Docker cheat sheet](/cheatsheets/docker/) shows where it comes from.
