---
title: "LogQL vs. PromQL: dieselbe Abfrage in beiden Sprachen"
description: "LogQL übernimmt die Form von PromQL, geht aber von Log-Zeilen aus, nicht von Metriken. Hier sehen Sie, wie die beiden Abfragesprachen zueinander passen, wo sie sich sauber übersetzen lassen und wo schlicht nicht."
pubDate: 2026-06-05
tags: ["logql", "promql", "observability"]
lang: de
translationOf: "logql-vs-promql"
---

![LogQL vs. PromQL: dieselbe Abfrage in beiden Sprachen, nebeneinander](/blog/logql-vs-promql-hero.svg)

Wenn Sie schon Prometheus-Abfragen geschrieben haben, wirkt das LogQL von Grafana Loki beruhigend vertraut — `rate(...)`, `sum by (...)`, `[5m]`-Range-Vektoren, dieselben Vergleichsoperatoren. Diese Vertrautheit ist beabsichtigt, und sie ist wirklich nützlich: Ein großer Teil des PromQL-Muskelgedächtnisses lässt sich direkt übertragen. Doch die beiden Sprachen gehen von unterschiedlichem Rohmaterial aus, und sobald Sie das vergessen, bricht Ihre Übersetzung auf eine Weise, die schwer zu erkennen ist. PromQL fragt eine **Metrik**-Datenbank ab. LogQL fragt **Log-Zeilen** ab und verwandelt sie im laufenden Betrieb in Metriken. Alles, was sich sauber abbilden lässt, und alles, was sich nicht abbilden lässt, folgt aus diesem einen Unterschied.

## Die zwei Hälften von LogQL

Jede LogQL-Abfrage beginnt mit einem **Log-Selector** und einer optionalen **Pipeline** — dem Teil, der keine PromQL-Entsprechung hat, weil PromQL nie auf Roh-Logs zugreift:

```logql
{app="api", env="prod"} |= "panic" | logfmt | level="error"
```

Das wählt den `api`/`prod`-Stream aus, behält Zeilen, die `panic` enthalten, parst sie als logfmt und filtert dann auf `level=error`. Das Ergebnis ist nach wie vor eine Menge von Log-Zeilen. Um etwas zu erhalten, das Sie grafisch darstellen oder als Grundlage für Alerts verwenden können — eine Zahl über die Zeit —, hüllen Sie es in eine **Metrik-Abfrage** ein:

```logql
sum by (app) (count_over_time({app="api", env="prod"} |= "panic" | logfmt | level="error" [5m]))
```

Nur die äußere Hälfte dieses Ausdrucks ähnelt PromQL. Der innere Teil `{...} |= ... | logfmt | ...` ist reines Loki, und genau dort steckt der meiste Übersetzungsaufwand.

![Dieselbe Abfrage in PromQL und LogQL nebeneinander geschrieben, wobei einander entsprechende Teile durch Pfeile verbunden sind](/blog/logql-vs-promql-diagram.svg)

## Wo LogQL und PromQL zueinander passen

Die Aggregationsschicht ist die Stelle, an der die Sprachen zusammenlaufen, und die Entsprechungen sind nahezu eins zu eins.

Eine PromQL-Counter-Rate:

```promql
sum by (status) (rate(http_requests_total{job="api"}[5m]))
```

Die LogQL-Form, die dieselbe Frage aus Logs beantwortet:

```logql
sum by (status) (rate({job="api"} | logfmt [5m]))
```

Die Aggregationsoperatoren (`sum`, `avg`, `min`, `max`, `count`, `topk`, `quantile`) und die Gruppierungsklauseln `by` / `without` verhalten sich identisch. Vergleichsoperatoren (`>`, `<`, `==`, `!=`) und binäre Arithmetik funktionieren auf dieselbe Weise, weshalb ein Alert-Schwellenwert nahezu wortgetreu portiert werden kann:

```promql
# PromQL: more than 10 errors/sec
sum(rate(http_requests_total{status=~"5.."}[5m])) > 10
```

```logql
# LogQL: more than 10 error lines/sec
sum(rate({job="api"} | logfmt | status=~"5.." [5m])) > 10
```

Auch die `_over_time`-Familie von Loki spiegelt die Range-Funktionen von Prometheus dort wider, wo das Konzept überlebt: `count_over_time`, `rate`, `bytes_rate`, `avg_over_time`, `max_over_time`, `quantile_over_time`. Wenn Sie in PromQL `avg_over_time(metric[5m])` verwendet haben, liest sich die unwrapped LogQL-Form genauso, sobald Sie einen numerischen Wert extrahiert haben, auf dem Sie operieren.

## Wo sie auseinandergehen — und warum eine wörtliche Portierung scheitert

Die Fallstricke häufen sich rund um jene Hälfte von LogQL, die PromQL nicht hat.

