---
title: "Datasource ${DS_PROMETHEUS} was not found: Ursachen & Fixes"
description: "Warum provisionierte Grafana-Dashboards Datasource ${DS_PROMETHEUS} was not found melden, wie jq jeden Platzhalter findet und welche vier Fixes CI überstehen."
pubDate: 2026-10-19
draft: true
tags: ["observability", "prometheus"]
lang: de
translationOf: "grafana-datasource-was-not-found"
relatedTool:
  name: "Grafana Dashboard Validator"
  href: "/grafana-dashboard-validator"
---

![Ein exportiertes Grafana-Dashboard, dessen Panels noch auf einen nicht ausgefüllten DS_PROMETHEUS-Platzhalter zeigen statt auf eine echte Prometheus-Datasource](/blog/grafana-datasource-was-not-found-hero.svg)
<!-- keywords: primary: datasource ${ds_prometheus} was not found (<100, n/a) | secondaries: grafana ds_prometheus not found, ds_prometheus not found, grafana datasource not found, grafana __inputs | source: ahrefs free (2026-09-26) -->
<!-- insight: the error text is a lookup key: the exporter names the placeholder from the datasource NAME (first space only), TemplateSrv returns an unknown ${...} unchanged, and provisioning, POST /api/dashboards/db and Terraform store the file verbatim, so DS_* inputs carry no value to substitute, still true in 13.2 | serp-checked: 2026-09-26 -->

Du hast ein Dashboard aus Staging exportiert, das JSON neben deine Provisioning-Config committet und Grafana neu ausgerollt. Das Dashboard taucht im richtigen Ordner auf. Jedes Panel ist leer, und jedes trägt dieselbe rote Ecke:

```text
Datasource ${DS_PROMETHEUS} was not found
```

Deine Prometheus-Datasource existiert und funktioniert in Explore. Dieser Grafana-Fehler „datasource not found", oft auch als „DS_PROMETHEUS not found" gesucht, bedeutet nicht, dass die Datasource fehlt. Grafana gibt wörtlich den Lookup-Schlüssel aus, den es bekommen hat – und dieser Schlüssel ist ein Platzhalter, den niemand ausgefüllt hat. Wer das einmal so sieht, für den ist der Fix reine Mechanik.

