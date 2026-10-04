---
title: "chmod-Befehl in Linux: Syntax, Beispiele und typische Fehler"
description: "Der chmod-Befehl in Linux erklärt: oktale und symbolische Modi, chmod +x, chmod -R und seine Fallen, setuid, setgid und Sticky-Bit, umask und wie du Permission denied behebst."
pubDate: 2026-10-03
tags: ["linux", "security", "devops"]
lang: de
translationOf: "chmod-command-linux"
relatedTool:
  name: "chmod Calculator"
  href: "/chmod-calculator"
---

![Ein Raster aus drei mal drei Bits für Lesen, Schreiben und Ausführen für Besitzer, Gruppe und andere](/blog/chmod-command-linux-hero.svg)
<!-- keywords: chmod command | chmod +x, chmod recursive, chmod -R, chmod command in linux, linux chmod | source: ahrefs free (2026-10-04) -->

Ein Deploy-Skript bricht mit `Permission denied` ab. Ein frisch geklontes Repository will `./build.sh` nicht ausführen. SSH lehnt einen Schlüssel ab, weil seine „permissions are too open“ sind. Ein Webserver liefert 403 für Dateien, die eindeutig auf der Platte liegen. Jeder dieser Fälle endet beim selben Befehl, und meistens ist die Lösung eine Zeile. Das Problem: Die falsche Zeile, mit `-R` ausgeführt, kann mehr Schaden anrichten als der ursprüngliche Fehler.

Dieser Artikel zeigt, wie `chmod` seine Argumente liest, die zwei Schreibweisen für einen Modus, die Fallen beim rekursiven Ändern, die drei Spezialbits und eine Checkliste für den Moment, in dem ein Berechtigungsfehler auftaucht.

## Die Syntax

```bash
chmod [optionen] MODUS DATEI...
chmod [optionen] --reference=REFERENZDATEI DATEI...
```

`MODUS` ist entweder eine Zahl (`755`) oder ein symbolischer Ausdruck (`u+x`). Jede angegebene Datei bekommt die Änderung. Die Optionen, die du tatsächlich brauchst, sind überschaubar:

- `-R`, `--recursive`: auf ein Verzeichnis und alles darunter anwenden.
- `-v`, `--verbose`: für jede verarbeitete Datei eine Zeile ausgeben.
- `-c`, `--changes`: nur dann eine Zeile ausgeben, wenn sich ein Modus wirklich geändert hat. Praktisch in Skripten, weil die Ausgabe ein Diff ist.
- `--reference=DATEI`: den Modus von einer anderen Datei übernehmen, statt ihn einzutippen.

Nur der Besitzer der Datei (oder root) darf ihren Modus ändern. Mitglied der Gruppe zu sein, selbst mit Schreibrecht, reicht nicht.

## Einen Modus lesen

`ls -l` gibt am Anfang jeder Zeile zehn Zeichen aus:

```text
-rwxr-x---  1 deploy  web  4120 Oct  3 09:12 build.sh
```

Das erste Zeichen ist der Typ (`-` Datei, `d` Verzeichnis, `l` Symlink). Die nächsten neun sind drei Dreiergruppen: **Besitzer** (`u`), **Gruppe** (`g`) und **andere** (`o`). Innerhalb jeder Gruppe stehen die Stellen immer für Lesen, Schreiben und Ausführen, in dieser Reihenfolge, mit `-` für ein gelöschtes Bit. `rwxr-x---` heißt also: Der Besitzer darf alles, Mitglieder von `web` dürfen das Skript lesen und ausführen, und sonst niemand darf es anfassen.

Bei einem Verzeichnis bedeuten dieselben Buchstaben etwas leicht anderes. `r` erlaubt, die Namen darin aufzulisten, `w` erlaubt, Einträge anzulegen, umzubenennen und zu löschen, und `x` erlaubt, das Verzeichnis zu *betreten* und alles darin über seinen Namen zu erreichen. Ein Verzeichnis mit `r`, aber ohne `x` ist eine Liste von Namen, die du nicht öffnen kannst.

## Oktaler Modus: drei Ziffern, eine pro Klasse

Jedes Recht hat einen Wert: Lesen 4, Schreiben 2, Ausführen 1. Addiert pro Klasse ergibt das eine Ziffer für den Besitzer, eine für die Gruppe und eine für andere:

| Ziffer | Bits | Bedeutung |
|---|---|---|
| 7 | `rwx` | lesen, schreiben, ausführen |
| 6 | `rw-` | lesen, schreiben |
| 5 | `r-x` | lesen, ausführen |
| 4 | `r--` | nur lesen |
| 0 | `---` | nichts |

Daraus entstehen die Modi, die dir immer wieder begegnen:

- [`755`](/de/chmod-calculator/755/) (`rwxr-xr-x`): Skripte, Binärdateien und die meisten Verzeichnisse. Der Besitzer schreibt, alle anderen lesen und führen aus.
- [`644`](/chmod-calculator/644/) (`rw-r--r--`): normale Dateien wie Konfigurationen und HTML. Für alle lesbar, nur für den Besitzer schreibbar.
- [`600`](/de/chmod-calculator/600/) (`rw-------`): Geheimnisse. Private SSH-Schlüssel, `.env`-Dateien, Kubeconfigs.
- [`700`](/de/chmod-calculator/700/) (`rwx------`): private Verzeichnisse, klassisch `~/.ssh`.
- [`775`](/chmod-calculator/775/) (`rwxrwxr-x`): ein Verzeichnis, in das ein ganzes Team schreibt, meist zusammen mit einer gemeinsamen Gruppe.

Der oktale Modus **ersetzt** alle Rechte auf einmal. `chmod 644 datei` fügt anderen kein Leserecht hinzu, sondern setzt den Modus auf genau `rw-r--r--`, egal was vorher galt. Das ist seine Stärke, wenn du einen bekannten Zustand willst, und seine Gefahr, wenn du nur ein Bit umschalten wolltest.

## Symbolischer Modus: eine Sache ändern, den Rest lassen

Der symbolische Modus besteht aus *wer*, *Operator* und *was*:

- wer: `u` (Besitzer), `g` (Gruppe), `o` (andere), `a` (alle drei)
- Operator: `+` (hinzufügen), `-` (entfernen), `=` (genau setzen)
- was: `r`, `w`, `x`, dazu `X`, `s` und `t`, die weiter unten erklärt werden

Einige Beispiele, die du auswendig kennen solltest:

```bash
chmod u+x deploy.sh        # der Besitzer darf es jetzt ausführen; sonst ändert sich nichts
chmod a-w release.tar.gz   # niemand darf schreiben, auch der Besitzer nicht
chmod go-rwx id_ed25519    # Gruppe und andere komplett entfernen
chmod g=rx,o= app/         # Gruppe bekommt genau r-x, andere nichts
chmod u+x,g+x tools/*.sh   # mehrere Klauseln, durch Komma getrennt, ohne Leerzeichen
```

### Was chmod +x wirklich macht

`chmod +x datei` hat kein *wer*, und das hat eine genaue Bedeutung. GNU chmod behandelt ein fehlendes *wer* wie `a`, **lässt aber die Bits unangetastet, die in deiner umask gesetzt sind**. Mit der üblichen umask `022` fügt `chmod +x` Ausführen für Besitzer, Gruppe und andere hinzu, aus `644` wird `755`. Mit einer strengen umask `077` fügt derselbe Befehl nur `u+x` hinzu, und aus `644` wird `744`. Wenn das Ergebnis nicht davon abhängen soll, wer das Skript ausführt, schreib die Klasse aus: `chmod a+x` oder `chmod u+x`.

## chmod -R und die zwei klassischen Fehler

Der rekursive Modus wendet einen Modus auf Dateien und Verzeichnisse gleichermaßen an, und die wollen unterschiedliche Bits. Aus diesem Widerspruch entstehen zwei Fehler, die in fast jedem Team auftauchen.

**Fehler eins: `chmod -R 755 projekt/`.** Jedes Verzeichnis ist in Ordnung, aber jede Datei ist jetzt ausführbar, inklusive `README.md`, jeder `.env` und jeder Konfiguration. Nichts geht sofort kaputt, deshalb bleibt es liegen, und ein späteres `git status` zeigt den ganzen Baum als geändert, wenn `core.fileMode` aktiv ist.

**Fehler zwei: `chmod -R 644 projekt/`.** Jede Datei ist in Ordnung, aber jedes Verzeichnis hat `x` verloren. Du kannst nicht mehr mit `cd` hinein, und nichts darin lässt sich öffnen, obwohl jede Datei `644` hat. Der Webserver antwortet mit 403, und die Ursache liegt nicht dort, wo du zuerst suchst.

