---
title: "Warum hat Prometheus mein Target verworfen? relabel_configs debuggen"
description: "Ein Target ist verschwunden oder ein Label ist nach dem Relabeling weg. relabel_configs vs. metric_relabel_configs debuggen, Regex-Anker und keep/drop-Logik verstehen."
pubDate: 2026-06-16
tags: ["prometheus","observability","relabeling"]
lang: de
translationOf: "debug-prometheus-relabeling"
relatedTool:
  name: "Prometheus Relabel Tester"
  href: "/prometheus-relabel-tester"
---

![Ein verworfenes Prometheus-Target debuggen: der Scrape-Lebenszyklus von der Service Discovery über relabel_configs bis zur TSDB, mit einem als verworfen markierten Target.](/blog/debug-prometheus-relabeling-hero.svg)

Du hast einen neuen Exporter hinzugefügt, Prometheus neu geladen, `/targets` geöffnet – und er ist nicht da. Kein Fehler in den Logs. Die Scrape-Config wurde sauber geparst. Der Exporter läuft und du kannst seinen `/metrics`-Endpunkt von Hand mit `curl` abrufen. Aber Prometheus hat dein Target verworfen und sagt dir nicht, warum. Oder schlimmer noch – das Target taucht auf, aber ein Label, auf das du dich fürs Routing oder für Dashboards verlässt, ist stillschweigend verschwunden. Beide Symptome führen fast immer an dieselbe Stelle zurück: `relabel_configs`. Dieser Beitrag zeigt, wie du `relabel_configs` debuggst, worin es sich von `metric_relabel_configs` unterscheidet und welche Handvoll Fehler für nahezu jedes verworfene Target verantwortlich ist.

## Das Symptom: ein fehlendes Target in /targets oder ein verschwundenes Label

Es gibt zwei klar verschiedene Fehlerbilder, und es hilft, sie zu benennen, bevor man mit dem Graben anfängt.

Das erste ist das **verworfene Target**: Es erscheint überhaupt nicht unter `/targets`, nicht einmal im Status "down". Die Service Discovery hat es gefunden, aber eine `keep`- oder `drop`-Regel hat es entfernt, bevor der Scrape lief. Prometheus loggt das nicht – aus seiner Sicht ist nichts schiefgegangen.

Das zweite ist das **verschwindende Label**: Das Target wird sauber gescraped, aber ein Label, das du erwartet hast, ist weg oder wurde mit etwas Unerwartetem überschrieben. Du siehst das in `/targets` (wenn du über die Labels fährst) oder indem du die Series abfragst und feststellst, dass die Dimension, nach der du gruppieren wolltest, nicht da ist.

```bash
# The target you expect is simply absent from the list:
curl -s localhost:9090/api/v1/targets | jq '.data.activeTargets[].labels.job'
# "node-exporter"
# "blackbox"
#   ← your "api" job never shows up
```

Wenn ein Target stillschweigend fehlt, liegt die Ursache vor dem Scrape. Das ist das Relabeling. Die gute Nachricht: Relabeling ist deterministisch. Bei gleichen Eingabe-Labels und gleichen Regeln bekommst du jedes Mal dasselbe Ergebnis – das heißt, du kannst es offline reproduzieren.

## relabel_configs vs. metric_relabel_configs: wo welches läuft

Die beiden Config-Blöcke wenden *exakt dieselben* Relabeling-Aktionen und dieselbe Semantik an. Der einzige Unterschied ist, **an welcher Stelle** im Scrape-Lebenszyklus sie laufen – und dieser Unterschied entscheidet, welches Symptom du gerade debuggst.

`relabel_configs` läuft **zur Scrape-Zeit, vor dem Scrape**, auf den Target-Labels, die aus der Service Discovery kommen. Das sind die Labels, die entscheiden, *ob ein Target überhaupt gescraped wird* und was seine Identität (`job`, `instance`, `__address__`) ist. Ein `keep`/`drop` hier entfernt ein ganzes Target. Das ist der Block, den du dir ansehen musst, wenn ein Target in `/targets` fehlt.

