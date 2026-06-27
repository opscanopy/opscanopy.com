---
title: "Networking for DevOps Engineers: The Complete Guide"
description: "TCP/IP, subnets and CIDR, DNS, HTTP/TLS, load balancing, firewalls, and network troubleshooting for DevOps engineers — explained with free calculators."
track: networking
order: 1
difficulty: intermediate
updatedDate: 2026-06-27
tags: ["networking", "devops", "tcp-ip", "dns", "subnetting"]
relatedTools: ["subnet-calculator", "cidr-checker", "subnet-splitter", "ip-address-converter", "reverse-dns-ptr", "mac-address-formatter"]
seoTitle: "Networking for DevOps Engineers: Complete Guide"
metaDescription: "TCP/IP, subnets & CIDR, DNS, HTTP, load balancing, firewalls and network troubleshooting for DevOps — explained with free calculators."
faqs:
  - q: "What networking concepts do DevOps engineers need to know?"
    a: "IP addressing and subnets/CIDR, TCP vs UDP, DNS, HTTP/TLS, load balancing and reverse proxies, firewalls/security groups, NAT, and command-line troubleshooting (ping, traceroute, dig, ss, tcpdump, curl)."
  - q: "How do you calculate a subnet and the number of hosts?"
    a: "From the prefix length, host bits = 32 − prefix; usable hosts = 2^(host bits) − 2 (network + broadcast). A /24 has 256 addresses and 254 usable hosts. Use a subnet calculator to get ranges instantly."
  - q: "What is CIDR notation and how do you read it?"
    a: "CIDR writes an address with a prefix length, e.g. 10.0.0.0/24, where /24 means the first 24 bits are the network portion. Smaller numbers mean larger networks (/16 is bigger than /24)."
  - q: "What is the difference between TCP and UDP?"
    a: "TCP is connection-oriented and reliable (handshake, ordering, retransmission); UDP is connectionless and fast with no delivery guarantees. Use TCP for correctness, UDP for low-latency/streaming."
  - q: "How does DNS work?"
    a: "A resolver walks from root to TLD to authoritative servers to resolve a name to records (A/AAAA, CNAME, MX, TXT, PTR), caching by TTL. PTR records do reverse lookups (IP → name)."
  - q: "What is the difference between L4 and L7 load balancing?"
    a: "L4 balances by IP/port (TCP/UDP) without inspecting content; L7 understands HTTP and can route by host, path, headers, or cookies, enabling smarter routing at higher cost."
---

Networking is the invisible plumbing that every deployment depends on. When a pod can't reach its database, a deploy fails, or latency spikes with no obvious cause, the engineer who understands the network stack finds the answer while everyone else is still guessing. This guide covers the networking fundamentals every DevOps practitioner needs — from binary subnet math to Kubernetes service meshes — grounded in the commands you'll actually run. If you want a structured learning path alongside this reference, see the [Networking roadmap](/learn/roadmaps/networking).

## Why Networking Matters for DevOps

Infrastructure work is networking work, whether you recognize it or not. Every CI/CD pipeline fetches artifacts over the wire. Every container runtime assigns IP addresses, manages virtual interfaces, and enforces iptables rules. Cloud platform mistakes — wrong CIDR range, missing security group rule, overlooked NAT gateway — routinely stall production deployments and generate hours of troubleshooting.

Concrete scenarios where networking knowledge pays off immediately:

- Debugging why two services in the same VPC can't communicate (security group rule, route table missing, NACL block, wrong subnet)
- Sizing a VPC subnet large enough to accommodate auto-scaling groups that expand to hundreds of pods
- Investigating certificate errors, TLS handshake failures, or mixed-content warnings in HTTPS apps
- Tuning load balancer health-check thresholds and connection-draining windows to achieve zero-downtime deploys
- Reading `tcpdump` or `Wireshark` output to understand exactly what traffic crossed the wire during an incident

The sections below build from the ground up: models → addresses → subnets → protocols → services → tools.

## The OSI and TCP/IP Models

Two reference models describe how data travels from application to wire. The OSI (Open Systems Interconnection) model has seven layers; the TCP/IP model collapses those into four. Both remain useful — OSI gives precise vocabulary for troubleshooting, TCP/IP maps to real protocol implementations.

| OSI Layer | Name | TCP/IP Layer | Examples |
|-----------|------|--------------|---------|
| 7 | Application | Application | HTTP, HTTPS, DNS, SMTP, FTP, SSH |
| 6 | Presentation | Application | TLS/SSL, MIME encoding |
| 5 | Session | Application | TLS sessions, RPC, NetBIOS |
| 4 | Transport | Transport | TCP, UDP, SCTP |
| 3 | Network | Internet | IPv4, IPv6, ICMP, IPsec |
| 2 | Data Link | Network Access | Ethernet, Wi-Fi (802.11), ARP, VLAN |
| 1 | Physical | Network Access | Cable, fiber, radio, transceivers |

<figure class="dgm" role="img" aria-label="OSI seven layers mapped to four TCP/IP layers with example protocols at each level">
<svg viewBox="0 0 680 310" width="680" height="310" xmlns="http://www.w3.org/2000/svg">
  <!-- OSI column header -->
  <rect x="10" y="10" width="200" height="28" rx="6" class="dgm-accent-soft" />
  <text x="110" y="28" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">OSI Model (7 Layers)</text>
  <!-- TCP/IP column header -->
  <rect x="360" y="10" width="200" height="28" rx="6" class="dgm-accent-soft" />
  <text x="460" y="28" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">TCP/IP Model (4 Layers)</text>

  <!-- OSI Layer 7 -->
  <rect x="10" y="48" width="200" height="32" rx="6" class="dgm-surface-2" stroke-width="1.5" />
  <rect x="10" y="48" width="200" height="32" rx="6" class="dgm-accent-stroke" fill="none" stroke-width="1.5" />
  <text x="70" y="68" text-anchor="middle" font-size="11" class="dgm-ink">7 · Application</text>
  <text x="175" y="68" text-anchor="middle" font-size="10" class="dgm-muted">HTTP, DNS, SMTP, SSH</text>

  <!-- OSI Layer 6 -->
  <rect x="10" y="84" width="200" height="32" rx="6" class="dgm-surface-2" fill="none" stroke-width="1.5" />
  <rect x="10" y="84" width="200" height="32" rx="6" class="dgm-accent-stroke" fill="none" stroke-width="1.5" />
  <text x="70" y="104" text-anchor="middle" font-size="11" class="dgm-ink">6 · Presentation</text>
  <text x="175" y="104" text-anchor="middle" font-size="10" class="dgm-muted">TLS/SSL, MIME</text>

  <!-- OSI Layer 5 -->
  <rect x="10" y="120" width="200" height="32" rx="6" class="dgm-surface-2" fill="none" stroke-width="1.5" />
  <rect x="10" y="120" width="200" height="32" rx="6" class="dgm-accent-stroke" fill="none" stroke-width="1.5" />
  <text x="70" y="140" text-anchor="middle" font-size="11" class="dgm-ink">5 · Session</text>
  <text x="175" y="140" text-anchor="middle" font-size="10" class="dgm-muted">TLS sessions, RPC</text>

  <!-- OSI Layer 4 -->
  <rect x="10" y="160" width="200" height="32" rx="6" class="dgm-surface-2" fill="none" stroke-width="1.5" />
  <rect x="10" y="160" width="200" height="32" rx="6" class="dgm-ink-stroke" fill="none" stroke-width="2" />
  <text x="70" y="180" text-anchor="middle" font-size="11" font-weight="bold" class="dgm-ink">4 · Transport</text>
  <text x="175" y="180" text-anchor="middle" font-size="10" class="dgm-muted">TCP, UDP, SCTP</text>

  <!-- OSI Layer 3 -->
  <rect x="10" y="196" width="200" height="32" rx="6" class="dgm-surface-2" fill="none" stroke-width="1.5" />
  <rect x="10" y="196" width="200" height="32" rx="6" class="dgm-ink-stroke" fill="none" stroke-width="2" />
  <text x="70" y="216" text-anchor="middle" font-size="11" font-weight="bold" class="dgm-ink">3 · Network</text>
  <text x="175" y="216" text-anchor="middle" font-size="10" class="dgm-muted">IPv4, IPv6, ICMP</text>

  <!-- OSI Layer 2 -->
  <rect x="10" y="232" width="200" height="32" rx="6" class="dgm-surface-2" fill="none" stroke-width="1.5" />
  <rect x="10" y="232" width="200" height="32" rx="6" class="dgm-muted-stroke" fill="none" stroke-width="1.5" />
  <text x="70" y="252" text-anchor="middle" font-size="11" class="dgm-ink">2 · Data Link</text>
  <text x="175" y="252" text-anchor="middle" font-size="10" class="dgm-muted">Ethernet, ARP, VLAN</text>

  <!-- OSI Layer 1 -->
  <rect x="10" y="268" width="200" height="32" rx="6" class="dgm-surface-2" fill="none" stroke-width="1.5" />
  <rect x="10" y="268" width="200" height="32" rx="6" class="dgm-muted-stroke" fill="none" stroke-width="1.5" />
  <text x="70" y="288" text-anchor="middle" font-size="11" class="dgm-ink">1 · Physical</text>
  <text x="175" y="288" text-anchor="middle" font-size="10" class="dgm-muted">Cable, fiber, radio</text>

  <!-- TCP/IP: Application (maps L5-L7) -->
  <rect x="360" y="48" width="200" height="104" rx="6" class="dgm-accent-soft" stroke-width="1.5" />
  <rect x="360" y="48" width="200" height="104" rx="6" class="dgm-accent-stroke" fill="none" stroke-width="1.5" />
  <text x="460" y="105" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">Application</text>
  <text x="460" y="122" text-anchor="middle" font-size="10" class="dgm-muted">HTTP · HTTPS · DNS</text>
  <text x="460" y="138" text-anchor="middle" font-size="10" class="dgm-muted">SMTP · TLS · SSH</text>

  <!-- TCP/IP: Transport (maps L4) -->
  <rect x="360" y="160" width="200" height="32" rx="6" class="dgm-surface-2" fill="none" stroke-width="1.5" />
  <rect x="360" y="160" width="200" height="32" rx="6" class="dgm-ink-stroke" fill="none" stroke-width="2" />
  <text x="460" y="175" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">Transport</text>
  <text x="460" y="188" text-anchor="middle" font-size="10" class="dgm-muted">TCP · UDP · SCTP</text>

  <!-- TCP/IP: Internet (maps L3) -->
  <rect x="360" y="196" width="200" height="32" rx="6" class="dgm-surface-2" fill="none" stroke-width="1.5" />
  <rect x="360" y="196" width="200" height="32" rx="6" class="dgm-ink-stroke" fill="none" stroke-width="2" />
  <text x="460" y="211" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">Internet</text>
  <text x="460" y="224" text-anchor="middle" font-size="10" class="dgm-muted">IPv4 · IPv6 · ICMP</text>

  <!-- TCP/IP: Network Access (maps L1-L2) -->
  <rect x="360" y="232" width="200" height="68" rx="6" class="dgm-surface-2" fill="none" stroke-width="1.5" />
  <rect x="360" y="232" width="200" height="68" rx="6" class="dgm-muted-stroke" fill="none" stroke-width="1.5" />
  <text x="460" y="261" text-anchor="middle" font-size="12" font-weight="bold" class="dgm-ink">Network Access</text>
  <text x="460" y="278" text-anchor="middle" font-size="10" class="dgm-muted">Ethernet · Wi-Fi · ARP</text>
  <text x="460" y="293" text-anchor="middle" font-size="10" class="dgm-muted">Cable · fiber · radio</text>

  <!-- Mapping arrows -->
  <!-- L7-L5 → Application -->
  <line x1="210" y1="100" x2="360" y2="100" class="dgm-ink-stroke" stroke-width="1.5" fill="none" />
  <polygon points="355,96 365,100 355,104" class="dgm-ink" />
  <!-- L4 → Transport -->
  <line x1="210" y1="176" x2="360" y2="176" class="dgm-ink-stroke" stroke-width="1.5" fill="none" />
  <polygon points="355,172 365,176 355,180" class="dgm-ink" />
  <!-- L3 → Internet -->
  <line x1="210" y1="212" x2="360" y2="212" class="dgm-ink-stroke" stroke-width="1.5" fill="none" />
  <polygon points="355,208 365,212 355,216" class="dgm-ink" />
  <!-- L1-L2 → Network Access -->
  <line x1="210" y1="266" x2="360" y2="266" class="dgm-ink-stroke" stroke-width="1.5" fill="none" />
  <polygon points="355,262 365,266 355,270" class="dgm-ink" />
