---
title: "Eine jwt.io-Alternative: JWTs dekodieren, ohne sie in fremde Seiten einzufügen"
description: "Eine jwt.io-Alternative gesucht? Was ein JWT-Decoder im Browser über deine Daten beweisen kann und was nicht, wie du es selbst prüfst, plus eine Offline-Option."
pubDate: 2026-09-21
updatedDate: 2026-10-04
tags: ["security", "jwt", "developer-experience"]
lang: de
translationOf: "jwt-io-alternative"
relatedTool:
  name: "JWT Decoder & Encoder"
  href: "/jwt-decoder"
---

![Ein JSON Web Token als drei verbundene Segmente — Header, Payload und Signatur — für ein JWT, das vollständig im Browser dekodiert wird](/blog/jwt-io-alternative-hero.svg)
<!-- keywords: jwt.io alternative | is jwt.io safe, jwt decoder offline, decode jwt online, secure jwt decoder, online jwt decoder risks | source: ahrefs free (2026-09-21); marketing brief, ahrefs unchecked (2026-10-04) -->

Ein Kollege wirft ein Token in einen Slack-Thread: „Warum gibt das 401?“ Du kopierst es, öffnest einen neuen Tab und bist schon halb dabei, es in jwt.io einzufügen, bevor dir auffällt, was du da in der Hand hast: ein gültiges Produktions-Access-Token.

Ist das in Ordnung? Vermutlich gehst du davon aus. In diesem Beitrag geht es darum, diese Annahme durch etwas zu ersetzen, das du tatsächlich prüfen kannst.

> **TL;DR**
>
> - Ein JWT zu dekodieren sind zwei base64url-Dekodierungen. Kein Schlüssel, kein Server und nichts, das hochgeladen werden müsste.
> - Ob eine *bestimmte Seite* dein Token irgendwohin schickt, prüfst du in DevTools → Network in etwa fünf Sekunden. Tu das, statt irgendeinem Anbieter zu vertrauen, uns eingeschlossen.
> - Air-gapped oder streng reglementierte Maschine? `cut | tr | base64 -d` dekodiert ein JWT, und `openssl dgst -hmac` berechnet eine HS256-Signatur neu, damit du sie vergleichen kannst — ganz ohne Browser.
> - Dekodieren ist nicht Verifizieren, und keines von beiden ersetzt die serverseitige Verifizierung gegen deine echten Signaturschlüssel.

## Ist jwt.io sicher?

Das ist die falsche Frage, oder zumindest eine unvollständige. „Sicher“ hängt davon ab, was eine bestimmte Seite mit deiner Eingabe macht, und das kannst du prüfen, statt es zu glauben.

Der entscheidende Mechanismus: Header und Payload in `header.payload.signature` sind base64url-kodiertes JSON. Es gibt keinen Verschlüsselungsschritt. Jedes Werkzeug, das sie in der JavaScript-Engine deines eigenen Browsers dekodiert, kann die ganze Arbeit ohne Netzwerkanfrage erledigen.

jwt.io ist ein seit Langem etablierter, weit verbreiteter Debugger, der von Auth0 gepflegt wird, und seine Dekodierung funktioniert genau so: in deinem Browser.

Aber „dekodiert lokal“ beschreibt einen Codepfad auf einer Seite. Es garantiert nichts über jede Anfrage, die der Origin dieser Seite stellt. Eine Seite kann lokal dekodieren und trotzdem Analytics, Werbung oder andere Drittanbieter-Skripte laden, die mit dem Dekodieren nichts zu tun haben.

## Die Fünf-Sekunden-Prüfung im Network-Tab

Der verlässliche Weg herauszufinden, was ein Decoder mit deinem Token macht (jwt.io, dieser hier oder eine Browser-Erweiterung), ist, ihm dabei zuzusehen:

1. Öffne die DevTools und wechsle zum Tab **Network**.
2. Leere die Anfrageliste. Lass den Filter auf **All** oder schließ zumindest **Fetch/XHR** und **WS** ein, damit auch WebSocket-Traffic auftaucht.
3. Füge dein Token ein.
4. Warte ein paar Sekunden, denn ein Beacon kann verzögert feuern. Dann schau, was gesendet wurde. Wenn keine ausgehende Anfrage das Token enthält oder beim Einfügen gar nichts feuert, wurde nichts gesendet.

Das überzeugt mehr als jede Behauptung in einem Blogbeitrag, diesen eingeschlossen.

Wir messen uns am selben Maßstab. Der [JWT-Decoder](/jwt-decoder/) auf dieser Website erledigt Dekodierung, Claim-Parsing und Signaturprüfung vollständig im Browser, mit JavaScript und der Web Crypto API.

Um genau zu sein, was diese Website sonst noch lädt: ihre eigenen statischen Assets, Google Analytics (das gtag.js-Skript plus Seitenaufruf- und Event-Pings) und Cloudflare Web Analytics. Keines davon überträgt das Token, das du eingibst.

Prüf das im Network-Tab. Verlass dich auch nicht auf unser Wort.

