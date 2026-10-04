---
title: "Der vollständige Leitfaden zu privaten IP-Adressbereichen (RFC 1918)"
description: "Die drei privaten IP-Bereiche nach RFC 1918, die Falle bei 172.16.0.0/12, Adressen, die nur privat aussehen, und wie du einen kollisionsfreien Bereich wählst."
pubDate: 2026-09-17
tags: ["networking", "security"]
lang: de
translationOf: "private-ip-address-ranges-rfc-1918"
relatedTool:
  name: "Subnet Calculator"
  href: "/subnet-calculator"
---

![Drei verschachtelte Adressblöcke für die privaten Bereiche nach RFC 1918: 10.0.0.0/8, 172.16.0.0/12 und 192.168.0.0/16](/blog/private-ip-address-ranges-rfc-1918-hero.svg)
<!-- keywords: private ip address ranges | rfc 1918, private ip ranges, is 172.32 private, 172.16.0.0/12 range, 100.64.0.0/10 | source: marketing brief, ahrefs unchecked (2026-10-04) -->

Eine Security-Group-Regel soll „Zugriff aus privaten Netzen erlauben“, und jemand hat `172.0.0.0/8` eingetragen. Das wirkt vernünftig. Es öffnet den Port aber auch für rund 15 Millionen öffentliche Adressen, denn nur ein Sechzehntel dieses Blocks ist privat. Privater Adressraum ist klein, genau definiert und leicht falsch zu erinnern, und die Fehler zeigen sich als Löcher in der Firewall, als VPN-Routen, die stillschweigend ins Leere führen, und als VPC-Peering-Anfragen, die die Cloud ablehnt.

Dieser Beitrag ist die Referenz: die drei Bereiche, der Grenzfall, über den viele stolpern, die Blöcke, die privat aussehen, es aber nicht sind, und wie du einen Bereich wählst, den du nicht bereust.

## Die drei privaten IP-Adressbereiche

RFC 1918, 1996 als BCP 5 veröffentlicht, reserviert drei IPv4-Blöcke für den Einsatz in privaten Netzen. Niemandem werden sie zugeteilt, niemand routet sie im öffentlichen Internet, und jeder darf sie hinter seiner eigenen Netzgrenze wiederverwenden.

| Block | Bereich | Adressen | Typische Nutzung |
|---|---|---|---|
| `10.0.0.0/8` | 10.0.0.0 – 10.255.255.255 | 16.777.216 | Große Unternehmen, Cloud-VPCs, Kubernetes-Pod-Netze |
| `172.16.0.0/12` | 172.16.0.0 – 172.31.255.255 | 1.048.576 | Docker-Standardnetze, die AWS-Default-VPC (`172.31.0.0/16`) |
| `192.168.0.0/16` | 192.168.0.0 – 192.168.255.255 | 65.536 | Heimrouter, kleine Büros, Labornetze |

Zu jedem gibt es eine ausgearbeitete Seite, wenn du Netz, Maske und Host-Anzahl aufgeschlüsselt sehen willst: [10.0.0.0/8](/subnet-calculator/10-0-0-0-8/), [172.16.0.0/12](/subnet-calculator/172-16-0-0-12/) und [192.168.0.0/16](/subnet-calculator/192-168-0-0-16/). Der Block, den die meisten tatsächlich schon getippt haben, ist das `/24` des Heimrouters, [192.168.1.0/24](/subnet-calculator/192-168-1-0-24/).

Beachte, was RFC 1918 nicht sagt. Es sagt nicht, dass diese Adressen sicher, verborgen oder unerreichbar sind. Es sagt, dass sie nicht global eindeutig sind und Router im öffentlichen Internet sie deshalb nicht weiterleiten sollen. Das ist eine Aussage über Routing, nicht über Zugriffskontrolle.

## Warum 172.16.0.0/12 viele aufs Glatteis führt

Der erste und der letzte Block liegen auf Oktettgrenzen: Alles, was mit `10.` beginnt, ist privat, alles, was mit `192.168.` beginnt, ebenfalls. Der mittlere nicht. Ein `/12` legt die ersten 12 Bit fest, also das gesamte erste Oktett plus die oberen vier Bit des zweiten. Im zweiten Oktett sind diese vier Bit `0001`, das Oktett kann also nur von `0001 0000` (16) bis `0001 1111` (31) reichen.

```text
172.16.0.0/12
first octet   172  = 1010 1100   (fixed)
second octet   16  = 0001 0000   (top 4 bits fixed: 0001)
               31  = 0001 1111   (last value that keeps 0001)
               32  = 0010 0000   (top bits change: outside the block)

private:  172.16.0.0 – 172.31.255.255
public:   172.0.0.0 – 172.15.255.255 and 172.32.0.0 – 172.255.255.255
```

