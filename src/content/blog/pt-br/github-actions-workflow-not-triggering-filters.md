---
title: "Por que seu workflow do GitHub Actions não foi acionado: filtros branches, tags e paths explicados"
description: "Por que seu workflow do GitHub Actions não foi acionado: nome de branch incompatível, a semântica de AND dos filtros branches + paths, a exigência do glob **, paths-ignore no pull_request, e as correções."
pubDate: 2026-06-14
tags: ["github-actions", "ci-cd", "debugging"]
relatedTool:
  name: "Testador de Expressões e Gatilhos do GitHub Actions"
  href: "/github-actions-expression-tester"
lang: pt-br
translationOf: "github-actions-workflow-not-triggering-filters"
---

![Workflow do GitHub Actions não foi acionado: regras dos filtros branches, tags e paths explicadas](/blog/github-actions-workflow-not-triggering-filters-hero.svg)

Você enviou um commit, abriu a aba Actions e não há nada lá. Nenhum X vermelho, nenhum ponto amarelo — o workflow simplesmente não rodou. Não há erro para ler, nenhum log para inspecionar, porque um workflow que não é acionado não produz nenhuma execução. A decisão aconteceu antes de qualquer runner ser atribuído, dentro da lógica de filtragem de eventos do GitHub, e essa lógica é mais surpreendente do que a documentação faz parecer.

Quase todo relato de "por que meu workflow do GitHub Actions não foi acionado" se resume a uma de poucas causas: o arquivo do workflow não está na branch para a qual você enviou, seu filtro `branches` não corresponde à ref, ou — a grande questão — você combinou `branches` e `paths` sem perceber que eles são unidos por AND. Aqui está cada causa com a regra decisiva e a correção.

## 1. O arquivo do workflow não está na branch alvo

O GitHub lê os gatilhos de `on:` a partir da versão do arquivo do workflow **que existe na branch que recebe o evento** — não a partir da sua branch padrão. Se você adicionou `.github/workflows/ci.yml` na `main` mas envia para uma branch `feature/x` que se ramificou *antes* de esse arquivo existir, não há workflow para acionar ali.

```yaml
# on main, but feature/x branched before this file existed
on:
  push:
    branches: ['**']
```

Esse é o falso alarme mais comum. A correção é mecânica: faça merge ou rebase da `main` na branch para que o arquivo do workflow esteja presente, e então envie novamente. A mesma regra explica por que edições nos gatilhos de `on:` só "entram em vigor" depois que a mudança chega à branch em que você está testando.

Por que isso importa: não há mensagem de erro para "nenhum arquivo de workflow aqui". É a primeira coisa a descartar antes de suspeitar dos seus filtros.

![Um fluxo de decisão mostrando como os filtros branches, tags e paths determinam se um workflow do GitHub Actions é acionado em um push](/blog/github-actions-workflow-not-triggering-filters-diagram.svg)

## 2. O filtro de branch não corresponde à ref

`branches` e `tags` são padrões glob, e as regras de glob são mais estritas do que os globs de shell. Um `*` simples corresponde a **um único segmento de caminho** — ele para no `/`. Para corresponder atravessando barras, você precisa de `**`.

```yaml
# BAD — '*' does not cross '/', so 'release/1.2' never matches
on:
  push:
    branches:
      - 'release/*'   # matches release/1.2 ... actually this IS fine
      - 'feature*'    # matches 'feature' and 'featureX' but NOT 'feature/login'
```

A armadilha é `feature*` versus `feature/**`. `feature*` corresponde ao segmento literal `featureX`, mas uma branch chamada `feature/login` contém uma barra, e `*` não a atravessa. Você quer `feature/**`.

```yaml
# FIXED — ** crosses slashes
on:
  push:
    branches:
      - 'release/**'
      - 'feature/**'
      - main
```

Os caracteres de glob que o GitHub reconhece: `*` (qualquer caractere exceto `/`), `**` (qualquer caractere, incluindo `/`), `?` (um caractere), `+` (um ou mais do caractere anterior), intervalos de caracteres `[]`, `!` no início de um padrão para negar, e `\` para escapar um caractere especial (de modo que `\*` corresponde a um asterisco literal). A ordem importa para a negação — um `!pattern` posterior exclui refs que um padrão anterior incluiu.

Por que isso importa: o fato de `*` não atravessar `/` é responsável por uma enorme parcela dos relatos de "filtro de branches do github actions não está funcionando". Na dúvida, recorra a `**`.

## 3. A semântica de AND de `branches` + `paths`

Esta é a que pega engenheiros experientes. Quando um evento `push` ou `pull_request` tem **tanto** um filtro de branch **quanto** um filtro de caminho, o evento precisa satisfazer **ambos** para acionar. Eles são unidos por AND, não por OR.

```yaml
# BAD — intent: "run on a push to main, OR when src changes"
# reality: "run only on a push to main AND when src/** changed"
on:
  push:
    branches: [main]
    paths: ['src/**']