Ein Vorbehalt, der nichts mit dem Netzwerk zu tun hat: Wenn du im Decoder einen Snapshot speicherst, wird das Token (nie deine Schlüssel) im localStorage dieses Browsers abgelegt. Auf einem geteilten Rechner solltest du keine Snapshots von Produktions-Tokens anlegen.

## JWT online dekodieren: was tatsächlich passieren muss

Hier ein durchgerechnetes Beispiel mit dem altbekannten Beispiel-Token von jwt.io. Sein Header, sein Payload und sein Secret waren jahrelang das Standardbeispiel von jwt.io, und es ist zum üblichen Demo-Token für JWT-Werkzeuge geworden:

```text
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

Teile es an den beiden Punkten und dekodiere die ersten beiden Teile per base64url.

Der Header:

```json
{ "alg": "HS256", "typ": "JWT" }
```

Der Payload:

```json
{ "sub": "1234567890", "name": "John Doe", "iat": 1516239022 }
```

Das ist der gesamte „Dekodier“-Schritt. Du brauchst keinen Schlüssel, weil hier nichts verschlüsselt ist. `iat` ist ein NumericDate (Sekunden seit der Unix-Epoche), und 1516239022 ist der 18. Januar 2018.

*Verifizieren* ist eine andere Operation. Sie bestätigt, dass die Signatur von demjenigen erzeugt wurde, der das Secret besitzt, hier `your-256-bit-secret`. Du lieferst dieses HMAC-Secret, und das Werkzeug berechnet `HMACSHA256(base64url(header) + "." + base64url(payload), secret)` neu und vergleicht das Ergebnis mit dem dritten Segment.

> **Merke:** Ein Token kann sich sauber dekodieren lassen und trotzdem bei der Verifizierung durchfallen. Genau dafür hat es eine Signatur.

## Die Falle bei der Signaturprüfung: Risiken von Online-JWT-Decodern

Ein Token in einen Decoder einzufügen, legt ein Token offen. Es hat ein `exp` und funktioniert nicht mehr, sobald das abgelaufen ist. Das HMAC-Secret einzufügen, um dieses Token zu verifizieren, legt etwas Schlimmeres offen: den Schlüssel, der *jedes* Token signiert, das dein Service ausstellt.

Bei HS256 signiert und verifiziert dasselbe Secret. Wer es besitzt, kann für jeden Nutzer und mit beliebigen Claims ein Token erzeugen, das dein Backend als echt akzeptiert. Es bleibt gültig, bis du es rotierst, und eine Rotation meldet in der Regel alle Nutzer ab. Eine Decoder-Seite, die Eingaben an einen Server schickt, ist für ein Token also ein Ärgernis und für ein Secret ein Incident.

Ein sicherer Arbeitsablauf mit JWT-Decodern hält das Secret von jedem serverseitigen Werkzeug fern:

- **HS256 mit einem Produktions-Secret:** offline mit `openssl` verifizieren (siehe unten) oder in einem Browser-Werkzeug erst, nachdem die Prüfung im Network-Tab zeigt, dass nichts die Seite verlässt.
- **RS256, ES256 oder EdDSA:** Für die Verifizierung reicht der öffentliche Schlüssel oder das JWKS, und die sind per Design öffentlich. Sie irgendwo einzufügen, ist unproblematisch; der private Schlüssel verlässt nie deinen Issuer.
- **Eine Signaturabweichung debuggen:** Reproduziere sie mit einem Wegwerf-Secret in einer Testumgebung, nicht mit dem echten.

> **Achtung:** Wenn ein Produktions-HMAC-Secret bereits in einer Seite gelandet ist, die du nie geprüft hast, behandle es als kompromittiert. Rotiere es und nimm die erzwungene Neuanmeldung als Preis in Kauf.

## JWT-Decoder offline: ganz ohne Browser

Manchmal reicht „im Browser, per DevTools geprüft“ nicht. Vielleicht sitzt du an einer air-gapped Maschine. Vielleicht verlangt ein Security-Review null Netzwerkfähigkeit, Punkt, nicht nur keine beobachteten Anfragen. Dann hast du zwei ehrliche Optionen.

### Option 1: mit Werkzeugen dekodieren, denen du schon vertraust

base64url unterscheidet sich in zwei Punkten vom Standard-base64: Zwei Zeichen sind vertauscht (`-` statt `+`, `_` statt `/`), und das `=`-Padding fehlt. `cut`, `tr` und `base64` liefern dir das JSON also ganz ohne Browser:

```bash
TOKEN='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
echo "$TOKEN" | cut -d. -f2 | tr '_-' '/+' | base64 -d 2>/dev/null
# {"sub":"1234567890","name":"John Doe","iat":1516239022}
```

> **Fallstrick:** `base64` erwartet eine mit `=` auf ein Vielfaches von 4 Zeichen aufgefüllte Eingabe. GNU `base64 -d` gibt diesen Payload trotzdem aus (es endet nur mit einem Exit-Code ungleich null), aber BSD/macOS ist weniger nachsichtig.

Wenn du dich darauf nicht verlassen willst, füllt diese Shell-Funktion vorher auf:

```bash
b64url() {
  local s
  s=$(printf '%s' "$1" | tr '_-' '/+')
  while [ $(( ${#s} % 4 )) -ne 0 ]; do s="$s="; done
  printf '%s' "$s" | base64 -d; echo
}

b64url "$(echo "$TOKEN" | cut -d. -f1)"   # {"alg":"HS256","typ":"JWT"}
b64url "$(echo "$TOKEN" | cut -d. -f2)"   # {"sub":"1234567890","name":"John Doe","iat":1516239022}
```

Für HS256 kannst du auch offline verifizieren. Berechne den HMAC über `header.payload` neu und vergleiche ihn mit dem dritten Segment:

```bash
printf '%s' "$(echo "$TOKEN" | cut -d. -f1-2)" \
  | openssl dgst -sha256 -hmac 'your-256-bit-secret' -binary \
  | base64 | tr '+/' '-_' | tr -d '='
# SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c   <- entspricht dem Signatursegment
```

Wenn du saubere Flag-Behandlung und eingebaute Verifizierung statt Shell-Einzeilern willst, gibt es dedizierte Offline-CLIs. `jwt-cli` (`mike-engel/jwt-cli` auf GitHub, in Rust geschrieben) wird häufig genannt.

### Option 2: ein statischer Decoder ohne Upload-Pfad

Ein einfaches Dekodieren ist nur base64url-Dekodierung in clientseitigem JS. Eine statische Website braucht dafür also kein Backend, und diese hat keins: Es gibt keinen eigenen Server, der dein Token empfangen könnte.

Das heißt nicht, dass eine Seite mit nichts sprechen *kann*. Die Content-Security-Policy dieser Website beschränkt ausgehende Verbindungen auf ihren eigenen Origin plus die Endpunkte von Google Analytics und Cloudflare Web Analytics; du kannst das in den Response-Headern nachlesen. Eine Policy grenzt ein, wohin Daten gehen könnten; sie beweist nicht, wohin sie gegangen sind. Die Prüfung bleibt der Network-Tab.

## Wann was

Sei ehrlich zu dir selbst, wofür jede Option gedacht ist:

| Option | Am besten für | Garantie |
|---|---|---|
| **jwt.io** | Nicht sensible Tokens: Tests, Tutorials, Nicht-Produktions-Tenants | Der Dekodierpfad ist clientseitiges JS |
| **Browser-Werkzeug + Network-Tab** | Echte Access- oder ID-Tokens | Du hast gesehen, dass nichts den Tab verlassen hat (bei diesem Besuch) |
| **CLI-Dekodierung** | Air-gapped oder Richtlinie ohne Netzwerk | Die stärkste, abgesehen von eigenem Code |

Der Browser-Weg bietet zusätzlich Claim-Beschriftungen, Ablaufprüfungen und Signaturverifizierung. Der CLI-Weg liefert rohes JSON und HMAC-Verifizierung, sonst nichts.

> **Wichtig:** Keine dieser Optionen validiert Autorisierung. Dekodieren, selbst mit Signaturprüfung, sagt dir, dass das Token wohlgeformt ist und optional, dass es von dem signiert wurde, der den Schlüssel besitzt, gegen den du geprüft hast. Es ersetzt nicht die serverseitige Verifizierung, bevor du in Produktion auf einen Claim hin handelst. Dein Backend muss diese Prüfung gegen deine tatsächlichen Signaturschlüssel durchführen, jedes Mal.

Willst du eine Ebene tiefer als JWT-spezifische Werkzeuge gehen, zur base64url-Mechanik selbst? Der [Base64 Encoder / Decoder](/base64-encoder-decoder/) verarbeitet beliebige base64- und base64url-Payloads, nicht nur JWTs.

## Das Wichtigste in Kürze

- Behandle „ist diese Seite sicher?“ als Frage, die du in den DevTools beantwortest, nicht über den Ruf.
- Leere den Network-Tab, füge das Token ein und prüfe, dass nichts es hinausträgt.
- Dekodieren ist nicht Verifizieren: Ein lesbarer Payload beweist nichts darüber, wer ihn signiert hat.
- Auf abgeschotteten Maschinen dekodiert `cut | tr | base64 -d`, und mit `openssl dgst -hmac` prüfst du eine HS256-Signatur.
- Verifiziere immer serverseitig gegen deine echten Schlüssel, bevor du einem Claim vertraust.

Wenn du den Browser-Weg mit eingebauter Verifizierung willst, erledigt der [JWT-Decoder](/jwt-decoder/) die ganze Arbeit: dekodieren, gegen ein Secret, PEM, JWK oder JWKS verifizieren, eigene Tokens signieren und Testschlüssel erzeugen, ohne dass etwas hochgeladen wird. Bestätige das in deinem eigenen Network-Tab, bevor du ihm etwas Echtes anvertraust.

Was ist eure Regel für Produktions-Tokens: jeder Decoder ist erlaubt, ein geprüftes internes Werkzeug oder nur die CLI? Und was hat euer Team zu dieser Entscheidung gebracht?
