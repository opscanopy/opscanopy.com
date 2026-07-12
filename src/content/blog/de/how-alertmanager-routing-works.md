---
title: "Wie das Routing von Alertmanager funktioniert: Matchers, continue und der Route-Baum"
description: "Ein klares mentales Modell für das Routing von Alertmanager — der Route-Baum, Matchers, das continue-Flag, Gruppierung und Receiver-Vererbung — damit du genau weißt, wo ein Alert landet."
pubDate: 2026-06-17
tags: ["alertmanager","observability","alerting"]
lang: de
translationOf: "how-alertmanager-routing-works"
relatedTool:
  name: "Alertmanager Route Tester"
  href: "/alertmanager-route-tester"
---

![Diagramm des Alertmanager-Routings: Die Labels eines Alerts treten an der Wurzel in den Route-Baum ein und fließen über die passenden Kind-Routen abwärts bis zu einem Receiver](/blog/how-alertmanager-routing-works-hero.svg)

Letzte Nacht ist ein Alert mit `severity=critical` ausgelöst worden, und das Bereitschaftsteam wurde nie alarmiert. Der Alert war echt, der Receiver existierte, der Slack-Webhook funktionierte. Das Problem stand drei Zeilen höher in der Config: Eine breite Catch-all-Route saß über der Team-Route und verschluckte stillschweigend alles, was sie erreichte. Niemand hatte den Receiver angefasst — angefasst wurde die Reihenfolge.

Genau das macht das Routing von Alertmanager so fehleranfällig. Die Receiver sind meistens in Ordnung. Im Route-Baum lauern die Überraschungen. Sobald du ein präzises Modell davon hast, wie der Route-Baum durchlaufen wird — wie Matchers ausgewertet werden, wann `continue` einen Alert weiterlaufen lässt und was jedes Kind von seinem Elternknoten erbt — wird aus "Warum ist dieser Alert dort gelandet?" kein Ratespiel mehr. Dieser Beitrag baut genau dieses Modell auf, und jede Regel hier entspricht dem, was der [Alertmanager Route Tester](/alertmanager-route-tester) tatsächlich tut, wenn er einen Baum gegen einen Beispiel-Alert durchläuft.

## Routing ist ein Baum, keine Liste

Das häufigste Missverständnis einer Alertmanager-Config besteht darin, `routes:` als flache Liste von Regeln zu behandeln, gegen die jeder Alert geprüft wird. Es ist keine Liste. Es ist ein Baum, und jeder Alert tritt an derselben Stelle ein: an der Wurzel-Route.

```yaml
route:
  receiver: 'default-receiver'        # the root — the catch-all
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:                              # child routes
    - receiver: 'team-X-mails'
      match:
        team: frontend
    - receiver: 'team-DB-pages'
      match:
        service: database
    - receiver: 'team-Y-mails'
      match:
        team: backend
```

Die Wurzel-Route ist besonders: Sie wird für **jeden** Alert betreten, unabhängig von ihren eigenen Matchers. Sie ist das Catch-all. Ihr `receiver` ist die Vorgabe, auf der ein Alert landet, wenn nichts Spezifischeres passt, und ihre Gruppierungsfelder sind die Basis, die alles darunter erbt. Innerhalb der Wurzel sitzt eine `routes:`-Liste — ihre Kinder. Jedes Kind kann seine eigene `routes:` haben, und so weiter nach unten. Ein Alert steigt von der Wurzel über die jeweils passenden Kinder ab, und der Receiver, auf dem er landet, ist der am Knoten, an dem der Abstieg endet.

Wenn du also eine `alertmanager.yml` liest, durchsuche nicht die Route-Liste nach der passenden Regel. Beginne an der Wurzel und arbeite dich nach unten. Der Alertmanager-Route-Baum ist ein Entscheidungsbaum, den du von oben nach unten, in der Tiefe zuerst, nachverfolgst.

## Wie eine Route matcht: die matchers-Syntax (und das ältere match/match_re)

Ein Route-Knoten matcht einen Alert, wenn **alle** seine eigenen Matchers auf die Labels des Alerts zutreffen. Logisches UND, ohne Ausnahme. Ein Knoten ohne Matchers matcht immer. Es gibt drei Wege, diese Alertmanager-Matchers zu deklarieren, und du wirst alle drei in echten Configs antreffen.

