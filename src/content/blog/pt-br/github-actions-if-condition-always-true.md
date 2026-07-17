---
title: "Por que a sua condição \"if\" do GitHub Actions sempre roda (e como corrigir isso)"
description: "A sua condição if do GitHub Actions sempre roda como verdadeira? É a armadilha do texto literal: qualquer texto fora de ${{ }} é convertido em uma string truthy. Aqui estão a causa e a correção."
pubDate: 2026-06-14
tags: ["github-actions", "ci-cd"]
relatedTool:
  name: "Testador de Expressões e Gatilhos do GitHub Actions"
  href: "/github-actions-expression-tester"
lang: pt-br
translationOf: "github-actions-if-condition-always-true"
---
![Condição if do GitHub Actions que sempre roda como verdadeira porque o texto literal fora das chaves da expressão é convertido em uma string truthy](/blog/github-actions-if-condition-always-true-hero.svg)

Você adicionou um `if:` a um passo para que ele rodasse apenas na `main`, ou apenas em uma tag, ou apenas quando um passo anterior definisse uma saída. Então você fez o push — e o passo rodou mesmo assim. Toda vez. Em toda branch. A condição é apenas decoração.

Se a sua condição `if` do GitHub Actions não está funcionando — especificamente, se ela *sempre* é avaliada como verdadeira — você quase certamente caiu na armadilha mais comum de todo o produto: **colocar texto literal onde o GitHub espera uma expressão.** O runner não gera erro por isso. Ele silenciosamente converte o seu texto em uma string não vazia, decide que uma string não vazia é truthy e roda o passo. Este post mostra os padrões ruins exatos, as correções e as regras de conversão por trás de tudo isso, para que você pare de adivinhar.

## A armadilha: texto literal fora de `${{ }}` é sempre truthy

Em um `if:`, o GitHub já avalia o valor como uma expressão — você **não** envolve a coisa toda em `${{ }}`. Mas no momento em que qualquer texto literal escapa para fora das chaves da expressão, o runner para de tratar a linha como uma condição e passa a tratá-la como uma string. Uma string não vazia é truthy. O seu passo sempre roda.

```yaml
# BAD — the ${{ }} is embedded in a larger string, so the whole if: is a string
- name: Deploy
  if: ${{ github.ref == 'refs/heads/main' }} && success()
  run: ./deploy.sh
```

Isso parece razoável, mas o runner vê: avalie `${{ ... }}` como `true`, depois concatene ` && success()` como **texto literal**. O valor final é a string `"true && success()"` — não vazia, portanto truthy. O passo roda em toda branch.

A correção é escrever **uma** expressão sem chaves e sem texto perdido:

```yaml
# FIXED — a single bare expression, no ${{ }}, no trailing literal
- name: Deploy
  if: github.ref == 'refs/heads/main' && success()
  run: ./deploy.sh
```

A mesma armadilha te pega quando você coloca a condição *inteira* entre aspas:

```yaml
# BAD — the entire condition is a quoted string literal, always truthy
- if: "${{ steps.check.outputs.changed == 'true' }}"
  run: ./build.sh
```

Envolver a expressão em aspas faz com que o valor do YAML seja uma string simples. O GitHub encontra um `${{ }}` dentro dela, substitui o resultado e você volta a ter uma string não vazia. Remova as aspas e as chaves:

```yaml
# FIXED
- if: steps.check.outputs.changed == 'true'
  run: ./build.sh
```

Regra prática: **em um `if:`, não há `${{ }}` e não há aspas ao redor.** Apenas a expressão. As chaves servem para interpolar valores em `run:`, `name:` e `with:` — não para condições.

