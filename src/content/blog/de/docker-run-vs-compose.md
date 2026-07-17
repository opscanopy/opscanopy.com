---
title: "docker run vs. Docker Compose: Ein praktischer Migrationsleitfaden"
description: "Wann du docker run verwenden solltest, wann der Wechsel zu Docker Compose sinnvoll ist und wie du in beide Richtungen konvertierst — mit korrekt behandelten Volumes, Netzwerken und Reproduzierbarkeit."
pubDate: 2026-06-10
tags: ["docker","docker-compose","containers"]
lang: de
translationOf: "docker-run-vs-compose"
relatedTool:
  name: "Docker Run to Compose"
  href: "/docker-run-to-compose"
---

![Diagramm im Vergleich von docker run und Docker Compose: links ein einzelner docker-run-Befehl, rechts der äquivalente docker-compose.yml-Service, mit bidirektionalen Konvertierungspfeilen](/blog/docker-run-vs-compose-hero.svg)

Du hast vor drei Wochen einen Postgres-Container mit einem `docker run`-Einzeiler gestartet. Er läuft. Dann startest du die Maschine neu, oder ein Teamkollege braucht dasselbe Setup, oder du willst den Befehl in die Versionsverwaltung packen — und merkst, dass die einzige Kopie dieses Befehls in deiner Shell-History steckt, irgendwo zwischen einem `ls` und einem `kubectl get pods`. In diesem Moment hört die Frage `docker run` vs. `docker compose` auf, eine akademische zu sein. Der Container ist in Ordnung; die Art, wie du ihn gestartet hast, ist nicht reproduzierbar.

Dieser Leitfaden geht beide Richtungen durch: wann `docker run` die richtige Wahl ist, wann der Umstieg auf eine `docker-compose.yml` sinnvoll ist und wie du einen Compose-Service wieder in eine einzelne Run-Zeile zurückverwandelst, wenn du eine brauchst. Jede Flag-Zuordnung hier entspricht genau dem, was der [Docker Run to Compose Konverter](/docker-run-to-compose/) tatsächlich macht, sodass du deine eigenen Befehle damit abgleichen kannst.

## Derselbe Container, zwei Wege

Hier ist ein echter Postgres-Container, ausgedrückt als `docker run`-Befehl:

```bash
docker run -d --name db \
  -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=app \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16
```

Und hier ist genau derselbe Container als Compose-Service:

```yaml
services:
  db:
    image: postgres:16
    container_name: db
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_PASSWORD=secret
      - POSTGRES_DB=app
    restart: unless-stopped
```

![Ein Container in zwei Formaten dargestellt — links ein einzelner docker-run-Befehl, rechts ein docker-compose.yml-Service-Baum — mit bidirektionalen Konvertierungspfeilen](/blog/docker-run-vs-compose-diagram.svg)

Gleiches Image, gleiche Ports, gleiches benanntes Volume, gleiche Restart-Policy. Der Unterschied liegt nicht darin, was läuft — sondern darin, ob die Definition in deiner Shell-History lebt oder in einer Datei, die du committen, reviewen und mit einem einzigen Befehl erneut ausführen kannst. Beachte die Anführungszeichen um `"5432:5432"`: Andernfalls würde YAML ein bloßes `5432:5432` als sexagesimale (Basis-60-)Zahl interpretieren — einer der kleinen Fehler, die man sich bei der Konvertierung von Hand allzu gern einhandelt.

## Wofür docker run gut ist

`docker run` punktet bei allem Wegwerfbaren. Du willst einen einmaligen psql-Client, ein schnelles Redis zum Herumprobieren, ein Basis-Image zum Hineinspringen fürs Debugging — dafür willst du keine YAML-Datei schreiben.

```bash
# ein frisches redis für dreißig Sekunden ausprobieren
docker run --rm -it redis:7-alpine redis-cli

# innerhalb eines Images debuggen, ohne etwas zu hinterlassen
docker run --rm -it -v "$PWD":/work -w /work ubuntu:24.04 bash
```

