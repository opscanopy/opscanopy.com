---
title: "Prometheus relabel_configs erklärt: Ein Praxisleitfaden"
description: "Verstehe Prometheus relabel_configs von Anfang bis Ende — source_labels, regex, replacement und jede Action (replace, keep, drop, labelmap, hashmod) — mit Rezepten zum Kopieren und Einfügen."
pubDate: 2026-06-13
tags: ["prometheus","observability","relabeling"]
lang: de
translationOf: "prometheus-relabel-configs-explained"
relatedTool:
  name: "Prometheus Relabel Tester"
  href: "/prometheus-relabel-tester"
---

![Diagramm einer Prometheus-relabel_configs-Pipeline, das zeigt, wie source_labels zu einem Wert zusammengefügt, gegen einen verankerten Regex abgeglichen und durch eine Action wie replace, keep, drop, labelmap oder hashmod zu den Ausgabe-Labels umgeschrieben werden.](/blog/prometheus-relabel-configs-explained-hero.svg)

Ein Target, das du eigentlich scrapen wolltest, taucht in Prometheus einfach nicht auf. Kein Fehler in den Logs, kein fehlgeschlagener Scrape, nichts Rotes auf der Targets-Seite — die Serie ist schlicht nicht da. Du fügst `--log.level=debug` hinzu, startest neu, kniffst die Augen über der Ausgabe zusammen und findest es schließlich: Eine `keep`-Regel drei Zeilen tief in deinen `relabel_configs` hat das Target klammheimlich verworfen, weil der Regex nicht so gegriffen hat, wie du angenommen hattest. Genau dieses stille Versagen ist der Grund, warum `relabel_configs` eine sorgfältige Lektüre verdient. Prometheus-Relabeling schreibt Targets und ihre Labels um, behält sie oder verwirft sie — und wenn es falsch ist, beschwert es sich nicht, es wirft deine Metriken einfach weg.

Dieser Leitfaden führt dich von Grund auf durch Prometheus-Relabeling: was es tut, aus welchen Feldern jede Regel aufgebaut ist und jede Action mit einem kleinen Beispiel. Die Semantik hier entspricht exakt dem, was die Engine im [Prometheus Relabel Tester](/prometheus-relabel-tester) implementiert — du kannst also jeden Snippet von unten dort einfügen und zusehen, wie sich die Labels verändern.

## Was Relabeling eigentlich tut

Relabeling läuft über eine Label-Menge und erzeugt eine neue Label-Menge. Das ist alles. Jedes Target, das Prometheus entdeckt, kommt als ein Bündel von Labels an — seine Adresse, sein Job und ein Haufen `__meta_*`-Labels aus der Service Discovery. Bevor der Scrape passiert, laufen deine `relabel_configs`-Regeln von oben nach unten über diese Labels. Jede Regel sieht die Ausgabe der vorhergehenden.

Eine Regel kann mit dieser Label-Menge eine von drei Sachen tun:

- **Ein Label umschreiben** (oder eines erzeugen) — `replace`, `labelmap`, `lowercase`, `uppercase`, `hashmod`.
- **Das ganze Target verwerfen**, sodass es nie gescrapt wird — `keep`, `drop`, `keepequal`, `dropequal`.
- **Einzelne Labels nach Namen entfernen** — `labeldrop`, `labelkeep`.

```yaml
scrape_configs:
  - job_name: api
    static_configs:
      - targets: ["10.0.0.5:8080"]
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
```

Nachdem diese Regel gelaufen ist, trägt das Target ein `instance`-Label, das aus `__address__` kopiert wurde. Nichts ist fehlgeschlagen, nichts wurde verworfen — ein Label wurde umgeschrieben. Das ist die gesamte Aufgabe des Relabeling, Regel für Regel wiederholt.

Es gibt zwei Stellen, an denen Relabeling läuft. `relabel_configs` läuft *vor* dem Scrape, auf den Discovery-Labels des Targets, und kann ganze Targets behalten oder verwerfen. `metric_relabel_configs` läuft *nach* dem Scrape, auf den Labels jedes einzelnen Samples, und dient dazu, einzelne Zeitreihen zu verwerfen oder umzuschreiben. Gleiche Actions, gleiche Semantik — nur das Timing und die Eingabe unterscheiden sich.

## Die Bausteine: source_labels, separator, regex, modulus, target_label, replacement, action

Jede Relabel-Regel ist aus derselben Handvoll Felder zusammengesetzt. Die meisten haben Defaults, sodass eine Regel selten alle davon setzt.

