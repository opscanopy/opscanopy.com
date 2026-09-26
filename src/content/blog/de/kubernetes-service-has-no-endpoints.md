---
title: "Kubernetes Service has no endpoints: den Selector-Bug finden"
description: "Dein Kubernetes Service hat keine Endpoints, oder das Deployment meldet selector does not match template labels? Ein Bug, zwei Symptome und der Weg zur Lösung."
pubDate: 2026-10-12
draft: true
tags: ["kubernetes", "containers", "debugging"]
lang: de
translationOf: "kubernetes-service-has-no-endpoints"
relatedTool:
  name: "Kubernetes Label Selector Tester"
  href: "/kubernetes-label-selector-tester"
---

![Ein Service-Selector im Abgleich mit Pod-Labels: Passende Pods landen im EndpointSlice und erhalten Traffic, ein falsches Label lässt den Service ohne Endpoints](/blog/kubernetes-service-has-no-endpoints-hero.svg)
<!-- keywords: primary: kubernetes service has no endpoints (<100, KD n/a) | secondaries: selector does not match template labels, kubernetes service no endpoints, endpoints none kubernetes, kubectl get pods label selector | source: ahrefs free (2026-09-26) -->
<!-- insight: not-Ready pods stay in the EndpointSlice with ready:false (only IP-less/terminal pods drop out); a zero-match Service still gets a placeholder slice showing <unset>, so the IP's location, not the slice's existence, tells selector bug from readiness | serp-checked: 2026-09-26 -->

Die Pods sind Running. Der Service existiert. Trotzdem hängt jede Anfrage an ihn oder wird abgewiesen, und kein Log verrät, warum. Du lässt dir den Service mit `describe` anzeigen und findest die eine Zeile, auf die es ankommt:

```text
Endpoints:                <none>
```

Bei aktuellem kubectl bleibt diese Zeile womöglich einfach leer statt `<none>` zu zeigen; das Problem ist dasselbe. Dein Kubernetes Service hat keine Endpoints, und keine Komponente meldet das als Fehler. Die laute Variante desselben Bugs bekommst du zu sehen, wenn du stattdessen das Deployment anwendest:

```text
The Deployment "checkout" is invalid: spec.template.metadata.labels: Invalid value: {"app":"check-out"}: `selector` does not match template `labels`
```

Zwei Fehler, ein Bug: ein Selector, der auf nichts passt.

> **TL;DR**
>
> - Ein Service wählt Pods über ihre Labels aus. Erfüllt kein Label-Set eines Pods jeden Schlüssel in `spec.selector`, hat der Service keine Endpoints, und niemand beschwert sich.
> - Verfolge es der Reihe nach: den Selector des Service, dann `kubectl get pods -l <selector>`, dann `kubectl get endpointslices -l kubernetes.io/service-name=<svc>`, dann die `ready`-Condition jedes Endpoints.
> - Nirgends eine Pod-IP heißt: Der Selector passt auf nichts (oder die Pods haben noch keine IP). Eine IP im Slice mit `ready: false` heißt: Readiness, nicht Labels.
> - Der Selector eines Deployments ist in `apps/v1` unveränderlich. Ihn zu ändern bedeutet löschen und neu anlegen, mit `--cascade=orphan`, falls die Pods weiterlaufen müssen.

## Was bedeutet es, wenn ein Kubernetes Service keine Endpoints hat?

Ein Service weiß nichts von Deployments. Er hält in `spec.selector` eine Label-Map, und der EndpointSlice-Controller listet die Pods im eigenen Namespace des Service auf, deren Labels jedes Paar dieser Map enthalten. Die IPs dieser Pods werden zu den Endpoints des Service.

![Der spec.selector des Service wird mit den Labels jedes Pods im selben Namespace verglichen; passende Pods mit IP landen in einem EndpointSlice, und die ready-Condition jedes Endpoints entscheidet, ob er Traffic erhält](/blog/kubernetes-service-has-no-endpoints-diagram.svg)

