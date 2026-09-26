---
title: "Datasource ${DS_PROMETHEUS} was not found: causes and fixes"
description: "Why provisioned Grafana dashboards say Datasource ${DS_PROMETHEUS} was not found, how to find every placeholder with jq, and four fixes that survive CI."
pubDate: 2026-10-19
draft: true
tags: ["observability", "prometheus"]
relatedTool:
  name: "Grafana Dashboard Validator"
  href: "/grafana-dashboard-validator"
---

![An exported Grafana dashboard whose panels still point at an unfilled DS_PROMETHEUS placeholder instead of a real Prometheus datasource uid](/blog/grafana-datasource-was-not-found-hero.svg)
<!-- keywords: primary: datasource ${ds_prometheus} was not found (<100, n/a) | secondaries: grafana ds_prometheus not found, ds_prometheus not found, grafana datasource not found, grafana __inputs | source: ahrefs free (2026-09-26) -->
<!-- insight: the error text is a lookup key: the exporter names the placeholder from the datasource NAME (first space only), TemplateSrv returns an unknown ${...} unchanged, and provisioning, POST /api/dashboards/db and Terraform store the file verbatim, so DS_* inputs carry no value to substitute, still true in 13.2 | serp-checked: 2026-09-26 -->

You exported a dashboard from staging, committed the JSON next to your provisioning config, and rolled Grafana. The dashboard appears in the right folder. Every panel is empty, and each one carries the same red corner:

```text
Datasource ${DS_PROMETHEUS} was not found
```

Your Prometheus datasource exists and works in Explore. This Grafana datasource not found error, often searched as "DS_PROMETHEUS not found", does not mean the datasource is missing. Grafana is printing the lookup key it was given, verbatim, and that key is a placeholder nobody filled in. Once you see it that way, the fix is mechanical.

> **TL;DR**
>
> - The export-for-sharing toggle ("Export for sharing externally" in Grafana 10 to 11) swaps every datasource for `${DS_<NAME>}` and lists them in `__inputs`. Only the Import dialog and the import API fill those in.
> - File provisioning, `POST /api/dashboards/db` and Terraform store the file verbatim, so the placeholder reaches the panel.
> - Find them: `jq -r 'paths(type == "string" and startswith("${DS_")) | map(tostring) | join(".")' dashboard.json`.
> - Fix by substituting a real `{ type, uid }`, pinning that uid in datasource provisioning, adding a datasource variable named `DS_PROMETHEUS`, or posting to `/api/dashboards/import` with `inputs`.

## Why does Grafana say "Datasource ${DS_PROMETHEUS} was not found"?

A panel's datasource reference goes through `DatasourceSrv.get()`, which runs the uid through the template service before looking it up. The template service returns any `${...}` it has no variable for [unchanged](https://github.com/grafana/grafana/blob/v13.2.2/public/app/features/templating/template_srv.ts). So the key stays the literal string `${DS_PROMETHEUS}`, no datasource has that uid or name, and [`loadDatasource()`](https://github.com/grafana/grafana/blob/v13.2.2/public/app/features/plugins/datasource_srv.ts) rejects with the message you see.

The placeholder got there during export. With the export toggle on, Grafana writes this:

```json
{
  "__inputs": [
    {
      "name": "DS_PROMETHEUS",
      "label": "Prometheus",
      "description": "",
      "type": "datasource",
      "pluginId": "prometheus",
      "pluginName": "Prometheus"
    }
  ],
  "panels": [
    {
      "type": "timeseries",
      "title": "Request rate",
      "datasource": { "type": "prometheus", "uid": "${DS_PROMETHEUS}" },
      "targets": [
        {
          "datasource": { "type": "prometheus", "uid": "${DS_PROMETHEUS}" },
          "expr": "sum(rate(http_requests_total{job=\"$job\"}[5m]))"
        }
      ]
    }
  ],
  "templating": {
    "list": [
      {
        "type": "query",
        "name": "job",
        "datasource": { "type": "prometheus", "uid": "${DS_PROMETHEUS}" },
        "query": "label_values(up, job)"
      }
    ]
  }
}
```

