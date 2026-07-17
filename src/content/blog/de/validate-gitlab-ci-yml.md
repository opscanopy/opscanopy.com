---
title: "So validierst du deine .gitlab-ci.yml vor dem Push"
description: "Schluss mit kaputten Pipelines beim Pushen. Validiere deine .gitlab-ci.yml direkt im Browser auf YAML- und Strukturfehler — vor dem Commit, nicht erst nach der roten Pipeline."
pubDate: 2026-06-11
tags: ["gitlab-ci","ci-cd","yaml"]
lang: de
translationOf: "validate-gitlab-ci-yml"
relatedTool:
  name: "GitLab CI Validator"
  href: "/gitlab-ci-validator"
---

![GitLab-CI-Validator prüft eine .gitlab-ci.yml vor dem Push auf YAML- und Pipeline-Fehler](/blog/validate-gitlab-ci-yml-hero.svg)

Du änderst eine einzige Zeile in der `.gitlab-ci.yml`, pushst und widmest dich etwas anderem. Zwei Minuten später wird die Pipeline rot — nicht weil der Build kaputt ist, sondern weil ein Job auf eine `stage` verweist, die du letzte Woche umbenannt hast. Du korrigierst den Tippfehler, pushst erneut, wartest erneut. Das ist die Schleife, und der einzige Ausweg ist, die `.gitlab-ci.yml` zu validieren, *bevor* der Commit landet, und nicht erst, wenn der Runner es dir sagt.

Das Frustrierende daran: GitLab weiß bereits in dem Moment, in dem es deine Konfiguration parst, dass sie kaputt ist. Es sagt es dir nur erst, nachdem du gepusht und eine CI-Minute verbrannt hast. Die Lösung besteht darin, genau diese Prüfung lokal im Browser durchzuführen, bevor du überhaupt `git push` ausführst.

## Die push-and-pray-Schleife

So sieht das Problem aus. Du bearbeitest einen Job, pushst und lässt GitLab deinen Linter sein:

```bash
git add .gitlab-ci.yml
git commit -m "split deploy into staging + prod"
git push
# wait for the runner to pick up the pipeline...
# pipeline failed: "chosen stage prod does not exist"
git commit -am "fix: declare prod stage"
git push
# wait again...
```

Jeder Durchlauf bedeutet einen Commit, den du nicht wolltest, einen Runner-Slot, den du nicht gebraucht hast, und einen Kontextwechsel, der mehr kostet als der Tippfehler selbst. Die Fehler, die das verursachen, brauchen fast nie einen Runner, um erkannt zu werden. Sie sind in dem Moment sichtbar, in dem das YAML geparst und der Job-Graph aufgelöst wird — und genau das macht ein Validator lokal.

## Zwei Arten von Fehlern: YAML-Syntax vs. strukturell

Wenn GitLab eine Pipeline ablehnt, gehört der Fehler in eine von zwei Kategorien, und sie erfordern völlig unterschiedliche Korrekturen.

Die erste ist ein **YAML-Syntaxfehler**: Die Datei ist überhaupt kein gültiges YAML, also kann nichts weiter unten in der Verarbeitungskette sie lesen. Die zweite ist ein **Strukturfehler**: Das YAML parst sauber, aber die *Pipeline*, die es beschreibt, ist ungültig — ein Job ohne Skript, eine Stage, die nie deklariert wurde, ein `needs`, das auf einen nicht existierenden Job zeigt.

```yaml
# YAML error — the parser can't even build a document
build:
  script:
    - make
   - make test      # inconsistent indentation: parser bails here

# Structural error — valid YAML, invalid pipeline
deploy:
  stage: prod        # "prod" is not in stages: → GitLab refuses to run it
  script: ./deploy.sh
```

