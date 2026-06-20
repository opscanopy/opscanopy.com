---
title: "Warum erreicht mein Alert nicht den richtigen Receiver? Alertmanager-Routing debuggen"
description: "Alerts landen beim falschen Receiver oder bei gar keinem? Debugge das Alertmanager-Routing — first-match-wins, fehlendes continue, Matcher-Regex und Catch-all-Defaults."
pubDate: 2026-06-18
tags: ["alertmanager","observability","alerting"]
lang: de
translationOf: "debug-alertmanager-routing"
relatedTool:
  name: "Alertmanager Route Tester"
  href: "/alertmanager-route-tester"
---

![Alertmanager-Routing debuggen: Ein Alert mit Labels läuft durch einen Routing-Baum, um den richtigen Receiver statt des falschen zu finden](/blog/debug-alertmanager-routing-hero.svg)

Du hast eine neue Alerting-Regel ausgerollt, sie hat in Produktion gefeuert, und der Page ging an das falsche Team — oder es wurde überhaupt niemand gepaged. Die Regel ist korrekt und der Alert feuert, und trotzdem ist dein Alertmanager-Problem mit dem falschen Receiver real: Die Benachrichtigung landete an einer Stelle, mit der du nicht gerechnet hast. Wenn Alertmanager nicht so routet, wie du es beabsichtigt hast, liegt der Bug fast nie im Alert. Er steckt im `route`-Baum, und Routing-Bäume sind Code, durch den man sich nicht ohne Weiteres Schritt für Schritt durchhangeln kann.

Alertmanager versendet jeden Alert, indem er einen Baum aus Routes durchläuft. Die Wurzel ist das Catch-all, in das jeder Alert eintritt; von dort steigt er in Child-Routes hinab, deren Matcher gegen die Labels des Alerts halten. Mach den Durchlauf falsch, und der Alert landet stillschweigend auf dem falschen Blatt. Dieser Beitrag behandelt die fünf Bugs, die dazu führen, und wie du den Baum selbst durchläufst — ohne `amtool`, ohne Reload, ohne laufende Instanz.

## Das Symptom: stille Pages oder das falsche Team wird gepaged

Zwei Ausprägungen desselben Problems. Entweder ging ein Alert, von dem du erwartet hast, dass er das Datenbank-Team paged, an einen Catch-all-Slack-Channel, den niemand beobachtet, oder ein `severity=critical`-Alert erzeugte gar keinen Page. Beides geht auf dieselbe Ursache zurück: Die Route, die der Alert *tatsächlich* gematcht hat, ist nicht die Route, von der du *glaubst*, dass er sie gematcht hat.

Hier ist der Baum, mit dem die meisten anfangen — das kanonische Routing-Beispiel:

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
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

Ein Alert mit `service=database` erreicht `team-DB-pages`. Einfach genug — bis der Baum wächst, Siblings umsortiert werden, jemand eine Regex hinzufügt und der Durchlauf nicht mehr das tut, was du auf dem Papier abliest. Die Lösung ist immer dieselbe: Hör auf, im Kopf zu argumentieren, und lauf den Baum gegen die exakten Labels durch, die der Alert trägt. Jeder Bug weiter unten ist eine andere Art, wie dich der Durchlauf überrascht.

## Bug 1: first match wins und du hast continue: true vergessen

Das ist der häufigste Alertmanager-routet-nicht-Bug. Innerhalb einer gematchten Route werden Child-Routes **von oben nach unten** ausgewertet, und der Alert steigt in das **erste** matchende Child hinab — danach stoppt der Sibling-Scan. Spätere Siblings werden nie ausgewertet.

Das beißt am stärksten, wenn du willst, dass ein Alert zwei Receiver erreicht — etwa jeden kritischen Alert gespiegelt an einen Audit-Receiver *und* zugleich an das verantwortliche Team geroutet:

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname']
  routes:
    - receiver: 'all-critical-audit'
      matchers:
        - severity="critical"
    - receiver: 'team-Y-pages'
      match:
        team: backend
```

Feuere einen Alert mit `team=backend` und `severity=critical`. Er matcht das erste Sibling, `all-critical-audit`, und der Scan stoppt dort. `team-Y-pages` wird nie erreicht, also wird das Backend-Team nie gepaged. Der Audit-Channel hat ihn geloggt, also *sieht* es so aus, als hätte das Routing funktioniert — was genau der Grund ist, warum dieser Bug so schwer zu entdecken ist.

Der Fix ist eine einzige Zeile. Eine gematchte Route mit `continue: true` stoppt den Sibling-Scan nicht, sodass der Alert weiter zu den nachfolgenden matchenden Siblings durchfällt:

```yaml
    routes:
      - receiver: 'all-critical-audit'
        matchers:
          - severity="critical"
        continue: true        # keep going to later siblings
      - receiver: 'team-Y-pages'
        match:
          team: backend