```yaml
routes:
  # Modern matchers: syntax — preferred. One operator per line.
  - receiver: 'staging-slack'
    matchers:
      - env=~"staging-.*"      # =~ regex
      - severity!="info"       # != inequality

  # Older match: exact string equality on each key.
  - receiver: 'team-X-mails'
    match:
      team: frontend

  # Older match_re: each value is a regex.
  - receiver: 'prod-pager'
    match_re:
      env: 'prod-.*'
```

Die moderne `matchers:`-Form trägt ihren Operator inline. Es gibt vier davon: `=` (gleich), `!=` (ungleich), `=~` (Regex-Treffer) und `!~` (kein Regex-Treffer). Werte dürfen in Anführungszeichen stehen oder ohne. Die beiden älteren Formen sind nur Zucker über derselben Engine — `match:` ist eine Menge von `=`-Matchers, und `match_re:` ist eine Menge von `=~`-Matchers.

Zwei Details bringen Leute ständig zum Stolpern:

- **Regexes sind vollständig verankert.** Alertmanager umschließt jedes `=~`-, `!~`- und `match_re`-Muster als `^(?:…)$`. So matcht `env=~"staging"` den Wert `staging` und sonst nichts — `env=staging-eu` matcht **nicht**. Du musst `env=~"staging-.*"` schreiben, um den Rest des Werts abzudecken. Das ist die mit Abstand häufigste Ursache für "Meine Route matcht gar nichts".
- **Ein fehlendes Label ist der leere String.** Alertmanager vergleicht ein nicht vorhandenes Label als `""`. So matcht `foo=""` einen Alert, der überhaupt kein `foo`-Label hat, und `foo!=""` verlangt, dass `foo` vorhanden und nicht leer ist. Nützlich und gelegentlich überraschend.

Diese Labels überhaupt erst an den Alert zu bekommen, ist eine eigene Aufgabe, die zur Scrape-Zeit passiert — wenn das Label, das dein Matcher prüft, nie gesetzt wurde, verfolge es mit dem [Prometheus Relabel Tester](/prometheus-relabel-tester) zurück zu deiner Scrape-Config, bevor du dem Route-Baum die Schuld gibst.

![Illustration: Ein eingehender Alert steigt im Alertmanager-Route-Baum von der Root-Route in Kind-Routen mit Matchers und continue: true ab, bis er auf der passenden Route landet](/blog/in-content/how-alertmanager-routing-works.webp)

## Tiefensuche-Matching und continue: das erste passende Geschwister gewinnt, außer continue ist true

Hier ist die Regel, die das nächtliche Beispiel verletzt hat. Innerhalb einer passenden Route werden die Kind-Routen **der Reihe nach, von oben nach unten** ausgewertet. Der Alert steigt in das **erste** Kind ab, dessen Matchers alle zutreffen — und danach **stoppt** der Geschwister-Scan standardmäßig. Spätere Geschwister werden nicht einmal mehr geprüft.

```yaml
# TRAP: the broad rule above shadows the specific one
routes:
  - receiver: catch-all
    matchers: ['severity=~".*"']   # matches everything
  - receiver: db-pager             # NEVER reached
    match: { service: database }
```

Ein Alert mit `service=database, severity=critical` trifft zuerst auf `catch-all`, dieser Treffer stoppt den Scan, und `db-pager` ist toter Code. Die Lösung ist entweder, spezifisch vor breit anzuordnen, oder `continue: true` zu setzen.

`continue: true` auf einer passenden Route weist Alertmanager an, den Geschwister-Scan **nicht** zu stoppen, nachdem diese Route gematcht hat. Die Auswertung läuft zu den späteren Geschwistern weiter, von denen jedes ebenfalls matchen kann. Das ist die einzige Möglichkeit, dass ein einzelner Alert auf mehr als einem Receiver landet.

```yaml
# Mirror every critical alert to an audit receiver,
# THEN keep routing so the owning team is still paged.
routes:
  - receiver: all-critical-audit
    matchers: ['severity="critical"']
    continue: true               # <- do not stop here
  - receiver: team-backend
    match: { team: backend }
```

Bei einem Alert mit `team=backend, severity=critical` matcht die erste Route und würde normalerweise den Scan stoppen — aber `continue: true` hält ihn am Leben, die zweite Route matcht ebenfalls, und **beide** Receiver feuern. Lass das `continue` weg und nur `all-critical-audit` feuert; das Team erfährt nie davon.

