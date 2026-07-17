---
title: "Wie man einen docker-run-Befehl in eine docker-compose.yml umwandelt"
description: "Wandle jeden docker-run-Befehl Flag für Flag in einen docker-compose.yml-Service um – Ports, Volumes, Environment, Restart und mehr. Eine praxisnahe Anleitung zum Kopieren und Einfügen."
pubDate: 2026-06-09
tags: ["docker","docker-compose","containers"]
lang: de
translationOf: "convert-docker-run-to-compose"
relatedTool:
  name: "Docker Run to Compose"
  href: "/docker-run-to-compose"
---

![Einen docker-run-Befehl Flag für Flag in einen docker-compose.yml-Service umwandeln](/blog/convert-docker-run-to-compose-hero.svg)

Du hast während einer Debugging-Session schnell mit einer `docker run`-Zeile einen Container gestartet. Es hat funktioniert. Jetzt möchte jemand das Ganze im Repo haben, in einem PR reviewbar, mit einem einzigen Befehl startbar – und du hast einen 200 Zeichen langen Einzeiler mit `-p`, drei `-v`-Mounts, einem halben Dutzend `-e`-Flags und einer `--restart`-Policy, den du nun in eine `docker-compose.yml` umwandeln musst. Das ist der Moment, in dem die meisten Leute zur Doku greifen und mit dem Übersetzen von Hand beginnen – und genau dort gehen Flags verloren, werden Ports falsch gequotet und Listen falsch verschachtelt.

Diese Anleitung zeigt Schritt für Schritt, wie man einen `docker run`-Befehl Flag für Flag in eine `docker-compose.yml` umwandelt, inklusive der Stolperfallen, die einen erwischen, wenn man es von Hand macht. Jedes Mapping hier entspricht genau dem, was der [Docker Run to Compose converter](/docker-run-to-compose/) tatsächlich ausgibt. So kannst du die Regeln nachlesen und dann deinen Befehl in das Tool einfügen, um dir den mechanischen Teil zu sparen.

## Warum man von docker run zu Compose wechseln sollte

Ein `docker run`-Befehl ist eine gute Möglichkeit, einen einzelnen Container interaktiv zu starten. Er hört in dem Moment auf, eine gute Möglichkeit zu sein, sobald eine dieser Bedingungen zutrifft:

- Der exakte Aufruf muss in der Versionsverwaltung liegen, damit ein Teammitglied ihn reproduzieren kann.
- Du möchtest ihn reviewen lassen – ein YAML-Diff ist in einem PR weitaus leichter zu lesen als eine Wand aus Flags in einer einzigen Zeile.
- Der Container hat Abhängigkeiten, oder du wirst bald einen zweiten Service hinzufügen.
- Du möchtest `docker compose up -d` schreiben, statt dir jedes Mal den vollständigen Befehl merken zu müssen.

Compose ändert nichts daran, was der Container tut. Es gibt derselben Konfiguration nur eine deklarative, diffbare Form. Die Übersetzung ist nahezu vollständig mechanisch – und genau deshalb lohnt es sich, die Regeln sauber zu kennen, statt sie über den Daumen zu peilen.

## Die Anatomie eines docker-run-Befehls

Hier ein echtes Beispiel: Postgres, veröffentlichter Port, benanntes Volume, zwei Environment-Variablen, eine Restart-Policy:

```bash
docker run -d --name db \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=app \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16
```

Von links nach rechts gelesen besteht ein `docker run`-Befehl aus drei Teilen:

1. **`docker run`** – das Befehls-Präfix.
2. **Die Flags** – alles, was mit `-` oder `--` beginnt, in beliebiger Reihenfolge. Jedes Flag nimmt entweder einen Wert (`-p 5432:5432`) oder ist ein boolesches Flag (`-d`).
3. **Das Image, danach der Befehl** – der *erste* Token, der kein Flag ist, ist das Image (`postgres:16`). Alles danach ist der Befehl, der im Container ausgeführt wird, und wird wortwörtlich übergeben.

Diese Reihenfolge ist wichtig. Sobald der Parser auf das Image trifft, hört das Flag-Scanning auf – `docker run ... postgres:16 -p 80:80` behandelt `-p 80:80` als Argumente für den Container, nicht als veröffentlichten Port. Halte deine Flags also *vor* dem Image.