</svg>
<figcaption>OSI's seven layers collapse into four TCP/IP layers; each arrow shows which OSI layers map to the corresponding TCP/IP layer.</figcaption>
</figure>

**Encapsulation** moves data down the stack on the sender and up on the receiver. Each layer wraps the payload with its own header (and sometimes trailer). By the time an HTTP request leaves a NIC, the original bytes are nested inside: HTTP → TCP segment → IP packet → Ethernet frame.

**Where DevOps tooling sits:**

- Load balancers operate at L4 (TCP/UDP) or L7 (HTTP/HTTPS)
- Firewalls and security groups filter at L3/L4 (IP addresses, ports, protocol)
- Service meshes (Envoy, Linkerd) intercept at L4/L7 inside the application network
- Overlay networks (VXLAN, Geneve) wrap L2 frames inside L3 packets — how Kubernetes CNI plugins create virtual pod networks across physical hosts

> **Tip:** When troubleshooting, identify which layer the failure lives in. "Can't reach the server" is vague. "The TCP SYN goes out but no SYN-ACK returns" pins the problem to L3/L4, narrowing the suspect list to routes, security groups, and firewalls.

## IP Addressing

### IPv4 Structure

An IPv4 address is 32 bits written as four decimal octets separated by dots: `192.168.1.100`. Each octet ranges from 0–255 (2⁸ possible values). The address space is divided into a **network portion** (identifies the subnet) and a **host portion** (identifies the device within that subnet). The split point is determined by the subnet mask.

```bash
# Inspect assigned IPs on Linux
ip addr show

# Legacy command (still common on older systems)
ifconfig -a
```

### Public vs Private Address Ranges

RFC 1918 reserves three blocks for private use — they are not routable on the public internet:

| Range | CIDR | Size | Common Use |
|-------|------|------|-----------|
| 10.0.0.0 – 10.255.255.255 | 10.0.0.0/8 | ~16.7 million | Enterprise, cloud VPCs |
| 172.16.0.0 – 172.31.255.255 | 172.16.0.0/12 | ~1 million | Mid-size networks, Docker default |
| 192.168.0.0 – 192.168.255.255 | 192.168.0.0/16 | ~65,000 | Home, small office |

Additional special-purpose ranges:

- `127.0.0.0/8` — loopback (localhost); `127.0.0.1` is the standard loopback address
- `169.254.0.0/16` — link-local; assigned automatically when DHCP fails (APIPA)
- `100.64.0.0/10` — shared address space (ISP carrier-grade NAT, RFC 6598)
- `0.0.0.0/0` — the default route, meaning "everything"

### A Note on IPv6

IPv6 uses 128-bit addresses written in eight groups of four hex digits, e.g. `2001:0db8:85a3:0000:0000:8a2e:0370:7334`. Consecutive groups of zeroes can be collapsed with `::` — the above becomes `2001:db8:85a3::8a2e:370:7334`. The primary motivation was exhaustion of the IPv4 space.

Key DevOps IPv6 touchpoints: AWS dual-stack VPCs, Kubernetes Pod IPs (IPv6 mode), and modern load balancers that accept both stacks. The subnet math uses /64 prefixes for most LANs (leaving 64 bits for host IDs).

Use the [IP Address Converter](/ip-address-converter) to convert between dotted-decimal, binary, and hex representations — indispensable when verifying subnet masks or reading raw packet captures.

## Subnets and CIDR

### Subnet Masks and Prefix Length

A **subnet mask** is a 32-bit value with all network bits set to 1 and all host bits set to 0. It tells a device which part of an IP address identifies the network.

**CIDR (Classless Inter-Domain Routing)** notation expresses the same information as a prefix length after a slash: `192.168.1.0/24` means the first 24 bits are the network, the remaining 8 bits are for hosts.

| CIDR Prefix | Subnet Mask | # Addresses | Usable Hosts |
|-------------|-------------|-------------|--------------|
| /8 | 255.0.0.0 | 16,777,216 | 16,777,214 |
| /16 | 255.255.0.0 | 65,536 | 65,534 |
| /20 | 255.255.240.0 | 4,096 | 4,094 |
| /24 | 255.255.255.0 | 256 | 254 |
| /25 | 255.255.255.128 | 128 | 126 |
| /26 | 255.255.255.192 | 64 | 62 |
| /27 | 255.255.255.224 | 32 | 30 |
| /28 | 255.255.255.240 | 16 | 14 |
| /29 | 255.255.255.248 | 8 | 6 |
| /30 | 255.255.255.252 | 4 | 2 |
| /32 | 255.255.255.255 | 1 | host route only |