Der Durchlauf erfolgt in der Tiefe zuerst: Wenn ein Kind matcht, steigt der Alert in den Teilbaum *dieses Kindes* ab und löst sich dort auf, bevor ein `continue` ihn zum nächsten Geschwister trägt. Der Alertmanager Route Tester markiert jeden Receiver, der nur deshalb erreicht wurde, weil ein früheres Geschwister `continue: true` gesetzt hat, sodass du auf einen Blick siehst, welche Treffer der primäre Pfad sind und welche ein Fan-out.

## Gruppierung: group_by, group_wait, group_interval, repeat_interval

Das Routing entscheidet, *wohin* ein Alert geht. Die Gruppierung entscheidet, *wie* seine Benachrichtigungen gebündelt und getaktet werden, sobald er dort ankommt. Vier Felder steuern das, und sie liegen auf Route-Knoten direkt neben den Matchers.

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 30s          # wait this long to collect more alerts for a new group
  group_interval: 5m       # then wait this long before sending updates to that group
  repeat_interval: 4h      # re-send an unresolved group no more often than this
```

- **`group_by`** ist die Liste der Labels, die eine Gruppe definiert. Alerts, die für diese Labels dieselben Werte teilen, werden zu einer Benachrichtigung gebündelt. Ein häufiger Spezialfall ist `group_by: ['...']`, das nach *allen* Labels gruppiert (jeder eigenständige Alert ist seine eigene Gruppe), während das Fehlen einer Gruppierung alles zu einer einzigen Gruppe zusammenfasst.
- **`group_wait`** ist, wie lange Alertmanager eine brandneue Gruppe zurückhält, bevor er die erste Benachrichtigung sendet, sodass ein Schwall verwandter Alerts als ein einziges Page statt als zwanzig ankommt.
- **`group_interval`** ist der minimale Abstand, bevor er eine *aktualisierte* Benachrichtigung für eine Gruppe sendet, die bereits gefeuert hat (z. B. wenn ein neuer Alert zur Gruppe hinzukommt).
- **`repeat_interval`** ist, wie oft er erneut über eine Gruppe benachrichtigt, die noch aktiv und ungelöst ist.

Das ist der Unterschied zwischen einem nützlichen Page und einem Alert-Sturm. Und ganz entscheidend — diese Felder werden vererbt.

## Vererbung: Kind-Routen erben receiver und group_by vom Elternknoten

Eine Kind-Route muss den Receiver und die Gruppierung, die sie haben will, nicht wiederholen. Alles, was sie **nicht** setzt, wird vom nächstgelegenen Vorfahren geerbt, der es gesetzt hat. Das geschieht feldweise: Ein Kind kann `group_by` überschreiben und dennoch `group_wait`, `group_interval`, `repeat_interval` und sogar `receiver` erben.

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname', 'cluster']
  group_wait: 30s
  repeat_interval: 4h
  routes:
    - receiver: 'team-DB-pages'
      match:
        service: database
      group_by: ['alertname', 'cluster', 'database']
      # group_wait and repeat_interval are INHERITED from the root:
      #   group_wait: 30s, repeat_interval: 4h
      routes:
        - match:
            severity: critical
          # No receiver set here, so it INHERITS 'team-DB-pages'.
          # No group_by set, so it INHERITS [alertname, cluster, database].
```

![Ein Alertmanager-Route-Baum mit einer Wurzel-Route, die sich in Kind-Routen verzweigt, die mit Matchers beschriftet sind; die Blätter sind Receiver, und ein Beispiel-Alert fließt den passenden, hervorgehobenen Pfad hinab, wobei ein Zweig mit continue true markiert ist](/blog/how-alertmanager-routing-works-diagram.svg)

Der tiefste Knoten in diesem Baum setzt weder einen Receiver noch `group_by`, und doch alarmiert ein Alert mit `service=database, severity=critical`, der ihn erreicht, `team-DB-pages` und gruppiert nach `[alertname, cluster, database]` — beides wird die Kette herabgezogen. Deshalb erzählt das Blatt, auf das du gerade starrst, womöglich nicht die ganze Geschichte: Der effektive Receiver und die effektive Gruppierung werden zusammengesetzt, indem man vom passenden Knoten *nach oben* bis zum ersten Vorfahren läuft, der das jeweilige Feld gesetzt hat. Wenn du einen fehlgeleiteten oder falsch gruppierten Alert debuggst, löse die Vererbung auf, nicht nur das Blatt.

