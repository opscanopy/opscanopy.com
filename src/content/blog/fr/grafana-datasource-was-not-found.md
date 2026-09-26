---
title: "Datasource ${DS_PROMETHEUS} was not found : les correctifs"
description: "Pourquoi un dashboard Grafana provisionné affiche Datasource ${DS_PROMETHEUS} was not found, repérer ses placeholders avec jq, et quatre correctifs sûrs en CI."
pubDate: 2026-10-19
draft: true
tags: ["observability", "prometheus"]
lang: fr
translationOf: "grafana-datasource-was-not-found"
relatedTool:
  name: "Grafana Dashboard Validator"
  href: "/grafana-dashboard-validator"
---

![Un dashboard Grafana exporté dont les panels pointent encore vers un placeholder DS_PROMETHEUS jamais rempli, au lieu de l'uid d'une vraie datasource Prometheus](/blog/grafana-datasource-was-not-found-hero.svg)
<!-- keywords: primary: datasource ${ds_prometheus} was not found (<100, n/a) | secondaries: grafana ds_prometheus not found, ds_prometheus not found, grafana datasource not found, grafana __inputs | source: ahrefs free (2026-09-26) -->
<!-- insight: the error text is a lookup key: the exporter names the placeholder from the datasource NAME (first space only), TemplateSrv returns an unknown ${...} unchanged, and provisioning, POST /api/dashboards/db and Terraform store the file verbatim, so DS_* inputs carry no value to substitute, still true in 13.2 | serp-checked: 2026-09-26 -->

Vous avez exporté un dashboard depuis la préproduction, commité le JSON à côté de votre configuration de provisioning, puis redéployé Grafana. Le dashboard apparaît bien dans le bon dossier. Mais tous les panels sont vides, et chacun porte le même coin rouge :

```text
Datasource ${DS_PROMETHEUS} was not found
```

Votre datasource Prometheus existe pourtant, et elle fonctionne dans Explore. Cette erreur « Grafana datasource not found », souvent recherchée sous la forme « DS_PROMETHEUS not found », ne signifie pas que la datasource manque. Grafana affiche telle quelle la clé de recherche qu'on lui a transmise, et cette clé est un placeholder que personne n'a rempli. Une fois qu'on la lit ainsi, la correction devient mécanique.

> **TL;DR**
>
> - L'option d'export pour le partage (« Export for sharing externally » de Grafana 10 à 11) remplace chaque datasource par `${DS_<NAME>}` et les liste dans `__inputs`. Seuls la boîte de dialogue Import et l'API d'import les remplissent.
> - Le provisioning par fichiers, `POST /api/dashboards/db` et Terraform stockent le fichier tel quel : le placeholder arrive donc jusqu'au panel.
> - Pour les trouver : `jq -r 'paths(type == "string" and startswith("${DS_")) | map(tostring) | join(".")' dashboard.json`.
> - Corrigez en substituant un vrai `{ type, uid }`, en fixant cet uid dans le provisioning des datasources, en ajoutant une variable de datasource nommée `DS_PROMETHEUS`, ou en passant par `/api/dashboards/import` avec `inputs`.

## Pourquoi Grafana affiche-t-il « Datasource ${DS_PROMETHEUS} was not found » ?

