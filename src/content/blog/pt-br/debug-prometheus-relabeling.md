---
title: "Por que o Prometheus descartou meu target? Depurando relabel_configs"
description: "Um target sumiu ou um label desapareceu após o relabeling. Depure relabel_configs vs metric_relabel_configs, ancoragem de regex e a lógica de keep/drop."
pubDate: 2026-06-16
tags: ["prometheus","observability","relabeling"]
lang: pt-br
translationOf: "debug-prometheus-relabeling"
relatedTool:
  name: "Prometheus Relabel Tester"
  href: "/prometheus-relabel-tester"
---

![Depurando um target do Prometheus que foi descartado: o ciclo de vida do scrape, do service discovery, passando pelos relabel_configs até o TSDB, com um target destacado como descartado.](/blog/debug-prometheus-relabeling-hero.svg)

Você adicionou um novo exporter, recarregou o Prometheus, abriu `/targets` e ele não está lá. Nenhum erro nos logs. A configuração de scrape foi parseada sem problemas. O exporter está no ar e você consegue dar um `curl` no `/metrics` dele manualmente. Mas o Prometheus descartou seu target e não vai te dizer o porquê. Ou pior — o target aparece, mas um label do qual você depende para roteamento ou dashboards desapareceu silenciosamente. Os dois sintomas quase sempre levam ao mesmo lugar: `relabel_configs`. Este post mostra como depurar `relabel_configs`, onde ele difere de `metric_relabel_configs` e o punhado de erros que explica praticamente todos os targets descartados.

## O sintoma: um target ausente em /targets, ou um label que sumiu

Existem duas falhas distintas, e ajuda dar nome a elas antes de começar a investigar.

A primeira é o **target descartado**: ele nunca aparece em `/targets`, nem mesmo no estado "down". O service discovery o encontrou, mas uma regra de `keep` ou `drop` o removeu antes do scrape rodar. O Prometheus não loga isso — do ponto de vista dele, nada deu errado.

A segunda é o **label que desaparece**: o target é coletado normalmente, mas um label que você esperava sumiu, ou foi sobrescrito por algo inesperado. Você nota isso em `/targets` (passando o mouse sobre os labels) ou consultando a série e percebendo que a dimensão pela qual você queria agrupar não está lá.

```bash
# The target you expect is simply absent from the list:
curl -s localhost:9090/api/v1/targets | jq '.data.activeTargets[].labels.job'
# "node-exporter"
# "blackbox"
#   ← your "api" job never shows up
```

Quando um target está silenciosamente ausente, a causa está antes do scrape. Isso é relabeling. A boa notícia: o relabeling é determinístico. Dados os mesmos labels de entrada e as mesmas regras, você obtém o mesmo resultado todas as vezes, o que significa que você consegue reproduzir o problema offline.

## relabel_configs vs metric_relabel_configs: onde cada um roda

Os dois blocos de configuração aplicam *exatamente as mesmas* ações e semânticas de relabeling. A única diferença é **onde** no ciclo de vida do scrape eles rodam — e essa diferença decide qual sintoma você está depurando.

`relabel_configs` roda **no momento do scrape, antes do scrape**, sobre os labels do target vindos do service discovery. Esses são os labels que decidem *se um target será coletado ou não* e qual é a sua identidade (`job`, `instance`, `__address__`). Um `keep`/`drop` aqui remove um target inteiro. Este é o bloco a inspecionar quando um target está ausente de `/targets`.

`metric_relabel_configs` roda **depois do scrape**, sobre o conjunto de labels de cada sample no momento da ingestão. Um `keep`/`drop` aqui remove séries temporais individuais, não o target. Este é o bloco a inspecionar quando o target está presente, mas séries ou labels específicos estão faltando.

![O ciclo de vida do scrape do Prometheus mostrando o service discovery e os labels __meta_, depois os relabel_configs que podem descartar um target inteiro, depois o scrape, depois os metric_relabel_configs que podem descartar samples individuais, e por fim o TSDB.](/blog/debug-prometheus-relabeling-diagram.svg)

```yaml
scrape_configs:
  - job_name: api
    kubernetes_sd_configs:
      - role: pod

    # Runs BEFORE the scrape, on discovery labels (__meta_*, __address__).
    # A keep/drop here removes the whole target.
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: "true"

    # Runs AFTER the scrape, on each sample. A drop here removes series,
    # not the target.
    metric_relabel_configs:
      - source_labels: [__name__]
        action: drop
        regex: go_gc_.*
```

