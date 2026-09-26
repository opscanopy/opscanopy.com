---
title: "Unable to get local issuer certificate: Ursachen und Fixes"
description: "Warum curl, git, npm und pip unable to get local issuer certificate melden, welchen Trust Store jeder liest und welche Fixes eine CA ergänzen statt ersetzen."
pubDate: 2026-09-26
tags: ["security", "tls", "certificates", "debugging"]
lang: de
translationOf: "unable-to-get-local-issuer-certificate"
relatedTool:
  name: "Certificate Decoder"
  href: "/certificate-decoder"
---

![Vier Kommandozeilen-Clients – curl, git, npm und pip – prüfen ein Serverzertifikat je gegen ihren eigenen Trust Store, und in einem davon fehlt der Aussteller](/blog/unable-to-get-local-issuer-certificate-hero.svg)
<!-- keywords: primary: unable to get local issuer certificate (>1000, KD Medium) | title phrase: ssl certificate problem: unable to get local issuer certificate (>100, Easy) | secondaries: curl unable to get local issuer certificate, git ssl certificate problem unable to get local issuer certificate (Easy), npm unable to get local issuer certificate (Easy), pip unable to get local issuer certificate (Easy), curl: (60) ssl certificate problem | source: ahrefs free (2026-09-26) -->
<!-- insight: the string means different things per client: curl/git/pip print it for a missing intermediate AND an untrusted root, Node/npm only when the chain arrived and the root is missing from Node's bundled store (proxy/private CA); most usual fixes (--cacert, http.sslCAInfo, npm cafile) replace the trust store, NODE_EXTRA_CA_CERTS appends, and pip --cert adds only under truststore (pip 24.2+, Python 3.10+) | serp-checked: 2026-09-26 -->

Erster Morgen im neuen Job, du klonst ein Repository, und der Befehl bleibt schon beim Handshake hängen:

```text
curl: (60) SSL certificate problem: unable to get local issuer certificate
More details here: https://curl.se/docs/sslcerts.html
```

Danach scheitern auch `git clone`, `npm install` und `pip install`. Im Browser lädt die Seite trotzdem. „Unable to get local issuer certificate" ist ein einziger OpenSSL-Fehler, aber jeder Client prüft ihn gegen einen anderen Trust Store – und genau deshalb hilft derselbe Fix beim einen Tool und beim nächsten nicht.

> **TL;DR**
>
> - Der Fehler ist OpenSSLs Code 20: Die Kette endet an einem Zertifikat, dessen Aussteller nicht im Trust Store *dieses Clients* liegt.
> - Führe `openssl s_client -showcerts` gegen den Host aus und lies die `i:`-Zeilen. Nur ein Zertifikat: Es fehlt ein Intermediate. Ein Aussteller deiner Firma oder eines Security-Anbieters: ein TLS-Inspection-Proxy.
> - curl, git, Node/npm und pip lesen jeweils einen anderen Store. Eine CA an einer Stelle zu installieren, repariert deshalb selten alle vier.
> - `--cacert`, `http.sslCAInfo` und npms `cafile` **ersetzen** den Store. `NODE_EXTRA_CA_CERTS` ergänzt ihn.

## Was bedeutet „unable to get local issuer certificate"?