Ein Service-Selector kennt nur Gleichheit: [Die Labels-Dokumentation](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#service-and-replicationcontroller) sagt, dass nur gleichheitsbasierte Anforderungen unterstützt werden, und alle Paare werden mit UND verknüpft. Ein zusätzlicher Schlüssel, ein vertippter Wert oder ein falscher Namespace, und die Treffermenge ist leer.

Eine leere Treffermenge ist gültig. Der Controller schreibt trotzdem einen Platzhalter-EndpointSlice ohne Ports und ohne Endpoints, „es gibt einen Slice“ beweist also gar nichts. Das stille Symptom ist der ganze Fehlermodus, und genau deshalb dauert die Suche so lange. Der [Services-Abschnitt des Kubernetes-Guides](/learn/guides/kubernetes-for-devops/#services) erklärt das Objekt selbst, falls du den Hintergrund brauchst.

## Wie verfolgst du den Selector bis zu den Pods?

Geh die Kette Glied für Glied ab, und fang bei dem an, was der Service tatsächlich verlangt, nicht bei dem, was du glaubst, dass er verlangt:

```bash
kubectl get service checkout -n shop -o jsonpath='{.spec.selector}'
kubectl get pods -n shop -l app=checkout,tier=backend
kubectl get pods -n shop --show-labels
```

Der zweite Befehl nutzt den Selector des Service wörtlich, mit Kommas verbunden. Liefert er keine Pods, steckt der Bug in den Labels oder im Namespace, und du kannst aufhören, dir das Netzwerk anzusehen. Der dritte zeigt die Labels, die die Pods wirklich tragen, sodass du sie Schlüssel für Schlüssel vergleichen kannst.

Um beide Manifeste zu prüfen, bevor irgendetwas einen Cluster erreicht, füge den Service in das Selector-Feld des [Kubernetes Label Selector Tester](/de/kubernetes-label-selector-tester/) ein (Modus „selector YAML“) und das Deployment in `resources.yaml`.

Der Tester führt das Deployment und sein Pod-Template als getrennte Zeilen auf und benennt die Klausel, die scheitert: In der Zeile des Pod-Templates markiert er `tier=frontend` mit ✗ und der Begründung `label tier="backend" ≠ "frontend"`. Eine ehrliche Einschränkung: Er zeigt den Namespace jeder Zeile an, vergleicht ihn aber nie, sodass ein Service in `default` auf einen Pod in `shop` „passt“.

> **Achtung:** Lies die Zeile „Pod template“, nicht die Zählung in der Überschrift. Wurde der Service-Selector aus den `metadata.labels` des Deployments selbst kopiert und weichen diese von den Template-Labels ab, meldet der Tester „1 of 2 resources matches“, weil die Deployment-Zeile passt. Die Pod-Template-Zeile scheitert, und genau die wählt ein Service aus.

Das letzte Glied ist der EndpointSlice. Er ist die tatsächliche Ausgabe des Controllers und entscheidet damit jeden Streit. Frag ihn über das Label ab, das der Controller auf jeden Slice stempelt, so wie es die [debug-service-Anleitung](https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/#does-the-service-have-any-endpointslices) tut:

```bash
kubectl get endpointslices -n shop -l kubernetes.io/service-name=checkout
```

Bei einem Service, der auf nichts passt, bekommst du eine Zeile, den Platzhalter, und seine Spalte ENDPOINTS zeigt `<unset>` statt `<none>`. „No resources found“ wirst du nicht sehen.

`kubectl describe service` ist weniger direkt, als es aussieht. Seit kubectl v1.31 liest es EndpointSlices, und seit v1.32 lässt seine `Endpoints:`-Zeile Endpoints weg, die nicht ready sind. Ältere kubectl-Versionen zeigten bei einem leeren Endpoints-Objekt `<none>`; bei neueren bleibt die Zeile womöglich einfach leer.

Verzichte dafür auf `kubectl get endpoints`. Ein API-Server ab v1.33 antwortet zuerst mit einer Warnung, denn die v1-Endpoints-API ist [zugunsten von EndpointSlice als veraltet markiert](https://kubernetes.io/blog/2025/04/24/endpoints-deprecation/):

```text
Warning: v1 Endpoints is deprecated in v1.33+; use discovery.k8s.io/v1 EndpointSlice
```

## Ist der Pod im Slice, aber nicht Ready?

Hier liegen die meisten Checklisten falsch. Ein Pod, der eine IP hat, aber nicht Ready ist, verlässt den EndpointSlice nicht. Er bleibt mit `conditions.ready: false` aufgeführt, und Konsumenten wie kube-proxy routen nicht zu ihm. Die [Referenz zu den Conditions](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/#conditions) beschreibt `ready`, `serving` und `terminating`.

Pods, die Pending sind und noch keine IP haben, sowie Pods im Zustand Succeeded oder Failed fehlen ganz. Die Diagnose teilt sich also danach, wo die IP auftaucht:

| Was du siehst | Worauf es hinweist |
|---|---|
| Keine Pod-IP im Slice, keine Pods bei `get pods -l` | Selector oder Namespace passt nicht |
| Keine Pod-IP im Slice, Pods Pending ohne IP | Nicht eingeplant, oder die Pod-Sandbox ist noch nicht angelegt |
| IP im Slice, fehlt in `describe svc` | Readiness: `conditions.ready` prüfen |

Gib Adresse und ready-Condition jedes Endpoints direkt aus:

```bash
kubectl get endpointslices -n shop -l kubernetes.io/service-name=checkout \
  -o jsonpath='{range .items[*].endpoints[*]}{.addresses[0]}{" ready="}{.conditions.ready}{"\n"}{end}'
```

Stehen die IPs mit `ready=false` da, sind die Labels in Ordnung, und deine [Readiness-Probe](/learn/guides/kubernetes-for-devops/#health-probes) ist das, was du debuggen musst.

## Welche Selector-Fehler stecken dahinter, und wie behebst du jeden?

Prüfe sie in dieser Reihenfolge. Jeder hat ein Erkennungszeichen, eine Lösung und einen Weg, sie zu verifizieren.

**1. Tippfehler oder Drift im Label.** Erkennungszeichen: `get pods -l` liefert nichts, aber `--show-labels` zeigt einen Beinahe-Treffer, etwa `app=Checkout` gegenüber `app=checkout`. Bei Werten zählt Groß- und Kleinschreibung. Lösung: Korrigiere die Seite, die falsch ist, meist die zuletzt bearbeitete. Verifizieren: `get pods -l` listet die Pods.

**2. Selector aus den `metadata.labels` des Deployments kopiert.** Erkennungszeichen: Der Service-Selector passt auf die Labels des Deployment-Objekts, nicht auf die des Pod-Templates. Lösung: Kopiere aus `spec.template.metadata.labels`. Verifizieren: Die Pod-Template-Zeile im Tester besteht.

**3. Falscher Namespace.** Erkennungszeichen: Die Pods existieren, nur nicht im `metadata.namespace` des Service. Der Controller listet ausschließlich Pods im eigenen Namespace des Service. Lösung: Verschiebe eines der beiden. Verifizieren: `get pods -n <service-namespace> -l ...` liefert sie.

**4. Pods nicht Ready oder noch ohne IP.** Erkennungszeichen: IPs erscheinen mit `ready=false`, oder Pods sind Pending. Lösung: das Probe- oder Scheduling-Problem, nicht der Selector. Verifizieren: `ready=true` im Slice.

**5. Ein zusätzlicher Selector-Schlüssel.** Erkennungszeichen: Jeder Schlüssel passt bis auf einen, etwa `tier: frontend` gegenüber Pods mit dem Label `tier: backend`. Lösung: Entferne den Schlüssel oder ergänze das Label im Template. Verifizieren: `get pods -l` mit dem vollständigen Selector listet die Pods.

> **In der Praxis:** Die [debug-service-Anleitung](https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/) nennt genau diesen Bug als häufigen Fehler: einen Service, der `app=hostnames` auswählt, während das Deployment, so wie ältere `kubectl run`-Versionen es angelegt haben, `run=hostnames` angibt.

## Warum lehnt das Deployment seinen eigenen Selector ab?

Der laute Fehler ist derselbe Mismatch, nur eine Ebene früher erwischt. Der `spec.selector` eines Deployments muss zu seinen `spec.template.metadata.labels` passen, und der API-Server erzwingt das bei der Validierung, also scheitert `kubectl apply` unabhängig vom Client. In `apps/v1` wird der Selector nicht aus dem Template abgeleitet, Weglassen ist also kein Ausweg: `spec.selector` ist Pflicht.

Wie der fehlerhafte Wert ausgegeben wird, hängt von der Version des API-Servers ab. Ab v1.34 erscheint er als JSON, wie oben in der Einleitung. Ältere Server geben Go-Syntax aus:

```text
The Deployment "checkout" is invalid: spec.template.metadata.labels: Invalid value: map[string]string{"app":"check-out"}: `selector` does not match template `labels`
```

Zwei Nachbarn sind eigene Fehler. Ein leerer Selector ergibt `empty selector is invalid for deployment`, ein fehlender wird als Pflichtfeld bei `spec.selector` gemeldet. StatefulSets und DaemonSets geben dieselbe „does not match“-Meldung aus. Die Lösung ist immer, die Template-Labels zu einer Obermenge des Selectors zu machen; der [Deployments-Abschnitt des Guides](/learn/guides/kubernetes-for-devops/#replicasets-and-deployments) zeigt das passende Paar.

## Kannst du den Selector eines Deployments nachträglich ändern?

Nein. In `apps/v1` ist der Selector unveränderlich, und ein Update, das ihn ändert, scheitert mit `field is immutable`. Auf einem Server ab v1.34 lautet das:

```text
The Deployment "checkout" is invalid: spec.selector: Invalid value: {"matchLabels":{"app":"checkout","tier":"backend"}}: field is immutable
```

Die [Deployment-Dokumentation](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#label-selector-updates) stellt klar, dass `kubectl patch`, `kubectl edit`, `kubectl apply` und `helm upgrade` alle daran scheitern. Der Weg ist löschen und neu anlegen. Ein gelöschtes Deployment löscht standardmäßig seine Pods mit, und das bedeutet Downtime, also mach sie stattdessen zu Waisen:

```bash
kubectl delete deployment checkout -n shop --cascade=orphan
kubectl apply -f deployment.yaml
kubectl get replicasets -n shop
```

Das verwaiste ReplicaSet hält seine Pods am Laufen, während das neue Deployment ausgerollt wird. Sobald die neuen Pods Ready und im Slice sind, lösch jedes ReplicaSet, das keinem Deployment mehr gehört.

> **Tipp:** Ändere den Service-Selector zuletzt. Fügst du ihm einen Schlüssel hinzu, bevor die neuen Pods dieses Label tragen, passt der Service auf nichts, und seine Endpoints sind sofort leer.

## Bringt eine Korrektur von targetPort die Endpoints zurück?

Das ist die Lösung, die keine ist. Ein falscher numerischer `targetPort` leert die Endpoint-Liste nie: Der Controller übernimmt die Zahl und listet den Pod trotzdem. Der Traffic scheitert dann am Port, was von außen ähnlich aussieht, aber ein anderer Bug ist. Ihn zu ändern, füllt keinen leeren Slice.

Ein benannter `targetPort`, den der Pod nicht deklariert, ist subtiler. Der EndpointSlice listet die Pod-Adresse weiterhin, aber der Port fällt weg, sodass die Spalte PORTS `<unset>` zeigt. Der alte Endpoints-Controller geht weiter und lässt den Pod aus diesem Subset weg, sodass alles, was noch Endpoints liest, den Pod als fehlend anzeigt.

Pods neu zu starten oder den Service neu anzulegen, ändert an keinem der beiden Fälle etwas. Wolltest du einen benannten Port, prüfe, ob der Container einen Port mit genau diesem Namen deklariert, wie es die debug-service-Checkliste verlangt. Andernfalls lass `targetPort` in Ruhe und geh zurück zu den Labels.

## Was solltest du prüfen, wenn ein Kubernetes Service keine Endpoints hat?

Eine kurze Routine, die jede Ursache oben abdeckt, und den lauten Fehler gleich mit:

1. Gib den `spec.selector` des Service mit `-o jsonpath` aus und notier dir seinen Namespace.
2. Führe `kubectl get pods -n <namespace> -l <selector>` aus. Leer heißt Labels oder Namespace.
3. Vergleiche mit `kubectl get pods --show-labels`, Schlüssel für Schlüssel, inklusive Groß- und Kleinschreibung.
4. Stell sicher, dass der Selector aus `spec.template.metadata.labels` kopiert wurde, nicht aus den eigenen Labels des Deployments.
5. Frag `kubectl get endpointslices -l kubernetes.io/service-name=<svc>` ab. `<unset>`-Endpoints sind der Platzhalter, kein Ergebnis.
6. Sind IPs vorhanden, lies `conditions.ready`; `false` schickt dich zur Readiness-Probe.
7. Lässt sich ein Deployment nicht anwenden, bring seinen Selector mit den Template-Labels in Einklang. Muss der Selector selbst geändert werden, lösch mit `--cascade=orphan` und leg neu an.
8. Heb dir `targetPort` für den Schluss auf, und verdächtige ihn nur, wenn der Port fehlt, nicht der Endpoint.

Für Speicher- statt Selector-Probleme folgt der Schwesterbeitrag zu [OOMKilled und Exit-Code 137](/blog/kubernetes-oomkilled-exit-code-137/) derselben Routine: erst bestätigen, dann beheben.

Füge deinen Service und dein Deployment vor dem nächsten Apply in den [Kubernetes Label Selector Tester](/de/kubernetes-label-selector-tester/) ein, und lies die Pod-Template-Zeile.

Welches Label ist in deinem Cluster abgedriftet: ein umbenanntes `app` oder ein `tier`, von dem niemand mehr weiß, wer es hinzugefügt hat?