Das `--rm`-Flag ist hier entscheidend: Der Container löscht sich beim Beenden selbst, sodass du keine toten Container aus deinen Experimenten ansammelst. Das ist ein echtes `docker run`-spezifisches Anliegen — und bemerkenswerterweise hat `--rm` überhaupt kein Compose-Äquivalent, weil Compose den Container-Lebenszyklus für dich verwaltet. Wenn du einen Befehl mit `--rm` in einen Konverter einfügst, ist es das Ehrlichste, ihn mit einer Warnung wegzulassen, statt so zu tun, als ließe er sich auf etwas abbilden. Genau das macht der Konverter.

Dasselbe gilt für `-d` / `--detach`. Der Detached-Modus ist eine Eigenschaft *davon, wie du den Prozess gestartet hast*, nicht der Service-Definition, und gehört deshalb ebenfalls nicht in die YAML. Darauf kommen wir im Abschnitt über die Fallstricke zurück, denn es bringt Leute in beiden Richtungen zum Stolpern.

## Was Compose dir bringt: Wann du Docker Compose verwenden solltest

Greif zu Compose, sobald auch nur einer dieser Punkte zutrifft — und "Wann sollte man Docker Compose verwenden?" läuft meist genau auf diese Liste hinaus:

- Du wirst diesen Container mehr als einmal ausführen und willst ihn reproduzierbar haben.
- Du willst die Definition in der Versionsverwaltung haben und in einem PR reviewen lassen.
- Du hast mehr als einen Container, der zusammen hochfahren muss.
- Du hast es satt, dir einen 200 Zeichen langen Befehl zu merken.

Eine Compose-Datei verwandelt eine Wand aus Flags in ein reviewbares Dokument und einen einzigen Lebenszyklus:

```bash
docker compose up -d     # alles starten, detached
docker compose down      # alles stoppen und entfernen
docker compose logs -f   # jeden Service mitverfolgen
```

Bei Multi-Service tut sich die Lücke erst richtig auf. Zwei `docker run`-Befehle, die miteinander reden müssen, zwingen dich dazu, ein Netzwerk von Hand zu verwalten, sie in der richtigen Reihenfolge zu starten und dir beide Zeilen zu merken. Compose macht die Beziehung deklarativ:

```yaml
services:
  api:
    image: myorg/api:1.4.0
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgres://db:5432/app
    depends_on:
      - db
  db:
    image: postgres:16
    environment:
      - POSTGRES_DB=app
```

Der `api`-Service erreicht die Datenbank unter dem Hostnamen `db` ganz ohne zusätzliche Verkabelung. Das ist das implizite Standardnetzwerk, das seine Arbeit tut — mehr dazu weiter unten. Und weil das Ganze eine Datei ist, kannst du die CI linten, die sie baut und ausliefert; wenn deine Pipeline in einem Job `docker compose up` ausführt, fängt der [GitLab CI Validator](/gitlab-ci-validator/) eine fehlerhafte `.gitlab-ci.yml` ab, bevor es der Runner tut.

![Synthwave-Illustration: ein docker run-Einzeiler auf einem Retro-Computer wandert entlang eines Neon-Pfeils zu einem Multi-Container-Docker-Compose-Stack auf einem anderen](/blog/in-content/docker-run-vs-compose.webp)

## Der umgekehrte Weg: Compose zu docker run

Migration ist keine Einbahnstraße. Du wirst auf Fälle stoßen, in denen du einen Compose-Service hast, aber eine einzelne `docker run`-Zeile brauchst:

- Ein Teamkollege auf einer Maschine ohne deine Compose-Datei, der den Container einfach *jetzt* laufen haben muss.
- Ein Support-Ticket oder Runbook, bei dem ein einziger Copy-Paste-Befehl besser ist als "klone das Repo, dann führe Compose aus."
- Ein eingeschränkter CI-Schritt oder ein Remote-Host, bei dem es übertrieben wäre, das gesamte Projekt zu ziehen.

Einen `compose service to docker run` zu konvertieren ist mechanisch, von Hand aber fummelig. Nimm den Redis-Service mit einem Healthcheck:

```yaml
services:
  cache:
    image: redis:7-alpine
    container_name: cache
    ports:
      - "6379:6379"
    mem_limit: 256m
    labels:
      - app=web
    healthcheck:
      test: "CMD-SHELL redis-cli ping"
      interval: 10s
      timeout: 3s
      retries: 5
```