> **TL;DR**
>
> - Der Export-Schalter zum Teilen („Export for sharing externally" in Grafana 10 bis 11) ersetzt jede Datasource durch `${DS_<NAME>}` und listet sie in `__inputs` auf. Ausgefüllt werden sie nur vom Import-Dialog und von der Import-API.
> - File Provisioning, `POST /api/dashboards/db` und Terraform speichern die Datei unverändert, also landet der Platzhalter im Panel.
> - So findest du sie: `jq -r 'paths(type == "string" and startswith("${DS_")) | map(tostring) | join(".")' dashboard.json`.
> - Die Fixes: ein echtes `{ type, uid }` einsetzen, diese uid im Datasource-Provisioning festnageln, eine Datasource-Variable namens `DS_PROMETHEUS` anlegen oder mit `inputs` an `/api/dashboards/import` posten.

## Warum meldet Grafana „Datasource ${DS_PROMETHEUS} was not found"?

Die Datasource-Referenz eines Panels läuft durch `DatasourceSrv.get()`, das die uid vor dem Lookup durch den Template-Service schickt. Der Template-Service gibt jedes `${...}`, für das er keine Variable kennt, [unverändert](https://github.com/grafana/grafana/blob/v13.2.2/public/app/features/templating/template_srv.ts) zurück. Der Schlüssel bleibt also der wörtliche String `${DS_PROMETHEUS}`, keine Datasource hat diese uid oder diesen Namen, und [`loadDatasource()`](https://github.com/grafana/grafana/blob/v13.2.2/public/app/features/plugins/datasource_srv.ts) bricht mit genau der Meldung ab, die du siehst.

Hineingekommen ist der Platzhalter beim Export. Mit aktiviertem Export-Schalter schreibt Grafana Folgendes:

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

`__inputs` ist eine Frage an den Importierenden: Welche deiner Datasources soll `DS_PROMETHEUS` ersetzen? Der Import-Dialog stellt sie. Der serverseitige [Template-Evaluator](https://github.com/grafana/grafana/blob/v13.2.2/pkg/services/dashboardimport/utils/dash_template_evaluator.go) ersetzt danach jedes deklarierte `${name}` durch den gewählten Wert und entfernt `__inputs`.

Sonst fragt niemand. Grafanas eigener Quellcode-Kommentar in [export_inputs.go](https://github.com/grafana/grafana/blob/v13.2.2/apps/dashboard/pkg/migration/conversion/export_inputs.go) hält fest, dass ein Template, das über Terraform, Provisioning oder einen direkten POST geschrieben wird, „is stored verbatim" und dass „DS_* inputs carry no value to substitute". Der Wunsch, das im Provisioning zu unterstützen, [grafana/grafana#10786](https://github.com/grafana/grafana/issues/10786), ist seit 2018 offen.

> **Wichtig:** Seit Grafana 13.2.0 ([#129213](https://github.com/grafana/grafana/pull/129213)) werden `${VAR_*}`-Konstanten-Inputs in Dashboards aufgelöst, die über Provisioning oder einen direkten POST gespeichert werden. `DS_*`-Inputs löst Grafana ausdrücklich nicht auf – auf 13.2.2 verhält sich dieser Fehler also genau wie vorher.

In Grafana 7.x und frühen 8.x lautete derselbe Fehler `Datasource named ${DS_PROMETHEUS} was not found` – die Formulierung, die die meisten Forenthreads zitieren. Zeigt eine Query-Variable auf den Platzhalter, erscheint stattdessen ein Templating-Toast, in Threads berichtet als `Error updating options: Datasource named ${DS_PROMETHEUS} was not found` oder `Failed to upgrade legacy queries Datasource ${DS_PROMETHEUS} was not found`.

## Woher kommt der Name DS_PROMETHEUS?

Vom Anzeigenamen der Datasource, nicht von ihrem Typ. Der [Exporter](https://github.com/grafana/grafana/blob/v13.2.2/public/app/features/dashboard-scene/scene/export/exporters.ts) baut ihn als `'DS_' + ds.name.replace(' ', '_').toUpperCase()`. Du bekommst `DS_PROMETHEUS` nur, weil der Standardname „Prometheus" ist. Eine Datasource namens „Thanos" wird als `${DS_THANOS}` exportiert.

JavaScripts `replace` mit einem String-Muster ersetzt nur das erste Leerzeichen. Eine Datasource namens „Prometheus Prod EU" wird deshalb als `${DS_PROMETHEUS_PROD EU}` exportiert, inklusive Leerzeichen. Referenzen auf Library Panels bekommen das Suffix `-FOR-LIBRARY-PANEL`, und Konstanten-Variablen werden zu `VAR_<NAME>`-Inputs.

Der Schalter, der all das erzeugt, ist zwischen den Versionen gewandert:

- Grafana 10 bis 11: **Export for sharing externally**.
- Grafana 11.2 bis 12.3 beschriften ihn zusätzlich mit **Export the dashboard to use in another instance** (12.1 bis 12.3 erreichen ihn über **Export** → **Export as code**).
- Grafana 12.4 und 13: **Export** → **Export as code**, Schalter **Share dashboard with another instance**, mit einem Classic- oder V2-Resource-Modell unter Advanced options.

Wenn du für dein eigenes Provisioning-Repo exportierst, lass den Schalter aus. Die [Sharing-Doku](https://grafana.com/docs/grafana/latest/dashboards/share-dashboards-panels/) beschreibt die Optionen pro Version.

## Wie prüfst du, welche Platzhalter in der Datei stecken?

Drei Prüfungen, in dieser Reihenfolge. Erstens: Liste auf, was die Datei ausgefüllt haben möchte:

```bash
jq -c '.__inputs[] | {name, pluginId}' dashboard.json
```

```text
{"name":"DS_PROMETHEUS","pluginId":"prometheus"}
```

Zweitens: Finde jeden String, der noch einen Platzhalter enthält, auch die in Query-Variablen. Lass den Filter in einfachen Anführungszeichen, damit die Shell `${DS_...}` nicht expandiert:

```bash
jq -r 'paths(type == "string" and startswith("${DS_")) | map(tostring) | join(".")' dashboard.json
```

```text
panels.0.datasource.uid
panels.0.targets.0.datasource.uid
templating.list.0.datasource.uid
```

`grep -nF '${DS_' dashboard.json` liefert dieselbe Antwort mit Zeilennummern. Drittens: Liste die uids auf, die auf der Zielinstanz wirklich existieren. `GET /api/datasources` gibt laut [Data-Source-API-Doku](https://grafana.com/docs/grafana/latest/developers/http_api/data_source/) pro Eintrag `id`, `uid`, `orgId`, `name` und `type` zurück:

```bash
curl -sS -H "Authorization: Bearer $GRAFANA_TOKEN" "$GRAFANA_URL/api/datasources" \
  | jq -r '.[] | [.uid, .name, .type] | @tsv'
```

Wenn du dir das jq sparen willst, füge das Dashboard-JSON in den [Grafana Dashboard Validator](/de/grafana-dashboard-validator/) ein. Für die exportierte Datei oben meldet er einen Fehler, unter der Regel [unresolved-ds-input](/de/grafana-dashboard-validator/#rule-unresolved-ds-input). Die Warnungen daneben betreffen nur den gekürzten Ausschnitt, dem uid, title, gridPos und schemaVersion fehlen:

```text
[error] unresolved-ds-input @ __inputs[0]
"__inputs" declares "DS_PROMETHEUS", an import placeholder that only the Grafana import dialog fills in.
```

Seine Grenze: Er liest nur die Datei. Ein Dashboard mit einer echt aussehenden uid wie `P1809F7CD0C75ACF3` besteht die Prüfung, ob diese uid auf deiner Instanz existiert oder nicht – gleiche sie also mit `/api/datasources` ab.

## Welche Ursache ist deine?

| Was du siehst | Wahrscheinlichste Ursache |
|---|---|
| `__inputs` vorhanden, Datei per Provisioning oder Terraform geladen | Reine Import-Datei als provisionierte Datei verwendet |
| Kein `__inputs`, aber `${DS_...}` noch in den Panels | Platzhalter übrig, nachdem `__inputs` entfernt wurde |
| Fehler nennt eine echt aussehende uid, keinen Platzhalter | Uid unterscheidet sich zwischen Instanzen |
| Variable `DS_PROMETHEUS` existiert, ist aber nicht `type: datasource` | Variable mit falschem Typ |

**1. Eine exportierte Datei wurde provisioniert.** Das Erkennungszeichen: `__inputs` ist vorhanden, und das Dashboard kam über den File Provider, `/api/dashboards/db` oder Terraform herein. Die Lösung: eine echte uid einsetzen oder die Datei über die Import-API laden. Prüfe, dass der Platzhalter-Zähler weiter unten 0 ergibt.

**2. Platzhalter ohne `__inputs`.** Das Erkennungszeichen: Jemand hat `__inputs` gelöscht, oder ein Chart hat das Dashboard ohne ausgeliefert. Der Import-Dialog hat dann nichts zu fragen, und der Fehler übersteht sogar einen Import über die UI. Die Lösung: ersetzen oder die Datasource-Variable anlegen. Prüfe, dass die Panels nach einem Reload rendern.

**3. Die uid existiert hier nicht.** Das Erkennungszeichen: Nach dem Ersetzen nennt der Fehler eine uid. Grafana generiert automatisch eine uid, wenn das Provisioning keine setzt, also sind sich Staging und Produktion uneinig. Die Lösung: die uid im Datasource-Provisioning festnageln. Prüfe, dass `/api/datasources` sie auflistet.

**4. Eine Variable mit dem richtigen Namen, aber dem falschen Typ.** Das Erkennungszeichen: `templating.list` enthält `DS_PROMETHEUS`, aber als Custom-Variable. Sie löst sich zu ihrem eigenen Wert auf, nicht zu einer Datasource-uid. Die Lösung: Mach daraus `type: datasource`. Prüfe, dass der CI-Guard weiter unten für die Datei 0 ausgibt.

Steht in der Meldung ein Doppelpunkt, `Datasource: ${DS_PROMETHEUS} was not found`, dann konnte das Plugin nicht geladen werden. Das ist ein anderes Problem.

## Wie behebst du es für Provisioning und die API?

**Eine echte uid einsetzen.** Dieses `walk` ersetzt jedes Platzhalter-Objekt, auch das der Query-Variable, und entfernt die Schlüssel, die nur für den Import gedacht sind:

```bash
jq --arg uid P1809F7CD0C75ACF3 \
  'walk(if type == "object" and .uid == "${DS_PROMETHEUS}"
        then .uid = $uid else . end)
   | del(.__inputs, .__requires)' \
  dashboard.json > dashboard.provisioned.json
```

Probier den Filter mit deiner eigenen Datei im [jq Playground](/de/jq-playground/) aus, der echtes jq ausführt.

**Die uid festnageln, damit sie überall passt.** Setz `uid` im Datasource-Provisioning, dann stimmt der eingesetzte Wert auf jeder Instanz:

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    uid: prometheus-main
    access: proxy
    url: http://prometheus:9090
```

Der Dashboard-Provider braucht nichts Besonderes – du solltest nur wissen, dass er `__inputs` nie liest:

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

Beide Formate stehen in der [Provisioning-Doku](https://grafana.com/docs/grafana/latest/administration/provisioning/).

**Den Platzhalter behalten und definieren.** Eine Variable vom Typ Datasource, die exakt wie der Platzhalter heißt, löst `${DS_PROMETHEUS}` zu einer echten uid auf. Ihre `query` ist die Plugin-ID:

```json
{
  "templating": {
    "list": [
      { "type": "datasource", "name": "DS_PROMETHEUS", "query": "prometheus" }
    ]
  }
}
```

**Die Import-API verwenden.** `POST /api/dashboards/import` ist der Endpunkt, an den der Import-Dialog postet. Er braucht `dashboards:create` und fehlt in der aktuellen HTTP-API-Doku, seine Form stammt also aus dem Quellcode. Ersetze `<folder-uid>` durch die echte uid des Zielordners: Der Provider oben legt den Ordner über seinen Titel an, seine uid ist also nicht zwingend `platform`.

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

Lässt du einen Input weg, schlägt der Aufruf mit HTTP 400 fehl, die Meldung steckt in einem JSON-Body:

```json
{"message":"dashboard import failed: missing dashboard input variable DS_PROMETHEUS"}
```

## Ist das Löschen von __inputs der Fix, der keiner ist?

Ja. Wer `__inputs` löscht, lässt die Datei wie ein normales Dashboard aussehen, aber jedes `${DS_PROMETHEUS}` bleibt stehen. Der Fehler wandert von „falsch provisioniert" zu Ursache 2, und jetzt kann ihn nicht einmal mehr der Import-Dialog reparieren, weil der Evaluator nur Namen ersetzt, die in `__inputs` deklariert sind.

Der zweite Schein-Fix: den Platzhalter durch den Namen der Datasource ersetzen, `"Prometheus"`. Grafana sucht einen Schlüssel erst über die uid und dann über den Namen, also funktioniert das – bis jemand die Datasource umbenennt oder eine andere Instanz sie anders nennt. Genau deshalb markiert der Validator die reine String-Form als [datasource-by-name](/de/grafana-dashboard-validator/#rule-datasource-by-name).

> **Achtung:** Die Datasource so umzubenennen, dass sie zum Platzhalter passt, ändert nichts. Das Panel sucht eine Datasource, deren uid oder Name wörtlich `${DS_PROMETHEUS}` ist.

## Wie verhinderst du, dass er in CI zurückkommt?

Lass die Pipeline scheitern, wenn ein committetes Dashboard noch einen Platzhalter enthält, den keine Datasource-Variable definiert:

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

Für die exportierte Datei gibt er bei diesem Dashboard 3 aus. Nach dem Ersetzen per `walk` oder mit der `DS_PROMETHEUS`-Datasource-Variable an Ort und Stelle gibt er 0 aus.

Geh pro Datei in einer Schleife durch, statt `jq -e` einen Glob zu übergeben – `jq -e` setzt seinen Exit-Code nur anhand der letzten Ausgabe. Führe den Guard im selben Job aus, der die Dashboards in den Provisioning-Pfad kopiert, damit eine fehlerhafte Datei Grafana nie erreicht.

Kombiniere ihn mit der uid-Prüfung, denn auch eine saubere Datei kann eine uid nennen, die einer Umgebung fehlt. Dieselbe Disziplin gilt für die Abfragen darin: [PromQL lesen](/de/blog/reading-promql/) erklärt, was die Panels eigentlich fragen, und [LogQL vs. PromQL](/de/blog/logql-vs-promql/) hilft, wenn ein Loki-Panel daneben sitzt.

## Was solltest du prüfen, bevor du eine Dashboard-Datei auslieferst?

1. Exportiere mit ausgeschaltetem Sharing-Schalter, wenn die Datei für dein eigenes Provisioning-Repo ist.
2. Führe den `paths(...)`-Filter aus und lies jede Stelle, die er ausgibt.
3. Liste die uids mit `GET /api/datasources` auf jeder Zielinstanz auf.
4. Nagle diese uids im Datasource-Provisioning fest, damit alle Umgebungen übereinstimmen.
5. Ersetze mit `walk`, oder lege pro Platzhalter eine Datasource-Variable an.
6. Entferne `__inputs` und `__requires` erst nach dem Ersetzen.
7. Nutze `/api/dashboards/import` mit `inputs`, wenn du die teilbare Datei behalten musst.
8. Füge den CI-Guard hinzu und mach ihn vor dem Deploy zur Pflicht.

Bevor das nächste Dashboard in deinem Provisioning-Ordner landet, füge es in den [Grafana Dashboard Validator](/de/grafana-dashboard-validator/) ein und behebe, was er markiert.

Hältst du exportierte, teilbare Dashboards und provisionierte als getrennte Dateien vor, oder erzeugst du das eine in CI aus dem anderen?