<figure class="dgm" role="img" aria-label="CIDR /24 breakdown showing 192.168.1.0/24 network bits versus host bits, with network address, broadcast address, and usable host range">
<svg viewBox="0 0 680 260" width="680" height="260" xmlns="http://www.w3.org/2000/svg">
  <!-- Title -->
  <text x="340" y="22" text-anchor="middle" font-size="13" font-weight="bold" class="dgm-ink">192.168.1.0 /24 — CIDR Breakdown</text>

  <!-- 32-bit bar divided: 24 network bits + 8 host bits -->
  <!-- Network bits block -->
  <rect x="20" y="38" width="420" height="44" rx="6" class="dgm-accent-soft" stroke-width="1.5" />
  <rect x="20" y="38" width="420" height="44" rx="6" class="dgm-accent-stroke" fill="none" stroke-width="1.5" />
  <text x="230" y="56" text-anchor="middle" font-size="11" font-weight="bold" class="dgm-ink">Network Portion — 24 bits</text>
  <text x="230" y="72" text-anchor="middle" font-size="10" class="dgm-muted">192 . 168 . 1</text>

  <!-- Host bits block -->
  <rect x="444" y="38" width="216" height="44" rx="6" class="dgm-surface-2" stroke-width="1.5" />
  <rect x="444" y="38" width="216" height="44" rx="6" class="dgm-ink-stroke" fill="none" stroke-width="2" />
  <text x="552" y="56" text-anchor="middle" font-size="11" font-weight="bold" class="dgm-ink">Host Portion — 8 bits</text>
  <text x="552" y="72" text-anchor="middle" font-size="10" class="dgm-muted">0 – 255  (256 addresses)</text>

  <!-- Divider label -->
  <line x1="440" y1="30" x2="440" y2="90" class="dgm-ink-stroke" stroke-width="1.5" fill="none" stroke-dasharray="4 3" />
  <text x="440" y="104" text-anchor="middle" font-size="10" class="dgm-muted">/24 boundary</text>

  <!-- Subnet mask -->
  <text x="340" y="124" text-anchor="middle" font-size="11" class="dgm-ink">Subnet mask: <tspan font-weight="bold">255.255.255.0</tspan>  |  Binary: <tspan font-weight="bold">11111111.11111111.11111111.00000000</tspan></text>

  <!-- Three address boxes -->
  <!-- Network address -->
  <rect x="20" y="138" width="198" height="52" rx="8" class="dgm-surface-2" stroke-width="1.5" />
  <rect x="20" y="138" width="198" height="52" rx="8" class="dgm-muted-stroke" fill="none" stroke-width="1.5" />
  <text x="119" y="158" text-anchor="middle" font-size="11" font-weight="bold" class="dgm-ink">Network Address</text>
  <text x="119" y="176" text-anchor="middle" font-size="12" class="dgm-accent">192.168.1.0</text>
  <text x="119" y="191" text-anchor="middle" font-size="9" class="dgm-muted">(all host bits = 0)</text>

  <!-- Usable range -->
  <rect x="240" y="138" width="200" height="52" rx="8" class="dgm-accent-soft" stroke-width="1.5" />
  <rect x="240" y="138" width="200" height="52" rx="8" class="dgm-accent-stroke" fill="none" stroke-width="2" />
  <text x="340" y="158" text-anchor="middle" font-size="11" font-weight="bold" class="dgm-ink">Usable Hosts (254)</text>
  <text x="340" y="176" text-anchor="middle" font-size="11" class="dgm-ink">192.168.1.1 – .254</text>
  <text x="340" y="191" text-anchor="middle" font-size="9" class="dgm-muted">2^8 − 2 = 254 hosts</text>

  <!-- Broadcast address -->
  <rect x="462" y="138" width="198" height="52" rx="8" class="dgm-surface-2" stroke-width="1.5" />
  <rect x="462" y="138" width="198" height="52" rx="8" class="dgm-muted-stroke" fill="none" stroke-width="1.5" />
  <text x="561" y="158" text-anchor="middle" font-size="11" font-weight="bold" class="dgm-ink">Broadcast Address</text>
  <text x="561" y="176" text-anchor="middle" font-size="12" class="dgm-accent">192.168.1.255</text>
  <text x="561" y="191" text-anchor="middle" font-size="9" class="dgm-muted">(all host bits = 1)</text>

  <!-- Formula reminder -->
  <rect x="160" y="204" width="360" height="48" rx="8" class="dgm-surface-2" stroke-width="1.5" />
  <rect x="160" y="204" width="360" height="48" rx="8" class="dgm-muted-stroke" fill="none" stroke-width="1.5" />
  <text x="340" y="222" text-anchor="middle" font-size="11" class="dgm-ink">host_bits = 32 − 24 = 8</text>
  <text x="340" y="240" text-anchor="middle" font-size="11" class="dgm-ink">usable hosts = 2⁸ − 2 = <tspan font-weight="bold">254</tspan></text>
</svg>
<figcaption>A /24 block dedicates 24 bits to the network and 8 bits to hosts, yielding 256 total addresses with 254 usable after reserving the network and broadcast addresses.</figcaption>
</figure>

### The Host Count Formula

```
host_bits = 32 − prefix_length
total_addresses = 2^host_bits
usable_hosts = 2^host_bits − 2
```

Subtract 2 because the first address is the **network address** (all host bits zero) and the last is the **broadcast address** (all host bits one). Neither can be assigned to a host.

### Worked Example: Subnetting 10.0.0.0/16

You need to allocate subnets inside a VPC at `10.0.0.0/16`. You want:
- One public subnet per availability zone (3 AZs, ~250 hosts each)
- One private subnet per AZ (~500 hosts each)
- One database subnet per AZ (~50 hosts each)

Step 1 — Choose prefix lengths:
- Public subnets: /24 → 254 usable hosts ✓
- Private subnets: /23 → 510 usable hosts ✓
- Database subnets: /26 → 62 usable hosts ✓

Step 2 — Lay out the ranges (keeping subnets non-overlapping):

| Subnet | CIDR | Usable Range | Purpose |
|--------|------|--------------|---------|
| Public AZ-a | 10.0.0.0/24 | 10.0.0.1–10.0.0.254 | Public subnet, AZ us-east-1a |
| Public AZ-b | 10.0.1.0/24 | 10.0.1.1–10.0.1.254 | Public subnet, AZ us-east-1b |
| Public AZ-c | 10.0.2.0/24 | 10.0.2.1–10.0.2.254 | Public subnet, AZ us-east-1c |
| Private AZ-a | 10.0.4.0/23 | 10.0.4.1–10.0.5.254 | Private subnet, AZ us-east-1a |
| Private AZ-b | 10.0.6.0/23 | 10.0.6.1–10.0.7.254 | Private subnet, AZ us-east-1b |
| Private AZ-c | 10.0.8.0/23 | 10.0.8.1–10.0.9.254 | Private subnet, AZ us-east-1c |
| DB AZ-a | 10.0.16.0/26 | 10.0.16.1–10.0.16.62 | Database subnet, AZ us-east-1a |
| DB AZ-b | 10.0.16.64/26 | 10.0.16.65–10.0.16.126 | Database subnet, AZ us-east-1b |
| DB AZ-c | 10.0.16.128/26 | 10.0.16.129–10.0.16.190 | Database subnet, AZ us-east-1c |

> **Note:** Cloud providers reserve additional addresses inside each subnet. AWS, for example, reserves the first 4 addresses and the last 1 in every subnet, reducing usable hosts by 5.

### VLSM (Variable Length Subnet Masking)

VLSM allows different subnets within the same address space to use different prefix lengths — exactly the approach used in the example above. Each subnet is sized to its actual requirement, minimizing waste. The rule is that subnets must not overlap, and each subnet's network address must be aligned to its block size (a /23 must start on an even /24 boundary, a /26 must start at a multiple of 64, etc.).

### Free Subnet Tools

You should never do this math by hand under pressure. Use these tools:

- **[Subnet Calculator](/subnet-calculator)** — enter any IP/prefix and instantly get network address, broadcast, usable host range, and mask
- **[CIDR Checker](/cidr-checker)** — verify whether an IP falls inside a given CIDR block, check overlap between ranges
- **[Subnet Splitter](/subnet-splitter)** — divide a parent CIDR into equal or custom-sized child subnets automatically

## TCP vs UDP

Both TCP and UDP sit at Layer 4 (Transport). The choice between them is a design trade-off between reliability and speed.

### TCP — Transmission Control Protocol

TCP is **connection-oriented**: before any data flows, a three-way handshake establishes the connection.

```
Client → Server   SYN       (sequence number X)
Server → Client   SYN-ACK   (sequence number Y, ack X+1)
Client → Server   ACK       (ack Y+1)
```

<figure class="dgm" role="img" aria-label="TCP three-way handshake showing SYN from client, SYN-ACK from server, and final ACK from client before data transfer begins">
<svg viewBox="0 0 560 260" width="560" height="260" xmlns="http://www.w3.org/2000/svg">
  <!-- Client column -->
  <rect x="30" y="10" width="120" height="36" rx="8" class="dgm-accent-soft" stroke-width="1.5" />
  <rect x="30" y="10" width="120" height="36" rx="8" class="dgm-accent-stroke" fill="none" stroke-width="1.5" />
  <text x="90" y="33" text-anchor="middle" font-size="13" font-weight="bold" class="dgm-ink">Client</text>

  <!-- Server column -->
  <rect x="410" y="10" width="120" height="36" rx="8" class="dgm-accent-soft" stroke-width="1.5" />
  <rect x="410" y="10" width="120" height="36" rx="8" class="dgm-accent-stroke" fill="none" stroke-width="1.5" />
  <text x="470" y="33" text-anchor="middle" font-size="13" font-weight="bold" class="dgm-ink">Server</text>

  <!-- Lifelines -->
  <line x1="90" y1="46" x2="90" y2="240" class="dgm-muted-stroke" stroke-width="1.5" fill="none" stroke-dasharray="5 4" />
  <line x1="470" y1="46" x2="470" y2="240" class="dgm-muted-stroke" stroke-width="1.5" fill="none" stroke-dasharray="5 4" />

  <!-- Step 1: SYN -->
  <line x1="90" y1="80" x2="460" y2="110" class="dgm-accent-stroke" stroke-width="2" fill="none" />
  <polygon points="454,104 470,110 460,118" class="dgm-accent" />
  <rect x="190" y="66" width="180" height="26" rx="6" class="dgm-surface-2" />
  <text x="280" y="84" text-anchor="middle" font-size="11" font-weight="bold" class="dgm-ink">SYN  (seq=X)</text>

  <!-- Step 2: SYN-ACK -->
  <line x1="470" y1="130" x2="100" y2="160" class="dgm-ink-stroke" stroke-width="2" fill="none" />
  <polygon points="106,154 90,160 100,168" class="dgm-ink" />
  <rect x="185" y="132" width="190" height="26" rx="6" class="dgm-surface-2" />
  <text x="280" y="150" text-anchor="middle" font-size="11" font-weight="bold" class="dgm-ink">SYN-ACK  (seq=Y, ack=X+1)</text>

  <!-- Step 3: ACK -->
  <line x1="90" y1="180" x2="460" y2="210" class="dgm-accent-stroke" stroke-width="2" fill="none" />
  <polygon points="454,204 470,210 460,218" class="dgm-accent" />
  <rect x="210" y="182" width="140" height="26" rx="6" class="dgm-surface-2" />
  <text x="280" y="200" text-anchor="middle" font-size="11" font-weight="bold" class="dgm-ink">ACK  (ack=Y+1)</text>

  <!-- Connection established label -->
  <line x1="60" y1="230" x2="500" y2="230" class="dgm-muted-stroke" stroke-width="1.5" fill="none" stroke-dasharray="3 3" />
  <text x="280" y="248" text-anchor="middle" font-size="10" class="dgm-muted">Connection established — data transfer begins</text>