`__inputs` is a question for the importer: which of your datasources should replace `DS_PROMETHEUS`? The Import dialog asks it. The server-side [template evaluator](https://github.com/grafana/grafana/blob/v13.2.2/pkg/services/dashboardimport/utils/dash_template_evaluator.go) then replaces each declared `${name}` with the value you picked and drops `__inputs`.

Nothing else asks. Grafana's own source comment in [export_inputs.go](https://github.com/grafana/grafana/blob/v13.2.2/apps/dashboard/pkg/migration/conversion/export_inputs.go) says a template written through Terraform, provisioning or a direct POST "is stored verbatim" and that "DS_* inputs carry no value to substitute". The request to support this in provisioning, [grafana/grafana#10786](https://github.com/grafana/grafana/issues/10786), has been open since 2018.

> **Important:** Grafana 13.2.0 ([#129213](https://github.com/grafana/grafana/pull/129213)) started resolving `${VAR_*}` constant inputs in dashboards stored through provisioning or a direct POST. It explicitly does not resolve `DS_*` inputs, so on 13.2.2 this error behaves exactly as before.

On Grafana 7.x and early 8.x the same failure read `Datasource named ${DS_PROMETHEUS} was not found`, the wording most forum threads quote. A query variable pointed at the placeholder surfaces as a templating toast instead, reported in threads as `Error updating options: Datasource named ${DS_PROMETHEUS} was not found` or `Failed to upgrade legacy queries Datasource ${DS_PROMETHEUS} was not found`.

## Where does the name DS_PROMETHEUS come from?

From the datasource's display name, not its type. The [exporter](https://github.com/grafana/grafana/blob/v13.2.2/public/app/features/dashboard-scene/scene/export/exporters.ts) builds it as `'DS_' + ds.name.replace(' ', '_').toUpperCase()`. You get `DS_PROMETHEUS` only because the default name is "Prometheus". A datasource called "Thanos" exports as `${DS_THANOS}`.

That JavaScript `replace` with a string pattern changes only the first space. A datasource named "Prometheus Prod EU" exports as `${DS_PROMETHEUS_PROD EU}`, space included. Library panel references get a `-FOR-LIBRARY-PANEL` suffix, and constant variables become `VAR_<NAME>` inputs.

The toggle that produces all this has moved between versions:

- Grafana 10 to 11: **Export for sharing externally**.
- Grafana 11.2 to 12.3 also label it **Export the dashboard to use in another instance** (12.1 to 12.3 reach it through **Export** → **Export as code**).
- Grafana 12.4 and 13: **Export** → **Export as code**, toggle **Share dashboard with another instance**, with a Classic or V2 Resource model under Advanced options.

If you export for your own provisioning repo, leave the toggle off. The [sharing docs](https://grafana.com/docs/grafana/latest/dashboards/share-dashboards-panels/) cover the options per version.

## How do you confirm which placeholders are in the file?

Three checks, in this order. First, list what the file expects to be filled in:

```bash
jq -c '.__inputs[] | {name, pluginId}' dashboard.json
```

```text
{"name":"DS_PROMETHEUS","pluginId":"prometheus"}
```

Second, find every string that still holds a placeholder, including ones on query variables. Keep the filter in single quotes so the shell does not expand `${DS_...}`:

```bash
jq -r 'paths(type == "string" and startswith("${DS_")) | map(tostring) | join(".")' dashboard.json
```

```text
panels.0.datasource.uid
panels.0.targets.0.datasource.uid
templating.list.0.datasource.uid
```

`grep -nF '${DS_' dashboard.json` gives the same answer with line numbers. Third, list the uids that really exist on the target instance. `GET /api/datasources` returns `id`, `uid`, `orgId`, `name` and `type` per the [data source API docs](https://grafana.com/docs/grafana/latest/developers/http_api/data_source/):

```bash
curl -sS -H "Authorization: Bearer $GRAFANA_TOKEN" "$GRAFANA_URL/api/datasources" \
  | jq -r '.[] | [.uid, .name, .type] | @tsv'
```

To skip the jq, paste the dashboard JSON into the [Grafana Dashboard Validator](/grafana-dashboard-validator/). On the exported file above it reports one error, under the [unresolved-ds-input](/grafana-dashboard-validator/#rule-unresolved-ds-input) rule. The warnings beside it are about the trimmed excerpt, which has no uid, title, gridPos or schemaVersion:

```text
[error] unresolved-ds-input @ __inputs[0]
"__inputs" declares "DS_PROMETHEUS", an import placeholder that only the Grafana import dialog fills in.
```

Its limit: it reads the file only. A dashboard with a real-looking uid such as `P1809F7CD0C75ACF3` passes whether or not that uid exists on your instance, so confirm it against `/api/datasources`.

## Which cause is yours?

| What you see | Most likely cause |
|---|---|
| `__inputs` present, file loaded by provisioning or Terraform | Import-only file used as a provisioned file |
| No `__inputs`, `${DS_...}` still in panels | Placeholders left after `__inputs` was stripped |
| Error names a real-looking uid, not a placeholder | Uid differs between instances |
| `DS_PROMETHEUS` variable exists but is not `type: datasource` | Variable with the wrong type |

**1. An exported file was provisioned.** Tell: `__inputs` is present and the dashboard came in through the file provider, `/api/dashboards/db` or Terraform. Fix: substitute a real uid, or load it through the import API. Verify: the placeholder count below is 0.

**2. Placeholders without `__inputs`.** Tell: someone deleted `__inputs`, or a chart bundled the dashboard without it. The Import dialog then has nothing to ask, and the error survives a UI import. Fix: substitute, or add the datasource variable. Verify: the panels render after a reload.

**3. The uid does not exist here.** Tell: after substitution the error prints a uid. Grafana auto-generates a uid when provisioning does not set one, so staging and production disagree. Fix: pin the uid in datasource provisioning. Verify: `/api/datasources` lists it.

**4. A variable with the right name but the wrong type.** Tell: `templating.list` has `DS_PROMETHEUS`, but as a custom variable. It resolves to its own value, not a datasource uid. Fix: make it `type: datasource`. Verify: the CI guard below prints 0 for the file.

If the message has a colon, `Datasource: ${DS_PROMETHEUS} was not found`, the plugin failed to load. That is a different problem.

## How do you fix it for provisioning and the API?

**Substitute a real uid.** This `walk` replaces every placeholder object, including the query variable's, and drops the import-only keys:

```bash
jq --arg uid P1809F7CD0C75ACF3 \
  'walk(if type == "object" and .uid == "${DS_PROMETHEUS}"
        then .uid = $uid else . end)
   | del(.__inputs, .__requires)' \
  dashboard.json > dashboard.provisioned.json
```

Try the filter on your own file in the [jq playground](/jq-playground/), which runs real jq.

**Pin the uid so it matches everywhere.** Set `uid` in datasource provisioning, and the substituted value becomes true on every instance:

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    uid: prometheus-main
    access: proxy
    url: http://prometheus:9090
```

The dashboard provider needs nothing special, but know that it never reads `__inputs`:

```yaml
apiVersion: 1
providers:
  - name: platform
    orgId: 1
    folder: Platform
    type: file
    disableDeletion: true
    updateIntervalSeconds: 30
    allowUiUpdates: false
    options:
      path: /var/lib/grafana/dashboards
```

Both formats are in the [provisioning docs](https://grafana.com/docs/grafana/latest/administration/provisioning/).

**Keep the placeholder and define it.** A datasource-type variable with exactly the placeholder's name resolves `${DS_PROMETHEUS}` to a real uid. Its `query` is the plugin id:

```json
{
  "templating": {
    "list": [
      { "type": "datasource", "name": "DS_PROMETHEUS", "query": "prometheus" }
    ]
  }
}
```

**Use the import API.** `POST /api/dashboards/import` is the endpoint the Import dialog posts to. It needs `dashboards:create` and is missing from the current HTTP API docs, so its shape comes from source. Replace `<folder-uid>` with the target folder's real uid: the provider above creates the folder by title, so its uid is not necessarily `platform`.

```bash
jq -n --slurpfile dash dashboard.json \
  --arg uid prometheus-main --arg folder '<folder-uid>' \
  '{dashboard: $dash[0], overwrite: true, folderUid: $folder,
    inputs: [{name: "DS_PROMETHEUS", type: "datasource",
              pluginId: "prometheus", value: $uid}]}' \
  > payload.json

curl -sS -X POST \
  -H "Authorization: Bearer $GRAFANA_TOKEN" \
  -H "Content-Type: application/json" \
  --data @payload.json "$GRAFANA_URL/api/dashboards/import"
```

Leave an input out and it fails with HTTP 400, the message inside a JSON body:

```json
{"message":"dashboard import failed: missing dashboard input variable DS_PROMETHEUS"}
```

## Is deleting __inputs the fix that isn't a fix?

Yes. Deleting `__inputs` makes the file look like a normal dashboard, but every `${DS_PROMETHEUS}` stays. The error moves from "provisioned wrong" to cause 2, and now even the Import dialog cannot repair it, because the evaluator only substitutes names declared in `__inputs`.

The second false fix is replacing the placeholder with the datasource name, `"Prometheus"`. Grafana looks a key up by uid and then by name, so it works until someone renames the datasource or another instance names it differently. The validator flags the plain string form as [datasource-by-name](/grafana-dashboard-validator/#rule-datasource-by-name) for that reason.

> **Gotcha:** Renaming the datasource to match the placeholder changes nothing. The panel is looking for a datasource whose uid or name is the literal `${DS_PROMETHEUS}`.

## How do you stop it coming back in CI?

Fail the pipeline when a committed dashboard still has a placeholder that no datasource variable defines:

```bash
status=0
for f in dashboards/*.json; do
  n=$(jq '[.templating.list[]? | select(.type == "datasource") | .name] as $vars
    | [.. | strings | select(startswith("${DS_"))
       | ltrimstr("${") | rtrimstr("}")
       | select(IN($vars[]) | not)] | length' "$f")
  if [ "$n" -ne 0 ]; then echo "$f: $n unresolved placeholder(s)"; status=1; fi
done
exit "$status"
```

On the exported file it prints 3 for that dashboard. After the `walk` substitution, or with the `DS_PROMETHEUS` datasource variable in place, it prints 0.

Loop per file rather than passing a glob to `jq -e`, which sets its exit code from the last output only. Run the guard in the same job that copies dashboards into the provisioning path, so a failing file never reaches Grafana.

Pair it with the uid check, because a clean file can still name a uid that one environment lacks. The same discipline applies to the queries inside: [Reading PromQL](/blog/reading-promql/) covers what the panels are asking, and [LogQL vs PromQL](/blog/logql-vs-promql/) helps when a Loki panel sits beside them.

## What should you check before shipping a dashboard file?

1. Export with the sharing toggle off when the file is for your own provisioning repo.
2. Run the `paths(...)` filter and read every location it prints.
3. List uids with `GET /api/datasources` on each target instance.
4. Pin those uids in datasource provisioning, so every environment agrees.
5. Substitute with `walk`, or add a datasource variable per placeholder.
6. Drop `__inputs` and `__requires` only after substitution.
7. Use `/api/dashboards/import` with `inputs` if you must keep the shareable file.
8. Add the CI guard and require it before deploy.

Before the next dashboard lands in your provisioning folder, paste it into the [Grafana Dashboard Validator](/grafana-dashboard-validator/) and fix what it flags.

Do you keep exported, shareable dashboards and provisioned ones as separate files, or generate one from the other in CI?
