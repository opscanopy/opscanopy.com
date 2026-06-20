---
title: "7 häufige Fehler in der .gitlab-ci.yml (und wie man sie aufspürt)"
description: "Die Fehler in der .gitlab-ci.yml, die Pipelines rot werden lassen: nicht definierte Stages, Jobs ohne Skript, kaputte needs und rules, falsch eingesetzte Anchor — jeweils mit einer Lösung zum Kopieren."
pubDate: 2026-06-12
tags: ["gitlab-ci","ci-cd","yaml"]
lang: de
translationOf: "common-gitlab-ci-mistakes"
relatedTool:
  name: "GitLab CI Validator"
  href: "/gitlab-ci-validator"
---

![Kommentierte .gitlab-ci.yml mit den häufigsten GitLab-CI-Fehlern — eine nicht definierte Stage, ein Job ohne Skript und eine kaputte needs-Referenz — markiert, bevor die Pipeline läuft](/blog/common-gitlab-ci-mistakes-hero.svg)

Du pusht eine einzeilige Änderung, wechselst den Tab, und 30 Sekunden später wird das Pipeline-Symbol rot. Kein fehlgeschlagener Test — die Pipeline ist nie gestartet. GitLab hat `This GitLab CI configuration is invalid` ausgegeben und eine einzige knappe Zeile zu einer Stage oder einem Skript. Du liest das YAML dreimal durch, findest den Tippfehler, pusht erneut, wartest erneut. Die meisten GitLab-CI-Fehler, die dich diese Runde kosten, sind nicht exotisch. Es ist immer dieselbe Handvoll falsch konfigurierter GitLab-Pipelines, die sich in jedem Team wiederholt: eine Stage, die nie deklariert wurde, ein Job, der nichts tut, ein `needs`, das auf einen Job zeigt, den du umbenannt hast.

Die gute Nachricht ist, dass diese GitLab-CI-YAML-Fehler struktureller Natur sind — was bedeutet, dass sie sich abfangen lassen, bevor du committest. Im Folgenden findest du die sieben, die am häufigsten auftreten, jeweils mit dem Symptom, einem minimalen fehlerhaften Beispiel und der Lösung zum Einfügen.

## 1. Verweis auf eine nicht definierte Stage

```yaml
stages:
  - build
  - test

release-job:
  stage: release      # not in stages:
  script:
    - make release
```

GitLab lehnt das mit einer Meldung wie `chosen stage release does not exist; available stages are .pre, build, test, .post` ab. Das `stage:` eines Jobs muss einer der Namen in deiner Top-Level-Liste `stages:` sein — oder eine der fünf impliziten Stages, die GitLab immer bereitstellt: `.pre`, `build`, `test`, `deploy` und `.post`.

Es gibt eine leisere Variante dieses Fehlers. Ein Job ganz ohne `stage:` fällt standardmäßig auf `test` zurück. Wenn du eine eigene `stages:`-Liste deklariert hast, die `test` nicht enthält, hat dieser Job nirgendwo Platz zum Laufen, und GitLab meldet denselben Fehler. Die Lösung ist in beiden Fällen dieselbe — deklariere die Stage:

```yaml
stages:
  - build
  - test
  - release

release-job:
  stage: release
  script:
    - make release
```

## 2. Ein Job ohne Skript (und die Verwechslung mit dem global/default-Skript)

```yaml
stages:
  - test

empty-job:
  stage: test
  # no script, run, trigger, or extends
```

Das erzeugt den Fehler „GitLab-CI-Job ohne Skript" — `job config should implement a script: or a trigger: keyword`. Ein sichtbarer Job muss *etwas tun*. Es gibt genau vier Wege, das zu erfüllen: Befehle mit `script:` ausführen (oder dem neueren `run:`), mit `trigger:` eine nachgelagerte Pipeline starten oder über `extends:` einen davon von woanders erben. Ein Job, der keinen dieser vier hat, wird abgelehnt.