Gebündelte Kurz-Flags sind die andere Sache, die man kennen muss. `-it` sind zwei Flags (`-i` und `-t`), und `-itp 8080:80` sind drei: `-i`, `-t` und `-p 8080:80`. Ein wertaufnehmendes Flag wie `-p` verbraucht den Rest des Bündels (oder den nächsten Token) als sein Argument.

## Jedes docker-run-Flag auf docker-compose.yml abbilden

Das ist der Kern beim Umwandeln eines `docker run`-Befehls in Compose: Jedes Flag wird auf einen Key unterhalb des Service abgebildet. Hier die vollständige Mapping-Tabelle für die Flags, die dir tatsächlich begegnen werden.

![Ein Mapping, das docker-run-Flags auf der linken Seite über Pfeile mit ihren docker-compose.yml-Keys auf der rechten Seite verbindet](/blog/convert-docker-run-to-compose-diagram.svg)

| `docker run`-Flag | `docker-compose.yml`-Key | Hinweise |
|---|---|---|
| `-p` / `--publish` | `ports` | Gequoteter String, z. B. `"8080:80"` |
| `-v` / `--volume`, `--mount` | `volumes` | Kurze Form `source:target[:ro]` |
| `-e` / `--env` | `environment` | `KEY=value`-Liste |
| `--env-file` | `env_file` | Eine oder mehrere Dateien |
| `--name` | `container_name` | Wird auch zum Service-Key |
| `--restart` | `restart` | `no` / `always` / `on-failure` / `unless-stopped` |
| `--network` / `--net` | `networks` | `host` / `none` → `network_mode` |
| `-w` / `--workdir` | `working_dir` | |
| `-u` / `--user` | `user` | |
| `--cap-add` / `--cap-drop` | `cap_add` / `cap_drop` | |
| `--add-host` | `extra_hosts` | |
| `--hostname` | `hostname` | |
| `--entrypoint` | `entrypoint` | |
| `--privileged` | `privileged` | |
| `-m` / `--memory` | `mem_limit` | |
| `--cpus` | `cpus` | |
| `-l` / `--label` | `labels` | |
| `--health-*` | `healthcheck` | `cmd` / `interval` / `timeout` / `retries` |
| `-i` / `-t` | `stdin_open` / `tty` | |
| `--rm`, `-d` / `--detach` | — | Kein Compose-Äquivalent (entfällt) |

Ein paar davon verdienen einen genaueren Blick.

### -p → ports

Jedes `-p` wird zu einem Eintrag unter `ports:`, geschrieben als **gequoteter** `"HOST:CONTAINER"`-String:

```yaml
ports:
  - "5432:5432"
```

Die Anführungszeichen sind nicht optional. Ein nacktes `5432:5432` wird von YAML-1.1-Parsern als Sexagesimalzahl (Basis 60) gelesen, was das Mapping stillschweigend korrumpiert. Das ist einer der häufigsten Fehler bei der Umwandlung von Hand – quote deine Ports also immer.

### -v / --volume und --mount → volumes

`-v` behält seine kurze Form `source:target[:ro]` wortwörtlich bei:

```yaml
volumes:
  - pgdata:/var/lib/postgresql/data
  - /data:/usr/share/nginx/html:ro
```

Eine Langform wie `--mount type=bind,source=/data,target=/app,readonly` wird auf dieselbe kurze `source:target:ro`-Form reduziert. Benannte Volumes und Bind-Mounts bleiben exakt so erhalten, wie sie geschrieben wurden – das Umwandeln erfindet keine Top-Level-`volumes:`-Deklaration, die du gar nicht angefordert hast (mehr dazu bei den Stolperfallen).

### -e / --env-file → environment / env_file

Jedes `-e KEY=value` wird zu einer `KEY=value`-Zeile unter `environment:`, und jedes `--env-file` wird auf `env_file:` abgebildet:

```yaml
environment:
  - POSTGRES_PASSWORD=secret
  - POSTGRES_DB=app
env_file:
  - .env
```

