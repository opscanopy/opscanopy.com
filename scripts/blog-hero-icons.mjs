// Line icons for the blog covers, keyed by English post slug.
//
// One-time extraction (2026-10-02) of the `translate(980,315)` icon group from
// each hand-authored public/blog/<slug>-hero.svg as it stood at main @ f7331d8,
// before scripts/gen-blog-heroes.mjs took those files over. Each icon is drawn
// in a 300 x 300 box centred on (0,0), in WHITE (#ffffff) with any knock-out ink
// in the old gradient colour; gen-blog-heroes.mjs recolours it (white -> leaf,
// knock-out -> plate, dimmed strokes -> the post's category hue).
//
// `texts` are the motif labels that used to be live <text> (now outlined in
// IBM Plex Mono by the generator); x/y are relative to the icon centre.
// `ariaLabel` is the old <svg aria-label>, kept verbatim (already
// attribute-escaped).
//
// To add a post: append an entry here (any icon drawn the same way), then run
// `npm run gen:heroes`.

/** @type {Record<string, { ariaLabel: string, strokeWidth: number, linecap: string, linejoin: string, body: string, texts: Array<{x:number,y:number,size:number,weight:400|600,anchor:'start'|'middle'|'end',opacity:number,text:string}> }>} */
export const heroIcons = {
  "common-gitlab-ci-mistakes": {
    "ariaLabel": "Common .gitlab-ci.yml mistakes — OpsCanopy CI/CD guide",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<line x1=\"-112\" y1=\"48\" x2=\"112\" y2=\"48\"/>\n<circle cx=\"-112\" cy=\"48\" r=\"28\"/>\n<circle cx=\"0\" cy=\"48\" r=\"28\"/>\n<circle cx=\"112\" cy=\"48\" r=\"28\"/>\n<polygon points=\"0,-120 100,52 -100,52\" fill=\"#5560a8\" stroke=\"#ffffff\" stroke-width=\"7\"/>\n<line x1=\"0\" y1=\"-60\" x2=\"0\" y2=\"6\"/>\n<circle cx=\"0\" cy=\"36\" r=\"7\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>",
    "texts": []
  },
  "convert-docker-run-to-compose": {
    "ariaLabel": "Docker run to Compose — OpsCanopy Docker guide",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<rect x=\"-118\" y=\"-52\" width=\"58\" height=\"44\" rx=\"9\"/>\n<rect x=\"-118\" y=\"14\" width=\"58\" height=\"44\" rx=\"9\"/>\n<line x1=\"-48\" y1=\"2\" x2=\"12\" y2=\"2\"/>\n<polyline points=\"-4,-14 16,2 -4,18\"/>\n<rect x=\"42\" y=\"-78\" width=\"80\" height=\"38\" rx=\"9\"/>\n<rect x=\"42\" y=\"-19\" width=\"80\" height=\"38\" rx=\"9\"/>\n<rect x=\"42\" y=\"40\" width=\"80\" height=\"38\" rx=\"9\"/>\n<circle cx=\"62\" cy=\"-59\" r=\"4\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<circle cx=\"62\" cy=\"0\" r=\"4\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<circle cx=\"62\" cy=\"59\" r=\"4\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>",
    "texts": []
  },
  "cron-expressions-explained": {
    "ariaLabel": "Reading cron expressions — OpsCanopy scheduling guide",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<circle cx=\"0\" cy=\"0\" r=\"108\"/>\n<line x1=\"0\" y1=\"0\" x2=\"0\" y2=\"-68\"/>\n<line x1=\"0\" y1=\"0\" x2=\"50\" y2=\"34\"/>\n<circle cx=\"0\" cy=\"0\" r=\"8\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<line x1=\"0\" y1=\"-128\" x2=\"0\" y2=\"-150\"/>\n<line x1=\"73\" y1=\"-105\" x2=\"86\" y2=\"-123\"/>\n<line x1=\"119\" y1=\"-31\" x2=\"139\" y2=\"-37\"/>\n<line x1=\"119\" y1=\"31\" x2=\"139\" y2=\"37\"/>\n<line x1=\"73\" y1=\"105\" x2=\"86\" y2=\"123\"/>",
    "texts": []
  },
  "cron-to-systemd-timers": {
    "ariaLabel": "cron to systemd timers — OpsCanopy scheduling guide",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<circle cx=\"-95\" cy=\"0\" r=\"72\"/>\n<polyline points=\"-95,0 -95,-42\"/>\n<polyline points=\"-95,0 -60,12\"/>\n<line x1=\"-95\" y1=\"-72\" x2=\"-95\" y2=\"-62\"/>\n<line x1=\"-95\" y1=\"72\" x2=\"-95\" y2=\"62\"/>\n<line x1=\"-167\" y1=\"0\" x2=\"-157\" y2=\"0\"/>\n<line x1=\"-23\" y1=\"0\" x2=\"-33\" y2=\"0\"/>\n<line x1=\"-6\" y1=\"0\" x2=\"40\" y2=\"0\"/>\n<polyline points=\"26,-14 42,0 26,14\"/>\n<circle cx=\"108\" cy=\"0\" r=\"40\"/>\n<circle cx=\"108\" cy=\"0\" r=\"16\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<g stroke-width=\"6\">\n<line x1=\"108\" y1=\"-40\" x2=\"108\" y2=\"-64\"/>\n<line x1=\"108\" y1=\"40\" x2=\"108\" y2=\"64\"/>\n<line x1=\"68\" y1=\"0\" x2=\"44\" y2=\"0\"/>\n<line x1=\"148\" y1=\"0\" x2=\"172\" y2=\"0\"/>\n<line x1=\"80\" y1=\"-28\" x2=\"63\" y2=\"-45\"/>\n<line x1=\"136\" y1=\"28\" x2=\"153\" y2=\"45\"/>\n<line x1=\"80\" y1=\"28\" x2=\"63\" y2=\"45\"/>\n<line x1=\"136\" y1=\"-28\" x2=\"153\" y2=\"-45\"/>\n</g>",
    "texts": []
  },
  "debug-alertmanager-routing": {
    "ariaLabel": "Debugging Alertmanager routing — OpsCanopy observability guide",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<path d=\"M-104 -84 v-12\"/>\n<circle cx=\"-104\" cy=\"-100\" r=\"8\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<path d=\"M-104 -84 C -150 -84 -152 -44 -152 -16 C -152 14 -164 26 -164 26 H -44 C -44 26 -56 14 -56 -16 C -56 -44 -58 -84 -104 -84 Z\"/>\n<path d=\"M-120 26 a16 16 0 0 0 32 0\"/>\n<path d=\"M-6 0 H 50\"/>\n<circle cx=\"50\" cy=\"0\" r=\"9\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<path d=\"M50 0 C 92 0 92 -62 134 -62\"/>\n<path d=\"M50 0 C 92 0 92 62 134 62\"/>\n<circle cx=\"138\" cy=\"-62\" r=\"11\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<circle cx=\"138\" cy=\"62\" r=\"11\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>",
    "texts": []
  },
  "debug-prometheus-relabeling": {
    "ariaLabel": "Debugging Prometheus relabeling — OpsCanopy observability guide",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<polygon points=\"-92,-34 -14,-34 48,28 -30,28\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<polygon points=\"-92,-34 -14,-34 48,28 -30,28\"/>\n<circle cx=\"-60\" cy=\"-6\" r=\"11\" fill=\"#7a5aa0\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<circle cx=\"-60\" cy=\"-6\" r=\"11\"/>\n<circle cx=\"40\" cy=\"8\" r=\"60\"/>\n<line x1=\"83\" y1=\"51\" x2=\"120\" y2=\"88\"/>",
    "texts": []
  },
  "docker-build-failed-to-solve-exit-code-1": {
    "ariaLabel": "Docker build failed to solve with exit code 1 — a stack of image layers stopping at the failing instruction",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<rect x=\"-120\" y=\"-146\" width=\"240\" height=\"52\" rx=\"8\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<rect x=\"-120\" y=\"-146\" width=\"240\" height=\"52\" rx=\"8\"/>\n<rect x=\"-120\" y=\"-78\" width=\"240\" height=\"52\" rx=\"8\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<rect x=\"-120\" y=\"-78\" width=\"240\" height=\"52\" rx=\"8\"/>\n<rect x=\"-120\" y=\"-10\" width=\"240\" height=\"52\" rx=\"8\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<rect x=\"-120\" y=\"-10\" width=\"240\" height=\"52\" rx=\"8\"/>\n<rect x=\"-120\" y=\"58\" width=\"240\" height=\"52\" rx=\"8\" stroke-dasharray=\"16 14\" stroke-opacity=\"0.55\"/>\n<rect x=\"-120\" y=\"126\" width=\"240\" height=\"52\" rx=\"8\" stroke-dasharray=\"16 14\" stroke-opacity=\"0.35\"/>\n<circle cx=\"150\" cy=\"16\" r=\"44\" fill=\"#2f7d82\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<circle cx=\"150\" cy=\"16\" r=\"44\"/>\n<line x1=\"132\" y1=\"-2\" x2=\"168\" y2=\"34\" stroke-width=\"9\"/>\n<line x1=\"168\" y1=\"-2\" x2=\"132\" y2=\"34\" stroke-width=\"9\"/>",
    "texts": []
  },
  "docker-run-vs-compose": {
    "ariaLabel": "docker run vs Docker Compose — OpsCanopy Docker guide",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<line x1=\"0\" y1=\"-100\" x2=\"0\" y2=\"100\"/>\n<line x1=\"20\" y1=\"-55\" x2=\"110\" y2=\"-55\"/>\n<polyline points=\"78,-88 120,-55 78,-22\"/>\n<line x1=\"-20\" y1=\"55\" x2=\"-110\" y2=\"55\"/>\n<polyline points=\"-78,22 -120,55 -78,88\"/>",
    "texts": []
  },
  "env-example-drift": {
    "ariaLabel": "Stop shipping a stale .env.example — OpsCanopy config guide",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<path d=\"M-80 -122 H42 L80 -84 V122 H-80 Z\"/>\n<path d=\"M42 -122 V-84 H80\"/>\n<line x1=\"-46\" y1=\"-50\" x2=\"18\" y2=\"-50\"/>\n<line x1=\"-46\" y1=\"-12\" x2=\"38\" y2=\"-12\"/>\n<line x1=\"-46\" y1=\"26\" x2=\"38\" y2=\"26\"/>\n<line x1=\"-46\" y1=\"64\" x2=\"8\" y2=\"64\"/>\n<circle cx=\"52\" cy=\"-12\" r=\"24\" stroke=\"none\" fill=\"#ffffff\" fill-opacity=\"0.9\"/>\n<g stroke=\"#33652c\" stroke-width=\"7\"><line x1=\"52\" y1=\"-27\" x2=\"52\" y2=\"3\"/><line x1=\"37\" y1=\"-12\" x2=\"67\" y2=\"-12\"/></g>\n<circle cx=\"52\" cy=\"64\" r=\"24\" stroke=\"none\" fill=\"#ffffff\" fill-opacity=\"0.9\"/>\n<g stroke=\"#33652c\" stroke-width=\"7\"><line x1=\"37\" y1=\"64\" x2=\"67\" y2=\"64\"/></g>",
    "texts": []
  },
  "github-actions-cron-timezone-utc": {
    "ariaLabel": "GitHub Actions cron runs in UTC — a clock showing a schedule converted to local time",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<circle r=\"150\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<circle r=\"150\"/>\n<line x1=\"0\" y1=\"-118\" x2=\"0\" y2=\"-132\" stroke-width=\"6\"/>\n<line x1=\"0\" y1=\"118\" x2=\"0\" y2=\"132\" stroke-width=\"6\"/>\n<line x1=\"-118\" y1=\"0\" x2=\"-132\" y2=\"0\" stroke-width=\"6\"/>\n<line x1=\"118\" y1=\"0\" x2=\"132\" y2=\"0\" stroke-width=\"6\"/>\n<line x1=\"0\" y1=\"0\" x2=\"0\" y2=\"-92\" stroke=\"#2f7d82\" stroke-opacity=\"0.95\" stroke-width=\"10\"/>\n<line x1=\"0\" y1=\"0\" x2=\"66\" y2=\"46\" stroke=\"#2f7d82\" stroke-opacity=\"0.95\" stroke-width=\"10\"/>\n<circle r=\"9\" fill=\"#2f7d82\" stroke=\"none\"/>",
    "texts": []
  },
  "github-actions-if-condition-always-true": {
    "ariaLabel": "GitHub Actions if condition always true — OpsCanopy CI/CD guide",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<polygon points=\"-92,-70 -8,-122 76,-70 -8,-18\"/>\n<circle cx=\"-8\" cy=\"-70\" r=\"7\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<path d=\"M-8,-18 V18 H-80 V58\"/>\n<path d=\"M-80,58 l-15,-19 M-80,58 l15,-19\"/>\n<g stroke=\"#ffffff\" stroke-width=\"13\" stroke-opacity=\"1\">\n<path d=\"M-8,-18 V18 H88 V100\"/>\n<path d=\"M88,100 l-21,-25 M88,100 l21,-25\"/>\n</g>",
    "texts": []
  },
  "github-actions-security-misconfigurations": {
    "ariaLabel": "GitHub Actions security mistakes — OpsCanopy security guide",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<path d=\"M0 -120 L105 -82 V10 C105 78 60 118 0 138 C-60 118 -105 78 -105 10 V-82 Z\"/>\n<circle cx=\"0\" cy=\"-8\" r=\"26\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<path d=\"M-13 24 L0 -8 L13 24 Z\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>",
    "texts": []
  },
  "github-actions-workflow-not-triggering-filters": {
    "ariaLabel": "Why a GitHub Actions workflow did not trigger — OpsCanopy CI/CD guide",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<polygon points=\"-115,-108 115,-108 22,-2 22,86 -22,114 -22,-2\" fill=\"#ffffff\" fill-opacity=\"0.12\"/>\n<polyline points=\"-115,-108 115,-108 22,-2 22,86 -22,114 -22,-2 -115,-108\"/>\n<circle cx=\"0\" cy=\"98\" r=\"40\" fill=\"#5560a8\" fill-opacity=\"0.9\"/>\n<circle cx=\"0\" cy=\"98\" r=\"40\"/>\n<line x1=\"-25\" y1=\"98\" x2=\"25\" y2=\"98\"/>",
    "texts": []
  },
  "grafana-datasource-was-not-found": {
    "ariaLabel": "Datasource ${DS_PROMETHEUS} was not found — a dashboard panel pointing at an unfilled placeholder instead of the real Prometheus datasource",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<rect x=\"-145\" y=\"-135\" width=\"160\" height=\"120\" rx=\"10\"/>\n<path d=\"M-145 -103 V-125 A10 10 0 0 1 -135 -135 H-113 Z\" fill=\"#ffffff\" fill-opacity=\"0.95\"/>\n<line x1=\"-120\" y1=\"-50\" x2=\"-10\" y2=\"-50\" stroke-dasharray=\"14 14\" stroke-opacity=\"0.5\"/>\n<line x1=\"15\" y1=\"-75\" x2=\"40\" y2=\"-75\"/>\n<path d=\"M30 -86 L41 -75 L30 -64\"/>\n<rect x=\"50\" y=\"-120\" width=\"95\" height=\"90\" rx=\"10\" stroke-dasharray=\"16 12\" stroke-opacity=\"0.8\"/>\n<g stroke-opacity=\"0.6\">\n<ellipse cx=\"-10\" cy=\"40\" rx=\"70\" ry=\"18\"/>\n<path d=\"M-80 40 V100 A70 18 0 0 0 60 100 V40\"/>\n<path d=\"M-80 70 A70 18 0 0 0 60 70\"/>\n</g>",
    "texts": [
      {
        "x": 97,
        "y": -62,
        "size": 34,
        "weight": 600,
        "anchor": "middle",
        "opacity": 0.9,
        "text": "${}"
      }
    ]
  },
  "how-alertmanager-routing-works": {
    "ariaLabel": "How Alertmanager routing works — OpsCanopy observability guide",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<line x1=\"0\" y1=\"-92\" x2=\"-70\" y2=\"-18\"/>\n<line x1=\"0\" y1=\"-92\" x2=\"70\" y2=\"-18\"/>\n<line x1=\"-70\" y1=\"22\" x2=\"-70\" y2=\"86\"/>\n<line x1=\"70\" y1=\"22\" x2=\"70\" y2=\"86\"/>\n<circle cx=\"0\" cy=\"-100\" r=\"26\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<circle cx=\"-70\" cy=\"0\" r=\"22\"/>\n<circle cx=\"70\" cy=\"0\" r=\"22\"/>\n<circle cx=\"-70\" cy=\"108\" r=\"20\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<circle cx=\"70\" cy=\"108\" r=\"20\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>",
    "texts": []
  },
  "ipv6-subnet-calculator-ipcalc-sipcalc": {
    "ariaLabel": "IPv6 subnet calculator — a /48 block divided into a grid of /64 subnets",
    "strokeWidth": 6,
    "linecap": "butt",
    "linejoin": "round",
    "body": "<rect x=\"-150\" y=\"-150\" width=\"300\" height=\"300\" rx=\"10\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<rect x=\"-150\" y=\"-150\" width=\"300\" height=\"300\" rx=\"10\"/>\n<line x1=\"-75\" y1=\"-150\" x2=\"-75\" y2=\"150\" stroke=\"#2f7d82\" stroke-opacity=\"0.8\" stroke-width=\"4\"/>\n<line x1=\"0\" y1=\"-150\" x2=\"0\" y2=\"150\" stroke=\"#2f7d82\" stroke-opacity=\"0.8\" stroke-width=\"4\"/>\n<line x1=\"75\" y1=\"-150\" x2=\"75\" y2=\"150\" stroke=\"#2f7d82\" stroke-opacity=\"0.8\" stroke-width=\"4\"/>\n<line x1=\"-150\" y1=\"-75\" x2=\"150\" y2=\"-75\" stroke=\"#2f7d82\" stroke-opacity=\"0.8\" stroke-width=\"4\"/>\n<line x1=\"-150\" y1=\"0\" x2=\"150\" y2=\"0\" stroke=\"#2f7d82\" stroke-opacity=\"0.8\" stroke-width=\"4\"/>\n<line x1=\"-150\" y1=\"75\" x2=\"150\" y2=\"75\" stroke=\"#2f7d82\" stroke-opacity=\"0.8\" stroke-width=\"4\"/>\n<rect x=\"-75\" y=\"-75\" width=\"75\" height=\"75\" fill=\"#2f7d82\" fill-opacity=\"0.85\" stroke=\"none\"/>",
    "texts": []
  },
  "jwt-io-alternative": {
    "ariaLabel": "A jwt.io alternative — a JWT decoded in the browser as three linked segments",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<rect x=\"-165\" y=\"-38\" width=\"80\" height=\"76\" rx=\"8\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<rect x=\"-165\" y=\"-38\" width=\"80\" height=\"76\" rx=\"8\"/>\n<line x1=\"-148\" y1=\"-10\" x2=\"-116\" y2=\"-10\" stroke=\"#2f7d82\" stroke-opacity=\"0.9\" stroke-width=\"8\"/>\n<line x1=\"-148\" y1=\"12\" x2=\"-130\" y2=\"12\" stroke=\"#2f7d82\" stroke-opacity=\"0.9\" stroke-width=\"8\"/>\n<circle cx=\"-58\" cy=\"0\" r=\"7\" fill=\"#ffffff\" stroke=\"none\"/>\n<rect x=\"-40\" y=\"-38\" width=\"80\" height=\"76\" rx=\"8\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<rect x=\"-40\" y=\"-38\" width=\"80\" height=\"76\" rx=\"8\"/>\n<line x1=\"-23\" y1=\"-10\" x2=\"9\" y2=\"-10\" stroke=\"#2f7d82\" stroke-opacity=\"0.9\" stroke-width=\"8\"/>\n<line x1=\"-23\" y1=\"12\" x2=\"-5\" y2=\"12\" stroke=\"#2f7d82\" stroke-opacity=\"0.9\" stroke-width=\"8\"/>\n<circle cx=\"67\" cy=\"0\" r=\"7\" fill=\"#ffffff\" stroke=\"none\"/>\n<rect x=\"85\" y=\"-38\" width=\"80\" height=\"76\" rx=\"8\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<rect x=\"85\" y=\"-38\" width=\"80\" height=\"76\" rx=\"8\"/>\n<line x1=\"102\" y1=\"-10\" x2=\"134\" y2=\"-10\" stroke=\"#2f7d82\" stroke-opacity=\"0.9\" stroke-width=\"8\"/>\n<line x1=\"102\" y1=\"12\" x2=\"120\" y2=\"12\" stroke=\"#2f7d82\" stroke-opacity=\"0.9\" stroke-width=\"8\"/>",
    "texts": []
  },
  "kubernetes-oomkilled-exit-code-137": {
    "ariaLabel": "OOMKilled and exit code 137 — a container's memory rising past its configured limit line",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<line x1=\"-140\" y1=\"120\" x2=\"150\" y2=\"120\" stroke-opacity=\"0.5\"/>\n<line x1=\"-140\" y1=\"120\" x2=\"-140\" y2=\"-140\" stroke-opacity=\"0.5\"/>\n<line x1=\"-140\" y1=\"-40\" x2=\"150\" y2=\"-40\" stroke-dasharray=\"16 14\" stroke-opacity=\"0.75\"/>\n<path d=\"M-140 96 L-96 78 L-52 46 L-8 8 L26 -22 L52 -40\"/>\n<circle cx=\"52\" cy=\"-40\" r=\"26\" fill=\"#2b4a8f\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<circle cx=\"52\" cy=\"-40\" r=\"26\"/>\n<line x1=\"40\" y1=\"-52\" x2=\"64\" y2=\"-28\" stroke-width=\"9\"/>\n<line x1=\"64\" y1=\"-52\" x2=\"40\" y2=\"-28\" stroke-width=\"9\"/>\n<path d=\"M84 96 L110 60 L136 96\" stroke-opacity=\"0.6\"/>\n<path d=\"M110 60 L110 118\" stroke-opacity=\"0.6\"/>",
    "texts": [
      {
        "x": -132,
        "y": -56,
        "size": 26,
        "weight": 400,
        "anchor": "start",
        "opacity": 0.8,
        "text": "limit"
      }
    ]
  },
  "kubernetes-service-has-no-endpoints": {
    "ariaLabel": "Kubernetes Service has no endpoints — a Service selector compared against pod labels, where only the matching pod reaches the EndpointSlice",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<path d=\"M-150 -26 H-106 L-84 0 L-106 26 H-150 Z\"/>\n<circle cx=\"-134\" cy=\"0\" r=\"5\" fill=\"#ffffff\" stroke=\"none\"/>\n<line x1=\"-78\" y1=\"-10\" x2=\"-34\" y2=\"-72\"/>\n<line x1=\"-78\" y1=\"10\" x2=\"-34\" y2=\"72\" stroke-dasharray=\"12 14\" stroke-opacity=\"0.6\"/>\n<rect x=\"-24\" y=\"-124\" width=\"92\" height=\"76\" rx=\"10\"/>\n<path d=\"M2 -86 L16 -72 L44 -102\"/>\n<rect x=\"-24\" y=\"48\" width=\"92\" height=\"76\" rx=\"10\" stroke-opacity=\"0.6\"/>\n<line x1=\"8\" y1=\"72\" x2=\"36\" y2=\"100\" stroke-opacity=\"0.6\"/>\n<line x1=\"36\" y1=\"72\" x2=\"8\" y2=\"100\" stroke-opacity=\"0.6\"/>\n<line x1=\"74\" y1=\"-86\" x2=\"94\" y2=\"-40\"/>\n<rect x=\"98\" y=\"-40\" width=\"52\" height=\"96\" rx=\"8\"/>\n<line x1=\"112\" y1=\"-14\" x2=\"136\" y2=\"-14\"/>\n<line x1=\"112\" y1=\"10\" x2=\"136\" y2=\"10\" stroke-opacity=\"0.35\"/>\n<line x1=\"112\" y1=\"32\" x2=\"136\" y2=\"32\" stroke-opacity=\"0.35\"/>",
    "texts": []
  },
  "learn-devops-in-90-days": {
    "ariaLabel": "Learn DevOps in 90 days — the free incident-first path from developer to DevOps engineer",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<rect x=\"-150\" y=\"-70\" width=\"180\" height=\"140\" rx=\"14\"/>\n<line x1=\"-150\" y1=\"-38\" x2=\"30\" y2=\"-38\"/>\n<polyline points=\"-122,-10 -94,16 -122,42\"/>\n<line x1=\"-78\" y1=\"42\" x2=\"-30\" y2=\"42\"/>\n<line x1=\"92\" y1=\"-78\" x2=\"92\" y2=\"72\"/>\n<path d=\"M92 -78 L170 -52 L92 -26 Z\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<path d=\"M92 -78 L170 -52 L92 -26\"/>",
    "texts": []
  },
  "logql-vs-promql": {
    "ariaLabel": "LogQL vs PromQL — OpsCanopy observability guide",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<rect x=\"-115\" y=\"-100\" width=\"230\" height=\"66\" rx=\"16\"/>\n<rect x=\"-115\" y=\"34\" width=\"230\" height=\"66\" rx=\"16\"/>\n<line x1=\"-78\" y1=\"-67\" x2=\"35\" y2=\"-67\"/>\n<line x1=\"-78\" y1=\"67\" x2=\"15\" y2=\"67\"/>\n<circle cx=\"72\" cy=\"-67\" r=\"9\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<circle cx=\"52\" cy=\"67\" r=\"9\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<line x1=\"0\" y1=\"-34\" x2=\"0\" y2=\"34\"/>\n<polyline points=\"-15,-18 0,-34 15,-18\"/>\n<polyline points=\"-15,18 0,34 15,18\"/>",
    "texts": []
  },
  "prometheus-relabel-configs-explained": {
    "ariaLabel": "Prometheus relabel_configs explained — OpsCanopy observability guide",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<path d=\"M-130 -38 L-72 -38 L-46 0 L-72 38 L-130 38 Z\"/>\n<circle cx=\"-112\" cy=\"0\" r=\"8\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<line x1=\"-40\" y1=\"0\" x2=\"-8\" y2=\"0\"/>\n<polyline points=\"-18,-9 -8,0 -18,9\"/>\n<path d=\"M-2 -38 L56 -38 L82 0 L56 38 L-2 38 Z\"/>\n<circle cx=\"16\" cy=\"0\" r=\"8\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<line x1=\"88\" y1=\"0\" x2=\"120\" y2=\"0\"/>\n<polyline points=\"110,-9 120,0 110,9\"/>\n<path d=\"M126 -38 L184 -38 L210 0 L184 38 L126 38 Z\"/>\n<circle cx=\"144\" cy=\"0\" r=\"8\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>",
    "texts": []
  },
  "reading-promql": {
    "ariaLabel": "How to read a PromQL query — OpsCanopy observability guide",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<polyline points=\"-110,55 -110,-35 35,-35\"/>\n<rect x=\"-98\" y=\"18\" width=\"22\" height=\"37\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<rect x=\"-68\" y=\"-2\" width=\"22\" height=\"57\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<rect x=\"-38\" y=\"24\" width=\"22\" height=\"31\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<polyline points=\"-87,3 -57,-22 -27,3 3,-27\"/>\n<circle cx=\"58\" cy=\"-8\" r=\"66\"/>\n<line x1=\"105\" y1=\"39\" x2=\"150\" y2=\"84\"/>",
    "texts": []
  },
  "regex-for-log-lines": {
    "ariaLabel": "Robust regex for log lines — OpsCanopy logs guide",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<g transform=\"translate(0,-58)\">\n<line x1=\"-104\" y1=\"34\" x2=\"-72\" y2=\"-34\"/>\n<line x1=\"72\" y1=\"34\" x2=\"104\" y2=\"-34\"/>\n<circle cx=\"-26\" cy=\"22\" r=\"11\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<g transform=\"translate(30,-4)\">\n<line x1=\"0\" y1=\"-26\" x2=\"0\" y2=\"26\"/>\n<line x1=\"-23\" y1=\"-13\" x2=\"23\" y2=\"13\"/>\n<line x1=\"-23\" y1=\"13\" x2=\"23\" y2=\"-13\"/>\n</g>\n</g>\n<g transform=\"translate(0,86)\">\n<line x1=\"-96\" y1=\"0\" x2=\"64\" y2=\"0\"/>\n<line x1=\"-96\" y1=\"38\" x2=\"96\" y2=\"38\"/>\n<line x1=\"-96\" y1=\"76\" x2=\"32\" y2=\"76\"/>\n</g>",
    "texts": []
  },
  "terraform-forces-replacement": {
    "ariaLabel": "Terraform forces replacement — the old resource crossed out and destroyed, then a new one created in its place: -/+",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<rect x=\"-145\" y=\"-50\" width=\"100\" height=\"100\" rx=\"8\" stroke-dasharray=\"16 14\" stroke-opacity=\"0.6\"/>\n<line x1=\"-117\" y1=\"-22\" x2=\"-73\" y2=\"22\" stroke-opacity=\"0.6\"/>\n<line x1=\"-73\" y1=\"-22\" x2=\"-117\" y2=\"22\" stroke-opacity=\"0.6\"/>\n<rect x=\"45\" y=\"-50\" width=\"100\" height=\"100\" rx=\"8\"/>\n<line x1=\"95\" y1=\"-24\" x2=\"95\" y2=\"24\"/>\n<line x1=\"71\" y1=\"0\" x2=\"119\" y2=\"0\"/>\n<path d=\"M-95 -72 Q0 -160 95 -72\"/>\n<path d=\"M86 -100 L95 -72 L66 -78\"/>",
    "texts": [
      {
        "x": 0,
        "y": 140,
        "size": 60,
        "weight": 600,
        "anchor": "middle",
        "opacity": 0.9,
        "text": "-/+"
      }
    ]
  },
  "test-github-actions-locally": {
    "ariaLabel": "Test GitHub Actions locally — a workflow box with a checkmark verified before it reaches the runner",
    "strokeWidth": 8,
    "linecap": "round",
    "linejoin": "round",
    "body": "<rect x=\"-140\" y=\"-110\" width=\"280\" height=\"220\" rx=\"14\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<rect x=\"-140\" y=\"-110\" width=\"280\" height=\"220\" rx=\"14\"/>\n<line x1=\"-104\" y1=\"-62\" x2=\"60\" y2=\"-62\" stroke=\"#a85a06\" stroke-opacity=\"0.85\" stroke-width=\"9\"/>\n<line x1=\"-104\" y1=\"-30\" x2=\"30\" y2=\"-30\" stroke=\"#a85a06\" stroke-opacity=\"0.85\" stroke-width=\"9\"/>\n<circle cx=\"0\" cy=\"46\" r=\"52\" fill=\"#a85a06\" fill-opacity=\"0.92\" stroke=\"none\"/>\n<path d=\"M -22 46 L -6 64 L 26 24\" stroke=\"#ffffff\" stroke-width=\"11\" fill=\"none\"/>",
    "texts": []
  },
  "unable-to-get-local-issuer-certificate": {
    "ariaLabel": "Unable to get local issuer certificate — one server certificate checked against four separate client trust stores, curl, git, npm and pip, with one store missing the issuer",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<rect x=\"-60\" y=\"-140\" width=\"120\" height=\"86\" rx=\"8\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<rect x=\"-60\" y=\"-140\" width=\"120\" height=\"86\" rx=\"8\"/>\n<line x1=\"-36\" y1=\"-110\" x2=\"12\" y2=\"-110\" stroke=\"#904d49\" stroke-opacity=\"0.9\" stroke-width=\"9\"/>\n<line x1=\"-36\" y1=\"-86\" x2=\"-4\" y2=\"-86\" stroke=\"#904d49\" stroke-opacity=\"0.9\" stroke-width=\"9\"/>\n<line x1=\"0\" y1=\"-54\" x2=\"0\" y2=\"0\"/>\n<line x1=\"-135\" y1=\"0\" x2=\"135\" y2=\"0\"/>\n<line x1=\"-135\" y1=\"0\" x2=\"-135\" y2=\"40\"/>\n<line x1=\"-45\" y1=\"0\" x2=\"-45\" y2=\"40\"/>\n<line x1=\"45\" y1=\"0\" x2=\"45\" y2=\"40\" stroke-dasharray=\"10 12\" stroke-opacity=\"0.55\"/>\n<line x1=\"135\" y1=\"0\" x2=\"135\" y2=\"40\"/>\n<rect x=\"-167\" y=\"40\" width=\"64\" height=\"64\" rx=\"8\" fill=\"#ffffff\" fill-opacity=\"0.9\"/>\n<rect x=\"-77\" y=\"40\" width=\"64\" height=\"64\" rx=\"8\" fill=\"#ffffff\" fill-opacity=\"0.9\"/>\n<rect x=\"13\" y=\"40\" width=\"64\" height=\"64\" rx=\"8\" fill=\"#ffffff\" fill-opacity=\"0.25\"/>\n<rect x=\"103\" y=\"40\" width=\"64\" height=\"64\" rx=\"8\" fill=\"#ffffff\" fill-opacity=\"0.9\"/>\n<path d=\"M-151 73 L-139 85 L-117 59\" stroke=\"#904d49\" stroke-opacity=\"0.9\"/>\n<path d=\"M-61 73 L-49 85 L-27 59\" stroke=\"#904d49\" stroke-opacity=\"0.9\"/>\n<line x1=\"31\" y1=\"58\" x2=\"59\" y2=\"86\" stroke-width=\"9\"/>\n<line x1=\"59\" y1=\"58\" x2=\"31\" y2=\"86\" stroke-width=\"9\"/>\n<path d=\"M119 73 L131 85 L153 59\" stroke=\"#904d49\" stroke-opacity=\"0.9\"/>",
    "texts": [
      {
        "x": -135,
        "y": 135,
        "size": 20,
        "weight": 400,
        "anchor": "middle",
        "opacity": 0.85,
        "text": "curl"
      },
      {
        "x": -45,
        "y": 135,
        "size": 20,
        "weight": 400,
        "anchor": "middle",
        "opacity": 0.85,
        "text": "git"
      },
      {
        "x": 45,
        "y": 135,
        "size": 20,
        "weight": 400,
        "anchor": "middle",
        "opacity": 0.85,
        "text": "npm"
      },
      {
        "x": 135,
        "y": 135,
        "size": 20,
        "weight": 400,
        "anchor": "middle",
        "opacity": 0.85,
        "text": "pip"
      }
    ]
  },
  "unifying-cve-ignore-files": {
    "ariaLabel": "Unifying CVE ignore files — OpsCanopy security guide",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<line x1=\"-30\" y1=\"-30\" x2=\"-74\" y2=\"-74\"/>\n<polyline points=\"-74,-50 -74,-74 -50,-74\"/>\n<line x1=\"30\" y1=\"-30\" x2=\"74\" y2=\"-74\"/>\n<polyline points=\"50,-74 74,-74 74,-50\"/>\n<line x1=\"-30\" y1=\"30\" x2=\"-74\" y2=\"74\"/>\n<polyline points=\"-74,50 -74,74 -50,74\"/>\n<line x1=\"30\" y1=\"30\" x2=\"74\" y2=\"74\"/>\n<polyline points=\"50,74 74,74 74,50\"/>\n<rect x=\"-118\" y=\"-118\" width=\"40\" height=\"40\" rx=\"6\"/>\n<rect x=\"78\" y=\"-118\" width=\"40\" height=\"40\" rx=\"6\"/>\n<rect x=\"-118\" y=\"78\" width=\"40\" height=\"40\" rx=\"6\"/>\n<rect x=\"78\" y=\"78\" width=\"40\" height=\"40\" rx=\"6\"/>\n<path d=\"M0 -56 L40 -39 V5 C40 36 21 53 0 63 C-21 53 -40 36 -40 5 V-39 Z\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<polyline points=\"-17,0 -4,15 21,-17\" stroke=\"#a8721f\" stroke-width=\"8\"/>",
    "texts": []
  },
  "unit-testing-loki-alert-rules": {
    "ariaLabel": "Unit testing Loki alert rules — OpsCanopy observability guide",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<circle cx=\"-80\" cy=\"0\" r=\"60\" stroke-opacity=\"0.55\"/>\n<polyline points=\"-110,4 -88,30 -50,-30\"/>\n<path d=\"M66 -56 C32 -56 12 -32 12 2 C12 30 4 46 -6 58 L138 58 C128 46 120 30 120 2 C120 -32 100 -56 66 -56 Z\"/>\n<line x1=\"66\" y1=\"-56\" x2=\"66\" y2=\"-74\"/>\n<path d=\"M52 58 C52 76 80 76 80 58\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<path d=\"M52 58 C52 76 80 76 80 58\"/>",
    "texts": []
  },
  "validate-gitlab-ci-yml": {
    "ariaLabel": "Validate .gitlab-ci.yml — OpsCanopy CI/CD guide",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<line x1=\"-95\" y1=\"55\" x2=\"-25\" y2=\"55\"/>\n<line x1=\"25\" y1=\"55\" x2=\"95\" y2=\"55\"/>\n<circle cx=\"-95\" cy=\"55\" r=\"26\"/>\n<circle cx=\"0\" cy=\"55\" r=\"26\"/>\n<circle cx=\"95\" cy=\"55\" r=\"26\"/>\n<polyline points=\"-72,-28 -16,30 100,-86\" stroke-width=\"16\"/>",
    "texts": []
  },
  "x509-certificate-signed-by-unknown-authority": {
    "ariaLabel": "x509 certificate signed by unknown authority — a TLS chain with the intermediate link missing",
    "strokeWidth": 7,
    "linecap": "round",
    "linejoin": "round",
    "body": "<rect x=\"-108\" y=\"-150\" width=\"120\" height=\"86\" rx=\"8\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<rect x=\"-108\" y=\"-150\" width=\"120\" height=\"86\" rx=\"8\"/>\n<line x1=\"-84\" y1=\"-120\" x2=\"-36\" y2=\"-120\" stroke=\"#a8721f\" stroke-opacity=\"0.9\" stroke-width=\"9\"/>\n<line x1=\"-84\" y1=\"-96\" x2=\"-52\" y2=\"-96\" stroke=\"#a8721f\" stroke-opacity=\"0.9\" stroke-width=\"9\"/>\n<line x1=\"-48\" y1=\"-64\" x2=\"-48\" y2=\"-26\"/>\n<line x1=\"-96\" y1=\"-6\" x2=\"-4\" y2=\"-6\" stroke-dasharray=\"14 16\" stroke-opacity=\"0.55\"/>\n<line x1=\"-78\" y1=\"-30\" x2=\"-18\" y2=\"20\" stroke-width=\"9\"/>\n<line x1=\"-18\" y1=\"-30\" x2=\"-78\" y2=\"20\" stroke-width=\"9\"/>\n<line x1=\"-48\" y1=\"46\" x2=\"-48\" y2=\"84\"/>\n<rect x=\"-108\" y=\"84\" width=\"120\" height=\"86\" rx=\"8\" fill=\"#ffffff\" fill-opacity=\"0.9\" stroke=\"none\"/>\n<rect x=\"-108\" y=\"84\" width=\"120\" height=\"86\" rx=\"8\"/>\n<line x1=\"-84\" y1=\"114\" x2=\"-36\" y2=\"114\" stroke=\"#a8721f\" stroke-opacity=\"0.9\" stroke-width=\"9\"/>\n<line x1=\"-84\" y1=\"138\" x2=\"-52\" y2=\"138\" stroke=\"#a8721f\" stroke-opacity=\"0.9\" stroke-width=\"9\"/>",
    "texts": []
  }
};
