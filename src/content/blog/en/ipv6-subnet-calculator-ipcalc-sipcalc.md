---
title: "IPv6 subnet calculator: what ipcalc can't do, and how sipcalc handles /64s"
description: "An IPv6 subnet calculator explained: why classic ipcalc is IPv4-only, how sipcalc adds IPv6 support, and the exact math behind splitting a /48 into /64s."
pubDate: 2026-09-21
tags: ["networking", "ipv6", "linux"]
relatedTool:
  name: "Subnet Calculator"
  href: "/subnet-calculator"
---

![A /48 IPv6 block subdividing into a grid of 65,536 /64 subnets](/blog/ipv6-subnet-calculator-ipcalc-sipcalc-hero.svg)
<!-- keywords: ipv6 subnet calculator | sipcalc, ipcalc online, ipv6 subnet calculator online | source: ahrefs free (2026-09-21) -->

You're planning an IPv6 allocation — maybe a `/48` from your provider that needs splitting into `/64`s for each VLAN — and you reach for `ipcalc`, the tool you've used for IPv4 subnetting for a decade. It either errors out or silently ignores the `::/48` you gave it. That's not a bug in your input: the classic `ipcalc` most people have installed only ever understood IPv4. An **IPv6 subnet calculator** needs different arithmetic entirely — 128 bits instead of 32 — and not every tool on your system was built for it.

## ipcalc online: what the classic tool actually does

The original `ipcalc`, written by Krischan Jodies and the version many distros have shipped for years, is documented and widely known as an IPv4-only tool: it takes an address and netmask or CIDR prefix and prints the network, broadcast, host range and class — for IPv4 only. Some distros ship a different, C-rewritten `ipcalc` (the one bundled with Red Hat's `initscripts`/`NetworkManager` tooling) that has gained IPv6 flags in more recent versions. Because "which `ipcalc` you have" varies by distro and version, the reliable check is your own system: run `ipcalc --help` or `man ipcalc` before you assume IPv6 support either way — don't guess from a blog post, including this one.

That version ambiguity is exactly why "ipcalc online" is a common search: people want a consistent tool that doesn't depend on which package their distro happened to install. A browser-based subnet calculator sidesteps the question entirely — it's the same tool with the same IPv6 support regardless of what's on the host doing the asking.

## sipcalc: the CLI tool built for IPv6 from the start

`sipcalc` is a long-standing, widely packaged command-line IP subnet calculator that, unlike classic `ipcalc`, has documented IPv6 support built in — it takes an IPv6 address and prefix and reports the same category of output ipcalc gives you for IPv4: network range, expanded and compressed forms, and subnet splits. Its `-s` flag splits a network into equal subnets of a given size, which is exactly the operation you need for a "/48 into /64s" allocation:

```bash
sipcalc -v6 -s 64 2001:db8::/48
```

That asks sipcalc to split the `/48` into `/64` blocks. If you don't have it installed, it's in most distro package repositories (`apt install sipcalc`, `dnf install sipcalc`, and so on) — check your own package manager rather than assume availability.

## The /48 → /64 math, worked out

Here's the arithmetic sipcalc (or any correct IPv6 tool) is doing under the hood. IPv6 addresses are 128 bits. A `/48` fixes the first 48 bits and leaves 80 host/subnet bits; a `/64` — the standard subnet size recommended for a single link — fixes 64 bits and leaves 64 host bits. The difference between the two prefix lengths, 64 − 48 = **16 bits**, is exactly how many bits are available to enumerate distinct `/64` subnets inside one `/48`:

```
2001:db8::/48
  network      2001:db8::
  last address 2001:db8:0:ffff:ffff:ffff:ffff:ffff
  /64 subnets  2^16 = 65,536
  addresses    2^80 per /48 (2^64 per /64 subnet)
```

So a single `/48` allocation — the size many ISPs and cloud providers hand out per customer or per site — divides cleanly into 65,536 separate `/64` networks, each one large enough (2^64 addresses) that address exhaustion inside a single subnet is not a practical concern. The first few subnets look like `2001:db8:0:0::/64`, `2001:db8:0:1::/64`, `2001:db8:0:2::/64`, counting up through the 16-bit subnet field until you reach `2001:db8:0:ffff::/64`, the last of the 65,536.

## Why /64 is the standard subnet size

The `/64` boundary isn't an arbitrary convention — it's tied to how IPv6 hosts configure their own addresses. RFC 4291 defines the IPv6 addressing architecture around a 64-bit interface identifier for stateless address autoconfiguration (SLAAC): a host derives the low 64 bits of its address itself, typically from its interface hardware, so any prefix a router advertises for on-link autoconfiguration needs the remaining 64 bits to actually work. Hand a host a `/80` or a `/127` on a LAN segment expecting SLAAC, and autoconfiguration breaks in ways that are documented but easy to trip over if you're used to squeezing IPv4 subnets as tight as they'll go. That's why the math in this post treats `/64` as the target size to split down to, not an arbitrary example — point-to-point links between routers are the one common exception, where a `/127` (RFC 6164) is standard practice specifically because no host-side SLAAC is happening on that link.

## ipv6 subnet calculator online

If you'd rather not install anything — you're on a locked-down machine, sharing the calculation with a teammate who doesn't have `sipcalc`, or just want a quick sanity check without opening a terminal — the [Subnet Calculator](/subnet-calculator/) on this site does the same class of math for both IPv4 and IPv6, using `BigInt` internally for full 128-bit precision rather than approximating with floating point. Paste `2001:db8::/48` (or any prefix) and it reports the network address, last address, and the subnet/address counts the same way the worked example above shows — entirely client-side, with the calculation happening in your own browser tab rather than on a server somewhere. You can also hand a colleague the exact calculation without re-typing it: the tool encodes the address you entered into the page's own URL, so copying the link after a valid calculation reproduces the same result on their screen without either of you touching a server.

## When to use which

- **`sipcalc` (or a modern `ipcalc` build with confirmed IPv6 support)** is the right call when you're already at a terminal, scripting a batch of subnet splits, or piping output into other shell tooling — command-line tools compose into scripts in a way a web page doesn't.
- **A browser-based IPv6 subnet calculator** is the right call for a quick, no-install check, for sharing a specific calculation with someone who doesn't have `sipcalc` on their machine, or when you're not certain which `ipcalc` variant — if any — is installed on the system in front of you.
- **Classic, IPv4-only `ipcalc`** is still completely fine for IPv4 work — nothing above is a knock on it for the job it was built for. Just don't hand it an IPv6 prefix and expect an answer.
- If you're managing a **list** of `/64` (or any other) blocks rather than a single one — checking for overlaps, aggregating adjacent ranges before writing a route table — that's a different job than a single-prefix calculator handles well; the [CIDR / Subnet Checker](/cidr-checker/) takes a whole list and reports overlaps, containment, and the minimal aggregated set.

None of this is an argument for abandoning the command line — a scripted `sipcalc` call is still the right tool inside a larger automation pipeline, and nothing about a browser calculator changes that. The point is narrower: know which tool on your machine actually supports IPv6 before you trust its silence on an IPv6 prefix as a "not applicable" rather than an "unsupported."

Whichever tool computes the split, verify the bit arithmetic once by hand the way this post did — 64 minus your prefix length gives you the power-of-two subnet count — so you have a way to sanity-check any tool's output, including this one's.
