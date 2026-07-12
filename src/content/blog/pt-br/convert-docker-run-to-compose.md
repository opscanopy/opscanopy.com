---
title: "Como Converter um Comando docker run em docker-compose.yml"
description: "Converta qualquer comando docker run em um serviço docker-compose.yml, flag por flag — portas, volumes, ambiente, restart e muito mais. Um guia prático para copiar e colar."
pubDate: 2026-06-09
tags: ["docker","docker-compose","containers"]
lang: pt-br
translationOf: "convert-docker-run-to-compose"
relatedTool:
  name: "Docker Run to Compose"
  href: "/docker-run-to-compose"
---

![Converta um comando docker run em um serviço docker-compose.yml, flag por flag](/blog/convert-docker-run-to-compose-hero.svg)

Você subiu um container com uma linha rápida de `docker run` durante uma sessão de depuração. Funcionou. Agora alguém quer aquilo no repositório, revisável em um PR, iniciável com um único comando — e você tem um one-liner de 200 caracteres com `-p`, três montagens `-v`, meia dúzia de flags `-e` e uma política `--restart` que agora precisa converter para `docker-compose.yml`. É nesse momento que a maioria das pessoas recorre à documentação e começa a traduzir tudo na mão, e é exatamente aí que flags são esquecidas, portas ficam com as aspas erradas e listas são aninhadas incorretamente.

Este guia mostra como converter um comando `docker run` em `docker-compose.yml` flag por flag, incluindo as pegadinhas que aparecem quando você faz isso na mão. Cada mapeamento aqui corresponde ao que o [conversor Docker Run to Compose](/docker-run-to-compose) realmente gera, então você pode ler as regras e depois colar seu comando na ferramenta para pular a parte mecânica.

## Por que migrar do docker run para o Compose

Um comando `docker run` é uma forma perfeitamente válida de subir um único container de modo interativo. Ele deixa de ser adequado no momento em que qualquer uma destas situações é verdadeira:

- A invocação exata precisa ficar no controle de versão para que um colega de equipe consiga reproduzi-la.
- Você quer que ela seja revisada — um diff de YAML é muito mais fácil de ler em um PR do que uma parede de flags em uma única linha.
- O container tem dependências, ou você logo vai adicionar um segundo serviço.
- Você quer rodar `docker compose up -d` em vez de lembrar o comando completo toda vez.

O Compose não muda o que o container faz. Ele apenas dá à mesma configuração uma forma declarativa e fácil de comparar em diffs. A tradução é quase inteiramente mecânica — e é justamente por isso que vale a pena acertar as regras em vez de fazer no olho.

## A anatomia de um comando docker run

Aqui vai um caso real. Postgres, porta publicada, volume nomeado, duas variáveis de ambiente e uma política de restart:

```bash
docker run -d --name db \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=app \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16
```

Lendo da esquerda para a direita, um comando `docker run` tem três partes:

1. **`docker run`** — o prefixo do comando.
2. **As flags** — tudo que começa com `-` ou `--`, em qualquer ordem. Cada flag ou recebe um valor (`-p 5432:5432`) ou é um booleano (`-d`).
3. **A imagem e, em seguida, o comando** — o *primeiro* token que não é uma flag é a imagem (`postgres:16`). Tudo que vier depois dela é o comando a ser executado dentro do container, repassado literalmente.

Essa ordem importa. Assim que o parser chega na imagem, a varredura de flags para — `docker run ... postgres:16 -p 80:80` trata `-p 80:80` como argumentos para o container, e não como uma porta publicada. Mantenha suas flags *antes* da imagem.

Flags curtas agrupadas são a outra coisa que você precisa saber. `-it` são duas flags (`-i` e `-t`), e `-itp 8080:80` são três: `-i`, `-t` e `-p 8080:80`. Uma flag que recebe valor, como `-p`, consome o resto do agrupamento (ou o próximo token) como seu argumento.

## Mapeando cada flag do docker run para o docker-compose.yml

Esse é o cerne da conversão de um comando `docker run` para o compose: cada flag mapeia para uma chave dentro do serviço. Aqui está a tabela completa de mapeamento das flags que você realmente vai encontrar.

![Um mapeamento mostrando flags do docker run à esquerda conectadas por setas às suas chaves do docker-compose.yml à direita](/blog/convert-docker-run-to-compose-diagram.svg)