Die Verwechslung, die das verursacht, ist der global/default-Block. Teams legen ein `before_script:` oder einen `default:`-Abschnitt an und nehmen an, ein Job erbe daraus einen *Befehl*. Tut er nicht. `before_script` läuft *rund um* dein Skript; es ist nicht das Skript. `default:` liefert Standardwerte für Schlüssel wie `image:` und `cache:`, gibt einem Job aber keine ausführbare Oberfläche. Der Job braucht weiterhin sein eigenes `script:` (oder ein `trigger`, `run` oder `extends`):

```yaml
empty-job:
  stage: test
  script:
    - make check
```

Versteckte, mit Punkt beginnende Templates sind die Ausnahme — mehr dazu in Fehler sechs. Sie dürfen unvollständige Fragmente sein und müssen daher kein Skript tragen.

## 3. needs zeigt auf einen Job in einer späteren Stage oder auf einen Job, der nicht existiert

```yaml
stages:
  - build
  - test

build:
  stage: build
  script: make

test:
  stage: test
  needs:
    - compile      # no such job
  script: make test
```

`needs:` baut den gerichteten azyklischen Graphen auf, der es Jobs erlaubt, früher zu starten, statt auf das Ende einer ganzen Stage zu warten. Jeder Name darin muss sich auf einen echten Job in derselben Pipeline auflösen lassen. Hier wurde `compile` irgendwann in `build` umbenannt und die `needs`-Referenz nie aktualisiert, sodass der Graph eine lose Kante hat und sich die Pipeline nicht zusammensetzen lässt.

Die klassische Variante dieses Fehlers ist die Reihenfolge: `needs` zeigt auf einen Job in einer *späteren* Stage. `needs` kann nur auf Jobs verweisen, die vorher laufen — ein Job kann nichts benötigen, das noch nicht gelaufen ist. Verweise auf den echten vorgelagerten Job:

```yaml
test:
  stage: test
  needs:
    - build
  script: make test
```

Dieselbe Regel gilt für `dependencies:`. Jede Artefakt-Abhängigkeit, die du auflistest, muss einen Job benennen, der tatsächlich existiert, sonst schlägt der Download zur Laufzeit fehl.

## 4. rules, die nie greifen (oder immer) — und das Vermischen von only/except mit rules

```yaml
deploy:
  stage: deploy
  when: sometimes        # not a valid when value
  rules:
    if: '$CI_COMMIT_TAG' # rules must be a list
  script: ./deploy.sh
```

In diesem einen Job stecken zwei Fehler bei GitLab-CI-rules und -extends. Erstens akzeptiert `when:` nur einen festen Satz an Werten — `on_success`, `on_failure`, `always`, `manual`, `delayed` oder `never`. `sometimes` ist keiner davon, und ein Tippfehler hier wird rundheraus abgelehnt. Zweitens muss `rules:` eine YAML-*Liste* von Rule-Objekten sein. Als reines Mapping geschrieben (`if:` direkt unter `rules:`) ist es fehlerhaft; GitLab kann es nicht als Rule lesen.

![Ein kurzer fehlerhafter .gitlab-ci.yml-Ausschnitt mit roten Sprechblasen, die auf eine nicht definierte Stage, einen Job ohne Skript und eine fehlerhafte needs-Referenz zeigen](/blog/common-gitlab-ci-mistakes-diagram.svg)

Die andere Hälfte dieser Kategorie ist Logik, und sie ist schwerer zu erkennen, weil das YAML gültig ist. Eine Rule, deren `if:` auf eine Variable verweist, die auf dem Branch, der dich interessiert, leer ist, greift stillschweigend nie, und der Job läuft nie. Eine Rule ohne Bedingung greift immer. Und `rules:` lässt sich im selben Job nicht mit den veralteten Schlüsselwörtern `only:`/`except:` kombinieren — GitLab meldet einen Fehler, wenn du beide verwendest. `only`/`except` funktionieren weiterhin, werden aber nicht mehr aktiv weiterentwickelt, daher sollten sich neue Pipelines auf `rules` festlegen. Schreibe `rules` als Liste, wobei jeder Eintrag seine Bedingung und sein `when` trägt:

```yaml
deploy:
  stage: deploy
  rules:
    - if: '$CI_COMMIT_TAG'
      when: manual
  script: ./deploy.sh
```

Wenn dein Fehler eine Umgebungsvariable ist, die leer ist, wo du einen Wert erwartet hast, ist das eine andere Klasse von Problem — der [Env Example Checker](/env-example-checker) fängt die Abweichung zwischen `.env` und `.env.example` ab, die überhaupt erst dazu führt, dass eine Variable nicht definiert bleibt.

## 5. extends auf ein Template, das nicht existiert, oder ein zirkuläres extends

```yaml
.base:
  image: golang:1.22
  script: make

lint:
  extends: .bse        # typo — .bse, not .base
  script: make lint
```

`extends:` ist GitLabs DRY-Mechanismus: Ein Job zieht die Schlüssel eines anderen Jobs oder versteckten Templates herein und überschreibt, was er braucht. Der häufigste Fehlschlag ist genau der oben — ein Tippfehler oder eine Umbenennung, sodass `extends` auf ein Template zeigt, das nicht in der Datei steht. GitLab kann `.bse` nicht auflösen, und die Job-Konfiguration ist ungültig.

Die heimtückischere Variante ist ein zirkuläres `extends` — `a` extends `b`, `b` extends `a` —, das keinen Basisfall zum Auflösen hat und abgelehnt wird. Halte die Kette auf ein echtes, terminales Template gerichtet:

```yaml
.base:
  image: golang:1.22
  script: make

lint:
  extends: .base
  script: make lint
```

`extends` kann auch eine Liste von Templates aufnehmen, und jeder Name in dieser Liste muss sich auflösen lassen. Ein einziger fehlerhafter Eintrag bricht den gesamten Job.

## 6. YAML-Anchor und versteckte (mit Punkt beginnende) Jobs, die schiefgehen

```yaml
.deploy_template: &deploy
  stage: deploy
  script:
    - ./deploy.sh

deploy_prod:
  <<: *deploy
  environment: production
  # inherits stage + script from the anchor
```

GitLab unterstützt sowohl YAML-Anchor (`&name` / `*name` mit dem Merge-Key `<<:`) als auch sein eigenes `extends:`. Beide lösen dasselbe Problem, und Leute vermischen sie — und genau da fangen die Probleme an. Das obige Muster ist korrekt: Ein mit Punkt beginnender Schlüssel ist ein *versteckter* Job — GitLab führt ihn nicht als Job aus, er existiert nur, um wiederverwendet zu werden. Ihn mit `&deploy` zu ankern und mit `<<: *deploy` in `deploy_prod` zu mergen, funktioniert.

Was schiefgeht:

- **Den Punkt vergessen.** Wenn dein Template `deploy_template:` heißt, ohne den führenden Punkt, behandelt GitLab es als echten Job — und ein echter Job ohne Skript (nur ein Anchor-Ziel) löst den No-Script-Fehler aus Fehler zwei aus.
- **Anchor überschreiten keine Dateigrenzen.** Ein YAML-Anchor ist lokal zu einem Dokument. Wenn du eine andere Datei mit `include:` einbindest und versuchst, einen dort definierten Anchor zu referenzieren, lässt er sich nicht auflösen. `extends:` ist die dateiübergreifend sichere Wahl; greife dazu, wenn die Wiederverwendung über Includes hinausreicht.
- **Ein Merge-Key lässt sich nicht so teilweise überschreiben, wie du denkst.** `<<:` führt einen flachen Merge durch, sodass das erneute Deklarieren eines verschachtelten Schlüssels den gesamten Teilbaum ersetzt, statt in ihn hineinzumergen.

Im Zweifel bevorzuge `extends:` für die Wiederverwendung von Jobs und behalte Anchor für kleine, lokale Skalar-/Listenfragmente. Und gib einem wiederverwendbaren Template immer den führenden Punkt, damit GitLab weiß, dass es nicht laufen soll:

```yaml
.deploy_template:
  stage: deploy
  script:
    - ./deploy.sh

deploy_prod:
  extends: .deploy_template
  environment: production
```

## 7. include, das einen 404 liefert oder auf die falsche Datei/Ref zeigt

```yaml
include:
  - project: 'platform/ci-templates'
    ref: main
    file: '/templates/deploy.yml'   # path or ref may be wrong
```

`include:` zieht Konfiguration aus einer anderen Quelle — einer lokalen Datei, einer Remote-URL, einem Template oder einem anderen Projekt. Wenn der Pfad, das `ref` oder das Projekt falsch ist, kann GitLab es nicht abrufen, und die gesamte Pipeline lässt sich nicht kompilieren, oft mit einem schroffen `Project not found or access denied` oder einem 404 auf die Datei. Die üblichen Ursachen sind ein Fehler beim führenden Slash im Pfad (lokale `include`-Pfade sind relativ zum Repo-Root und brauchen den Slash; ein `file:` aus einem Projekt will ebenfalls den absoluten Repo-Pfad), ein `ref`, das auf einen nicht mehr existierenden Branch oder Tag zeigt, oder eine umbenannte Template-Datei.

Mache den Pfad absolut vom Root aus, pinne ein `ref`, das existiert, und überprüfe den Projektpfad doppelt:

```yaml
include:
  - project: 'platform/ci-templates'
    ref: v2.3.0          # a tag that exists
    file: '/templates/deploy.yml'
  - local: '/.ci/test.yml'
```

Ein Vorbehalt, den man kennen sollte: Das Auflösen von `include:` erfordert, die referenzierten Dateien tatsächlich abzurufen, was ein rein clientseitiger Checker nicht kann. Ein lokaler Linter validiert die *Struktur* deines `include`-Blocks; für die endgültige Aussage, ob sich eine Remote-Datei auflösen lässt, ist GitLabs eigenes CI Lint (das Includes und Projektvariablen abruft) die letzte Absicherung.

## Alle auf einmal abfangen

Sechs dieser sieben Fehler sind strukturell — sie stecken darin, wie Jobs, Stages und Referenzen zusammenpassen, nicht darin, ob sich das YAML parsen lässt. Genau das ist die Lücke, die ein reiner Syntax-Linter übersieht: Eine `.gitlab-ci.yml` kann völlig gültiges YAML sein und trotzdem eine Pipeline, deren Start GitLab verweigert.

Der [GitLab CI Validator](/gitlab-ci-validator) führt diese Prüfungen in deinem Browser aus. Füge eine `.gitlab-ci.yml` ein, und er parst das YAML und markiert dann die oben genannten strukturellen Probleme — eine nicht definierte Stage, einen Job ohne `script`/`run`/`trigger`/`extends`, `needs`/`dependencies`/`extends`-Referenzen, die auf nicht existierende Jobs zeigen, ein ungültiges `when:`, ein `rules:`, das keine Liste ist, veraltetes `only`/`except` sowie fehlerhafte `image`/`services`-Formen — jeweils mit der Zeile und einer konkreten Lösung. Es wird nichts hochgeladen; die gesamte Prüfung läuft clientseitig, sodass du sie gegen private Pipelines und proprietäre Runner-Konfigurationen laufen lassen kannst, ohne irgendetwas irgendwohin zu senden.

Wenn deine Pipelines auch auf GitHub laufen, gilt die gleiche Idee „vor dem Push" auch für Workflows — unsere Durchsprache der [GitHub-Actions-Sicherheitsfehlkonfigurationen](/blog/github-actions-security-misconfigurations) deckt die GitHub-seitigen Entsprechungen ab, von zu weit gefassten Token-Berechtigungen bis zu ungepinnten Drittanbieter-Actions.

Eine rote Pipeline, die nie gelaufen ist, ist der billigste Fehlschlag, den es zu verhindern gibt. Fang die strukturellen Fehler vor dem Commit ab, und das einzige Rot, das du siehst, ist ein Test, der wirklich fehlgeschlagen ist.