Wenn du das Environment von der Kommandozeile in Dateien verlagerst, lohnt es sich zu prüfen, ob deine `.env` und `.env.example` nicht auseinandergedriftet sind – der [Env Example Checker](/env-example-checker/) markiert Keys, die in der einen, aber nicht in der anderen Datei vorhanden sind, damit eine fehlende Variable nicht erst zur Laufzeit als Fehler auftaucht.

### --restart, --name, -w, -u

Das sind direkte Eins-zu-eins-Skalar-Mappings:

```yaml
restart: unless-stopped
container_name: db
working_dir: /work
user: 1000:1000
```

`--name` erfüllt eine Doppelfunktion: Es setzt `container_name` *und* wird zum Service-Key (`services: { db: ... }`). Gibt es kein `--name`, wird der Service unter dem Key `app` abgelegt.

### --network → networks (oder network_mode)

Ein benanntes Netzwerk wird zu einem Eintrag in der `networks:`-Liste. Aber `host` und `none` sind Sonderfälle – sie sind Netzwerk-*Modi*, keine Netzwerke, und werden daher stattdessen auf `network_mode` abgebildet:

```yaml
# docker run --network backend
networks:
  - backend

# docker run --network host
network_mode: host
```

### --cap-add, --cap-drop, --add-host

Capabilities und Host-Einträge werden jeweils zu einer Liste zusammengefasst:

```yaml
cap_add:
  - NET_ADMIN
cap_drop:
  - ALL
extra_hosts:
  - db:10.0.0.5
```

### --health-* → healthcheck

Die `--health-*`-Flags fügen sich zu einem einzigen `healthcheck:`-Block zusammen. Der Befehl wird zu einem `CMD-SHELL`-Test:

```bash
docker run --health-cmd "redis-cli ping" \
  --health-interval 10s --health-timeout 3s --health-retries 5 \
  redis:7-alpine
```

```yaml
healthcheck:
  test: "CMD-SHELL redis-cli ping"
  interval: 10s
  timeout: 3s
  retries: 5
```

### -m / --cpus → mem_limit / cpus

Ressourcen-Flags werden auf `mem_limit` und `cpus` abgebildet:

```yaml
mem_limit: 256m
cpus: "1.5"
```

Das sind die Limits im v2-Stil, die Compose direkt berücksichtigt. Wenn du diesen Container irgendwann zu Kubernetes verschiebst, werden aus diesen Zahlen Pod-Requests und -Limits – der [Kubernetes Resource Calculator](/kubernetes-resource-calculator/) macht aus einem Speicher- und CPU-Wert sichere `requests`/`limits`-Werte, sodass du bei der Umrechnung nicht raten musst.

### Die Flags ohne Compose-Äquivalent

`--rm` und `-d` / `--detach` beschreiben, wie *du* den Container aufgerufen hast, nicht, wie er konfiguriert ist – sie haben in einer Service-Definition also nichts verloren. Sie entfallen – aber du solltest wissen, warum:

- `--rm` (beim Beenden entfernen) ist irrelevant, weil Compose den Lebenszyklus verwaltet.
- `-d` / `--detach` wird dadurch ersetzt, wie du den Stack startest: `docker compose up -d`.

![Illustration: ein docker run-Befehl auf einem Retro-Terminal, dessen Flags von Bildschirm zu Bildschirm fließen, bis sie sich zu einem docker-compose.yml-Service zusammensetzen](/blog/in-content/convert-docker-run-to-compose.webp)

## Ein vollständig durchgespieltes Beispiel

Nimm diesen längeren Befehl – einen API-Service in einem benutzerdefinierten Netzwerk, mit Environment, Capabilities und einem zusätzlichen Host-Eintrag:

```bash
docker run -d --name api \
  --network backend \
  -p 3000:3000 \
  -e NODE_ENV=production \
  --cap-add NET_ADMIN \
  --cap-drop ALL \
  --add-host db:10.0.0.5 \
  myorg/api:1.4.0
```

Wendet man die Mapping-Tabelle Flag für Flag an – und lässt `-d` mit einem Hinweis weg – ergibt sich dieser Service:

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

Beachte, was übernommen wurde und was nicht. `--name api` hat sowohl den Service-Key als auch `container_name` gesetzt. Der Port ist gequotet. `-d` ist verschwunden – du startest das Ganze mit `docker compose up -d`. Alles andere ist eine direkte Übersetzung von Flag zu Key in der festen, gut lesbaren Reihenfolge, die die Compose-Konventionen erwarten.