Gültiges YAML ist nur die halbe Miete. Der [GitLab CI Validator](/gitlab-ci-validator/) prüft beides in einem Durchgang: Er parst zuerst das YAML, und nur wenn das gelingt, führt er die strukturellen Prüfungen gegen deine Jobs aus. Schlägt das Parsen fehl, bekommst du eine einzige Fehlermeldung mit Zeilenangabe und sonst nichts — es bringt nichts, „undefined stage“ für ein Dokument zu melden, das gar nicht geparst werden konnte.

![Illustration: eine leuchtende .gitlab-ci.yml, geprüft von CI-Lint-Tools, yamllint und Editor-Checks — OK- und Fehler-Ergebnisse fließen in Richtung eines Draft Merge Requests](/blog/in-content/validate-gitlab-ci-yml.webp)

## YAML-Fehler, die wehtun: Einrückung, Tabs, doppelte Schlüssel

YAML ist whitespace-sensitiv, und CI-Konfiguration ist genau die Art von verschachtelter Struktur, bei der das zum Verhängnis wird. Die klassische GitLab-Fehlermeldung — `did not find expected key` — ist fast immer einer dieser Fälle.

```yaml
test:
  stage: test
	script:              # a literal TAB instead of spaces → parse error
    - npm test

variables:
  DEPLOY_ENV: staging
  DEPLOY_ENV: prod       # duplicate key — the first value is silently lost

deploy:
  script: &deploy_steps  # anchor defined...
    - ./deploy.sh
rollback:
  script: *deploy_step   # ...but referenced with a typo → "unknown alias"
```

Ein Browser-Validator parst mit einem echten YAML-Reader und meldet deshalb die exakte Zeile, in der die Struktur gebrochen ist. Wenn du Konfiguration einfügst und das Ergebnis `Could not parse YAML: ... (line 4, column 2)` lautet, sagt dir der Parser genau, wo du nachschauen musst — rück neu ein, ersetze den Tab durch Leerzeichen oder korrigiere den Anchor-Namen und validiere erneut.

## Strukturfehler, die GitLab erst spät erkennt: undefinierte Stages, Jobs ohne Skript, fehlerhaftes needs/extends

Das sind die Fehler, bei denen du auf einen Runner wartest, nur um dann zu erfahren, dass die Pipeline nie gestartet ist. Sie sind der eigentliche Grund, GitLab CI vor dem Push zu validieren. Der Validator bildet die Regeln aus der `.gitlab-ci.yml`-Keyword-Referenz von GitLab nach und markiert jeden Fehler mit dem betroffenen Job, der Zeile und der Korrektur.

![Ein Validierungs-Pipeline-Ablauf: .gitlab-ci.yml einfügen, YAML parsen, strukturelle Prüfungen ausführen und dann „gültig“ oder eine Fehlerliste anzeigen](/blog/validate-gitlab-ci-yml-diagram.svg)

**Ein Job ohne ausführbare Fläche.** Jeder sichtbare Job muss *etwas* tun: Befehle mit `script:` ausführen (oder dem neueren `run:`), mit `trigger:` eine nachgelagerte Pipeline starten oder eines davon über `extends:` erben. Ein Job ohne all das wird mit der bekannten Meldung „job config should implement a script: or a trigger: keyword“ abgelehnt.

```yaml
# ERROR — empty-job defines no script, run, trigger, or extends
empty-job:
  stage: test
  # nothing here → GitLab won't run it
```

Beachte, dass ein *leeres* `script: []` oder `script: ""` ebenfalls als fehlend gilt — der Validator behandelt nur eine nicht-leere Befehls-Zeichenkette oder -Liste als echte ausführbare Fläche, genau wie GitLab es tut.

**Eine Stage, die nicht deklariert ist.** Wenn die `stage:` eines Jobs nicht in deiner `stages:`-Liste steht (oder einer der fünf Standardwerte: `.pre`, `build`, `test`, `deploy`, `.post`), weiß GitLab nicht, wann es ihn ausführen soll.

