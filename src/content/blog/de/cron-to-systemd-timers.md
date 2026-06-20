---
title: "Migration von cron zu systemd-Timern"
description: "Ein praktischer Leitfaden zur Umwandlung von crontab-Einträgen in systemd-.timer- und -.service-Units — OnCalendar-Syntax, Logging, randomisierte Verzögerungen, nachgeholte Läufe und die Fallstricke, die bei der Migration zubeißen."
pubDate: 2026-05-20
tags: ["systemd", "cron", "linux"]
lang: de
translationOf: "cron-to-systemd-timers"
---

![Migration von cron zu systemd-Timern: Umwandlung von crontab-Einträgen in .timer- und .service-Units](/blog/cron-to-systemd-timers-hero.svg)

Cron steuert seit vierzig Jahren die geplanten Jobs der Welt, und auf den meisten Servern funktioniert es nach wie vor gut. Doch sobald ein Job strukturiertes Logging, eine kontrollierte Umgebung, eine Reihenfolge bei Abhängigkeiten oder eine Möglichkeit braucht, nach einer ausgeschalteten Maschine etwas nachzuholen, gerät das cron-Modell ins Wanken. Genau hier kommen systemd-Timer ins Spiel — und wenn Ihre Distribution bereits systemd ausführt (Debian, Ubuntu, RHEL, Fedora, Arch und SUSE tun das alle), haben Sie einen leistungsfähigeren Scheduler ungenutzt zur Verfügung.

Dieser Beitrag zeigt Schritt für Schritt, was sich bei einer Migration tatsächlich ändert, mit echten Units, die Sie anpassen können.

## Warum überhaupt von cron wegmigrieren

Cron ist eine einzige Zeile. Diese Knappheit ist sein Reiz und zugleich seine Grenze:

- **Logging.** Die Ausgabe eines cron-Jobs landet dort, wohin Sie sie umleiten, und wenn Sie das vergessen, wird sie an ein Postfach gemailt, das niemand liest. Ein systemd-Service schreibt automatisch ins Journal — `journalctl -u myjob.service` zeigt Ihnen jeden Lauf mit Zeitstempeln und Exit-Codes.
- **Umgebung.** Cron läuft mit einem bewusst minimalen `PATH` und nahezu keiner Umgebung, was die klassische Falle „funktioniert in meiner Shell, scheitert in cron" ist. Eine Service-Unit deklariert ihre Umgebung explizit.
- **Verpasste Läufe.** Wenn der Host zur geplanten Minute im Ruhezustand oder ausgeschaltet ist, überspringt cron den Job einfach. Ein Timer mit `Persistent=true` führt ihn aus, sobald die Maschine wieder verfügbar ist.
- **Überschneidung und Ressourcen.** systemd startet keine zweite Kopie eines Jobs, solange die erste noch läuft, und Sie können `CPUQuota=`, `MemoryMax=` und weitere Ressourcen-Controls an eine Unit anhängen.

Sie müssen nicht alles migrieren. Aber bei Jobs, bei denen ein stilles Versagen Sie etwas kostet, sind Timer die zwei Dateien wert, die sie erfordern.

![Eine crontab-Zeile, abgebildet auf eine systemd-.timer-Unit mit OnCalendar und eine .service-Unit mit ExecStart](/blog/cron-to-systemd-timers-diagram.svg)

## Das Zwei-Datei-Modell

Eine cron-Zeile erledigt Planung und Ausführung an einem Ort. systemd teilt dies in einen **Service** (was ausgeführt wird) und einen **Timer** (wann er ausgeführt wird) auf. Beide teilen sich einen gemeinsamen Basisnamen.

Nehmen Sie diesen crontab-Eintrag — ein Backup-Skript jeden Tag um 02:30 ausführen:

```cron
30 2 * * * /usr/local/bin/backup.sh
```

Daraus werden zwei Units in `/etc/systemd/system/`.

Der Service, `backup.service`:

```ini
[Unit]
Description=Nightly backup
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/backup.sh
```

Der Timer, `backup.timer`:

```ini
[Unit]
Description=Run nightly backup at 02:30

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true

[Install]
WantedBy=timers.target
```

`Type=oneshot` teilt systemd mit, dass der Job erwartungsgemäß läuft, fertig wird und sich beendet — der richtige Typ für nahezu jede cron-artige Aufgabe. Der `[Install]`-Abschnitt des Timers ist das, was `systemctl enable` funktionieren lässt; ohne `WantedBy=timers.target` wird der Timer beim Booten nicht scharfgeschaltet.

