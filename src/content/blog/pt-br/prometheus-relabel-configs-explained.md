---
title: "relabel_configs do Prometheus explicado: um guia prático"
description: "Entenda os relabel_configs do Prometheus de ponta a ponta — source_labels, regex, replacement e cada action (replace, keep, drop, labelmap, hashmod) — com receitas prontas para copiar e colar."
pubDate: 2026-06-13
tags: ["prometheus","observability","relabeling"]
lang: pt-br
translationOf: "prometheus-relabel-configs-explained"
relatedTool:
  name: "Prometheus Relabel Tester"
  href: "/prometheus-relabel-tester"
---

![Diagrama de um pipeline de relabel_configs do Prometheus mostrando os source_labels combinados em um valor, comparados a uma regex ancorada e uma action como replace, keep, drop, labelmap ou hashmod reescrevendo os labels de saída.](/blog/prometheus-relabel-configs-explained-hero.svg)

Um target que você esperava coletar simplesmente nunca aparece no Prometheus. Nenhum erro nos logs, nenhum scrape falho, nada vermelho na página de targets — a série simplesmente não está lá. Você adiciona `--log.level=debug`, reinicia, fica apertando os olhos diante da saída e, no fim, encontra: uma regra `keep` três linhas adentro do seu `relabel_configs` descartou o target silenciosamente porque a regex não casou da forma que você imaginava. Essa falha silenciosa é exatamente o motivo pelo qual `relabel_configs` merece uma leitura cuidadosa. O relabeling do Prometheus reescreve, mantém ou descarta targets e seus labels, e quando está errado ele não reclama — apenas joga fora suas métricas.

Este guia percorre o relabeling do Prometheus do zero: o que ele faz, os campos que compõem cada regra e cada action com um pequeno exemplo. A semântica aqui é exatamente a mesma que o motor do [Prometheus Relabel Tester](/prometheus-relabel-tester) implementa, então você pode colar nele qualquer snippet abaixo e ver os labels mudarem.

## O que o relabeling realmente faz

O relabeling roda sobre um conjunto de labels e produz um novo conjunto de labels. É só isso. Todo target que o Prometheus descobre chega como um amontoado de labels — seu endereço, seu job e uma pilha de labels `__meta_*` vindos do service discovery. Antes de o scrape acontecer, suas regras de `relabel_configs` rodam de cima para baixo sobre esses labels. Cada regra enxerga a saída da regra anterior.

Uma regra pode fazer uma de três coisas com esse conjunto de labels:

- **Reescrever** um label (ou criar um) — `replace`, `labelmap`, `lowercase`, `uppercase`, `hashmod`.
- **Descartar o target inteiro**, de modo que ele nunca seja coletado — `keep`, `drop`, `keepequal`, `dropequal`.
- **Remover labels individuais** pelo nome — `labeldrop`, `labelkeep`.

```yaml
scrape_configs:
  - job_name: api
    static_configs:
      - targets: ["10.0.0.5:8080"]
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
```

Depois que essa regra roda, o target passa a carregar um label `instance` copiado de `__address__`. Nada deu erro, nada foi descartado — um label foi reescrito. Esse é o trabalho inteiro do relabeling, repetido regra a regra.

Há dois lugares onde o relabeling roda. O `relabel_configs` roda *antes* do scrape, sobre os labels de discovery do target, e pode manter ou descartar targets inteiros. O `metric_relabel_configs` roda *depois* do scrape, sobre os labels de cada amostra, e é usado para descartar ou reescrever séries temporais individuais. Mesmas actions, mesma semântica — só mudam o momento e a entrada.

## Os blocos de construção: source_labels, separator, regex, modulus, target_label, replacement, action

Toda regra de relabel é montada a partir do mesmo punhado de campos. A maioria tem valores padrão, então uma regra raramente define todos eles.