```

Um push para a `main` que altera apenas o `README.md` **não** vai rodar este workflow — a branch correspondeu, mas nenhum caminho correspondeu, e ambos precisam valer. As pessoas leem este bloco como um OR e ficam perplexas quando commits que só mexem na documentação pulam o CI.

Se você realmente quer "pushes na main sempre, mais qualquer branch quando `src` muda", isso são dois conjuntos de filtros separados, que o `on:` não consegue expressar em um único bloco `push` — você divide isso entre gatilhos ou usa condições `if:` em nível de job sobre `github.ref`.

```yaml
# FIXED — be explicit that you want both conditions, or drop one
on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - '.github/workflows/**'   # so CI changes still trigger
```

Por que isso importa: a semântica de AND está documentada em uma única frase e contradiz a intuição da maioria das pessoas. Se o seu workflow "aleatoriamente" pula alguns pushes para a branch certa, um filtro de caminho quase sempre é a causa.

## 4. `paths` sem um `branches` acompanhante ainda precisa de uma ref real

Um corolário sutil: quando você filtra `on.push.paths` e quer que ele se aplique a todas as branches, você não precisa de um bloco `branches` nenhum — omiti-lo significa "todas as branches". Mas no momento em que você adiciona `branches`, a regra nº 3 entra em ação. Às vezes as pessoas adicionam `branches: ['**']` pensando que ele é necessário para que `paths` funcione; não é, e adicioná-lo não muda nada porque `**` corresponde a toda branch de qualquer forma. O que você precisa internalizar é que um filtro ausente significa "corresponder a tudo", e um filtro presente restringe.

```yaml
# These behave identically: paths applies to every branch
on:
  push:
    paths: ['src/**']
# vs
on:
  push:
    branches: ['**']
    paths: ['src/**']
```

## 5. `paths-ignore` e o diff que é grande demais

`paths-ignore` pula a execução **apenas se todo arquivo alterado corresponder a um padrão de ignorar**. Se um único arquivo ficar fora da lista de ignorados, o workflow roda. Então uma única mudança avulsa derrota o filtro inteiro — o que normalmente é o que você quer, mas surpreende quem espera que "ignorar estes arquivos" signifique "ignorar commits que tocam estes arquivos".

```yaml
# Skips ONLY when every changed file is docs; one code file => runs
on:
  push:
    paths-ignore:
      - 'docs/**'
      - '**.md'
```

Mais duas pegadinhas moram aqui. Primeira, os filtros de caminho são avaliados contra o **diff**, e o GitHub só inspeciona até 300 arquivos alterados (1.000 commits) — além desse limite, a filtragem de caminho desiste e o workflow roda (ou é avaliado como se o filtro tivesse passado). Um force-push gigante ou um merge enorme pode acionar um workflow que o seu `paths-ignore` "deveria" ter pulado. Segunda, você não pode misturar `paths` e `paths-ignore` no mesmo gatilho; escolha um.

Por que isso importa: `paths-ignore` é um portão de tudo-ou-nada sobre o diff, e o teto de 300 arquivos significa que não é uma garantia rígida em mudanças grandes.

## 6. `pull_request`, forks e `pull_request_target`

Os filtros de branch em `pull_request` correspondem à branch **base** (para onde o PR vai ser mesclado), não à branch head em que o colaborador está trabalhando. Se você escreve `branches: [main]` esperando que corresponda à `feature/x` do colaborador, não vai — ele corresponde a PRs *direcionados* à `main`.

```yaml
# Runs on PRs whose BASE (merge target) is main or a release branch
on:
  pull_request:
    branches:
      - main
      - 'release/**'
```

E `pull_request` vindo de um fork é restrito: o PR de um colaborador de primeira viagem pode exigir aprovação manual antes que qualquer workflow rode, o que parece idêntico a "não foi acionado". Se você mudou para `pull_request_target` para contornar as restrições de fork, observe que ele lê o workflow e os gatilhos a partir da versão do arquivo da branch **base** — e carrega um risco de segurança real, abordado no nosso post sobre [erros de segurança no GitHub Actions](/blog/github-actions-security-misconfigurations).

## Uma folha de cola de filtros para copiar e colar

```yaml
on:
  push:
    branches:                 # ref globs; missing = all branches
      - main
      - 'release/**'          # ** crosses '/'; '*' does not
      - 'feature/**'
    tags:
      - 'v[0-9]+.[0-9]+.[0-9]+'   # numeric semver tags only
    paths:                    # ANDed with branches — BOTH must match
      - 'src/**'
      - '.github/workflows/**'
  pull_request:
    branches: [main]          # matches the PR's BASE branch
    paths-ignore:             # skip only if EVERY changed file matches
      - '**.md'
```

Referência rápida para os caracteres de glob: `*` = qualquer caractere exceto `/`, `**` = qualquer caractere, incluindo `/`, `?` = um caractere, `+` = um ou mais do caractere anterior, `[a-z]` = intervalo, `!` no início = negar, `\` = escapar.

## Pare de adivinhar — reproduza seu evento

O motivo de esses bugs serem enlouquecedores é que o ciclo de feedback é "envie e reze". Não há dry-run, não há `--explain`, apenas uma aba Actions vazia. Então você faz um commit com uma mudança de uma linha, envia, atualiza, espera e repete — queimando minutos por palpite contra uma semântica da qual você não tem certeza.

O **Testador de Expressões e Gatilhos do GitHub Actions** fecha esse ciclo. Cole o seu bloco `on:`, descreva o evento — um `push` para `feature/login`, a tag `v2.1.0`, ou um `pull_request` direcionado à `main` com uma lista de arquivos alterados — e ele avalia cada filtro `branches`, `tags`, `paths` e `paths-ignore` com o mesmo motor de glob e a mesma semântica de AND que o GitHub usa. Você obtém uma tabela **RUNS / SKIPPED** por job com o motivo decisivo exato: "a branch correspondeu, mas nenhum filtro de caminho correspondeu", ou "`*` não atravessa `/`". É 100% no seu navegador — o YAML do seu workflow nunca sai da página.

Veja exatamente quais jobs rodam antes de enviar, não depois.

[Abra o Testador de Expressões e Gatilhos do GitHub Actions →](/github-actions-expression-tester)
