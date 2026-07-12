---
title: "Warum Ihr GitHub-Actions-Workflow nicht ausgelöst wurde: branches-, tags- und paths-Filter erklärt"
description: "Warum Ihr GitHub-Actions-Workflow nicht ausgelöst wurde: nicht übereinstimmender Branch-Name, die UND-Semantik von branches- + paths-Filtern, die **-Glob-Anforderung, paths-ignore bei pull_request — und die jeweiligen Lösungen."
pubDate: 2026-06-14
tags: ["github-actions", "ci-cd", "debugging"]
relatedTool:
  name: "GitHub Actions Ausdrucks- & Trigger-Tester"
  href: "/github-actions-expression-tester"
lang: de
translationOf: "github-actions-workflow-not-triggering-filters"
---

![GitHub-Actions-Workflow nicht ausgelöst: branches-, tags- und paths-Filterregeln erklärt](/blog/github-actions-workflow-not-triggering-filters-hero.svg)

Sie haben einen Commit gepusht, den Actions-Tab geöffnet — und dort ist nichts. Kein rotes X, kein gelber Punkt: Der Workflow ist schlicht nicht gelaufen. Es gibt keinen Fehler zu lesen, kein Log zum Durchsuchen, denn ein Workflow, der nicht ausgelöst wird, erzeugt überhaupt keinen Lauf. Die Entscheidung fiel, bevor ein Runner zugewiesen wurde — innerhalb der Event-Filterlogik von GitHub, und diese Logik ist überraschender, als es die Dokumentation vermuten lässt.

Fast jeder „Warum wurde mein GitHub-Actions-Workflow nicht ausgelöst?"-Bericht lässt sich auf eine Handvoll Ursachen zurückführen: Die Workflow-Datei liegt nicht auf dem Branch, auf den Sie gepusht haben, Ihr `branches`-Filter passt nicht zur Ref oder — der Klassiker — Sie haben `branches` und `paths` kombiniert, ohne zu bemerken, dass sie mit UND verknüpft sind. Hier ist jede Ursache mit der entscheidenden Regel und der Lösung.

## 1. Die Workflow-Datei liegt nicht auf dem Ziel-Branch

GitHub liest die `on:`-Trigger aus der Version der Workflow-Datei, **die auf dem Branch existiert, der das Event empfängt** — nicht aus Ihrem Default-Branch. Wenn Sie `.github/workflows/ci.yml` auf `main` hinzugefügt haben, aber auf einen Branch `feature/x` pushen, der *vor* der Existenz dieser Datei abgezweigt wurde, gibt es dort keinen Workflow, der ausgelöst werden könnte.

```yaml
# on main, but feature/x branched before this file existed
on:
  push:
    branches: ['**']
```

Das ist der häufigste Fehlalarm. Die Lösung ist mechanisch: Mergen oder rebasen Sie `main` in den Branch, sodass die Workflow-Datei vorhanden ist, und pushen Sie erneut. Dieselbe Regel erklärt, warum Änderungen an `on:`-Triggern erst „wirksam werden", sobald die Änderung den Branch erreicht, auf dem Sie testen.

Warum das wichtig ist: Es gibt keine Fehlermeldung für „hier liegt keine Workflow-Datei". Das ist das Erste, was Sie ausschließen sollten, bevor Sie Ihre Filter in Verdacht ziehen.

![Ein Entscheidungsfluss, der zeigt, wie branches-, tags- und paths-Filter entscheiden, ob ein GitHub-Actions-Workflow bei einem Push ausgelöst wird](/blog/github-actions-workflow-not-triggering-filters-diagram.svg)

## 2. Der Branch-Filter passt nicht zur Ref

`branches` und `tags` sind Glob-Muster, und die Glob-Regeln sind strenger als Shell-Globs. Ein einfaches `*` passt auf **ein Pfadsegment** — es stoppt bei `/`. Um über Schrägstriche hinweg zu matchen, brauchen Sie `**`.

```yaml
# BAD — '*' does not cross '/', so 'release/1.2' never matches
on:
  push:
    branches:
      - 'release/*'   # matches release/1.2 ... actually this IS fine
      - 'feature*'    # matches 'feature' and 'featureX' but NOT 'feature/login'
```

Die Falle ist `feature*` gegenüber `feature/**`. `feature*` passt auf das literale Segment `featureX`, aber ein Branch namens `feature/login` enthält einen Schrägstrich, und `*` überquert ihn nicht. Sie wollen `feature/**`.

```yaml
# FIXED — ** crosses slashes
on:
  push:
    branches:
      - 'release/**'
      - 'feature/**'
      - main
```