```yaml
stages:
  - build
  - test

release-job:
  stage: release      # ERROR — "release" is not in stages:
  script: make release
```

Es gibt eine subtile Variante, die der Validator ebenfalls erkennt: Ein Job, der `stage:` *weglässt*, fällt auf die implizite `test`-Stage zurück. Wenn du eine eigene `stages:`-Liste deklariert hast, die `test` nicht enthält, zeigt dieser Job nun auf eine Stage, die du nie deklariert hast — und GitLab scheitert mit „chosen stage test does not exist“.

**`needs` / `dependencies` / `extends`, die auf einen nicht existierenden Job zeigen.** Jeder Name in `needs:`, `dependencies:` oder `extends:` muss auf einen echten Job oder ein verstecktes `.template` in derselben Datei auflösbar sein.

```yaml
test:
  stage: test
  needs:
    - compile          # ERROR — no job named "compile"
  extends: .base       # ERROR — no template named ".base"
  script: make test
```

Der Validator baut die Menge aller Job-IDs und aller `.template`s auf und prüft dann jede Referenz dagegen. Benennst du ein Template um und vergisst, ein `extends:` anzupassen, sagt er dir, welcher Job kaputtgegangen ist, bevor der Runner es tut.

**Ein ungültiges `when:` oder ein `rules:`, das keine Liste ist.** Das Keyword `when:` akzeptiert nur `on_success`, `on_failure`, `always`, `manual`, `delayed` oder `never`. Und `rules:` muss eine YAML-*Liste* von Regel-Objekten sein — ein einfaches Mapping ist ein häufiger Fehler, der stillschweigend ändert, wann ein Job läuft.

```yaml
deploy:
  stage: deploy
  when: sometimes      # ERROR — not an allowed when value
  rules:
    if: '$CI_COMMIT_TAG'   # ERROR — rules must be a list, not a mapping
  script: ./deploy.sh
```

Außerdem gibt er Hinweise mit geringerer Schwere aus: Veraltetes `only`/`except` erhält einen Info-Hinweis mit der Empfehlung, `rules:` zu verwenden (beide lassen sich nicht in einem Job kombinieren), ein Top-Level-Schlüssel, der nur eine Korrektur von einem reservierten Keyword entfernt ist — etwa `varables:` oder `beforescript:` — bekommt eine Tippfehler-Warnung, und fehlerhaft geformte `image:`/`services:`-Strukturen werden als Fehler markiert.

## Vor dem Push validieren: GitLab CI Lint vs. ein In-Browser-Validator

GitLab bringt seinen eigenen Checker mit — CI Lint, im Pipeline-Editor. Er ist maßgeblich: Er löst `include:`-Dateien und projektweite CI/CD-Variablen auf, die ein clientseitiges Tool nicht sehen kann. Aber das hat seinen Preis: Er setzt ein Projekt und eine Anmeldung voraus. Du kannst damit kein Snippet aus einem Code-Review linten, keine Konfiguration, die du offline entwirfst, und keine proprietäre Pipeline, die du lieber nicht in ein gehostetes Formular einfügen würdest.

Was prüft also ein In-Browser-Validator tatsächlich? Ausgehend von der Engine ist der Ablauf deterministisch und vollständig lokal:

1. **Das YAML parsen.** Jeder Fehler liefert eine einzige Meldung mit Zeilenangabe und stoppt — keine strukturellen Befunde bei einem nicht parsbaren Dokument.
2. **Die oberste Ebene aufteilen** in globale Keywords (`stages`, `default`, `variables`, `image`, `services`…), sichtbare Jobs und versteckte `.templates`.
3. **Die Stages auflösen** — deine deklarierte `stages:`-Liste oder die fünf Standardwerte — zu der Menge, gegen die die `stage:` jedes Jobs geprüft wird.
4. **Jeden Job prüfen** auf eine ausführbare Fläche, eine bekannte Stage, echte `needs`/`extends`/`dependencies`-Ziele, ein gültiges `when:`, ein listenförmiges `rules:` und sinnvolle `image`/`services`-Strukturen.
5. **Nach Schwere sortieren** — Fehler zuerst, dann Warnungen, dann Infos — jeweils mit Zeile und konkreter Behebung. Er wirft nie eine Exception; ein Parse-Fehler wird gemeldet, nicht durch einen Absturz quittiert.

