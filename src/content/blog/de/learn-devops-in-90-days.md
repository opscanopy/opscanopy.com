---
title: "DevOps in 90 Tagen lernen: der kostenlose, Incident-first-Weg vom Entwickler zum DevOps-Engineer"
description: "Warum wir Mission: 90 Days DevOps gebaut haben – ein kostenloser Tag-für-Tag-Weg von Linux bis Kubernetes mit spielbaren Incident-Missionen. Plan, Designentscheidungen und ehrliche Kompromisse."
pubDate: 2026-07-12
tags: ["devops", "career", "learning"]
lang: de
translationOf: "learn-devops-in-90-days"
relatedTool:
  name: "Mission: 90 Days DevOps"
  href: "/mission-90/"
---

![DevOps in 90 Tagen lernen: ein kostenloser, Incident-first-Weg vom Entwickler zum DevOps-Engineer](/blog/learn-devops-in-90-days-hero.svg)

Es gibt einen Moment, an den sich jeder neue Ops-Engineer erinnert: das erste Mal, dass etwas Echtes kaputtgeht. Das Tutorial endete vor Wochen, der Happy Path ist nirgends in Sicht, und ein Pod hängt in `CrashLoopBackOff` – oder ein Cronjob ist stillschweigend stehen geblieben, oder die ganze Site antwortet mit 502. Tutorials lehren Befehle. Incidents formen Engineers.

Diese Lücke ist der Grund, warum wir [Mission: 90 Days DevOps](/mission-90/) gebaut haben – ein kostenloses, geführtes Programm, das Sie in 90 Tagen von Ihrem ersten Terminal-Befehl bis zur Jobreife bringt: eine fokussierte Lektion pro Tag, mit einer story-getriebenen Incident-Mission am Ende jeder Woche. Alle 90 Tage und alle 10 Missionen sind jetzt live. Keine Anmeldung, keine E-Mail-Schranke, keine Paywall; Ihr Fortschritt wird in Ihrem eigenen Browser gespeichert. Dieser Beitrag erklärt, was drinsteckt, die Reihenfolge und das Warum sowie die Designentscheidungen dahinter – einschließlich derjenigen mit echten Kompromissen.

## Die Ordnungsregel: Jede Schicht muss Sie die Schicht darüber debuggen lassen

Die meisten DevOps-Roadmaps scheitern auf eine von zwei Arten. Entweder drücken sie Ihnen einen Skill-Tree mit 200 Knoten ohne jede Reihenfolge in die Hand, oder sie beginnen mit dem glänzenden Ding – Kubernetes vor Linux, und genau so landen Menschen beim Copy-Pasten von `kubectl`-Befehlen, die sie nicht debuggen können.

Die Reihenfolge des Programms folgt einer einzigen Regel: **Jede Schicht muss Sie die Schicht darüber debuggen lassen.**

- Kubernetes-Probleme sind meist Container-Probleme.
- Container-Probleme sind meist Linux-Probleme.
- Cloud-Networking-Probleme sind meist DNS-und-Ports-Probleme, die Sie auf localhost lernen können.

Deshalb laufen die 90 Tage so: zuerst Linux, dann Container, dann Cloud, dann Orchestrierung und zuletzt die Jobvorbereitung – 45 bis 60 Minuten pro Tag, insgesamt etwa 80 Stunden Kernarbeit. Das ist ein echtes Commitment, kein „10 Minuten am Tag“-Versprechen, aber es passt neben einen Vollzeitjob, und 90 Tage sind kurz genug, dass Sie die Ziellinie schon ab Tag 1 sehen können.

![Der 90-Tage-Weg: fünf Phasen von den Linux-Grundlagen bis zur Jobreife, mit einer Incident-Mission als Abschluss jeder Woche](/blog/learn-devops-in-90-days-diagram.svg)

## Die fünf Phasen

**Phase 1 – Linux & das Terminal (Tage 1–21).** Drei Wochen zu Dateien, Berechtigungen, Prozessen, systemd, Logs, DNS und Ports, bash, cron und SSH. Es fühlt sich lang an, wenn Kubernetes ruft, aber fast jeder Incident endet damit, dass jemand per SSH auf einer Maschine sitzt und Logs liest – hier hört das auf, beängstigend zu sein. Alles läuft lokal auf WSL2 oder einer beliebigen Linux-Maschine. Kosten: null.

