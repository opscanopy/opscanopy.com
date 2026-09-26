---
title: "Datasource ${DS_PROMETHEUS} was not found: como corrigir"
description: "Por que dashboards provisionados no Grafana dizem Datasource ${DS_PROMETHEUS} was not found, como achar cada placeholder com jq e quatro correções para o CI."
pubDate: 2026-10-19
draft: true
tags: ["observability", "prometheus"]
lang: pt-br
translationOf: "grafana-datasource-was-not-found"
relatedTool:
  name: "Grafana Dashboard Validator"
  href: "/grafana-dashboard-validator"
---

![Um dashboard do Grafana exportado cujos painéis ainda apontam para um placeholder DS_PROMETHEUS não preenchido, em vez do uid de um datasource Prometheus real](/blog/grafana-datasource-was-not-found-hero.svg)
<!-- keywords: primary: datasource ${ds_prometheus} was not found (<100, n/a) | secondaries: grafana ds_prometheus not found, ds_prometheus not found, grafana datasource not found, grafana __inputs | source: ahrefs free (2026-09-26) -->
<!-- insight: the error text is a lookup key: the exporter names the placeholder from the datasource NAME (first space only), TemplateSrv returns an unknown ${...} unchanged, and provisioning, POST /api/dashboards/db and Terraform store the file verbatim, so DS_* inputs carry no value to substitute, still true in 13.2 | serp-checked: 2026-09-26 -->

Você exportou um dashboard do staging, fez commit do JSON ao lado da sua configuração de provisioning e subiu o Grafana. O dashboard aparece na pasta certa. Todos os painéis estão vazios, e cada um exibe o mesmo canto vermelho:

```text
Datasource ${DS_PROMETHEUS} was not found
```

O seu datasource Prometheus existe e funciona no Explore. Esse erro de datasource não encontrado no Grafana, muitas vezes pesquisado como "DS_PROMETHEUS not found", não quer dizer que o datasource sumiu. O Grafana está imprimindo, ao pé da letra, a chave de busca que recebeu, e essa chave é um placeholder que ninguém preencheu. Depois que você enxerga o problema assim, a correção é mecânica.

> **TL;DR**
>
> - A opção de exportar para compartilhamento ("Export for sharing externally" no Grafana 10 a 11) troca cada datasource por `${DS_<NAME>}` e os lista em `__inputs`. Só o diálogo de Import e a API de import preenchem esses valores.
> - O provisioning por arquivo, o `POST /api/dashboards/db` e o Terraform guardam o arquivo tal como está, então o placeholder chega ao painel.
> - Para encontrá-los: `jq -r 'paths(type == "string" and startswith("${DS_")) | map(tostring) | join(".")' dashboard.json`.
> - Corrija substituindo por um `{ type, uid }` real, fixando esse uid no provisioning do datasource, adicionando uma variável de datasource chamada `DS_PROMETHEUS` ou enviando para `/api/dashboards/import` com `inputs`.

## Por que o Grafana diz "Datasource ${DS_PROMETHEUS} was not found"?

