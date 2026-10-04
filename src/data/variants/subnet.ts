/**
 * Subnet calculator variant pages (/subnet-calculator/<slug>/). Every number
 * quoted in the prose (masks, host counts, ranges) is read from the real
 * engine at module scope, so the copy cannot disagree with the result panel.
 */
import { calculate } from '../../lib/subnet-calculator/engine';
import type { ToolVariant } from './index';

interface Facts {
  prefix: number;
  network: string;
  /** Broadcast for /0–/30, last address for /31 and /32. */
  broadcast: string;
  first: string;
  last: string;
  mask: string;
  wildcard: string;
  total: string;
  usable: string;
  /** Usable on AWS/Azure (total − 5); '0' when the block is too small. */
  cloud: string;
  type: string;
}

const fmt = (digits: string) => BigInt(digits).toLocaleString('en-US');
/** Inline code span (rendered by src/lib/inline-code.ts). */
const c = (s: string) => '`' + s + '`';

function facts(input: string): Facts {
  const r = calculate(input);
  if (!r.valid) throw new Error(`subnet variant seed ${input} is invalid: ${r.error}`);
  const rows = Object.fromEntries(r.groups.flatMap((g) => g.rows).map((x) => [x.label, x.value]));
  const stats = Object.fromEntries(r.stats.map((s) => [s.label, s.value]));
  const [first, last = first] = rows['Usable host range'].split('-');
  const totalN = BigInt(stats['Total addresses']);
  return {
    prefix: Number(r.title!.split('/')[1]),
    network: rows['Network address'],
    broadcast: rows['Broadcast address'] ?? rows['Last address'],
    first,
    last,
    mask: rows['Netmask'],
    wildcard: rows['Wildcard mask'],
    total: fmt(stats['Total addresses']),
    usable: fmt(stats['Usable hosts']),
    cloud: fmt((totalN > 5n ? totalN - 5n : 0n).toString()),
    type: rows['Address type'],
  };
}

function v(input: string, build: (f: Facts) => Omit<ToolVariant, 'input'>): ToolVariant {
  return { input, ...build(facts(input)) };
}

const prefixTitle = (f: Facts) => `/${f.prefix} Subnet Mask (${f.mask}) — Hosts & IP Range`;