**`rate` bedeutet zweierlei.** In PromQL berücksichtigt `rate(counter[5m])` Counter-Resets — es ist für monoton steigende Series gemacht. In LogQL ist `rate({...}[5m])` die **Zeilenzahl** pro Sekunde, ohne Reset-Semantik, weil Log-Zeilen nicht zurückgesetzt werden. Das Schlüsselwort stimmt überein; die Bedeutung nicht. Wenn Sie nach `increase()` greifen und PromQL-Counter-Verhalten erwarten, gibt es schlicht nichts zu inkrementieren.

**Sie müssen einen Wert extrahieren, bevor Sie damit rechnen können.** PromQL-Samples sind bereits Zahlen. Loki-Zeilen sind Text, daher braucht jede Aggregation über einen *Wert* (Latenz, Bytes, ein numerisches Feld) einen Parser plus `unwrap`:

```logql
quantile_over_time(0.99, {job="api"} | logfmt | unwrap duration_seconds [5m]) by (route)
```

Es gibt keine PromQL-Entsprechung zu `| logfmt`, `| json`, `| pattern` oder `| unwrap` — sie existieren genau deshalb, weil die Eingabe unstrukturiert ist. Eine Übersetzung *von* PromQL bedeutet, diesen Extraktionsschritt zu erfinden; eine Übersetzung *zu* PromQL bedeutet, ihn zu löschen und anzunehmen, dass eine Metrik bereits existiert.

**Die Selector-Syntax überschneidet sich, ist aber nicht austauschbar.** Beide verwenden `{label="value"}` mit `=`, `!=`, `=~`, `!~`. Doch ein PromQL-Selector benennt eine Metrik und matcht Series-Labels; ein Loki-Stream-Selector benennt Log-Streams und *muss* mindestens ein indiziertes Stream-Label matchen. Ein Line-Filter wie `|= "text"` hat überhaupt keine PromQL-Entsprechung — am nächsten kommt PromQL dem Matchen auf einen Label-Wert, niemals auf freien Text innerhalb eines Samples.

**Felder mit hoher Kardinalität verhalten sich anders.** In PromQL ist die Gruppierung nach einem Label mit hoher Kardinalität in der Regel ein Geruch im Metrik-Design. In LogQL werden extrahierte Pipeline-Labels (aus `logfmt`/`json`) zur Abfragezeit berechnet und sind nicht indiziert, sodass `by (user_id)` auf eine Weise machbar ist, wie es in Prometheus selten der Fall ist — zu realen Kosten beim Abfragedurchsatz, aber ohne die Speicherexplosion. Das mentale Modell dafür, was „teuer“ ist, lässt sich nicht übertragen.

## Eine praktische Übersetzungs-Checkliste

Wenn Sie eine Abfrage zwischen den beiden Sprachen umziehen, gehen Sie diese Punkte der Reihe nach durch:

1. **Identifizieren Sie die Metrik-Schicht.** Reduzieren Sie die PromQL-Abfrage auf ihre Aggregation (`sum by (...) (rate(...))`); dieser Teil portiert nahezu unverändert.
2. **Rekonstruieren Sie die Eingabe.** Ersetzen Sie in LogQL den Metriknamen durch einen `{stream}`-Selector plus die Line-Filter und den Parser (`| logfmt`, `| json`), die nötig sind, um an dieselben Daten zu gelangen.
3. **Fügen Sie `unwrap` für Wertberechnungen hinzu.** Jeder Durchschnitt, jedes Quantil oder jede Summe über eine Zahl — nicht eine Zeilenzahl — braucht ein extrahiertes, mit `unwrap` ausgepacktes Feld.
4. **Prüfen Sie die `rate`-Semantik erneut.** Entscheiden Sie, ob Sie die Zeilenzahl pro Sekunde (Loki) oder die Counter-Rate (Prometheus) meinen. Das sind nicht dieselben Zahlen.
5. **Akzeptieren Sie, dass sich manches nicht abbilden lässt.** `histogram_quantile` über native Prometheus-Histogramme, Counter-`resets()` und durch Recording-Rules gestützte Series haben keine saubere LogQL-Form — und Freitext-Line-Filter haben keine PromQL-Form.

## Übersetzen Sie es ohne Rätselraten

Beide Dialekte gleichzeitig im Kopf zu behalten, ist genau die Art von Kontextwechsel, die stille Fehler erzeugt — ein `rate`, das das Falsche bedeutet, ein fehlendes `unwrap`, ein Selector, der kompiliert, aber nichts matcht. Der **LogQL ↔ PromQL Helper** übernimmt den mechanischen Teil für Sie: Fügen Sie eine Abfrage in einer der beiden Sprachen ein und erhalten Sie die nächstliegende Entsprechung in der anderen, plus ausdrückliche Hinweise darauf, was sich sauber abbilden ließ und was nicht. Er läuft vollständig in Ihrem Browser — Ihre Abfragen verlassen das Gerät nie —, sodass Sie eine Übersetzung auf Plausibilität prüfen können, bevor sie in einem Dashboard oder einer Alert-Regel landet.

[Den LogQL ↔ PromQL Helper öffnen →](/logql-promql-helper)