</svg>
<figcaption>The TCP three-way handshake: client sends SYN, server replies with SYN-ACK, client confirms with ACK, then bidirectional data flow begins.</figcaption>
</figure>

After the handshake, TCP guarantees:

- **Ordered delivery** — segments are reassembled in sequence regardless of arrival order
- **Reliable delivery** — lost segments are detected (via ACK timeout or duplicate ACKs) and retransmitted
- **Flow control** — receiver advertises a window size to prevent buffer overflow
- **Congestion control** — sender reduces rate when the network signals congestion (CUBIC, BBR, etc.)

Connection teardown uses a four-way FIN/FIN-ACK/FIN/FIN-ACK exchange, leaving connections in `TIME_WAIT` for 2×MSL (typically 60–120 seconds) to absorb delayed duplicates.

### UDP — User Datagram Protocol

UDP is **connectionless**: datagrams are fired without a handshake. There is no delivery guarantee, no ordering, and no retransmission. The sender does not know whether the packet arrived.

The upside is minimal overhead and latency. For workloads that handle their own reliability, or where a slightly stale/lost packet is acceptable, UDP wins.

### When to Use Each

| Characteristic | TCP | UDP |
|----------------|-----|-----|
| Delivery guarantee | Yes | No |
| Ordering | Yes | No |
| Connection state | Yes (SYN/FIN) | No |
| Overhead | Higher | Lower |
| Typical latency | Higher | Lower |
| Use cases | HTTP/S, SSH, databases, file transfer | DNS, DHCP, VoIP, video streaming, gaming, QUIC/HTTP3 |

> **Note:** QUIC (the underlying protocol for HTTP/3) runs over UDP but implements its own reliability, ordering, and congestion control at the application level — combining UDP's flexibility with TCP-like guarantees while eliminating head-of-line blocking.

### Inspecting TCP State

```bash
# Show all listening and established TCP connections
ss -tnp

# Show UDP sockets
ss -unp

# Filter for a specific port
ss -tnp sport = :443

# Count connections by state
ss -tan | awk 'NR>1 {print $1}' | sort | uniq -c | sort -rn
```

## Ports and Sockets

### What Is a Socket?

A **socket** is the combination of IP address and port that uniquely identifies one end of a network connection. A full TCP connection is a 4-tuple: `(src IP, src port, dst IP, dst port)`. This allows a single server IP to handle thousands of simultaneous connections to the same port — each connection's tuple is unique.

### Well-Known Ports (0–1023)

These ports are assigned by IANA and typically require root/admin privileges to bind.

| Port | Protocol | Service |
|------|----------|---------|
| 20/21 | TCP | FTP (data/control) |
| 22 | TCP | SSH |
| 23 | TCP | Telnet (insecure, avoid) |
| 25 | TCP | SMTP |
| 53 | TCP/UDP | DNS |
| 67/68 | UDP | DHCP (server/client) |
| 80 | TCP | HTTP |
| 110 | TCP | POP3 |
| 123 | UDP | NTP |
| 143 | TCP | IMAP |
| 443 | TCP | HTTPS |
| 445 | TCP | SMB |
| 514 | UDP | Syslog |
| 587 | TCP | SMTP submission (with auth) |
| 993 | TCP | IMAPS |
| 995 | TCP | POP3S |

### Registered and Ephemeral Ports

- **Registered (1024–49151):** Assigned to specific services by IANA but do not require root. Common examples: 3306 (MySQL), 5432 (PostgreSQL), 6379 (Redis), 8080 (HTTP alternate), 9200 (Elasticsearch), 27017 (MongoDB).
- **Ephemeral (49152–65535):** Assigned by the OS to the client side of outgoing connections. The range is configurable; Linux defaults to roughly 32768–60999 (check `/proc/sys/net/ipv4/ip_local_port_range`).

```bash
# Check the ephemeral port range on Linux
cat /proc/sys/net/ipv4/ip_local_port_range

# See what process owns a specific port
ss -tnlp | grep :8080

# Check if a port is open from inside the host
nc -zv 127.0.0.1 5432
```

> **Caution:** Running out of ephemeral ports under high outbound connection rates (e.g., a service hammering a downstream API) causes connection failures. Monitor with `ss -s` and widen the range if needed: `sysctl -w net.ipv4.ip_local_port_range="1024 65535"`.

## DNS

The Domain Name System translates human-readable names into IP addresses. From a DevOps perspective, DNS is a source of subtle bugs, slow failovers, and cache-related incidents.

### Resolution Flow

