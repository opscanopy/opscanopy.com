---
title: "Wie man eine PromQL-Abfrage liest"
description: "Eine PromQL-Abfrage liest man von innen nach außen, nicht von links nach rechts. Lernen Sie die vier Schichten – Selektoren, Bereiche, Funktionen und Aggregationen – kennen, damit Sie jeden Prometheus-Ausdruck auf einen Blick entschlüsseln können."
pubDate: 2026-06-08
tags: ["promql", "prometheus", "observability"]
lang: de
translationOf: "reading-promql"
---

PromQL wirkt beim ersten Kontakt dicht. Eine Zeile wie `histogram_quantile(0.99, sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))` liest sich wie ein einziges langes Wort, und der Instinkt sagt einem, sie wie einen Satz von links nach rechts zu überfliegen. Das ist die falsche Richtung. PromQL ist eine funktionale Sprache, daher fließt die Bedeutung vom **innersten** Ausdruck nach außen – genauso, wie Sie eine verschachtelte Formel in der Mathematik auswerten würden. Sobald Sie sie von innen nach außen lesen, zerlegt sich nahezu jede Abfrage in dieselben vier Schichten.

## Die vier Schichten

Nahezu jeder nicht-triviale PromQL-Ausdruck ist aus diesen aufgebaut, von innen nach außen gestapelt:

1. **Ein Selektor** – von welchen Series Sie ausgehen.
2. **Ein Bereich** – über welches Zeitfenster (nur wenn Sie Historie benötigen, keinen Momentwert).
3. **Eine Funktion** – welche Transformation Sie auf diese Samples anwenden.
4. **Eine Aggregation** – wie Sie viele Series zu weniger zusammenfassen.

Lesen Sie sie in dieser Reihenfolge, und die Abfrage erklärt sich von selbst.

## Schicht 1: der Selektor

Der Kern jeder Abfrage ist ein **Metrik-Selektor**: ein Metrikname plus optionale Label-Matcher in geschweiften Klammern.

```promql
http_requests_total{job="api", status=~"5.."}
```

Dies wählt jede Series mit dem Namen `http_requests_total` aus, bei der das `job`-Label gleich `api` ist und das `status`-Label auf die Regex `5..` passt (jeder 5xx-Code). Die Matcher sind der wichtige Teil:

- `=` exakte Übereinstimmung
- `!=` ungleich
- `=~` Regex-Übereinstimmung
- `!~` Regex passt nicht

Für sich genommen liefert ein Selektor einen **Instant Vector** – ein aktuelles Sample pro passender Series. Diese Unterscheidung ist für alles Folgende von Bedeutung.

## Schicht 2: der Bereich

Hängen Sie eine Zeitdauer in eckigen Klammern an, und der Selektor wird zu einem **Range Vector** – jedes Sample in diesem Fenster, pro Series, nicht nur das neueste.

```promql
http_requests_total{job="api"}[5m]
```

Einen Range Vector können Sie nicht direkt darstellen; er ist Rohmaterial. Sie übergeben ihn an eine Funktion, die weiß, was mit einem Fenster von Samples zu tun ist. Das klassische Beispiel ist `rate`:

```promql
rate(http_requests_total{job="api"}[5m])
```

`rate` betrachtet die Samples des Counters über die letzten 5 Minuten und liefert die durchschnittliche Zuwachsrate pro Sekunde zurück. Dies ist das mit Abstand häufigste Muster in Prometheus, und es lohnt sich zu verinnerlichen, warum es existiert: `http_requests_total` ist ein **Counter**, der nur steigt (bis ein Neustart ihn zurücksetzt), sodass sein Rohwert auf einem Dashboard bedeutungslos ist. Die Änderungsrate ist das, worauf es Ihnen tatsächlich ankommt. `rate` behandelt zudem transparent Counter-Resets, weshalb Sie Raten niemals von Hand berechnen sollten.

Eine kurze Anmerkung zur Fenstergröße: Der Bereich (`[5m]`) sollte bequem mindestens einige Scrape-Intervalle abdecken. Zu kurz, und Sie erhalten verrauschte, lückenhafte Ergebnisse; zu lang, und Sie glätten genau die Spitzen weg, die Sie eigentlich erfassen wollten.

## Schicht 3: Funktionen

Funktionen transformieren Vektoren. Diejenigen, die Ihnen ständig begegnen werden:

- `rate(...)` – durchschnittliche Rate eines Counters pro Sekunde über einen Bereich.
- `irate(...)` – Momentanrate aus den letzten beiden Samples; spitzer, gut für sich schnell bewegende Graphen.
- `increase(...)` – Gesamtzuwachs über den Bereich (im Wesentlichen `rate × seconds`).
- `histogram_quantile(φ, ...)` – schätzt ein Quantil (z. B. p99) aus Histogramm-Buckets.
- Vergleiche im Stil `rate(...[5m]) > 0` – Filterung, weiter unten behandelt.

So liest sich `rate(http_requests_total{job="api", status=~"5.."}[5m])` von innen nach außen als: *Nimm den 5xx-Request-Counter für den api-Job über ein 5-Minuten-Fenster und gib mir die Fehlerrate pro Sekunde, pro Series.*

## Schicht 4: Aggregation

Ein Selektor mit einem `job`- und einem `status`-Label kann immer noch Dutzende von Series treffen – eine pro Instanz, pro Pod, pro Statuscode. Aggregationsoperatoren fassen sie zusammen.

```promql
sum by (job) (rate(http_requests_total{status=~"5.."}[5m]))
```

`sum by (job)` addiert die Raten pro Series und behält **nur** das `job`-Label, während es den Rest verwirft. Das Ergebnis ist eine Fehlerraten-Linie pro Job. Die beiden Klauseln, die Sie kennen sollten:

- `by (labels)` – diese Labels behalten, alles andere wegaggregieren.
- `without (labels)` – diese Labels wegaggregieren, alles andere behalten.

Andere Aggregatoren folgen derselben Grammatik: `avg`, `max`, `min`, `count`, `topk`, `quantile`. Das mentale Modell ändert sich nie – *fasse viele Series zu weniger zusammen, gruppiert nach den von mir benannten Labels.*

## Alles zusammensetzen

Jetzt zerlegt sich die einschüchternde Abfrage von oben sauber. Lesen Sie sie von innen nach außen:

```promql
histogram_quantile(
  0.99,
  sum by (le, route) (
    rate(http_request_duration_seconds_bucket[5m])
  )
)
```

1. `http_request_duration_seconds_bucket[5m]` – die Latenz-Histogramm-Buckets über 5 Minuten.
2. `rate(...)` – Rate jedes Buckets pro Sekunde, sodass Resets und Skalierung behandelt werden.
3. `sum by (le, route) (...)` – addiere die Raten über alle Instanzen hinweg und behalte `le` (die Bucket-Grenze, vom nächsten Schritt benötigt) sowie `route`.
4. `histogram_quantile(0.99, ...)` – schätze die 99-Perzentil-Latenz aus diesen Buckets, pro Route.

In einfachen Worten: **die p99-Request-Latenz pro Route über die letzten 5 Minuten.** Eine Schicht nach der anderen, ist sie überhaupt nicht dicht.

## Ein paar Fallen, die man kennen sollte

- **Aggregieren vor dem Raten.** `rate(sum(...))` ist fast immer ein Fehler. Berechnen Sie zuerst die `rate`, dann `sum` – Counter über Resets hinweg zu summieren, ergibt Unsinn. Die korrekte Form ist `sum(rate(...))`.
- **`le` weglassen.** `histogram_quantile` benötigt das `le`-Label intakt, daher muss Ihre `by (...)`-Klausel es enthalten.
- **Vergleiche filtern, sie färben nicht nur.** `rate(...)[5m]) > 0` liefert keine Booleans zurück – es *verwirft* jede Series, bei der die Bedingung falsch ist. So bauen Sie Alert-Ausdrücke.
- **Instant- vs. Range-Verwechslung.** Einen Instant Vector dort zu übergeben, wo eine Funktion einen Range Vector erwartet (oder umgekehrt), ist der häufigste Parse-Fehler. Wenn eine Funktion sich beschwert, prüfen Sie Ihre Klammern.

## Jede Abfrage in Sekunden entschlüsseln

Die Von-innen-nach-außen-Methode funktioniert bei jedem PromQL-Ausdruck, der Ihnen begegnen wird, doch eine tief verschachtelte Produktionsabfrage von Hand auseinanderzunehmen, ist immer noch mühsam – und unter Druck leicht subtil falsch zu machen. Genau dafür ist der **PromQL Explainer** da: Fügen Sie eine beliebige Prometheus-Abfrage ein und erhalten Sie eine verständliche, Schicht-für-Schicht-Aufschlüsselung ihrer Selektoren, Bereiche, Funktionen, Aggregationen und Vergleiche. Alles läuft clientseitig, sodass Ihre Abfragen den Browser nie verlassen.

Wenn Sie das nächste Mal ein Dashboard-Panel oder eine Alert-Regel zum Augenzusammenkneifen bringt, raten Sie nicht herum.

[Eine PromQL-Abfrage erklären →](/promql-explainer)