```

Jetzt feuern beide. Ein Alert kann nur dann mehr als einen Receiver erreichen, wenn `continue: true` auf einer gematchten Route gesetzt ist; ohne das gewinnt immer das erste matchende Sibling.

## Bug 2: der Matcher matcht nicht (Regex, Quoting, ein fehlendes Label)

Wenn der Alert stillschweigend eine Route überspringt, von der du sicher warst, dass er sie trifft, dann matcht der Matcher wahrscheinlich nicht. Drei Fallen machen fast alle dieser Fälle aus.

**Regexes sind vollständig verankert.** Sowohl `match_re` als auch die Operatoren `=~` / `!~` umschließen dein Muster als `^(?:…)$`. Ein partielles Muster matcht nie einen längeren Wert:

```yaml
matchers:
  - env=~"staging"      # env=staging-eu does NOT match — anchored to exactly "staging"
```

```yaml
matchers:
  - env=~"staging-.*"   # env=staging-eu matches now
```

**Ein fehlendes Label ist der leere String.** Alertmanager behandelt ein auf dem Alert nicht vorhandenes Label als `""`, also matcht `team=""` einen Alert *ohne* `team`-Label, und `team!=""` verlangt, dass es vorhanden und nicht leer ist. Wenn du `match: { team: frontend }` schreibst, der Alert aber nie ein `team`-Label setzt, vergleicht der Matcher `frontend` mit `""`, schlägt fehl, und die Route wird übersprungen — du fällst durch.

**Operatoren und Quoting in `matchers:`-Strings.** Die moderne `matchers:`-Form nimmt Strings wie `foo="bar"`, `foo=~"re"`, `foo!="x"` und `foo!~"re"`; der Wert kann gequotet oder ungequotet sein. Die zweistelligen Operatoren (`=~`, `!~`, `!=`) werden vor dem einzelnen `=` gematcht, sodass `severity!="info"` als Ungleichheit geparst wird. Mach das Quoting falsch — lass etwa ein Anführungszeichen offen — und der Matcher ist ungültig; ein ungültiger Matcher kann nicht halten, also wird die Route übersprungen.

Hier ist eine Matcher-Route, die eine Regex mit einer Ungleichheit kombiniert:

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname', 'env']
  routes:
    - receiver: 'staging-slack'
      matchers:
        - env=~"staging-.*"
        - severity!="info"
    - receiver: 'prod-pager'
      match_re:
        env: 'prod-.*'
```

Alle Matcher einer Route müssen halten, damit sie matcht — es ist ein logisches UND. Ein Alert mit `env=staging-eu` und `severity=warning` erreicht `staging-slack`: Das verankerte `staging-.*` matcht und `severity` ist nicht `info`. Ändere `severity` auf `info`, und der zweite Matcher schlägt fehl, sodass die gesamte Route übersprungen wird.

Wenn deine Alert-Regeln von vornherein die falschen Labels tragen — oder die fehlen, auf die deine Routes matchen — behebe das weiter oben in der Kette. Der [Prometheus Relabel Tester](/prometheus-relabel-tester) zeigt dir genau, welche Labels deine relabel_configs überleben, bevor sie überhaupt den Routing-Baum erreichen.

## Bug 3: eine Catch-all-Default-Route verschluckt alles, bevor deine Route erreicht wird

Eine Alertmanager-Catch-all-Route soll ein Sicherheitsnetz sein — der Receiver, der feuert, wenn nichts Spezifischeres matcht. Aber ein Catch-all, das *über* einem spezifischen Sibling platziert ist statt darunter, wird zur Falle. In Kombination mit first-match-wins überschattet eine breite Regel ganz oben jede spezifische Regel darunter:

```yaml
# Trap: the broad rule above shadows the specific one
routes:
  - receiver: catch-all
    matchers: ['severity=~".*"']   # matches everything
  - receiver: db-pager             # NEVER reached
    match: { service: database }
```

`severity=~".*"` matcht jeden Alert, der ein `severity`-Label hat (verankert, aber `.*` deckt den ganzen Wert ab). Es ist das erste Sibling, also stoppt der Scan dort — `db-pager` ist toter Code. Das Datenbank-Team wird nie gepaged.

Es gibt zwei korrekte Arten, über ein Catch-all nachzudenken. Entweder stellst du deine spezifischen Routes nach vorne und die breite zuletzt:

```yaml
# Fix: specific first, broad last
routes:
  - receiver: db-pager
    match: { service: database }
  - receiver: catch-all
    matchers: ['severity=~".*"']
```

Oder du verlässt dich auf das echte Catch-all, das du ohnehin schon hast — den `receiver` der Root-Route selbst. Wenn keine Child-Route matcht, wird die Route, in der der Alert gerade steckt, zum terminalen Match, und *ihr* Receiver feuert. Die Wurzel setzt immer einen Default-`receiver`, sodass ein Alert, der auf kein Child matcht, trotzdem irgendwo landet:

```yaml
route:
  receiver: 'default-receiver'     # the true catch-all
  group_by: ['alertname']
  routes:
    - receiver: 'team-X-mails'
      match: { team: frontend }
    - receiver: 'team-Y-mails'
      match: { team: backend }
```

Ein Alert mit `team=platform` matcht auf keines der Children. Er erzeugt keinen Fehler und verschwindet nicht — er fällt zu `default-receiver` durch, dem Catch-all, das genau wie beabsichtigt funktioniert. Die "Warum wurde mein Alert nicht geroutet?"-Fälle sind meistens genau das: Er *wurde* geroutet, direkt zum Default, weil kein Child gematcht hat. Wenn eine Route zu gar keinem Receiver aufgelöst wird, ist das eine echte Fehlkonfiguration — Alertmanager verlangt, dass die Wurzel einen Default-`receiver` setzt.

## Bug 4: Reihenfolge der Routes unter Siblings

Bug 3 ist ein Catch-all, das alles verschluckt. Bug 4 ist die subtilere, allgemeinere Variante: Unter Siblings entscheidet die Reihenfolge *immer* darüber, welche einzelne Route gewinnt, selbst wenn beide spezifisch sind. Weil (ohne `continue`) nur das erste matchende Sibling genommen wird, routen zwei überlappende Matcher in der falschen Reihenfolge den Alert zum falschen Team.

![Ein fehlgeleiteter Alert: Links trifft der Alert auf den Routing-Baum und landet wegen des fehlenden continue rot beim falschen Receiver, rechts routet der korrigierte Baum ihn grün zum richtigen Receiver](/blog/debug-alertmanager-routing-diagram.svg)

Betrachte einen Alert, der zugleich ein Datenbank-Alert und ein Backend-Team-Alert ist:

```yaml
# labels: service=database, team=backend, severity=critical
routes:
  - receiver: 'team-Y-pages'      # matches team=backend
    match: { team: backend }
  - receiver: 'team-DB-pages'     # matches service=database
    match: { service: database }
```

Die Matcher beider Routes halten gegen diesen Alert. Die Reihenfolge entscheidet das Unentschieden: `team-Y-pages` steht zuerst, also gewinnt es, und die Datenbank-Rufbereitschaft (`team-DB-pages`) wird nie erreicht. Tausche die beiden, und stattdessen gewinnt die Datenbank-Route. Keiner der Matcher ist falsch — die *Reihenfolge* ist der Bug.

Wenn zwei Siblings legitimerweise beide matchen können, hast du drei Möglichkeiten: Stelle das, das gewinnen soll, nach vorne, mach die Matcher gegenseitig ausschließend (füge etwa `service!=database` zur Backend-Route hinzu), oder setze `continue: true` auf der ersten, sodass der Alert beide erreicht. Verschachtelung hilft ebenfalls — ein Parent matcht den breiten Fall und engt ihn mit Children ein:

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname']
  routes:
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
```

Ein Alert mit `service=web` steigt zuerst in `web-team` hinab, dann wählen die verschachtelten Children den Receiver nach `severity`. Ein `severity=critical`-Web-Alert läuft `root → web-team → web-team-pager`. Der Abstieg ist explizit, sodass Überraschungen bei der Reihenfolge auf eine kleine Sibling-Liste begrenzt bleiben, statt sich über den ganzen Baum zu verstecken.

## Bug 5: Grouping lässt einen Alert vermisst aussehen, obwohl er nur gebündelt ist

Manchmal wurde der Alert perfekt geroutet und du denkst trotzdem, er fehlt — weil Grouping ihn mit anderen gebündelt hat und die Benachrichtigung *noch* nicht versendet wurde. Grouping wird über `group_by`, `group_wait`, `group_interval` und `repeat_interval` gesteuert, und alle vier werden im Baum nach unten **vererbt**. Ein Child, das keinen eigenen Wert setzt, übernimmt den des Parents:

```yaml
route:
  group_by: ['alertname', 'cluster']
  group_wait: 30s
  routes:
    - receiver: db-pager
      match: { service: database }
      # no group_by here → INHERITS ['alertname', 'cluster']