**Phase 2 – Docker & CI/CD (Tage 22–45).** Software paketieren und automatisch ausliefern, bewusst als Paar: Images, Dockerfiles, Volumes, Netzwerke und compose auf der einen Seite; echte Git-Workflows und GitHub-Actions-Pipelines auf der anderen. Die Phase endet mit **Projekt 1**: der Containerisierung von `linkstash`, einem FastAPI-URL-Shortener, Datenbank inklusive. Weiterhin vollständig lokal, weiterhin ohne Kosten.

**Phase 3 – AWS (Tage 46–65).** IAM und VPC zuerst – denn die meiste AWS-Verwirrung lautet „warum kann dieses Ding nicht mit jenem Ding reden“, und die Antwort ist fast immer eine Security Group oder eine Subnetz-Route – dann S3, RDS, Load Balancer und Monitoring. **Projekt 2** deployt denselben `linkstash`-Container richtig: ECS Fargate hinter einem ALB mit RDS Postgres über zwei Availability Zones.

**Phase 4 – Kubernetes & Terraform (Tage 66–85).** Pods, Services, Konfiguration, Probes, Ingress und Helm – zunächst auf lokalen `kind`-Clustern geübt, damit Fehler nichts kosten – dann Terraform, damit Infrastruktur zu reviewbarem Code statt zu Konsolen-Klicks wird. **Projekt 3** ist das Abschlussprojekt: wieder `linkstash`, jetzt auf k3s auf einer einzelnen EC2-Instanz, vollständig per Terraform provisioniert, als Helm-Chart paketiert und von Traefik und cert-manager über echtes TLS ausgeliefert.

**Phase 5 – Job-Ready (Tage 86–90).** Der Teil, den jede Roadmap überspringt: die Arbeit in eine Einstellung zu verwandeln. Ein Lebenslauf, der um die drei Projekte herum neu aufgebaut wird, Feinschliff für Portfolio und GitHub, Incident-Management-Grundlagen – Severity-Level, Blameless Postmortems, Error Budgets – und ein Interview-Drill. Jeder Tag des Programms endet mit drei bis fünf Interviewfragen, sodass Sie bis Tag 86 bereits mehr als 300 beantwortet haben.

## Eine App, den ganzen Stack hinaufgetragen

Die Designentscheidung, die wir am vehementesten verteidigen würden: Das Programm baut **eine Anwendung auf drei Arten**, nicht drei Wegwerf-Projekte.

`linkstash` wird in Phase 2 containerisiert, in Phase 3 auf AWS deployt und in Phase 4 auf Kubernetes orchestriert. In einem Interview macht das aus „ich habe ein paar Tutorials gemacht“ ein „hier ist ein System, das ich auf drei Arten betrieben habe, und hier ist der Grund, warum jede Schicht existiert“. Der direkte Vergleich – Compose-Datei versus Task Definition versus Helm-Chart, `depends_on` versus Target Groups versus Readiness Probes – ist genau die Geschichte, nach der Interviewer fragen.

## Incidents sind das Curriculum, kein Bonus

Über `journalctl` zu lesen und es um 00:14 Uhr während eines Ausfalls zu benutzen sind zwei verschiedene Fähigkeiten, und nur eine davon ist ein Job. Deshalb sind die Wochenabschlüsse keine Quizze – es sind **Missionen**: story-getriebene Incident-Simulationen, die in einem Terminal in Ihrem Browser laufen. Kein Setup, kein Cloud-Konto, kein Code erforderlich.

Sie starten Woche eins mit *Server Down!* – ein Produktions-Webserver ist um 2 Uhr nachts down, und Sie müssen den außer Kontrolle geratenen Prozess finden, ihn beenden und nginx wieder hochbringen. In der letzten Woche erwartet Sie *The Midnight Outage*: ein SEV-1, bei dem eine einzige Security-Group-Änderung in fehlschlagende Load-Balancer-Health-Checks, ein DNS-Failover und Pods in der Failover-Region kaskadiert, die nicht starten können, weil jemand das Secret gelöscht hat, das sie mounten. Der Fix muss **upstream-first** landen – den Netzwerkpfad wieder öffnen, das Secret wiederherstellen, dann bestätigen, dass DNS sich erholt hat – genau in dieser Reihenfolge, denn das Neustarten der Pods war nie das Problem.

