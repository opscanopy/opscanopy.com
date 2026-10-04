---
title: "The complete guide to private IP address ranges (RFC 1918)"
description: "The three RFC 1918 private IP ranges, why 172.16.0.0/12 catches people out, the addresses that look private but aren't, and how to pick a range that won't collide."
pubDate: 2026-09-17
tags: ["networking", "security"]
relatedTool:
  name: "Subnet Calculator"
  href: "/subnet-calculator"
---

![Three nested address blocks representing the RFC 1918 private ranges 10.0.0.0/8, 172.16.0.0/12 and 192.168.0.0/16](/blog/private-ip-address-ranges-rfc-1918-hero.svg)
<!-- keywords: private ip address ranges | rfc 1918, private ip ranges, is 172.32 private, 172.16.0.0/12 range, 100.64.0.0/10 | source: marketing brief, ahrefs unchecked (2026-10-04) -->

A security group rule says "allow from private networks", and someone has written `172.0.0.0/8`. It looks reasonable. It also opens the port to roughly 15 million public addresses, because only one sixteenth of that block is private. Private address space is small, precisely defined, and easy to misremember, and the mistakes show up as firewall holes, VPN routes that silently go nowhere, and VPC peering requests that the cloud refuses.

This post is the reference: the three ranges, the edge that trips people up, the blocks that look private and aren't, and how to choose a range you won't regret.

## The three private IP address ranges

RFC 1918, published in 1996 as BCP 5, sets aside three IPv4 blocks for use inside private networks. Nobody is assigned them, nobody routes them on the public internet, and anyone can reuse them behind their own edge.

| Block | Range | Addresses | Typical use |
|---|---|---|---|
| `10.0.0.0/8` | 10.0.0.0 – 10.255.255.255 | 16,777,216 | Large enterprises, cloud VPCs, Kubernetes pod networks |
| `172.16.0.0/12` | 172.16.0.0 – 172.31.255.255 | 1,048,576 | Docker defaults, the AWS default VPC (`172.31.0.0/16`) |
| `192.168.0.0/16` | 192.168.0.0 – 192.168.255.255 | 65,536 | Home routers, small offices, lab networks |

Each one has a worked page if you want the network, mask and host counts laid out: [10.0.0.0/8](/subnet-calculator/10-0-0-0-8/), [172.16.0.0/12](/subnet-calculator/172-16-0-0-12/) and [192.168.0.0/16](/subnet-calculator/192-168-0-0-16/). The block most people have actually typed is the home-router `/24`, [192.168.1.0/24](/subnet-calculator/192-168-1-0-24/).

Note what RFC 1918 does not say. It doesn't say these addresses are secure, hidden, or unreachable. It says they are not globally unique, so routers on the public internet should not carry them. That is a routing statement, not an access-control one.

## Why 172.16.0.0/12 trips people up

The first and last blocks fall on octet boundaries: everything starting `10.` is private, everything starting `192.168.` is private. The middle one doesn't. A `/12` fixes the first 12 bits, which is the whole first octet plus the top four bits of the second. In the second octet, those four bits are `0001`, so the octet can only run from `0001 0000` (16) to `0001 1111` (31).

```text
172.16.0.0/12
first octet   172  = 1010 1100   (fixed)
second octet   16  = 0001 0000   (top 4 bits fixed: 0001)
               31  = 0001 1111   (last value that keeps 0001)
               32  = 0010 0000   (top bits change: outside the block)

private:  172.16.0.0 – 172.31.255.255
public:   172.0.0.0 – 172.15.255.255 and 172.32.0.0 – 172.255.255.255
```

So `172.32.0.1` is a public address, and so is `172.15.0.1`. A rule written as `172.0.0.0/8` or a regex matching `^172\.` covers sixteen times the space you meant.

The other reason this block matters: Docker uses it by default. The default `bridge` network is `172.17.0.0/16`, and user-defined networks are allocated from the rest of the 172.16/12 space and then from 192.168/16 (the pools are configurable in `daemon.json`). You can see what you have with:

```bash
docker network inspect bridge --format '{{(index .IPAM.Config 0).Subnet}}'
docker network ls -q | xargs docker network inspect \
  --format '{{.Name}} {{range .IPAM.Config}}{{.Subnet}}{{end}}'
```

If your office VPN or a peered VPC also lives in `172.17.0.0/16` or `172.18.0.0/16`, the host now has two routes to the same prefix, and traffic for the remote network goes to a local Docker bridge instead. It looks like "the VPN connects but nothing answers".

> **Tip:** if Docker hosts and corporate networks keep colliding, set `default-address-pools` in `/etc/docker/daemon.json` to a range nobody else uses, rather than renumbering the network around Docker.

## Addresses that look private but aren't RFC 1918

Several other reserved blocks behave "non-public" in practice, and they get lumped in with RFC 1918 in firewall rules and allowlists. They have different rules, and treating them as interchangeable causes real bugs.