Die Glob-Zeichen, die GitHub berücksichtigt: `*` (beliebige Zeichen außer `/`), `**` (beliebige Zeichen einschließlich `/`), `?` (ein Zeichen), `+` (eines oder mehrere des vorangehenden Zeichens), `[]` für Zeichenbereiche, `!` am Anfang eines Musters zur Negierung sowie `\` zum Escapen eines Sonderzeichens (sodass `\*` auf ein literales Sternchen passt). Bei der Negierung ist die Reihenfolge entscheidend — ein späteres `!pattern` schließt Refs aus, die ein früheres Muster eingeschlossen hat.

Warum das wichtig ist: Dass `*` keinen `/` überquert, ist für einen großen Anteil der „github actions branches filter not working"-Berichte verantwortlich. Im Zweifel greifen Sie zu `**`.

![Synthwave-Illustration: Ein push-Event erreicht ein Retro-Terminal mit der Aufschrift WORKFLOW START, während branches-, tags- und paths-Filter Refs und geänderte Dateien zulassen oder ablehnen](/blog/in-content/github-actions-workflow-not-triggering-filters.webp)

## 3. Die UND-Semantik von `branches` + `paths`

Das ist die Sache, die erfahrene Ingenieure erwischt. Wenn ein `push`- oder `pull_request`-Event **sowohl** einen Branch-Filter als auch einen Pfad-Filter hat, muss das Event **beide** erfüllen, um auszulösen. Sie sind mit UND verknüpft, nicht mit ODER.

```yaml
# BAD — intent: "run on a push to main, OR when src changes"
# reality: "run only on a push to main AND when src/** changed"
on:
  push:
    branches: [main]
    paths: ['src/**']
```

Ein Push auf `main`, der nur `README.md` berührt, lässt diesen Workflow **nicht** laufen — der Branch hat gepasst, aber kein Pfad, und beides muss zutreffen. Man liest diesen Block als ODER und ist verblüfft, wenn reine Dokumentations-Commits die CI überspringen.

Wenn Sie wirklich „bei main-Pushes immer, plus bei jedem Branch, wenn sich `src` ändert" wollen, sind das zwei separate Filtersätze, die `on:` nicht in einem einzigen `push`-Block ausdrücken kann — Sie teilen das auf mehrere Trigger auf oder verwenden stattdessen `if:`-Bedingungen auf Job-Ebene mit `github.ref`.

```yaml
# FIXED — be explicit that you want both conditions, or drop one
on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - '.github/workflows/**'   # so CI changes still trigger
```

Warum das wichtig ist: Die UND-Semantik ist in einem einzigen Satz dokumentiert und widerspricht der Intuition der meisten Leute. Wenn Ihr Workflow manche Pushes auf den richtigen Branch „zufällig" überspringt, ist fast immer ein Pfad-Filter die Ursache.

## 4. `paths` ohne begleitendes `branches` braucht trotzdem eine echte Ref

Eine subtile Folgerung: Wenn Sie nach `on.push.paths` filtern und möchten, dass dies über alle Branches hinweg gilt, brauchen Sie überhaupt keinen `branches`-Block — sein Weglassen bedeutet „alle Branches". Doch sobald Sie `branches` hinzufügen, greift Regel #3. Manche fügen `branches: ['**']` hinzu, weil sie denken, es sei nötig, damit `paths` funktioniert; das ist es nicht, und es zu ergänzen, ändert nichts, weil `**` ohnehin auf jeden Branch passt. Verinnerlichen sollten Sie: Ein fehlender Filter bedeutet „matche alles", ein vorhandener Filter grenzt ein.

```yaml
# These behave identically: paths applies to every branch
on:
  push:
    paths: ['src/**']
# vs
on:
  push:
    branches: ['**']
    paths: ['src/**']
```

## 5. `paths-ignore` und der Diff, der zu groß ist

`paths-ignore` überspringt den Lauf **nur, wenn jede geänderte Datei auf ein Ignore-Muster passt**. Fällt eine einzige Datei außerhalb der Ignore-Liste, läuft der Workflow. Eine einzige fremde Änderung hebt also den gesamten Filter auf — was meist das ist, was man will, aber Leute überrascht, die erwarten, dass „diese Dateien ignorieren" bedeutet „Commits ignorieren, die diese Dateien berühren".

```yaml
# Skips ONLY when every changed file is docs; one code file => runs
on:
  push:
    paths-ignore:
      - 'docs/**'
      - '**.md'
