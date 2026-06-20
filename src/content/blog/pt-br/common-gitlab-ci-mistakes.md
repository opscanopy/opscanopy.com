---
title: "7 Erros Comuns no .gitlab-ci.yml (e Como Detectá-los)"
description: "Os erros de .gitlab-ci.yml que deixam os pipelines vermelhos: stages indefinidos, jobs sem script, needs e rules quebrados, uso indevido de anchors — cada um com uma correção que você pode copiar."
pubDate: 2026-06-12
tags: ["gitlab-ci","ci-cd","yaml"]
lang: pt-br
translationOf: "common-gitlab-ci-mistakes"
relatedTool:
  name: "GitLab CI Validator"
  href: "/gitlab-ci-validator"
---

![.gitlab-ci.yml anotado mostrando os erros mais comuns de GitLab CI — um stage indefinido, um job sem script e uma referência needs quebrada — sinalizados antes de o pipeline rodar](/blog/common-gitlab-ci-mistakes-hero.svg)

Você faz o push de uma mudança de uma linha, troca de aba e, 30 segundos depois, o ícone do pipeline fica vermelho. Não é um teste falhando — o pipeline nem chegou a iniciar. O GitLab imprimiu `This GitLab CI configuration is invalid` e uma única linha lacônica sobre um stage ou um script. Você relê o YAML três vezes, encontra o erro de digitação, faz push de novo e espera de novo. A maioria dos erros de GitLab CI que custam essa ida e volta não são exóticos. São o mesmo punhado de configurações incorretas de pipeline do GitLab, repetidas em todas as equipes: um stage que nunca foi declarado, um job que não faz nada, um `needs` que aponta para um job que você renomeou.

A boa notícia é que esses erros de YAML do GitLab CI são estruturais, o que significa que dá para detectá-los antes de fazer o commit. Abaixo estão os sete que aparecem com mais frequência, cada um com o sintoma, um exemplo mínimo quebrado e a correção que você pode colar.

## 1. Referenciar um stage indefinido

```yaml
stages:
  - build
  - test

release-job:
  stage: release      # not in stages:
  script:
    - make release
```

O GitLab rejeita isso com algo como `chosen stage release does not exist; available stages are .pre, build, test, .post`. O `stage:` de um job tem que ser um dos nomes da sua lista `stages:` de nível superior — ou um dos cinco stages implícitos que o GitLab sempre fornece: `.pre`, `build`, `test`, `deploy` e `.post`.

Existe uma versão mais silenciosa desse bug. Um job sem nenhum `stage:` assume o padrão `test`. Se você declarou uma lista `stages:` personalizada que não inclui `test`, esse job não tem onde rodar e o GitLab dá erro da mesma forma. A correção é a mesma nos dois casos — declare o stage:

```yaml
stages:
  - build
  - test
  - release

release-job:
  stage: release
  script:
    - make release
```

## 2. Um job sem script (e a confusão entre global e default)

```yaml
stages:
  - test

empty-job:
  stage: test
  # no script, run, trigger, or extends
```

Isso produz o erro de job sem script do GitLab CI — `job config should implement a script: or a trigger: keyword`. Um job visível tem que *fazer* alguma coisa. Há exatamente quatro maneiras de satisfazer isso: rodar comandos com `script:` (ou o mais recente `run:`), iniciar um pipeline downstream com `trigger:`, ou herdar uma dessas opções de outro lugar via `extends:`. Um job sem nenhuma das quatro é rejeitado.

A confusão que causa isso é o bloco global/default. As equipes definem um `before_script:` ou uma seção `default:` e presumem que um job herda um *comando* dele. Não herda. O `before_script` roda *em volta* do seu script; ele não é o script. O `default:` fornece padrões para chaves como `image:` e `cache:`, mas não dá ao job uma superfície executável. O job ainda precisa do seu próprio `script:` (ou de um `trigger`, `run` ou `extends`):

```yaml
empty-job:
  stage: test
  script:
    - make check
```

Templates ocultos, prefixados com ponto, são a exceção — mais sobre isso no erro seis. Eles têm permissão para ser fragmentos parciais, então não são obrigados a carregar um script.

## 3. needs apontando para um job em um stage posterior ou para um job que não existe

```yaml
stages:
  - build
  - test

build:
  stage: build
  script: make

test:
  stage: test
  needs:
    - compile      # no such job
  script: make test
```

