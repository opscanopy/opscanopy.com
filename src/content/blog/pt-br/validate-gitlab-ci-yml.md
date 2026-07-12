---
title: "Como validar o .gitlab-ci.yml antes de dar push"
description: "Pare de subir pipelines quebrados. Valide seu .gitlab-ci.yml em busca de erros de YAML e estruturais direto no navegador — antes do commit, não depois do pipeline vermelho."
pubDate: 2026-06-11
tags: ["gitlab-ci","ci-cd","yaml"]
lang: pt-br
translationOf: "validate-gitlab-ci-yml"
relatedTool:
  name: "GitLab CI Validator"
  href: "/gitlab-ci-validator"
---

![Validador de GitLab CI verificando um .gitlab-ci.yml em busca de erros de YAML e de pipeline antes do push](/blog/validate-gitlab-ci-yml-hero.svg)

Você muda uma linha no `.gitlab-ci.yml`, dá push e parte para outra coisa. Dois minutos depois o pipeline fica vermelho — não porque o build quebrou, mas porque um job aponta para um `stage` que você renomeou na semana passada. Você corrige o erro de digitação, dá push de novo, espera de novo. Esse é o loop, e a única saída é validar o `.gitlab-ci.yml` *antes* de o commit cair, não depois que o runner te avisa.

O mais frustrante é que o GitLab já sabe que sua config está quebrada no instante em que faz o parse dela. Ele só não te avisa até você dar push e queimar um minuto de CI. A solução é rodar essa mesma verificação localmente, no navegador, antes mesmo de qualquer `git push`.

## O loop do "dá push e reza"

O problema tem este formato. Você edita um job, dá push e deixa o GitLab ser o seu linter:

```bash
git add .gitlab-ci.yml
git commit -m "split deploy into staging + prod"
git push
# wait for the runner to pick up the pipeline...
# pipeline failed: "chosen stage prod does not exist"
git commit -am "fix: declare prod stage"
git push
# wait again...
```

Cada ida e volta é um commit que você não queria, um slot de runner de que você não precisava e uma troca de contexto que custa mais caro do que o erro de digitação. Os erros que causam isso quase nunca precisam de um runner para serem detectados. Eles ficam visíveis no momento em que o YAML passa pelo parse e o grafo de jobs é resolvido — que é exatamente o que um validador faz localmente.

## Dois tipos de erro: sintaxe YAML vs. estrutural

Quando o GitLab rejeita um pipeline, a falha cai em uma de duas categorias, e elas têm correções completamente diferentes.

A primeira é um **erro de sintaxe YAML**: o arquivo não é nem YAML válido, então nada mais adiante consegue lê-lo. A segunda é um **erro estrutural**: o YAML passa no parse normalmente, mas o *pipeline* que ele descreve é inválido — um job sem script, um stage que nunca foi declarado, um `needs` apontando para um job que não existe.

```yaml
# YAML error — the parser can't even build a document
build:
  script:
    - make
   - make test      # inconsistent indentation: parser bails here

# Structural error — valid YAML, invalid pipeline
deploy:
  stage: prod        # "prod" is not in stages: → GitLab refuses to run it
  script: ./deploy.sh
```

YAML válido é só metade do trabalho. O [GitLab CI Validator](/gitlab-ci-validator) verifica os dois em uma única passada: ele faz o parse do YAML primeiro, e só se isso der certo é que ele roda as checagens estruturais contra os seus jobs. Se o parse falhar, você recebe um único erro com referência de linha e nada mais — não faz sentido reportar "undefined stage" em um documento que nem passou no parse.

![Ilustração: um .gitlab-ci.yml brilhante examinado por ferramentas de CI lint, yamllint e checagens do editor, com vereditos de OK e de erro fluindo para um draft merge request](/blog/in-content/validate-gitlab-ci-yml.webp)

## Erros de YAML que pegam: indentação, tabs, chaves duplicadas

YAML é sensível a espaços em branco, e a config de CI é exatamente o tipo de estrutura aninhada em que isso machuca. A clássica mensagem de erro do GitLab — `did not find expected key` — quase sempre é uma destas.

