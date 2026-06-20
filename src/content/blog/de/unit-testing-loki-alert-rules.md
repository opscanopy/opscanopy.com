---
title: "Unit-Tests für Loki-Alert-Regeln: die Lücke, die promtool hinterlässt"
description: "Prometheus hat promtool test rules. Loki hat nichts Vergleichbares. Hier erfahren Sie, warum das Testen von LogQL-Alert-Regeln wichtig ist, wie ein Unit-Test für eine Loki-Regel aussehen sollte und wie Sie die Lücke heute schließen."
pubDate: 2026-04-15
tags: ["loki", "observability", "testing"]
lang: de
translationOf: "unit-testing-loki-alert-rules"
---

![Unit-Tests für Loki-Alert-Regeln: eine Testschleife im promtool-Stil für LogQL-Alerting-Regeln](/blog/unit-testing-loki-alert-rules-hero.svg)

Wenn Sie Prometheus betreiben, verfügen Sie bereits über ein Sicherheitsnetz für Ihre Alerting-Logik: `promtool test rules`. Sie geben ihm eine Reihe synthetischer Samples vor, deklarieren, was wann auslösen soll, und CI sagt Ihnen in dem Moment Bescheid, in dem ein Refactoring einen Alert kaputt macht. Das ist der Unterschied zwischen dem Aufspüren einer fehlerhaften Paging-Regel im Code-Review und ihrer Entdeckung während eines Incidents.

Grafana Loki hat kein Gegenstück dazu. Sie können LogQL-Alerting- und Recording-Regeln schreiben, die ihren Prometheus-Verwandten fast identisch sehen, sie in den Ruler laden und ausliefern – aber es gibt keine erstklassige Möglichkeit, zu verifizieren, dass ein bestimmter Log-Stream den erwarteten Alert erzeugt. Die Lücke ist real, sie besteht seit Langem, und sie ist genau die Art von Sache, die Sie um 3&nbsp;Uhr morgens einholt.

## Warum promtool Loki nicht abdeckt

Der instinktive Reflex besteht darin, zu `promtool` zu greifen und es auf Ihre Loki-Regeln anzusetzen. Das funktioniert nicht, und der Grund dafür ist grundlegend statt kosmetisch.

`promtool test rules` wertet PromQL gegen eine synthetische **Zeitreihen**-Datenbank aus. Sie beschreiben Metriken mit der `series`/`values`-Syntax, und das Tool spielt sie durch die Regel-Engine ab. Eine Loki-Alert-Regel beginnt aber nicht mit Metriken – sie beginnt mit **Log-Zeilen**. Eine Regel wie `count_over_time({app="api"} |= "panic" [5m]) > 0` muss eine LogQL-Pipeline (Stream-Selektor, Line-Filter, Label-Extraktion, dann eine Metrik-Aggregation) über rohe Log-Einträge ausführen, bevor es überhaupt eine Zeitreihe zum Auswerten gibt. promtool hat kein Konzept eines Log-Streams, keinen LogQL-Parser und keine Möglichkeit, die Zwischenmetriken so zu materialisieren, wie es die Query-Engine von Loki tut. Es mit Loki-Regeln zu füttern, führt entweder zu einem Fehler oder testet stillschweigend das Falsche.

Die Testfläche, auf die es bei Loki ankommt – „erzeugt diese LogQL-Regel angesichts dieser Log-Zeilen den Alert?" – ist also genau die Fläche, die promtool nicht erreichen kann.

![Eine Unit-Test-Schleife für eine Loki-Alert-Regel: synthetische Log-Streams, die zu einem gewählten Zeitpunkt ausgewertet und gegen die erwarteten Alerts verifiziert werden](/blog/unit-testing-loki-alert-rules-diagram.svg)

## Warum das wichtig ist

LogQL-Alert-Regeln lassen sich trügerisch leicht auf subtile Weise falsch machen:

- Ein Line-Filter, der mehr (oder weniger) trifft, als Sie denken, wegen einer nicht escapten Regex oder einer fehlenden Wortgrenze.
- Ein Label, das Sie falsch `unwrap`en oder per `label_format` umformen, sodass die Aggregation auf die falsche Weise gruppiert.
- Ein `[5m]`-Range und eine `for: 10m`-Klausel, die so zusammenwirken, dass der Alert nie genug Daten hat, um auszulösen, oder weit später als beabsichtigt auslöst.
- Eine Recording-Regel, deren Ausgabe-Zeitreihe nach einer Pipeline-Änderung stillschweigend die Labels wechselt und damit jeden nachgelagerten Alert kaputt macht, der darauf selektiert.