```yaml
- source_labels: [job, instance]   # which label values to read
  separator: ";"                   # how to join them (default ";")
  regex: "(.*);(.*)"               # pattern to match the joined value (default "(.*)")
  modulus: 8                       # only for hashmod
  target_label: combined           # label to write (required by some actions)
  replacement: "$1-$2"             # value to write, with $1/${1} expansion (default "$1")
  action: replace                  # what to do (default "replace")
```

Veja como uma regra processa isso. O Prometheus lê cada nome em `source_labels`, busca seu valor (um label ausente é lido como string vazia) e os junta com `separator`. O separador padrão é um único ponto e vírgula, então `source_labels: [job, instance]` com `job="api"`, `instance="10.0.0.1:9090"` produz o valor combinado `api;10.0.0.1:9090`.

Esse valor combinado é comparado com a `regex`. O detalhe que pega todo mundo: **a regex é totalmente ancorada**. O Prometheus envolve o seu padrão como `^(?:your-regex)$`, então ele precisa casar com o valor combinado *inteiro*, não apenas com uma parte dele.

```yaml
# This does NOT match "api-server" — the regex must match the whole value.
- source_labels: [job]
  regex: api
  action: keep
```

Uma regra `regex: api` não vai manter um target cujo `job` seja `api-server`, porque `^(?:api)$` só casa com a string literal `api`. Você precisaria de `api.*` ou `(api.*)`. Esse único fato explica a maioria dos mistérios do tipo "meu target sumiu".

Quando a regex casa e a action escreve um label, o `replacement` fornece o valor. Os grupos de captura se expandem como `$1`, `${1}` ou grupos nomeados `$name`/`${name}`; o replacement padrão é `$1`, e é por isso que um `replace` simples com `regex: (.*)` repassa o valor de origem sem alterações. O `modulus` só é lido pelo `hashmod`, e o `target_label` é obrigatório para `replace`, `hashmod`, `lowercase`, `uppercase`, `keepequal` e `dropequal`.

![Ilustração synthwave de uma regra de relabel: os source_labels fluem por uma regex ancorada, o replacement $1:$2 se expande e actions como replace, keep, labelmap e hashmod reescrevem os labels.](/blog/in-content/prometheus-relabel-configs-explained.webp)

## As actions uma a uma: replace, keep, drop, labelmap, labelkeep, labeldrop, hashmod

O Prometheus suporta onze actions. Cada exemplo abaixo é uma regra completa e executável.

### replace

Junte os source labels, case a regex, expanda `$1`/`${1}` no `replacement` e defina o `target_label`.

```yaml
- source_labels: [__address__]
  regex: "([^:]+):.*"
  target_label: ip
  replacement: "$1"
```

`__address__="10.0.0.5:8080"` vira um novo label `ip="10.0.0.5"`. Se a regex não casa, o conjunto de labels fica inalterado. Há uma armadilha que vale memorizar: **se o replacement expandido for a string vazia, o `replace` apaga o target label** em vez de defini-lo como vazio.

```yaml
# When tmp_instance is empty, this DELETES the instance label.
- source_labels: [tmp_instance]
  regex: "(.+)"
  target_label: instance
  replacement: "$1"
```

Com `instance="old"`, `tmp_instance=""`, a regex `(.+)` não casa com um valor vazio, então nada acontece — `instance` sobrevive. Mas mude a origem para que a expansão resulte em uma string vazia e o label `instance` desaparece por completo. Essa assimetria é uma fonte frequente de "para onde foi meu label?".

### keep

Descarta o target inteiro, a menos que a origem combinada case com a regex.

```yaml
- source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
  action: keep
  regex: "true"
```

Apenas os pods anotados com `prometheus.io/scrape: "true"` sobrevivem; todo o resto é descartado antes do scrape. O `keep` é um portão de lista de permissões (allow-list).

### drop

O espelho do `keep`: descarta o target quando a origem combinada *de fato* casa.