| flag do `docker run` | chave do `docker-compose.yml` | Observações |
|---|---|---|
| `-p` / `--publish` | `ports` | String entre aspas, ex.: `"8080:80"` |
| `-v` / `--volume`, `--mount` | `volumes` | Forma curta `source:target[:ro]` |
| `-e` / `--env` | `environment` | Lista `KEY=value` |
| `--env-file` | `env_file` | Um ou mais arquivos |
| `--name` | `container_name` | Também vira a chave do serviço |
| `--restart` | `restart` | `no` / `always` / `on-failure` / `unless-stopped` |
| `--network` / `--net` | `networks` | `host` / `none` → `network_mode` |
| `-w` / `--workdir` | `working_dir` | |
| `-u` / `--user` | `user` | |
| `--cap-add` / `--cap-drop` | `cap_add` / `cap_drop` | |
| `--add-host` | `extra_hosts` | |
| `--hostname` | `hostname` | |
| `--entrypoint` | `entrypoint` | |
| `--privileged` | `privileged` | |
| `-m` / `--memory` | `mem_limit` | |
| `--cpus` | `cpus` | |
| `-l` / `--label` | `labels` | |
| `--health-*` | `healthcheck` | `cmd` / `interval` / `timeout` / `retries` |
| `-i` / `-t` | `stdin_open` / `tty` | |
| `--rm`, `-d` / `--detach` | — | Sem equivalente no Compose (descartada) |

Algumas dessas merecem um olhar mais atento.

### -p → ports

Cada `-p` vira uma entrada sob `ports:`, escrita como uma string `"HOST:CONTAINER"` **entre aspas**:

```yaml
ports:
  - "5432:5432"
```

As aspas não são opcionais. Um `5432:5432` sem aspas é interpretado por parsers de YAML 1.1 como um número sexagesimal (base 60), o que corrompe silenciosamente o mapeamento. Esse é um dos bugs mais comuns na conversão manual, então sempre coloque as portas entre aspas.

### -v / --volume e --mount → volumes

`-v` mantém sua forma curta `source:target[:ro]` literalmente:

```yaml
volumes:
  - pgdata:/var/lib/postgresql/data
  - /data:/usr/share/nginx/html:ro
```

Uma forma longa `--mount type=bind,source=/data,target=/app,readonly` é reduzida à mesma forma curta `source:target:ro`. Volumes nomeados e bind mounts são preservados exatamente como escritos — a conversão não inventa uma declaração `volumes:` de nível superior que você não pediu (mais sobre isso nas pegadinhas).

### -e / --env-file → environment / env_file

Cada `-e KEY=value` vira uma linha `KEY=value` sob `environment:`, e cada `--env-file` mapeia para `env_file:`:

```yaml
environment:
  - POSTGRES_PASSWORD=secret
  - POSTGRES_DB=app
env_file:
  - .env
```

Ao mover o ambiente da linha de comando para arquivos, vale a pena confirmar que seu `.env` e seu `.env.example` não ficaram desalinhados — o [Env Example Checker](/env-example-checker) aponta as chaves que existem em um mas não no outro, para que uma variável faltando não apareça como um erro em tempo de execução.

### --restart, --name, -w, -u

Esses são mapeamentos escalares diretos, de um para um:

```yaml
restart: unless-stopped
container_name: db
working_dir: /work
user: 1000:1000
```

`--name` cumpre um papel duplo: define `container_name` *e* vira a chave do serviço (`services: { db: ... }`). Quando não há `--name`, o serviço é chaveado como `app`.

### --network → networks (ou network_mode)

Uma rede nomeada vira uma entrada na lista `networks:`. Mas `host` e `none` são especiais — são *modos* de rede, não redes, então mapeiam para `network_mode`:

```yaml
# docker run --network backend
networks:
  - backend

# docker run --network host
network_mode: host
```

### --cap-add, --cap-drop, --add-host

Capabilities e entradas de host são agrupadas, cada uma em sua lista:

```yaml
cap_add:
  - NET_ADMIN
cap_drop:
  - ALL
extra_hosts:
  - db:10.0.0.5
```

### --health-* → healthcheck

As flags `--health-*` se combinam em um único bloco `healthcheck:`. O comando vira um teste `CMD-SHELL`:

```bash
docker run --health-cmd "redis-cli ping" \
  --health-interval 10s --health-timeout 3s --health-retries 5 \
  redis:7-alpine
```

```yaml
healthcheck:
  test: "CMD-SHELL redis-cli ping"
  interval: 10s
  timeout: 3s
  retries: 5
```

### -m / --cpus → mem_limit / cpus

As flags de recursos mapeiam para `mem_limit` e `cpus`:

```yaml
mem_limit: 256m
cpus: "1.5"
```

Esses são os limites no estilo v2 que o Compose respeita diretamente. Quando você eventualmente migrar este container para o Kubernetes, esses números viram requests e limits do pod — a [Kubernetes Resource Calculator](/kubernetes-resource-calculator) transforma um valor de memória e CPU em valores seguros de `requests`/`limits`, para que você não fique chutando na conversão.

### As flags sem equivalente no Compose

