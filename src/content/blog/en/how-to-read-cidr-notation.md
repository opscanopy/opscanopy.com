---
title: "How to read CIDR notation, with real-world examples"
description: "How to read CIDR notation: what the number after the slash means, a prefix-to-netmask table from /8 to /32, and real examples from VPCs, firewalls and Kubernetes."
pubDate: 2026-09-14
tags: ["networking", "devops"]
relatedTool:
  name: "CIDR / Subnet Checker"
  href: "/cidr-checker"
---

![An IPv4 address split at the slash into a fixed network prefix and a variable host range](/blog/how-to-read-cidr-notation-hero.svg)
<!-- keywords: how to read cidr notation | cidr notation explained, what does /24 mean, cidr to netmask, cidr examples | source: marketing brief, ahrefs unchecked (2026-10-04) -->

A security group rule says `10.0.32.0/20`. A Terraform module wants a `pod_cidr`. A firewall allowlist has an entry ending in `/32`, and a teammate asks whether `10.0.37.200` is "in the VPC range". All four questions come down to one skill: reading the number after the slash.

CIDR (Classless Inter-Domain Routing, specified today in RFC 4632) replaced the old class A/B/C scheme in 1993. Its notation packs an address and a mask into one string, and once you can read it you can answer most subnetting questions in your head.

## What the number after the slash means

An IPv4 address is 32 bits, written as four 8-bit octets. In `10.0.32.0/20`, the `/20` is the **prefix length**: the first 20 bits are the network part and are fixed for every address in the block. The remaining 32 − 20 = 12 bits are the host part and can take any value.

That gives you the size of the block directly:

- **Addresses in the block** = 2^(32 − prefix). For `/20` that is 2^12 = 4,096.
- **Usable hosts** on a classic LAN = 2^(32 − prefix) − 2, because the all-zeros host address names the network and the all-ones address is the broadcast. For `/20`, that is 4,094.

A bigger number after the slash means a *smaller* block. Every step up halves it: a `/24` holds 256 addresses, a `/25` holds 128, a `/26` holds 64.

### The netmask is the same thing written longhand

A netmask writes those 20 fixed bits as ones and the 12 free bits as zeros, then prints it in dotted decimal:

```text
/20  =  11111111.11111111.11110000.00000000
     =  255     .255     .240     .0
```

So `10.0.32.0/20` and `10.0.32.0 255.255.240.0` describe the same network.

## CIDR to netmask: the table worth memorising

You do not need all 33 prefixes. These are the ones that show up in real configs:

| Prefix | Netmask | Addresses | Usable hosts |
|---|---|---|---|
| /8 | 255.0.0.0 | 16,777,216 | 16,777,214 |
| /12 | 255.240.0.0 | 1,048,576 | 1,048,574 |
| /16 | 255.255.0.0 | 65,536 | 65,534 |
| /20 | 255.255.240.0 | 4,096 | 4,094 |
| /22 | 255.255.252.0 | 1,024 | 1,022 |
| /24 | 255.255.255.0 | 256 | 254 |
| /26 | 255.255.255.192 | 64 | 62 |
| /27 | 255.255.255.224 | 32 | 30 |
| /28 | 255.255.255.240 | 16 | 14 |
| /29 | 255.255.255.248 | 8 | 6 |
| /30 | 255.255.255.252 | 4 | 2 |
| /31 | 255.255.255.254 | 2 | 2 |
| /32 | 255.255.255.255 | 1 | 1 |

Two rows break the "minus two" rule on purpose.

### /31: point-to-point links (RFC 3021)

A `/30` on a link between two routers wastes half its addresses on the network and broadcast. RFC 3021 lets a `/31` carry exactly two hosts with no network or broadcast address, because a point-to-point link has nobody else to broadcast to.

### /32: one address

A `/32` fixes all 32 bits, so the block is a single host. It is how you name one machine in a route table or an allowlist, and you can see the full breakdown on the [/32 page of the Subnet Calculator](/subnet-calculator/32/).

> **Tip:** the address before the slash should be the first address of the block. `10.0.1.0/16` is ambiguous (did you mean `10.0.0.0/16`, or `10.0.1.0/24`?), and strict parsers reject it rather than guess.

```bash
python3 -c "import ipaddress; print(ipaddress.ip_network('10.0.1.0/16'))"
# ValueError: 10.0.1.0/16 has host bits set

python3 -c "import ipaddress; n = ipaddress.ip_network('10.0.32.0/20'); print(n.netmask, n.num_addresses, n[-1])"
# 255.255.240.0 4096 10.0.47.255
```

## CIDR examples from real infrastructure

### A VPC carved into /24 subnets

A common cloud layout is a `10.0.0.0/16` VPC split into `/24` subnets: `10.0.1.0/24` for public load balancers, `10.0.10.0/24` for application nodes, and so on. A `/16` holds 2^(24 − 16) = 256 such subnets, so you rarely run out. The [/16](/subnet-calculator/16/) and [/24](/subnet-calculator/24/) pages show both blocks in full.