Se o seu target está ausente, você nunca chega ao `metric_relabel_configs` — depure o `relabel_configs` primeiro. Se o target está presente, mas uma série sumiu, é o outro bloco. Acertar essa distinção é metade da batalha quando você está pesquisando "metric_relabel_configs vs relabel_configs" às 2 da manhã.

## Os suspeitos de sempre

Quase todo target descartado vem de um destes casos. Cada um é fácil de cometer e invisível até você reproduzi-lo.

### Um keep com regex que não casa (porque a regex é ancorada)

Esta é a causa número um. **O Prometheus ancora toda regex de relabel** — internamente ele envolve o seu padrão como `^(?:<your regex>)$`. O padrão precisa casar com o valor de origem concatenado *inteiro*, não com uma substring.

```yaml
- source_labels: [job]
  action: keep
  regex: api          # anchored to ^(?:api)$
```

Isso mantém um target cujo `job` é exatamente `api`. Ele **não** mantém `api-server`, `api-prod` ou `payments-api`. Com uma ação `keep`, tudo que não casa é descartado — então o seu target `api-server` some silenciosamente. A correção é casar com o que você realmente quer dizer:

```yaml
- source_labels: [job]
  action: keep
  regex: api.*        # ^(?:api.*)$ — matches api, api-server, api-prod
```

### Um drop abrangente demais

A imagem espelhada. Um modelo mental sem ancoragem somado a uma regex gulosa captura mais do que o pretendido:

```yaml
- source_labels: [__name__]
  action: drop
  regex: .*_bucket   # drops EVERY *_bucket series, including ones you need
```

`keep` é um portão de lista de permissão (allow-list); `drop` é um portão de lista de bloqueio (deny-list). Um `drop` abrangente demais em `metric_relabel_configs` apaga discretamente séries que você queria manter, e você só percebe quando um dashboard fica em branco.

### source_labels errados, ou a concatenação errada

Quando uma regra lista múltiplos `source_labels`, o Prometheus concatena os valores deles com o **separator** — que por padrão é um único ponto e vírgula `;` — *antes* de aplicar a regex. Se você esquecer do separador, sua regex nunca casa com a string concatenada:

```yaml
# job="api", instance="10.0.0.1:9090" joins to "api;10.0.0.1:9090"
- source_labels: [job, instance]
  action: keep
  regex: api          # ✗ never matches "api;10.0.0.1:9090"
```

Você precisa de uma regex que leve o `;` em conta, por exemplo `api;.*`. Um source label ausente também não é um erro — o Prometheus trata um label ausente como string vazia na concatenação, então `source_labels: [does_not_exist]` concatena para `""` e um `keep: regex: ".+"` descarta tudo.

### Um replacement que sobrescreveu __address__ (ou apagou um label)

`replace` tem um comportamento sutil e bem real: **se a regex não casa, o label é deixado inalterado; mas se ela casa e o replacement expandido é a string vazia, o label do target é apagado, não definido como vazio.** Sobrescreva `__address__` com um valor vazio e o target efetivamente perde seu endereço de scrape.

```yaml
# If prometheus_io_port is absent, the joined value won't match this regex,
# so __address__ is left alone. But a regex that DOES match and expands to ""
# would DELETE __address__ entirely.
- source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
  action: replace
  regex: ([^:]+)(?::\d+)?;(\d+)
  replacement: $1:$2
  target_label: __address__
```

Esse é o mais traiçoeiro, porque um `instance` ou `__address__` vazio não dispara erro — ele simplesmente produz um target que não pode ser coletado ou que colide com outro.

## Um fluxo de trabalho para depuração

Quando um target está ausente, trabalhe de cima para baixo. O objetivo central é recuperar a *entrada exata* que as regras viram, e então reaplicar as regras sobre ela.

### 1. Despeje os labels do target, incluindo os __meta_

O Prometheus expõe os labels de discovery anteriores ao relabel — os labels `__meta_*` —, mas apenas para targets que sobreviveram ao relabeling, então um target totalmente descartado não vai aparecer. O truque é recarregar com as regras de relabel temporariamente removidas (ou reduzidas a um único `keep` permissivo) e então ler os labels brutos do discovery:

```bash
# Show discovered labels for the job, including the __meta_* set the
# relabel rules actually see as input.
curl -s 'localhost:9090/api/v1/targets?state=active' \
  | jq '.data.activeTargets[]
        | select(.discoveredLabels.job=="api")
        | .discoveredLabels'
```

`discoveredLabels` é a entrada dos seus `relabel_configs`. `labels` é a saída. Se um target for totalmente descartado, você também pode ler o estado do service discovery diretamente:

```bash
curl -s localhost:9090/api/v1/targets/metadata >/dev/null  # sanity check API is up
curl -s 'localhost:9090/service-discovery' # the SD page shows pre-relabel labels
```

### 2. Teste as regras contra esses labels

Agora você tem a entrada. Cole os labels `__meta_*` e seus `relabel_configs` n[o Prometheus Relabel Tester](/prometheus-relabel-tester) e rode-os. Ele aplica as regras exatamente como o Prometheus faz — regex ancorada, separador `;`, expansão de `$1`/`${1}` — e te informa, para cada conjunto de labels, os labels resultantes, quais foram adicionados, alterados ou removidos, e se o target foi descartado (e por qual regra).

### 3. Faça a bisseção da lista de regras

Se você tem uma cadeia longa, comente a segunda metade das regras e rode de novo. Se o target sobrevive, o culpado está na metade que você removeu; se ele continua sendo descartado, está na metade que sobrou. Divida pela metade de novo. Como o relabeling é uma cadeia determinística de cima para baixo — cada regra vê a saída da anterior —, a bisseção converge rápido, geralmente em duas ou três rodadas.

## Exemplo prático: o target que desaparece, encontrado e corrigido

Aqui está uma forma real desse bug. Você descobre um pod, quer manter apenas os pods que optaram por participar (opted-in) e rotear por ambiente. O target nunca aparece.

```yaml
relabel_configs:
  - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
    action: keep
    regex: "true"

  - source_labels: [__meta_kubernetes_pod_label_env]
    action: keep
    regex: prod
```

Os labels de discovery do target que você esperava:

```text
__meta_kubernetes_pod_annotation_prometheus_io_scrape="true"
__meta_kubernetes_pod_label_app="api"
__meta_kubernetes_pod_label_env="production"
__address__="10.0.0.5:8080"
```

Rode essa entrada pelas regras. O primeiro `keep` passa — `prometheus_io_scrape` é exatamente `"true"`. O segundo `keep` concatena para `production` e tenta casar com `^(?:prod)$`. Não casa. `production` não é `prod`, a regex é ancorada, e o `keep` descarta tudo que não casa. **A regra 2 descartou o target.** O tester aponta exatamente isso: descartado pela regra 2, ação `keep`.

A correção é casar com o valor real:

```yaml
  - source_labels: [__meta_kubernetes_pod_label_env]
    action: keep
    regex: prod.*       # ^(?:prod.*)$ — now matches "production"
```

Rode de novo. O target sobrevive, carrega `__address__="10.0.0.5:8080"` e aparece em `/targets`. Tempo total: menos de um minuto, sem reload do Prometheus e sem esperar por um intervalo de scrape.

Enquanto você faz essa limpeza, a mesma cadeia normalmente promove labels do pod e poda metadados do discovery. Repare que `labelmap` opera sobre os *nomes* dos labels, copiando os labels que casam para um novo nome, e `labeldrop` remove os labels cujos nomes casam — útil, mas mais um lugar onde um label que você queria pode sumir discretamente:

```yaml
  # Promote pod labels: __meta_kubernetes_pod_label_app="api" → app="api"
  - action: labelmap
    regex: __meta_kubernetes_pod_label_(.+)

  # Strip leftover discovery metadata before storage.
  - action: labeldrop
    regex: __meta_.+
```

## Pegue o problema antes do deploy

O loop de depuração mais rápido é aquele que nunca chega a um Prometheus em produção. A razão pela qual o relabeling é tão fácil de errar é que ele falha silenciosamente: não há erro de parse, não há linha de log, apenas um target que não está lá. A única verificação honesta é rodar as regras contra uma entrada representativa e ler a saída — a mesma ideia por trás de testar qualquer configuração comportamental em vez de confiar em um lint de schema.

Quando você estiver encarando um mistério de "prometheus dropped target" ou um relato de "prometheus label disappeared", pegue os `discoveredLabels` da API, cole-os junto com suas regras n[o Prometheus Relabel Tester](/prometheus-relabel-tester) e observe qual regra causa o estrago — ele roda inteiramente no seu navegador, então configs de scrape internos e metadados de targets nunca saem da sua aba.

Uma vez que os labels estejam corretos, o resto da cadeia de observabilidade vem em seguida. Destrinche uma query que dependa desses labels com [o PromQL Explainer](/promql-explainer), ou confirme que um alerta sobre a série resultante chega ao lugar certo com [o Alertmanager Route Tester](/alertmanager-route-tester). Acerte os labels primeiro; tudo o que vem depois depende de acertar esse passo.