`--rm` e `-d` / `--detach` descrevem como *você* invocou o container, não como ele está configurado, então não têm lugar em uma definição de serviço. Elas são descartadas — mas você deve saber por quê:

- `--rm` (remover ao sair) é irrelevante porque o Compose gerencia o ciclo de vida.
- `-d` / `--detach` é substituída pela forma como você inicia a stack: `docker compose up -d`.

![Ilustração: um comando docker run em um terminal retrô, com suas flags fluindo de tela em tela até se recomporem como um serviço docker-compose.yml](/blog/in-content/convert-docker-run-to-compose.webp)

## Um exemplo completo na prática

Pegue este comando mais longo — um serviço de API em uma rede de usuário, com ambiente, capabilities e uma entrada de host extra:

```bash
docker run -d --name api \
  --network backend \
  -p 3000:3000 \
  -e NODE_ENV=production \
  --cap-add NET_ADMIN \
  --cap-drop ALL \
  --add-host db:10.0.0.5 \
  myorg/api:1.4.0
```

Aplicando a tabela de mapeamento flag por flag — e descartando `-d` com uma observação — chegamos a este serviço:

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

Repare no que foi transposto e no que não foi. `--name api` definiu tanto a chave do serviço quanto o `container_name`. A porta está entre aspas. `-d` sumiu — você vai iniciar isso com `docker compose up -d`. Todo o resto é uma tradução direta de flag para chave, na ordem fixa e legível que as convenções do Compose esperam.

## Pegadinhas ao converter docker run -p -v -e para compose

O mapeamento é mecânico, mas um punhado de detalhes derruba as pessoas.

**Volumes nomeados vs bind mounts.** Ambos usam a mesma sintaxe `-v`, então acabam na mesma lista `volumes:` — mas significam coisas diferentes. `-v /data:/app` é um *bind mount* de um caminho do host; `-v pgdata:/app` é um *volume nomeado* gerenciado pelo Docker. Um caminho relativo ou absoluto cru, com uma `/` inicial (ou `.`), é um bind mount; um nome cru é um volume. A conversão mantém a string exatamente como escrita e **não** sintetiza o bloco `volumes:` de nível superior que os volumes nomeados tecnicamente precisam. O Compose vai criar implicitamente um volume meio que anônimo, mas, se você quiser que ele seja explícito e compartilhável, adicione-o você mesmo:

```yaml
services:
  db:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

**Precedência de ambiente.** Se você usar tanto `environment` quanto `env_file`, os valores definidos inline em `environment` ganham da mesma chave em um arquivo de ambiente. E nenhum dos dois sobrescreve uma variável que já esteja definida no shell quando você roda `docker compose up`, a menos que você a referencie. Mantenha segredos fora do `environment:` (que é versionado) e dentro do `env_file:` (que fica no gitignore) — e verifique as chaves do arquivo com o [Env Example Checker](/env-example-checker) antes de publicar.

**Modos de rede host e none.** Como vimos acima, `--network host` e `--network none` não são redes — são modos. Colocar `host` em uma lista `networks:` é inválido; tem que ser `network_mode: host`. Esse é o tipo de coisa fácil de passar batido na mão, porque a grafia da flag é idêntica à de um `--network backend` normal.

**Portas: publish vs expose.** `-p` *publica* uma porta no host (`ports:`), que é quase sempre o que você quer dizer. Não existe um equivalente de `-p` sem o lado do host para o `expose:` do Compose (apenas container-para-container, sem binding no host) — o `expose` vem da diretiva `EXPOSE` da imagem ou de uma chave `expose:` explícita, não de um `docker run -p`. Não recorra ao `expose:` ao converter uma flag `-p`; o que você quer é `ports:`.

## Converta na hora

As regras acima são tudo o que você precisa para fazer isso na mão. Mas a conversão manual é exatamente onde uma flag é esquecida, uma porta perde suas aspas ou `--network host` acaba na chave errada — e você só descobre quando o container se comporta de forma diferente do comando original.

O [conversor Docker Run to Compose](/docker-run-to-compose) faz a tradução mecânica para você. Ele tokeniza o comando do jeito que um shell faria — respeitando aspas, flags curtas agrupadas como `-it` e continuações com barra invertida e quebra de linha — mapeia cada flag para a chave correspondente do Compose e gera um YAML determinístico. Flags sem equivalente (`--rm`, `-d`) voltam como avisos em vez de sumirem silenciosamente, então nada desaparece sem você saber. Ele também funciona no sentido inverso: cole um serviço do Compose e receba de volta uma linha `docker run` equivalente.

Tudo acontece no seu navegador, então você pode colar comandos que citam registries privados ou carregam valores `-e` com segredos sem que nada saia da aba. Cole seu comando, leia os avisos e faça o commit do resultado.
