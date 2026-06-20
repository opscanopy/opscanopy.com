---
title: "LogQL vs PromQL: a mesma consulta nas duas linguagens"
description: "O LogQL toma emprestado o formato do PromQL, mas parte de linhas de log, não de métricas. Veja como as duas linguagens de consulta se alinham, onde elas se traduzem de forma limpa e onde simplesmente não se traduzem."
pubDate: 2026-06-05
tags: ["logql", "promql", "observability"]
lang: pt-br
translationOf: "logql-vs-promql"
---

![LogQL vs PromQL: a mesma consulta nas duas linguagens, lado a lado](/blog/logql-vs-promql-hero.svg)

Se você já escreveu consultas no Prometheus, o LogQL do Grafana Loki parece tranquilizadoramente familiar — `rate(...)`, `sum by (...)`, vetores de intervalo `[5m]`, os mesmos operadores de comparação. Essa familiaridade é proposital, e é genuinamente útil: boa parte da memória muscular do PromQL transfere diretamente. Mas as duas linguagens partem de matérias-primas diferentes, e no momento em que você esquece isso, sua tradução quebra de maneiras difíceis de perceber. O PromQL consulta um banco de dados de **métricas**. O LogQL consulta **linhas de log** e as transforma em métricas em tempo real. Tudo o que se mapeia de forma limpa, e tudo o que não se mapeia, decorre dessa única diferença.

## As duas metades do LogQL

Toda consulta LogQL começa com um **seletor de log** e um **pipeline** opcional — a parte que não tem equivalente no PromQL, porque o PromQL nunca toca logs brutos:

```logql
{app="api", env="prod"} |= "panic" | logfmt | level="error"
```

Isso seleciona o stream `api`/`prod`, mantém as linhas que contêm `panic`, faz o parsing delas como logfmt e então filtra para `level=error`. O resultado ainda é um conjunto de linhas de log. Para obter algo que você possa colocar em um gráfico ou usar em um alerta — um número ao longo do tempo — você o envolve em uma **consulta de métrica**:

```logql
sum by (app) (count_over_time({app="api", env="prod"} |= "panic" | logfmt | level="error" [5m]))
```

Apenas a metade externa dessa expressão se parece com o PromQL. A parte interna `{...} |= ... | logfmt | ...` é puro Loki, e é onde a maior parte do esforço de tradução de fato se concentra.

![A mesma consulta escrita em PromQL e LogQL lado a lado, com as partes equivalentes conectadas por setas](/blog/logql-vs-promql-diagram.svg)

## Onde o LogQL e o PromQL se alinham

A camada de agregação é onde as linguagens convergem, e as correspondências chegam perto de ser de um para um.

Uma taxa de contador em PromQL:

```promql
sum by (status) (rate(http_requests_total{job="api"}[5m]))
```

O formato em LogQL que responde à mesma pergunta a partir de logs:

```logql
sum by (status) (rate({job="api"} | logfmt [5m]))
```

Os operadores de agregação (`sum`, `avg`, `min`, `max`, `count`, `topk`, `quantile`) e as cláusulas de agrupamento `by` / `without` se comportam de forma idêntica. Os operadores de comparação (`>`, `<`, `==`, `!=`) e a aritmética binária funcionam da mesma maneira, e é por isso que um limiar de alerta é portado quase literalmente:

```promql
# PromQL: more than 10 errors/sec
sum(rate(http_requests_total{status=~"5.."}[5m])) > 10
```

```logql
# LogQL: more than 10 error lines/sec
sum(rate({job="api"} | logfmt | status=~"5.." [5m])) > 10
```

A família `_over_time` do Loki também espelha as funções de intervalo do Prometheus onde o conceito sobrevive: `count_over_time`, `rate`, `bytes_rate`, `avg_over_time`, `max_over_time`, `quantile_over_time`. Se você já usou `avg_over_time(metric[5m])` no PromQL, a forma desempacotada (unwrapped) do LogQL se lê da mesma maneira, uma vez que você tenha extraído um valor numérico para operar.

## Onde elas divergem — e por que um porte literal falha

As armadilhas se concentram em torno da metade do LogQL que o PromQL não tem.