```yaml
- source_labels: [job, instance]   # which label values to read
  separator: ";"                   # how to join them (default ";")
  regex: "(.*);(.*)"               # pattern to match the joined value (default "(.*)")
  modulus: 8                       # only for hashmod
  target_label: combined           # label to write (required by some actions)
  replacement: "$1-$2"             # value to write, with $1/${1} expansion (default "$1")
  action: replace                  # what to do (default "replace")
```

So verarbeitet eine Regel das. Prometheus liest jeden Namen in `source_labels`, schlägt seinen Wert nach (ein fehlendes Label wird als leerer String gelesen) und fügt sie mit `separator` zusammen. Der Standard-Separator ist ein einzelnes Semikolon, also erzeugt `source_labels: [job, instance]` bei `job="api"`, `instance="10.0.0.1:9090"` den zusammengefügten Wert `api;10.0.0.1:9090`.

Dieser zusammengefügte Wert wird gegen `regex` abgeglichen. Das eine Detail, das jeden erwischt: **der Regex ist vollständig verankert**. Prometheus umschließt dein Pattern als `^(?:dein-regex)$`, sodass es den *gesamten* zusammengefügten Wert treffen muss, nicht nur einen Teil davon.

```yaml
# This does NOT match "api-server" — the regex must match the whole value.
- source_labels: [job]
  regex: api
  action: keep
```

Eine `regex: api`-Regel behält kein Target, dessen `job` gleich `api-server` ist, weil `^(?:api)$` nur den wörtlichen String `api` trifft. Du bräuchtest `api.*` oder `(api.*)`. Diese eine Tatsache erklärt den Großteil der „Mein Target ist verschwunden"-Rätsel.

Wenn der Regex trifft und die Action ein Label schreibt, liefert `replacement` den Wert. Capture-Gruppen werden als `$1`, `${1}` oder benannte Gruppen `$name`/`${name}` expandiert; das Standard-`replacement` ist `$1`, weshalb ein nacktes `replace` mit `regex: (.*)` den Quellwert unverändert durchreicht. `modulus` wird nur von `hashmod` gelesen, und `target_label` wird von `replace`, `hashmod`, `lowercase`, `uppercase`, `keepequal` und `dropequal` benötigt.

![Synthwave-Illustration einer Relabel-Regel: source_labels fließen in einen verankerten Regex, das $1:$2-Replacement wird expandiert, und Actions wie replace, keep, labelmap und hashmod schreiben die Labels um.](/blog/in-content/prometheus-relabel-configs-explained.webp)

## Die Actions einzeln durchgegangen: replace, keep, drop, labelmap, labelkeep, labeldrop, hashmod

Prometheus unterstützt elf Actions. Jedes Beispiel unten ist eine vollständige, lauffähige Regel.

### replace

Füge die Source-Labels zusammen, gleiche den Regex ab, expandiere `$1`/`${1}` in `replacement` und setze `target_label`.

```yaml
- source_labels: [__address__]
  regex: "([^:]+):.*"
  target_label: ip
  replacement: "$1"
```

`__address__="10.0.0.5:8080"` wird zu einem neuen Label `ip="10.0.0.5"`. Wenn der Regex nicht trifft, bleibt die Label-Menge unverändert. Es gibt hier eine scharfe Kante, die man sich merken sollte: **wenn das expandierte replacement der leere String ist, löscht `replace` das target_label**, statt es auf leer zu setzen.

```yaml
# When tmp_instance is empty, this DELETES the instance label.
- source_labels: [tmp_instance]
  regex: "(.+)"
  target_label: instance
  replacement: "$1"
```

Bei `instance="old"`, `tmp_instance=""` schafft es der Regex `(.+)` nicht, einen leeren Wert zu treffen, also passiert nichts — `instance` überlebt. Aber ändere die Quelle so, dass die Expansion auf einem leeren String landet, und das `instance`-Label verschwindet vollständig. Diese Asymmetrie ist eine häufige Ursache für „Wo ist mein Label hin?".

### keep

Verwirf das ganze Target, es sei denn, die zusammengefügte Quelle trifft den Regex.

```yaml
- source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
  action: keep
  regex: "true"
```

Nur Pods, die mit `prometheus.io/scrape: "true"` annotiert sind, überleben; alles andere wird vor dem Scrapen verworfen. `keep` ist ein Allow-List-Gate.

### drop

Das Spiegelbild von `keep`: verwirf das Target, wenn die zusammengefügte Quelle *doch* trifft.

