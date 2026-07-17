---
title: "docker run vs Docker Compose: um guia prático de migração"
description: "Quando usar docker run, quando migrar para o Docker Compose e como converter entre os dois nos dois sentidos — com volumes, redes e reprodutibilidade tratados do jeito certo."
pubDate: 2026-06-10
tags: ["docker","docker-compose","containers"]
lang: pt-br
translationOf: "docker-run-vs-compose"
relatedTool:
  name: "Docker Run to Compose"
  href: "/docker-run-to-compose"
---

![Diagrama comparando docker run vs Docker Compose: um único comando docker run à esquerda e o serviço docker-compose.yml equivalente à direita, com setas de conversão bidirecionais](/blog/docker-run-vs-compose-hero.svg)

Você subiu um container Postgres três semanas atrás com um `docker run` em uma única linha. Funciona. Aí você reinicia a máquina, ou um colega precisa do mesmo setup, ou você quer o comando no controle de versão — e percebe que a única cópia daquele comando está no histórico do seu shell, em algum lugar entre um `ls` e um `kubectl get pods`. É nesse momento que a questão `docker run` vs `docker compose` deixa de ser teórica. O container está em ordem; a forma como você o iniciou é que não é reprodutível.

Este guia percorre os dois sentidos: quando o `docker run` é a escolha certa, quando migrar para um `docker-compose.yml` e como converter um serviço do Compose de volta em uma única linha de run quando você precisar de uma. Cada mapeamento de flag aqui corresponde ao que o [conversor Docker Run to Compose](/docker-run-to-compose/) realmente faz, então você pode conferir seus próprios comandos contra ele.

## O mesmo container, de dois jeitos

Aqui está um container Postgres real expresso como um comando `docker run`:

```bash
docker run -d --name db \
  -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=app \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16
```

E aqui está exatamente o mesmo container como um serviço do Compose:

```yaml
services:
  db:
    image: postgres:16
    container_name: db
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_PASSWORD=secret
      - POSTGRES_DB=app
    restart: unless-stopped
```

![Um container mostrado em dois formatos — um único comando docker run à esquerda e uma árvore de serviço docker-compose.yml à direita — com setas de conversão bidirecionais](/blog/docker-run-vs-compose-diagram.svg)

Mesma imagem, mesmas portas, mesmo volume nomeado, mesma política de restart. A diferença não é o que roda — é se a definição vive no histórico do seu shell ou em um arquivo que você pode commitar, revisar e rodar de novo com um único comando. Repare nas aspas em torno de `"5432:5432"`: caso contrário, o YAML interpretaria um `5432:5432` puro como um número sexagesimal (base 60), que é um dos pequenos bugs que a conversão manual adora introduzir.

## No que o docker run é bom

O `docker run` ganha em qualquer coisa descartável. Você quer um cliente psql de uma vez só, um Redis rápido para cutucar, uma imagem base para entrar e depurar — você não quer escrever um arquivo YAML para isso.

```bash
# cutucar um redis novinho por trinta segundos
docker run --rm -it redis:7-alpine redis-cli

# depurar dentro de uma imagem sem deixar nada para trás
docker run --rm -it -v "$PWD":/work -w /work ubuntu:24.04 bash
```

A flag `--rm` importa aqui: o container se apaga ao sair, então você não acumula containers mortos dos seus experimentos. Essa é uma preocupação genuinamente do feitio do `docker run` — e, notavelmente, `--rm` não tem nenhum equivalente no Compose, porque o Compose gerencia o ciclo de vida do container por você. Se você colar um comando com `--rm` em um conversor, a coisa honesta a fazer é descartá-la com um aviso em vez de fingir que ela mapeia para algo. É exatamente isso que o conversor faz.

O mesmo vale para `-d` / `--detach`. O modo detached é uma propriedade de *como você iniciou o processo*, não da definição do serviço, então ele também não pertence ao YAML. Voltaremos a isso na seção de armadilhas, porque ele confunde as pessoas nos dois sentidos.

## O que o Compose te dá: quando usar o Docker Compose

Recorra ao Compose no momento em que qualquer uma destas afirmações for verdadeira — e "quando usar o Docker Compose" geralmente se resume a esta lista:

- Você vai rodar este container mais de uma vez e quer que ele seja reprodutível.
- Você quer a definição no controle de versão e revisada em um PR.
- Você tem mais de um container que precisa subir junto.
- Você está cansado de decorar um comando de 200 caracteres.

Um arquivo Compose transforma uma parede de flags em um documento revisável e um único ciclo de vida:

```bash
docker compose up -d     # sobe tudo, em modo detached
docker compose down      # para e remove tudo
docker compose logs -f   # acompanha os logs de cada serviço
```

É no multisserviço que a diferença realmente aparece. Dois comandos `docker run` que precisam conversar entre si te obrigam a gerenciar uma rede na mão, iniciá-los na ordem certa e lembrar das duas linhas. O Compose torna a relação declarativa:

```yaml
services:
  api:
    image: myorg/api:1.4.0
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgres://db:5432/app
    depends_on:
      - db
  db:
    image: postgres:16
    environment:
      - POSTGRES_DB=app
```

O serviço `api` alcança o banco de dados no hostname `db` sem nenhum encanamento extra. É a rede padrão implícita fazendo seu trabalho — mais sobre isso abaixo. E porque a coisa toda é um arquivo, você pode validar o CI que faz o build e o deploy dela; se o seu pipeline roda `docker compose up` em um job, o [GitLab CI Validator](/gitlab-ci-validator/) vai pegar um `.gitlab-ci.yml` malformado antes que o runner pegue.

![Ilustração synthwave: um comando docker run de uma linha em um computador retrô migra ao longo de uma seta neon até uma pilha multicontêiner do Docker Compose em outro](/blog/in-content/docker-run-vs-compose.webp)

## Indo no sentido contrário: Compose para docker run

A migração não é uma via de mão única. Você vai esbarrar em casos em que tem um serviço do Compose, mas precisa de uma única linha de `docker run`:

- Um colega em uma máquina sem o seu arquivo Compose, que só precisa do container no ar *agora*.
- Um ticket de suporte ou runbook em que um único comando para copiar e colar é melhor do que "clone o repositório e depois rode o compose".
- Um passo de CI limitado ou um host remoto em que baixar o projeto inteiro é exagero.

Converter um `compose service to docker run` é mecânico, mas chato de fazer na mão. Pegue o serviço Redis com um healthcheck:

```yaml
services:
  cache:
    image: redis:7-alpine
    container_name: cache
    ports:
      - "6379:6379"
    mem_limit: 256m
    labels:
      - app=web
    healthcheck:
      test: "CMD-SHELL redis-cli ping"
      interval: 10s
      timeout: 3s
      retries: 5
```

O comando equivalente reconstrói cada campo — e, crucialmente, ele é emitido em modo detached por padrão, porque um serviço de longa duração quase nunca é algo que você queira ocupando seu terminal:

```bash
docker run -d --name cache -p 6379:6379 -m 256m \
  -l app=web \
  --health-cmd 'redis-cli ping' \
  --health-interval 10s --health-timeout 3s --health-retries 5 \
  redis:7-alpine
```

O bloco healthcheck se expande de volta nas flags `--health-*` separadas; `mem_limit` vira `-m`; labels viram `-l`. O conversor coloca `docker run -d` na frente para você justamente porque o serviço foi feito para rodar em segundo plano. O único ponto de atenção: chaves exclusivas do Compose, como `depends_on`, `build` e `deploy`, não têm equivalente em comando, então um conversor fiel as reporta como avisos em vez de inventar flags que não existem. Se o seu serviço tem `build:`, você roda `docker build` primeiro e alimenta a tag resultante para o `docker run`.

## Migrando um comando real, passo a passo

Vamos pegar uma linha `docker run` não trivial e percorrer a migração de ponta a ponta. Aqui está um container de aplicação em uma rede definida pelo usuário com capabilities ajustadas:

```bash
docker run -d --name api \
  --network backend \
  -p 3000:3000 \
  -e NODE_ENV=production \
  --cap-add NET_ADMIN --cap-drop ALL \
  --add-host db:10.0.0.5 \
  myorg/api:1.4.0
```

**Passo 1 — tokenize, não confie no olho.** O comando é dividido no estilo do shell: aspas e continuações com barra invertida e quebra de linha são respeitadas, e flags curtas agrupadas como `-it` são expandidas em `-i -t`. O primeiro token que não é flag (`myorg/api:1.4.0`) é a imagem; qualquer coisa depois dele seria o comando do container.

**Passo 2 — classifique cada flag em uma chave.** Portas vão para `ports`, `-e` para `environment`, `--cap-add`/`--cap-drop` para `cap_add`/`cap_drop`, `--add-host` para `extra_hosts` e `--network backend` para a lista `networks`.

**Passo 3 — leia o resultado.**