```yaml
- source_labels: [__name__]
  action: drop
  regex: "go_gc_.*"
```

Usado em `metric_relabel_configs`, isso silencia toda a família de métricas `go_gc_*` antes de ela ser armazenada. O `drop` é um portão de lista de bloqueio (deny-list).

### labelmap

O `labelmap` opera sobre os **nomes** dos labels, não sobre os valores. Para cada label cujo nome casa com a regex, ele define um novo label — nomeado pelo replacement expandido — com o valor desse label.

```yaml
- action: labelmap
  regex: "__meta_kubernetes_pod_label_(.+)"
```

Um label `__meta_kubernetes_pod_label_app="api"` produz um novo label `app="api"`. Esse é o movimento canônico para promover os labels de pods do Kubernetes a labels comuns. O `replacement` padrão de `$1` é o que escreve o sufixo capturado como o novo nome.

### labelkeep / labeldrop

Ambos filtram labels pelo nome. O `labeldrop` remove todo label cujo nome casa; o `labelkeep` remove todo label cujo nome *não* casa.

```yaml
# Strip all leftover service-discovery metadata.
- action: labeldrop
  regex: "__meta_.+"
```

```yaml
# Keep only the four labels you care about; drop everything else.
- action: labelkeep
  regex: "(__name__|job|instance|severity)"
```

### hashmod

O `hashmod` define o `target_label` como um número de shard estável. Ele calcula o MD5 da origem combinada, lê os últimos 8 bytes desse digest como um inteiro big-endian de 64 bits e armazena `hash % modulus`.

```yaml
- source_labels: [__address__]
  action: hashmod
  modulus: 3
  target_label: __tmp_shard
```

Todo target recebe um valor `__tmp_shard` determinístico de `0`, `1` ou `2`. A receita do MD5 importa: o Relabel Tester reproduz exatamente isso, byte por byte, então os valores de shard que ele mostra são os valores que o Prometheus vai calcular.

### keepequal / dropequal

Esses dois não usam regex. Eles comparam o valor da origem combinada com o *valor atual* do `target_label` e mantêm ou descartam conforme a igualdade.

```yaml
# Drop the target if its port already equals the discovered one.
- source_labels: [__meta_port]
  action: dropequal
  target_label: port
```

O `keepequal` mantém apenas quando os dois são iguais; o `dropequal` descarta quando são iguais.

### lowercase / uppercase

Definem o `target_label` com o valor da origem combinada em minúsculas ou maiúsculas — útil para normalizar labels de discovery com inconsistência de caixa.

```yaml
- source_labels: [environment]
  action: lowercase
  target_label: environment
```

`environment="PRODUCTION"` vira `environment="production"`.

## Labels __meta_ do service discovery e por que eles importam

Todo mecanismo de service discovery — Kubernetes, EC2, Consul, baseado em arquivo — anexa labels `__meta_*` a cada target que encontra. Eles ficam disponíveis *apenas* durante o `relabel_configs`. São removidos antes do scrape, então, se você quiser que qualquer um desses metadados sobreviva como um label de verdade, precisa copiá-lo com `replace` ou `labelmap` primeiro.

![O pipeline de relabel para uma regra: labels de entrada, junção dos source_labels com o separator, comparação com a regex, aplicação da action e produção dos labels de saída.](/blog/prometheus-relabel-configs-explained-diagram.svg)

Um target de pod do Kubernetes chega mais ou menos assim:

```text
__address__="10.0.0.5:8080"
__meta_kubernetes_namespace="default"
__meta_kubernetes_pod_name="api-7d9f"
__meta_kubernetes_pod_label_app="api"
__meta_kubernetes_pod_annotation_prometheus_io_scrape="true"
__meta_kubernetes_pod_annotation_prometheus_io_port="9100"
```

