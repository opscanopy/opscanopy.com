---
title: "Warum Ihre GitHub-Actions-\"if\"-Bedingung immer ausgeführt wird (und wie Sie das beheben)"
description: "Ihre GitHub-Actions-if-Bedingung ist immer wahr? Das ist der Literaltext-Fallstrick: Jeder Text außerhalb von ${{ }} wird zu einer truthy Zeichenkette gecastet. Hier sind Ursache und Lösung."
pubDate: 2026-06-14
tags: ["github-actions", "ci-cd"]
relatedTool:
  name: "GitHub Actions Ausdrucks- & Trigger-Tester"
  href: "/github-actions-expression-tester"
lang: de
translationOf: "github-actions-if-condition-always-true"
---

Sie haben einem Schritt ein `if:` hinzugefügt, damit er nur auf `main` läuft, oder nur auf einem Tag, oder nur, wenn ein vorheriger Schritt ein Output gesetzt hat. Dann haben Sie gepusht — und der Schritt lief trotzdem. Jedes Mal. Auf jedem Branch. Die Bedingung ist bloß Dekoration.

Wenn Ihre GitHub-Actions-`if`-Bedingung nicht funktioniert — genauer gesagt, wenn sie *immer* zu true ausgewertet wird —, sind Sie mit ziemlicher Sicherheit in den häufigsten Fallstrick des ganzen Produkts getappt: **Literaltext dort zu platzieren, wo GitHub einen Ausdruck erwartet.** Der Runner gibt dabei keinen Fehler aus. Er castet Ihren Text still und leise zu einer nicht-leeren Zeichenkette, entscheidet, dass eine nicht-leere Zeichenkette truthy ist, und führt den Schritt aus. Dieser Beitrag zeigt die genauen fehlerhaften Muster, die Lösungen und die zugrunde liegenden Casting-Regeln, damit Sie aufhören zu raten.

## Der Fallstrick: Literaltext außerhalb von `${{ }}` ist immer truthy

In einem `if:` wertet GitHub den Wert bereits als Ausdruck aus — Sie umschließen das Ganze **nicht** mit `${{ }}`. Doch in dem Moment, in dem irgendein Literaltext außerhalb der Ausdrucks-Klammern austritt, hört der Runner auf, die Zeile als Bedingung zu behandeln, und beginnt, sie als Zeichenkette zu behandeln. Eine nicht-leere Zeichenkette ist truthy. Ihr Schritt läuft immer.

```yaml
# BAD — the ${{ }} is embedded in a larger string, so the whole if: is a string
- name: Deploy
  if: ${{ github.ref == 'refs/heads/main' }} && success()
  run: ./deploy.sh
```

Das sieht vernünftig aus, aber der Runner sieht: werte `${{ ... }}` zu `true` aus, hänge dann ` && success()` als **Literaltext** an. Der endgültige Wert ist die Zeichenkette `"true && success()"` — nicht leer, also truthy. Der Schritt läuft auf jedem Branch.

Die Lösung besteht darin, **einen** Ausdruck ohne Klammern und ohne überflüssigen Text zu schreiben:

```yaml
# FIXED — a single bare expression, no ${{ }}, no trailing literal
- name: Deploy
  if: github.ref == 'refs/heads/main' && success()
  run: ./deploy.sh
```

Dieselbe Falle erwischt Sie, wenn Sie die *gesamte* Bedingung in Anführungszeichen setzen:

```yaml
# BAD — the entire condition is a quoted string literal, always truthy
- if: "${{ steps.check.outputs.changed == 'true' }}"
  run: ./build.sh
```

Den Ausdruck in Anführungszeichen zu setzen, macht den YAML-Wert zu einer reinen Zeichenkette. GitHub findet darin ein `${{ }}`, setzt das Ergebnis ein, und schon sind Sie wieder bei einer nicht-leeren Zeichenkette. Lassen Sie die Anführungszeichen und die Klammern weg:

```yaml
# FIXED
- if: steps.check.outputs.changed == 'true'
  run: ./build.sh
```

Faustregel: **In einem `if:` gibt es keine `${{ }}` und keine umschließenden Anführungszeichen.** Nur den Ausdruck. Die Klammern dienen dazu, Werte in `run:`, `name:` und `with:` zu interpolieren — nicht für Bedingungen.

