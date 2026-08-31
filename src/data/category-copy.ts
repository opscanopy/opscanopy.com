/**
 * Long-form copy for the 12 `/tools/<category>/` landing pages.
 *
 * Kept out of `tools.ts` deliberately: that file is the registry (structured data
 * consumed by the grid, breadcrumbs, JSON-LD and cross-links), and 2,000+ words of
 * prose would bury it. `categoryBlurb` there stays the one-line summary used for the
 * meta description; this is the body.
 *
 * Why it exists: each category page's entire unique copy was that single blurb
 * sentence, used twice — once as the meta description and once as the visible lead.
 * Twelve pages sharing a formulaic title ("X tools."), a formulaic H1 and one
 * duplicated sentence is the weakest indexable surface on the site, and duplicating
 * the meta description into the body adds no information for a reader OR a crawler.
 *
 * Each entry answers the question the grid cannot: when do you reach for this class
 * of tool, and what specifically goes wrong without it.
 */
export const categoryIntro: Record<string, string[]> = {
  Networking: [
    'Subnetting is the arithmetic everyone does under pressure and nobody does twice the same way. You are mid-incident, someone asks whether 10.20.4.0/22 overlaps the VPC CIDR you allocated last quarter, and the honest answer is that you are about to count in binary on a napkin.',
    'The mistakes are predictable. Off-by-one on the broadcast address. Forgetting that a /31 has no usable hosts in the classic model but is legal for point-to-point links. Assuming IPv6 behaves like IPv4 with longer numbers, when the host counts are large enough that ordinary JavaScript numbers silently lose precision.',
    'These tools do the maths exactly. Every calculation runs on BigInt, so a /8 in IPv4 and a /48 in IPv6 are equally correct — no float rounding, no truncation at 2^53. Parsers return a specific reason when input is rejected ("Octet 256 is greater than 255") rather than a generic failure, because during an incident "invalid" is not a useful answer.',
  ],
  Security: [
    'Security artefacts are exactly the things you should be most reluctant to paste into a website. A JWT carries claims and sometimes a session. A certificate chain reveals internal hostnames. A vulnerability-suppression file lists what you have chosen not to fix, and where.',
    'That is the whole reason these run client-side. There is no backend to receive what you paste, no request that carries it, and no account tying it to you — which you can verify in your browser network tab, or by disconnecting from the internet and watching the tool keep working.',
    'The chain checker is the one worth knowing about: it does real per-link signature verification with Web Crypto rather than just pretty-printing fields, so it can tell you the chain is out of order and why, which is the single most common cause of "certificate signed by unknown authority" in Go and Docker.',
  ],
  Encoding: [
    'Encoding tools are the ones you use ten times a day and never think about — until the round trip is not clean and you cannot tell whether the problem is your data, your encoder, or the terminal you pasted through.',
    'Most of the failures are about variants nobody documents. Standard Base64 versus the URL-safe alphabet that swaps + and / for - and _. Whether padding is present. Whether a URL encoder is escaping a whole URL or a single query parameter, which need different treatment for characters like & and =.',
    'These are built to make the variant explicit rather than guessing, and to round-trip losslessly so you can confirm the transformation rather than assume it.',
  ],
  Kubernetes: [
    'Kubernetes resource numbers are easy to write and hard to reason about. A container asking for 250m CPU and 512Mi memory is unremarkable on its own; the same manifest at 40 replicas with two sidecars is a scheduling decision, and nothing in the YAML tells you that.',
    'The units actively work against you. Millicores are thousandths of a core. Mi is 1,048,576 bytes and M is 1,000,000 — a distinction that quietly matters when you multiply by replica count. Requests decide scheduling and eviction order; limits decide whether you get OOMKilled. Confusing the two is behind a large share of "the pod keeps restarting and there is nothing in the logs".',
    'These tools total what a workload actually reserves across containers and replicas, and test label selectors against real objects so you find out that a selector matches nothing before a Service silently routes to no pods.',
  ],
  Observability: [
    'The queries and rules that decide whether you get paged are, for most teams, the least tested code they run. A relabel rule that drops the target you needed, an alert that never fires because the expression compares a vector to a scalar, a route that sends the database page to the wrong team — none of these fail loudly. They fail by being silent when you needed noise.',
    'This is the part of the catalog with the least competition, and it is not an accident. Testing this properly means implementing the semantics: how Prometheus applies relabel actions in sequence, how Alertmanager walks a route tree with continue and nested matchers, how Loki evaluates a LogQL rule against a time series it does not have.',
    'So that is what these do. The Alertmanager simulator models routing the way the router does, including the ordering rules the official routing-tree editor has an open accuracy bug about. The Loki rule tester is the promtool equivalent Loki never shipped, which is still an open feature request upstream.',
  ],
  'CI/CD': [
    'Pipeline configuration is code that only runs in production. There is no local execution, no type checker, and the feedback loop is a push, a wait, and a red X — which is why the average workflow accumulates a long tail of things that look right and are not.',
    'The GitHub Actions expression footgun is the canonical example. Write `if: ${{ github.event_name }} == \'push\'` and the runner substitutes the value, leaves the comparison as literal text, and evaluates a non-empty string — which is truthy. The step runs on every event. It has never once done what it looks like it does, and it has been an open issue since 2021.',
    'These validate the YAML, flag the security misconfigurations linters usually skip, and — for expressions specifically — tell you the actual value GitHub would compute, using GitHub\'s coercion rules rather than JavaScript\'s.',
  ],
  Scheduling: [
    'Cron syntax is five fields that everyone half-remembers. The ambiguity is real: day-of-month and day-of-week are ORed, not ANDed, so `0 0 13 * 5` fires on the 13th and on every Friday, not on Friday the 13th. Step values, ranges and lists compose in ways that are easy to write and hard to read back.',
    'systemd timers solve some of this and introduce their own vocabulary. OnCalendar is more expressive than cron and less familiar, and the mapping between them is not one-to-one — a cron line with a step value does not always have an obvious OnCalendar equivalent.',
    'These explain an expression in plain English, show you the next actual run times so you can sanity-check the reading, and convert between crontab and systemd units when you are migrating.',
  ],
  Logs: [
    'Log parsing is regex under adversarial conditions. The pattern works on the three lines you tested and fails on the one with a quoted field containing a space, or an IPv6 address where you assumed dots, or a user agent with a bracket in it.',
    'Testing this against production data has an obvious problem: production logs contain production data. Anything you paste into a hosted regex tester has left your machine, which for access logs means IP addresses and request paths.',
    'These run locally so that is not a consideration, and they show capture groups and named groups as they match, so you can see which part of the line each group actually took — usually the thing you were wrong about.',
  ],
  Config: [
    'Configuration drift is the failure mode where nothing is broken and everything is. The code reads an environment variable that was added three sprints ago; `.env.example` never learned about it; a new developer clones the repo, follows the README exactly, and gets a runtime error that names a variable they have never heard of.',
    'It is nobody\'s fault and nobody\'s job, which is why it persists. The example file is documentation that is never executed, so nothing enforces it.',
    'This compares what the code actually reads against what the example file actually declares, in both directions — missing keys that will break a fresh setup, and stale keys that will send someone hunting for a variable nothing uses any more.',
  ],
  Docker: [
    'Most Dockerfile problems are not syntax errors. They are the patterns that work today and fail on a Tuesday in three months: `apt-get update` in its own layer, cached long after the index it downloaded went stale upstream, so `install` eventually asks for a package version that no longer exists.',
    'Others are quieter. A secret passed as a build arg is in the image history forever. A COPY ordered before dependency installation busts the layer cache on every source change, turning a 10-second rebuild into a two-minute one. Exec form does not run a shell, so the `&&` you wrote is a literal argument.',
    'These flag the structural problems from a real parse of the file rather than a regex, and convert between `docker run` and Compose so a working command becomes a file you can commit.',
  ],
  Utilities: [
    'These are the small conversions that interrupt real work. A Unix timestamp in a log line you need in a readable timezone. A file mode you can read as `rwxr-xr-x` but need as 0755. An identifier you want sortable rather than random.',
    'The reason to have them here rather than reaching for whatever is top of the search results is narrow and practical: what you paste into them is frequently a fragment of production — a timestamp from an incident, a hash from a build, a string from a customer record. These run entirely in your browser, so that fragment does not become someone else\'s log line.',
    'They are also chosen to be exact about things that are usually fudged: ULIDs versus UUIDv4 and when sortability matters, and the difference between decimal and binary units when a "1 GB" limit is actually 1 GiB.',
  ],
  IaC: [
    'A Terraform plan is the most important thing you read all week and the least readable. Several hundred lines of diff, in which the three that matter — the resource being replaced rather than updated, the one whose deletion takes data with it — look exactly like the ones that do not.',
    'The failure is human and predictable. Plans are skimmed because they are long, and the destructive change is not visually distinguished from an added tag.',
    'This summarises a plan into what is actually being created, updated, replaced and destroyed, so the count of destructive operations is a number you read rather than something you might have scrolled past.',
  ],
};
