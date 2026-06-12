---
title: "Schluss mit dem Ausliefern einer veralteten .env.example"
description: "Ihre .env.example ist Dokumentation, die stillschweigend verrottet. Hier erfahren Sie, warum Env-Drift Onboarding und Deployments zerstört, wie Sie fehlende und ungenutzte Schlüssel erkennen und wie Sie die Beispieldatei ehrlich halten."
pubDate: 2026-06-02
tags: ["configuration", "developer-experience", "twelve-factor"]
lang: de
translationOf: "env-example-drift"
---

Eine `.env.example` ist die eine Datei in Ihrem Repository, die niemand ausführt, niemand testet und der jeder vertraut. Sie ist der Vertrag, den eine neue Kollegin oder ein neuer Kollege am ersten Tag liest, um die einzige Frage zu beantworten, die zählt: Welche Umgebungsvariablen muss ich setzen, bevor das Ding hochfährt? Wenn diese Datei stimmt, ist das Onboarding ein fünfminütiges Kopieren und Ausfüllen. Wenn sie falsch ist, bekommen Sie die demoralisierendste Art von Fehler — die Anwendung stürzt beim Start mit `undefined is not a function` ab, oder schlimmer noch, sie läuft fröhlich weiter, während ein Feature stillschweigend deaktiviert ist, weil ein Flag standardmäßig auf „aus" stand.

Das Problem ist, dass `.env.example` Dokumentation ist, und Dokumentation driftet. Code, der `process.env.STRIPE_WEBHOOK_SECRET` liest, wird in einem Feature-Branch ausgeliefert. Die Beispieldatei bekommt den neuen Schlüssel nicht, weil das Hinzufügen kein Teil von „das Feature zum Laufen bringen" ist — es ist Teil von „nett zur nächsten Person sein", und dieser Schritt ist unsichtbar, bis jemand darüber stolpert. Multiplizieren Sie das über ein Jahr voller Merges, und die Beispieldatei wird zu einem Museum von Variablen, die Sie früher gebraucht haben, während die Hälfte derer fehlt, die Sie tatsächlich brauchen.

## Wie Drift wirklich entsteht

Drift ist nie ein einzelnes dramatisches Ereignis. Es ist die Anhäufung kleiner, nachvollziehbarer Auslassungen:

- Eine neue Integration fügt `SENTRY_DSN` und `SENTRY_ENVIRONMENT` hinzu. Die Autorin oder der Autor des PR hat sie in der lokalen `.env`, also funktioniert die Anwendung für sie — und die Beispieldatei erfährt nie davon.
- Ein Feature wird herausgerissen. Der Code, der `LEGACY_BILLING_URL` referenziert, wird gelöscht, aber der Schlüssel verbleibt für immer in der `.env.example`, sodass Neulinge pflichtbewusst einen Wert eintragen, der nichts bewirkt.
- Eine Variable wird im Code von `DB_URL` in `DATABASE_URL` umbenannt, aber das Beispiel bewirbt weiterhin den alten Namen. Jetzt ist die Datei aktiv irreführend.
- Ein Schlüssel wird nur in einem selten angefassten Worker gelesen, sodass er beim beiläufigen Testen nie auftaucht — bis dieser Worker in eine frische Umgebung deployt wird, in der kein Wert gesetzt ist.

Keines davon bringt Ihren Linter, Ihren Typprüfer oder Ihre Tests zum Stolpern. Die Beispieldatei ist nicht Teil des Build-Graphen, also sagt Ihnen nichts, dass sie nicht mehr synchron ist. Die einzige Rückkopplungsschleife ist ein Mensch, der sich die Finger verbrennt.

## Die zwei Fehlermodi

Es gibt genau zwei Möglichkeiten, wie die Beispieldatei falsch sein kann, und sie versagen in entgegengesetzte Richtungen:

**Fehlende Schlüssel** sind Variablen, die Ihr Code liest, die das Beispiel aber nicht erwähnt. Das sind die gefährlichen. Ein fehlender Schlüssel bedeutet, dass ein frischer Checkout in einen undefinierten Zustand hochfährt — ein Absturz, wenn Sie Glück haben, eine stille Fehlkonfiguration, wenn nicht.

**Ungenutzte Schlüssel** sind Variablen, die das Beispiel bewirbt, die aber von keinem Code mehr gelesen werden. Diese sind lediglich verschwenderisch: Sie machen die Datei länger, sie zwingen Leute dazu, Secrets bereitzustellen, die sie nicht brauchen, und sie untergraben das Vertrauen in die Datei als verlässliche Quelle. Wenn sich drei Schlüssel als tot herausstellen, warum sollten Sie den anderen zwanzig glauben?

Eine gesunde Beispieldatei hat keines von beidem. Jede Variable, die der Code liest, erscheint im Beispiel, und jede Variable im Beispiel wird tatsächlich irgendwo gelesen.

## Wie „eine Variable lesen" über verschiedene Sprachen hinweg aussieht