Ehrlich eingeordnet: Ein sauberes Ergebnis im Browser gibt dir starke Pre-Push-Sicherheit hinsichtlich *Struktur und Syntax*. Es erwischt die gesamte Klasse von Fehlern, die eine Pipeline scheitern lassen, bevor überhaupt ein Job läuft. Für absolute Gewissheit bei einer Konfiguration, die `include:` oder Projektvariablen nutzt, bestätige das mit GitLabs eigenem CI Lint, sobald du in ein Projekt gepusht hast — aber nutze den In-Browser-Durchlauf, damit dieser Push sitzt.

Wenn du auch GitHub Actions verwendest, gilt dort dieselbe Idee: Der [GitHub Actions Validator](/github-actions-validator/) findet YAML- und Sicherheitsprobleme in deinen Workflow-Dateien, und der [GitHub Actions Expression Tester](/github-actions-expression-tester/) wertet diese `${{ … }}`-Ausdrücke aus, bevor du pushst.

## Bau es in deinen Workflow ein

Der Validator ist ein Einfügen-und-Prüfen-Tool, aber die Gewohnheit, die du dir angewöhnen willst, ist: „Niemals CI-Konfiguration pushen, die du nicht validiert hast.“ Ein Pre-Commit-Hook macht das für die YAML-Hälfte automatisch — fang die Parse-Fehler ab, bevor der Commit überhaupt entsteht:

```bash
#!/usr/bin/env bash
# .git/hooks/pre-commit — block a commit if .gitlab-ci.yml isn't valid YAML
set -euo pipefail

if git diff --cached --name-only | grep -q '^\.gitlab-ci\.yml$'; then
  # Fail fast on a syntax error before the commit lands.
  python -c "import sys, yaml; yaml.safe_load(open('.gitlab-ci.yml'))" \
    || { echo "✗ .gitlab-ci.yml is not valid YAML — commit blocked"; exit 1; }
  echo "✓ .gitlab-ci.yml parses — paste it into the validator for structural checks"
fi
```

Ein lokales YAML-Parsen erwischt die Einrückungs-und-Tabs-Klasse sofort. Für die strukturelle Klasse — undefinierte Stages, kaputtes `needs`, Jobs ohne Skript — fügst du die Datei vor dem Push in den Browser-Validator ein. Beide zusammen decken beide Fehlerkategorien aus dem zweiten Abschnitt ab, und keine davon braucht einen Runner.

```bash
# the loop you actually want
$ git add .gitlab-ci.yml          # pre-commit hook checks YAML
# paste .gitlab-ci.yml → validator → 0 errors
$ git commit -m "split deploy into staging + prod"
$ git push                        # green on the first try
```

## Validiere es jetzt

Wenn du das nächste Mal die `.gitlab-ci.yml` anfasst, lass nicht den Runner das Erste sein, das sie liest. Füge die Datei in den [GitLab CI Validator](/gitlab-ci-validator/) ein und du bekommst die YAML-Fehler und die strukturellen Fehler — undefinierte Stages, Jobs ohne Skript, kaputtes `needs`/`extends`, ungültiges `when:` — in einem Durchgang, jeweils mit Zeile und Korrektur. Er läuft vollständig in deinem Browser: kein Projekt, kein Login und nichts wird hochgeladen, also ist er auch für interne Pipelines sicher.

Wenn du je eine CI-Änderung gepusht und gehofft hast, dass sie funktioniert — das ist der Schritt, der gefehlt hat.