Die Lösung ist, beide Typen getrennt mit `find` zu behandeln:

```bash
find projekt/ -type d -exec chmod 755 {} +
find projekt/ -type f -exec chmod 644 {} +
```

Oder du nimmst das große `X`, das Ausführen nur bei Verzeichnissen und bei Dateien setzt, die bereits für irgendwen ausführbar sind:

```bash
chmod -R u=rwX,go=rX projekt/
```

Diese eine Zeile gibt Verzeichnissen `755`, bestehenden Skripten `755` und normalen Dateien `644`. Näher kommst du an ein sicheres rekursives chmod nicht heran.

Zwei weitere Warnungen. GNU chmod ändert standardmäßig nicht den Modus eines Symlinks selbst (Linux ignoriert Symlink-Rechte ohnehin): Bei einem Symlink auf der Kommandozeile wird das *Ziel* geändert, und mit `-R` werden Links, die beim Durchlaufen gefunden werden, übersprungen. Und `-R` auf dem falschen Pfad lässt sich ohne Backup nicht rückgängig machen. `--preserve-root` verweigert nur einen rekursiven Lauf auf `/` selbst, also lass dir den Pfad ausgeben, bevor der Befehl läuft.

## Die Spezialbits: setuid, setgid und Sticky

Eine vierte, vorangestellte Oktalziffer enthält drei weitere Bits. In `ls -l` ersetzen sie das `x` in einer der drei Gruppen:

| Bit | Wert | Anzeige | Bei einer Datei | Bei einem Verzeichnis |
|---|---|---|---|---|
| setuid | 4 | `s` im `x` des Besitzers | läuft als Besitzer der Datei | unter Linux ignoriert |
| setgid | 2 | `s` im `x` der Gruppe | läuft als Gruppe der Datei | neue Dateien erben die Gruppe des Verzeichnisses |
| Sticky | 1 | `t` im `x` der anderen | unter Linux ignoriert | nur der Besitzer eines Eintrags (oder der Besitzer des Verzeichnisses) darf ihn löschen oder umbenennen |

Die zwei, die dir in der Praxis begegnen:

- [`4755`](/chmod-calculator/4755/) (`rwsr-xr-x`): setuid. `/usr/bin/passwd` ist typischerweise so installiert, damit ein normaler Benutzer eine Datei von root aktualisieren kann. Ein setuid-Binary ist eine Rechtegrenze; setz es nie auf ein Skript oder auf etwas, das du nicht selbst geschrieben hast.
- [`1777`](/chmod-calculator/1777/) (`rwxrwxrwt`): das Sticky-Bit auf einem für alle schreibbaren Verzeichnis. Das ist `/tmp`: Jeder darf Dateien anlegen, aber niemand darf die eines anderen löschen.

Setgid auf einem gemeinsamen Verzeichnis (`chmod 2775 shared/` oder `chmod g+s shared/`) ist der saubere Weg, damit jede neue Datei der Gruppe des Teams gehört. Ein großes `S` oder `T` in `ls -l` bedeutet, dass das Spezialbit gesetzt ist, das Ausführbit darunter aber nicht, und das ist fast immer ein Versehen.

Ein GNU-Detail überrascht viele: `chmod 755 verzeichnis` *behält* ein vorhandenes setuid- oder setgid-Bit auf einem Verzeichnis. Um es zu entfernen, musst du es ausdrücklich sagen, mit `chmod g-s verzeichnis` oder einem fünfstelligen Modus wie `chmod 00755 verzeichnis`.

## umask: woher der Startmodus kommt

Neue Dateien entstehen nicht mit `777` und werden später gestutzt. Programme verlangen `666` für Dateien und `777` für Verzeichnisse, und der Kernel entfernt die Bits, die in der **umask** des Prozesses gesetzt sind. Mit `umask 022` starten Dateien bei `644` und Verzeichnisse bei `755`. Mit `umask 077` starten sie bei `600` und `700`.

Wenn also jede Datei, die ein Dienst schreibt, für den Rest des Teams unlesbar ist, liegt die Lösung oft in der umask des Dienstes (`UMask=` in einer systemd-Unit oder `umask 002` im Startskript), nicht in einem nachträglichen `chmod`.