1. Client queries its **stub resolver** (the OS resolver, configured via `/etc/resolv.conf` or systemd-resolved)
2. Stub resolver forwards to a **recursive resolver** (e.g., `8.8.8.8`, your VPC's `.2` resolver)
3. Recursive resolver checks its cache; on a miss it begins iterative resolution:
   - Queries a **root nameserver** (one of 13 root server IPs) → gets the TLD nameserver address
   - Queries the **TLD nameserver** (e.g., `.com`, `.io`) → gets the authoritative nameserver address
   - Queries the **authoritative nameserver** for the domain → gets the final record
4. Answer is returned to the client and cached at each layer according to the TTL

```
Client → Stub Resolver → Recursive Resolver → Root NS → TLD NS → Auth NS
                                      ← ← ← (answer cached + returned) ← ← ←
```

<figure class="dgm" role="img" aria-label="DNS resolution flow from client through stub resolver and recursive resolver to root, TLD, and authoritative nameservers, with the A record returned back along the chain">
<svg viewBox="0 0 680 220" width="680" height="220" xmlns="http://www.w3.org/2000/svg">
  <!-- Boxes -->
  <!-- Client -->
  <rect x="10" y="20" width="90" height="44" rx="8" class="dgm-accent-soft" stroke-width="1.5" />
  <rect x="10" y="20" width="90" height="44" rx="8" class="dgm-accent-stroke" fill="none" stroke-width="1.5" />
  <text x="55" y="40" text-anchor="middle" font-size="11" font-weight="bold" class="dgm-ink">Client</text>
  <text x="55" y="56" text-anchor="middle" font-size="9" class="dgm-muted">browser / app</text>

  <!-- Recursive Resolver -->
  <rect x="150" y="20" width="110" height="44" rx="8" class="dgm-surface-2" stroke-width="1.5" />
  <rect x="150" y="20" width="110" height="44" rx="8" class="dgm-ink-stroke" fill="none" stroke-width="1.5" />
  <text x="205" y="40" text-anchor="middle" font-size="11" font-weight="bold" class="dgm-ink">Recursive</text>
  <text x="205" y="56" text-anchor="middle" font-size="9" class="dgm-muted">Resolver (8.8.8.8)</text>

  <!-- Root NS -->
  <rect x="320" y="20" width="90" height="44" rx="8" class="dgm-surface-2" stroke-width="1.5" />
  <rect x="320" y="20" width="90" height="44" rx="8" class="dgm-muted-stroke" fill="none" stroke-width="1.5" />
  <text x="365" y="40" text-anchor="middle" font-size="11" font-weight="bold" class="dgm-ink">Root NS</text>
  <text x="365" y="56" text-anchor="middle" font-size="9" class="dgm-muted">13 root servers</text>

  <!-- TLD NS -->
  <rect x="460" y="20" width="90" height="44" rx="8" class="dgm-surface-2" stroke-width="1.5" />
  <rect x="460" y="20" width="90" height="44" rx="8" class="dgm-muted-stroke" fill="none" stroke-width="1.5" />
  <text x="505" y="40" text-anchor="middle" font-size="11" font-weight="bold" class="dgm-ink">TLD NS</text>
  <text x="505" y="56" text-anchor="middle" font-size="9" class="dgm-muted">.com / .io / .net</text>

  <!-- Authoritative NS -->
  <rect x="590" y="20" width="84" height="44" rx="8" class="dgm-surface-2" stroke-width="1.5" />
  <rect x="590" y="20" width="84" height="44" rx="8" class="dgm-accent-stroke" fill="none" stroke-width="2" />
  <text x="632" y="40" text-anchor="middle" font-size="11" font-weight="bold" class="dgm-ink">Auth NS</text>
  <text x="632" y="56" text-anchor="middle" font-size="9" class="dgm-muted">ns1.example.com</text>

  <!-- Forward query arrows (top row) -->
  <!-- Client → Resolver -->
  <line x1="100" y1="36" x2="148" y2="36" class="dgm-accent-stroke" stroke-width="2" fill="none" />
  <polygon points="142,32 150,36 142,40" class="dgm-accent" />
  <text x="124" y="30" text-anchor="middle" font-size="9" class="dgm-muted">query</text>

  <!-- Resolver → Root -->
  <line x1="260" y1="36" x2="318" y2="36" class="dgm-ink-stroke" stroke-width="1.5" fill="none" />
  <polygon points="312,32 320,36 312,40" class="dgm-ink" />

  <!-- Root → TLD -->
  <line x1="410" y1="36" x2="458" y2="36" class="dgm-ink-stroke" stroke-width="1.5" fill="none" />
  <polygon points="452,32 460,36 452,40" class="dgm-ink" />

  <!-- TLD → Auth -->
  <line x1="550" y1="36" x2="588" y2="36" class="dgm-ink-stroke" stroke-width="1.5" fill="none" />
  <polygon points="582,32 590,36 582,40" class="dgm-ink" />

  <!-- Return arrows (bottom row) -->
  <!-- Auth → TLD return -->
  <line x1="590" y1="70" x2="552" y2="130" class="dgm-accent-stroke" stroke-width="1.5" fill="none" stroke-dasharray="5 3" />
  <line x1="460" y1="130" x2="412" y2="130" class="dgm-accent-stroke" stroke-width="1.5" fill="none" stroke-dasharray="5 3" />
  <line x1="320" y1="130" x2="262" y2="130" class="dgm-accent-stroke" stroke-width="1.5" fill="none" stroke-dasharray="5 3" />
  <line x1="150" y1="130" x2="102" y2="130" class="dgm-accent-stroke" stroke-width="1.5" fill="none" stroke-dasharray="5 3" />
  <polygon points="108,126 100,130 108,134" class="dgm-accent" />

  <!-- Return path label -->
  <rect x="200" y="110" width="260" height="32" rx="6" class="dgm-surface-2" />
  <text x="330" y="126" text-anchor="middle" font-size="10" class="dgm-muted">A record returned + cached by TTL</text>
  <text x="330" y="140" text-anchor="middle" font-size="10" font-weight="bold" class="dgm-ink">example.com → 93.184.216.34</text>

  <!-- Label: query type -->
  <text x="340" y="180" text-anchor="middle" font-size="10" class="dgm-muted">Cache miss: resolver walks Root → TLD → Authoritative iteratively</text>
  <text x="340" y="196" text-anchor="middle" font-size="10" class="dgm-muted">Cache hit: resolver returns immediately without contacting upstream servers</text>
</svg>
<figcaption>On a cache miss the recursive resolver walks root, TLD, and authoritative nameservers iteratively; each answer is cached by its TTL so subsequent queries resolve instantly.</figcaption>
</figure>

### DNS Record Types

| Record | Purpose | Example |
|--------|---------|---------|
| A | IPv4 address for a hostname | `api.example.com → 93.184.216.34` |
| AAAA | IPv6 address for a hostname | `api.example.com → 2606:2800::1` |
| CNAME | Alias; points to another hostname | `www.example.com → example.com` |
| MX | Mail exchange server(s), with priority | `example.com → 10 mail.example.com` |
| TXT | Arbitrary text; used for SPF, DKIM, domain verification | `v=spf1 include:_spf.google.com ~all` |
| NS | Authoritative nameservers for a zone | `example.com → ns1.route53.aws` |
| SOA | Start of Authority; zone metadata | Serial, refresh, retry, expire, TTL |
| PTR | Reverse DNS (IP → name) | `34.216.184.93.in-addr.arpa → api.example.com` |
| SRV | Service location (protocol, port, host) | `_http._tcp.example.com → 0 5 80 api.example.com` |
| CAA | Certificate Authority Authorization | Limits which CAs may issue certs for the domain |

### TTL and Caching

TTL (Time To Live) is set on each record and controls how long resolvers cache the answer. Low TTLs (30–60 seconds) enable fast failover; high TTLs (3600+) reduce resolver load and query latency. The classic incident pattern: TTL is 3600, a record is changed, but old IPs continue serving traffic for up to an hour because downstream caches haven't expired yet.

> **Tip:** Before a planned IP change or failover, lower the TTL to 60–120 seconds at least 2× the current TTL in advance (so caches expire before the change window). After the change, restore the original TTL.

### DNS Debugging

```bash
# Basic A record lookup
dig example.com

# Query a specific record type
dig example.com MX
dig example.com TXT

# Query a specific nameserver directly (bypass local cache)
dig @8.8.8.8 example.com A

# Trace the full resolution chain from root
dig +trace example.com

# Reverse lookup (PTR)
dig -x 93.184.216.34

# Show only the answer section, short output
dig +short example.com

# Check DNS propagation from the authoritative server
dig @ns1.example.com example.com A +norecurse

# nslookup (simpler, available everywhere)
nslookup example.com
nslookup -type=MX example.com 8.8.8.8
```

Use the [Reverse DNS / PTR](/reverse-dns-ptr) tool to look up the hostname registered for any IP — useful for verifying that mail server PTR records are set correctly and for identifying infrastructure from IPs you see in logs.

> **Note:** `/etc/hosts` takes precedence over DNS on most Linux systems. During incident response, check whether a stale hosts entry is masking a real DNS record.

## HTTP and HTTPS/TLS

### HTTP Methods and Semantics

HTTP is the application-layer protocol powering almost every API and web interface in a DevOps toolchain.

| Method | Semantics | Idempotent | Safe |
|--------|-----------|-----------|------|
| GET | Retrieve a resource | Yes | Yes |
| HEAD | Retrieve headers only | Yes | Yes |
| POST | Submit data / create resource | No | No |
| PUT | Replace a resource entirely | Yes | No |
| PATCH | Partial update | No | No |
| DELETE | Remove a resource | Yes | No |
| OPTIONS | Describe allowed methods | Yes | Yes |

### HTTP Status Code Families

| Range | Meaning | Common Examples |
|-------|---------|----------------|
| 1xx | Informational | 101 Switching Protocols (WebSocket upgrade) |
| 2xx | Success | 200 OK, 201 Created, 204 No Content |
| 3xx | Redirection | 301 Moved Permanently, 302 Found, 304 Not Modified |
| 4xx | Client error | 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 429 Too Many Requests |
| 5xx | Server error | 500 Internal Server Error, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout |

> **Tip:** In a reverse proxy setup, `502 Bad Gateway` usually means the upstream (your app) returned an invalid response or crashed. `504 Gateway Timeout` means the upstream was too slow. These two codes point you toward the application tier, not the proxy.

### The TLS Handshake

HTTPS wraps HTTP inside TLS (Transport Layer Security). The handshake negotiates a shared symmetric key using asymmetric cryptography, then all subsequent data is encrypted with that key.

**TLS 1.3 handshake (simplified):**

```
Client → Server: ClientHello  (supported cipher suites, TLS version, random nonce, key_share)
Server → Client: ServerHello  (chosen cipher, key_share)
Server → Client: Certificate  (server's X.509 cert chain)
Server → Client: Finished     (handshake complete, encrypted)
Client → Server: Finished     (handshake complete, encrypted)
--- Application data now flows encrypted ---
```

TLS 1.3 reduces the handshake to 1 round-trip (1-RTT), and supports 0-RTT resumption for returning clients, significantly reducing latency versus TLS 1.2.

### Certificates

An X.509 certificate binds a public key to a domain name (or wildcard like `*.example.com`), signed by a Certificate Authority (CA) that browsers and operating systems trust. Key fields:

- **Subject / CN (Common Name):** The hostname the cert covers
- **SAN (Subject Alternative Names):** Additional hostnames (modern certs use SAN; CN alone is deprecated)
- **Issuer:** The CA that signed the certificate
- **Validity period:** `Not Before` / `Not After` — expiry causes widespread outages
- **Key usage / Extended Key Usage:** Restricts what the cert can be used for

```bash
# Inspect a remote certificate
openssl s_client -connect example.com:443 -servername example.com </dev/null 2>/dev/null | openssl x509 -noout -text

# Check expiry date only
echo | openssl s_client -connect example.com:443 2>/dev/null | openssl x509 -noout -dates

# Verify a cert file locally
openssl x509 -in cert.pem -noout -text

# Test TLS with curl, verbose (shows handshake)
curl -vvv https://example.com 2>&1 | grep -A5 "TLS\|SSL\|certificate"
```

> **Caution:** Certificate expiry is one of the most common causes of production outages. Automate renewal (Let's Encrypt / Certbot, AWS ACM auto-renew, cert-manager in Kubernetes) and set monitoring alerts at 30 days and 7 days before expiry.

## Load Balancing and Reverse Proxies

### What a Load Balancer Does

A load balancer distributes incoming connections or requests across a pool of backend servers. Goals: eliminate single points of failure, allow horizontal scaling, and enable zero-downtime deploys through rolling updates and connection draining.

### L4 vs L7 Load Balancing

**L4 (Transport layer):** Routes based on IP address and TCP/UDP port only. The load balancer forwards packets or proxies TCP connections without inspecting content. Fast and protocol-agnostic.

- Examples: AWS NLB, HAProxy in TCP mode, Linux IPVS
- Use for: raw TCP throughput, non-HTTP protocols (databases, gRPC over raw TCP, game servers), lowest possible latency

**L7 (Application layer):** Understands HTTP(S). Can inspect and route on Host header, URL path, request method, cookies, or any header. Can terminate TLS, add/remove headers, rewrite URLs, and return synthetic responses.

- Examples: AWS ALB, NGINX, HAProxy in HTTP mode, Envoy, Traefik, Caddy
- Use for: microservices routing, canary deployments, A/B testing, authentication offloading, WebSocket upgrades

| Feature | L4 | L7 |
|---------|----|----|
| Routing basis | IP + port | Host, path, headers, cookies |
| TLS termination | Pass-through or terminate | Terminate + re-encrypt (mTLS) |
| Health checks | TCP connect | HTTP GET / gRPC health |
| Latency overhead | Minimal | Slightly higher |
| Observability | Connection-level | Request-level metrics |

<figure class="dgm" role="img" aria-label="Side-by-side comparison of L4 load balancing routing by IP and port versus L7 load balancing routing by HTTP host header and URL path">
<svg viewBox="0 0 680 300" width="680" height="300" xmlns="http://www.w3.org/2000/svg">
  <!-- L4 Panel -->
  <rect x="10" y="10" width="318" height="280" rx="8" class="dgm-surface-2" stroke-width="1.5" />
  <rect x="10" y="10" width="318" height="280" rx="8" class="dgm-muted-stroke" fill="none" stroke-width="1.5" />

  <rect x="10" y="10" width="318" height="36" rx="8" class="dgm-ink" />
  <text x="169" y="33" text-anchor="middle" font-size="13" font-weight="bold" fill="white">L4 — Transport Layer</text>

  <!-- L4 client -->
  <rect x="30" y="62" width="80" height="36" rx="6" class="dgm-surface-2" stroke-width="1.5" />
  <rect x="30" y="62" width="80" height="36" rx="6" class="dgm-ink-stroke" fill="none" stroke-width="1.5" />
  <text x="70" y="84" text-anchor="middle" font-size="11" class="dgm-ink">Client</text>

  <!-- L4 LB -->
  <rect x="145" y="62" width="80" height="36" rx="6" class="dgm-accent-soft" stroke-width="1.5" />
  <rect x="145" y="62" width="80" height="36" rx="6" class="dgm-accent-stroke" fill="none" stroke-width="2" />
  <text x="185" y="78" text-anchor="middle" font-size="10" font-weight="bold" class="dgm-ink">L4 Load</text>
  <text x="185" y="92" text-anchor="middle" font-size="10" font-weight="bold" class="dgm-ink">Balancer</text>

  <!-- L4 route label -->
  <text x="169" y="120" text-anchor="middle" font-size="10" class="dgm-muted">Routing basis: IP + port only</text>

  <!-- L4 backends -->
  <rect x="245" y="140" width="70" height="32" rx="6" class="dgm-surface-2" stroke-width="1.5" />
  <rect x="245" y="140" width="70" height="32" rx="6" class="dgm-muted-stroke" fill="none" stroke-width="1.5" />
  <text x="280" y="160" text-anchor="middle" font-size="10" class="dgm-ink">Server A</text>

  <rect x="245" y="184" width="70" height="32" rx="6" class="dgm-surface-2" stroke-width="1.5" />
  <rect x="245" y="184" width="70" height="32" rx="6" class="dgm-muted-stroke" fill="none" stroke-width="1.5" />
  <text x="280" y="204" text-anchor="middle" font-size="10" class="dgm-ink">Server B</text>

  <rect x="245" y="228" width="70" height="32" rx="6" class="dgm-surface-2" stroke-width="1.5" />
  <rect x="245" y="228" width="70" height="32" rx="6" class="dgm-muted-stroke" fill="none" stroke-width="1.5" />
  <text x="280" y="248" text-anchor="middle" font-size="10" class="dgm-ink">Server C</text>

  <!-- L4 arrows: client → LB → servers -->
  <line x1="110" y1="80" x2="143" y2="80" class="dgm-ink-stroke" stroke-width="1.5" fill="none" />
  <polygon points="137,76 145,80 137,84" class="dgm-ink" />
  <line x1="225" y1="80" x2="244" y2="156" class="dgm-ink-stroke" stroke-width="1.5" fill="none" />
  <polygon points="241,150 245,158 249,150" class="dgm-ink" />
  <line x1="225" y1="80" x2="244" y2="200" class="dgm-ink-stroke" stroke-width="1.5" fill="none" />
  <polygon points="241,194 245,202 249,194" class="dgm-ink" />
  <line x1="225" y1="80" x2="244" y2="244" class="dgm-ink-stroke" stroke-width="1.5" fill="none" />
  <polygon points="241,238 245,246 249,238" class="dgm-ink" />

  <text x="169" y="275" text-anchor="middle" font-size="9" class="dgm-muted">AWS NLB · HAProxy TCP · IPVS</text>

  <!-- L7 Panel -->
  <rect x="352" y="10" width="318" height="280" rx="8" class="dgm-surface-2" stroke-width="1.5" />
  <rect x="352" y="10" width="318" height="280" rx="8" class="dgm-accent-stroke" fill="none" stroke-width="1.5" />

  <rect x="352" y="10" width="318" height="36" rx="8" class="dgm-accent" />
  <text x="511" y="33" text-anchor="middle" font-size="13" font-weight="bold" fill="white">L7 — Application Layer</text>

  <!-- L7 client -->
  <rect x="372" y="62" width="80" height="36" rx="6" class="dgm-surface-2" stroke-width="1.5" />
  <rect x="372" y="62" width="80" height="36" rx="6" class="dgm-ink-stroke" fill="none" stroke-width="1.5" />
  <text x="412" y="84" text-anchor="middle" font-size="11" class="dgm-ink">Client</text>

  <!-- L7 LB -->
  <rect x="487" y="55" width="80" height="50" rx="6" class="dgm-accent-soft" stroke-width="1.5" />
  <rect x="487" y="55" width="80" height="50" rx="6" class="dgm-accent-stroke" fill="none" stroke-width="2" />
  <text x="527" y="73" text-anchor="middle" font-size="10" font-weight="bold" class="dgm-ink">L7 Load</text>
  <text x="527" y="86" text-anchor="middle" font-size="10" font-weight="bold" class="dgm-ink">Balancer</text>
  <text x="527" y="99" text-anchor="middle" font-size="8" class="dgm-muted">(inspects HTTP)</text>

  <!-- L7 route labels inside LB -->
  <rect x="372" y="120" width="278" height="28" rx="6" class="dgm-accent-soft" stroke-width="1" />
  <rect x="372" y="120" width="278" height="28" rx="6" class="dgm-accent-stroke" fill="none" stroke-width="1" />
  <text x="511" y="138" text-anchor="middle" font-size="9" class="dgm-ink">Routes on: Host header · URL path · Cookie · Method</text>

  <!-- L7 backends with route rules -->
  <rect x="579" y="140" width="84" height="32" rx="6" class="dgm-surface-2" stroke-width="1.5" />
  <rect x="579" y="140" width="84" height="32" rx="6" class="dgm-muted-stroke" fill="none" stroke-width="1.5" />
  <text x="621" y="156" text-anchor="middle" font-size="9" font-weight="bold" class="dgm-ink">/api/*</text>
  <text x="621" y="168" text-anchor="middle" font-size="9" class="dgm-muted">API service</text>

  <rect x="579" y="184" width="84" height="32" rx="6" class="dgm-surface-2" stroke-width="1.5" />
  <rect x="579" y="184" width="84" height="32" rx="6" class="dgm-muted-stroke" fill="none" stroke-width="1.5" />
  <text x="621" y="200" text-anchor="middle" font-size="9" font-weight="bold" class="dgm-ink">app.example</text>
  <text x="621" y="212" text-anchor="middle" font-size="9" class="dgm-muted">App service</text>

  <rect x="579" y="228" width="84" height="32" rx="6" class="dgm-surface-2" stroke-width="1.5" />
  <rect x="579" y="228" width="84" height="32" rx="6" class="dgm-muted-stroke" fill="none" stroke-width="1.5" />
  <text x="621" y="244" text-anchor="middle" font-size="9" font-weight="bold" class="dgm-ink">canary=true</text>
  <text x="621" y="256" text-anchor="middle" font-size="9" class="dgm-muted">Canary pods</text>

  <!-- L7 arrows -->
  <line x1="452" y1="80" x2="485" y2="80" class="dgm-ink-stroke" stroke-width="1.5" fill="none" />
  <polygon points="479,76 487,80 479,84" class="dgm-ink" />
  <line x1="567" y1="80" x2="578" y2="156" class="dgm-accent-stroke" stroke-width="1.5" fill="none" />
  <polygon points="575,150 579,158 583,150" class="dgm-accent" />
  <line x1="567" y1="80" x2="578" y2="200" class="dgm-accent-stroke" stroke-width="1.5" fill="none" />
  <polygon points="575,194 579,202 583,194" class="dgm-accent" />
  <line x1="567" y1="80" x2="578" y2="244" class="dgm-accent-stroke" stroke-width="1.5" fill="none" />
  <polygon points="575,238 579,246 583,238" class="dgm-accent" />

  <text x="511" y="275" text-anchor="middle" font-size="9" class="dgm-muted">AWS ALB · NGINX · Envoy · Traefik</text>
</svg>
<figcaption>L4 load balancers forward TCP/UDP connections by IP and port alone; L7 load balancers inspect HTTP and can route each request by host, path, headers, or cookies.</figcaption>
</figure>

### Load Balancing Algorithms

| Algorithm | Behaviour | Best For |
|-----------|-----------|----------|
| Round Robin | Distribute in order | Homogeneous backends |
| Least Connections | Route to backend with fewest active connections | Variable request duration |
| IP Hash | Route same client IP to same backend | Session affinity (sticky sessions) |
| Weighted Round Robin | Distribute proportionally by weight | Mixed-capacity backends |
| Random | Pick at random | Simple, low overhead |

### Health Checks

Health checks detect failed backends and remove them from rotation. Key parameters:

- **Path / port:** What the load balancer probes (e.g., `GET /healthz`)
- **Interval:** How often to probe (e.g., every 10 seconds)
- **Timeout:** How long to wait for a response before counting a failure
- **Healthy threshold:** Consecutive successes required to mark healthy
- **Unhealthy threshold:** Consecutive failures required to remove from rotation

> **Tip:** Design `/healthz` to return 200 only when the application is genuinely ready to serve traffic — not just that the process started. Check database connectivity, cache availability, and any critical dependency.

### Common Reverse Proxy / Load Balancer Software

- **NGINX:** High-performance HTTP server and reverse proxy; excellent for static file serving, TLS termination, upstream proxying
- **HAProxy:** Purpose-built proxy; extremely reliable, detailed metrics, supports both L4 and L7
- **Envoy:** Cloud-native L7 proxy; the data plane behind Istio, Consul Connect, and AWS App Mesh; first-class gRPC support
- **Traefik:** Auto-discovers Docker/Kubernetes services and configures itself from labels/annotations
- **Caddy:** Automatic HTTPS with built-in Let's Encrypt; simple configuration syntax

```bash
# Test if NGINX config is valid before reload
nginx -t

# Reload NGINX without dropping connections
nginx -s reload

# Check upstream health in HAProxy (stats page)
# Enable in haproxy.cfg: stats uri /haproxy-stats
curl http://localhost/haproxy-stats
```

## Firewalls and Security Groups

### Stateful vs Stateless Filtering

**Stateless firewalls** (e.g., AWS Network ACLs, classic ACL on a router) evaluate each packet independently against a rule list. They have no memory of connection state. To allow return traffic for an outbound TCP connection, you must explicitly permit inbound traffic on the ephemeral port range.

**Stateful firewalls** (e.g., Linux `iptables`/`nftables`, AWS Security Groups, `firewalld`) track connection state. If outbound traffic is permitted, return packets for that connection are automatically allowed — you only write rules for traffic initiation.

### iptables Basics

`iptables` organises rules into **tables** (filter, nat, mangle, raw) and **chains** (INPUT, FORWARD, OUTPUT, plus custom). The `filter` table is the default and handles accept/drop decisions.

```bash
# List all filter rules with line numbers
iptables -L -n -v --line-numbers

# Allow inbound SSH
iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# Allow established/related return traffic (stateful)
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Drop everything else inbound (default deny)
iptables -P INPUT DROP

# Allow a specific source IP to reach port 5432
iptables -A INPUT -s 10.0.1.0/24 -p tcp --dport 5432 -j ACCEPT

# Save rules (Debian/Ubuntu)
iptables-save > /etc/iptables/rules.v4

# View NAT table (SNAT/DNAT/MASQUERADE rules)
iptables -t nat -L -n -v
```

> **Note:** `nftables` is the modern replacement for `iptables` on Linux. It uses a unified table/chain model with improved performance and atomic rule updates. Both remain common; many distributions still default to `iptables` wrappers over `nftables`.

### Cloud Security Groups

Cloud security groups (AWS, GCP, Azure) are **stateful, VM-level virtual firewalls** applied to network interfaces. Key characteristics:

- Rules specify direction (inbound/outbound), protocol, port range, and source/destination (CIDR or another security group ID)
- Default deny: traffic is blocked unless explicitly permitted
- Changes take effect immediately — no restart needed
- In AWS, Security Groups are distinct from Network ACLs (NACLs); NACLs are stateless and operate at the subnet level

```bash
# List security groups for a VPC (AWS CLI)
aws ec2 describe-security-groups --filters "Name=vpc-id,Values=vpc-0abc123"

# Describe inbound rules for a specific group
aws ec2 describe-security-groups --group-ids sg-0abc123 \
  --query 'SecurityGroups[*].IpPermissions'

# Add an inbound rule (allow HTTPS from anywhere)
aws ec2 authorize-security-group-ingress \
  --group-id sg-0abc123 \
  --protocol tcp --port 443 --cidr 0.0.0.0/0
```

### Common Firewall Patterns

| Scenario | Rule |
|----------|------|
| Allow SSH from bastion only | Inbound TCP 22 from bastion security group |
| Allow all outbound internet | Outbound all, 0.0.0.0/0 |
| Restrict database to app tier | Inbound TCP 5432 from app security group only |
| Allow health checks | Inbound TCP 80/443 from load balancer security group |
| Block ICMP ping | No inbound rule for protocol ICMP (implicit deny) |

> **Caution:** Avoid `0.0.0.0/0` on inbound rules for management ports (SSH, RDP, database ports). Use a bastion/jump host, VPN, or AWS Session Manager instead.

## NAT

Network Address Translation allows hosts with private IP addresses to communicate with the public internet by rewriting IP addresses in transit.

### SNAT (Source NAT / Masquerade)

The most common form: a router or gateway rewrites the source IP of outbound packets from a private address to its own public IP, maintaining a connection-tracking table to forward return traffic back to the correct private host.

In cloud environments this is the **NAT Gateway** (AWS) or **Cloud NAT** (GCP). Private subnet instances route internet-bound traffic to the NAT gateway; return traffic is forwarded back automatically.

```bash
# Enable IP forwarding on a Linux NAT host
echo 1 > /proc/sys/net/ipv4/ip_forward
sysctl -w net.ipv4.ip_forward=1

# MASQUERADE rule: outbound traffic on eth0 gets the host's public IP
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
```

### DNAT (Destination NAT / Port Forwarding)

DNAT rewrites the destination IP (and optionally port) of inbound packets. This is how port forwarding works: traffic arriving at a public IP on port 8080 is redirected to an internal host at port 80.

```bash
# Forward external port 8080 to internal host 10.0.1.5:80
iptables -t nat -A PREROUTING -p tcp --dport 8080 \
  -j DNAT --to-destination 10.0.1.5:80

# Also enable forwarding for the redirected traffic
iptables -A FORWARD -p tcp -d 10.0.1.5 --dport 80 -j ACCEPT
```

### NAT in Kubernetes

Kubernetes relies heavily on NAT internally:
- `kube-proxy` (iptables mode) installs DNAT rules that redirect Service ClusterIP traffic to a real Pod IP
- NodePort Services use DNAT to redirect external traffic arriving on a node's port to the correct pod
- CNI plugins implement pod-to-internet SNAT for pods with no public IP

## MAC Addresses and ARP

### MAC Addresses

A **MAC (Media Access Control) address** is a 48-bit Layer 2 hardware address assigned to a network interface. It is written as six colon- or hyphen-separated pairs of hex bytes: `aa:bb:cc:dd:ee:ff`.

The first three bytes (OUI — Organizationally Unique Identifier) identify the manufacturer; the last three bytes are device-specific. MAC addresses are used for delivery within a single Layer 2 segment (broadcast domain). Routers do not forward MAC addresses between segments — IP (Layer 3) handles inter-segment routing.

Use the [MAC Address Formatter](/mac-address-formatter) to normalize MAC addresses between colon, hyphen, and Cisco dotted-quad formats, and to look up the manufacturer OUI for any address.

### ARP — Address Resolution Protocol

ARP resolves an IPv4 address to a MAC address within a local subnet. When host A wants to send a packet to `10.0.1.5` (same subnet), it broadcasts an ARP request: "Who has `10.0.1.5`? Tell `10.0.1.1`." The host with that IP replies with its MAC address. A then writes the MAC into the Ethernet frame header and transmits.

ARP replies are cached in an **ARP table** (also called ARP cache) with a short TTL (typically 20–30 minutes on Linux).

```bash
# Show the ARP cache
arp -n
ip neigh show

# Send a gratuitous ARP (announce MAC change)
arping -I eth0 -c 3 10.0.1.5

# Flush the ARP cache for an interface
ip neigh flush dev eth0
```

**ARP in virtual/cloud environments:** Virtual switches and hypervisors handle ARP within a physical host. Cloud providers use proxy ARP or ARP suppression to avoid broadcast storms across large Layer 2 domains. In Kubernetes, the CNI plugin handles L2 within a node; cross-node traffic is routed at L3.

> **Note:** ARP spoofing (sending gratuitous ARP replies with a false MAC) is a common Man-in-the-Middle attack vector on flat L2 networks. Mitigation: Dynamic ARP Inspection (DAI) on managed switches, or move to routed L3-only designs.

## Network Troubleshooting Toolkit

Systematic troubleshooting follows the OSI model from the bottom up: is the interface up? Can I reach the gateway? Can I resolve DNS? Can I complete a TCP handshake? Can I get an HTTP 200? Each step isolates a layer. The commands below (`ping`, `dig`, `ss`, `tcpdump`) are Linux utilities; see [Linux for DevOps](/learn/guides/linux-for-devops) for the broader shell environment they live in.

### ping — ICMP Reachability

```bash
# Basic connectivity test
ping -c 4 8.8.8.8

# Set packet size (test MTU issues)
ping -c 4 -s 1472 8.8.8.8   # 1472 + 28 byte ICMP/IP header = 1500 (standard MTU)

# Ping with interval
ping -i 0.2 -c 20 10.0.1.5
```

**What it tells you:** Whether L3 reachability exists and roughly what the round-trip latency looks like. ICMP blocked by a firewall will make a host appear unreachable even when TCP services are fine.

### traceroute / mtr — Path Discovery

```bash
# Trace the route to a host (UDP probes on Linux)
traceroute 8.8.8.8

# Use ICMP probes (works where UDP is blocked)
traceroute -I 8.8.8.8

# Use TCP SYN on port 80 (works through most firewalls)
traceroute -T -p 80 8.8.8.8

# mtr: real-time traceroute with packet loss per hop
mtr 8.8.8.8

# mtr non-interactive report (good for pasting into tickets)
mtr --report --report-cycles 20 8.8.8.8
```

**What it tells you:** Which hop introduces latency, where packet loss starts, and whether traffic takes an unexpected path.

### dig — DNS Interrogation

```bash
# Full record lookup with TTL
dig example.com A

# Query a specific resolver
dig @1.1.1.1 example.com

# Trace resolution from root
dig +trace example.com

# Check DNSSEC
dig +dnssec example.com

# Check MX records
dig example.com MX +short

# Reverse lookup
dig -x 93.184.216.34
```

**What it tells you:** Whether DNS resolution succeeds, which nameserver answered, the TTL remaining on a cached record, and whether DNSSEC is valid.

### ss / netstat — Socket State

```bash
# All listening TCP sockets with process name
ss -tnlp

# All established connections
ss -tn state established

# Count connections per remote IP (find abusive clients)
ss -tn state established | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn | head

# Socket summary (total connections by state)
ss -s

# Legacy equivalent (older systems)
netstat -tnlp
netstat -s   # protocol statistics
```

**What it tells you:** What is actually listening, whether connections are accumulating in `TIME_WAIT` or `CLOSE_WAIT`, and which process owns a port.

### tcpdump — Packet Capture

```bash
# Capture all traffic on eth0
tcpdump -i eth0

# Capture only traffic on port 443
tcpdump -i eth0 port 443

# Capture TCP SYN packets (new connection attempts)
tcpdump -i eth0 'tcp[tcpflags] & (tcp-syn) != 0'

# Capture ICMP
tcpdump -i eth0 icmp

# Write to file for Wireshark analysis
tcpdump -i eth0 -w /tmp/capture.pcap

# Read a capture file
tcpdump -r /tmp/capture.pcap

# Show packet contents in ASCII
tcpdump -i eth0 -A port 80

# Capture DNS traffic
tcpdump -i eth0 udp port 53
```

**What it tells you:** Exactly what traffic is on the wire. Indispensable for confirming that packets are being sent and received, diagnosing TLS errors, and verifying firewall behavior.

### curl — HTTP Testing

```bash
# Basic HTTP request
curl https://example.com

# Follow redirects, show headers
curl -L -I https://example.com

# Verbose output (full request/response headers, TLS handshake)
curl -v https://example.com

# Test with a specific DNS resolution (bypass DNS)
curl --resolve example.com:443:93.184.216.34 https://example.com

# Time each phase of the request
curl -w "\nDNS: %{time_namelookup}s\nConnect: %{time_connect}s\nTLS: %{time_appconnect}s\nFirst byte: %{time_starttransfer}s\nTotal: %{time_total}s\n" \
  -o /dev/null -s https://example.com

# Send a POST with JSON body
curl -X POST https://api.example.com/v1/items \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"widget"}'

# Test a health endpoint
curl -sf https://api.example.com/healthz || echo "UNHEALTHY"
```

**What it tells you:** Whether an HTTP service is reachable, what headers and status codes it returns, how long each phase of the request takes, and whether TLS is configured correctly.

### nc (netcat) — TCP/UDP Probe

```bash
# Test TCP connectivity to a host/port
nc -zv 10.0.1.5 5432

# Test UDP
nc -zuv 10.0.1.5 53

# Listen for TCP connections on a port (useful to verify firewall rules)
nc -l 8080

# Simple port scan of a range
nc -zv 10.0.1.5 20-25
```

**What it tells you:** Whether a TCP handshake can be completed to a specific port, isolating network/firewall issues from application issues.

### Quick Troubleshooting Checklist

```
1. Interface up?          ip link show
2. IP assigned?           ip addr show
3. Default route?         ip route show
4. Can reach gateway?     ping <gateway IP>
5. Can reach internet?    ping 8.8.8.8
6. DNS working?           dig google.com
7. Target TCP port open?  nc -zv <host> <port>
8. HTTP response?         curl -v http://<host>:<port>
9. TLS valid?             curl -v https://<host>
10. App responding?       curl https://<host>/healthz
```

## Common Networking Interview Questions

**Q: What is the difference between a router and a switch?**
A: A switch operates at Layer 2 — it forwards Ethernet frames within a single broadcast domain using MAC address tables. A router operates at Layer 3 — it forwards IP packets between different networks using routing tables, connecting separate subnets.

**Q: How many usable hosts are in a /27 subnet?**
A: Host bits = 32 − 27 = 5. Total addresses = 2⁵ = 32. Usable hosts = 32 − 2 = 30 (subtract network address and broadcast address).

**Q: You can ping a server but cannot SSH to it. What is the likely cause?**
A: ICMP is allowed (so L3 is fine) but TCP port 22 is blocked. Most likely causes: firewall rule or security group blocks inbound port 22, SSH daemon is not running, or SSH is listening on a non-standard port. Check: `nc -zv <host> 22` and `ss -tnlp | grep :22` on the server.

**Q: What happens when you type a URL into a browser?**
A: DNS resolves the hostname to an IP. A TCP connection is established (3-way handshake). TLS handshake occurs if HTTPS. An HTTP GET request is sent. The server processes and returns a response. The browser renders the HTML, making additional requests for assets (CSS, JS, images). Keep-alive connections reuse the TCP connection for multiple requests.

**Q: What is the difference between NAT and a proxy?**
A: NAT rewrites IP headers at L3/L4 transparently — the application is unaware. A proxy operates at L7, establishing separate connections on each side and understanding the application protocol (HTTP, etc.). A proxy can inspect, log, and modify application-level data; NAT cannot.

**Q: What does a 502 Bad Gateway error mean?**
A: The reverse proxy or load balancer received an invalid response (or no response) from the upstream server. The proxy is reachable, but the backend application is not responding correctly — crashed, overloaded, or returning a malformed response.

**Q: How would you verify that a DNS change has propagated?**
A: Query the authoritative nameserver directly (`dig @ns1.example.com example.com`) to confirm the change is live at the source. Then query public resolvers (`dig @8.8.8.8`, `dig @1.1.1.1`) to check whether their caches have expired. Use `dig +trace` to walk the resolution chain. Also check the TTL on the old record to understand the maximum propagation delay.

**Q: Explain the TCP TIME_WAIT state and why it matters.**
A: After the active close side sends the final ACK, it enters TIME_WAIT for 2×MSL (Maximum Segment Lifetime, typically 60 seconds). This prevents delayed duplicate packets from a closed connection being accepted as part of a new connection with the same 4-tuple. Under high connection rates, large numbers of TIME_WAIT sockets can exhaust ephemeral ports. Mitigation: enable `SO_REUSEADDR`, increase ephemeral port range, or use persistent connections / connection pooling.

**Q: What is VLAN and why is it used?**
A: A VLAN (Virtual LAN) logically segments a physical L2 network into isolated broadcast domains using 802.1Q tagging on Ethernet frames. Traffic in different VLANs cannot communicate without routing through a Layer 3 device. VLANs are used to isolate environments (prod/staging/dev), separate traffic types (management vs. data), and improve security without requiring separate physical switches.

**Q: What is BGP and where do DevOps engineers encounter it?**
A: BGP (Border Gateway Protocol) is the routing protocol that exchanges routes between autonomous systems on the internet. DevOps engineers encounter it in AWS Direct Connect (BGP advertises your on-premises routes to AWS), Transit Gateway, and in tools like MetalLB (which uses BGP to advertise Kubernetes service IPs to upstream routers in bare-metal clusters).

## What's Next

Networking knowledge is most powerful when combined with hands-on command-line proficiency. Pair this with the command-line side in [Linux for DevOps](/learn/guides/linux-for-devops), where you'll see how the same `ss`, `ip`, and `tcpdump` commands fit into a broader systems administration workflow.

For immediate hands-on practice, use the subnet tools linked throughout this guide — in particular the [Subnet Calculator](/subnet-calculator) and [Subnet Splitter](/subnet-splitter) — to work through VPC design exercises until the CIDR arithmetic feels automatic.