## Einen echten Route-Baum lesen: wo ein bestimmter Alert landet

Setze es zusammen. Hier ist ein vollständiger Baum mit drei Kindern auf der obersten Ebene und einem verschachtelten Teilbaum unter einem davon.

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname']
  group_wait: 30s
  repeat_interval: 4h
  routes:
    - receiver: 'all-critical-audit'
      matchers:
        - severity="critical"
      continue: true                 # mirror, then keep going
    - receiver: 'web-team'
      match:
        service: web
      group_by: ['alertname', 'instance']
      routes:
        - receiver: 'web-team-pager'
          matchers:
            - severity="critical"
        - receiver: 'web-team-slack'
          matchers:
            - severity=~"warning|info"
    - receiver: 'team-Y-mails'
      match:
        team: backend
```

Verfolge nun einen Alert mit diesen Labels:

```bash
alertname=Latency
service=web
severity=critical
instance=web-3
```

Durchlauf des Baums, in der Tiefe zuerst, der Reihe nach:

1. **Die Wurzel** wird betreten (immer). Sie stoppt hier nicht; sie hat Kinder auszuwerten.
2. Erstes Kind, `all-critical-audit`: `severity="critical"` trifft zu. Es matcht → `all-critical-audit` feuert. Es hat `continue: true`, also stoppt der Scan **nicht**.
3. Zweites Kind, `web-team`: `service: web` trifft zu. Der Alert steigt in seinen Teilbaum ab.
   - Erstes Enkelkind, `web-team-pager`: `severity="critical"` trifft zu → `web-team-pager` feuert. Kein `continue`, also stoppt dieser Zweig hier. Das effektive `group_by` ist `[alertname, instance]`, geerbt von `web-team`.
4. Der Treffer von `web-team` (ein Treffer ohne `continue`) stoppt den Scan der obersten Ebene, sodass `team-Y-mails` nie ausgewertet wird.

Endergebnis: Der Alert erreicht **zwei** Receiver — `all-critical-audit` (über `continue`) und `web-team-pager` (der primäre Pfad). Setze `severity` auf `warning` und das Bild ändert sich: `all-critical-audit` fällt heraus, und innerhalb von `web-team` fällt der Alert stattdessen auf `web-team-slack`. Entferne `service=web` und er tritt überhaupt nicht in diesen Teilbaum ein, sondern fällt zu `team-Y-mails` durch, falls `team=backend` gilt, oder zum `default-receiver` der Wurzel, falls nichts matcht.

Wenn deine Alert-Regeln selbst nicht so feuern, wie du es erwartest — falsche Labels, falsche Severity, falsches Timing — liegt das gänzlich oberhalb des Routings; weise die Regel zuerst mit [AlertLint](/loki-alert-rule-tester) nach und verfolge dann, wo ihre Ausgabe hier landet.

## Teste deinen Baum

Du kannst diesen Durchlauf von Hand machen, und bei einem Baum mit drei Knoten lohnt es sich, das einmal zu tun, um das Modell zu verinnerlichen. Aber echte Bäume verschachteln sich fünf Ebenen tief, mischen `match`, `match_re` und `matchers` und streuen `continue` über die Geschwister — und der Preis dafür, es falsch zu machen, ist ein SEV-1, der niemanden alarmiert, oder eine routinemäßige Warnung, die das ganze Team weckt.

Mach es also billig, das zu prüfen. Füge deinen Route-Baum und die Labels eines Beispiel-Alerts in den [Alertmanager Route Tester](/alertmanager-route-tester) ein, und er macht genau den oben beschriebenen Durchlauf — vollständig in deinem Browser, nichts wird hochgeladen. Er meldet jeden Receiver, den der Alert erreicht, in Auswertungsreihenfolge, die Route-Pfad-Breadcrumb von der Wurzel zu jedem passenden Knoten, eine Markierung an jedem Receiver, der nur über `continue: true` erreicht wurde, und das effektive `group_by` nach der Vererbung. Er bildet die Semantik nach, die dieser Beitrag beschreibt: verankerte Regexes, fehlendes-Label-als-leerer-String, erst-Treffer-dann-`continue` und feldweise Vererbung.

Wenn das nächste Mal ein Alert an einer unerwarteten Stelle landet, musst du keinen echten auslösen und zusehen. Füge den Baum ein, füge die Labels ein und lies den Pfad ab, den er tatsächlich genommen hat.