```

Zwei weitere Fallstricke wohnen hier. Erstens: Pfad-Filter werden gegen den **Diff** ausgewertet, und GitHub inspiziert nur bis zu 300 geänderte Dateien (1.000 Commits) — jenseits dieser Grenze gibt die Pfad-Filterung auf, und der Workflow läuft (bzw. wird so ausgewertet, als hätte der Filter bestanden). Ein riesiger Force-Push oder ein gewaltiger Merge kann einen Workflow auslösen, den Ihr `paths-ignore` „eigentlich" hätte überspringen sollen. Zweitens: Sie können `paths` und `paths-ignore` nicht im selben Trigger mischen; entscheiden Sie sich für eines.

Warum das wichtig ist: `paths-ignore` ist ein Alles-oder-nichts-Tor auf dem Diff, und die 300-Dateien-Obergrenze bedeutet, dass es bei großen Änderungen keine harte Garantie ist.

## 6. `pull_request`, Forks und `pull_request_target`

Branch-Filter bei `pull_request` matchen den **Base**-Branch (wohin der PR gemergt wird), nicht den Head-Branch, an dem der Beitragende arbeitet. Wenn Sie `branches: [main]` schreiben und erwarten, dass es auf das `feature/x` des Beitragenden passt, wird es das nicht — es matcht PRs, die *auf* `main` *abzielen*.

```yaml
# Runs on PRs whose BASE (merge target) is main or a release branch
on:
  pull_request:
    branches:
      - main
      - 'release/**'
```

Und ein `pull_request` aus einem Fork ist eingeschränkt: Der PR eines erstmaligen Beitragenden kann eine manuelle Freigabe erfordern, bevor irgendein Workflow läuft — was identisch aussieht zu „nicht ausgelöst". Falls Sie auf `pull_request_target` umgestiegen sind, um die Fork-Einschränkungen zu umgehen, beachten Sie: Es liest den Workflow und die Trigger aus der Version der Datei im **Base**-Branch — und trägt ein echtes Sicherheitsrisiko, das in unserem Beitrag zu [GitHub-Actions-Sicherheitsfehlkonfigurationen](/blog/github-actions-security-misconfigurations) behandelt wird.

## Ein Filter-Spickzettel zum Kopieren

```yaml
on:
  push:
    branches:                 # ref globs; missing = all branches
      - main
      - 'release/**'          # ** crosses '/'; '*' does not
      - 'feature/**'
    tags:
      - 'v[0-9]+.[0-9]+.[0-9]+'   # numeric semver tags only
    paths:                    # ANDed with branches — BOTH must match
      - 'src/**'
      - '.github/workflows/**'
  pull_request:
    branches: [main]          # matches the PR's BASE branch
    paths-ignore:             # skip only if EVERY changed file matches
      - '**.md'
```

Kurzreferenz für die Glob-Zeichen: `*` = beliebige Zeichen außer `/`, `**` = beliebige Zeichen einschließlich `/`, `?` = ein Zeichen, `+` = eines oder mehrere des vorangehenden Zeichens, `[a-z]` = Bereich, führendes `!` = negieren, `\` = escapen.

## Hören Sie auf zu raten — spielen Sie Ihr Event erneut ab

Was diese Bugs zermürbend macht, ist, dass die Feedback-Schleife „pushen und beten" lautet. Es gibt keinen Trockenlauf, kein `--explain`, nur einen leeren Actions-Tab. Also committen Sie eine einzeilige Änderung, pushen, aktualisieren, warten und wiederholen — und verbrennen Minuten pro Versuch gegen eine Semantik, bei der Sie sich nicht sicher sind.

Der **GitHub Actions Ausdrucks- & Trigger-Tester** schließt diese Schleife. Fügen Sie Ihren `on:`-Block ein, beschreiben Sie das Event — ein `push` auf `feature/login`, das Tag `v2.1.0` oder ein `pull_request` mit Ziel `main` samt einer Liste geänderter Dateien — und er wertet jeden `branches`-, `tags`-, `paths`- und `paths-ignore`-Filter mit derselben Glob-Engine und UND-Semantik aus, die GitHub verwendet. Sie erhalten pro Job eine **RUNS / SKIPPED**-Tabelle mit dem exakten ausschlaggebenden Grund: „branch matched, but no path filter did" oder „`*` does not cross `/`". Es läuft zu 100 % in Ihrem Browser — Ihr Workflow-YAML verlässt niemals die Seite.

Sehen Sie genau, welche Jobs laufen, bevor Sie pushen — nicht danach.

[GitHub Actions Ausdrucks- & Trigger-Tester öffnen →](/github-actions-expression-tester)