export const subnetVariants: ToolVariant[] = [
  v('10.0.0.0/16', (f) => ({
    slug: '16',
    h1Name: '/16 subnet',
    headline: `mask ${f.mask}, ${f.total} addresses`,
    title: prefixTitle(f),
    description: `A /16 is netmask ${f.mask}: ${f.total} addresses, ${f.usable} usable hosts. Host math, AWS VPC limits and how a /16 splits into /24s.`,
    lede: `A /16 fixes the first two octets and leaves the last two free: ${f.total} addresses, ${f.usable} of them usable hosts. It is the classic size for a whole VPC or site, rarely for a single LAN.`,
    sections: [
      {
        heading: 'What /16 means',
        paragraphs: [
          `The prefix length counts the leading 1 bits in the mask. Sixteen ones give ${c(f.mask)}, so the network part is the first two octets and the host part is the last two. The wildcard mask, the inverse form ACLs and OSPF use, is ${c(f.wildcard)}.`,
          `Host math is 2^(32 − 16) = 2^16 = ${f.total} addresses. Subtract the network address and the broadcast address and ${f.usable} remain. For the example ${c(`${f.network}/16`)}, usable hosts run from ${c(f.first)} to ${c(f.last)} and the broadcast is ${c(f.broadcast)}.`,
        ],
      },
      {
        heading: 'Where a /16 belongs',
        paragraphs: [
          `A /16 is an address plan, not a broadcast domain. Putting sixty-five thousand hosts on one flat segment would drown them in ARP and broadcast traffic long before the addresses ran out. Teams allocate a /16 to a VPC, a data centre or a region and carve it into /24s, /22s or /20s for the actual subnets.`,
          `On AWS a /16 is the largest CIDR block a VPC can have, and also the largest subnet. AWS reserves five addresses in every subnet (network, VPC router, DNS, one held for future use, broadcast), so a single /16 subnet would offer ${f.cloud} assignable addresses. Azure reserves the same five.`,
        ],
      },
      {
        heading: 'Splitting and neighbours',
        paragraphs: [
          `One /16 holds 256 /24s, 16 /20s or 64 /22s. A common VPC layout reserves the low /20s for public subnets and higher ones for private and database tiers, leaving room to grow per availability zone.`,
          `Pick the /16 with peering in mind. Two VPCs that both use ${c('10.0.0.0/16')} can never be peered or joined over a VPN without NAT, so a registry of which /16 belongs to which environment saves a painful renumbering later.`,
        ],
      },
      {
        heading: 'Configuring a /16',
        paragraphs: [
          `On Linux an address with this mask goes on an interface as ${c('ip addr add 10.0.0.1/16 dev eth0')}; routers and firewalls accept either the prefix or the dotted mask. In practice a /16 rarely sits on an interface at all: it appears as a VPC CIDR, a summary route or an entry in an IPAM tool, and the interfaces live on smaller subnets cut from it.`,
          `A summary route for the /16 lets a remote site reach every subnet inside it with one line in its routing table, which is the main operational payoff of allocating space in /16 units.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'How many /24 subnets fit in a /16?',
        a: '256. Each /24 takes the third octet as its subnet number, from x.x.0.0/24 to x.x.255.0/24.',
      },
      {
        q: 'Is a /16 the same as an old Class B network?',
        a: `It has the same size and mask (${f.mask}), but CIDR lets a /16 start anywhere on a 16-bit boundary, not only in the old 128-191 first-octet range.`,
      },
    ],
  })),

  v('10.0.0.0/20', (f) => ({
    slug: '20',
    h1Name: '/20 subnet',
    headline: `mask ${f.mask}, ${f.usable} usable hosts`,
    title: prefixTitle(f),
    description: `A /20 is netmask ${f.mask}: ${f.total} addresses, ${f.usable} usable hosts. Why it is a common cloud subnet and Kubernetes node-pool size.`,
    lede: `A /20 gives ${f.total} addresses and ${f.usable} usable hosts under netmask ${f.mask}. It is sixteen /24s in one block, a common size for cloud subnets that host containers or autoscaling groups.`,
    sections: [
      {
        heading: 'Reading the /20 mask',
        paragraphs: [
          `Twenty network bits fill the first two octets and four bits of the third, so the mask is ${c(f.mask)} and the wildcard is ${c(f.wildcard)}. The third octet therefore steps in blocks of 16: a /20 can start at .0, .16, .32 and so on, never at .8.`,
          `The host count is 2^12 = ${f.total}. With network and broadcast removed, ${f.usable} addresses are usable. In ${c(`${f.network}/20`)} that is ${c(f.first)} through ${c(f.last)}, broadcast ${c(f.broadcast)}.`,
        ],
      },
      {
        heading: 'Why cloud teams pick /20',
        paragraphs: [
          `AWS default VPCs create one /20 per availability zone inside ${c('172.31.0.0/16')}, which made the size familiar. After the five AWS-reserved addresses a /20 subnet leaves ${f.cloud} assignable IPs, enough for EKS or ECS workloads where every pod or task takes a VPC address.`,
          `It is also a comfortable unit for IP address management: big enough that a busy subnet does not run dry during a scale-out, small enough that a /16 still yields sixteen of them.`,
        ],
      },
      {
        heading: 'Neighbouring sizes',
        paragraphs: [
          `Halve a /20 and you get two /21s; quarter it for four /22s. Doubling goes the other way: two aligned /20s make a /19. If a /20 is more than a workload needs, a /22 (about a thousand hosts) is the usual next step down.`,
          `Watch alignment when you split by hand. ${c('10.0.8.0/20')} is not a valid network address; the calculator will report it as a host inside ${c('10.0.0.0/20')}.`,
        ],
      },
      {
        heading: 'Configuring and checking',
        paragraphs: [
          `The gateway for ${c(`${f.network}/20`)} is conventionally the first usable address, ${c(f.first)}, though nothing enforces it. Hosts must carry the full ${c(f.mask)} mask; a host left on 255.255.255.0 would treat everything outside its own /24 as remote and push same-subnet traffic through the router.`,
          `Before carving a VPC, list the /20s you need per availability zone and per tier. Three zones times public, private and data tiers is nine /20s, which still leaves seven spare in a /16 for later services.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'How many /24s are in a /20?',
        a: 'Sixteen. A /20 spans sixteen consecutive values of the third octet, starting on a multiple of 16.',
      },
      {
        q: 'How many usable IPs does a /20 have on AWS?',
        a: `${f.cloud}. AWS reserves the first four addresses and the last one in every subnet, so ${f.total} minus 5.`,
      },
    ],
  })),

  v('10.0.0.0/21', (f) => ({
    slug: '21',
    h1Name: '/21 subnet',
    headline: `mask ${f.mask}, ${f.usable} usable hosts`,
    title: prefixTitle(f),
    description: `A /21 is netmask ${f.mask}: ${f.total} addresses, ${f.usable} usable hosts. Boundaries, campus and Wi-Fi uses, and how it splits into /24s.`,
    lede: `A /21 uses netmask ${f.mask} and holds ${f.total} addresses, ${f.usable} of them usable. It equals eight /24s and fits large Wi-Fi or campus segments.`,
    sections: [
      {
        heading: 'The /21 at bit level',
        paragraphs: [
          `Twenty-one ones put five network bits in the third octet, so the mask is ${c(f.mask)} and the wildcard ${c(f.wildcard)}. Valid /21 networks start at third-octet values that are multiples of 8: .0, .8, .16, .24.`,
          `The block holds 2^11 = ${f.total} addresses. Drop the network and broadcast addresses and ${f.usable} are left; for ${c(`${f.network}/21`)} the usable range is ${c(f.first)} to ${c(f.last)} with broadcast ${c(f.broadcast)}.`,
        ],
      },
      {
        heading: 'Typical uses',
        paragraphs: [
          `Guest and corporate Wi-Fi often lands on a /21: devices roam, leases pile up, and phones with randomised MAC addresses can hold several leases each. Two thousand addresses absorbs that churn without shortening the DHCP lease time to minutes.`,
          `In a cloud VPC a /21 leaves ${f.cloud} assignable addresses after the five AWS or Azure reserve, a middle ground between a /22 and a /20 for container subnets.`,
        ],
      },
      {
        heading: 'Pitfalls',
        paragraphs: [
          `A large flat segment has a large broadcast domain. If you put two thousand chatty hosts on one VLAN, ARP, mDNS and DHCP traffic grows with them; on Wi-Fi, where broadcasts go out at the lowest data rate, that costs airtime. Client isolation and multicast filtering help.`,
          `When splitting, a /21 becomes two /22s or eight /24s. Its neighbour above ${c('10.0.0.0/21')} is ${c('10.0.8.0/21')}, and the pair aggregate to a /20.`,
        ],
      },
      {
        heading: 'Planning DHCP on a /21',
        paragraphs: [
          `A DHCP scope on ${c(`${f.network}/21`)} can hand out almost the whole block, ${c(f.first)} to ${c(f.last)}, minus whatever you reserve for the gateway, controllers and printers. Keep the exclusions at one end so the pool stays one contiguous span; scattered exclusions are easy to forget when the subnet is later resized.`,
          `Lease time matters more on a big guest network than the size of the block. A long lease on a busy event network can exhaust even two thousand addresses, while a lease of an hour or two returns addresses as visitors leave.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'Is 10.0.4.0/21 a valid network?',
        a: 'No. A /21 must start on a third-octet multiple of 8, so 10.0.4.0 is a host inside 10.0.0.0/21.',
      },
      {
        q: 'How many /24s does a /21 contain?',
        a: 'Eight, covering third-octet values from the block start through start + 7.',
      },
    ],
  })),

  v('10.0.0.0/22', (f) => ({
    slug: '22',
    h1Name: '/22 subnet',
    headline: `mask ${f.mask}, ${f.usable} usable hosts`,
    title: prefixTitle(f),
    description: `A /22 is netmask ${f.mask}: ${f.total} addresses, ${f.usable} usable hosts. Range, alignment rules and when four /24s beat one /22.`,
    lede: `A /22 is netmask ${f.mask}: ${f.total} addresses with ${f.usable} usable hosts, or four /24s glued together. It is a frequent choice for a busy office floor or a medium cloud subnet.`,
    sections: [
      {
        heading: 'What the /22 mask covers',
        paragraphs: [
          `Twenty-two network bits leave ten host bits. The mask ${c(f.mask)} means the third octet moves in steps of 4, and the wildcard ${c(f.wildcard)} is what you would type into a Cisco ACL.`,
          `2^10 = ${f.total} addresses, ${f.usable} usable once network and broadcast are removed. In ${c(`${f.network}/22`)} hosts run from ${c(f.first)} to ${c(f.last)}, and the broadcast address is ${c(f.broadcast)}. Note that addresses ending in .0 and .255 in the middle of that range, such as 10.0.1.0, are ordinary hosts here.`,
        ],
      },
      {
        heading: 'One /22 or four /24s',
        paragraphs: [
          `A single /22 keeps one gateway, one DHCP scope and one firewall object. Four /24s give four smaller broadcast domains and finer policy. Choose the /22 when the hosts genuinely share a role and the size is driven by headcount; choose /24s when you want segmentation.`,
          `On AWS a /22 subnet offers ${f.cloud} assignable addresses after the five reserved ones, a good size for an EKS node subnet when the VPC CNI hands every pod a real IP.`,
        ],
      },
      {
        heading: 'Gotchas',
        paragraphs: [
          `Legacy software sometimes treats any address ending in .0 or .255 as invalid. Inside a /22 those can be valid hosts, so a device that refuses 10.0.2.255 is wrong, not the plan. Avoid handing those addresses to old embedded gear.`,
          `For splitting, a /22 halves into two /23s or quarters into four /24s; two adjacent aligned /22s form a /21.`,
        ],
      },
      {
        heading: 'Configuring a /22',
        paragraphs: [
          `On a router the interface takes ${c('10.0.0.1/22')} or the address with ${c(f.mask)}. DHCP scopes should cover ${c(f.first)} to ${c(f.last)} minus reservations, entered as one range rather than four /24-shaped pieces.`,
          `When migrating from four separate /24s to one /22, change the mask on every static host in the same window as the gateway. Hosts still on the old mask reach their own /24 directly but go through the router for the other three, which hides the mistake until the router's ACLs or ICMP redirects get in the way.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'Can a /22 host address end in .255?',
        a: 'Yes. In 10.0.0.0/22, 10.0.0.255, 10.0.1.255 and 10.0.2.255 are normal hosts; only 10.0.3.255 is the broadcast.',
      },
      {
        q: 'How many usable hosts does a /22 have?',
        a: `${f.usable}: ${f.total} addresses minus the network and broadcast addresses.`,
      },
    ],
  })),

  v('10.0.0.0/23', (f) => ({
    slug: '23',
    h1Name: '/23 subnet',
    headline: `mask ${f.mask}, ${f.usable} usable hosts`,
    title: prefixTitle(f),
    description: `A /23 is netmask ${f.mask}: ${f.total} addresses, ${f.usable} usable hosts. Range, why .255 can be a host, and how a /23 relates to /24.`,
    lede: `A /23 joins two adjacent /24s under netmask ${f.mask}, giving ${f.total} addresses and ${f.usable} usable hosts. It is the usual fix when a /24 LAN runs out of room.`,
    sections: [
      {
        heading: 'How /23 works',
        paragraphs: [
          `With 23 network bits, the last bit of the third octet belongs to the host part. The mask is ${c(f.mask)}, the wildcard ${c(f.wildcard)}, and a /23 always starts on an even third octet.`,
          `2^9 = ${f.total} addresses, ${f.usable} usable. For ${c(`${f.network}/23`)} the range is ${c(f.first)} to ${c(f.last)} and the broadcast ${c(f.broadcast)}. The boundary between the two halves, 10.0.0.255 and 10.0.1.0, consists of two normal host addresses.`,
        ],
      },
      {
        heading: 'Growing a /24 into a /23',
        paragraphs: [
          `When a 254-host LAN fills up, widening it to a /23 doubles capacity without renumbering existing hosts, provided the adjacent /24 is free and the original /24 has an even third octet. ${c('192.168.4.0/24')} can grow to ${c('192.168.4.0/23')}; ${c('192.168.5.0/24')} cannot, because its /23 would start at .4.`,
          `Every host, the gateway and the DHCP server must learn the new mask. A host left on ${c('255.255.255.0')} will think the other half is off-link and send that traffic to the router, which mostly works until it does not.`,
        ],
      },
      {
        heading: 'Cloud and splitting notes',
        paragraphs: [
          `On AWS or Azure a /23 subnet leaves ${f.cloud} assignable IPs. Split it into two /24s or four /25s; pair two aligned /23s and you have a /22.`,
        ],
      },
      {
        heading: 'Configuring the wider mask',
        paragraphs: [
          `Interfaces take ${c('10.0.0.1/23')} or the dotted ${c(f.mask)}. Update the DHCP scope so the pool can cross from the first /24 into the second; leaving it unchanged gives you a /23 on paper with the same 254-address pool in practice.`,
          `Firewall objects and monitoring that referenced the old /24 also need widening, or traffic from the new half will be dropped or go unwatched. Search the rule base for the old network address before the change, not after the first ticket arrives.`,
          `Going the other way is harder. Shrinking a /23 back to a /24 means first moving every host out of the half you give up, so check the DHCP lease table and ARP caches for stragglers before changing the mask.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'Why must a /23 start on an even third octet?',
        a: 'The lowest bit of the third octet is a host bit in a /23, so the network address must have it set to 0, which makes the octet even.',
      },
      {
        q: 'Is 10.0.0.255 usable in a /23?',
        a: 'Yes. In 10.0.0.0/23 only 10.0.1.255 is the broadcast; 10.0.0.255 is an ordinary host address.',
      },
    ],
  })),

  v('10.0.0.0/24', (f) => ({
    slug: '24',
    h1Name: '/24 subnet',
    headline: `mask ${f.mask}, ${f.usable} usable hosts`,
    title: prefixTitle(f),
    description: `A /24 is netmask ${f.mask}: ${f.total} addresses, ${f.usable} usable hosts. Range, broadcast, cloud reservations and how a /24 splits.`,
    lede: `A /24 is the netmask ${f.mask}: ${f.total} addresses, ${f.usable} usable hosts, one value of the last octet per address. It is the default size for a LAN, a VLAN or a cloud subnet tier.`,
    sections: [
      {
        heading: 'What /24 means',
        paragraphs: [
          `Twenty-four network bits cover the first three octets exactly, so the mask is ${c(f.mask)} and the wildcard ${c(f.wildcard)}. That octet alignment is why /24 is the easiest prefix to reason about: the last number is the host, the first three are the network.`,
          `Host math: 2^8 = ${f.total} addresses, minus network and broadcast leaves ${f.usable}. For ${c(`${f.network}/24`)} the usable range is ${c(f.first)} to ${c(f.last)}, and ${c(f.broadcast)} is the broadcast.`,
        ],
      },
      {
        heading: 'Where /24 is used',
        paragraphs: [
          `Most home routers, office VLANs and lab networks are /24s. It is also the smallest prefix generally accepted on the public internet: many providers filter IPv4 announcements longer than /24, so a /24 is the minimum block worth announcing over BGP.`,
          `In AWS and Azure a /24 subnet keeps ${f.cloud} assignable addresses after the five reserved ones (network, router, DNS, a spare and broadcast). Google Cloud reserves four, leaving 252.`,
        ],
      },
      {
        heading: 'Splitting and adjacent prefixes',
        paragraphs: [
          `A /24 halves into two /25s of 126 usable hosts, quarters into four /26s, and splits into eight /27s or sixteen /28s. Going up, two aligned /24s form a /23 and four form a /22.`,
          `Do not size by the round number. A /24 with a dozen servers wastes nothing locally, but in a shared address plan those 240 idle addresses are gone from every other team.`,
        ],
      },
      {
        heading: 'Configuring and checking a /24',
        paragraphs: [
          `On Linux, ${c('ip addr add 10.0.0.10/24 dev eth0')} assigns a host address with this mask; Windows and router UIs ask for ${c(f.mask)} instead. The gateway is conventionally ${c(f.first)} or ${c(f.last)}; pick one convention for the whole estate and keep it.`,
          `If two hosts on what should be one /24 cannot reach each other, compare their masks first. A single host configured as /25 or /16 by accident produces asymmetric reachability that is easy to misread as a firewall problem.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'How many usable IP addresses are in a /24?',
        a: `${f.usable}. A /24 has ${f.total} addresses; the first is the network address and the last is the broadcast.`,
      },
      {
        q: 'What is the subnet mask for /24?',
        a: `${f.mask}, with wildcard mask ${f.wildcard}.`,
      },
      {
        q: 'How many usable IPs does a /24 have in AWS?',
        a: `${f.cloud}. AWS reserves five addresses in every subnet.`,
      },
    ],
  })),

  v('10.0.0.0/25', (f) => ({
    slug: '25',
    h1Name: '/25 subnet',
    headline: `mask ${f.mask}, ${f.usable} usable hosts`,
    title: prefixTitle(f),
    description: `A /25 is netmask ${f.mask}: ${f.total} addresses, ${f.usable} usable hosts. Both halves of a /24, their ranges, and when to split a LAN in two.`,
    lede: `A /25 is half of a /24: netmask ${f.mask}, ${f.total} addresses, ${f.usable} usable hosts. Every /24 contains exactly two of them, starting at .0 and .128.`,
    sections: [
      {
        heading: 'The /25 mask',
        paragraphs: [
          `The 25th bit is the top bit of the last octet, so the mask is ${c(f.mask)} and the wildcard ${c(f.wildcard)}. That single bit picks the lower half (.0–.127) or the upper half (.128–.255).`,
          `2^7 = ${f.total} addresses, ${f.usable} usable. In ${c(`${f.network}/25`)} hosts go from ${c(f.first)} to ${c(f.last)}, and the broadcast is ${c(f.broadcast)}. The upper half, ${c('10.0.0.128/25')}, has network .128 and broadcast .255.`,
        ],
      },
      {
        heading: 'When to split a /24 in two',
        paragraphs: [
          `A /25 pair is the minimum segmentation of an existing /24: servers on one half, clients on the other, or production and staging side by side, each with its own gateway and ACLs. It costs two more unusable addresses than the single /24.`,
          `In the cloud, a /25 subnet offers ${f.cloud} assignable addresses after the five reserved per subnet on AWS and Azure, comfortable for a tier of virtual machines that will never autoscale into the hundreds.`,
        ],
      },
      {
        heading: 'Common mistakes',
        paragraphs: [
          `The gateway for the upper half is often configured as .1 out of habit, which sits in the lower half and is unreachable on-link. In ${c('10.0.0.128/25')} the first usable address is .129.`,
          `Smaller still, a /26 quarters the /24; larger, two /25s rejoin as the original /24.`,
        ],
      },
      {
        heading: 'Configuring both halves',
        paragraphs: [
          `The lower half takes a gateway such as ${c(f.first)} and a DHCP scope ending at ${c(f.last)}; the upper half needs its own gateway at .129 and its own scope. Each half needs its own VLAN or router interface: two /25s on one switch segment with no router between them gain nothing over the original /24.`,
          `Firewall rules that referred to the full /24 still match both halves, which is convenient during a migration but means the split adds no isolation until those rules are rewritten per /25.`,
          `Plan the split around the gateway you already have. If the existing router sits at .1 it stays in the lower /25, so the upper half is the one that gets a new gateway address and a DHCP change, and its hosts are the ones that move.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'What are the two /25 networks in 192.168.1.0/24?',
        a: '192.168.1.0/25 (hosts .1 to .126, broadcast .127) and 192.168.1.128/25 (hosts .129 to .254, broadcast .255).',
      },
      {
        q: 'How many usable hosts does a /25 have?',
        a: `${f.usable}, from ${f.total} total addresses.`,
      },
    ],
  })),

  v('10.0.0.0/26', (f) => ({
    slug: '26',
    h1Name: '/26 subnet',
    headline: `mask ${f.mask}, ${f.usable} usable hosts`,
    title: prefixTitle(f),
    description: `A /26 is netmask ${f.mask}: ${f.total} addresses, ${f.usable} usable hosts. The four /26 blocks in a /24 and where the size fits.`,
    lede: `A /26 quarters a /24: netmask ${f.mask}, ${f.total} addresses, ${f.usable} usable hosts. The four blocks start at .0, .64, .128 and .192.`,
    sections: [
      {
        heading: 'Reading /26',
        paragraphs: [
          `Two bits of the last octet join the network part, giving mask ${c(f.mask)} and wildcard ${c(f.wildcard)}. Those two bits select one of four 64-address blocks.`,
          `2^6 = ${f.total} addresses, ${f.usable} usable after network and broadcast. ${c(`${f.network}/26`)} spans ${c(f.first)} to ${c(f.last)}, broadcast ${c(f.broadcast)}. The next block starts at ${c('10.0.0.64')}.`,
        ],
      },
      {
        heading: 'Good fits',
        paragraphs: [
          `Sixty-odd hosts suits a rack of servers, a management network for switches and PDUs, or a small branch office. It also suits per-availability-zone subnets in a modest VPC where each zone runs a handful of instances.`,
          `After AWS or Azure take their five reserved addresses, a /26 subnet keeps ${f.cloud}. Managed services that drop network interfaces into your subnet (load balancers, NAT gateways, Lambda in a VPC) also draw from that pool, so leave headroom.`,
        ],
      },
      {
        heading: 'Splitting',
        paragraphs: [
          `A /26 halves into two /27s or four /28s, and two aligned /26s form a /25. Mixing sizes inside one /24 is fine as long as each block is aligned: a /25 at .0, a /26 at .128 and two /27s at .192 and .224 fill it exactly.`,
        ],
      },
      {
        heading: 'Configuring a /26',
        paragraphs: [
          `For ${c(`${f.network}/26`)} put the gateway on ${c(f.first)} and keep hosts at or below ${c(f.last)}; ${c(f.broadcast)} is the broadcast and must not be assigned. A frequent typo is giving a host .64, which is the network address of the next /26, not the 64th host of this one.`,
          `When a /26 per zone feels tight, count the managed interfaces first. A load balancer, a NAT gateway, a few VPC endpoints and a database instance can take a dozen addresses before the first application server starts.`,
          `Splitting a /24 into four /26s across three availability zones leaves one block spare, which is a tidy home for a later fourth zone or a dedicated endpoints subnet without touching the existing three.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'What are the four /26 subnets of a /24?',
        a: 'x.x.x.0/26, x.x.x.64/26, x.x.x.128/26 and x.x.x.192/26, each with 62 usable hosts.',
      },
      {
        q: 'What is the wildcard mask for /26?',
        a: `${f.wildcard}, the bitwise inverse of ${f.mask}.`,
      },
    ],
  })),

  v('10.0.0.0/27', (f) => ({
    slug: '27',
    h1Name: '/27 subnet',
    headline: `mask ${f.mask}, ${f.usable} usable hosts`,
    title: prefixTitle(f),
    description: `A /27 is netmask ${f.mask}: ${f.total} addresses, ${f.usable} usable hosts. The eight /27 blocks in a /24, uses, and cloud reservations.`,
    lede: `A /27 holds ${f.total} addresses and ${f.usable} usable hosts under netmask ${f.mask}. A /24 splits into eight of them, each starting on a multiple of 32.`,
    sections: [
      {
        heading: 'The /27 mask',
        paragraphs: [
          `Three host-octet bits move to the network side: mask ${c(f.mask)}, wildcard ${c(f.wildcard)}. The last octet of a /27 network is always 0, 32, 64, 96, 128, 160, 192 or 224.`,
          `2^5 = ${f.total} addresses, ${f.usable} usable. For ${c(`${f.network}/27`)} the usable range is ${c(f.first)} to ${c(f.last)} and the broadcast ${c(f.broadcast)}.`,
        ],
      },
      {
        heading: 'Where /27 is common',
        paragraphs: [
          `Thirty hosts covers a DMZ, a VPN client pool, a printer and camera VLAN, or a small set of public addresses from a hosting provider. Providers that sell IPv4 blocks often quote /27 and /28 as their smallest routed allocations.`,
          `On AWS a /27 subnet keeps ${f.cloud} usable addresses after the five reserved. That shrinkage matters more the smaller the subnet: here it is about one address in six.`,
        ],
      },
      {
        heading: 'Neighbours',
        paragraphs: [
          `A /27 splits into two /28s; two aligned /27s make a /26. If you only need a handful of addresses, a /28 or a /29 wastes less; if a service may grow past thirty instances, start at /26.`,
        ],
      },
      {
        heading: 'Configuring a /27',
        paragraphs: [
          `In ${c(`${f.network}/27`)}, give the gateway ${c(f.first)} and keep hosts at or below ${c(f.last)}. The broadcast ${c(f.broadcast)} and the next block's network address, 10.0.0.32, are the two addresses people most often assign by mistake.`,
          `Vendor forms without a prefix field ask for the dotted mask, ${c(f.mask)}. Writing both forms side by side in the runbook saves the on-call engineer a conversion under pressure.`,
          `If the /27 holds public addresses from a provider, confirm whether the provider's gateway sits inside it. When it does, one more address is gone and 29 remain for your own equipment.`,
          `Reverse DNS for such a block is usually delegated by the provider, since a /27 does not align to an octet; ask for classless delegation if you need to manage the PTR records yourself.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'How many /27 subnets are in a /24?',
        a: 'Eight, at last-octet boundaries 0, 32, 64, 96, 128, 160, 192 and 224.',
      },
      {
        q: 'How many usable hosts does a /27 have on AWS?',
        a: `${f.cloud}: ${f.total} addresses minus the five AWS reserves in every subnet.`,
      },
    ],
  })),

  v('10.0.0.0/28', (f) => ({
    slug: '28',
    h1Name: '/28 subnet',
    headline: `mask ${f.mask}, ${f.usable} usable hosts`,
    title: prefixTitle(f),
    description: `A /28 is netmask ${f.mask}: ${f.total} addresses, ${f.usable} usable hosts, ${f.cloud} on AWS. The smallest AWS VPC subnet, explained.`,
    lede: `A /28 is netmask ${f.mask}: ${f.total} addresses and ${f.usable} usable hosts. It is the smallest subnet AWS lets you create, where only ${f.cloud} addresses remain assignable.`,
    sections: [
      {
        heading: 'What /28 means',
        paragraphs: [
          `Four host bits remain, so the mask is ${c(f.mask)} and the wildcard ${c(f.wildcard)}. Networks start at multiples of 16 in the last octet.`,
          `2^4 = ${f.total} addresses, ${f.usable} after network and broadcast. ${c(`${f.network}/28`)} has usable hosts ${c(f.first)} to ${c(f.last)} and broadcast ${c(f.broadcast)}.`,
        ],
      },
      {
        heading: 'The cloud minimum',
        paragraphs: [
          `AWS accepts VPC and subnet blocks from /16 down to /28, so /28 is the floor. AWS reserves five addresses in each subnet: the network address, the VPC router at .1, the DNS resolver at .2, .3 held for future use, and the broadcast. That leaves ${f.cloud} assignable addresses in a /28.`,
          `Azure also reserves five per subnet but allows subnets down to /29. AWS suggests a small dedicated subnet, a /28 is enough, for Transit Gateway attachments; EKS or Lambda subnets need far larger blocks.`,
        ],
      },
      {
        heading: 'Uses and splitting',
        paragraphs: [
          `Use /28 for transit or attachment subnets, a pair of NAT instances, or a small block of public IPs from an ISP. A /28 splits into two /29s, and two aligned /28s make a /27. Sixteen /28s fill a /24.`,
        ],
      },
      {
        heading: 'Configuring and pitfalls',
        paragraphs: [
          `Outside the cloud, ${c(`${f.network}/28`)} gives hosts ${c(f.first)} through ${c(f.last)} with the usual network and broadcast exclusions. Inside an AWS VPC the first three host addresses belong to AWS, so your own instances start at .4 and the last assignable address is .14.`,
          `Running out of addresses is the common failure: a subnet that holds two instances today cannot absorb a rolling deployment that briefly doubles them, or a managed service that adds interfaces. AWS cannot resize a subnet in place, so a too-small subnet means creating a new one and migrating.`,
          `Use /28 where the address count is fixed by design, such as an attachment or firewall subnet, and pick something larger wherever compute will scale. Changing a subnet later costs far more than a few idle addresses now.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'What is the smallest subnet in AWS?',
        a: `A /28, which has ${f.total} addresses. After AWS reserves five, ${f.cloud} are assignable.`,
      },
      {
        q: 'How many /28s fit in a /24?',
        a: 'Sixteen, each starting on a multiple of 16 in the last octet.',
      },
    ],
  })),

  v('10.0.0.0/29', (f) => ({
    slug: '29',
    h1Name: '/29 subnet',
    headline: `mask ${f.mask}, ${f.usable} usable hosts`,
    title: prefixTitle(f),
    description: `A /29 is netmask ${f.mask}: ${f.total} addresses, ${f.usable} usable hosts. ISP static-IP blocks, Azure's minimum subnet and the range.`,
    lede: `A /29 has ${f.total} addresses and ${f.usable} usable hosts under netmask ${f.mask}. It is the block many ISPs hand out for a small set of static public IPs.`,
    sections: [
      {
        heading: 'The /29 mask',
        paragraphs: [
          `Three host bits remain: mask ${c(f.mask)}, wildcard ${c(f.wildcard)}. Networks begin at multiples of 8 in the last octet.`,
          `2^3 = ${f.total} addresses, ${f.usable} usable. In ${c(`${f.network}/29`)} hosts are ${c(f.first)} to ${c(f.last)} and the broadcast is ${c(f.broadcast)}.`,
        ],
      },
      {
        heading: 'Static IPs from an ISP',
        paragraphs: [
          `Business connections with "five usable static IPs" are usually a /29: six usable host addresses, one of which is the ISP's gateway, leaves five for your firewall, servers or NAT pool. Read the provider's handover sheet carefully; some routed /29s arrive over a separate /30 or /31 link and then all six are yours.`,
          `In the cloud, Azure and Google Cloud both accept /29 as their minimum subnet. Azure reserves five addresses, leaving ${f.cloud}; Google Cloud reserves four, leaving 4. AWS does not allow subnets smaller than /28 at all.`,
        ],
      },
      {
        heading: 'Splitting and neighbours',
        paragraphs: [
          `A /29 splits into two /30s, and two aligned /29s form a /28. For a single router-to-router link, a /30 or /31 wastes less.`,
        ],
      },
      {
        heading: 'Configuring a /29',
        paragraphs: [
          `A typical handover is ${c(`${f.network}/29`)} with the provider's router on ${c(f.first)} or ${c(f.last)} and your firewall on the next address. The mask on your side must be ${c(f.mask)}; a firewall configured as /24 will ARP for addresses that are not on the link and fail in confusing ways.`,
          `To put more than one device on the public side, connect them through a switch on the /29 segment, or route the block behind the firewall and use proxy ARP or one-to-one NAT, depending on what the provider supports.`,
          `Ask the provider whether the block is on-link or routed to you. On-link means every address must answer ARP on the WAN segment; routed means the provider sends the whole /29 to one next hop, and your firewall can place the addresses wherever it likes.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'How many usable IPs are in a /29?',
        a: `${f.usable}. One is often the ISP gateway, leaving five for your own equipment.`,
      },
      {
        q: 'Can I create a /29 subnet in AWS?',
        a: 'No. AWS subnets range from /16 to /28. Azure and Google Cloud accept /29.',
      },
    ],
  })),

  v('10.0.0.0/30', (f) => ({
    slug: '30',
    h1Name: '/30 subnet',
    headline: `mask ${f.mask}, ${f.usable} usable hosts`,
    title: prefixTitle(f),
    description: `A /30 is netmask ${f.mask}: ${f.total} addresses, ${f.usable} usable hosts. The traditional point-to-point link, and why /31 now replaces it.`,
    lede: `A /30 is netmask ${f.mask}: ${f.total} addresses, ${f.usable} usable hosts. It was the standard size for a router-to-router link for decades.`,
    sections: [
      {
        heading: 'What /30 means',
        paragraphs: [
          `Two host bits remain, so the mask is ${c(f.mask)} and the wildcard ${c(f.wildcard)}. Networks sit at multiples of 4.`,
          `2^2 = ${f.total} addresses. The network and broadcast take two, so ${f.usable} remain: in ${c(`${f.network}/30`)} those are ${c(f.first)} and ${c(f.last)}, with ${c(f.broadcast)} as broadcast. A /30 is the smallest subnet where the usual "minus two" rule still produces usable hosts.`,
        ],
      },
      {
        heading: 'Point-to-point links',
        paragraphs: [
          `A WAN circuit, a GRE or IPsec tunnel, or a BGP session between two routers needs exactly two addresses, one per end. A /30 delivers that, at the price of half its addresses going to the network and broadcast entries a two-node link never uses.`,
          `RFC 3021 lets a /31 do the same job with no waste, and most modern routing platforms support it. A /30 is still the safe default when the far end is an older device, a firewall that rejects /31, or a provider whose provisioning only knows /30.`,
        ],
      },
      {
        heading: 'Planning link addresses',
        paragraphs: [
          `Teams usually reserve one /24 for links and slice it into 64 /30s (or 128 /31s). A /30 splits into two /31s; two aligned /30s make a /29.`,
        ],
      },
      {
        heading: 'Configuring a /30 link',
        paragraphs: [
          `One end takes ${c(f.first)}, the other ${c(f.last)}, both with mask ${c(f.mask)}. A convention such as lower address on the provider side makes troubleshooting faster, because anyone can tell which end they are looking at from the address alone.`,
          `Watch for typos that put the two ends in different /30s, for example .2 and .5. Each side then thinks the other is off-link, the interface stays up and the routing protocol never forms an adjacency.`,
          `Document each link with both addresses and the device names at each end. Link blocks are small and numerous, so an IPAM entry per /30 is what keeps two engineers from handing out the same one on different sides of the network.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'Why use a /30 instead of a /31?',
        a: 'Compatibility. Every IPv4 stack handles a /30, while /31 needs RFC 3021 support on both ends.',
      },
      {
        q: 'How many /30 links fit in a /24?',
        a: 'Sixty-four, each using four addresses with two usable.',
      },
    ],
  })),

  v('10.0.0.0/31', (f) => ({
    slug: '31',
    h1Name: '/31 subnet',
    headline: 'point-to-point links under RFC 3021',
    title: prefixTitle(f),
    description: `A /31 is netmask ${f.mask}: two addresses, both usable on a point-to-point link per RFC 3021. No network or broadcast address.`,
    lede: `A /31 has netmask ${f.mask} and exactly ${f.total} addresses, and both are usable. RFC 3021 defines it for point-to-point links, where a network and broadcast address serve no purpose.`,
    sections: [
      {
        heading: 'Why the minus-two rule does not apply',
        paragraphs: [
          `With one host bit, mask ${c(f.mask)} and wildcard ${c(f.wildcard)}, the block is only two addresses. Applied blindly, the 2^n − 2 formula gives zero hosts. RFC 3021 (2000) observed that a link with exactly two endpoints never needs to broadcast to "everyone else", so it drops the network and broadcast reservations for /31.`,
          `In ${c(`${f.network}/31`)} the two ends are ${c(f.first)} and ${c(f.last)}. The calculator labels ${c(f.broadcast)} as the last address rather than a broadcast, because a /31 has none.`,
        ],
      },
      {
        heading: 'Where /31 is used',
        paragraphs: [
          `Router-to-router links in data-centre fabrics and ISP backbones: a leaf-spine network can have thousands of links, and /31 halves the address space they consume compared with /30. Cisco IOS, Juniper Junos, Arista EOS and the Linux kernel support it.`,
          `Do not use a /31 on a segment with more than two devices, or where one end is a host OS or appliance that treats the lower address as the network and refuses it. Test with the actual kit before standardising.`,
        ],
      },
      {
        heading: 'Related sizes',
        paragraphs: [
          `Two /31s make a /30, the older four-address link format. One step smaller is /32, a single host route used for loopbacks rather than links. Cloud VPCs do not offer /31 subnets.`,
        ],
      },
      {
        heading: 'Configuring a /31',
        paragraphs: [
          `On Cisco IOS the interface takes ${c('ip address 10.0.0.0 255.255.255.254')} and the router notes that this is a point-to-point /31; on Linux, ${c('ip addr add 10.0.0.0/31 dev eth1')} works as expected. Give the even address to one end and the odd address to the other.`,
          `Routing protocols run over a /31 unchanged. OSPF should use the point-to-point network type on such links, which also skips the designated-router election that is pointless with two neighbours.`,
          `Some monitoring and IPAM tools still compute zero usable hosts for /31, so check that they report the link correctly before relying on them.`,
          `The space saving adds up in a fabric: a leaf-spine design with 32 leaves and 4 spines has 128 links, which fit in one /24 of /31s but need two /24s of /30s.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'Does a /31 have a broadcast address?',
        a: 'No. Under RFC 3021 both addresses of a /31 are host addresses, one per end of the link.',
      },
      {
        q: 'Is a /31 valid on a normal LAN?',
        a: 'Only if exactly two devices share it and both support RFC 3021. It is meant for point-to-point links.',
      },
    ],
  })),

  v('10.0.0.0/32', (f) => ({
    slug: '32',
    h1Name: '/32 subnet',
    headline: 'a single host route',
    title: prefixTitle(f),
    description: `A /32 is netmask ${f.mask}: one address, a host route. How /32 is used for loopbacks, firewall rules, cloud security groups and BGP.`,
    lede: `A /32 has netmask ${f.mask} and matches exactly one address. It describes a single host, not a network you can put devices on.`,
    sections: [
      {
        heading: 'What /32 means',
        paragraphs: [
          `All 32 bits are network bits, so the mask is ${c(f.mask)} and the wildcard ${c(f.wildcard)}, a wildcard that matches only the exact address. 2^0 = ${f.total}: ${c(`${f.network}/32`)} is just ${c(f.first)}, with no network, broadcast or range.`,
          `A bare IPv4 address with no prefix is treated as /32 by the calculator, the same convention routers and most firewalls follow.`,
        ],
      },
      {
        heading: 'Where you will see /32',
        paragraphs: [
          `Router loopback interfaces carry a /32 so the router has one stable address that does not depend on any physical link; OSPF and BGP router IDs and iBGP peerings use them. Anycast and floating service IPs are announced as /32 host routes.`,
          `Firewall rules and cloud security groups use /32 to allow a single source: an AWS security group rule for one admin IP is written ${c('203.0.113.10/32')}. Leaving off the prefix, or writing /24 by mistake, opens the rule to a whole block.`,
        ],
      },
      {
        heading: 'Pitfalls',
        paragraphs: [
          `On the public internet, most networks filter IPv4 announcements longer than /24, so a /32 will not propagate globally unless it is a deliberate, agreed exception such as a remote-triggered blackhole route.`,
          `Assigning a /32 to an Ethernet interface leaves the host with no on-link neighbours; it needs an explicit route to its gateway. That is how some cloud and container networks work on purpose, which can surprise people reading ${c('ip addr')} output. The next size up, a /31, is the smallest block for a two-device link.`,
        ],
      },
      {
        heading: 'Configuring a /32',
        paragraphs: [
          `On Linux, ${c('ip addr add 10.0.0.1/32 dev lo')} adds a loopback host address; on Cisco IOS the equivalent is ${c('interface Loopback0')} with ${c('ip address 10.0.0.1 255.255.255.255')}. Advertise it into OSPF or BGP and the router stays reachable on that address over any working path, even when individual links fail. Many teams number loopbacks from one dedicated /24 so a glance at an address tells you it identifies a device rather than a link.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'What does /32 mean in a security group?',
        a: 'It matches one IPv4 address exactly. 198.51.100.7/32 allows that single host and nothing else.',
      },
      {
        q: 'Is a /32 a subnet?',
        a: 'Technically a prefix of length 32. In practice it is a host route: one address, no hosts beside it.',
      },
    ],
  })),

  v('10.0.0.0/8', (f) => ({
    slug: '10-0-0-0-8',
    h1Name: '10.0.0.0/8',
    headline: 'the largest private IPv4 range',
    title: `10.0.0.0/8 — Private Range, Mask ${f.mask}`,
    description: `10.0.0.0/8 is the largest RFC 1918 private block: ${f.total} addresses, mask ${f.mask}. How to carve it up and avoid overlaps.`,
    lede: `10.0.0.0/8 is the largest of the three RFC 1918 private ranges: ${f.total} addresses from ${f.network} to ${f.broadcast}, mask ${f.mask}. Enterprises and cloud platforms build their internal address plans inside it.`,
    sections: [
      {
        heading: 'The block',
        paragraphs: [
          `RFC 1918 sets aside ${c('10.0.0.0/8')}, ${c('172.16.0.0/12')} and ${c('192.168.0.0/16')} for private networks; routers on the public internet do not carry them, so reaching the internet requires NAT. The calculator classifies this block as "${f.type}".`,
          `With mask ${c(f.mask)} and wildcard ${c(f.wildcard)}, only the first octet is fixed. That leaves 2^24 = ${f.total} addresses, ${f.usable} if you treated it as one flat network, which nobody does.`,
        ],
      },
      {
        heading: 'Carving it up',
        paragraphs: [
          `The size invites a hierarchy: a /16 per region or environment, a /20 or /24 per subnet. ${c('10.0.0.0/8')} contains 256 /16s, so a plan like 10.region.tier.x stays readable for years.`,
          `Popular defaults live here too, which is a reason to avoid them in your own plan. Kubernetes clusters built with kubeadm use ${c('10.96.0.0/12')} for Services by default, Flannel's default pod network is ${c('10.244.0.0/16')}, and many tutorials and VPC wizards suggest ${c('10.0.0.0/16')}.`,
        ],
      },
      {
        heading: 'Overlap is the real risk',
        paragraphs: [
          `Everyone picks ${c('10.0.0.0/16')} first. When two companies merge, two VPCs need peering, or a remote worker's VPN lands on a corporate subnet that matches their ISP's equipment, overlapping 10.x ranges force NAT or renumbering. Choose a less obvious /16, such as ${c('10.142.0.0/16')}, and record every allocation.`,
          `Do not confuse it with ${c('100.64.0.0/10')}, the RFC 6598 carrier-grade NAT range that some ISPs and overlay VPNs use; it is not RFC 1918 space and should not be in your private address plan.`,
        ],
      },
      {
        heading: 'Checking an allocation',
        paragraphs: [
          `Before taking a new /16 or /20 from the block, check it against every VPC, on-premises network, VPN pool and Kubernetes cluster you run, plus the networks of partners you peer with. Overlap checks are cheap in a spreadsheet and expensive after a peering request has been approved.`,
          `Paste candidate ranges into the calculator to confirm boundaries: a typo such as 10.20.8.0/20 instead of 10.20.16.0/20 shifts a whole subnet onto its neighbour, and the calculator shows it as a host inside 10.20.0.0/20.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'How many IP addresses are in 10.0.0.0/8?',
        a: `${f.total}, from ${f.network} to ${f.broadcast}.`,
      },
      {
        q: 'Is 10.0.0.0/8 routable on the internet?',
        a: 'No. It is RFC 1918 private space; traffic to the internet must be translated with NAT.',
      },
    ],
  })),

  v('172.16.0.0/12', (f) => ({
    slug: '172-16-0-0-12',
    h1Name: '172.16.0.0/12',
    headline: 'the private range Docker and AWS use',
    title: `172.16.0.0/12 — Private Range, Mask ${f.mask}`,
    description: `172.16.0.0/12 is the RFC 1918 block from ${f.network} to ${f.broadcast}: ${f.total} addresses. Docker and AWS default VPC overlaps explained.`,
    lede: `172.16.0.0/12 spans ${f.network} to ${f.broadcast}: ${f.total} addresses under mask ${f.mask}. It is the middle RFC 1918 range, and the one Docker and the AWS default VPC draw from.`,
    sections: [
      {
        heading: 'Where the range starts and stops',
        paragraphs: [
          `A /12 fixes the first octet and the top four bits of the second, so the mask is ${c(f.mask)} and the wildcard ${c(f.wildcard)}. The second octet runs from 16 to 31. ${c('172.15.0.1')} and ${c('172.32.0.1')} are public addresses, a frequent source of firewall rules that are one octet off.`,
          `2^20 = ${f.total} addresses in total, or sixteen /16s: ${c('172.16.0.0/16')} through ${c('172.31.0.0/16')}. The calculator reports the block as "${f.type}".`,
        ],
      },
      {
        heading: 'Who already uses it',
        paragraphs: [
          `Docker's default bridge network is ${c('172.17.0.0/16')}, and user-defined bridge networks take further /16s from the rest of this block before moving on to 192.168 space. Every developer laptop running Docker therefore holds some of these addresses.`,
          `AWS creates every default VPC as ${c('172.31.0.0/16')}, split into one /20 per availability zone. Many corporate networks also chose 172.16/12 precisely because it looked less crowded than 10/8.`,
        ],
      },
      {
        heading: 'Overlap problems',
        paragraphs: [
          `When a corporate VPN pushes routes for, say, ${c('172.17.0.0/16')}, Docker on the same laptop has to win or lose that route, and containers or the VPN silently break. Fix it on the Docker side with ${c('default-address-pools')} and ${c('bip')} in ${c('daemon.json')}, or keep company subnets out of 172.17–172.31.`,
          `For VPC peering and site-to-site VPNs, avoid the AWS default ${c('172.31.0.0/16')} in production; any two default VPCs overlap by definition.`,
        ],
      },
      {
        heading: 'Matching the range in rules',
        paragraphs: [
          `An address is in this block when its first octet is 172 and its second is between 16 and 31 inclusive. With the wildcard ${c(f.wildcard)}, the ACL entry ${c('permit ip 172.16.0.0 0.15.255.255 any')} matches the whole range. A shortcut that matches any address starting with 172 is wrong, because it also catches public 172.x space owned by real organisations.`,
          `For AWS security groups and most cloud firewalls, write the block as ${c('172.16.0.0/12')} rather than listing sixteen /16s; the rule is shorter and cannot miss one.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'Is 172.32.0.0 a private address?',
        a: `No. 172.16.0.0/12 ends at ${f.broadcast}; 172.32.0.0 and above are public.`,
      },
      {
        q: 'Why does Docker conflict with my VPN?',
        a: 'Docker networks default to 172.17.0.0/16 and nearby /16s. If the VPN routes the same range, one of them loses. Change Docker\'s address pools in daemon.json.',
      },
    ],
  })),

  v('192.168.0.0/16', (f) => ({
    slug: '192-168-0-0-16',
    h1Name: '192.168.0.0/16',
    headline: 'the home and small-office private range',
    title: `192.168.0.0/16 — Private Range, Mask ${f.mask}`,
    description: `192.168.0.0/16 is the RFC 1918 block home routers use: ${f.total} addresses, mask ${f.mask}. Its 256 /24s and why VPN overlaps happen.`,
    lede: `192.168.0.0/16 is the smallest RFC 1918 range: ${f.total} addresses from ${f.network} to ${f.broadcast}, mask ${f.mask}. Nearly every home router hands out a /24 from it.`,
    sections: [
      {
        heading: 'Size and structure',
        paragraphs: [
          `The mask ${c(f.mask)} fixes 192.168 and leaves the last two octets: wildcard ${c(f.wildcard)}, 2^16 = ${f.total} addresses. The calculator classifies it as "${f.type}".`,
          `In practice the third octet is a subnet number. The block holds 256 /24s, ${c('192.168.0.0/24')} to ${c('192.168.255.0/24')}, and almost no one uses it as a single /16 network.`,
        ],
      },
      {
        heading: 'Where it shows up',
        paragraphs: [
          `Consumer routers ship with ${c('192.168.0.0/24')} or ${c('192.168.1.0/24')} as the LAN, with the router at .1. Phone hotspots, printers in setup mode and lab appliances use other low 192.168 subnets. Calico's default Kubernetes pod pool is ${c('192.168.0.0/16')}, and Docker falls back to /20s from this range once its 172 pool is exhausted.`,
        ],
      },
      {
        heading: 'Why to keep company networks out of it',
        paragraphs: [
          `Because every home network is a 192.168 /24, a corporate subnet in the same range collides with remote workers' LANs. If an office uses ${c('192.168.1.0/24')} and an employee's router does too, the VPN client cannot tell which 192.168.1.20 is meant; local traffic usually wins and the office server becomes unreachable.`,
          `Use 10/8 or 172.16/12 for anything that must be reached over a VPN, and if 192.168 is unavoidable, pick a high, unusual third octet such as ${c('192.168.213.0/24')}.`,
        ],
      },
      {
        heading: 'Using it in firewall rules',
        paragraphs: [
          `As an ACL wildcard, the block is ${c('192.168.0.0 0.0.255.255')}. Filters at the network edge commonly drop packets from the internet that carry RFC 1918 source addresses, since a packet claiming to come from 192.168 space on a public interface is spoofed or leaked.`,
          `Inside a network, a blanket rule allowing 192.168.0.0/16 is usually broader than intended. Allow the specific /24 a service needs, so a guest or IoT subnet elsewhere in the block does not inherit access by accident.`,
          `The same caution applies to split-tunnel VPN profiles. Sending all of 192.168.0.0/16 through the tunnel hijacks the user's own home LAN, so their printer and router vanish while connected; push only the specific subnets the company actually uses.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'How many /24 networks are in 192.168.0.0/16?',
        a: '256, from 192.168.0.0/24 to 192.168.255.0/24.',
      },
      {
        q: 'Why does my VPN fail when my home network is 192.168.1.0/24?',
        a: 'The remote network probably uses the same /24. Your computer sends that traffic to the local LAN instead of through the tunnel.',
      },
    ],
  })),

  v('192.168.0.0/24', (f) => ({
    slug: '192-168-0-0-24',
    h1Name: '192.168.0.0/24',
    headline: 'a default home LAN, address by address',
    title: `192.168.0.0/24 — Range, Gateway & Broadcast`,
    description: `192.168.0.0/24: usable hosts ${f.first} to ${f.last}, broadcast ${f.broadcast}, mask ${f.mask}. A common home router default.`,
    lede: `192.168.0.0/24 gives ${f.usable} usable addresses, ${f.first} to ${f.last}, with broadcast ${f.broadcast} and mask ${f.mask}. Many routers ship with it as the default LAN.`,
    sections: [
      {
        heading: 'The addresses',
        paragraphs: [
          `${c(f.network)} is the network address and ${c(f.broadcast)} the broadcast; neither can be given to a device. The remaining ${f.usable} addresses are hosts. The mask is ${c(f.mask)}, the wildcard ${c(f.wildcard)}.`,
          `Routers that use this network typically take ${c('192.168.0.1')} as the gateway and run a DHCP pool over part of the range, for example .100 to .199, leaving the rest for static devices. Nothing in the standard requires the gateway to be .1; it is convention.`,
        ],
      },
      {
        heading: 'Common problems',
        paragraphs: [
          `Double NAT: when an ISP modem and your own router both default to 192.168.0.x, plugging one behind the other either fails (same subnet on both sides) or works with two layers of NAT that break port forwarding. Move one of them to a different third octet.`,
          `If you set a static IP, keep it outside the DHCP pool or reserve it in the router; otherwise the router may lease the same address to another device and both lose connectivity intermittently.`,
        ],
      },
      {
        heading: 'Neighbours and alternatives',
        paragraphs: [
          `Its neighbour ${c('192.168.1.0/24')} is the other very common default; the two together make ${c('192.168.0.0/23')}. Splitting this /24 into two /25s or four /26s gives separate segments for IoT or guests. For a network that VPN users must reach, prefer a less common 10.x block over either default.`,
        ],
      },
      {
        heading: 'Subnet math for this /24',
        paragraphs: [
          `With mask ${c(f.mask)}, any address from 192.168.0.0 to 192.168.0.255 is on-link and anything else, including 192.168.1.x, goes to the gateway. That is why a device statically set to 192.168.1.50 on this network cannot talk to its neighbours even though the addresses look close: they sit in different /24s.`,
          `Paste a device's address and mask into the calculator when it refuses to connect; a mask of 255.255.0.0 or a typo in the third octet shows up immediately in the network address.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'What is the usable range of 192.168.0.0/24?',
        a: `${f.first} to ${f.last}: ${f.usable} addresses. ${f.network} is the network and ${f.broadcast} the broadcast.`,
      },
      {
        q: 'Can I use 192.168.0.0 as a device address?',
        a: 'No. In a /24 it is the network address. The first assignable address is 192.168.0.1.',
      },
    ],
  })),

  v('192.168.1.0/24', (f) => ({
    slug: '192-168-1-0-24',
    h1Name: '192.168.1.0/24',
    headline: 'the most common home network, mapped',
    title: `192.168.1.0/24 — Range, Gateway & Broadcast`,
    description: `192.168.1.0/24: hosts ${f.first} to ${f.last}, broadcast ${f.broadcast}, mask ${f.mask}. Gateway convention, DHCP and VPN clashes.`,
    lede: `192.168.1.0/24 has ${f.usable} usable host addresses from ${f.first} to ${f.last}, broadcast ${f.broadcast}, mask ${f.mask}. It is probably the most widely used LAN subnet in the world.`,
    sections: [
      {
        heading: 'Map of the subnet',
        paragraphs: [
          `Network address ${c(f.network)}, broadcast ${c(f.broadcast)}, and ${f.usable} hosts between them. In router settings the mask appears as ${c(f.mask)}; in an ACL as wildcard ${c(f.wildcard)}.`,
          `${c('192.168.1.1')} is the conventional gateway, which is why typing it into a browser opens so many routers' admin pages. Some routers and mesh systems take ${c('192.168.1.254')} instead. Check ${c('ip route')} on Linux, ${c('route -n get default')} on macOS or ${c('ipconfig')} on Windows to see which one your network uses.`,
        ],
      },
      {
        heading: 'Security and hygiene',
        paragraphs: [
          `Because the gateway address is predictable, malicious web pages have attempted to reach routers at 192.168.1.1 from the visitor's browser. Change the router's default admin password, keep its firmware current and disable remote administration. A private address only keeps hosts off the internet if the NAT and firewall in front of them are configured.`,
          `Reserve static addresses outside the DHCP pool so printers, NAS boxes and cameras keep stable IPs.`,
        ],
      },
      {
        heading: 'Clashes and alternatives',
        paragraphs: [
          `If a company network, a lab VPN or a cloud VPC also uses ${c('192.168.1.0/24')}, remote access breaks for anyone whose home LAN matches. Renumbering the home side is simple: move the router to an unusual third octet. Its neighbour ${c('192.168.0.0/24')} is the other common default, and together they form ${c('192.168.0.0/23')}; a /25 split gives two segments of 126 hosts.`,
        ],
      },
      {
        heading: 'Subnet math for this /24',
        paragraphs: [
          `Any address from 192.168.1.0 to 192.168.1.255 is on-link under ${c(f.mask)}; traffic for 192.168.0.x or 192.168.2.x leaves through the gateway. A device carried over from a network that used 192.168.0.0/24 keeps its old static address and becomes unreachable, the most common home-network support call after a router swap.`,
          `To isolate cameras or smart-home devices, split the /24 into two /25s on separate VLANs, or give them a different /24 entirely and filter traffic between the two.`,
        ],
      },
    ],
    faqs: [
      {
        q: 'What is the broadcast address of 192.168.1.0/24?',
        a: `${f.broadcast}. Packets sent there reach every host on the subnet.`,
      },
      {
        q: 'Is 192.168.1.1 always the router?',
        a: 'Only by convention. Many routers use it, but some use 192.168.1.254 or another address; your default route shows the real one.',
      },
    ],
  })),
];