Os labels `__meta_*` são a razão de o relabeling existir. Eles carregam o contexto da descoberta — qual namespace, quais anotações, quais labels de pod — que você transforma em decisões de scrape (`keep` na anotação de scrape) e em labels duradouros (`labelmap` dos labels do pod). Qualquer coisa que comece com um sublinhado duplo é interna e é descartada após o relabeling, sendo `__name__` (o nome da métrica) o caso notável que sobrevive até o armazenamento. Como esses labels só existem no momento do relabel, a única forma segura de confirmar que uma regra os lê corretamente é passar um conjunto realista de `__meta_*` pelas suas regras e olhar a saída.

## Receitas que você vai reutilizar

Esses são os padrões que aparecem em quase toda scrape config real.

### Manter apenas os targets de prod

```yaml
- source_labels: [__meta_kubernetes_namespace]
  action: keep
  regex: "prod|production"
```

Ancorada, então `prod` casa exatamente com o namespace `prod` e `staging-prod` *não* casaria, a menos que você escreva `.*prod.*`. A alternância `|` mantém ambas as convenções de nomenclatura.

### Descartar métricas ruidosas (metric_relabel_configs)

```yaml
metric_relabel_configs:
  - source_labels: [__name__]
    action: drop
    regex: "go_gc_.*|process_.*"
```

Roda após o scrape, descartando famílias de alta cardinalidade antes que cheguem ao armazenamento.

### Sharding com hashmod

O padrão de sharding horizontal em duas regras — fazer o hash em um label temporário e, em seguida, manter apenas o shard que este Prometheus possui:

```yaml
- source_labels: [__address__]
  action: hashmod
  modulus: 3
  target_label: __tmp_shard

- source_labels: [__tmp_shard]
  action: keep
  regex: "0"
```

Rode isso contra quatro endereços de exemplo no tester e você verá exatamente quais dois ou três caem no shard `0` e sobrevivem — os demais são descartados, marcados com a regra e a action responsáveis.

### Mapear labels de SD com labelmap e depois reescrever o endereço

```yaml
# Promote every pod label to a plain label.
- action: labelmap
  regex: "__meta_kubernetes_pod_label_(.+)"

# Rebuild __address__ from the IP and an annotated port.
- source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
  action: replace
  regex: "([^:]+)(?::\\d+)?;(\\d+)"
  replacement: "$1:$2"
  target_label: __address__
```

A segunda regra mostra o idioma da origem combinada em ação: dois `source_labels` unidos pelo separator padrão `;`, com uma regex escrita para levar esse separator em conta. `__address__="10.0.2.4:8080"` unido com a porta `9100` vira `10.0.2.4:8080;9100`, a regex captura `10.0.2.4` e `9100`, e o endereço é reconstruído como `10.0.2.4:9100`.

## Teste antes de colocar em produção

O relabeling é a única parte de uma config do Prometheus em que estar quase certo não produz erro nem aviso — apenas séries ausentes ou erradas. A ancoragem da regex, a deleção por replacement vazio, o hashmod com MD5, a ordem de junção de múltiplos `source_labels`: cada um é fácil de errar de forma sutil, e um Prometheus em produção não vai te dizer qual deles te mordeu.

Cole as receitas deste post, com um conjunto realista de labels `__meta_*`, no [Prometheus Relabel Tester](/prometheus-relabel-tester) e você verá o valor combinado, a regex que casou (ou não), o diff por label e uma sinalização clara — nomeando a regra e a action — sempre que um target for descartado. Ele roda inteiramente no seu navegador, então você pode colar scrape configs internas com segurança.

Depois que os labels estiverem no formato que você quer, as próximas perguntas são o que você consulta e como você alerta. Decomponha uma expressão com [o PromQL Explainer](/promql-explainer) ou, se você estiver movendo regras entre Loki e Prometheus, traduza-as com [o LogQL ↔ PromQL Helper](/logql-promql-helper). Acerte os labels primeiro — tudo a jusante depende deles.
