---
title: "chown-Befehl in Linux: Besitzer und Gruppe von Dateien ändern"
description: "Der chown-Befehl in Linux erklärt: user:group-Syntax, chown -R und Symlinks, --reference, chgrp, chmod vs chown und Berechtigungsfehler bei Docker-Volumes mit numerischen IDs beheben."
pubDate: 2026-10-04
tags: ["linux", "security", "devops"]
lang: de
translationOf: "chown-command-linux"
relatedTool:
  name: "chmod Calculator"
  href: "/chmod-calculator"
---

![Ein Schlüssel, der einen Ordner von einem Benutzer an einen anderen übergibt](/blog/chown-command-linux-hero.svg)
<!-- keywords: chown command | chown recursive, chown -R, chown linux, chmod vs chown | source: ahrefs free (2026-10-04) -->

Berechtigungen sagen, *was* Besitzer, Gruppe und alle anderen tun dürfen. Besitz sagt, *wer* Besitzer und Gruppe sind. Wenn eine Datei einen vernünftigen Modus wie `600` hat und ein Dienst sie trotzdem nicht lesen kann, liegt es selten am Modus: Die Datei gehört dem falschen Benutzer. Genau das behebt `chown`.

Dieser Artikel behandelt die Syntax für Besitzer und Gruppe, rekursive Änderungen samt den Symlink-Regeln, die dazugehören, das Übernehmen des Besitzes von einer anderen Datei, `chgrp`, die Arbeitsteilung zwischen chown und chmod und den häufigsten Praxisfall: einen Container, der nicht in sein eigenes Volume schreiben kann.

## Die Syntax

```bash
chown [optionen] BESITZER[:GRUPPE] DATEI...
chown [optionen] --reference=REFERENZDATEI DATEI...
```

Besitzer und Gruppe werden ohne Leerzeichen zusammengeschrieben, und beide können ein Name oder eine numerische ID sein. Die Formen unterscheiden sich in kleinen, aber wichtigen Punkten:

| Du schreibst | Besitzer wird | Gruppe wird |
|---|---|---|
| `chown deploy datei` | `deploy` | unverändert |
| `chown deploy:web datei` | `deploy` | `web` |
| `chown deploy: datei` | `deploy` | Login-Gruppe von `deploy` |
| `chown :web datei` | unverändert | `web` (wie `chgrp web datei`) |
| `chown 1000:1000 datei` | UID 1000 | GID 1000 |

Der Doppelpunkt am Ende von `deploy:` wird leicht übersehen und ist nützlich: Er setzt die Gruppe auf die primäre Gruppe des Benutzers, ohne dass du sie nachschlagen musst. Ältere Skripte nutzen manchmal einen Punkt (`deploy.web`). GNU chown akzeptiert das noch mit einer Warnung, aber es ist mehrdeutig bei Benutzernamen mit Punkt, also nimm den Doppelpunkt.

## Wer den Befehl ausführen darf

Den **Besitzer** einer Datei zu ändern erfordert root (genauer: die Capability `CAP_CHOWN`). Ein normaler Benutzer kann keine Datei verschenken, nicht einmal eine eigene; sonst könnte jeder Disk-Quotas umgehen oder Dateien im Namen anderer ablegen. Deshalb beginnen die meisten `chown`-Befehle in Dokumentationen mit `sudo`.

Nur die **Gruppe** zu ändern ist dem Besitzer der Datei erlaubt, sofern er Mitglied der Zielgruppe ist. root darf jede Gruppe setzen.

## Nützliche Optionen

- `-R`, `--recursive`: ein Verzeichnis und alles darin ändern.
- `-v`, `--verbose`: jede verarbeitete Datei melden; `-c`, `--changes` meldet nur Dateien, deren Besitz sich wirklich geändert hat.
- `-h`, `--no-dereference`: den Symlink selbst ändern statt der Datei, auf die er zeigt.
- `--reference=DATEI`: Besitzer und Gruppe von einer anderen Datei übernehmen.
- `--from=BESITZER[:GRUPPE]`: nur Dateien ändern, die aktuell diesen Besitzer und diese Gruppe haben.
- `--preserve-root`: die rekursive Ausführung auf `/` verweigern. Lohnt sich in jedem Skript, das seinen Pfad aus einer Variablen baut.

