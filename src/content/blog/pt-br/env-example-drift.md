---
title: "Pare de publicar um .env.example desatualizado"
description: "Seu .env.example é documentação que apodrece silenciosamente. Aqui está o porquê de o drift de env quebrar o onboarding e os deploys, como detectar chaves ausentes e não utilizadas, e como manter o arquivo de exemplo honesto."
pubDate: 2026-06-02
tags: ["configuration", "developer-experience", "twelve-factor"]
lang: pt-br
translationOf: "env-example-drift"
---

![Pare de publicar um .env.example desatualizado: detectando drift de configuração de env entre o seu .env e o seu .env.example](/blog/env-example-drift-hero.svg)

Um `.env.example` é o único arquivo no seu repositório que ninguém executa, ninguém testa e todo mundo confia. É o contrato que um novo colega de equipe lê no primeiro dia para responder à única pergunta que importa: quais variáveis de ambiente eu preciso definir antes que isso suba? Quando esse arquivo está certo, o onboarding é um copiar-e-preencher de cinco minutos. Quando está errado, você ganha o tipo mais desmoralizante de bug — o app quebra na inicialização com `undefined is not a function`, ou pior, roda alegremente com um recurso silenciosamente desativado porque uma flag teve como padrão "desligado".

O problema é que `.env.example` é documentação, e documentação sofre drift. Código que lê `process.env.STRIPE_WEBHOOK_SECRET` é publicado em uma feature branch. O arquivo de exemplo não recebe a nova chave porque adicioná-la não faz parte de "fazer o recurso funcionar" — faz parte de "ser gentil com a próxima pessoa", e esse passo é invisível até alguém esbarrar nele. Multiplique isso ao longo de um ano de merges e o arquivo de exemplo vira um museu de variáveis que você costumava precisar, sem metade das que você realmente precisa.

## Como o drift realmente acontece

O drift nunca é um único evento dramático. É o acúmulo de pequenas omissões razoáveis:

- Uma nova integração adiciona `SENTRY_DSN` e `SENTRY_ENVIRONMENT`. O autor do PR as tem no seu `.env` local, então o app funciona para ele — e o arquivo de exemplo nunca fica sabendo delas.
- Um recurso é removido. O código que referencia `LEGACY_BILLING_URL` é deletado, mas a chave permanece no `.env.example` para sempre, então os recém-chegados preenchem obedientemente um valor que não faz nada.
- Uma variável é renomeada de `DB_URL` para `DATABASE_URL` no código, mas o exemplo ainda anuncia o nome antigo. Agora o arquivo está ativamente enganando.
- Uma chave é lida apenas em um worker raramente mexido, então ela nunca aparece em testes casuais — até que esse worker seja implantado em um ambiente novo sem nenhum valor definido.

Nenhum desses casos dispara seu linter, seu verificador de tipos ou seus testes. O arquivo de exemplo não faz parte do grafo de build, então nada avisa que ele está fora de sincronia. O único ciclo de feedback é um humano se queimando.

![Um arquivo .env e um .env.example comparados lado a lado, destacando uma chave ausente no exemplo e uma chave obsoleta deixada para trás](/blog/env-example-drift-diagram.svg)

## Os dois modos de falha

Existem exatamente dois jeitos de o arquivo de exemplo estar errado, e eles falham em direções opostas:

**Chaves ausentes** são variáveis que seu código lê mas que o exemplo não menciona. Essas são as perigosas. Uma chave ausente significa que um checkout novo inicializa em um estado indefinido — uma quebra se você tiver sorte, uma má configuração silenciosa se não tiver.

**Chaves não utilizadas** são variáveis que o exemplo anuncia mas que nenhum código lê mais. Essas são apenas um desperdício: deixam o arquivo mais longo, fazem as pessoas provisionarem secrets de que não precisam e corroem a confiança no arquivo como fonte da verdade. Se três chaves acabam sendo mortas, por que você acreditaria nas outras vinte?

Um arquivo de exemplo saudável não tem nenhuma das duas. Toda variável que o código lê aparece no exemplo, e toda variável no exemplo é de fato lida em algum lugar.

## Como é "ler uma variável" em diferentes linguagens

