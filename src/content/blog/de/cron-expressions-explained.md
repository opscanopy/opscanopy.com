---
title: "Cron-Ausdrücke lesen: eine Feld-für-Feld-Anleitung"
description: "Eine praktische Feld-für-Feld-Anleitung zum Lesen von Cron-Ausdrücken — die fünf Zeitfelder, Bereiche, Schritte, Listen und @macros — plus die Tücken, die Zeitpläne genau dann auslösen lassen, wenn Sie am wenigsten damit rechnen."
pubDate: 2026-05-13
tags: ["cron", "scheduling", "devops"]
lang: de
translationOf: "cron-expressions-explained"
---

![Cron-Ausdrücke Feld für Feld lesen: eine Anleitung zur Zeitplanung mit den fünf Cron-Zeitfeldern, Bereichen und Schritten](/blog/cron-expressions-explained-hero.svg)

Fast jeder, der ein Backend betreibt, hat schon einmal auf eine Zeile wie `*/15 9-17 * * 1-5` gestarrt und sich nur halb daran erinnert, was sie tut. Die Syntax von cron ist kompakt, und das ist zugleich ihre große Stärke und ihre große Falle: Fünf winzige Felder kodieren einen wiederkehrenden Zeitplan, und ein einziges falsch platziertes Zeichen kann aus „jeden Werktag-Nachmittag“ ein „jede Minute, für immer“ machen. Diese Anleitung liest einen Cron-Ausdruck so, wie es der Daemon tut — Feld für Feld —, damit Sie ihn beim nächsten Mal auf den ersten Blick entschlüsseln können.

## Die fünf Felder

Ein standardmäßiger Cron-Ausdruck besteht aus fünf durch Leerzeichen getrennten Feldern, immer in dieser Reihenfolge:

```text
┌───────────── minute        (0–59)
│ ┌─────────── hour          (0–23)
│ │ ┌───────── day of month  (1–31)
│ │ │ ┌─────── month         (1–12 or JAN–DEC)
│ │ │ │ ┌───── day of week   (0–6, Sun=0; 7 also = Sun)
│ │ │ │ │
* * * * *
```

Der Job läuft in jeder Minute, in der **alle** Zeitfelder mit dem aktuellen Zeitpunkt übereinstimmen. Ein Feld mit `*` bedeutet „jeder Wert“, sodass das kanonische `* * * * *` einmal pro Minute auslöst. Lesen Sie von links nach rechts, und die gängigsten Zeitpläne ergeben sich schnell:

```text
0 * * * *      at minute 0 of every hour          → hourly, on the hour
30 2 * * *      at 02:30 every day                 → a nightly batch job
0 0 1 * *      at 00:00 on day 1 of every month    → monthly rollover
0 9 * * 1      at 09:00 every Monday               → start-of-week report
```

Beachten Sie, dass Sekunden **kein** Bestandteil von Standard-Unix-cron sind. Manche Implementierungen (Quartz, viele Go- und Node-Bibliotheken, wobei Kubernetes die bemerkenswerte Ausnahme ist, die bei fünf bleibt) stellen ein sechstes Sekundenfeld voran. Wenn sich ein Ausdruck mit sechs Feldern in einfachem `crontab` merkwürdig verhält, ist meist dieses zusätzliche Feld der Grund.

![Die fünf Felder eines Cron-Ausdrucks, beschriftet mit Minute, Stunde, Tag des Monats, Monat und Tag der Woche, mit Anmerkungen zu Schritten und Bereichen](/blog/cron-expressions-explained-diagram.svg)

## Bereiche, Schritte und Listen

Drei Operatoren leisten den Großteil der Arbeit, und sie lassen sich innerhalb eines einzigen Feldes kombinieren:

- **Bereich** `a-b` — eine inklusive Spanne. `9-17` im Stundenfeld bedeutet die Stunden 9 bis 17.
- **Schritt** `*/n` oder `a-b/n` — jeder n-te Wert. `*/15` im Minutenfeld bedeutet 0, 15, 30, 45. `9-17/2` bedeutet 9, 11, 13, 15, 17.
- **Liste** `a,b,c` — eine explizite Menge. `1,15` im Tag-des-Monats-Feld bedeutet den 1. und den 15.

Zusammengesetzt lässt sich der Ausdruck aus dem einleitenden Absatz sauber entschlüsseln:

```text
*/15 9-17 * * 1-5
 │    │   │ │  └── Monday through Friday
 │    │   │ └───── every month
 │    │   └─────── every day of the month
 │    └─────────── hours 9 through 17 (9 AM–5 PM)
 └──────────────── every 15th minute (0, 15, 30, 45)
```

Also: **alle 15 Minuten, zwischen 9 und 17 Uhr, von Montag bis Freitag.** Eine vernünftige Taktung für einen Synchronisationsjob, der über Nacht und am Wochenende ruhen soll. Die Gefahr liegt darin, wie wenig sich dies von `* 9-17 * * 1-5` unterscheidet, das den Schritt weglässt und *jede Minute* in diesem Fenster auslöst — die 60-fache Last. Das Zeichen, das einen sauberen Zeitplan von einem versehentlichen Denial-of-Service trennt, ist zwei Zeichen breit.