```yaml
- source_labels: [__name__]
  action: drop
  regex: "go_gc_.*"
```

In `metric_relabel_configs` verwendet, bringt das die gesamte `go_gc_*`-Metrikfamilie zum Schweigen, bevor sie gespeichert wird. `drop` ist ein Deny-List-Gate.

### labelmap

`labelmap` arbeitet auf Label-**Namen**, nicht auf Werten. Für jedes Label, dessen Name den Regex trifft, setzt es ein neues Label — benannt nach dem expandierten replacement — auf den Wert dieses Labels.

```yaml
- action: labelmap
  regex: "__meta_kubernetes_pod_label_(.+)"
```

Ein Label `__meta_kubernetes_pod_label_app="api"` erzeugt ein neues Label `app="api"`. Das ist der kanonische Griff, um Kubernetes-Pod-Labels zu einfachen Labels zu befördern. Das Standard-`replacement` von `$1` ist das, was das eingefangene Suffix als neuen Namen schreibt.

### labelkeep / labeldrop

Beide filtern Labels nach Namen. `labeldrop` entfernt jedes Label, dessen Name trifft; `labelkeep` entfernt jedes Label, dessen Name *nicht* trifft.

```yaml
# Strip all leftover service-discovery metadata.
- action: labeldrop
  regex: "__meta_.+"
```

```yaml
# Keep only the four labels you care about; drop everything else.
- action: labelkeep
  regex: "(__name__|job|instance|severity)"
```

### hashmod

`hashmod` setzt `target_label` auf eine stabile Shard-Nummer. Es nimmt den MD5 der zusammengefügten Quelle, liest die letzten 8 Bytes dieses Digests als Big-Endian-64-Bit-Integer und speichert `hash % modulus`.

```yaml
- source_labels: [__address__]
  action: hashmod
  modulus: 3
  target_label: __tmp_shard
```

Jedes Target bekommt einen deterministischen `__tmp_shard`-Wert von `0`, `1` oder `2`. Das MD5-Rezept ist wichtig: Der Relabel Tester reproduziert genau dies Byte für Byte, sodass die angezeigten Shard-Werte die Werte sind, die Prometheus berechnen wird.

### keepequal / dropequal

Diese beiden nehmen keinen Regex. Sie vergleichen den zusammengefügten Quellwert mit dem *aktuellen Wert* von `target_label` und behalten oder verwerfen bei Gleichheit.

```yaml
# Drop the target if its port already equals the discovered one.
- source_labels: [__meta_port]
  action: dropequal
  target_label: port
```

`keepequal` behält nur, wenn die beiden gleich sind; `dropequal` verwirft, wenn sie gleich sind.

### lowercase / uppercase

Setzt `target_label` auf den zusammengefügten Quellwert in Klein- oder Großbuchstaben — praktisch zum Normalisieren von Discovery-Labels mit uneinheitlicher Groß-/Kleinschreibung.

```yaml
- source_labels: [environment]
  action: lowercase
  target_label: environment
```

`environment="PRODUCTION"` wird zu `environment="production"`.

## __meta_-Labels aus der Service Discovery und warum sie wichtig sind

Jeder Service-Discovery-Mechanismus — Kubernetes, EC2, Consul, dateibasiert — heftet jedem gefundenen Target `__meta_*`-Labels an. Diese sind *nur* während `relabel_configs` verfügbar. Sie werden vor dem Scrape entfernt, wenn du also möchtest, dass eines dieser Metadaten als echtes Label überlebt, musst du es zuerst mit `replace` oder `labelmap` herauskopieren.

![Die Relabel-Pipeline für eine Regel: Eingabe-Labels, Zusammenfügen der source_labels mit dem separator, Abgleich des regex, Anwenden der Action und Erzeugen der Ausgabe-Labels.](/blog/prometheus-relabel-configs-explained-diagram.svg)

Ein Kubernetes-Pod-Target kommt ungefähr so an:

```text
__address__="10.0.0.5:8080"
__meta_kubernetes_namespace="default"
__meta_kubernetes_pod_name="api-7d9f"
__meta_kubernetes_pod_label_app="api"
__meta_kubernetes_pod_annotation_prometheus_io_scrape="true"
__meta_kubernetes_pod_annotation_prometheus_io_port="9100"
```