O `needs:` constrói o grafo acíclico direcionado que permite que os jobs comecem cedo, em vez de esperar um stage inteiro terminar. Todo nome nele tem que resolver para um job real no mesmo pipeline. Aqui o `compile` foi renomeado para `build` em algum momento e a referência do `needs` nunca foi atualizada, então o grafo tem uma aresta solta e o pipeline não consegue ser montado.

A versão clássica desse erro é a ordenação: apontar o `needs` para um job em um stage *posterior*. O `needs` só pode referenciar jobs que rodam antes — um job não pode precisar de algo que ainda não rodou. Aponte-o para o job upstream real:

```yaml
test:
  stage: test
  needs:
    - build
  script: make test
```

A mesma regra se aplica a `dependencies:`. Toda dependência de artefato que você lista tem que nomear um job que realmente existe, ou o download falha em tempo de execução.

## 4. rules que nunca casam (ou sempre casam) — e misturar only/except com rules

```yaml
deploy:
  stage: deploy
  when: sometimes        # not a valid when value
  rules:
    if: '$CI_COMMIT_TAG' # rules must be a list
  script: ./deploy.sh
```

Dois erros de rules e extends do GitLab CI estão embutidos nesse único job. Primeiro, o `when:` só aceita um conjunto fixo de valores — `on_success`, `on_failure`, `always`, `manual`, `delayed` ou `never`. `sometimes` não é um deles, e um erro de digitação aqui é rejeitado de imediato. Segundo, o `rules:` tem que ser uma *lista* YAML de objetos de regra. Escrito como um mapeamento puro (`if:` diretamente sob `rules:`), ele está malformado; o GitLab não consegue lê-lo como uma regra.

![Um trecho curto e quebrado de .gitlab-ci.yml com balões de destaque vermelhos apontando para um stage indefinido, um job sem script e uma referência needs incorreta](/blog/common-gitlab-ci-mistakes-diagram.svg)

A outra metade dessa categoria é a lógica, e é mais difícil de perceber porque o YAML é válido. Uma regra cujo `if:` referencia uma variável que está vazia no branch que te interessa silenciosamente nunca casa, e o job nunca roda. Uma regra sem condição sempre casa. E o `rules:` não pode ser combinado com as palavras-chave legadas `only:`/`except:` no mesmo job — o GitLab dá erro se você usar as duas. `only`/`except` ainda funcionam, mas não estão mais em desenvolvimento ativo, então pipelines novos devem padronizar em `rules`. Escreva `rules` como uma lista, com cada item carregando sua condição e seu `when`:

```yaml
deploy:
  stage: deploy
  rules:
    - if: '$CI_COMMIT_TAG'
      when: manual
  script: ./deploy.sh
```

Se o seu bug é uma variável de ambiente vazia quando você esperava um valor, isso é uma classe diferente de problema — o [Env Example Checker](/env-example-checker) detecta o desvio entre `.env` e `.env.example` que, em primeiro lugar, deixa uma variável indefinida.

## 5. extends de um template que não existe, ou um extends circular

```yaml
.base:
  image: golang:1.22
  script: make

lint:
  extends: .bse        # typo — .bse, not .base
  script: make lint
```

O `extends:` é o mecanismo DRY do GitLab: um job puxa as chaves de outro job ou template oculto e sobrescreve o que precisa. A falha mais comum é exatamente a de cima — um erro de digitação ou um rename, de modo que o `extends` aponta para um template que não está no arquivo. O GitLab não consegue resolver `.bse`, e a configuração do job é inválida.

A variante mais traiçoeira é um `extends` circular — `a` faz extends de `b`, `b` faz extends de `a` — que não tem caso base para resolver e é rejeitado. Mantenha a cadeia apontando para um template real e terminal:

```yaml
.base:
  image: golang:1.22
  script: make

lint:
  extends: .base
  script: make lint
```

O `extends` também pode receber uma lista de templates, e cada nome dessa lista tem que resolver. Uma única entrada incorreta quebra o job inteiro.

## 6. YAML anchors e jobs ocultos (prefixados com ponto) usados de forma errada

```yaml
.deploy_template: &deploy
  stage: deploy
  script:
    - ./deploy.sh

deploy_prod:
  <<: *deploy
  environment: production
  # inherits stage + script from the anchor
```

O GitLab suporta tanto YAML anchors (`&name` / `*name` com a chave de merge `<<:`) quanto o seu próprio `extends:`. Os dois resolvem o mesmo problema e as pessoas os misturam, que é onde a confusão começa. O padrão acima está correto: uma chave prefixada com ponto é um job *oculto* — o GitLab não a executa como um job, ela existe apenas para ser reutilizada. Anchorá-la com `&deploy` e fazer o merge dela em `deploy_prod` com `<<: *deploy` funciona.

