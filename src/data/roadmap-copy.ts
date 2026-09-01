/**
 * Long-form copy for the six `/learn/roadmaps/<slug>/` pages.
 *
 * Kept out of `roadmaps.ts` for the same reason `category-copy.ts` is kept out of
 * `tools.ts` and `tests-copy.ts` out of `tests.ts`: that file is 378 lines of stage
 * and node structure, and prose would bury it.
 *
 * Why it exists: each roadmap page rendered 160–253 words, of which only **20–26**
 * were unique — the title and the description, with the title reused verbatim as the
 * H1 and the description reused verbatim as the lead paragraph. Everything else was
 * checkbox labels plus chrome identical across all six pages.
 *
 * Each entry answers the question the checkbox list cannot: why this order. That is
 * the only thing a roadmap has that a topic list does not, and it was the one thing
 * these pages never said.
 */
export const roadmapIntro: Record<string, string[]> = {
  devops: [
    'The reason DevOps feels impossibly broad is that most lists of it are unordered. Terraform, Kubernetes, Prometheus, CI/CD, AWS — presented flat, as though you could start anywhere. You cannot, and trying is what makes people bounce off it twice.',
    'The ordering here is not arbitrary. Linux comes first because every later abstraction leaks into it: a container is a process with namespaces, a pod is a container with a lifecycle, and when either misbehaves you are reading `ps`, `ss` and journal output. Networking comes before Kubernetes because a Service is a load balancer over an IP range, and "the pod cannot reach the database" is a subnet question wearing a Kubernetes hat.',
    'Cloud comes after containers rather than before, because managed container services assume you already know what they are managing. Observability comes last of the technical stages, not because it matters least but because you cannot instrument a system you cannot yet reason about — alerting on a system you do not understand produces noise you then learn to ignore.',
    'Expect it to take months rather than weeks, and expect the middle to be the hardest part. The stages are sized so each one is useful on its own: you are employable somewhere partway through, not only at the end.',
  ],
  linux: [
    'Almost every DevOps failure eventually becomes a Linux question. The container will not start, the disk is full, the service exits immediately, the port is already bound — and the tooling above it can only tell you that something is wrong, not what.',
    'This path front-loads the filesystem and the process model because they are what every later topic is built from. Permissions before services, because a systemd unit that cannot read its own config fails in a way the logs describe unhelpfully. Processes and signals before containers, because a container is a process and "it will not stop" is almost always a signal-handling problem.',
    'Bash comes last deliberately. Scripting is the easiest part to learn badly — you can write working scripts long before you can write ones that fail safely — and it is much easier once you already know what the commands you are stringing together actually do.',
  ],
  docker: [
    'Docker is easy to use and hard to use well, and the gap between those shows up as builds that take four minutes when they should take ten seconds, images that ship your AWS keys in a layer nobody looks at, and a container that runs on your laptop and not in CI.',
    'The order here follows how the abstraction is built. Images and layers first, because the layer cache explains most of what is otherwise mysterious about build times and image size — including why reordering two lines in a Dockerfile can change a rebuild from minutes to seconds.',
    'Networking and volumes come before Compose, because Compose is mostly a declarative wrapper over exactly those two things plus process ordering. Learning Compose first gives you a file you can edit but not debug.',
    'Registries and CI come last, since pushing an image is the easy part once the image is right.',
  ],
  kubernetes: [
    'Kubernetes has a reputation for complexity that is only half-deserved. The object model is small — a handful of resources that compose — and most of the difficulty is that people meet those objects in the wrong order, usually starting with a Helm chart that hides all of them.',
    'So this starts with pods and deployments in isolation, then adds Services and Ingress once there is something to route to. Config and secrets come next because they are what turns a demo into something you would deploy twice. Resource requests and limits get their own stage rather than a footnote, because they decide scheduling and eviction, and getting them wrong produces OOMKills that look like application bugs.',
    'Production operations comes last: probes, rollouts, and the debugging loop for when a pod will not start. By then the failure modes are legible, because you know what each object was supposed to do.',
  ],
  networking: [
    'Networking is the layer people skip and then spend years compensating for. It is invisible when it works, which makes it easy to defer — and it is the root cause of a large share of the incidents that get escalated, which makes deferring it expensive.',
    'The order is bottom-up because the abstractions genuinely stack. Addressing and subnets first: CIDR is the notation everything else is written in, from a VPC to a Kubernetes Service range to a firewall rule, and being fluent in it makes cloud networking read as arithmetic rather than incantation.',
    'DNS comes next because it is where a startling proportion of outages actually live, and because "it works by IP but not by name" is only diagnosable if you know what the resolver is doing. HTTP and TLS follow, then load balancing, then the troubleshooting toolkit — `dig`, `ss`, `tcpdump` — which is last only because the tools are most useful once you know what you are looking for.',
  ],
  aws: [
    'AWS has more than two hundred services and a DevOps engineer uses perhaps fifteen of them regularly. The rest are noise until you have a specific problem, and treating the console as a syllabus is how people spend six months learning services they will never touch.',
    'IAM comes first, unavoidably. It is the service you cannot avoid, the one that blocks everything else when it is wrong, and the one with the most surprising failure modes — a policy that works in the console and not from an instance is a role-versus-user confusion, not a bug.',
    'Compute and networking come together because in AWS they are the same problem: an EC2 instance is only reachable if the VPC, subnet, route table and security group all agree, and the diagnostic is knowing which of those four is lying.',
    'Storage and databases follow, then the CLI. Cost and security guardrails are last in order but should be first in a real account: an unnoticed NAT gateway or a public bucket is the most common way a learning account becomes an incident.',
  ],
};
