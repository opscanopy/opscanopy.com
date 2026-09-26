---
title: "Kubernetes Service has no endpoints : le bug du selector"
description: "Un Service Kubernetes sans endpoints, ou un Deployment rejeté par selector does not match template labels ? Un bug, deux symptômes, et comment le corriger."
pubDate: 2026-10-12
draft: true
tags: ["kubernetes", "containers", "debugging"]
lang: fr
translationOf: "kubernetes-service-has-no-endpoints"
relatedTool:
  name: "Kubernetes Label Selector Tester"
  href: "/kubernetes-label-selector-tester"
---

![Le selector d'un Service comparé aux labels des pods : les pods correspondants alimentent une EndpointSlice, un label divergent laisse le Service sans endpoints](/blog/kubernetes-service-has-no-endpoints-hero.svg)
<!-- keywords: primary: kubernetes service has no endpoints (<100, KD n/a) | secondaries: selector does not match template labels, kubernetes service no endpoints, endpoints none kubernetes, kubectl get pods label selector | source: ahrefs free (2026-09-26) -->
<!-- insight: not-Ready pods stay in the EndpointSlice with ready:false (only IP-less/terminal pods drop out); a zero-match Service still gets a placeholder slice showing <unset>, so the IP's location, not the slice's existence, tells selector bug from readiness | serp-checked: 2026-09-26 -->

Les pods sont Running. Le Service existe. Chaque requête qui lui est adressée reste bloquée ou se fait refuser, et aucun log n'explique pourquoi. Vous lancez un describe sur le Service et tombez sur la seule ligne qui compte :

```text
Endpoints:                <none>
```

Avec un kubectl récent, cette ligne peut être vide au lieu d'afficher `<none>` ; c'est le même problème. Votre Service Kubernetes n'a aucun endpoint, et aucun composant ne le signale comme une erreur. La version bruyante du même bug apparaît quand vous appliquez plutôt le Deployment :

```text
The Deployment "checkout" is invalid: spec.template.metadata.labels: Invalid value: {"app":"check-out"}: `selector` does not match template `labels`
```

Deux erreurs, un seul bug : un selector qui ne correspond à rien.

> **TL;DR**
>
> - Un Service sélectionne les pods par leurs labels. Si aucun jeu de labels de pod ne satisfait toutes les clés de `spec.selector`, le Service n'a aucun endpoint et rien ne s'en plaint.
> - Remontez la chaîne dans l'ordre : le selector du Service, puis `kubectl get pods -l <selector>`, puis `kubectl get endpointslices -l kubernetes.io/service-name=<svc>`, puis la condition `ready` de chaque endpoint.
> - Aucune IP de pod nulle part : le selector ne correspond à rien (ou les pods n'ont pas encore d'IP). Une IP dans la slice avec `ready: false` : c'est la readiness, pas les labels.
> - Le selector d'un Deployment est immuable en `apps/v1`. Le modifier impose de supprimer puis recréer, avec `--cascade=orphan` si les pods doivent continuer de tourner.

## Que signifie un Service Kubernetes sans endpoints ?

Un Service ne connaît pas les Deployments. Il porte une map de labels dans `spec.selector`, et le contrôleur EndpointSlice liste les pods du namespace du Service dont les labels contiennent chacune des paires de cette map. Les IP de ces pods deviennent les endpoints du Service.

![Le spec.selector du Service est comparé aux labels de chaque pod du même namespace ; les pods correspondants qui ont une IP sont inscrits dans une EndpointSlice, et chaque endpoint porte une condition ready qui décide s'il reçoit du trafic](/blog/kubernetes-service-has-no-endpoints-diagram.svg)

Le selector d'un Service ne connaît que l'égalité : [la documentation sur les labels](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#service-and-replicationcontroller) précise que seules les exigences fondées sur l'égalité sont prises en charge, et toutes les paires sont combinées par un ET logique. Une clé en trop, une valeur mal orthographiée ou un mauvais namespace, et l'ensemble des correspondances est vide.

Un ensemble vide est parfaitement valide. Le contrôleur écrit malgré tout une EndpointSlice de substitution, sans ports ni endpoints : « une slice existe » ne prouve donc rien. Ce symptôme silencieux constitue à lui seul tout le mode de défaillance, et c'est pour cela qu'on met si longtemps à le trouver. Si vous avez besoin de contexte sur l'objet lui-même, la [section Services du guide Kubernetes](/learn/guides/kubernetes-for-devops/#services) le couvre.

## Comment remonter du selector jusqu'aux pods ?

Parcourez la chaîne maillon par maillon, en partant de ce que le Service demande réellement, pas de ce que vous croyez qu'il demande :

```bash
kubectl get service checkout -n shop -o jsonpath='{.spec.selector}'
kubectl get pods -n shop -l app=checkout,tier=backend
kubectl get pods -n shop --show-labels
```

La deuxième commande reprend mot pour mot le selector du Service, les paires séparées par des virgules. Si elle ne renvoie aucun pod, le bug se trouve dans les labels ou le namespace, et vous pouvez cesser de regarder le réseau. La troisième affiche les labels que portent réellement les pods, pour les comparer clé par clé.

Pour vérifier les deux manifestes avant que quoi que ce soit n'atteigne un cluster, collez le Service dans le champ Selector du [Kubernetes Label Selector Tester](/fr/kubernetes-label-selector-tester/) (mode selector YAML) et le Deployment dans `resources.yaml`.

Le testeur affiche le Deployment et son template de pod sur des lignes distinctes, et nomme la clause qui échoue : sur la ligne du template de pod, il marque `tier=frontend` d'un ✗ avec la raison `label tier="backend" ≠ "frontend"`. Une limite, pour être honnête : il affiche le namespace de chaque ligne mais ne le compare jamais, si bien qu'un Service dans `default` « correspondra » à un pod dans `shop`.

> **Attention :** lisez la ligne « Pod template », pas le compteur en tête de résultat. Quand le selector du Service a été copié depuis les `metadata.labels` du Deployment lui-même et que ceux-ci diffèrent des labels du template, le testeur annonce « 1 of 2 resources matches », parce que la ligne du Deployment correspond. La ligne Pod template échoue, et c'est elle que le Service sélectionne.

Le dernier maillon est l'EndpointSlice. C'est la production réelle du contrôleur, elle tranche donc les débats. Interrogez-la par le label que le contrôleur appose sur chaque slice, comme le fait la [tâche debug-service](https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/#does-the-service-have-any-endpointslices) :

```bash
kubectl get endpointslices -n shop -l kubernetes.io/service-name=checkout
```

Pour un Service qui ne correspond à rien, vous obtenez une seule ligne, la slice de substitution, et sa colonne ENDPOINTS affiche `<unset>` et non `<none>`. Vous ne verrez pas « No resources found ».

`kubectl describe service` est moins direct qu'il n'y paraît. Depuis kubectl v1.31, il lit les EndpointSlices, et depuis la v1.32, sa ligne `Endpoints:` ignore les endpoints qui ne sont pas prêts. Les anciennes versions de kubectl affichaient `<none>` pour un objet Endpoints vide ; avec un kubectl plus récent, la ligne peut tout simplement être vide.

Évitez `kubectl get endpoints` pour ce diagnostic. Face à un API server v1.33 ou plus récent, la commande répond d'abord par un avertissement, parce que l'API Endpoints v1 est [dépréciée au profit d'EndpointSlice](https://kubernetes.io/blog/2025/04/24/endpoints-deprecation/) :

```text
Warning: v1 Endpoints is deprecated in v1.33+; use discovery.k8s.io/v1 EndpointSlice
```

## Le pod est-il dans la slice, mais pas Ready ?

C'est là que la plupart des checklists se trompent. Un pod qui a une IP mais n'est pas Ready ne quitte pas l'EndpointSlice. Il y reste listé avec `conditions.ready: false`, et les consommateurs comme kube-proxy ne lui envoient pas de trafic. La [référence des conditions](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/#conditions) décrit `ready`, `serving` et `terminating`.

Les pods Pending qui n'ont pas encore d'IP, ainsi que les pods Succeeded ou Failed, sont totalement exclus. Le diagnostic dépend donc de l'endroit où l'IP apparaît :

| Ce que vous voyez | Ce que cela indique |
|---|---|
| Aucune IP de pod dans la slice, aucun pod renvoyé par `get pods -l` | Selector ou namespace qui ne correspond pas |
| Aucune IP de pod dans la slice, pods Pending sans IP | Pods non planifiés, ou sandbox du pod pas encore créée |
| IP dans la slice, absente de `describe svc` | Readiness : vérifiez `conditions.ready` |

Affichez directement l'adresse et la condition ready de chaque endpoint :

```bash
kubectl get endpointslices -n shop -l kubernetes.io/service-name=checkout \
  -o jsonpath='{range .items[*].endpoints[*]}{.addresses[0]}{" ready="}{.conditions.ready}{"\n"}{end}'
```

Si les IP sont présentes avec `ready=false`, les labels sont corrects et c'est votre [readiness probe](/learn/guides/kubernetes-for-devops/#health-probes) qu'il faut déboguer.

## Quelles erreurs de selector en sont la cause, et comment corriger chacune ?

Vérifiez-les dans cet ordre. Chacune a son indice, son correctif et sa vérification.

**1. Faute de frappe ou dérive d'un label.** Indice : `get pods -l` ne renvoie rien, mais `--show-labels` montre une valeur presque identique, comme `app=Checkout` face à `app=checkout`. Les valeurs sont sensibles à la casse. Correctif : corrigez le côté fautif, en général celui qui a été modifié en dernier. Vérification : `get pods -l` liste les pods.

**2. Selector copié depuis les `metadata.labels` du Deployment.** Indice : le selector du Service correspond aux labels de l'objet Deployment, pas à ceux du template de pod. Correctif : copiez depuis `spec.template.metadata.labels`. Vérification : la ligne Pod template du testeur passe.

**3. Mauvais namespace.** Indice : les pods existent, mais pas dans le `metadata.namespace` du Service. Le contrôleur ne liste que les pods du namespace du Service. Correctif : déplacez l'un des deux. Vérification : `get pods -n <service-namespace> -l ...` les renvoie.

**4. Pods pas Ready, ou encore sans IP.** Indice : des IP apparaissent avec `ready=false`, ou les pods sont Pending. Correctif : la probe ou le problème de planification, pas le selector. Vérification : `ready=true` dans la slice.

**5. Une clé de selector en trop.** Indice : toutes les clés correspondent sauf une, par exemple `tier: frontend` face à des pods labellisés `tier: backend`. Correctif : retirez la clé ou ajoutez le label au template. Vérification : `get pods -l` avec le selector complet liste les pods.

> **En pratique :** la [tâche debug-service](https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/) cite précisément ce bug parmi les erreurs courantes : un Service qui sélectionne `app=hostnames` alors que le Deployment, tel que le créaient les anciennes versions de `kubectl run`, spécifie `run=hostnames`.

## Pourquoi le Deployment rejette-t-il son propre selector ?

L'erreur bruyante, c'est la même non-correspondance, détectée un niveau plus tôt. Le `spec.selector` d'un Deployment doit correspondre à ses `spec.template.metadata.labels`, et l'API server l'impose lors de la validation : `kubectl apply` échoue donc quel que soit le client utilisé. En `apps/v1`, le selector ne prend pas de valeur par défaut depuis le template, l'omettre n'est donc pas une échappatoire : `spec.selector` est obligatoire.

La valeur fautive s'affiche différemment selon la version de l'API server. À partir de la v1.34, elle est rendue en JSON, comme dans l'exemple d'ouverture. Les serveurs plus anciens l'affichent en syntaxe Go :

```text
The Deployment "checkout" is invalid: spec.template.metadata.labels: Invalid value: map[string]string{"app":"check-out"}: `selector` does not match template `labels`
```

Deux erreurs voisines sont distinctes. Un selector vide donne `empty selector is invalid for deployment`, et un selector absent est signalé comme obligatoire sur `spec.selector`. Les StatefulSets et les DaemonSets émettent le même message « does not match ». Le correctif est toujours le même : faire des labels du template un sur-ensemble du selector ; la [section Deployments](/learn/guides/kubernetes-for-devops/#replicasets-and-deployments) du guide montre la paire qui correspond.

## Peut-on modifier le selector d'un Deployment après sa création ?

Non. En `apps/v1`, le selector est immuable, et une mise à jour qui le modifie échoue avec `field is immutable`. Sur un serveur v1.34 ou plus récent, cela donne :

```text
The Deployment "checkout" is invalid: spec.selector: Invalid value: {"matchLabels":{"app":"checkout","tier":"backend"}}: field is immutable
```

La [documentation des Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#label-selector-updates) indique explicitement que `kubectl patch`, `kubectl edit`, `kubectl apply` et `helm upgrade` se heurtent tous à cette règle. La seule voie consiste à supprimer puis recréer. Supprimer un Deployment supprime par défaut ses pods, ce qui signifie une interruption de service : rendez-les plutôt orphelins :

```bash
kubectl delete deployment checkout -n shop --cascade=orphan
kubectl apply -f deployment.yaml
kubectl get replicasets -n shop
```

Le ReplicaSet orphelin garde ses pods en service pendant le déploiement du nouveau Deployment. Une fois les nouveaux pods Ready et présents dans la slice, supprimez tout ReplicaSet qu'aucun Deployment ne possède.

> **Astuce :** modifiez le selector du Service en dernier. Si vous lui ajoutez une clé avant que les nouveaux pods ne portent ce label, le Service ne correspond plus à rien et ses endpoints se vident aussitôt.

## Corriger targetPort fait-il revenir les endpoints ?

C'est le correctif qui n'en est pas un. Un `targetPort` numérique erroné ne vide jamais la liste des endpoints : le contrôleur recopie le numéro et liste le pod malgré tout. Le trafic échoue alors au niveau du port, ce qui ressemble au même problème vu de l'extérieur mais constitue un autre bug. Le modifier ne remplira pas une slice vide.

Un `targetPort` nommé que le pod ne déclare pas est plus subtil. L'EndpointSlice liste toujours l'adresse du pod, mais le port est abandonné, si bien que la colonne PORTS affiche `<unset>`. L'ancien contrôleur Endpoints va plus loin et omet le pod de ce subset : tout ce qui lit encore les Endpoints montre donc le pod comme absent.

Redémarrer les pods ou recréer le Service ne change rien, dans un cas comme dans l'autre. Si vous visiez un port nommé, vérifiez que le conteneur déclare un port portant exactement ce nom, comme le demande la checklist debug-service. Sinon, laissez `targetPort` tranquille et revenez aux labels.

## Que vérifier quand un Service Kubernetes n'a aucun endpoint ?

Une courte routine qui couvre toutes les causes ci-dessus, erreur bruyante comprise :

1. Affichez le `spec.selector` du Service avec `-o jsonpath`, et notez son namespace.
2. Lancez `kubectl get pods -n <namespace> -l <selector>`. Un résultat vide désigne les labels ou le namespace.
3. Comparez avec `kubectl get pods --show-labels`, clé par clé, casse comprise.
4. Assurez-vous que le selector a été copié depuis `spec.template.metadata.labels`, et non depuis les labels du Deployment lui-même.
5. Interrogez `kubectl get endpointslices -l kubernetes.io/service-name=<svc>`. Des endpoints `<unset>` signalent la slice de substitution, pas un résultat.
6. Si des IP sont présentes, lisez `conditions.ready` ; `false` vous renvoie à la readiness probe.
7. Si un Deployment refuse de s'appliquer, alignez son selector sur les labels de son template. Si le selector lui-même doit changer, supprimez avec `--cascade=orphan` et recréez.
8. Gardez `targetPort` pour la fin, et ne le soupçonnez que lorsque c'est le port, et non l'endpoint, qui manque.

Pour un problème de mémoire plutôt que de selector, l'article voisin sur [OOMKilled et le code de sortie 137](/blog/kubernetes-oomkilled-exit-code-137/) suit la même routine : confirmer, puis corriger.

Avant le prochain apply, collez votre Service et votre Deployment dans le [Kubernetes Label Selector Tester](/fr/kubernetes-label-selector-tester/), et lisez la ligne Pod template.

Quel label a dérivé dans votre cluster : un `app` renommé, ou un `tier` que personne ne se souvient d'avoir ajouté ?