```

Das `db-pager`-Blatt hat kein eigenes `group_by`, also erbt es `['alertname', 'cluster']` und ein `group_wait` von 30s von der Wurzel. Zwei Konsequenzen bringen Leute aus dem Tritt. Erstens wird eine neue Gruppe vor ihrer ersten Benachrichtigung für die Dauer von `group_wait` zurückgehalten — ein frisch gefeuerter Alert, der "nicht paged", steckt also vielleicht nur innerhalb seines Wait-Fensters. Zweitens, wenn `group_by` zu grob ist, wird dein Alert in die Benachrichtigung einer bestehenden Gruppe gefaltet und sieht so aus, als hätte er nie separat gefeuert.

Überschreibe nur dort, wo ein Subtree tatsächlich ein anderes Grouping braucht:

```yaml
route:
  group_by: ['alertname', 'cluster']
  routes:
    - receiver: db-pager
      match: { service: database }
      group_by: ['alertname', 'cluster', 'database']
```

Das Blatt, das du gerade liest, ist nicht zwangsläufig das Grouping, das gilt. Löse immer das *effektive* `group_by` auf — den Wert, der vom nächstgelegenen Vorfahren geerbt wird, der es gesetzt hat — bevor du schlussfolgerst, dass ein Alert fehlt.

## Alertmanager-Routing ohne amtool testen: lauf den Baum gegen die Labels des Alerts durch

Du brauchst kein `amtool config routes test`, und du musst keinen laufenden Alertmanager neu laden, um Route-Debugging zu betreiben. Der Routing-Durchlauf ist deterministisch, also kannst du ihn von Hand machen. Nimm die exakten Labels vom feuernden Alert und lauf den Baum von oben nach unten durch:

```bash
# The labels the alert actually carries (from the Alertmanager UI or API):
alertname=HighLatency
service=database
team=backend
severity=critical
```

Dann, beginnend an der Wurzel:

1. **Betritt die Wurzel.** Jeder Alert tut das — sie ist das Catch-all. Notiere ihren `receiver` und ihr `group_by` als Vererbungs-Baseline.
2. **Scanne die Children von oben nach unten.** Prüfe für jedes Child, ob *alle* seine Matcher gegen die Labels halten. Denk daran: Regexes sind verankert, und ein fehlendes Label ist `""`.
3. **Steige in den ersten Match hinab.** Dieser Child-Subtree ist jetzt der Ort, an dem du dich befindest. Falls er `continue: true` gesetzt hat, scanne auch seine nachfolgenden Siblings weiter — diese werden zu zusätzlichen Matches.
4. **Wenn kein Child matcht, bist du fertig.** Die aktuelle Route ist der terminale Match; ihr geerbter `receiver` feuert.
5. **Löse die Vererbung am Blatt auf.** Der effektive `receiver` und das effektive `group_by` stammen vom nächstgelegenen Vorfahren, der sie gesetzt hat, nicht zwangsläufig vom Blatt.

Mach das für die obigen Labels gegen den Docs-Baum, und du landest über `service=database` bei `team-DB-pages`, wobei du `group_by` von der Wurzel erbst. Diesen Durchlauf für einen Baum mit 40 Knoten auf Papier zu machen, ist genau das fehleranfällige Nachdenken, das den Bug überhaupt erst hervorgebracht hat — was der ganze Grund ist, warum es einen Tester gibt.

## Finde jetzt den matchenden Receiver: ein Alertmanager-Route-Debugger im Browser

Wenn der Baum mehr als ein paar Knoten hat, lauf ihn mit dem [Alertmanager Route Tester](/alertmanager-route-tester) durch statt im Kopf. Füge deinen Routing-Baum ein — einen nackten `route:`-Block oder eine vollständige `alertmanager.yml`, von der nur der `route`-Block gelesen wird — und die Labels des Beispiel-Alerts, ein `key=value` pro Zeile. Er reproduziert die Semantik exakt: first-match-wins, `continue: true`-Fan-out, verankerte Regexes, fehlendes-Label-als-leerer-String und Grouping-Vererbung.

Zurück bekommst du jeden Receiver, den der Alert erreicht, in Auswertungsreihenfolge, jeweils mit seinem Route-Pfad als Breadcrumb von der Wurzel hinab zum gematchten Knoten, einem Tag für jeden Match, der nur über `continue` erreicht wurde, und dem effektiven `group_by` nach Vererbung. Es ist ein Trockenlauf des Dispatchs — es wird keine Benachrichtigung versendet, nichts wird hochgeladen, und alles läuft in deinem Browser, sodass du gefahrlos interne Receiver-Namen und private Team-Labels einfügen kannst.

Sobald die Labels an der Quelle mit dem [Prometheus Relabel Tester](/prometheus-relabel-tester) als korrekt bestätigt sind und nachgewiesen ist, dass deine Regeln mit [AlertLint](/loki-alert-rule-tester) feuern, ist der Routing-Baum der letzte Hop, den es richtig zu machen gilt. Lauf ihn durch, bevor er irgendjemanden paged — und beim nächsten Mal, wenn ein Alert den falschen Receiver erreicht, wirst du wissen, welcher Knoten ihn dorthin geschickt hat.

[Öffne den Alertmanager Route Tester →](/alertmanager-route-tester)