```yaml
test:
  stage: test
	script:              # a literal TAB instead of spaces → parse error
    - npm test

variables:
  DEPLOY_ENV: staging
  DEPLOY_ENV: prod       # duplicate key — the first value is silently lost

deploy:
  script: &deploy_steps  # anchor defined...
    - ./deploy.sh
rollback:
  script: *deploy_step   # ...but referenced with a typo → "unknown alias"
```

Um validador de navegador faz o parse com um leitor de YAML de verdade, então ele reporta a linha exata onde a estrutura quebrou. Quando você cola a config e o resultado é `Could not parse YAML: ... (line 4, column 2)`, é o parser te dizendo exatamente onde olhar — reindente, troque o tab por espaços ou corrija o nome do anchor, e valide de novo.

## Erros estruturais que o GitLab pega tarde: stages não declarados, jobs sem script, needs/extends ruins

Esses são os que fazem você esperar por um runner só para descobrir que o pipeline nunca chegou a começar. São o verdadeiro motivo para validar o GitLab CI antes do push. O validador modela as regras a partir da referência de keywords do `.gitlab-ci.yml` do GitLab e sinaliza cada uma com o job problemático, a linha e a correção.

![Um fluxo de pipeline de validação: cole o .gitlab-ci.yml, faça o parse do YAML, rode as checagens estruturais e então mostre válido ou uma lista de erros](/blog/validate-gitlab-ci-yml-diagram.svg)

**Um job sem nenhuma superfície executável.** Todo job visível precisa *fazer* alguma coisa: rodar comandos com `script:` (ou o mais novo `run:`), iniciar um pipeline downstream com `trigger:`, ou herdar um desses via `extends:`. Um job sem nenhum deles é rejeitado com o conhecido "job config should implement a script: or a trigger: keyword."

```yaml
# ERROR — empty-job defines no script, run, trigger, or extends
empty-job:
  stage: test
  # nothing here → GitLab won't run it
```

Repare que um `script: []` ou `script: ""` *vazio* também conta como ausente — o validador trata apenas uma string ou lista de comandos não vazia como uma superfície executável de verdade, do mesmo jeito que o GitLab faz.

**Um stage que não foi declarado.** Se o `stage:` de um job não estiver na sua lista `stages:` (ou em um dos cinco padrões: `.pre`, `build`, `test`, `deploy`, `.post`), o GitLab não sabe quando rodá-lo.

```yaml
stages:
  - build
  - test

release-job:
  stage: release      # ERROR — "release" is not in stages:
  script: make release
```

Há uma variação sutil que o validador também pega: um job que *omite* o `stage:` assume por padrão o stage `test` implícito. Se você declarou uma lista `stages:` personalizada que não inclui `test`, esse job agora aponta para um stage que você nunca declarou — e o GitLab falha com "chosen stage test does not exist."

**`needs` / `dependencies` / `extends` apontando para um job que não existe.** Todo nome em `needs:`, `dependencies:` ou `extends:` precisa resolver para um job real ou para um `.template` oculto no mesmo arquivo.

```yaml
test:
  stage: test
  needs:
    - compile          # ERROR — no job named "compile"
  extends: .base       # ERROR — no template named ".base"
  script: make test
```

O validador monta o conjunto de todos os ids de job e de todo `.template`, e então confere cada referência contra ele. Renomeie um template e esqueça de atualizar um `extends:`, e ele te diz qual job quebrou antes do runner.

**Um `when:` inválido ou um `rules:` que não é lista.** A keyword `when:` só aceita `on_success`, `on_failure`, `always`, `manual`, `delayed` ou `never`. E `rules:` tem que ser uma *lista* YAML de objetos de regra — um mapping solto é um erro comum que muda silenciosamente quando um job roda.

```yaml
deploy:
  stage: deploy
  when: sometimes      # ERROR — not an allowed when value
  rules:
    if: '$CI_COMMIT_TAG'   # ERROR — rules must be a list, not a mapping
  script: ./deploy.sh
```

Ele também traz à tona conselhos de severidade mais baixa: o `only`/`except` legado recebe uma nota informativa recomendando `rules:` (os dois não podem ser combinados em um mesmo job), uma chave de nível superior que está a uma edição de distância de uma keyword reservada — digamos `varables:` ou `beforescript:` — recebe um aviso de erro de digitação, e formatos malformados de `image:`/`services:` são sinalizados como erros.

## Validando antes de dar push: GitLab CI Lint vs. um validador no navegador