Aktivieren und starten Sie ihn:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now backup.timer
```

Beachten Sie, dass Sie den **Timer** aktivieren, nicht den Service. Der Timer zieht den Service nach, wenn er auslöst.

## Den Zeitplan übersetzen: OnCalendar

Der schwierigste Teil der Migration ist das Zeitplan-Feld, denn systemd verwendet `OnCalendar=` statt der fünf cron-Felder. Das Format lautet `DOW YYYY-MM-DD HH:MM:SS`, und es ist tatsächlich lesbarer, sobald man es gelernt hat. Einige gängige Zuordnungen:

```text
# cron                        # OnCalendar
*/15 * * * *                  *-*-* *:0/15:00      (every 15 minutes)
0 * * * *                     *-*-* *:00:00        (hourly, on the hour)
30 2 * * *                    *-*-* 02:30:00       (daily at 02:30)
0 4 * * 1                     Mon *-*-* 04:00:00   (Mondays at 04:00)
0 0 1 * *                     *-*-01 00:00:00      (1st of the month)
0 9 * * 1-5                   Mon..Fri *-*-* 09:00:00  (weekdays at 09:00)
```

Es gibt auch praktische Kurzformen — `hourly`, `daily`, `weekly`, `monthly` — sodass `OnCalendar=daily` jeden Tag um Mitternacht entspricht. Der mit Abstand nützlichste Befehl während der Migration ist `systemd-analyze calendar`, der einen Ausdruck parst und Ihnen die nächsten Auslösezeitpunkte zeigt:

```bash
$ systemd-analyze calendar --iterations=3 'Mon..Fri *-*-* 09:00:00'
  Original form: Mon..Fri *-*-* 09:00:00
Normalized form: Mon..Fri *-*-* 09:00:00
    Next elapse: Mon 2026-06-08 09:00:00 UTC
       From now: 4h 12min left
       (next 3)  Tue 2026-06-09 09:00:00 UTC
                 Wed 2026-06-10 09:00:00 UTC
```

Wenn diese Ausgabe dem entspricht, was Ihre cron-Zeile gemacht hat, ist der Zeitplan korrekt. Wenn nicht, haben Sie den Fehler erwischt, bevor er ausgeliefert wurde.

## Die Fallstricke, die wirklich zubeißen

**Zeitzone.** Cron verwendet die lokale Systemzeit. systemd-Timer tun das standardmäßig ebenfalls, aber `OnCalendar` wird in der Zeitzone des Timers ausgewertet, was Sie auf Servern, die auf UTC eingestellt sind, überraschen kann. Pinnen Sie sie mit `OnCalendar=Mon *-*-* 04:00:00 America/New_York` explizit fest, falls die lokale Zeit wichtig ist, und denken Sie daran, dass Übergänge zur Sommerzeit einen Lauf überspringen oder verdoppeln können.

**Thundering Herd.** Cron löst `0 * * * *`-Jobs in Ihrer gesamten Flotte exakt um :00 aus. Fügen Sie `RandomizedDelaySec=` hinzu, um die Last zu verteilen:

```ini
[Timer]
OnCalendar=hourly
RandomizedDelaySec=300
Persistent=true
```

Das versetzt jeden Lauf um bis zu fünf Minuten — unschätzbar wertvoll, wenn hundert Hosts dieselbe API treffen.

**Umgebung und Arbeitsverzeichnis.** Die spärliche Umgebung von cron bringt Leute aus dem Konzept; ebenso die Annahme eines bestimmten Arbeitsverzeichnisses. Seien Sie im Service explizit:

```ini
[Service]
Type=oneshot
WorkingDirectory=/opt/app
Environment=PATH=/usr/local/bin:/usr/bin:/bin
EnvironmentFile=-/etc/app/env
ExecStart=/opt/app/run.sh
```

Das vorangestellte `-` bei `EnvironmentFile` bedeutet „nicht fehlschlagen, wenn die Datei fehlt" und spiegelt das nachsichtige Verhalten von cron wider.

**Benutzerspezifische Jobs.** Ein Benutzer-crontab wird auf eine User-Unit abgebildet. Legen Sie die Dateien in `~/.config/systemd/user/` ab, aktivieren Sie sie mit `systemctl --user enable --now myjob.timer` und führen Sie `loginctl enable-linger $USER` aus, damit der Timer das Abmelden überlebt.

## Die Migration verifizieren

Bestätigen Sie nach dem Aktivieren, dass der Timer scharfgeschaltet ist, und sehen Sie sich seinen Verlauf an:

```bash
systemctl list-timers --all          # see next/last run for every timer
journalctl -u backup.service --since today   # read the job's output
sudo systemctl start backup.service  # trigger a manual run to test now
```

`systemctl start backup.service` führt den Job sofort aus, unabhängig vom Zeitplan — der sauberste Weg, um zu bestätigen, dass die Service-Hälfte funktioniert, bevor Sie dem Timer vertrauen.

## Übersetzen Sie nicht jedes Feld von Hand

Der mechanische Teil — fünf cron-Felder in eine `OnCalendar`-Zeile zu verwandeln und das `.timer`/`.service`-Paar zu gerüsten — ist genau die Art von Sache, bei der man von Hand subtil danebenliegen kann, besonders bei Schrittwerten, Bereichen und Sonderfällen beim Wochentag. Unser **Cron to systemd Converter** erledigt das im Browser: Fügen Sie eine crontab-Zeile ein und erhalten Sie eine fertig bearbeitbare Timer- und Service-Unit mit dem korrekten `OnCalendar`-Ausdruck und Migrationshinweisen, ohne dass irgendetwas irgendwohin hochgeladen wird.

[Konvertieren Sie Ihre crontab in systemd-Timer →](/cron-to-systemd)