`metric_relabel_configs` läuft **nach dem Scrape**, auf dem Label-Set jedes einzelnen Samples, während es ingestiert wird. Ein `keep`/`drop` hier entfernt einzelne Time Series, nicht das Target. Das ist der Block, den du dir ansehen musst, wenn das Target vorhanden ist, aber bestimmte Series oder Labels fehlen.

![Der Prometheus-Scrape-Lebenszyklus: Service Discovery und __meta_-Labels, dann relabel_configs, das ein ganzes Target verwerfen kann, dann der Scrape, dann metric_relabel_configs, das einzelne Samples verwerfen kann, dann die TSDB.](/blog/debug-prometheus-relabeling-diagram.svg)

```yaml
scrape_configs:
  - job_name: api
    kubernetes_sd_configs:
      - role: pod

    # Runs BEFORE the scrape, on discovery labels (__meta_*, __address__).
    # A keep/drop here removes the whole target.
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: "true"

    # Runs AFTER the scrape, on each sample. A drop here removes series,
    # not the target.
    metric_relabel_configs:
      - source_labels: [__name__]
        action: drop
        regex: go_gc_.*
```

Wenn dein Target fehlt, erreichst du `metric_relabel_configs` gar nicht erst – debugge zuerst `relabel_configs`. Wenn das Target vorhanden ist, aber eine Series weg ist, ist es der andere Block. Diese Unterscheidung sauber hinzubekommen, ist die halbe Miete, wenn du um 2 Uhr nachts nach "metric_relabel_configs vs relabel_configs" suchst.

## Die üblichen Verdächtigen

Fast jedes verworfene Target geht auf einen dieser Fehler zurück. Jeder davon ist leicht gemacht und bleibt unsichtbar, bis du ihn reproduzierst.

### Eine keep-Regex, die nicht matcht (weil die Regex verankert ist)

Das ist die Ursache Nummer eins. **Prometheus verankert jede Relabel-Regex** – intern verpackt es dein Muster als `^(?:<deine regex>)$`. Das Muster muss den *gesamten* zusammengefügten Quellwert matchen, nicht nur einen Teilstring.

```yaml
- source_labels: [job]
  action: keep
  regex: api          # anchored to ^(?:api)$
```

Das behält ein Target, dessen `job` exakt `api` ist. Es behält **nicht** `api-server`, `api-prod` oder `payments-api`. Bei einer `keep`-Aktion wird alles verworfen, was nicht matcht – dein `api-server`-Target verschwindet also stillschweigend. Die Lösung ist, das zu matchen, was du tatsächlich meinst:

```yaml
- source_labels: [job]
  action: keep
  regex: api.*        # ^(?:api.*)$ — matches api, api-server, api-prod
```

### Ein drop, das zu breit greift

Das Spiegelbild davon. Ein unverankertes mentales Modell plus eine gierige Regex erwischt mehr als beabsichtigt:

```yaml
- source_labels: [__name__]
  action: drop
  regex: .*_bucket   # drops EVERY *_bucket series, including ones you need
```

`keep` ist ein Allowlist-Gate; `drop` ist ein Denylist-Gate. Ein zu breites `drop` in `metric_relabel_configs` löscht klammheimlich Series, die du behalten wolltest, und du bemerkst es erst, wenn ein Dashboard leer bleibt.

### Falsche source_labels oder der falsche Join

Wenn eine Regel mehrere `source_labels` auflistet, fügt Prometheus deren Werte mit dem **separator** zusammen – der standardmäßig ein einzelnes Semikolon `;` ist – *bevor* es die Regex matcht. Wenn du den Separator vergisst, matcht deine Regex den zusammengefügten String nie:

```yaml
# job="api", instance="10.0.0.1:9090" joins to "api;10.0.0.1:9090"
- source_labels: [job, instance]
  action: keep
  regex: api          # ✗ never matches "api;10.0.0.1:9090"
```