## Stolperfallen beim Umwandeln von docker run -p -v -e in Compose

Das Mapping ist mechanisch, aber eine Handvoll Details bringen die Leute ins Stolpern.

**Benannte Volumes vs. Bind-Mounts.** Beide nutzen dieselbe `-v`-Syntax, also landen sie in derselben `volumes:`-Liste – aber sie bedeuten Unterschiedliches. `-v /data:/app` ist ein *Bind-Mount* eines Host-Pfads; `-v pgdata:/app` ist ein *benanntes Volume*, das von Docker verwaltet wird. Ein nackter relativer oder absoluter Pfad mit führendem `/` (oder `.`) ist ein Bind-Mount; ein nackter Name ist ein Volume. Beim Umwandeln bleibt der String exakt so erhalten, wie er geschrieben wurde, und es wird **kein** Top-Level-`volumes:`-Block erzeugt, den benannte Volumes technisch eigentlich brauchen. Compose legt implizit ein quasi-anonymes Volume an, aber wenn du es explizit und teilbar haben willst, füge es selbst hinzu:

```yaml
services:
  db:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

**Environment-Präzedenz.** Wenn du sowohl `environment` als auch `env_file` verwendest, gewinnen die Werte, die direkt in `environment` gesetzt sind, gegenüber demselben Key in einer Env-Datei. Und keiner von beiden überschreibt eine Variable, die bereits in der Shell gesetzt ist, wenn du `docker compose up` ausführst – es sei denn, du referenzierst sie. Halte Secrets aus `environment:` heraus (das wird committet) und in `env_file:` (gitignored) – und prüfe die Keys der Datei mit dem [Env Example Checker](/env-example-checker/), bevor du sie ausrollst.

**Die Netzwerk-Modi host und none.** Wie oben beschrieben sind `--network host` und `--network none` keine Netzwerke – sie sind Modi. `host` unter eine `networks:`-Liste zu setzen, ist ungültig; es muss `network_mode: host` heißen. So etwas übersieht man von Hand leicht, weil die Schreibweise des Flags identisch ist mit einem normalen `--network backend`.

**Ports: publish vs. expose.** `-p` *veröffentlicht* (publish) einen Port auf dem Host (`ports:`), und das ist fast immer das, was du meinst. Es gibt kein Äquivalent für ein `-p` ohne Host-Seite, das Compose' `expose:` entspräche (nur Container-zu-Container, ohne Host-Bindung) – `expose` stammt aus der `EXPOSE`-Direktive des Images oder einem expliziten `expose:`-Key, nicht aus `docker run -p`. Greif beim Umwandeln eines `-p`-Flags nicht zu `expose:`; du willst `ports:`.

## Wandle es sofort um

Die obigen Regeln sind alles, was du brauchst, um das von Hand zu erledigen. Aber genau bei der Umwandlung von Hand geht ein Flag verloren, verliert ein Port seine Anführungszeichen oder landet `--network host` im falschen Key – und du merkst es erst, wenn sich der Container anders verhält als der ursprüngliche Befehl.

Der [Docker Run to Compose converter](/docker-run-to-compose/) übernimmt die mechanische Übersetzung für dich. Er tokenisiert den Befehl so, wie es eine Shell tun würde – unter Berücksichtigung von Anführungszeichen, gebündelten Kurz-Flags wie `-it` und Backslash-Zeilenumbrüchen –, bildet jedes Flag auf den passenden Compose-Key ab und gibt deterministisches YAML aus. Flags ohne Äquivalent (`--rm`, `-d`) kommen als Warnungen zurück, statt stillschweigend zu verschwinden, sodass nichts ohne dein Wissen wegfällt. Es funktioniert auch in umgekehrter Richtung: Füge einen Compose-Service ein und erhalte eine äquivalente `docker run`-Zeile zurück.

Alles passiert in deinem Browser, sodass du Befehle einfügen kannst, die private Registries benennen oder Secret-tragende `-e`-Werte enthalten, ohne dass irgendetwas den Tab verlässt. Füge deinen Befehl ein, lies die Warnungen und committe das Ergebnis.