Drift zu erkennen bedeutet, zwei Dinge zu parsen: die Menge der Variablen, die Ihr Code referenziert, und die Menge der Schlüssel, die Ihr Beispiel deklariert. Die Referenzseite ist die kniffligere Hälfte, weil jedes Ökosystem sie anders schreibt:

```javascript
// Node.js — the classic
const key = process.env.STRIPE_SECRET_KEY;
const { DATABASE_URL, REDIS_URL } = process.env;

// Vite / browser builds
const api = import.meta.env.VITE_API_BASE;
```

```python
# Python — os.environ and os.getenv
import os
secret = os.environ["DJANGO_SECRET_KEY"]
debug = os.getenv("DEBUG", "false")
```

```go
// Go — os.Getenv and os.LookupEnv
addr := os.Getenv("LISTEN_ADDR")
token, ok := os.LookupEnv("GITHUB_TOKEN")
```

```bash
# Shell — direct expansion
: "${WEBHOOK_URL:?must be set}"
echo "$DEPLOY_ENV"
```

Die Beispielseite ist vergleichsweise einheitlich — eine Liste von `KEY=value`-Zeilen, oft mit Kommentaren und leeren Abschnitten:

```bash
# .env.example
# --- Core ---
DATABASE_URL=postgres://localhost:5432/app
REDIS_URL=redis://localhost:6379

# --- Payments ---
STRIPE_SECRET_KEY=
# STRIPE_WEBHOOK_SECRET is set in code but missing here ↓
```

Subtrahieren Sie die beiden Mengen voneinander, und der Drift fällt direkt heraus. Schlüssel, die im Code referenziert, aber im Beispiel nicht vorhanden sind, sind **fehlend**. Schlüssel, die im Beispiel vorhanden sind, aber nirgendwo referenziert werden, sind **ungenutzt**. Alles in der Schnittmenge ist in Ordnung.

## Warum ein schnelles Diff einem `grep` überlegen ist

Sie können sich das durchaus mit `grep -rhoE 'process\.env\.[A-Z_]+'` zusammenschustern, durch `sort -u` pipen und gegen `cut -d= -f1 .env.example` vergleichen. Leute tun das, und es funktioniert halbwegs. Das Problem sind die Randfälle, die eine einmalige Regex immer übersieht:

- Destrukturierender Zugriff (`const { FOO } = process.env`), den das naive Muster nicht erfasst.
- Auskommentierte Schlüssel im Beispiel, die nicht als „deklariert" zählen sollten.
- Werte in Anführungszeichen, `export`-Präfixe und Inline-Kommentare, die ein dummes `cut` aus dem Tritt bringen.
- Mehrere Frameworks in einem Repository (`process.env` und `import.meta.env` und `os.getenv`), die jeweils ein anderes Muster benötigen.

Bis Sie all das behandelt haben, ist Ihre „schnelle" Shell-Pipeline ein brüchiges Skript, das niemand pflegen möchte. Ein eigens dafür gebauter Checker behandelt die Zugriffsmuster und die Eigenheiten der Beispieldatei konsistent, und er tut das, ohne dass Sie Secrets in einen entfernten Dienst einfügen müssen.

## Die Datei ehrlich halten

Erkennung ist der erste Schritt; zu verhindern, dass der Drift zurückkommt, ist der zweite. Ein paar Gewohnheiten helfen:

- **Machen Sie das Beispiel zur verlässlichen Quelle.** Manche Teams laden `.env.example` beim Start in der Entwicklung und warnen bei jedem Schlüssel im Code, der dort nicht deklariert ist. Die Datei ist dann nicht mehr optional.
- **Prüfen Sie sie im Review.** Behandeln Sie ein neues `process.env.X` ohne passende Beispielzeile genauso, wie Sie eine neue öffentliche Funktion ohne Doc-Kommentar behandeln würden.
- **Räumen Sie beim Löschen auf.** Wenn Sie ein Feature entfernen, durchsuchen Sie das Beispiel auch nach dessen Schlüsseln. Tote Schlüssel bleiben leicht zurück.
- **Führen Sie das Diff aus, bevor Sie den PR öffnen.** Drift zu erkennen dauert Sekunden und erspart der nächsten Person einen ganzen Nachmittag.

## Fangen Sie es ab, bevor Sie committen

Der schnellste Weg, um zu wissen, ob Ihre Beispieldatei ehrlich ist, besteht darin, sie gegen Ihren tatsächlichen Code zu diffen. **Env Example Checker** macht genau das im Browser: Fügen Sie Ihren Quellcode und Ihre `.env.example` ein, und es meldet die Variablen, die Ihr Code verwendet, die im Beispiel aber fehlen, sowie die Schlüssel, die das Beispiel deklariert, die aber von nichts gelesen werden. Es läuft vollständig clientseitig — Ihr Code und Ihre Secrets verlassen die Seite nie — sodass Sie es ohne Bedenken auf einem privaten Repository ausführen können.

Geben Sie vor Ihrem nächsten Pull Request der nächsten Entwicklerin oder dem nächsten Entwickler eine `.env.example`, der sie oder er tatsächlich vertrauen kann.

[Prüfen Sie Ihre .env.example auf Drift →](/env-example-checker)