Der Server schickt ein Leaf-Zertifikat und, wenn er gut konfiguriert ist, die Intermediates dazu. Dein Client baut vom Leaf aus eine Kette nach oben und braucht an ihrer Spitze eine Root, die er bereits lokal vorhält. OpenSSL wirft Fehler 20, `X509_V_ERR_UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, wenn das oberste Zertifikat nicht selbstsigniert ist und im lokalen Store kein Aussteller dafür existiert.

Das deckt zwei verschiedene Situationen ab. Hat der Server nur das Leaf geschickt, endet die Kette bei Tiefe 0, weil das Intermediate fehlt. Sind Leaf und Intermediate angekommen, aber die Root liegt nicht in deinem Store, endet die Kette bei Tiefe 1 oder 2. Das ist der Fall mit privater CA oder Proxy.

Die Nachbarn in OpenSSLs [x509_txt.c](https://github.com/openssl/openssl/blob/master/crypto/x509/x509_txt.c) solltest du wiedererkennen:

```text
18  self-signed certificate
19  self-signed certificate in certificate chain
20  unable to get local issuer certificate
21  unable to verify the first certificate
```

Ein Proxy, der seine eigene Root gleich mitschickt, erzeugt 19 statt 20. Der Mechanismus hinter allen vieren ist der Kettenaufbau, den [x509: certificate signed by unknown authority](/blog/x509-certificate-signed-by-unknown-authority/) erklärt – das ist Gos Formulierung für denselben Fehler.

## Warum scheitert dieselbe URL in einem Client und klappt im anderen?

curl, git und Python brechen unter Linux oder macOS beim ersten Verifizierungsfehler ab, ein Server, der nur das Leaf schickt, liefert ihnen also Code 20. `openssl s_client` macht weiter: Gegen `incomplete-chain.badssl.com` gibt es `num=20` aus, dann `num=21`, und endet mit `Verify return code: 21 (unable to verify the first certificate)`.

Node meldet stattdessen den *letzten* Fehler. Ein Server ohne Intermediate taucht in Node 24.16.0 deshalb als `unable to verify the first certificate` (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`) auf, und Node schlägt selbst vor, `--use-system-ca` zu probieren, falls die Root-CA lokal installiert ist. Wenn npm oder Node `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` ausgibt, sind die Intermediates angekommen und nur die Root fehlt in Nodes Store – die typische Signatur eines Proxys oder einer privaten CA.

Windows tickt noch einmal anders. Das mitgelieferte curl 8.4.0 von Git for Windows und die curl.exe aus System32 nutzen beide Schannel, und beide lieferten für dieselbe unvollständige Kette 200, weil Schannel fehlende Intermediates nachlädt und den Windows-Store liest. Auch das Python 3.13 von python.org kam unter Windows durch. Scheitern tut git selbst, das Git for Windows auf `http.sslBackend=openssl` setzt, dazu WSL und Container.