Der äquivalente Befehl baut jedes Feld nach — und wird entscheidenderweise standardmäßig detached ausgegeben, weil ein langlebiger Service fast nie etwas ist, das dein Terminal blockieren soll:

```bash
docker run -d --name cache -p 6379:6379 -m 256m \
  -l app=web \
  --health-cmd 'redis-cli ping' \
  --health-interval 10s --health-timeout 3s --health-retries 5 \
  redis:7-alpine
```

Der Healthcheck-Block expandiert zurück in die einzelnen `--health-*`-Flags; aus `mem_limit` wird `-m`; aus Labels werden `-l`. Der Konverter stellt `docker run -d` genau deshalb voran, weil der Service im Hintergrund laufen sollte. Worauf du achten musst: Compose-eigene Schlüssel wie `depends_on`, `build` und `deploy` haben kein Befehls-Äquivalent, deshalb meldet ein verlässlicher Konverter sie als Warnungen, statt Flags zu erfinden, die es nicht gibt. Wenn dein Service `build:` hat, führst du zuerst `docker build` aus und übergibst das resultierende Tag an `docker run`.

## Einen echten Befehl Schritt für Schritt migrieren

Nehmen wir eine nicht-triviale `docker run`-Zeile und gehen die Migration von Anfang bis Ende durch. Hier ist ein App-Container in einem benutzerdefinierten Netzwerk mit angepassten Capabilities:

```bash
docker run -d --name api \
  --network backend \
  -p 3000:3000 \
  -e NODE_ENV=production \
  --cap-add NET_ADMIN --cap-drop ALL \
  --add-host db:10.0.0.5 \
  myorg/api:1.4.0
```

**Schritt 1 — tokenisieren, nicht nach Augenmaß.** Der Befehl wird shell-typisch zerlegt: Anführungszeichen und Backslash-Zeilenumbrüche werden berücksichtigt, und gebündelte Kurz-Flags wie `-it` werden in `-i -t` expandiert. Der erste Token, der kein Flag ist (`myorg/api:1.4.0`), ist das Image; alles danach wäre der Container-Befehl.

**Schritt 2 — jedes Flag einem Schlüssel zuordnen.** Ports gehen zu `ports`, `-e` zu `environment`, `--cap-add`/`--cap-drop` zu `cap_add`/`cap_drop`, `--add-host` zu `extra_hosts` und `--network backend` zur `networks`-Liste.

**Schritt 3 — das Ergebnis lesen.**

```yaml
services:
  api:
    image: myorg/api:1.4.0
    container_name: api
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    networks:
      - backend
    extra_hosts:
      - db:10.0.0.5
    cap_add:
      - NET_ADMIN
    cap_drop:
      - ALL
```

Eine Sache, die der Konverter bewusst *nicht* tut: einen Top-Level-Abschnitt `networks:` erfinden, um den du nicht gebeten hast. Das `backend`-Netzwerk taucht unter dem Service auf, genau so benannt. Wenn `backend` ein Netzwerk ist, das du mit `docker network create` angelegt hast, musst du es selbst auf oberster Ebene als `external` deklarieren — das Tool rät nicht an Infrastruktur herum, die du nicht aufgeschrieben hast. Diese Zurückhaltung ist der springende Punkt; ein Konverter, der Struktur halluziniert, ist schlimmer als einer, der nur das konvertiert, was du ihm gegeben hast.

## Fallstricke bei der Migration

Die Flags selbst lassen sich sauber abbilden. Das Verhalten drumherum ist die Stelle, an der Migrationen klammheimlich schiefgehen.

### Das implizite Standardnetzwerk

Ein bloßes `docker run` ohne `--network` hängt den Container an das standardmäßige `bridge`-Netzwerk, in dem Container sich nur per IP erreichen. Compose ist anders: Es erzeugt ein *projektbezogenes* Netzwerk und legt jeden Service darauf, sodass sich die Services von Haus aus über den Service-Namen (`db`, `api`) auflösen. Das ist normalerweise genau das, was du willst — aber es bedeutet, dass ein `docker run`, das mit `172.17.0.3` gesprochen hat, anfangen muss, mit `db` zu sprechen, sobald es ein Compose-Service ist. Das Flag zu migrieren ist einfach; die Annahme zu migrieren, dass "es eine einzige flache Bridge gibt", ist der Teil, der beißt.