Detectar o drift significa analisar duas coisas: o conjunto de variáveis que seu código referencia e o conjunto de chaves que seu exemplo declara. O lado da referência é a metade complicada porque cada ecossistema escreve de um jeito diferente:

```javascript
// Node.js — the classic
const key = process.env.STRIPE_SECRET_KEY;
const { DATABASE_URL, REDIS_URL } = process.env;

// Vite / browser builds
const api = import.meta.env.VITE_API_BASE;
```

```python
# Python — os.environ and os.getenv
import os
secret = os.environ["DJANGO_SECRET_KEY"]
debug = os.getenv("DEBUG", "false")
```

```go
// Go — os.Getenv and os.LookupEnv
addr := os.Getenv("LISTEN_ADDR")
token, ok := os.LookupEnv("GITHUB_TOKEN")
```

```bash
# Shell — direct expansion
: "${WEBHOOK_URL:?must be set}"
echo "$DEPLOY_ENV"
```

O lado do exemplo é comparativamente uniforme — uma lista de linhas `KEY=value`, geralmente com comentários e seções em branco:

```bash
# .env.example
# --- Core ---
DATABASE_URL=postgres://localhost:5432/app
REDIS_URL=redis://localhost:6379

# --- Payments ---
STRIPE_SECRET_KEY=
# STRIPE_WEBHOOK_SECRET is set in code but missing here ↓
```

Faça a subtração de conjuntos entre os dois e o drift aparece na hora. Chaves referenciadas no código mas ausentes do exemplo estão **ausentes**. Chaves presentes no exemplo mas referenciadas em lugar nenhum estão **não utilizadas**. Tudo na interseção está em ordem.

## Por que um diff rápido vence um `grep`

Você certamente consegue improvisar isso com `grep -rhoE 'process\.env\.[A-Z_]+'` canalizado por `sort -u` e comparado com `cut -d= -f1 .env.example`. As pessoas fazem isso, e funciona pela metade. O problema são os casos extremos que um regex improvisado sempre deixa passar:

- Acesso por desestruturação (`const { FOO } = process.env`) que o padrão ingênuo não captura.
- Chaves comentadas no exemplo que não deveriam contar como "declaradas".
- Valores entre aspas, prefixos `export` e comentários inline que confundem um `cut` burro.
- Múltiplos frameworks em um único repositório (`process.env` e `import.meta.env` e `os.getenv`), cada um exigindo um padrão diferente.

Quando você já lidou com todos esses, seu pipeline de shell "rápido" virou um script frágil que ninguém quer manter. Um verificador feito para o propósito lida com os padrões de acesso e as peculiaridades do arquivo de exemplo de forma consistente, e faz isso sem que você cole secrets em um serviço remoto.

## Mantendo o arquivo honesto

A detecção é o primeiro passo; impedir o drift de voltar é o segundo. Alguns hábitos ajudam:

- **Faça do exemplo a fonte da verdade.** Algumas equipes carregam o `.env.example` na inicialização em desenvolvimento e emitem um aviso para qualquer chave no código que não esteja declarada nele. O arquivo deixa de ser opcional.
- **Verifique no review.** Trate um novo `process.env.X` sem uma linha correspondente no exemplo da mesma forma que você trataria uma nova função pública sem um comentário de documentação.
- **Limpe ao deletar.** Quando você remover um recurso, procure também por suas chaves no exemplo. Chaves mortas são fáceis de deixar para trás.
- **Rode o diff antes de abrir o PR.** Pegar o drift leva segundos e poupa uma tarde da próxima pessoa.

## Pegue isso antes de fazer o commit

A forma mais rápida de saber que seu arquivo de exemplo está honesto é fazer um diff dele contra o seu código real. O **Env Example Checker** faz exatamente isso no navegador: cole seu código-fonte e seu `.env.example`, e ele informa as variáveis que seu código usa mas que faltam no exemplo, além das chaves que o exemplo declara e que nada lê. Ele roda inteiramente do lado do cliente — seu código e seus secrets nunca saem da página — então você pode rodá-lo em um repositório privado sem pensar duas vezes.

Antes do seu próximo pull request, entregue ao próximo desenvolvedor um `.env.example` em que ele realmente possa confiar.

[Verifique o drift do seu .env.example →](/env-example-checker/)