Você pode colar qualquer uma dessas no [Testador de Expressões e Gatilhos do GitHub Actions](/github-actions-expression-tester/) e vê-lo sinalizar o vazamento de texto literal antes de você fazer o push — ele avisa exatamente sobre esse padrão (está registrado como [actions/runner#1173](https://github.com/actions/runner/issues/1173), o bug com mais reações no repositório do runner).

![Uma condição if do GitHub Actions que é sempre verdadeira porque retorna uma string truthy, ao lado da expressão booleana corrigida](/blog/github-actions-if-condition-always-true-diagram.svg)

## O `success()` implícito que desaparece quando você adiciona um `if:`

Aqui está a segunda surpresa, e é a razão de "meu passo condicional roda mesmo que o passo anterior tenha falhado".

Todo passo e job tem uma **condição `success()` implícita**. Sem nenhum `if:`, um passo só roda se tudo antes dele tiver sido bem-sucedido. É por isso que os pipelines param na primeira falha sem você escrever nada.

No instante em que você adiciona um `if:` *personalizado*, esse `success()` implícito **some**. A sua condição passa a ser *toda* a verdade.

```yaml
# BAD — you wanted "on main", but you deleted the implicit success() guard
- name: Notify on main
  if: github.ref == 'refs/heads/main'
  run: ./notify.sh   # now runs on main EVEN IF the build above failed
```

Se você ainda quer que o passo exija sucesso, diga isso explicitamente:

```yaml
# FIXED — re-add the success() guard you lost
- name: Notify on main
  if: success() && github.ref == 'refs/heads/main'
  run: ./notify.sh
```

É também por isso que as pessoas ficam confusas quando um passo de "limpeza" roda apenas em caso de sucesso, quando elas queriam que ele rodasse de qualquer forma — a proteção implícita ainda está lá até que elas adicionem `always()`.

![Ilustração synthwave: um terminal CRT retrô cuja condição if é convertida em uma string truthy, fazendo cada execução atravessar o portão direto para TRUE](/blog/in-content/github-actions-if-condition-always-true.webp)

## `success()` vs `always()` vs `failure()` vs `cancelled()`

Essas quatro funções de status decidem *se o passo leva em conta os resultados anteriores ou não*. Confundi-las é a outra metade de "meu `if` não se comporta".

- **`success()`** — verdadeiro apenas se todos os passos/jobs anteriores tiverem sido bem-sucedidos. (Este é o padrão implícito.)
- **`failure()`** — verdadeiro se algum passo anterior falhou. Use para notificações de falha.
- **`always()`** — verdadeiro incondicionalmente; o passo roda mesmo que um passo anterior tenha falhado *ou que o workflow tenha sido cancelado*. Use para limpezas que precisam sempre acontecer.
- **`cancelled()`** — verdadeiro apenas quando o workflow foi cancelado.

O erro clássico é combinar `always()` com outra condição usando `&&` e esperar que ele ainda rode em caso de cancelamento — ele roda, mas as pessoas frequentemente querem o oposto:

```yaml
# BAD — "always upload logs, but only on main" — this does NOT short-circuit on failure
- name: Upload logs
  if: github.ref == 'refs/heads/main'
  run: ./upload-logs.sh   # skipped when the build fails, because implicit success() is gone... wait, no — it's gone, so it runs? See below.
```

Para ser preciso sobre esse último caso: como você forneceu um `if:` personalizado, o `success()` implícito é descartado, então o passo roda na `main` *independentemente* de o build ter passado ou não. Se você realmente quer "enviar os logs na main, com sucesso ou falha", é exatamente isso que você tem — mas torne a intenção explícita para que o próximo leitor não fique adivinhando:

```yaml
# FIXED — explicit: run on main whether the build passed or failed
- name: Upload logs
  if: always() && github.ref == 'refs/heads/main'
  run: ./upload-logs.sh
```

E para um alerta apenas em caso de falha:

```yaml
# FIXED — only when something upstream broke
- name: Alert
  if: failure()
  run: ./page-oncall.sh
```

## Surpresas de conversão: `==`, strings e a insensibilidade a maiúsculas/minúsculas

Mesmo com expressões corretamente formadas, as regras de comparação do GitHub confundem as pessoas porque são *parecidas* com JavaScript, mas não são JavaScript.

**O `==` de strings é insensível a maiúsculas/minúsculas.** Isso pega as pessoas que comparam refs de branch ou valores de entrada:

```yaml
# Surprise: both of these are TRUE
${{ 'MAIN' == 'main' }}          # true — case-insensitive
${{ 'Refs/Heads/Main' == github.ref }}  # may be true unexpectedly
```

**Conversão flexível entre tipos.** Quando os dois lados diferem em tipo, o GitHub converte em direção a um número: booleanos viram `1`/`0`, e strings são interpretadas como números (uma string vazia e `'0'` são `0`; strings não numéricas viram `NaN`, e qualquer comparação com `NaN` é falsa). Então:

```yaml
${{ true == 1 }}        # true
${{ '' == 0 }}          # true  — empty string coerces to 0
${{ '3.0' == 3 }}       # true
${{ 'abc' == 0 }}       # false — 'abc' is NaN, NaN != anything
```

**`&&` e `||` retornam operandos, não booleanos.** Assim como no JavaScript, `a && b` retorna `b` se `a` for truthy, caso contrário retorna `a`. Isso é ótimo para valores padrão (`inputs.name || 'default'`), mas significa que `if: inputs.flag && 'yes'` é avaliado como a string `'yes'` — truthy — e não como um booleano limpo.

Os valores falsy são exatamente: `false`, `0`, `''` (string vazia) e `null`. Todo o resto — incluindo as strings `'false'` e `'0'`... espere: `'0'` é falsy porque é convertido para o número `0`, mas `'false'` é uma **string não vazia que não é convertida em número**, então `${{ 'false' }}` é **truthy**. Esse único fato causa mais bugs do tipo "minha entrada booleana é sempre verdadeira" do que qualquer outro:

```yaml
# BAD — workflow_dispatch inputs are STRINGS; 'false' is truthy
on:
  workflow_dispatch:
    inputs:
      deploy: { type: boolean }
jobs:
  go:
    if: inputs.deploy   # with type: boolean this is fine...
```

```yaml
# BAD — but if the value arrives as a string 'false', this always runs
- if: github.event.inputs.deploy   # string 'false' is truthy!
  run: ./deploy.sh
```

```yaml
# FIXED — compare explicitly so the string is interpreted as data
- if: github.event.inputs.deploy == 'true'
  run: ./deploy.sh
```

## `contains` e `startsWith` não são o mesmo que `==`

Filtrar por prefixo de ref é outro ponto em que a função errada silenciosamente faz correspondências em excesso:

```yaml
# BAD — contains matches ANYWHERE, so 'feature/main-fix' passes too
- if: contains(github.ref, 'main')
  run: ./deploy.sh
```

```yaml
# FIXED — anchor to the start, or compare the full ref
- if: startsWith(github.ref, 'refs/heads/release/')
  run: ./deploy.sh
# or, for an exact branch:
- if: github.ref == 'refs/heads/main'
  run: ./deploy.sh
```

Lembre-se de que tanto `contains` quanto `startsWith` fazem a comparação de strings de forma insensível a maiúsculas/minúsculas, assim como `==`.

## Teste o seu `if:` antes de fazer o push

A razão pela qual esses bugs são tão persistentes é o ciclo de feedback: a única maneira de "testar" uma condição tradicionalmente foi fazer commit, push e ler os logs — depois adivinhar, editar e fazer push de novo. Cada suposição errada é uma ida e volta.

O [Testador de Expressões e Gatilhos do GitHub Actions](/github-actions-expression-tester/) fecha esse ciclo. Cole a sua expressão `if:`, defina um contexto fictício de `github` / `env` / `steps` / `needs` e veja o resultado avaliado com as regras exatas de operador, conversão e insensibilidade a maiúsculas/minúsculas do GitHub — além de um aviso explícito quando você deixou texto literal fora de `${{ }}` e acidentalmente construiu uma condição sempre truthy. Ele roda inteiramente no seu navegador; nada do seu workflow é enviado.

Se você já lançou um `if:` e torceu para que ele pulasse o passo, esta é a verificação que te avisa antes do runner.

[Experimente o Testador de Expressões e Gatilhos do GitHub Actions →](/github-actions-expression-tester/)