| Was du siehst | Wo | Wahrscheinlichste Ursache |
|---|---|---|
| Fehler 20, Browser okay, `s_client` zeigt ein Zertifikat | curl, git, pip | [Dem Server fehlt sein Intermediate](#ursache-2-fehlt-dem-server-sein-intermediate) |
| Jeder HTTPS-Host scheitert, nur im Büronetz oder VPN | jeder Client | [TLS-Inspection-Proxy](#ursache-1-signiert-ein-tls-inspection-proxy-deinen-traffic-neu) |
| `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` | npm, Node | Proxy oder private CA |
| `unable to verify the first certificate` | npm, Node | Dem Server fehlt sein Intermediate |
| Klappt mit Windows-/Schannel-curl, scheitert in git, WSL oder einem Container | Windows | Schannel hat die Kette repariert oder vertraut dem Windows-Store |
| Scheitert nur in `docker build` oder einem Container | Image | [Dem Trust Store des Images fehlt die CA](#ursache-3-warum-scheitert-es-nur-in-einem-docker-image) |

## Welchen Trust Store liest welcher Client?

Genau das überspringen die meisten Fix-Listen. Es gibt nicht den einen „System-Trust-Store" für alle Tools: Jeder Client hat seinen eigenen Default und seinen eigenen Override, jeweils mit anderer Semantik.

![Welchen Trust Store jeder Client liest: curl und git lesen eine PEM-Bundle-Datei, Node und npm eine in Node einkompilierte Mozilla-Liste, pip certifi plus den OS-Store, Schannel-Clients den Windows-Zertifikatspeicher](/blog/unable-to-get-local-issuer-certificate-diagram.svg)

| Client | Standard-Store | Override und was er bewirkt |
|---|---|---|
| curl (OpenSSL-Build) | Beim Build festgelegte CA-Bundle-Datei | `--cacert`, `CURL_CA_BUNDLE`: ersetzen |
| git, OpenSSL-Backend | Das mit Git ausgelieferte Bundle oder das des OS | `http.sslCAInfo`, `GIT_SSL_CAINFO`: ersetzen |
| Node, npm | Mozilla-CA-Liste, fixiert beim Release von Node | `NODE_EXTRA_CA_CERTS`: ergänzt. npm `cafile`: ersetzt |
| pip 24.2+ auf Python 3.10+ | certifi plus OS-Store | `--cert`, `PIP_CERT`: fügen ein Bundle hinzu |
| requests | certifi | `REQUESTS_CA_BUNDLE`: ersetzt |
| curl.exe, git mit Schannel | Windows-Zertifikatspeicher | Verwaltet von Windows oder per Gruppenrichtlinie |

Node liest den OS-Store standardmäßig nicht ([Node-CLI-Doku](https://nodejs.org/api/cli.html#node_extra_ca_certsfile)). Eine Firmen-CA in Windows, macOS oder Debian zu installieren, repariert npm also nicht. `--use-system-ca` (v23.8.0 und v22.15.0, unter Linux ab v23.9.0) und `NODE_USE_SYSTEM_CA=1` (v24.6.0 und v22.19.0) ändern das. Bei Python übergibt `requests` den Pfad von certifi explizit, `SSL_CERT_FILE` kommt dort also nicht an.

pip verhält sich anders: Unter truststore fügt `--cert` hinzu. pip 26.0.1 auf Python 3.13 erreichte PyPI noch, obwohl `--cert` auf eine einzelne, völlig fremde Root zeigte; mit `--use-deprecated=legacy-certs` scheiterte derselbe Befehl mit genau diesem Fehler.

> **Achtung:** Ein ersetzender Override, der auf eine Datei mit nur deiner Firmen-CA zeigt, repariert den Host hinter dem Proxy und bricht jeden öffentlichen. Mit `GIT_SSL_CAINFO` auf einer Datei mit nur einer Root scheitert `git ls-remote https://github.com/git/git.git` mit genau diesem Fehler. Lass ersetzende Optionen auf ein vollständiges Bundle zeigen, das zusätzlich deine CA enthält.

## Wie findest du heraus, welche Ursache vorliegt?

Frag den Server, was er schickt – und zwar mit dem Host, den dein Client aufgerufen hat. Lass `-servername` drin, damit SNI das richtige Zertifikat auswählt:

```bash
openssl s_client -connect registry.npmjs.org:443 -servername registry.npmjs.org -showcerts </dev/null
```

Lies die nummerierten Paare aus `s:` (Subject) und `i:` (Issuer):

- **Ein Zertifikat, öffentlicher Aussteller, `depth=0` in der Fehlerzeile:** Auf dem Server fehlt ein Intermediate.
- **Oberster Aussteller ist dein Arbeitgeber oder ein Security-Anbieter wie Zscaler:** ein TLS-Inspection-Proxy, selbst wenn nur das Leaf angekommen ist.

Wenn du die Kette lesen willst, ohne auf PEM-Blöcke zu starren, füg das komplette Transkript in den [Certificate Decoder](/de/certificate-decoder/) ein; den Text rund um die Zertifikate ignoriert er.

Bei einem Mitschnitt von `incomplete-chain.badssl.com`, der nur das Leaf enthält, meldet er einen `missing intermediate`-Fehler und benennt, was fehlt: `The chain is missing the intermediate that issued *.badssl.com: "C=US, O=Let's Encrypt, CN=YR2".` Laut seiner Meldung scheitern Runtimes mit „unable to get local issuer certificate". Node ist die Ausnahme aus dem Abschnitt oben.

Die ehrliche Grenze: Den Trust Store deines Clients kann der Decoder nicht sehen. Schickt der Proxy sein Intermediate mit, ist die Kette in sich gültig, und der Decoder meldet `chain order OK · 1 signature verified`, Root nicht enthalten. Ein Proxy, der nur das Leaf schickt, bekommt `missing intermediate` – aber ein Firmen-Aussteller bedeutet trotzdem Proxy, nicht Server-Bug. So oder so: Lies den Namen des Ausstellers.

## Was sind die Ursachen, nach Häufigkeit sortiert?

Drei Ursachen, angefangen mit der, die in Firmennetzen am häufigsten ist. Zu jeder gibt es ein Erkennungsmerkmal, einen Fix und einen Check.

### Ursache 1: Signiert ein TLS-Inspection-Proxy deinen Traffic neu?

In Firmennetzen ist das der übliche Schuldige, und es war auch der erste Verdacht des npm-CLI-Teams in [npm/cli#7326](https://github.com/npm/cli/issues/7326): „This is usually because of a proxy you are in that is not providing valid ssl certificates." Der Proxy terminiert TLS und signiert inspizierte Sites mit seiner eigenen CA neu. Dein Browser vertraut dieser CA per IT-Richtlinie, deine Kommandozeilen-Tools nicht.

**Erkennungsmerkmal:** Jeder öffentliche Host scheitert, der oberste Aussteller in `s_client` ist eine Firmen- oder Anbieter-CA, und npm meldet `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`:

```text
npm error code UNABLE_TO_GET_ISSUER_CERT_LOCALLY
npm error errno UNABLE_TO_GET_ISSUER_CERT_LOCALLY
npm error request to https://registry.npmjs.org/serve failed, reason: unable to get local issuer certificate
```

pip verpackt denselben OpenSSL-Text; die Zeilennummer in `_ssl.c` hängt vom Python-Build ab:

```text
[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: unable to get local issuer certificate (_ssl.c:1028)
```

**Fix:** Hol dir das Root-Zertifikat des Proxys von der IT (als PEM), installiere es einmal und gib dann jedem Client eine Option, die die öffentlichen Roots behält:

```bash
# Debian/Ubuntu/WSL: add the root to the OS bundle (.crt extension required)
sudo cp corp-root.pem /usr/local/share/ca-certificates/corp-root.crt
sudo update-ca-certificates

# curl and git: point at the full bundle, which now includes the corporate root
curl --cacert /etc/ssl/certs/ca-certificates.crt https://registry.npmjs.org/
git config --global http.sslCAInfo /etc/ssl/certs/ca-certificates.crt

# Node and npm: append to Node's own list instead of replacing it
export NODE_EXTRA_CA_CERTS="$HOME/corp-root.pem"

# pip and requests
export PIP_CERT=/etc/ssl/certs/ca-certificates.crt
export REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
```

Unter Git for Windows sorgt `git config --global http.sslBackend schannel` dafür, dass git den Windows-Store nutzt, den die IT oft schon befüllt hat. pip ab 24.2 auf Python 3.10+ liest den OS-Store ebenfalls, zusätzlich zu certifi ([pip-Doku](https://pip.pypa.io/en/stable/topics/https-certificates/)).

> **Wichtig:** `NODE_EXTRA_CA_CERTS` wird nur beim Prozessstart gelesen, und Node ignoriert die Variable, wenn explizit ein `ca` gesetzt ist. npms `cafile` wird genau zu dieser `ca`-Option – setzt du beides, fallen die zusätzlichen Zertifikate stillschweigend weg. Nimm lieber `NODE_EXTRA_CA_CERTS`.

**Check:** `openssl s_client -connect registry.npmjs.org:443 -servername registry.npmjs.org -CAfile /etc/ssl/certs/ca-certificates.crt </dev/null` sollte mit `Verify return code: 0 (ok)` enden. Danach führst du den ursprünglichen Befehl erneut aus. Python 3.13 aktiviert `VERIFY_X509_STRICT`; eine alte, selbst gebaute Proxy-CA kann dort also auch dann noch scheitern, wenn ihr vertraut wird – nur mit einem anderen Fehler.

### Ursache 2: Fehlt dem Server sein Intermediate?

**Erkennungsmerkmal:** `s_client` zeigt ein Zertifikat, der Fehler steht bei `depth=0`, der Browser lädt die Seite, und Node meldet `unable to verify the first certificate`. Bei git sieht das so aus:

```text
fatal: unable to access 'https://incomplete-chain.badssl.com/x.git/': SSL certificate problem: unable to get local issuer certificate
```

**Fix:** auf dem Server. Die Zertifikatsdatei muss das Leaf und danach jedes Intermediate enthalten, bei Let's Encrypt also `fullchain.pem`, nicht `cert.pem`.

Die [erste Ursache im x509-Artikel](/blog/x509-certificate-signed-by-unknown-authority/#1-the-server-is-missing-its-intermediate) liefert die passenden nginx-Zeilen. Gehört dir der Server nicht, schick dem Betreiber die `s_client`-Ausgabe. Das Intermediate in dein eigenes Bundle zu packen, versteckt nur einen Bug, über den jeder andere OpenSSL-Client stolpern wird.

**Check:** Führ `s_client` erneut aus; du solltest mindestens zwei Zertifikate und `Verify return code: 0 (ok)` sehen.

> **Tipp:** Für einen internen Git-Server, der von einer privaten CA signiert ist, beschränkst du die Option auf diesen Host: `git config --global http.https://git.corp.example/.sslCAInfo ~/corp-ca-bundle.pem`. Öffentliche Remotes nutzen weiter das Standard-Bundle, dort ist eine Datei mit nur einer Root also unbedenklich.

### Ursache 3: Warum scheitert es nur in einem Docker-Image?

Ein Container bringt seinen eigenen Trust Store mit, und die Firmen-CA des Hosts wandert nicht mit hinein. In `docker build` scheitern npm und pip am selben Proxy, dem dein Laptop längst vertraut. Hat das Image überhaupt kein Bundle, fang mit [dem Container-Abschnitt im x509-Artikel](/blog/x509-certificate-signed-by-unknown-authority/#2-your-container-has-no-ca-bundle-at-all) an.

**Erkennungsmerkmal:** Der Befehl klappt auf dem Host und scheitert in einem `RUN`-Schritt oder in einem laufenden Container. Wie du herausliest, welcher `RUN` gescheitert ist, steht in [docker build "failed to solve"](/blog/docker-build-failed-to-solve-exit-code-1/).

**Fix:** Füg die Root mit einem `.crt`-Namen hinzu (`update-ca-certificates` überspringt `.pem` stillschweigend, siehe die [Debian-Manpage](https://manpages.debian.org/testing/ca-certificates/update-ca-certificates.8.en.html)) und sag Node und requests dann, wo das neu erzeugte Bundle liegt:

```dockerfile
COPY corp-root.pem /usr/local/share/ca-certificates/corp-root.crt
RUN update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
ENV REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
```

`update-ca-certificates` allein hilft Node nicht, denn Node behält seine einkompilierte Liste. Auf RHEL- oder UBI-Images kopierst du die Root nach `/etc/pki/ca-trust/source/anchors/` und führst `update-ca-trust extract` aus.

**Check:** `docker run --rm <image> ls /etc/ssl/certs/ca-certificates.crt`, danach den fehlgeschlagenen Schritt erneut ausführen.

## Warum sind -k, GIT_SSL_NO_VERIFY oder strict-ssl=false kein Fix?

Jeder Client hat einen Ausschalter: `curl -k`, `GIT_SSL_NO_VERIFY=true`, `npm config set strict-ssl false`, `NODE_TLS_REJECT_UNAUTHORIZED=0` und pips `--trusted-host`. Sie lassen den Fehler verschwinden, indem sie die Prüfung entfernen, die ihn ausgelöst hat – für jeden Host, den der Befehl anfasst.

Hinter einem TLS-Inspection-Proxy ist genau diese Prüfung das Einzige, was deinen Proxy von jedem anderen in derselben Position unterscheidet. Ist sie aus, akzeptiert eine Installation jedes Zertifikat, das ihr vorgelegt wird. [curls eigene Empfehlung](https://curl.se/docs/sslcerts.html) zu `--insecure` lautet, die Verifizierung in Produktion niemals zu überspringen.

Der echte Fix ist eine CA-Datei und eine Variable. Behandle `strict-ssl=false` in einer geteilten `.npmrc` oder einem CI-Template als Befund, nicht als Einstellung zum Abschreiben.

## Was solltest du prüfen, und in welcher Reihenfolge?

1. Führ `openssl s_client -showcerts` gegen genau diesen Host aus und zähl die Zertifikate.
2. Ein Zertifikat und `depth=0`: Dem Server fehlt sein Intermediate. Behebe es dort.
3. Oberster Aussteller ist eine Firmen- oder Anbieter-CA: Hol dir diese Root als PEM von der IT.
4. Installiere sie im OS-Store, auf Debian-basierten Systemen mit `.crt`-Namen.
5. Gib jedem Client ein vollständiges Bundle oder eine ergänzende Option: `http.sslCAInfo`, `NODE_EXTRA_CA_CERTS`, `PIP_CERT`, `REQUESTS_CA_BUNDLE`.
6. Lass eine ersetzende Option nie auf eine Datei zeigen, die nur die Firmen-Root enthält.
7. Wiederhole in Images die Schritte 4 und 5 im Dockerfile.
8. Bestätige `Verify return code: 0 (ok)` und entferne dann jedes übrig gebliebene `-k` oder `strict-ssl=false`.

Wenn der nächste Handshake scheitert, füg die `s_client`-Ausgabe in den [Certificate Decoder](/de/certificate-decoder/) ein und lies den Aussteller, bevor du irgendeine Einstellung anfasst.

Welcher Client in deinem Stack hat als letzter von der Firmen-CA erfahren – und wie lange hat es gedauert, bis es jemandem aufgefallen ist?