O que dá errado:

- **Esquecer o ponto.** Se o seu template se chama `deploy_template:` sem o ponto inicial, o GitLab o trata como um job real — e um job real sem script (apenas um alvo de anchor) dispara o erro de "sem script" do erro dois.
- **Anchors não atravessam arquivos.** Um YAML anchor é local a um único documento. Se você fizer `include:` de outro arquivo e tentar referenciar um anchor definido lá, ele não vai resolver. O `extends:` é a escolha segura entre arquivos; recorra a ele quando a reutilização atravessar includes.
- **Uma chave de merge não pode ser parcialmente sobrescrita do jeito que você imagina.** O `<<:` faz um merge raso, então redeclarar uma chave aninhada substitui toda a subárvore em vez de fazer o merge dentro dela.

Na dúvida, prefira o `extends:` para reutilização de jobs e reserve os anchors para fragmentos escalares/de lista pequenos e locais. E sempre dê a um template reutilizável o ponto inicial para que o GitLab saiba que não deve executá-lo:

```yaml
.deploy_template:
  stage: deploy
  script:
    - ./deploy.sh

deploy_prod:
  extends: .deploy_template
  environment: production
```

## 7. include que dá 404 ou aponta para o arquivo/ref errado

```yaml
include:
  - project: 'platform/ci-templates'
    ref: main
    file: '/templates/deploy.yml'   # path or ref may be wrong
```

O `include:` puxa configuração de outro arquivo — local, uma URL remota, um template ou outro projeto. Quando o path, o `ref` ou o projeto está errado, o GitLab não consegue buscá-lo e o pipeline inteiro falha ao compilar, muitas vezes com um seco `Project not found or access denied` ou um 404 no arquivo. As causas habituais são um erro de path com a barra inicial (os paths de `include` locais são relativos à raiz do repositório e precisam da barra; um `file:` de um projeto também quer o path absoluto do repositório), um `ref` que aponta para um branch ou tag que não existe mais, ou um arquivo de template renomeado.

Deixe o path absoluto a partir da raiz, fixe um `ref` que existe e confira novamente o path do projeto:

```yaml
include:
  - project: 'platform/ci-templates'
    ref: v2.3.0          # a tag that exists
    file: '/templates/deploy.yml'
  - local: '/.ci/test.yml'
```

Uma ressalva que vale conhecer: resolver o `include:` exige de fato buscar os arquivos referenciados, algo que um verificador puramente client-side não consegue fazer. Um linter local valida a *estrutura* do seu bloco `include`; para a palavra final sobre se um arquivo remoto resolve, o próprio CI Lint do GitLab (que busca includes e variáveis do projeto) é a última linha de defesa.

## Detecte todos de uma vez

Seis desses sete erros são estruturais — eles vivem em como os jobs, stages e referências se encaixam, não em se o YAML é parseável. É exatamente essa a lacuna que um linter só de sintaxe deixa passar: um `.gitlab-ci.yml` pode ser um YAML perfeitamente válido e ainda assim ser um pipeline que o GitLab se recusa a iniciar.

O [GitLab CI Validator](/gitlab-ci-validator) roda essas verificações no seu navegador. Cole um `.gitlab-ci.yml` e ele parseia o YAML e então sinaliza os problemas estruturais acima — um stage indefinido, um job sem `script`/`run`/`trigger`/`extends`, referências de `needs`/`dependencies`/`extends` que apontam para jobs que não existem, um `when:` inválido, um `rules:` que não é lista, `only`/`except` legados e formatos incorretos de `image`/`services` — cada um com a linha e uma correção concreta. Nada é enviado; a verificação inteira é client-side, então você pode rodá-la contra pipelines privados e configurações proprietárias de runner sem mandar nada para lugar nenhum.

Se os seus pipelines também rodam no GitHub, a mesma ideia de verificar antes do push se aplica aos workflows — nosso passo a passo sobre [configurações de segurança incorretas no GitHub Actions](/blog/github-actions-security-misconfigurations) cobre os equivalentes do lado do GitHub, de permissões de token amplas demais a third-party actions sem pin.

Um pipeline vermelho que nunca rodou é a falha mais barata possível de evitar. Detecte os erros estruturais antes do commit, e o único vermelho que você vai ver é o de um teste que genuinamente falhou.