`172.32.0.1` ist also eine öffentliche Adresse, und `172.15.0.1` ebenso. Eine Regel wie `172.0.0.0/8` oder ein Regex auf `^172\.` deckt das Sechzehnfache des gemeinten Raums ab.

Der andere Grund, warum dieser Block wichtig ist: Docker nutzt ihn standardmäßig. Das Standardnetz `bridge` ist `172.17.0.0/16`, und benutzerdefinierte Netze werden aus dem Rest des 172.16/12-Raums vergeben, danach aus 192.168/16 (die Pools sind in der `daemon.json` konfigurierbar). Was du hast, siehst du so:

```bash
docker network inspect bridge --format '{{(index .IPAM.Config 0).Subnet}}'
docker network ls -q | xargs docker network inspect \
  --format '{{.Name}} {{range .IPAM.Config}}{{.Subnet}}{{end}}'
```

Liegt dein Büro-VPN oder eine gepeerte VPC ebenfalls in `172.17.0.0/16` oder `172.18.0.0/16`, hat der Host nun zwei Routen zum selben Präfix, und Traffic für das entfernte Netz landet stattdessen auf einer lokalen Docker-Bridge. Das sieht aus wie „das VPN verbindet sich, aber nichts antwortet“.

> **Tipp:** Wenn Docker-Hosts und Firmennetze immer wieder kollidieren, setze `default-address-pools` in `/etc/docker/daemon.json` auf einen Bereich, den sonst niemand nutzt, statt das Netz um Docker herum neu zu nummerieren.

## Adressen, die privat aussehen, aber nicht RFC 1918 sind

Mehrere andere reservierte Blöcke verhalten sich in der Praxis „nicht öffentlich“ und werden in Firewall-Regeln und Allowlists mit RFC 1918 in einen Topf geworfen. Für sie gelten andere Regeln, und sie als austauschbar zu behandeln, verursacht echte Bugs.

| Block | Definiert in | Was es ist |
|---|---|---|
| `100.64.0.0/10` | RFC 6598 | Gemeinsamer Adressraum für Carrier-Grade NAT. Wird auch von Tailscale für Node-Adressen genutzt. Nicht RFC 1918: Nutze ihn nicht für eigene LANs, wenn dein ISP ihn upstream verwenden könnte. |
| `169.254.0.0/16` | RFC 3927 | IPv4-Link-Local, selbst zugewiesen, wenn DHCP fehlschlägt. Cloud-Metadatendienste liegen unter `169.254.169.254`, weshalb SSRF-Filter auch diesen Block sperren müssen. |
| `127.0.0.0/8` | RFC 1122 | Loopback. Das ganze `/8`, nicht nur `127.0.0.1`. |
| `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24` | RFC 5737 | TEST-NET-1, -2 und -3, reserviert für Dokumentation. In Beispielen richtig, in Konfigurationen falsch. |
| `198.18.0.0/15` | RFC 2544 | Reserviert für Netzwerk-Benchmarks. |
| `fc00::/7` | RFC 4193 | IPv6 Unique Local Addresses. Das nächste IPv6-Gegenstück zu RFC 1918; in der Praxis nutzt du `fd00::/8` mit einer zufälligen 40-Bit-Global-ID. |
| `fe80::/10` | RFC 4291 | IPv6-Link-Local, auf jedem IPv6-Interface vorhanden. |

> **Achtung:** Eine Prüfung „ist diese Adresse intern?“, die nur die drei Blöcke aus RFC 1918 testet, akzeptiert anstandslos `127.0.0.1`, `169.254.169.254` und `[::1]`. Für SSRF-Schutz prüfst du gegen die vollständige Special-Purpose-Registry (RFC 6890 und die IANA-Registries) und löst den Hostnamen vor der Prüfung auf, nicht danach.

## NAT ist keine Firewall

Private Adressierung hat sich durch NAT verbreitet, und der Nebeneffekt von NAT ist, dass unaufgeforderte eingehende Verbindungen meist nirgendwohin können. Dieser Nebeneffekt ist keine Sicherheitsmaßnahme. Ein Router mit Portweiterleitung, eine UPnP-Anfrage eines Geräts im LAN, eine IPv6-Adresse auf demselben Host ganz ohne NAT oder ein Angreifer, der schon im Netz ist — sie alle umgehen es.

RFC-1918-Adressen sind auch vor niemandem im selben Netz, im selben VPN oder in einer gepeerten VPC verborgen. Innerhalb dieser Grenzen sind sie ganz normale routbare Adressen. Wenn ein Dienst nur Traffic von bestimmten Hosts annehmen soll, halte das als Firewall- oder Security-Group-Regel mit expliziten Quellbereichen fest. Die private Adresse sagt, wo der Dienst wohnt, nicht, wer ihn erreichen darf.