**`rate` significa duas coisas diferentes.** No PromQL, `rate(counter[5m])` leva em conta as reinicializações do contador — ele foi feito para séries monotonicamente crescentes. No LogQL, `rate({...}[5m])` é a **contagem de linhas** por segundo, sem semântica de reinicialização, porque linhas de log não reiniciam. A palavra-chave coincide; o significado não. Se você recorrer a `increase()` esperando o comportamento de contador do PromQL, simplesmente não há nada a incrementar.

**Você precisa extrair um valor antes de poder fazer cálculos com ele.** As amostras do PromQL já são números. As linhas do Loki são texto, então qualquer agregação sobre um *valor* (latência, bytes, um campo numérico) precisa de um parser mais `unwrap`:

```logql
quantile_over_time(0.99, {job="api"} | logfmt | unwrap duration_seconds [5m]) by (route)
```

Não há contraparte no PromQL para `| logfmt`, `| json`, `| pattern` ou `| unwrap` — eles existem precisamente porque a entrada é não estruturada. Traduzir *a partir do* PromQL significa inventar essa etapa de extração; traduzir *para o* PromQL significa apagá-la e presumir que uma métrica já existe.

**A sintaxe do seletor se sobrepõe, mas não é intercambiável.** Ambas usam `{label="value"}` com `=`, `!=`, `=~`, `!~`. Mas um seletor do PromQL nomeia uma métrica e faz a correspondência com labels de série; um seletor de stream do Loki nomeia streams de log e *precisa* corresponder a pelo menos um label de stream indexado. Um filtro de linha como `|= "text"` não tem análogo algum no PromQL — o máximo que o PromQL chega é corresponder ao valor de um label, nunca a texto livre dentro de uma amostra.

**Campos de alta cardinalidade se comportam de forma diferente.** No PromQL, agrupar por um label de alta cardinalidade costuma ser um sinal de problema no design de métricas. No LogQL, os labels extraídos no pipeline (a partir de `logfmt`/`json`) são calculados em tempo de consulta e não são indexados, então `by (user_id)` é viável de uma forma que raramente é no Prometheus — a um custo real na vazão da consulta, mas sem a explosão de armazenamento. O modelo mental do que é "caro" não se transfere.

## Um checklist prático de tradução

Quando você move uma consulta entre as duas linguagens, percorra estes itens em ordem:

1. **Identifique a camada de métrica.** Reduza a consulta PromQL à sua agregação (`sum by (...) (rate(...))`); essa parte é portada quase como está.
2. **Reconstrua a entrada.** No LogQL, substitua o nome da métrica por um seletor `{stream}` mais os filtros de linha e o parser (`| logfmt`, `| json`) necessários para chegar aos mesmos dados.
3. **Adicione `unwrap` para cálculos sobre valores.** Qualquer média, quantil ou soma sobre um número — e não sobre uma contagem de linhas — precisa de um campo extraído e desempacotado (unwrapped).
4. **Reverifique a semântica do `rate`.** Decida se você quer dizer contagem de linhas por segundo (Loki) ou taxa de contador (Prometheus). Não são o mesmo número.
5. **Aceite que algumas coisas não vão se mapear.** `histogram_quantile` sobre histogramas nativos do Prometheus, `resets()` de contadores e séries baseadas em regras de gravação (recording rules) não têm forma limpa em LogQL — e filtros de linha de texto livre não têm forma em PromQL.

## Traduza sem o achismo

Manter os dois dialetos na cabeça ao mesmo tempo é exatamente o tipo de troca de contexto que produz bugs silenciosos — um `rate` que significa a coisa errada, um `unwrap` faltando, um seletor que compila mas não corresponde a nada. O **LogQL ↔ PromQL Helper** faz a parte mecânica por você: cole uma consulta em qualquer uma das linguagens e obtenha o equivalente mais próximo na outra, além de notas explícitas sobre o que se mapeou de forma limpa e o que não foi possível. Ele roda inteiramente no seu navegador — suas consultas nunca saem do dispositivo — para que você possa conferir uma tradução antes que ela vá parar em um dashboard ou em uma regra de alerta.

[Abra o LogQL ↔ PromQL Helper →](/logql-promql-helper)