Die `__meta_*`-Labels sind überhaupt der Grund, warum es Relabeling gibt. Sie tragen den Discovery-Kontext — welcher Namespace, welche Annotationen, welche Pod-Labels — den du in Scrape-Entscheidungen (`keep` auf die Scrape-Annotation) und in dauerhafte Labels (`labelmap` der Pod-Labels) verwandelst. Alles, was mit einem doppelten Unterstrich beginnt, ist intern und wird nach dem Relabeling verworfen, wobei `__name__` (der Metrikname) das bemerkenswerte ist, das bis in den Speicher überlebt. Da diese Labels nur zur Relabel-Zeit existieren, ist der einzige sichere Weg, zu bestätigen, dass eine Regel sie korrekt liest, eine realistische `__meta_*`-Menge durch deine Regeln zu füttern und auf die Ausgabe zu schauen.

## Rezepte, die du immer wieder verwenden wirst

Das sind die Muster, die in fast jeder echten Scrape-Config auftauchen.

### Nur Prod-Targets behalten

```yaml
- source_labels: [__meta_kubernetes_namespace]
  action: keep
  regex: "prod|production"
```

Verankert, sodass `prod` exakt den Namespace `prod` trifft und `staging-prod` *nicht* treffen würde, es sei denn, du schreibst `.*prod.*`. Die `|`-Alternation behält beide Namenskonventionen.

### Laute Metriken verwerfen (metric_relabel_configs)

```yaml
metric_relabel_configs:
  - source_labels: [__name__]
    action: drop
    regex: "go_gc_.*|process_.*"
```

Läuft nach dem Scrape und verwirft Familien mit hoher Kardinalität, bevor sie in den Speicher gelangen.

### hashmod-Sharding

Das Zwei-Regeln-Muster für horizontales Sharding — in ein Temp-Label hashen, dann nur den Shard behalten, der diesem Prometheus gehört:

```yaml
- source_labels: [__address__]
  action: hashmod
  modulus: 3
  target_label: __tmp_shard

- source_labels: [__tmp_shard]
  action: keep
  regex: "0"
```

Lasse das gegen vier Beispieladressen im Tester laufen, und du siehst genau, welche zwei oder drei auf Shard `0` landen und überleben — die anderen werden verworfen, markiert mit der verantwortlichen Regel und Action.

### SD-Labels mit labelmap mappen, dann die Adresse umschreiben

```yaml
# Promote every pod label to a plain label.
- action: labelmap
  regex: "__meta_kubernetes_pod_label_(.+)"

# Rebuild __address__ from the IP and an annotated port.
- source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
  action: replace
  regex: "([^:]+)(?::\\d+)?;(\\d+)"
  replacement: "$1:$2"
  target_label: __address__
```

Die zweite Regel zeigt das Joined-Source-Idiom in Aktion: zwei `source_labels`, durch den Standard-Separator `;` zusammengefügt, mit einem Regex, der so geschrieben ist, dass er diesen Separator berücksichtigt. `__address__="10.0.2.4:8080"`, zusammengefügt mit dem Port `9100`, wird zu `10.0.2.4:8080;9100`, der Regex fängt `10.0.2.4` und `9100` ein, und die Adresse wird als `10.0.2.4:9100` neu aufgebaut.

## Teste, bevor du ausrollst

Relabeling ist der eine Teil einer Prometheus-Config, bei dem „fast richtig" weder Fehler noch Warnung erzeugt — nur fehlende oder falsche Serien. Die Regex-Verankerung, die Löschung bei leerem replacement, der MD5-hashmod, die Join-Reihenfolge mehrerer `source_labels`: jedes davon ist leicht auf subtile Weise falsch zu machen, und ein laufendes Prometheus wird dir nicht sagen, welches dich gebissen hat.

Füge die Rezepte aus diesem Beitrag, mit einer realistischen Menge von `__meta_*`-Labels, in den [Prometheus Relabel Tester](/prometheus-relabel-tester) ein, und du siehst den zusammengefügten Wert, den getroffenen (oder nicht getroffenen) Regex, das Diff pro Label und eine klare Markierung — die Regel und Action benennend — sobald ein Target verworfen wird. Er läuft vollständig in deinem Browser, sodass du interne Scrape-Configs gefahrlos einfügen kannst.

Sobald die Labels die gewünschte Form haben, sind die nächsten Fragen, was du abfragst und wie du alarmierst. Zerlege einen Ausdruck mit [dem PromQL Explainer](/promql-explainer), oder wenn du Regeln zwischen Loki und Prometheus verschiebst, übersetze sie mit [dem LogQL ↔ PromQL Helper](/logql-promql-helper). Bring zuerst die Labels in Ordnung — alles weiter unten in der Kette hängt von ihnen ab.