| Block | Defined in | What it is |
|---|---|---|
| `100.64.0.0/10` | RFC 6598 | Shared address space for carrier-grade NAT. Also used by Tailscale for node addresses. Not RFC 1918: don't use it for your own LANs if your ISP may use it upstream. |
| `169.254.0.0/16` | RFC 3927 | IPv4 link-local, self-assigned when DHCP fails. Cloud metadata services live at `169.254.169.254`, which is why SSRF filters must block this block too. |
| `127.0.0.0/8` | RFC 1122 | Loopback. The whole `/8`, not only `127.0.0.1`. |
| `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24` | RFC 5737 | TEST-NET-1, -2 and -3, reserved for documentation. Fine in examples, wrong in configs. |
| `198.18.0.0/15` | RFC 2544 | Reserved for network benchmarking. |
| `fc00::/7` | RFC 4193 | IPv6 unique local addresses. The nearest IPv6 equivalent of RFC 1918; in practice you use `fd00::/8` with a random 40-bit global ID. |
| `fe80::/10` | RFC 4291 | IPv6 link-local, present on every IPv6 interface. |

> **Warning:** an "is this address internal?" check that only tests the three RFC 1918 blocks will happily accept `127.0.0.1`, `169.254.169.254` and `[::1]`. For SSRF protection, test against the full special-purpose registry (RFC 6890 and the IANA registries), and resolve the hostname before checking, not after.

## NAT is not a firewall

Private addressing became common because of NAT, and NAT's side effect is that unsolicited inbound connections usually have nowhere to go. That side effect is not a security control. A router that port-forwards, a UPnP request from a device on the LAN, an IPv6 address on the same host with no NAT at all, or an attacker who is already inside the network all bypass it.

RFC 1918 addresses are also not hidden from anyone on the same network, the same VPN, or a peered VPC. Inside those boundaries they are ordinary routable addresses. If a service should only accept traffic from certain hosts, write that down as a firewall or security-group rule with explicit source ranges. The private address is where the service lives, not who may reach it.

## Choosing a private range for a VPC, VPN or lab

Because everyone reuses the same space, the real risk is overlap. Two networks that use the same prefix can't be routed to each other without NAT in between, and the major clouds reject VPC peering between overlapping CIDRs outright. Overlap also breaks VPN clients: a home network on `192.168.1.0/24` connecting to an office that also uses `192.168.1.0/24` cannot reach the office side of that range.

A few rules that age well:

- **Avoid the defaults.** `192.168.0.0/24`, `192.168.1.0/24`, `10.0.0.0/16` and `172.17.0.0/16` are the most likely to already exist on the other end.
- **Pick from `10.0.0.0/8` and plan in `/16`s.** It has 256 of them. Assign one per environment or region from a written list, so the next VPC doesn't guess.
- **Leave room for Kubernetes.** Pod and service CIDRs are separate ranges that must not overlap the node network or anything the cluster talks to.
- **Size for growth, not today.** Re-addressing a live VPC is far more work than over-allocating at the start. Cloud subnets also lose a few addresses to reserved slots (AWS reserves five per subnet).

Splitting a planned `/16` into per-subnet blocks is a job for the [Subnet Splitter](/subnet-splitter/), and checking a list of existing ranges for overlaps before you add another is what the [CIDR / Subnet Checker](/cidr-checker/) does.

## Checking whether an address is private with bit math

You don't need a library to test RFC 1918 membership. An address is inside a block when its first *n* bits match the block's first *n* bits, which in practice means a mask and a compare:

```text
10.0.0.0/8      first octet == 10
172.16.0.0/12   first octet == 172  AND  (second octet AND 0xF0) == 0x10
192.168.0.0/16  first octet == 192  AND  second octet == 168

172.20.5.9   ->  20 AND 0xF0 = 16 (0x10)  ->  private
172.32.0.1   ->  32 AND 0xF0 = 32 (0x20)  ->  public
```

If you want the full derivation of masks and prefix lengths, [How to read CIDR notation](/blog/how-to-read-cidr-notation/) works through it. For a quick answer, paste any address or block into the [Subnet Calculator](/subnet-calculator/): it reports the network, broadcast and host range, and the arithmetic runs in your browser.

> **Tip:** language libraries disagree about what "private" means. Some include loopback, link-local or `100.64.0.0/10`, and the definitions have changed between versions. If your code needs exactly RFC 1918, test the three blocks yourself rather than trusting a generic `is_private` flag.

## Quick reference

- Private (RFC 1918): `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`. Nothing else.
- `172.16.0.0/12` ends at `172.31.255.255`. `172.32.x.x` is public.
- Docker's default bridge is `172.17.0.0/16`; check it before choosing a VPN or VPC range.
- `100.64.0.0/10` (CGNAT), `169.254.0.0/16` (link-local, cloud metadata), `127.0.0.0/8` (loopback) and the RFC 5737 TEST-NETs are special-purpose, not RFC 1918.
- The IPv6 counterpart is `fc00::/7`, used as `fd00::/8` with a random global ID.
- Private addressing and NAT are not access control. Write explicit firewall rules.
- Overlapping ranges break peering and VPNs. Keep a written allocation plan, and check new ranges against it.