Keine dieser Sachen wird durch YAML-Linting oder eine Schema-Prüfung erkannt. Es sind **verhaltensbezogene** Bugs, und der einzig ehrliche Weg, sie aufzuspüren, besteht darin, die Regel gegen repräsentativen Input laufen zu lassen und auf den Output zu verifizieren. Ohne ein Test-Harness geschieht diese Verifizierung manuell, selten und meist erst, nachdem etwas bereits das falsche Team gepagt hat – oder das richtige nicht gepagt hat.

## Wie ein Unit-Test für eine Loki-Regel aussehen sollte

Das von promtool etablierte Modell ist das richtige; es braucht lediglich einen log-förmigen Input. Statt synthetischer Zeitreihen sollte ein Test für eine Loki-Regel synthetische **Streams** (eine Menge von Labels plus zeitgestempelte Log-Zeilen) akzeptieren, die Regel zu einem gewählten Zeitpunkt auswerten und auf die erzeugten Alerts verifizieren – etwa so:

```yaml
# loki-rule-tests.yaml
tests:
  - name: panic in api logs fires PanicDetected
    # Synthetic log streams replayed through the LogQL engine.
    input_streams:
      - labels: '{app="api", env="prod"}'
        entries:
          - { ts: "2026-06-08T10:00:30Z", line: "level=info msg=ok" }
          - { ts: "2026-06-08T10:01:10Z", line: "level=error msg=panic: nil map" }
          - { ts: "2026-06-08T10:02:40Z", line: "level=error msg=panic: nil map" }

    # Evaluate the rule group at this instant.
    eval_time: 2026-06-08T10:05:00Z

    alert_rule_test:
      - alertname: PanicDetected
        # What we expect the ruler to emit at eval_time.
        exp_alerts:
          - exp_labels:
              app: api
              env: prod
              severity: critical
            exp_annotations:
              summary: "Panic detected in api"
```

Die zu testende Regel ist dieselbe Regel, die Sie an den Ruler ausliefern:

```yaml
groups:
  - name: api-alerts
    rules:
      - alert: PanicDetected
        expr: |
          count_over_time({app="api", env="prod"} |= "panic" [5m]) > 1
        for: 0m
        labels:
          severity: critical
        annotations:
          summary: "Panic detected in {{ $labels.app }}"
```

Zusammengelesen besagt der Test: Bei zwei Panic-Zeilen im Fünf-Minuten-Fenster vor `10:05` sollte der Ausdruck `count_over_time(...) > 1` wahr sein, und der Ruler sollte einen `PanicDetected`-Alert ausgeben, der `severity=critical` sowie die Labels `app`/`env` aus dem Stream trägt. Ändern Sie den Input auf eine einzige Panic-Zeile oder verschieben Sie einen Eintrag außerhalb des `[5m]`-Fensters, und `exp_alerts` wird leer – der Test sichert nun sowohl den auslösenden als auch den nicht-auslösenden Fall ab.

Das ist die Form, die jedes Team, das im Loki-Tracker danach gefragt hat, immer wieder beschreibt – siehe die langlaufenden Anfragen in den Loki-Issues [#7655](https://github.com/grafana/loki/issues/7655) und [#16659](https://github.com/grafana/loki/issues/16659), wo die Community wiederholt darauf hingewiesen hat, dass ein Unit-Test im promtool-Stil für LogQL-Regeln schlicht noch nicht existiert.

## Die Lücke heute schließen

Sie müssen nicht darauf warten, dass Upstream dies ausliefert. **AlertLint** führt genau diese Testschleife in Ihrem Browser aus: Fügen Sie Ihre Loki-Alerting- und Recording-Regeln ein, definieren Sie `input_streams`, deklarieren Sie Ihre `exp_alerts` und verifizieren Sie Bestehen oder Fehlschlag, bevor die Regel jemals den Ruler erreicht. Alles wird clientseitig ausgewertet – Ihre Regeln und Logs verlassen das Gerät nie –, sodass Sie es in Ihr Review einbinden können, ohne Infrastruktur anzufassen oder Daten irgendwohin zu senden.

Wenn Sie jemals einen Loki-Alert ausgeliefert und gehofft haben, dass er funktioniert, ist dies der fehlende Schritt.

[AlertLint ausprobieren – der Tester für Loki-Alert-Regeln →](/loki-alert-rule-tester)