### Unterschiede bei der Restart-Policy

`--restart` lässt sich direkt übertragen — `no`, `always`, `on-failure` und `unless-stopped` gehen alle unverändert auf `restart:` über:

```yaml
restart: unless-stopped
```

Die Feinheit: Bei `docker run` ist die Restart-Policy das *Einzige*, was deinen Container über einen Daemon-Neustart hinweg am Leben hält. Bei Compose gilt derselbe `restart:`-Wert, aber du bekommst zusätzlich `docker compose up`/`down` als expliziten Lebenszyklus. Geh nicht davon aus, dass `restart: always` bedeutet "Compose holt das nach einem `down` wieder hoch" — `down` entfernt den Container unabhängig davon. Die Restart-Policy regelt Abstürze und Reboots, nicht deine eigenen Teardown-Befehle.

### env_file vs. -e

Inline-Flags `-e KEY=value` werden zu einer `environment:`-Liste, und `--env-file path` wird zu `env_file:`. Sie sind nicht austauschbar:

```yaml
services:
  api:
    image: myorg/api:1.4.0
    env_file:
      - .env.production
    environment:
      - NODE_ENV=production    # gewinnt gegen denselben Schlüssel in env_file
```

Inline-Werte sind in der Datei und in `docker inspect` sichtbar; eine `env_file` hält geheimnistragende Werte aus der YAML und aus deiner Shell-History heraus. Bei der Migration ist das ein guter Moment, um Geheimnisse aus `-e`-Flags in eine `env_file` zu verschieben. Wenn du schon dabei bist, stell sicher, dass die committete `.env.example` tatsächlich zu den Schlüsseln passt, die dein Service liest — der [Env Example Checker](/env-example-checker/) vergleicht eine echte `.env` mit ihrem Beispiel, damit ein fehlender Schlüssel nicht als Absturz bei einem frischen Checkout auftaucht.

### Detached-Modus

`-d` / `--detach` existiert in einer Compose-Datei nicht, weil Detaching eine Entscheidung zur Startzeit ist, keine Eigenschaft des Services. Beim Weg `docker run → compose` wird das `-d` weggelassen (du führst stattdessen `docker compose up -d` aus). Beim Weg `compose → docker run` *fügt* ein verlässlicher Konverter `-d` wieder hinzu, weil eine Service-Definition fast immer einen langlaufenden Prozess beschreibt. Beide Verhaltensweisen sind korrekt; sie sehen nur asymmetrisch aus, bis du verstehst, warum. Wenn dir ein verirrtes `-d` im generierten YAML zu "fehlen" scheint, ist das das Tool, das richtig handelt, und nicht dein verlorenes Flag.

## Beide Richtungen sofort konvertieren

Das von Hand zu machen ist für einen Container in Ordnung. Es hört auf, in Ordnung zu sein, wenn du unter Zeitdruck eine Wand aus `-p`-, `-v`- und `-e`-Flags übersetzt und sich eine falsch verschachtelte Liste oder ein nicht in Anführungszeichen gesetzter Port einschleicht.

Der [Docker Run to Compose Konverter](/docker-run-to-compose/) erledigt den mechanischen Teil in beide Richtungen: Füge einen `docker run`-Befehl ein, um den äquivalenten `docker-compose.yml`-Service zu erhalten, oder füge einen Compose-Service ein, um die Run-Zeile nachzubauen — inklusive Ports, Volumes, Environment, Netzwerken, Capabilities, Ressourcen-Limits und Healthchecks. Er sagt dir Bescheid über die Flags und Schlüssel, die sich wirklich nicht abbilden lassen, statt sie stillschweigend wegzulassen, und er läuft vollständig in deinem Browser, sodass Befehle, die private Registries nennen oder geheimnistragende Umgebungsvariablen enthalten, niemals den Tab verlassen.

Migriere den Befehl, lies die Warnungen, committe die Datei.