Dazwischen: ein DNS-Rätsel, ein Berechtigungs-Lockout, ein crash-loopender Container-Stack, eine kaputte CI-Pipeline, eine überraschende AWS-Rechnung, eine gelöschte Produktionstabelle, ein Kubernetes-Cluster im Chaos und ein veralteter Terraform-State-Lock. Zehn Missionen, von denen jede exakt die Diagnoseschleife einübt, die ihre Woche gelehrt hat.

## Darauf ausgelegt, (fast) nichts zu kosten

Ein Lernpfad, der stillschweigend eine Cloud-Rechnung auflaufen lässt, ist ein kaputter Lernpfad. Deshalb sind die Budgetregeln strukturell verankert:

- Die Phasen 1 und 2 sowie die Kubernetes-Grundlagen laufen **vollständig lokal** – WSL2, Docker, `kind` und lokale Terraform-Provider. Null Cloud-Ausgaben.
- Jeder AWS-Tag beginnt mit einer **Kostenbox**, die genau angibt, was das Lab kostet und unter welchen Bedingungen es kostenlos ist, und endet mit einem **verpflichtenden Teardown**.
- Das Kubernetes-Abschlussprojekt nutzt k3s auf einer einzelnen t3.small (etwa $19/month, falls Sie sie vergessen; mit Teardown am selben Tag im Free Tier praktisch kostenlos) statt EKS, dessen Control Plane allein etwa $73/month kostet. Dieselbe Kubernetes-API, dieselben Manifeste, dasselbe Helm – Sie bezahlen AWS nur nicht dafür, den API-Server zu betreiben. Der Kompromiss, ehrlich benannt: Sie kommen nicht mit EKS-spezifischem Kleber wie IRSA oder Managed Node Groups in Berührung – was völlig in Ordnung ist, um es im Job zu lernen.

## Wie ein Tag aussieht

Jeder der 90 Tage hat dieselbe Form, sodass Sie immer wissen, was „fertig“ bedeutet:

1. **Ein kurzes Konzept** – unter 600 Wörtern, ein Diagramm, eine Analogie aus der echten Welt. In fünf Minuten gelesen.
2. **Ein Hands-on-Lab** – echte Befehle mit echter Ausgabe, reproduzierbar auf Ihrer Maschine.
3. **Häufige Fehler & Lösungen** – die tatsächlichen Fehlermeldungen, auf die Sie stoßen werden, warum sie auftreten und wie Sie sie in Produktion erkennen würden.
4. **Interview-Q&A** – drei bis fünf Fragen mit Antworten, die es wert sind, laut ausgesprochen zu werden.

Optionale „Go Deeper“-Extras gibt es für die Tage, an denen Sie mehr Zeit haben – die nächste Lektion setzt sie nie voraus.

## Die ehrlichen Kompromisse

- **90 Tage machen Sie einstellbar als Junior, nicht als Senior.** Sie werden im Job ab Woche eins beitragen und debuggen; Tiefe kommt mit Pager-Zeit.
- **Das Programm ist meinungsstark.** GitHub Actions statt Jenkins, AWS statt Azure, k3s statt EKS. Jeder Slot bekam den Default mit dem größten Hebel; Ihr Zieljob kann davon abweichen.
- **Selbstbestimmtes Tempo bedeutet Selbstdisziplin.** Fortschritts-Tracking hilft; es ersetzt nicht das tägliche Dranbleiben.
- **Die AWS-Phase braucht eine hinterlegte Kreditkarte.** Die Teardown-Disziplin hält die Ausgaben nahe null, aber das Risiko ist nie exakt null.

## Starten Sie heute

Alles ist live: [alle 90 Tage](/mission-90/), die [zehn Missionen](/mission-90/missions/) und die drei Projekte. Beginnen Sie mit Tag 1 – oder spielen Sie zuerst *Server Down!*, wenn Sie den Kern des ganzen Programms in zehn Minuten spüren wollen. Es braucht nichts außer einem Browser-Tab, und es endet so, wie jeder gute Incident endet: mit der Site wieder online – und Sie wissen genau, warum.
