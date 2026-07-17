---
title: "Como ler uma consulta PromQL"
description: "Uma consulta PromQL é lida de dentro para fora, não da esquerda para a direita. Aprenda as quatro camadas — seletores, intervalos, funções e agregações — para decodificar qualquer expressão do Prometheus num relance."
pubDate: 2026-06-08
tags: ["promql", "prometheus", "observability"]
lang: pt-br
translationOf: "reading-promql"
---

![Como ler uma consulta PromQL: decodificando seletores, intervalos, funções e agregações do Prometheus de dentro para fora](/blog/reading-promql-hero.svg)

O PromQL parece denso na primeira vez que você o encontra. Uma linha como `histogram_quantile(0.99, sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))` parece uma única palavra comprida, e o instinto é varrê-la da esquerda para a direita como uma frase. Essa é a direção errada. O PromQL é uma linguagem funcional, então o significado flui da expressão **mais interna** para fora — do mesmo jeito que você avaliaria uma fórmula aninhada na matemática. Depois que você passa a lê-la de dentro para fora, quase toda consulta se decompõe nas mesmas quatro camadas.

## As quatro camadas

Quase toda expressão PromQL não trivial é construída a partir destas, empilhadas de dentro para fora:

1. **Um seletor** — de quais séries você parte.
2. **Um intervalo** — sobre qual janela de tempo (apenas quando você precisa de histórico, não de um instante).
3. **Uma função** — qual transformação você aplica a essas amostras.
4. **Uma agregação** — como você condensa muitas séries em menos.

Leia-as nessa ordem e a consulta se explica sozinha.

![Uma consulta PromQL decomposta em nome de métrica, comparador de rótulo, seletor de intervalo, função rate e agregação](/blog/reading-promql-diagram.svg)

## Camada 1: o seletor

O núcleo de qualquer consulta é um **seletor de métrica**: um nome de métrica mais comparadores de rótulo opcionais entre chaves.

```promql
http_requests_total{job="api", status=~"5.."}
```

Isso seleciona toda série chamada `http_requests_total` em que o rótulo `job` é igual a `api` e o rótulo `status` corresponde à regex `5..` (qualquer código 5xx). Os comparadores são a parte importante:

- `=` correspondência exata
- `!=` diferente
- `=~` correspondência por regex
- `!~` regex não corresponde

Por si só, um seletor retorna um **vetor instantâneo** — uma amostra atual por série correspondente. Essa distinção importa para tudo o que vem a seguir.

## Camada 2: o intervalo

Acrescente uma duração entre colchetes e o seletor se torna um **vetor de intervalo** — toda amostra naquela janela, por série, não apenas a mais recente.

```promql
http_requests_total{job="api"}[5m]
```

Você não pode plotar um vetor de intervalo diretamente; ele é matéria-prima. Você o entrega a uma função que sabe o que fazer com uma janela de amostras. O exemplo clássico é `rate`:

```promql
rate(http_requests_total{job="api"}[5m])
```

O `rate` examina as amostras do contador ao longo dos últimos 5 minutos e retorna a taxa média de aumento por segundo. Esse é o padrão mais comum no Prometheus, e vale a pena internalizar por que ele existe: `http_requests_total` é um **contador** que só aumenta (até que um reinício o zere), então seu valor bruto não tem sentido num dashboard. A taxa de variação é o que de fato importa para você. O `rate` também lida de forma transparente com reinícios de contador, e é por isso que você nunca deveria calcular taxas manualmente.

Uma nota breve sobre o dimensionamento da janela: o intervalo (`[5m]`) deve cobrir confortavelmente pelo menos alguns intervalos de coleta. Curto demais e você obtém resultados ruidosos e com lacunas; longo demais e você suaviza os picos que tentava capturar.

![Ilustração: uma consulta PromQL como camadas empilhadas iluminadas em neon — seletores na base, depois intervalos, funções e agregação — lida de dentro para fora](/blog/in-content/reading-promql.webp)

## Camada 3: funções

Funções transformam vetores. As que você verá o tempo todo:

- `rate(...)` — taxa média por segundo de um contador ao longo de um intervalo.
- `irate(...)` — taxa instantânea a partir das duas últimas amostras; mais sujeita a picos, boa para gráficos de variação rápida.
- `increase(...)` — aumento total ao longo do intervalo (essencialmente `rate × seconds`).
- `histogram_quantile(φ, ...)` — estima um quantil (por exemplo, p99) a partir dos buckets de um histograma.
- comparações do tipo `rate(...[5m]) > 0` — filtragem, abordada abaixo.

Então `rate(http_requests_total{job="api", status=~"5.."}[5m])` se lê, de dentro para fora, como: *pegue o contador de requisições 5xx do job api, ao longo de uma janela de 5 minutos, e me dê a taxa de erros por segundo, por série.*

## Camada 4: agregação

Um seletor com um rótulo `job` e um rótulo `status` ainda pode corresponder a dezenas de séries — uma por instância, por pod, por código de status. Operadores de agregação as condensam.

```promql
sum by (job) (rate(http_requests_total{status=~"5.."}[5m]))
```

O `sum by (job)` soma as taxas por série, mantendo **apenas** o rótulo `job` e descartando o resto. O resultado é uma linha de taxa de erros por job. As duas cláusulas para conhecer:

- `by (labels)` — mantém estes rótulos, agrega e descarta todo o resto.
- `without (labels)` — agrega e descarta estes rótulos, mantém todo o resto.

Outros agregadores seguem a mesma gramática: `avg`, `max`, `min`, `count`, `topk`, `quantile`. O modelo mental nunca muda — *combine muitas séries em menos, agrupadas pelos rótulos que eu nomear.*

## Juntando tudo

Agora a consulta intimidadora do início se decompõe de forma limpa. Leia-a de dentro para fora:

```promql
histogram_quantile(
  0.99,
  sum by (le, route) (
    rate(http_request_duration_seconds_bucket[5m])
  )
)
```

1. `http_request_duration_seconds_bucket[5m]` — os buckets do histograma de latência, ao longo de 5 minutos.
2. `rate(...)` — taxa por segundo de cada bucket, de modo que reinícios e escala são tratados.
3. `sum by (le, route) (...)` — soma as taxas entre as instâncias, mantendo `le` (o limite do bucket, exigido pelo passo seguinte) e `route`.
4. `histogram_quantile(0.99, ...)` — estima a latência do 99º percentil a partir desses buckets, por route.

Em português claro: **a latência de requisição p99 por route ao longo dos últimos 5 minutos.** Uma camada de cada vez, não é nada densa.

## Algumas armadilhas que vale conhecer

- **Agregar antes de aplicar o rate.** `rate(sum(...))` é quase sempre um bug. Aplique o `rate` primeiro, depois o `sum` — somar contadores através de reinícios resulta em algo sem sentido. A forma correta é `sum(rate(...))`.
- **Descartar `le`.** O `histogram_quantile` precisa do rótulo `le` intacto, então sua cláusula `by (...)` deve incluí-lo.
- **Comparações filtram, não apenas colorem.** `rate(...)[5m]) > 0` não retorna booleanos — ele *descarta* toda série em que a condição é falsa. É assim que você constrói expressões de alerta.
- **Incompatibilidade entre instantâneo e intervalo.** Passar um vetor instantâneo onde uma função quer um vetor de intervalo (ou vice-versa) é o erro de análise mais comum. Se uma função reclamar, verifique seus colchetes.

## Decodifique qualquer consulta em segundos

O método de dentro para fora funciona em toda expressão PromQL que você vai encontrar, mas desmontar manualmente uma consulta de produção profundamente aninhada ainda é tedioso — e é fácil errar de forma sutil sob pressão. É exatamente para isso que serve o **PromQL Explainer**: cole qualquer consulta do Prometheus e obtenha um detalhamento camada por camada, em português claro, de seus seletores, intervalos, funções, agregações e comparações. Tudo roda no lado do cliente, então suas consultas nunca saem do navegador.

Da próxima vez que um painel de dashboard ou uma regra de alerta deixar você de olhos semicerrados, não fique adivinhando.

[Explique uma consulta PromQL →](/promql-explainer/)