## chown -R: Besitz rekursiv ändern

Der alltägliche rekursive Fall ist, ein Anwendungsverzeichnis dem Benutzer zu übergeben, der die Anwendung ausführt:

```bash
sudo chown -R www-data:www-data /var/www/site
```

Anders als `chmod -R` hat rekursives `chown` keine Datei-gegen-Verzeichnis-Falle, weil Dateien und Verzeichnisse denselben Besitzer wollen. Die Gefahr ist der Pfad. `sudo chown -R deploy: /` mit einem verirrten Leerzeichen oder ein `$APP_DIR`, das leer expandiert, schreibt den Besitz des ganzen Systems um und lässt sich kaum rückgängig machen. Setz Variablen in Anführungszeichen, prüf sie und nutze `--preserve-root`.

`--from` macht rekursive Änderungen sicherer, wenn du nur einen Teil der Dateien meinst. Nachdem sich etwa die UID eines Benutzers geändert hat, weist dieser Befehl nur die Dateien neu zu, die noch die alte tragen:

```bash
sudo chown -R --from=1001 1005 /srv/data
```

## Symlinks: was chown ändert

Ein symbolischer Link hat einen eigenen Besitzer, getrennt von seinem Ziel, und das Standardverhalten von chown hängt davon ab, ob es rekursiv arbeitet:

- **Nicht rekursiv:** `chown deploy link` ändert das *Ziel*, nicht den Link. Mit `-h` änderst du den Link selbst.
- **Rekursiv:** `-R` folgt Symlinks innerhalb des Baums nicht (`-P` ist der Standard). Mit `-H` folgst du Symlinks, die auf der Kommandozeile stehen, mit `-L` jedem Symlink auf ein Verzeichnis.

Sei vorsichtig mit `-L` und mit `--dereference` zusammen mit `-R`. Wenn jemand, der im Baum schreiben darf, einen Symlink auf `/etc` platziert, während ein von root gestartetes `chown -R -L` ihn durchläuft, landet die Besitzänderung auf `/etc`. Bei Bäumen, in die andere schreiben können, bleib beim Standard.

## --reference: Besitz von einer anderen Datei übernehmen

Wenn eine Datei zu ihren Nachbarn passen soll, übernimm den Besitz, statt ihn einzutippen:

```bash
sudo chown --reference=/etc/nginx/nginx.conf /etc/nginx/conf.d/api.conf
```

Ist die Referenzdatei ein Symlink, nimmt chown Besitzer und Gruppe der Datei, auf die er zeigt. `chmod --reference` macht dasselbe für den Modus, gemeinsam lassen die beiden eine neue Datei genau wie eine bestehende aussehen.

## chgrp

`chgrp web report.csv` ändert nur die Gruppe. Es entspricht genau `chown :web report.csv`, kennt dieselben Optionen `-R`, `-h` und `--reference` und ist in Skripten praktisch, weil es die Absicht klar ausdrückt. Zusammen mit dem setgid-Bit auf einem Verzeichnis (`chmod g+s shared/`) ergibt sich ein Teamordner, in dem jede neue Datei in der Gruppe des Teams landet.

## chown löscht setuid und setgid

Unter Linux löscht das Ändern von Besitzer oder Gruppe einer ausführbaren Datei ihre setuid- und setgid-Bits, und seit Kernel 2.2.13 gilt das auch, wenn root es tut. Das ist eine Sicherheitsregel: Ein setuid-Binary soll nicht unbemerkt als anderer Benutzer laufen. Wenn du eine Datei mit chown änderst, die diese Bits wirklich braucht, setz sie danach neu und prüf mit `ls -l`:

```bash
sudo chown root:root /usr/local/bin/helper
sudo chmod 4755 /usr/local/bin/helper
```

Die GNU-coreutils-Dokumentation weist darauf hin, dass das genaue Verhalten vom Systemaufruf abhängt; auf anderen Systemen solltest du es prüfen, bevor du dich darauf verlässt.

## chmod vs chown

Die beiden Befehle werden oft verwechselt, weil sie dasselbe Symptom, `Permission denied`, von verschiedenen Seiten beheben:

| | chmod | chown |
|---|---|---|
| Ändert | die Modusbits (`rwx` für Besitzer, Gruppe, andere) | Besitzer und Gruppe |
| Beantwortet | was darf jede Klasse? | wer gehört zu welcher Klasse? |
| Wer darf es | der Besitzer der Datei oder root | root für den Besitzer; der Besitzer für Gruppen, in denen er Mitglied ist |
| Typischer Fall | ein Skript ist nicht ausführbar | ein Dienstbenutzer kann seine eigenen Dateien nicht lesen |

Eine nützliche Regel: Wenn der Modus für die Aufgabe richtig aussieht (`600` für einen Schlüssel, `644` für eine Konfiguration), der Prozess aber trotzdem scheitert, schau auf den Besitzer. Den Modus stattdessen auf `777` zu lockern „behebt“ den Fehler, indem es alle hereinlässt, und das ist ein Sicherheitsproblem, keine Lösung. Der [Artikel zum chmod-Befehl](/de/blog/chmod-command-linux/) behandelt die andere Seite, und Modi wie [`600`](/de/chmod-calculator/600/), [`644`](/chmod-calculator/644/) und [`755`](/de/chmod-calculator/755/) haben jeweils eine Seite, die erklärt, wer was darf.

## Berechtigungsfehler bei Docker-Volumes beheben

Das häufigste chown-Problem im DevOps-Alltag ist ein Container, der nicht in einen Bind-Mount schreiben kann:

```text
mkdir: cannot create directory '/app/data/cache': Permission denied
```

Die Ursache: Der Kernel speichert Besitz als Zahlen, nicht als Namen. Ein Image, das als unprivilegierter Benutzer läuft (die offiziellen Node-Images bringen einen Benutzer `node` mit UID 1000 mit; das Debian-basierte Postgres-Image läuft als UID 999), schreibt als diese UID, während das gemountete Host-Verzeichnis wahrscheinlich deinem Benutzer oder root gehört. Die Namen innerhalb und außerhalb des Containers bedeuten einander nichts; nur die Zahlen müssen passen.

Finde die UID, mit der der Container läuft, und übergib das Host-Verzeichnis an diese UID:

```bash
docker run --rm my-image id          # uid=1000(node) gid=1000(node)
sudo chown -R 1000:1000 ./data
```

Nimm hier die numerische Form. `chown -R node:node ./data` auf dem Host scheitert entweder oder trifft den Benutzer, der auf dieser Maschine zufällig `node` heißt. Die Alternative ist, die Dateien in Ruhe zu lassen und den Container als dich selbst laufen zu lassen: `docker run --user "$(id -u):$(id -g)" …` oder `user: "1000:1000"` in Compose. Bei benannten Volumes setzt das Image den Besitz meist schon beim ersten Anlegen, das Problem betrifft also vor allem Bind-Mounts.

## Wie es weitergeht

Der [Berechtigungsabschnitt von Linux for DevOps](/learn/guides/linux-for-devops/#file-permissions-ownership) behandelt Benutzer, Gruppen und Besitz im Zusammenhang. Um zu entscheiden, welchen Modus eine Datei haben soll, sobald ihr Besitzer stimmt, rechnet der [chmod Calculator](/de/chmod-calculator/) in deinem Browser zwischen oktaler, symbolischer und `ls -l`-Form um.

## chown-Kurzreferenz

- [ ] `user:group` setzt beides, `user:` nimmt die Login-Gruppe des Benutzers, `:group` ändert nur die Gruppe.
- [ ] Den Besitzer zu ändern braucht root; die Gruppe zu ändern braucht Besitz plus Mitgliedschaft in dieser Gruppe.
- [ ] Für Container numerische IDs nehmen: Besitz wird als UID und GID gespeichert, nie als Name.
- [ ] `-h` ändert den Symlink selbst; ohne `-R` folgt chown dem Link standardmäßig.
- [ ] `-R` folgt keinen Symlinks im Baum; `-L` nicht auf Bäumen einsetzen, in die andere schreiben können.
- [ ] `--reference=DATEI` übernimmt den Besitz; `--from=` begrenzt eine Änderung auf den aktuellen Besitzer.
- [ ] chown löscht setuid und setgid bei ausführbaren Dateien; setz sie danach neu.
- [ ] Richtiger Modus, trotzdem verweigert: erst den Besitzer prüfen, bevor du zu `chmod 777` greifst.