La référence de datasource d'un panel passe par `DatasourceSrv.get()`, qui fait transiter l'uid par le service de templating avant de le chercher. Ce service renvoie [inchangé](https://github.com/grafana/grafana/blob/v13.2.2/public/app/features/templating/template_srv.ts) tout `${...}` pour lequel il n'a pas de variable. La clé reste donc la chaîne littérale `${DS_PROMETHEUS}`, aucune datasource n'a cet uid ni ce nom, et [`loadDatasource()`](https://github.com/grafana/grafana/blob/v13.2.2/public/app/features/plugins/datasource_srv.ts) échoue avec le message que vous voyez.

Le placeholder s'est glissé là au moment de l'export. Avec l'option d'export activée, Grafana écrit ceci :

```json
{
  "__inputs": [
    {
      "name": "DS_PROMETHEUS",
      "label": "Prometheus",
      "description": "",
      "type": "datasource",
      "pluginId": "prometheus",
      "pluginName": "Prometheus"
    }
  ],
  "panels": [
    {
      "type": "timeseries",
      "title": "Request rate",
      "datasource": { "type": "prometheus", "uid": "${DS_PROMETHEUS}" },
      "targets": [
        {
          "datasource": { "type": "prometheus", "uid": "${DS_PROMETHEUS}" },
          "expr": "sum(rate(http_requests_total{job=\"$job\"}[5m]))"
        }
      ]
    }
  ],
  "templating": {
    "list": [
      {
        "type": "query",
        "name": "job",
        "datasource": { "type": "prometheus", "uid": "${DS_PROMETHEUS}" },
        "query": "label_values(up, job)"
      }
    ]
  }
}
```

`__inputs` est une question posée à celui qui importe : laquelle de vos datasources doit remplacer `DS_PROMETHEUS` ? La boîte de dialogue Import la pose. L'[évaluateur de templates](https://github.com/grafana/grafana/blob/v13.2.2/pkg/services/dashboardimport/utils/dash_template_evaluator.go) côté serveur remplace ensuite chaque `${name}` déclaré par la valeur choisie, puis supprime `__inputs`.

Rien d'autre ne la pose. Un commentaire du code source de Grafana, dans [export_inputs.go](https://github.com/grafana/grafana/blob/v13.2.2/apps/dashboard/pkg/migration/conversion/export_inputs.go), indique qu'un template écrit via Terraform, le provisioning ou un POST direct « is stored verbatim » et que « DS_* inputs carry no value to substitute ». La demande de prise en charge dans le provisioning, [grafana/grafana#10786](https://github.com/grafana/grafana/issues/10786), est ouverte depuis 2018.

> **Important :** Grafana 13.2.0 ([#129213](https://github.com/grafana/grafana/pull/129213)) s'est mis à résoudre les inputs constants `${VAR_*}` des dashboards stockés via le provisioning ou un POST direct. Il exclut explicitement les inputs `DS_*` : en 13.2.2, cette erreur se comporte donc exactement comme avant.

Sous Grafana 7.x et au début de la 8.x, le même échec s'affichait sous la forme `Datasource named ${DS_PROMETHEUS} was not found`, la formulation que citent la plupart des fils de forum. Une variable de requête pointée vers le placeholder se manifeste plutôt par une notification de templating, rapportée dans ces fils comme `Error updating options: Datasource named ${DS_PROMETHEUS} was not found` ou `Failed to upgrade legacy queries Datasource ${DS_PROMETHEUS} was not found`.

## D'où vient le nom DS_PROMETHEUS ?

Du nom d'affichage de la datasource, pas de son type. L'[exporteur](https://github.com/grafana/grafana/blob/v13.2.2/public/app/features/dashboard-scene/scene/export/exporters.ts) le construit ainsi : `'DS_' + ds.name.replace(' ', '_').toUpperCase()`. Vous obtenez `DS_PROMETHEUS` uniquement parce que le nom par défaut est « Prometheus ». Une datasource appelée « Thanos » s'exporte en `${DS_THANOS}`.

Ce `replace` JavaScript avec un motif de type chaîne ne remplace que le premier espace. Une datasource nommée « Prometheus Prod EU » s'exporte donc en `${DS_PROMETHEUS_PROD EU}`, espace compris. Les références de library panels reçoivent un suffixe `-FOR-LIBRARY-PANEL`, et les variables constantes deviennent des inputs `VAR_<NAME>`.

L'option qui produit tout cela a changé de place selon les versions :

- Grafana 10 à 11 : **Export for sharing externally**.
- Grafana 11.2 à 12.3 l'intitulent aussi **Export the dashboard to use in another instance** (de 12.1 à 12.3, on y accède par **Export** → **Export as code**).
- Grafana 12.4 et 13 : **Export** → **Export as code**, option **Share dashboard with another instance**, avec un modèle Classic ou V2 Resource sous Advanced options.

Si vous exportez pour votre propre dépôt de provisioning, laissez l'option désactivée. La [documentation sur le partage](https://grafana.com/docs/grafana/latest/dashboards/share-dashboards-panels/) détaille les options de chaque version.

## Comment savoir quels placeholders contient le fichier ?

Trois vérifications, dans cet ordre. D'abord, listez ce que le fichier s'attend à voir rempli :

```bash
jq -c '.__inputs[] | {name, pluginId}' dashboard.json
```

```text
{"name":"DS_PROMETHEUS","pluginId":"prometheus"}
```

Ensuite, trouvez toutes les chaînes qui contiennent encore un placeholder, y compris celles des variables de requête. Gardez le filtre entre apostrophes simples pour que le shell n'interprète pas `${DS_...}` :

```bash
jq -r 'paths(type == "string" and startswith("${DS_")) | map(tostring) | join(".")' dashboard.json
```

```text
panels.0.datasource.uid
panels.0.targets.0.datasource.uid
templating.list.0.datasource.uid
```

`grep -nF '${DS_' dashboard.json` donne la même réponse, avec les numéros de ligne. Enfin, listez les uids qui existent réellement sur l'instance cible. `GET /api/datasources` renvoie `id`, `uid`, `orgId`, `name` et `type`, d'après la [documentation de l'API des data sources](https://grafana.com/docs/grafana/latest/developers/http_api/data_source/) :

```bash
curl -sS -H "Authorization: Bearer $GRAFANA_TOKEN" "$GRAFANA_URL/api/datasources" \
  | jq -r '.[] | [.uid, .name, .type] | @tsv'
```

Pour vous passer de jq, collez le JSON du dashboard dans le [Grafana Dashboard Validator](/fr/grafana-dashboard-validator/). Sur le fichier exporté ci-dessus, il signale une erreur, sous la règle [unresolved-ds-input](/fr/grafana-dashboard-validator/#rule-unresolved-ds-input). Les avertissements qui l'accompagnent concernent l'extrait abrégé, qui n'a ni uid, ni title, ni gridPos, ni schemaVersion :

```text
[error] unresolved-ds-input @ __inputs[0]
"__inputs" declares "DS_PROMETHEUS", an import placeholder that only the Grafana import dialog fills in.
```

Sa limite : il ne lit que le fichier. Un dashboard avec un uid d'apparence plausible comme `P1809F7CD0C75ACF3` passe, que cet uid existe ou non sur votre instance ; vérifiez-le donc avec `/api/datasources`.

## Laquelle de ces causes est la vôtre ?

| Ce que vous voyez | Cause la plus probable |
|---|---|
| `__inputs` présent, fichier chargé par le provisioning ou Terraform | Fichier destiné à l'import utilisé comme fichier provisionné |
| Pas de `__inputs`, mais `${DS_...}` encore dans les panels | Placeholders restés après la suppression de `__inputs` |
| L'erreur cite un uid d'apparence réelle, pas un placeholder | L'uid diffère d'une instance à l'autre |
| Une variable `DS_PROMETHEUS` existe, mais pas en `type: datasource` | Variable du mauvais type |

**1. Un fichier exporté a été provisionné.** Le signe : `__inputs` est présent et le dashboard est arrivé par le provider de fichiers, `/api/dashboards/db` ou Terraform. Le correctif : substituer un vrai uid, ou charger le fichier via l'API d'import. La vérification : le compteur de placeholders ci-dessous tombe à 0.

**2. Des placeholders sans `__inputs`.** Le signe : quelqu'un a supprimé `__inputs`, ou un chart a embarqué le dashboard sans lui. La boîte de dialogue Import n'a alors plus rien à demander, et l'erreur survit même à un import depuis l'interface. Le correctif : substituer, ou ajouter la variable de datasource. La vérification : les panels s'affichent après un rechargement.

**3. L'uid n'existe pas sur cette instance.** Le signe : après substitution, l'erreur affiche un uid. Grafana génère automatiquement un uid quand le provisioning n'en fixe pas, si bien que la préproduction et la production ne concordent pas. Le correctif : fixer l'uid dans le provisioning des datasources. La vérification : `/api/datasources` le liste.

**4. Une variable au bon nom, mais du mauvais type.** Le signe : `templating.list` contient `DS_PROMETHEUS`, mais sous forme de variable custom. Elle se résout en sa propre valeur, pas en uid de datasource. Le correctif : la passer en `type: datasource`. La vérification : le garde-fou de CI ci-dessous affiche 0 pour ce fichier.

Si le message contient un deux-points, `Datasource: ${DS_PROMETHEUS} was not found`, c'est le plugin qui n'a pas pu se charger. C'est un autre problème.

## Comment corriger pour le provisioning et l'API ?

**Substituer un vrai uid.** Ce `walk` remplace chaque objet placeholder, y compris celui de la variable de requête, et supprime les clés propres à l'import :

```bash
jq --arg uid P1809F7CD0C75ACF3 \
  'walk(if type == "object" and .uid == "${DS_PROMETHEUS}"
        then .uid = $uid else . end)
   | del(.__inputs, .__requires)' \
  dashboard.json > dashboard.provisioned.json
```

Essayez le filtre sur votre propre fichier dans le [jq playground](/fr/jq-playground/), qui exécute le vrai jq.

**Fixer l'uid pour qu'il concorde partout.** Définissez `uid` dans le provisioning des datasources, et la valeur substituée devient vraie sur chaque instance :

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    uid: prometheus-main
    access: proxy
    url: http://prometheus:9090
```

Le provider de dashboards n'a besoin de rien de particulier, mais sachez qu'il ne lit jamais `__inputs` :

```yaml
apiVersion: 1
providers:
  - name: platform
    orgId: 1
    folder: Platform
    type: file
    disableDeletion: true
    updateIntervalSeconds: 30
    allowUiUpdates: false
    options:
      path: /var/lib/grafana/dashboards
```

Les deux formats figurent dans la [documentation du provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/).

**Garder le placeholder et le définir.** Une variable de type datasource portant exactement le nom du placeholder résout `${DS_PROMETHEUS}` en un vrai uid. Sa `query` est l'identifiant du plugin :

```json
{
  "templating": {
    "list": [
      { "type": "datasource", "name": "DS_PROMETHEUS", "query": "prometheus" }
    ]
  }
}
```

**Passer par l'API d'import.** `POST /api/dashboards/import` est l'endpoint auquel la boîte de dialogue Import envoie sa requête. Il exige `dashboards:create` et ne figure pas dans la documentation actuelle de l'API HTTP : sa forme vient donc du code source. Remplacez `<folder-uid>` par l'uid réel du dossier cible : le provider ci-dessus crée le dossier par son titre, donc son uid n'est pas forcément `platform`.

```bash
jq -n --slurpfile dash dashboard.json \
  --arg uid prometheus-main --arg folder '<folder-uid>' \
  '{dashboard: $dash[0], overwrite: true, folderUid: $folder,
    inputs: [{name: "DS_PROMETHEUS", type: "datasource",
              pluginId: "prometheus", value: $uid}]}' \
  > payload.json

curl -sS -X POST \
  -H "Authorization: Bearer $GRAFANA_TOKEN" \
  -H "Content-Type: application/json" \
  --data @payload.json "$GRAFANA_URL/api/dashboards/import"
```

Oubliez un input, et la requête échoue en HTTP 400, avec le message dans un corps JSON :

```json
{"message":"dashboard import failed: missing dashboard input variable DS_PROMETHEUS"}
```

## Supprimer __inputs, le correctif qui n'en est pas un ?

Oui. Supprimer `__inputs` donne au fichier l'allure d'un dashboard normal, mais chaque `${DS_PROMETHEUS}` reste en place. L'erreur passe de « mal provisionné » à la cause 2, et désormais même la boîte de dialogue Import ne peut plus la réparer, car l'évaluateur ne substitue que les noms déclarés dans `__inputs`.

Le deuxième faux correctif consiste à remplacer le placeholder par le nom de la datasource, `"Prometheus"`. Grafana cherche une clé par uid, puis par nom : cela fonctionne donc jusqu'à ce que quelqu'un renomme la datasource ou qu'une autre instance lui donne un autre nom. C'est pour cette raison que le validateur signale cette forme en chaîne simple sous la règle [datasource-by-name](/fr/grafana-dashboard-validator/#rule-datasource-by-name).

> **Attention :** Renommer la datasource pour qu'elle corresponde au placeholder ne change rien. Le panel cherche une datasource dont l'uid ou le nom est littéralement `${DS_PROMETHEUS}`.

## Comment l'empêcher de revenir en CI ?

Faites échouer le pipeline dès qu'un dashboard commité contient encore un placeholder qu'aucune variable de datasource ne définit :

```bash
status=0
for f in dashboards/*.json; do
  n=$(jq '[.templating.list[]? | select(.type == "datasource") | .name] as $vars
    | [.. | strings | select(startswith("${DS_"))
       | ltrimstr("${") | rtrimstr("}")
       | select(IN($vars[]) | not)] | length' "$f")
  if [ "$n" -ne 0 ]; then echo "$f: $n unresolved placeholder(s)"; status=1; fi
done
exit "$status"
```

Sur le fichier exporté, il affiche 3 pour ce dashboard. Après la substitution par `walk`, ou avec la variable de datasource `DS_PROMETHEUS` en place, il affiche 0.

Bouclez fichier par fichier plutôt que de passer un glob à `jq -e`, qui fixe son code de sortie d'après la dernière sortie seulement. Exécutez le garde-fou dans le même job que celui qui copie les dashboards vers le chemin de provisioning, pour qu'un fichier en échec n'atteigne jamais Grafana.

Associez-le à la vérification des uids, car un fichier propre peut toujours citer un uid absent d'un environnement. La même rigueur s'applique aux requêtes elles-mêmes : [Lire une requête PromQL](/fr/blog/reading-promql/) explique ce que demandent les panels, et [LogQL vs PromQL](/fr/blog/logql-vs-promql/) vous aide quand un panel Loki se trouve à côté.

## Que vérifier avant de livrer un fichier de dashboard ?

1. Exportez avec l'option de partage désactivée quand le fichier est destiné à votre propre dépôt de provisioning.
2. Lancez le filtre `paths(...)` et examinez chaque emplacement qu'il affiche.
3. Listez les uids avec `GET /api/datasources` sur chaque instance cible.
4. Fixez ces uids dans le provisioning des datasources, pour que tous les environnements concordent.
5. Substituez avec `walk`, ou ajoutez une variable de datasource par placeholder.
6. Ne supprimez `__inputs` et `__requires` qu'après la substitution.
7. Passez par `/api/dashboards/import` avec `inputs` si vous devez conserver le fichier partageable.
8. Ajoutez le garde-fou de CI et rendez-le obligatoire avant le déploiement.

Avant que le prochain dashboard n'atterrisse dans votre dossier de provisioning, collez-le dans le [Grafana Dashboard Validator](/fr/grafana-dashboard-validator/) et corrigez ce qu'il signale.

Gardez-vous les dashboards exportés et partageables séparés des dashboards provisionnés, ou générez-vous les uns à partir des autres en CI ?