Sie können jedes dieser Beispiele in den [GitHub Actions Ausdrucks- & Trigger-Tester](/github-actions-expression-tester) einfügen und zusehen, wie er das Austreten von Literaltext markiert, bevor Sie pushen — er warnt vor genau diesem Muster (es wird als [actions/runner#1173](https://github.com/actions/runner/issues/1173) geführt, der Bug mit den meisten Reaktionen im Runner-Repository).

## Das implizite `success()`, das verschwindet, sobald Sie ein `if:` hinzufügen

Hier ist die zweite Überraschung, und sie ist der Grund für „mein bedingter Schritt läuft, obwohl der vorherige Schritt fehlgeschlagen ist".

Jeder Schritt und jeder Job hat eine **implizite `success()`-Bedingung**. Ganz ohne `if:` läuft ein Schritt nur, wenn alles davor erfolgreich war. Genau deshalb stoppen Pipelines beim ersten Fehler, ohne dass Sie irgendetwas schreiben müssen.

In dem Moment, in dem Sie ein *eigenes* `if:` hinzufügen, ist dieses implizite `success()` **weg**. Ihre Bedingung ist jetzt die *ganze* Wahrheit.

```yaml
# BAD — you wanted "on main", but you deleted the implicit success() guard
- name: Notify on main
  if: github.ref == 'refs/heads/main'
  run: ./notify.sh   # now runs on main EVEN IF the build above failed
```

Wenn der Schritt weiterhin Erfolg voraussetzen soll, sagen Sie es explizit:

```yaml
# FIXED — re-add the success() guard you lost
- name: Notify on main
  if: success() && github.ref == 'refs/heads/main'
  run: ./notify.sh
```

Das ist auch der Grund, warum Leute verwirrt sind, dass ein „Cleanup"-Schritt nur bei Erfolg läuft, obwohl sie wollten, dass er auf jeden Fall läuft — der implizite Schutz ist nach wie vor da, bis sie `always()` hinzufügen.

## `success()` vs. `always()` vs. `failure()` vs. `cancelled()`

Diese vier Statusfunktionen entscheiden, *ob der Schritt vorherige Ergebnisse überhaupt berücksichtigt*. Sie zu verwechseln ist die andere Hälfte von „mein `if` verhält sich nicht so, wie es soll".

- **`success()`** — true nur, wenn alle vorherigen Schritte/Jobs erfolgreich waren. (Das ist der implizite Standard.)
- **`failure()`** — true, wenn irgendein vorheriger Schritt fehlgeschlagen ist. Verwenden Sie es für Fehler-Benachrichtigungen.
- **`always()`** — bedingungslos true; der Schritt läuft selbst dann, wenn ein vorheriger Schritt fehlgeschlagen ist *oder der Workflow abgebrochen wurde*. Verwenden Sie es für Cleanup, das immer stattfinden muss.
- **`cancelled()`** — true nur, wenn der Workflow abgebrochen wurde.

Der klassische Fehler besteht darin, `always()` mit einer weiteren Bedingung über `&&` zu kombinieren und zu erwarten, dass es bei einem Abbruch trotzdem läuft — das tut es, aber oft wollen Leute das Gegenteil:

```yaml
# BAD — "always upload logs, but only on main" — this does NOT short-circuit on failure
- name: Upload logs
  if: github.ref == 'refs/heads/main'
  run: ./upload-logs.sh   # skipped when the build fails, because implicit success() is gone... wait, no — it's gone, so it runs? See below.
```

Um bei diesem letzten Beispiel präzise zu sein: Weil Sie ein eigenes `if:` angegeben haben, wird das implizite `success()` verworfen, sodass der Schritt auf `main` läuft, *unabhängig davon*, ob der Build erfolgreich war. Wenn Sie tatsächlich „Logs auf main hochladen, egal ob erfolgreich oder nicht" wollen, ist das genau das, was Sie haben — aber machen Sie die Absicht explizit, damit die nächste Person, die es liest, nicht raten muss:

```yaml
# FIXED — explicit: run on main whether the build passed or failed
- name: Upload logs
  if: always() && github.ref == 'refs/heads/main'
  run: ./upload-logs.sh
```

Und für eine Warnung nur bei Fehler:

```yaml
# FIXED — only when something upstream broke
- name: Alert
  if: failure()
  run: ./page-oncall.sh
```

## Casting-Überraschungen: `==`, Zeichenketten und Groß-/Kleinschreibung

Selbst bei korrekt geformten Ausdrücken bringen GitHubs Vergleichsregeln Leute aus dem Konzept, weil sie JavaScript-*ähnlich*, aber kein JavaScript sind.

**Der String-`==` ist case-insensitiv.** Das brennt Leuten an, die Branch-Refs oder Eingabewerte vergleichen:

```yaml
# Surprise: both of these are TRUE
${{ 'MAIN' == 'main' }}          # true — case-insensitive
${{ 'Refs/Heads/Main' == github.ref }}  # may be true unexpectedly
```

**Lockeres Casting über Typen hinweg.** Wenn sich die beiden Seiten im Typ unterscheiden, castet GitHub in Richtung einer Zahl: Booleans werden zu `1`/`0`, und Zeichenketten werden als Zahlen geparst (eine leere Zeichenkette und `'0'` sind `0`; nicht-numerische Zeichenketten werden zu `NaN`, und jeder Vergleich mit `NaN` ist false). Also:

```yaml
${{ true == 1 }}        # true
${{ '' == 0 }}          # true  — empty string coerces to 0
${{ '3.0' == 3 }}       # true
${{ 'abc' == 0 }}       # false — 'abc' is NaN, NaN != anything
```

**`&&` und `||` geben Operanden zurück, keine Booleans.** Genau wie in JavaScript gibt `a && b` den Wert `b` zurück, wenn `a` truthy ist, andernfalls `a`. Das ist großartig für Standardwerte (`inputs.name || 'default'`), bedeutet aber, dass `if: inputs.flag && 'yes'` zur Zeichenkette `'yes'` ausgewertet wird — truthy — und nicht zu einem sauberen Boolean.

Die falsy Werte sind genau: `false`, `0`, `''` (leere Zeichenkette) und `null`. Alles andere — einschließlich der Zeichenketten `'false'` und `'0'`... Moment: `'0'` ist falsy, weil es zur Zahl `0` gecastet wird, aber `'false'` ist eine **nicht-leere Zeichenkette, die nicht zu einer Zahl gecastet wird**, also ist `${{ 'false' }}` **truthy**. Diese eine Tatsache verursacht mehr „mein boolescher Input ist immer true"-Bugs als jede andere:

```yaml
# BAD — workflow_dispatch inputs are STRINGS; 'false' is truthy
on:
  workflow_dispatch:
    inputs:
      deploy: { type: boolean }
jobs:
  go:
    if: inputs.deploy   # with type: boolean this is fine...
```

```yaml
# BAD — but if the value arrives as a string 'false', this always runs
- if: github.event.inputs.deploy   # string 'false' is truthy!
  run: ./deploy.sh
```

```yaml
# FIXED — compare explicitly so the string is interpreted as data
- if: github.event.inputs.deploy == 'true'
  run: ./deploy.sh
```

## `contains` und `startsWith` sind nicht dasselbe wie `==`

Das Filtern nach Ref-Präfix ist eine weitere Stelle, an der die falsche Funktion still und leise zu viel matcht:

```yaml
# BAD — contains matches ANYWHERE, so 'feature/main-fix' passes too
- if: contains(github.ref, 'main')
  run: ./deploy.sh
```

```yaml
# FIXED — anchor to the start, or compare the full ref
- if: startsWith(github.ref, 'refs/heads/release/')
  run: ./deploy.sh
# or, for an exact branch:
- if: github.ref == 'refs/heads/main'
  run: ./deploy.sh
```

Denken Sie daran, dass sowohl `contains` als auch `startsWith` Zeichenketten case-insensitiv vergleichen, genau wie `==`.

## Testen Sie Ihr `if:`, bevor Sie pushen

Der Grund, warum diese Bugs so hartnäckig sind, ist die Feedback-Schleife: Die einzige Möglichkeit, eine Bedingung zu „testen", bestand traditionell darin, zu committen, zu pushen und die Logs zu lesen — dann zu raten, zu bearbeiten und erneut zu pushen. Jeder falsche Versuch ist ein Hin und Her.

Der [GitHub Actions Ausdrucks- & Trigger-Tester](/github-actions-expression-tester) schließt diese Schleife. Fügen Sie Ihren `if:`-Ausdruck ein, setzen Sie einen Mock-`github`-/`env`-/`steps`-/`needs`-Kontext und sehen Sie das ausgewertete Ergebnis mit GitHubs exakten Operator-, Casting- und Groß-/Kleinschreibungs-Regeln — dazu eine explizite Warnung, wenn Sie Literaltext außerhalb von `${{ }}` stehen gelassen und versehentlich eine immer-truthy Bedingung gebaut haben. Er läuft vollständig in Ihrem Browser; nichts über Ihren Workflow wird hochgeladen.

Wenn Sie jemals ein `if:` ausgeliefert und gehofft haben, dass es überspringt, ist dies die Prüfung, die es Ihnen sagt, bevor der Runner es tut.

[Probieren Sie den GitHub Actions Ausdrucks- & Trigger-Tester aus →](/github-actions-expression-tester)