## Ein Hinweis zu ACLs

Wenn `ls -l` nach dem Modus ein `+` ausgibt (`-rw-rw-r--+`), hat die Datei eine Access Control List, und die neun Bits erzählen nicht die ganze Geschichte. `getfacl datei` zeigt die zusätzlichen Einträge. Bei so einer Datei ändert `chmod` an den Gruppenbits die *Maske* der ACL, die jeden benannten Benutzer- und Gruppeneintrag begrenzt. `chmod g-w` kann also stillschweigend Leuten das Schreibrecht nehmen, die gar nicht in der Gruppe der Datei sind.

## „Permission denied“ beheben

Wenn ein Befehl scheitert, prüf den ganzen Pfad, nicht nur die Datei:

1. **Jedes Verzeichnis auf dem Weg prüfen.** Du brauchst `x` auf jedem übergeordneten Verzeichnis, um eine Datei zu erreichen. `namei -l /srv/app/config/app.yml` zeigt Modus und Besitzer jedes Pfadteils und findet das fehlende Bit in Sekunden.
2. **Prüfen, wer du bist.** `id` zeigt deinen Benutzer und deine Gruppen. Gruppenänderungen gelten erst in neuen Login-Sitzungen, ein Benutzer, der vor fünf Minuten zu `docker` hinzugefügt wurde, hat sie in der alten Shell noch nicht.
3. **Den Besitzer prüfen, nicht nur den Modus.** `rw-------` ist für einen Schlüssel richtig und nutzlos, wenn der Schlüssel root gehört und der Prozess als `deploy` läuft. Das ist ein Fall für [chown](/de/blog/chown-command-linux/), nicht für chmod.
4. **Das Mount prüfen.** Eine Datei kann `755` haben und auf einem mit `noexec` gemounteten Dateisystem trotzdem nicht laufen. `findmnt -T pfad` zeigt die Mount-Optionen.
5. **Die Sicherheitsschicht prüfen.** Auf SELinux-Systemen scheitert ein korrekter Modus mit dem falschen Kontext trotzdem; `ls -Z` und das Audit-Log zeigen es.
6. **Beachten, was strenge Programme erwarten.** OpenSSH lehnt einen privaten Schlüssel ab, auf den Gruppe oder andere zugreifen können, und seine `StrictModes`-Prüfung verwirft ein Home-Verzeichnis oder `~/.ssh`, das für Gruppe oder alle schreibbar ist. Setz `~/.ssh` auf `700` und Schlüssel auf `600`.

## Einen Modus ohne Rechnen ermitteln

Der [chmod Calculator](/de/chmod-calculator/) rechnet zwischen oktal, symbolisch und der `ls -l`-Darstellung in beide Richtungen um, inklusive der Spezialbits, und zeigt den genauen Befehl. Er läuft in deinem Browser. Für das größere Bild aus Benutzern, Gruppen und Besitz ordnet der [Berechtigungsabschnitt von Linux for DevOps](/learn/guides/linux-for-devops/#file-permissions-ownership) chmod ein.

## chmod-Kurzreferenz

- [ ] Oktal ersetzt jedes Bit; symbolisch ändert nur, was du nennst.
- [ ] `r` = 4, `w` = 2, `x` = 1, eine Ziffer je Besitzer, Gruppe, andere.
- [ ] `755` Skripte und Verzeichnisse, `644` Dateien, `600` Geheimnisse, `700` private Verzeichnisse.
- [ ] `chmod +x` beachtet die umask; `chmod a+x` und `chmod u+x` hängen nicht von ihr ab.
- [ ] Nie `chmod -R 755` oder `chmod -R 644` auf einen gemischten Baum; nimm `find -type d` / `-type f` oder `chmod -R u=rwX,go=rX`.
- [ ] Ein Verzeichnis braucht `x`, um betreten zu werden, auf jeder Ebene des Pfads.
- [ ] `4755` setuid, `2775` setgid für gemeinsame Gruppenverzeichnisse, `1777` Sticky für Verzeichnisse wie `/tmp`.
- [ ] Ein `+` nach dem Modus bedeutet eine ACL; prüf `getfacl`, bevor du den neun Bits traust.
- [ ] Falscher Besitzer ist ein chown-Problem; den Modus zu ändern behebt es nicht.