A referência de datasource de um painel passa por `DatasourceSrv.get()`, que roda o uid pelo serviço de templates antes de procurá-lo. O serviço de templates devolve [sem alteração](https://github.com/grafana/grafana/blob/v13.2.2/public/app/features/templating/template_srv.ts) qualquer `${...}` para o qual não tem variável. Assim, a chave continua sendo a string literal `${DS_PROMETHEUS}`, nenhum datasource tem esse uid ou nome, e o [`loadDatasource()`](https://github.com/grafana/grafana/blob/v13.2.2/public/app/features/plugins/datasource_srv.ts) rejeita com a mensagem que você está vendo.

O placeholder foi parar ali durante a exportação. Com a opção de exportação ligada, o Grafana escreve isto:

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

O `__inputs` é uma pergunta para quem importa: qual dos seus datasources deve substituir `DS_PROMETHEUS`? O diálogo de Import faz essa pergunta. Em seguida, o [avaliador de templates](https://github.com/grafana/grafana/blob/v13.2.2/pkg/services/dashboardimport/utils/dash_template_evaluator.go) do lado do servidor substitui cada `${name}` declarado pelo valor que você escolheu e descarta o `__inputs`.

Nada mais faz essa pergunta. Um comentário no próprio código do Grafana, em [export_inputs.go](https://github.com/grafana/grafana/blob/v13.2.2/apps/dashboard/pkg/migration/conversion/export_inputs.go), diz que um template gravado via Terraform, provisioning ou POST direto "is stored verbatim" e que "DS_* inputs carry no value to substitute". O pedido para suportar isso no provisioning, [grafana/grafana#10786](https://github.com/grafana/grafana/issues/10786), está aberto desde 2018.

> **Importante:** o Grafana 13.2.0 ([#129213](https://github.com/grafana/grafana/pull/129213)) passou a resolver inputs constantes `${VAR_*}` em dashboards gravados via provisioning ou POST direto. Ele explicitamente não resolve inputs `DS_*`, então no 13.2.2 este erro se comporta exatamente como antes.

No Grafana 7.x e no início do 8.x, a mesma falha aparecia como `Datasource named ${DS_PROMETHEUS} was not found`, a redação que a maioria dos tópicos de fórum cita. Uma variável de query apontada para o placeholder aparece, em vez disso, como um aviso de templating, relatado nos tópicos como `Error updating options: Datasource named ${DS_PROMETHEUS} was not found` ou `Failed to upgrade legacy queries Datasource ${DS_PROMETHEUS} was not found`.

## De onde vem o nome DS_PROMETHEUS?

Do nome de exibição do datasource, não do seu tipo. O [exportador](https://github.com/grafana/grafana/blob/v13.2.2/public/app/features/dashboard-scene/scene/export/exporters.ts) o monta como `'DS_' + ds.name.replace(' ', '_').toUpperCase()`. Você só recebe `DS_PROMETHEUS` porque o nome padrão é "Prometheus". Um datasource chamado "Thanos" é exportado como `${DS_THANOS}`.

Esse `replace` do JavaScript com um padrão em string troca apenas o primeiro espaço. Um datasource chamado "Prometheus Prod EU" é exportado como `${DS_PROMETHEUS_PROD EU}`, com espaço e tudo. Referências de library panels ganham o sufixo `-FOR-LIBRARY-PANEL`, e variáveis constantes viram inputs `VAR_<NAME>`.

A opção que produz tudo isso mudou de lugar entre versões:

- Grafana 10 a 11: **Export for sharing externally**.
- Do Grafana 11.2 ao 12.3, ela também aparece como **Export the dashboard to use in another instance** (do 12.1 ao 12.3, o caminho é **Export** → **Export as code**).
- Grafana 12.4 e 13: **Export** → **Export as code**, opção **Share dashboard with another instance**, com um modelo de recurso Classic ou V2 em Advanced options.

Se você exporta para o seu próprio repositório de provisioning, deixe a opção desligada. A [documentação de compartilhamento](https://grafana.com/docs/grafana/latest/dashboards/share-dashboards-panels/) cobre as opções de cada versão.

## Como confirmar quais placeholders estão no arquivo?

Três verificações, nesta ordem. Primeiro, liste o que o arquivo espera que seja preenchido:

```bash
jq -c '.__inputs[] | {name, pluginId}' dashboard.json
```

```text
{"name":"DS_PROMETHEUS","pluginId":"prometheus"}
```

Segundo, encontre cada string que ainda contém um placeholder, incluindo as das variáveis de query. Mantenha o filtro entre aspas simples para que o shell não expanda `${DS_...}`:

```bash
jq -r 'paths(type == "string" and startswith("${DS_")) | map(tostring) | join(".")' dashboard.json
```

```text
panels.0.datasource.uid
panels.0.targets.0.datasource.uid
templating.list.0.datasource.uid
```

`grep -nF '${DS_' dashboard.json` dá a mesma resposta, com números de linha. Terceiro, liste os uids que realmente existem na instância de destino. `GET /api/datasources` retorna `id`, `uid`, `orgId`, `name` e `type`, segundo a [documentação da API de data sources](https://grafana.com/docs/grafana/latest/developers/http_api/data_source/):

```bash
curl -sS -H "Authorization: Bearer $GRAFANA_TOKEN" "$GRAFANA_URL/api/datasources" \
  | jq -r '.[] | [.uid, .name, .type] | @tsv'
```

Para pular o jq, cole o JSON do dashboard no [Grafana Dashboard Validator](/pt-br/grafana-dashboard-validator/). No arquivo exportado acima, ele reporta um erro, na regra [unresolved-ds-input](/pt-br/grafana-dashboard-validator/#rule-unresolved-ds-input). Os avisos ao lado dizem respeito ao trecho recortado, que não tem uid, title, gridPos nem schemaVersion:

```text
[error] unresolved-ds-input @ __inputs[0]
"__inputs" declares "DS_PROMETHEUS", an import placeholder that only the Grafana import dialog fills in.
```

O limite dele: ele só lê o arquivo. Um dashboard com um uid de aparência real, como `P1809F7CD0C75ACF3`, passa quer esse uid exista na sua instância, quer não, então confirme-o em `/api/datasources`.

## Qual é a sua causa?

| O que você vê | Causa mais provável |
|---|---|
| `__inputs` presente, arquivo carregado por provisioning ou Terraform | Arquivo feito só para import usado como arquivo provisionado |
| Sem `__inputs`, `${DS_...}` ainda nos painéis | Placeholders que ficaram depois que o `__inputs` foi removido |
| O erro cita um uid de aparência real, não um placeholder | O uid difere entre instâncias |
| A variável `DS_PROMETHEUS` existe, mas não é `type: datasource` | Variável com o tipo errado |

**1. Um arquivo exportado foi provisionado.** Sinal: o `__inputs` está presente e o dashboard entrou pelo file provider, pelo `/api/dashboards/db` ou pelo Terraform. Correção: substitua por um uid real ou carregue o arquivo pela API de import. Verificação: a contagem de placeholders abaixo dá 0.

**2. Placeholders sem `__inputs`.** Sinal: alguém apagou o `__inputs`, ou um chart empacotou o dashboard sem ele. Aí o diálogo de Import não tem nada a perguntar, e o erro sobrevive a um import pela UI. Correção: substitua, ou adicione a variável de datasource. Verificação: os painéis renderizam depois de recarregar.

**3. O uid não existe aqui.** Sinal: depois da substituição, o erro imprime um uid. O Grafana gera um uid automaticamente quando o provisioning não define um, então staging e produção não batem. Correção: fixe o uid no provisioning do datasource. Verificação: o `/api/datasources` o lista.

**4. Uma variável com o nome certo, mas o tipo errado.** Sinal: o `templating.list` tem `DS_PROMETHEUS`, mas como variável custom. Ela resolve para o próprio valor, não para o uid de um datasource. Correção: transforme-a em `type: datasource`. Verificação: a guarda de CI abaixo imprime 0 para o arquivo.

Se a mensagem tiver dois-pontos, `Datasource: ${DS_PROMETHEUS} was not found`, o que falhou foi o carregamento do plugin. Esse é outro problema.

## Como corrigir no provisioning e na API?

**Substitua por um uid real.** Este `walk` troca cada objeto com placeholder, incluindo o da variável de query, e remove as chaves que só servem para import:

```bash
jq --arg uid P1809F7CD0C75ACF3 \
  'walk(if type == "object" and .uid == "${DS_PROMETHEUS}"
        then .uid = $uid else . end)
   | del(.__inputs, .__requires)' \
  dashboard.json > dashboard.provisioned.json
```

Teste o filtro no seu próprio arquivo no [jq playground](/pt-br/jq-playground/), que roda o jq de verdade.

**Fixe o uid para que ele bata em todo lugar.** Defina `uid` no provisioning do datasource, e o valor substituído passa a ser verdadeiro em todas as instâncias:

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    uid: prometheus-main
    access: proxy
    url: http://prometheus:9090
```

O provider de dashboards não precisa de nada especial, mas saiba que ele nunca lê o `__inputs`:

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

Os dois formatos estão na [documentação de provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/).

**Mantenha o placeholder e defina-o.** Uma variável do tipo datasource com exatamente o nome do placeholder resolve `${DS_PROMETHEUS}` para um uid real. A `query` dela é o id do plugin:

```json
{
  "templating": {
    "list": [
      { "type": "datasource", "name": "DS_PROMETHEUS", "query": "prometheus" }
    ]
  }
}
```

**Use a API de import.** `POST /api/dashboards/import` é o endpoint para o qual o diálogo de Import envia. Ele exige `dashboards:create` e não consta da documentação atual da HTTP API, então o formato vem do código-fonte. Troque `<folder-uid>` pelo uid real da pasta de destino: o provider acima cria a pasta pelo título, então o uid dela não é necessariamente `platform`.

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

Deixe um input de fora e a chamada falha com HTTP 400, com a mensagem dentro de um corpo JSON:

```json
{"message":"dashboard import failed: missing dashboard input variable DS_PROMETHEUS"}
```

## Apagar o __inputs é a correção que não corrige?

Sim. Apagar o `__inputs` faz o arquivo parecer um dashboard normal, mas cada `${DS_PROMETHEUS}` continua lá. O erro deixa de ser "provisionado do jeito errado" e vira a causa 2, e agora nem o diálogo de Import consegue repará-lo, porque o avaliador só substitui nomes declarados no `__inputs`.

A segunda falsa correção é trocar o placeholder pelo nome do datasource, `"Prometheus"`. O Grafana procura uma chave pelo uid e depois pelo nome, então isso funciona até alguém renomear o datasource ou outra instância dar a ele um nome diferente. É por isso que o validador sinaliza a forma de string simples como [datasource-by-name](/pt-br/grafana-dashboard-validator/#rule-datasource-by-name).

> **Atenção:** renomear o datasource para bater com o placeholder não muda nada. O painel está procurando um datasource cujo uid ou nome seja literalmente `${DS_PROMETHEUS}`.

## Como impedir que ele volte no CI?

Faça o pipeline falhar quando um dashboard commitado ainda tiver um placeholder que nenhuma variável de datasource define:

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

No arquivo exportado, ele imprime 3 para esse dashboard. Depois da substituição com `walk`, ou com a variável de datasource `DS_PROMETHEUS` no lugar, ele imprime 0.

Faça o loop arquivo por arquivo em vez de passar um glob para `jq -e`, que define o exit code apenas pela última saída. Rode a guarda no mesmo job que copia os dashboards para o caminho de provisioning, para que um arquivo com falha nunca chegue ao Grafana.

Combine-a com a verificação de uid, porque um arquivo limpo ainda pode citar um uid que falta em algum ambiente. A mesma disciplina vale para as queries dentro dele: [Como ler uma consulta PromQL](/pt-br/blog/reading-promql/) explica o que os painéis estão perguntando, e [LogQL vs PromQL](/pt-br/blog/logql-vs-promql/) ajuda quando um painel do Loki fica ao lado deles.

## O que conferir antes de publicar um arquivo de dashboard?

1. Exporte com a opção de compartilhamento desligada quando o arquivo for para o seu próprio repositório de provisioning.
2. Rode o filtro `paths(...)` e leia cada caminho que ele imprimir.
3. Liste os uids com `GET /api/datasources` em cada instância de destino.
4. Fixe esses uids no provisioning do datasource, para que todos os ambientes concordem.
5. Substitua com `walk`, ou adicione uma variável de datasource por placeholder.
6. Remova `__inputs` e `__requires` só depois da substituição.
7. Use `/api/dashboards/import` com `inputs` se você precisar manter o arquivo compartilhável.
8. Adicione a guarda de CI e torne-a obrigatória antes do deploy.

Antes que o próximo dashboard caia na sua pasta de provisioning, cole-o no [Grafana Dashboard Validator](/pt-br/grafana-dashboard-validator/) e corrija o que ele apontar.

Você mantém os dashboards exportados para compartilhamento e os provisionados como arquivos separados, ou gera um a partir do outro no CI?