```yaml
services:
  api:
    image: myorg/api:1.4.0
    container_name: api
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    networks:
      - backend
    extra_hosts:
      - db:10.0.0.5
    cap_add:
      - NET_ADMIN
    cap_drop:
      - ALL
```

Uma coisa que o conversor deliberadamente *não* faz: inventar uma seção `networks:` de nível superior que você não pediu. A rede `backend` aparece sob o serviço, exatamente como nomeada. Se `backend` é uma rede que você criou com `docker network create`, você precisará declará-la como `external` no nível superior por conta própria — a ferramenta não vai adivinhar infraestrutura que você não escreveu. Essa contenção é o ponto-chave; um conversor que alucina estrutura é pior do que um que converte apenas o que você forneceu.

## Armadilhas na hora de migrar

As flags em si mapeiam de forma limpa. É no comportamento ao redor delas que as migrações silenciosamente dão errado.

### A rede padrão implícita

Um `docker run` simples sem `--network` conecta o container à rede `bridge` padrão, onde os containers alcançam uns aos outros apenas por IP. O Compose é diferente: ele cria uma rede *escopada por projeto* e coloca todos os serviços nela, de modo que os serviços se resolvem uns aos outros por nome de serviço (`db`, `api`) de cara. Isso normalmente é o que você quer — mas significa que um `docker run` que conversava com `172.17.0.3` precisa passar a conversar com `db` assim que vira um serviço do Compose. Migrar a flag é fácil; migrar a suposição de que "há uma única bridge plana" é a parte que pega.

### Diferenças na política de restart

`--restart` mapeia diretamente — `no`, `always`, `on-failure` e `unless-stopped` todos passam para `restart:` sem alteração:

```yaml
restart: unless-stopped
```

A sutileza: com `docker run`, a política de restart é a *única* coisa que mantém seu container vivo após um restart do daemon. Com o Compose, o mesmo valor de `restart:` se aplica, mas você também ganha `docker compose up`/`down` como um ciclo de vida explícito. Não suponha que `restart: always` significa "o Compose vai trazer isso de volta depois que eu rodar `down`" — o `down` remove o container de qualquer jeito. A política de restart governa quedas e reboots, não seus próprios comandos de teardown.

### env_file vs -e

Flags inline `-e KEY=value` viram uma lista `environment:`, e `--env-file path` vira `env_file:`. Elas não são intercambiáveis:

```yaml
services:
  api:
    image: myorg/api:1.4.0
    env_file:
      - .env.production
    environment:
      - NODE_ENV=production    # prevalece sobre a mesma chave em env_file
```

Valores inline são visíveis no arquivo e no `docker inspect`; um `env_file` mantém valores com segredos fora do YAML e fora do histórico do seu shell. Quando você migra, este é um bom momento para mover segredos de flags `-e` para um `env_file`. Já que está nisso, garanta que o `.env.example` commitado realmente corresponda às chaves que o seu serviço lê — o [Env Example Checker](/env-example-checker/) compara um `.env` real com o seu exemplo para que uma chave faltante não apareça como uma queda em um checkout novo.

### Modo detached

`-d` / `--detach` não existe em um arquivo Compose, porque o detach é uma escolha do momento de inicialização, não uma propriedade do serviço. Indo de `docker run → compose`, o `-d` é descartado (você roda `docker compose up -d` no lugar). Indo de `compose → docker run`, um conversor fiel *adiciona* o `-d` de volta, porque uma definição de serviço quase sempre descreve um processo de longa duração. Os dois comportamentos estão corretos; eles só parecem assimétricos até você ver o porquê. Se você achar que um `-d` perdido está "faltando" no YAML gerado, é a ferramenta estando certa, não perdendo sua flag.

## Converta nos dois sentidos instantaneamente

Fazer isso na mão é tranquilo para um container. Deixa de ser tranquilo quando você está traduzindo uma parede de flags `-p`, `-v` e `-e` sob pressão de tempo e uma lista mal aninhada ou uma porta sem aspas escapa.

O [conversor Docker Run to Compose](/docker-run-to-compose/) faz a parte mecânica nos dois sentidos: cole um comando `docker run` para obter o serviço `docker-compose.yml` equivalente, ou cole um serviço do Compose para reconstruir a linha de run — incluindo portas, volumes, environment, redes, capabilities, limites de recursos e healthchecks. Ele te avisa sobre as flags e chaves que genuinamente não mapeiam em vez de descartá-las silenciosamente, e roda inteiramente no seu navegador, então comandos que citam registries privados ou carregam variáveis de ambiente com segredos nunca saem da aba.

Migre o comando, leia os avisos, commite o arquivo.