Du brauchst eine Regex, die das `;` berücksichtigt, z. B. `api;.*`. Ein fehlendes Quell-Label ist ebenfalls kein Fehler – Prometheus behandelt ein nicht vorhandenes Label beim Zusammenfügen als leeren String, sodass `source_labels: [does_not_exist]` zu `""` zusammengefügt wird und ein `keep: regex: ".+"` alles verwirft.

### Ein replacement, das __address__ überschrieben (oder ein Label gelöscht) hat

`replace` hat ein subtiles, reales Verhalten: **Matcht die Regex nicht, bleibt das Label unverändert; matcht sie aber und das expandierte replacement ist der leere String, wird das Target-Label gelöscht, nicht auf leer gesetzt.** Überschreibe `__address__` mit einem leeren Wert, und das Target verliert faktisch seine Scrape-Adresse.

```yaml
# If prometheus_io_port is absent, the joined value won't match this regex,
# so __address__ is left alone. But a regex that DOES match and expands to ""
# would DELETE __address__ entirely.
- source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
  action: replace
  regex: ([^:]+)(?::\d+)?;(\d+)
  replacement: $1:$2
  target_label: __address__
```

Das ist der heimtückischste Fall, denn ein leeres `instance` oder `__address__` wirft keinen Fehler – es erzeugt einfach ein Target, das nicht gescraped werden kann oder mit einem anderen kollidiert.

## Ein Debugging-Workflow

Wenn ein Target fehlt, arbeite von oben nach unten. Der ganze Sinn besteht darin, die *exakte Eingabe* zu rekonstruieren, die die Regeln gesehen haben, und die Regeln dann erneut darauf anzuwenden.

### 1. Die Target-Labels ausgeben, inklusive __meta_

Prometheus stellt die Discovery-Labels vor dem Relabeling – die `__meta_*`-Labels – bereit, aber nur für Targets, die das Relabeling überlebt haben. Ein vollständig verworfenes Target taucht also nicht auf. Der Trick ist, mit vorübergehend entfernten Relabel-Regeln neu zu laden (oder sie auf ein einziges, freizügiges `keep` einzudampfen) und dann die rohen Discovery-Labels auszulesen:

```bash
# Show discovered labels for the job, including the __meta_* set the
# relabel rules actually see as input.
curl -s 'localhost:9090/api/v1/targets?state=active' \
  | jq '.data.activeTargets[]
        | select(.discoveredLabels.job=="api")
        | .discoveredLabels'
```

`discoveredLabels` ist die Eingabe deiner `relabel_configs`. `labels` ist die Ausgabe. Wenn ein Target komplett verworfen wird, kannst du auch den Zustand der Service Discovery direkt auslesen:

```bash
curl -s localhost:9090/api/v1/targets/metadata >/dev/null  # sanity check API is up
curl -s 'localhost:9090/service-discovery' # the SD page shows pre-relabel labels
```

### 2. Die Regeln gegen diese Labels testen

Jetzt hast du die Eingabe. Füge die `__meta_*`-Labels und deine `relabel_configs` in [den Prometheus Relabel Tester](/prometheus-relabel-tester/) ein und lass sie laufen. Er wendet die Regeln genau so an, wie Prometheus es tut – verankerte Regex, `;`-Separator, `$1`/`${1}`-Expansion – und sagt dir pro Label-Set die resultierenden Labels, welche hinzugefügt, geändert oder entfernt wurden und ob das Target verworfen wurde (und von welcher Regel).

### 3. Die Regelliste per Bisektion eingrenzen

Wenn du eine lange Kette hast, kommentiere die zweite Hälfte der Regeln aus und führe sie erneut aus. Überlebt das Target, steckt der Übeltäter in der Hälfte, die du entfernt hast; wird es weiterhin verworfen, steckt er in der verbliebenen Hälfte. Halbiere erneut. Weil Relabeling eine deterministische Kette von oben nach unten ist – jede Regel sieht die Ausgabe der vorigen –, konvergiert die Bisektion schnell, meist in zwei oder drei Runden.

## Durchgespieltes Beispiel: das verschwindende Target, gefunden und behoben