The usable count is lower than the table says. AWS reserves five addresses in every subnet (the network address, the VPC router at `.1`, the DNS resolver at `.2`, one held for future use at `.3`, and the last address), so a `/24` subnet gives you 251 assignable addresses, not 254.

### /28: the smallest block AWS will create

AWS accepts VPC and subnet CIDR blocks from `/16` down to `/28`. After the five reserved addresses, a [/28](/subnet-calculator/28/) leaves 11 usable, which is enough for a NAT gateway subnet or a handful of interface endpoints and not much else. Azure and Google Cloud set their own minimums and reservations, so read the provider's docs before you size a subnet that tight.

### 0.0.0.0/0: everything

Prefix zero fixes no bits at all, so `0.0.0.0/0` matches every IPv4 address. In a route table it is the default route ("send anything without a more specific match here"). In a security group ingress rule it means the whole internet, which is exactly what you want on port 443 of a public load balancer and exactly what you do not want on port 22. The IPv6 equivalent is `::/0`.

### /32 entries in an allowlist

When a vendor says "allow our egress IPs", each entry usually arrives as a `/32`, such as `203.0.113.10/32`. Typing `203.0.113.10/24` instead silently allows 256 addresses, most of which belong to someone else.

### Kubernetes pod and service CIDRs

A self-managed cluster built with `kubeadm` takes a pod range such as `--pod-network-cidr=10.244.0.0/16` (the range Flannel's default manifest expects). The controller manager then hands each node its own slice, a `/24` by default, so a `/16` pod range supports up to 256 nodes. Services get a separate range: kubeadm defaults to `10.96.0.0/12`.

None of those ranges may overlap each other, the node network or anything you route to over VPN or peering. An overlap rarely fails loudly at install time. It shows up later, when traffic to a peered database leaves through the pod network instead. Managed clusters differ here (EKS's default VPC CNI gives pods real VPC addresses, for example), but the no-overlap rule is the same.

## Is this IP inside that CIDR block? Doing it by hand

The question "is `10.0.37.200` in `10.0.32.0/20`?" is a bitwise AND: apply the mask to the address and see whether you get the network address back.

Only the octet where the mask stops being 255 matters. For a `/20` that is the third octet, with mask 240:

```text
37   = 00100101
240  = 11110000
AND  = 00100000 = 32   -> matches 10.0.32.0, so 10.0.37.200 is inside
```

Try `10.0.48.1`: `48 AND 240 = 48`, which is not 32, so it falls outside.

There is a faster shortcut. 256 − 240 = 16, so `/20` blocks begin at multiples of 16 in the third octet: `.0`, `.16`, `.32`, `.48` and so on. `10.0.32.0/20` therefore runs from `10.0.32.0` to `10.0.47.255`. Anything with a third octet from 32 to 47 is inside.

## What about IPv6?

The notation is identical. Only the width changes: an IPv6 address is 128 bits, so a `/64` leaves 64 host bits and a `/48` contains 2^16 = 65,536 `/64` subnets. Convention is less flexible than in IPv4: `/64` is the standard size for a LAN, because stateless autoconfiguration expects a 64-bit interface identifier, and `/127` is the point-to-point equivalent of a `/31` (RFC 6164). The math behind splitting a `/48` is worked through in [IPv6 subnet calculator: what ipcalc can't do](/blog/ipv6-subnet-calculator-ipcalc-sipcalc/).

## Check a list of CIDR blocks without doing the math

Hand arithmetic over a 40-line allowlist is how mistakes get through. The [CIDR / Subnet Checker](/cidr-checker/) takes a list of ranges and an address, then tells you which ranges contain it, which ranges overlap, and the smallest equivalent set when adjacent blocks can be merged. For a single block, the [Subnet Calculator](/subnet-calculator/) shows the network, broadcast, host range and mask. Both run in your browser, so pasting internal ranges does not send them anywhere.

## CIDR quick reference

- [ ] The number after the slash counts **fixed** bits. Bigger number, smaller block.
- [ ] Addresses = 2^(32 − prefix); usable hosts = that minus 2, except `/31` (2, RFC 3021) and `/32` (1).
- [ ] Cloud subnets reserve more: AWS takes 5 per subnet, so a `/24` gives 251 and a `/28` gives 11.
- [ ] The address before the slash must be the block's first address; strict parsers reject host bits.
- [ ] `0.0.0.0/0` matches everything. Never put it on an admin port.
- [ ] Single hosts in an allowlist are `/32`. A stray `/24` lets in 255 extra addresses.
- [ ] Pod, service, node and peered ranges must not overlap.
- [ ] To test membership, AND the address with the mask, or use the 256 − mask block-size shortcut.
- [ ] IPv6 uses the same notation over 128 bits; `/64` per LAN, `/127` for point-to-point.