O GitLab traz seu próprio verificador — o CI Lint, dentro do editor de pipeline. Ele é autoritativo: resolve arquivos de `include:` e variáveis CI/CD a nível de projeto, que uma ferramenta client-side não consegue enxergar. Mas tem um custo: exige um projeto e um login. Você não consegue dar lint num trecho de um code review, numa config que está rascunhando offline, ou num pipeline proprietário que você prefere não colar num formulário hospedado.

Então o que um validador no navegador realmente verifica? Com base no engine, o fluxo é determinístico e totalmente local:

1. **Faz o parse do YAML.** Qualquer falha retorna um único erro com referência de linha e para por aí — nenhuma descoberta estrutural num documento que não passa no parse.
2. **Separa o nível superior** em keywords globais (`stages`, `default`, `variables`, `image`, `services`…), jobs visíveis e `.templates` ocultos.
3. **Resolve os stages** — a sua lista `stages:` declarada, ou os cinco padrões — no conjunto contra o qual o `stage:` de cada job é checado.
4. **Verifica cada job** em busca de uma superfície executável, um stage conhecido, alvos reais de `needs`/`extends`/`dependencies`, um `when:` válido, um `rules:` em formato de lista, e formatos sãos de `image`/`services`.
5. **Classifica por severidade** — erros primeiro, depois warnings, depois infos — cada um com a linha e uma correção concreta. Ele nunca lança exceção; uma falha de parse é reportada, não causa crash.

Sendo honesto: um resultado limpo no navegador é uma forte confiança pré-push sobre *estrutura e sintaxe*. Ele pega toda aquela classe de erros que fazem um pipeline falhar antes de qualquer job rodar. Para certeza absoluta numa config que usa `include:` ou variáveis de projeto, confirme com o próprio CI Lint do GitLab depois de dar push para um projeto — mas use a passada no navegador para fazer esse push valer a pena.

Se você também roda GitHub Actions, a mesma ideia se aplica lá: o [GitHub Actions Validator](/github-actions-validator) encontra problemas de YAML e de segurança nos seus arquivos de workflow, e o [GitHub Actions Expression Tester](/github-actions-expression-tester) avalia aquelas expressões `${{ … }}` antes de você dar push.

## Encaixe isso no seu fluxo de trabalho

O validador é uma ferramenta de colar e checar, mas o hábito que você quer é "nunca dar push de config de CI que você não validou". Um hook de pre-commit deixa isso automático para a metade do YAML — pegue os erros de parse antes de o commit sequer se formar:

```bash
#!/usr/bin/env bash
# .git/hooks/pre-commit — block a commit if .gitlab-ci.yml isn't valid YAML
set -euo pipefail

if git diff --cached --name-only | grep -q '^\.gitlab-ci\.yml$'; then
  # Fail fast on a syntax error before the commit lands.
  python -c "import sys, yaml; yaml.safe_load(open('.gitlab-ci.yml'))" \
    || { echo "✗ .gitlab-ci.yml is not valid YAML — commit blocked"; exit 1; }
  echo "✓ .gitlab-ci.yml parses — paste it into the validator for structural checks"
fi
```

Um parse de YAML local pega a classe de indentação-e-tabs na hora. Para a classe estrutural — stages não declarados, `needs` quebrado, jobs sem script — cole o arquivo no validador do navegador antes de dar push. Os dois juntos cobrem as duas categorias de erro da segunda seção, e nenhum deles precisa de um runner.

```bash
# the loop you actually want
$ git add .gitlab-ci.yml          # pre-commit hook checks YAML
# paste .gitlab-ci.yml → validator → 0 errors
$ git commit -m "split deploy into staging + prod"
$ git push                        # green on the first try
```

## Valide agora

Da próxima vez que você mexer no `.gitlab-ci.yml`, não deixe o runner ser a primeira coisa a lê-lo. Cole o arquivo no [GitLab CI Validator](/gitlab-ci-validator) e você vai receber os erros de YAML e os erros estruturais — stages não declarados, jobs sem script, `needs`/`extends` quebrados, `when:` inválido — em uma única passada, com a linha e a correção de cada um. Ele roda inteiramente no seu navegador: sem projeto, sem login e sem nada enviado para fora, então é seguro para pipelines internos.

Se você já deu push de uma mudança de CI e torceu para que funcionasse, este é o passo que estava faltando.