Hier ist eine reale Ausprägung dieses Bugs. Du discoverst einen Pod, willst nur die opt-in-Pods behalten und nach Umgebung routen. Das Target taucht nie auf.

```yaml
relabel_configs:
  - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
    action: keep
    regex: "true"

  - source_labels: [__meta_kubernetes_pod_label_env]
    action: keep
    regex: prod
```

Die Discovery-Labels für das Target, das du erwartet hast:

```text
__meta_kubernetes_pod_annotation_prometheus_io_scrape="true"
__meta_kubernetes_pod_label_app="api"
__meta_kubernetes_pod_label_env="production"
__address__="10.0.0.5:8080"
```

Lass diese Eingabe durch die Regeln laufen. Das erste `keep` passt – `prometheus_io_scrape` ist exakt `"true"`. Das zweite `keep` fügt zu `production` zusammen und versucht, `^(?:prod)$` zu matchen. Das tut es nicht. `production` ist nicht `prod`, die Regex ist verankert, und `keep` verwirft alles, was nicht matcht. **Regel 2 hat das Target verworfen.** Der Tester markiert genau das: verworfen von Regel 2, Aktion `keep`.

Die Lösung ist, den echten Wert zu matchen:

```yaml
  - source_labels: [__meta_kubernetes_pod_label_env]
    action: keep
    regex: prod.*       # ^(?:prod.*)$ — now matches "production"
```

Erneut ausführen. Das Target überlebt, trägt `__address__="10.0.0.5:8080"` und erscheint in `/targets`. Gesamtdauer: unter einer Minute, ohne Prometheus-Reload und ohne auf ein Scrape-Intervall zu warten.

Während du dabei aufräumst, befördert dieselbe Kette oft Pod-Labels und entfernt Discovery-Metadaten. Beachte, dass `labelmap` auf den Label-*Namen* operiert und passende Labels auf einen neuen Namen kopiert, während `labeldrop` Labels entfernt, deren Namen matchen – nützlich, aber eine weitere Stelle, an der ein Label, das du wolltest, stillschweigend verschwinden kann:

```yaml
  # Promote pod labels: __meta_kubernetes_pod_label_app="api" → app="api"
  - action: labelmap
    regex: __meta_kubernetes_pod_label_(.+)

  # Strip leftover discovery metadata before storage.
  - action: labeldrop
    regex: __meta_.+
```

## Vor dem Deploy abfangen

Die schnellste Debugging-Schleife ist die, die nie ein laufendes Prometheus erreicht. Der Grund, warum Relabeling so leicht falsch zu machen ist, liegt darin, dass es stillschweigend fehlschlägt: kein Parse-Fehler, keine Log-Zeile, nur ein Target, das nicht da ist. Die einzige ehrliche Prüfung ist, die Regeln gegen repräsentative Eingaben laufen zu lassen und die Ausgabe zu lesen – dieselbe Idee, die dahintersteckt, jede verhaltensbasierte Config zu testen, statt einem Schema-Lint zu vertrauen.

Wenn du vor einem "Prometheus dropped target"-Rätsel oder einem "Prometheus label disappeared"-Report sitzt, schnapp dir die `discoveredLabels` aus der API, füge sie mit deinen Regeln in [den Prometheus Relabel Tester](/prometheus-relabel-tester/) ein und beobachte, welche Regel den Schaden anrichtet – er läuft vollständig in deinem Browser, sodass interne Scrape-Configs und Target-Metadaten deinen Tab nie verlassen.

Sind die Labels erst einmal korrekt, folgt der Rest der Observability-Kette von selbst. Zerlege eine Query, die von diesen Labels abhängt, mit [dem PromQL Explainer](/promql-explainer/), oder prüfe mit [dem Alertmanager Route Tester](/alertmanager-route-tester/), ob ein Alert auf den resultierenden Series am richtigen Ort landet. Bring zuerst die Labels in Form; alles Nachgelagerte hängt davon ab, dass dieser Schritt stimmt.