## Die Tag-des-Monats-/Tag-der-Woche-Falle

Die mit Abstand überraschendste Regel in cron ist, wie sich die beiden „Tag“-Felder kombinieren. Die Intuition sagt, sie würden wie jedes andere Feldpaar mit UND verknüpft. Das stimmt nicht. Wenn **beide** Felder — Tag des Monats und Tag der Woche — eingeschränkt sind (keines ist `*`), behandelt cron sie als **ODER**: Der Job läuft, wenn *eines von beiden* passt.

```text
0 0 1,15 * 5    midnight on the 1st, on the 15th, OR on any Friday
```

Dieser Ausdruck bedeutet nicht „der 1. oder 15., aber nur, wenn es ein Freitag ist“. Er bedeutet drei separate Auslöser. Wenn Sie tatsächlich ein UND benötigen — etwa „der erste Montag des Monats“ —, kann vanilla cron das nicht direkt ausdrücken; Sie sichern es im Job selbst ab (`[ "$(date +\%d)" -le 07 ] || exit 0`) oder greifen zu einer Erweiterung wie dem `#`-Operator von Quartz (`MON#1`). Diese ODER-Regel ist für einen großen Teil der „Warum hat das zweimal ausgelöst?“-Vorfälle verantwortlich.

## Die @macros

Die meisten crons akzeptieren eine Handvoll benannter Kurzformen, die für einen kompletten Ausdruck aus fünf Feldern stehen. Sie lesen sich besser und beseitigen eine ganze Klasse von Tippfehlern:

```text
@hourly    →  0 * * * *
@daily     →  0 0 * * *   (alias: @midnight)
@weekly    →  0 0 * * 0
@monthly   →  0 0 1 * *
@yearly    →  0 0 1 1 *   (alias: @annually)
```

Es gibt außerdem `@reboot`, das eine Besonderheit darstellt: Es läuft einmal, wenn cron startet, und nicht nach irgendeinem Uhrzeitplan. Nützlich, um nach einem Neustart einen Cache aufzuwärmen, nutzlos für alles, was mit der Tageszeit zu tun hat — und eine häufige Quelle von „Mein täglicher Job ist nie gelaufen“-Meldungen, wenn jemand versehentlich danach greift.

## Die Tücken lesen

Ein paar weitere Regeln trennen die Leute, die *glauben*, cron zu lesen, von denen, die es wirklich tun:

- **Zeitzonen.** Klassisches cron läuft in der lokalen Systemzeitzone, sodass Sommerzeitumstellungen einen Job überspringen oder wiederholen können. Ein Job um 02:30 läuft in der Nacht der Vorstellung der Uhr null Mal und in der Nacht der Zurückstellung zweimal. Systeme, auf die es ankommt, fixieren Zeitpläne zunehmend auf UTC — genau aus diesem Grund.
- **Nummerierung des Tags der Woche.** Sonntag ist `0`, und `7` wird auf den meisten Implementierungen ebenfalls als Sonntag akzeptiert — aber nicht auf allen. Bevorzugen Sie nach Möglichkeit die dreibuchstabigen Namen (`SUN`, `MON`, …); sie sind eindeutig.
- **`*/n` wickelt sich nicht herum.** `*/40` im Minutenfeld löst in Minute 0 und 40 aus und springt dann zu Minute 0 der nächsten Stunde. Es bedeutet **nicht** „alle 40 Minuten“ — die Zählung beginnt in jeder Stunde von vorn, sodass der tatsächliche Abstand zwischen der :40 und der nächsten :00 nur 20 Minuten beträgt.

Nichts davon ist exotisch. Es sind die alltäglichen Grenzfälle, die einen Zeitplan zu einem Zeitpunkt auslösen lassen, den Sie nicht beabsichtigt haben, und keiner davon ist erkennbar, wenn man nur auf die fünf Felder starrt.

## Vor dem Ausliefern überprüfen

Der ehrliche Weg, einen Cron-Ausdruck zu lesen, besteht darin, der eigenen Lesart nicht zu trauen. Entschlüsseln Sie ihn in verständliches Deutsch und sehen Sie sich dann die tatsächlichen Zeitstempel an, die er über die nächsten Ausführungen hinweg erzeugt — dort offenbaren sich der `*/40`-Umlauf, die DST-Lücke und das ODER der Tag-Felder sofort.

Der **Cron Expression Tester** tut genau das in Ihrem Browser: Fügen Sie einen beliebigen Ausdruck ein — Bereiche, Schritte, Listen, `@macros` und alles Übrige — und erhalten Sie eine verständliche Beschreibung in Klartext zusammen mit den nächsten Ausführungszeiten, ohne dass irgendetwas irgendwohin hochgeladen wird. Es verwandelt „Ich glaube, das ist jeden Werktag-Nachmittag“ in „Hier sind die nächsten zehn Zeitpunkte, zu denen es auslöst“ — und das ist die einzige Lesart, die zählt.

[Probieren Sie den Cron Expression Tester aus →](/cron-expression-tester)