## Einen privaten Bereich für VPC, VPN oder Labor wählen

Weil alle denselben Raum wiederverwenden, ist das eigentliche Risiko die Überschneidung. Zwei Netze mit demselben Präfix lassen sich ohne NAT dazwischen nicht zueinander routen, und die großen Clouds lehnen VPC-Peering zwischen überlappenden CIDRs rundweg ab. Überschneidungen machen auch VPN-Clients kaputt: Ein Heimnetz auf `192.168.1.0/24`, das sich mit einem Büro verbindet, das ebenfalls `192.168.1.0/24` nutzt, erreicht die Büroseite dieses Bereichs nicht.

Ein paar Regeln, die gut altern:

- **Meide die Standards.** `192.168.0.0/24`, `192.168.1.0/24`, `10.0.0.0/16` und `172.17.0.0/16` existieren am anderen Ende am wahrscheinlichsten schon.
- **Wähle aus `10.0.0.0/8` und plane in `/16`-Blöcken.** Davon gibt es 256. Vergib einen pro Umgebung oder Region aus einer schriftlichen Liste, damit die nächste VPC nicht raten muss.
- **Lass Platz für Kubernetes.** Pod- und Service-CIDRs sind separate Bereiche, die sich weder mit dem Node-Netz noch mit irgendetwas überschneiden dürfen, mit dem der Cluster spricht.
- **Plane für Wachstum, nicht für heute.** Eine laufende VPC neu zu adressieren, ist weit mehr Arbeit, als am Anfang großzügig zu vergeben. Cloud-Subnetze verlieren außerdem ein paar Adressen an reservierte Plätze (AWS reserviert fünf pro Subnetz).

Einen geplanten `/16` in Blöcke pro Subnetz aufzuteilen, ist eine Aufgabe für den [Subnet Splitter](/subnet-splitter/), und eine Liste bestehender Bereiche auf Überschneidungen zu prüfen, bevor du einen weiteren hinzufügst, erledigt der [CIDR / Subnet Checker](/cidr-checker/).

## Mit Bit-Arithmetik prüfen, ob eine Adresse privat ist

Für einen Test auf RFC-1918-Zugehörigkeit brauchst du keine Bibliothek. Eine Adresse liegt in einem Block, wenn ihre ersten *n* Bit mit den ersten *n* Bit des Blocks übereinstimmen, was in der Praxis eine Maske und einen Vergleich bedeutet:

```text
10.0.0.0/8      first octet == 10
172.16.0.0/12   first octet == 172  AND  (second octet AND 0xF0) == 0x10
192.168.0.0/16  first octet == 192  AND  second octet == 168

172.20.5.9   ->  20 AND 0xF0 = 16 (0x10)  ->  private
172.32.0.1   ->  32 AND 0xF0 = 32 (0x20)  ->  public
```

Die vollständige Herleitung von Masken und Präfixlängen findest du in [CIDR-Notation lesen](/de/blog/how-to-read-cidr-notation/). Für eine schnelle Antwort füge eine beliebige Adresse oder einen Block in den [Subnet Calculator](/subnet-calculator/) ein: Er zeigt Netz, Broadcast und Host-Bereich, und die Rechnung läuft in deinem Browser.

> **Tipp:** Bibliotheken verschiedener Sprachen sind sich nicht einig, was „privat“ bedeutet. Manche schließen Loopback, Link-Local oder `100.64.0.0/10` ein, und die Definitionen haben sich zwischen Versionen geändert. Wenn dein Code genau RFC 1918 braucht, teste die drei Blöcke selbst, statt einem generischen `is_private`-Flag zu vertrauen.

## Kurzreferenz

- Privat (RFC 1918): `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`. Sonst nichts.
- `172.16.0.0/12` endet bei `172.31.255.255`. `172.32.x.x` ist öffentlich.
- Dockers Standard-Bridge ist `172.17.0.0/16`; prüfe sie, bevor du einen VPN- oder VPC-Bereich wählst.
- `100.64.0.0/10` (CGNAT), `169.254.0.0/16` (Link-Local, Cloud-Metadaten), `127.0.0.0/8` (Loopback) und die TEST-NETs aus RFC 5737 sind Spezialbereiche, nicht RFC 1918.
- Das IPv6-Gegenstück ist `fc00::/7`, genutzt als `fd00::/8` mit zufälliger Global-ID.
- Private Adressierung und NAT sind keine Zugriffskontrolle. Schreib explizite Firewall-Regeln.
- Überlappende Bereiche machen Peering und VPNs kaputt. Führe einen schriftlichen Vergabeplan und prüfe neue Bereiche dagegen.
