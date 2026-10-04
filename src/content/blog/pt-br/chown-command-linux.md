---
title: "Comando chown no Linux: mudar dono e grupo de arquivos"
description: "O comando chown no Linux explicado: sintaxe user:group, chown -R e links simbólicos, --reference, chgrp, chmod vs chown e como corrigir permissões de volumes Docker com IDs numéricos."
pubDate: 2026-10-04
tags: ["linux", "security", "devops"]
lang: pt-br
translationOf: "chown-command-linux"
relatedTool:
  name: "chmod Calculator"
  href: "/chmod-calculator"
---

![Uma chave passando uma pasta de um usuário para outro](/blog/chown-command-linux-hero.svg)
<!-- keywords: chown command | chown recursive, chown -R, chown linux, chmod vs chown | source: ahrefs free (2026-10-04) -->

Permissões dizem *o que* o dono, o grupo e todo o resto podem fazer. Propriedade diz *quem* são o dono e o grupo. Quando um arquivo tem um modo perfeitamente razoável como `600` e um serviço ainda assim não consegue lê-lo, raramente o problema é o modo: o arquivo pertence ao usuário errado. É isso que o `chown` corrige.

Este post cobre a sintaxe de dono e grupo, as mudanças recursivas e as regras de links simbólicos que vêm junto, como copiar a propriedade de outro arquivo, o `chgrp`, a divisão de trabalho entre chown e chmod, e o caso real mais comum: um container que não consegue gravar no próprio volume.

## A sintaxe

```bash
chown [opções] DONO[:GRUPO] ARQUIVO...
chown [opções] --reference=ARQUIVO_REF ARQUIVO...
```

Dono e grupo são escritos juntos, sem espaços, e cada um pode ser um nome ou um ID numérico. As formas diferem em detalhes pequenos, mas importantes:

| Você escreve | O dono passa a ser | O grupo passa a ser |
|---|---|---|
| `chown deploy arquivo` | `deploy` | sem mudança |
| `chown deploy:web arquivo` | `deploy` | `web` |
| `chown deploy: arquivo` | `deploy` | o grupo de login de `deploy` |
| `chown :web arquivo` | sem mudança | `web` (igual a `chgrp web arquivo`) |
| `chown 1000:1000 arquivo` | UID 1000 | GID 1000 |

Os dois-pontos no final de `deploy:` passam despercebidos e são úteis: definem o grupo como o grupo primário do usuário sem você precisar procurá-lo. Scripts antigos às vezes usam um ponto (`deploy.web`). O GNU chown ainda aceita isso com um aviso, mas é ambíguo para nomes de usuário com ponto, então use os dois-pontos.

## Quem pode rodar o comando

Mudar o **dono** de um arquivo exige root (a rigor, a capability `CAP_CHOWN`). Um usuário comum não pode dar um arquivo para outra pessoa, nem um arquivo próprio; se pudesse, qualquer um driblaria cotas de disco ou deixaria arquivos em nome de outro. Por isso a maioria dos comandos `chown` na documentação começa com `sudo`.

Mudar só o **grupo** é permitido ao dono do arquivo, desde que ele seja membro do grupo de destino. O root pode definir qualquer grupo.

## Opções úteis

- `-R`, `--recursive`: mudar um diretório e tudo que está dentro dele.
- `-v`, `--verbose`: informar cada arquivo processado; `-c`, `--changes` informa só os arquivos cuja propriedade mudou de verdade.
- `-h`, `--no-dereference`: mudar o próprio link simbólico em vez do arquivo para o qual ele aponta.
- `--reference=ARQUIVO`: copiar dono e grupo de outro arquivo.
- `--from=DONO[:GRUPO]`: mudar só os arquivos que hoje têm esse dono e esse grupo.
- `--preserve-root`: recusar a execução recursiva em `/`. Vale a pena em qualquer script que monta o caminho a partir de uma variável.

## chown -R: propriedade recursiva

O caso recursivo do dia a dia é entregar o diretório de uma aplicação ao usuário que a executa:

```bash
sudo chown -R www-data:www-data /var/www/site
```

Diferente do `chmod -R`, o `chown` recursivo não tem a armadilha de arquivo contra diretório, porque arquivos e diretórios querem o mesmo dono. O perigo é o caminho. `sudo chown -R deploy: /` com um espaço sobrando, ou um `$APP_DIR` que expande para nada, reescreve a propriedade do sistema inteiro e é muito difícil de desfazer. Coloque variáveis entre aspas, teste-as e use `--preserve-root`.

O `--from` deixa as mudanças recursivas mais seguras quando você só quer mexer em alguns arquivos. Depois que o UID de um usuário muda, por exemplo, este comando reatribui só os arquivos que ainda têm o UID antigo:

```bash
sudo chown -R --from=1001 1005 /srv/data
```

## Links simbólicos: o que o chown muda

Um link simbólico tem dono próprio, separado do destino, e o comportamento padrão do chown depende de ele estar em modo recursivo:

- **Não recursivo:** `chown deploy link` muda o *destino*, não o link. Adicione `-h` para mudar o próprio link.
- **Recursivo:** o `-R` não segue links simbólicos que encontra dentro da árvore (`-P` é o padrão). Adicione `-H` para seguir links passados na linha de comando, ou `-L` para seguir todo link para um diretório.

Cuidado com o `-L`, e com `--dereference` combinado com `-R`. Se alguém que pode gravar dentro da árvore coloca um link para `/etc` enquanto um `chown -R -L` rodado pelo root a percorre, a mudança de propriedade cai em `/etc`. Em árvores onde outras pessoas podem gravar, fique com o padrão.

## --reference: copiar a propriedade de outro arquivo

Quando um arquivo deve combinar com os vizinhos, copie a propriedade em vez de digitá-la:

```bash
sudo chown --reference=/etc/nginx/nginx.conf /etc/nginx/conf.d/api.conf
```

Se o arquivo de referência for um link simbólico, o chown usa o dono e o grupo do arquivo para o qual ele aponta. O `chmod --reference` faz o mesmo com o modo, e juntos os dois deixam um arquivo novo idêntico a um existente.

## chgrp

`chgrp web report.csv` muda só o grupo. É exatamente `chown :web report.csv`, aceita as mesmas opções `-R`, `-h` e `--reference` e é prático em scripts porque deixa a intenção clara. Combinado com o bit setgid em um diretório (`chmod g+s shared/`), dá uma pasta de time em que todo arquivo novo cai no grupo do time.

## O chown limpa setuid e setgid

No Linux, mudar o dono ou o grupo de um arquivo executável limpa os bits setuid e setgid dele, e desde o kernel 2.2.13 isso vale até quando é o root quem faz. É uma regra de segurança: um binário setuid não deve começar, sem ninguém perceber, a rodar como outro usuário. Se você roda chown em um arquivo que realmente precisa desses bits, ligue-os de novo depois e confira com `ls -l`:

```bash
sudo chown root:root /usr/local/bin/helper
sudo chmod 4755 /usr/local/bin/helper
```

A documentação do GNU coreutils observa que o comportamento exato depende da chamada de sistema, então em outros sistemas confira antes de contar com ele.

## chmod vs chown

Os dois comandos são confundidos com frequência porque corrigem o mesmo sintoma, `Permission denied`, por lados diferentes:

| | chmod | chown |
|---|---|---|
| Muda | os bits de modo (`rwx` para dono, grupo e outros) | o dono e o grupo |
| Pergunta que responde | o que cada classe pode fazer? | quem está em cada classe? |
| Quem pode usar | o dono do arquivo ou o root | o root para o dono; o dono para grupos dos quais é membro |
| Caso típico | um script não é executável | um usuário de serviço não consegue ler os próprios arquivos |

Uma regra útil: se o modo parece certo para a tarefa (`600` para uma chave, `644` para uma configuração) mas o processo continua falhando, olhe o dono. Abrir o modo para `777` "corrige" o erro deixando todo mundo entrar, o que é um problema de segurança, não uma correção. O [guia do comando chmod](/pt-br/blog/chmod-command-linux/) cobre o outro lado, e modos como [`600`](/pt-br/chmod-calculator/600/), [`644`](/chmod-calculator/644/) e [`755`](/pt-br/chmod-calculator/755/) têm cada um uma página explicando quem pode fazer o quê.

## Corrigindo permissões de volumes Docker

O problema de chown mais comum no trabalho de DevOps é um container que não consegue gravar em um bind mount:

```text
mkdir: cannot create directory '/app/data/cache': Permission denied
```

A causa é que o kernel guarda a propriedade como números, não como nomes. Uma imagem que roda como usuário sem privilégios (as imagens oficiais do Node trazem um usuário `node` com UID 1000; a imagem do Postgres baseada em Debian roda como UID 999) grava com esse UID, enquanto o diretório do host que você montou provavelmente pertence ao seu usuário ou ao root. Os nomes dentro e fora do container não significam nada um para o outro; só os números precisam bater.

Descubra o UID com que o container roda e entregue o diretório do host a esse UID:

```bash
docker run --rm my-image id          # uid=1000(node) gid=1000(node)
sudo chown -R 1000:1000 ./data
```

Use a forma numérica aqui. `chown -R node:node ./data` no host ou falha ou pega o usuário que por acaso se chama `node` naquela máquina. A alternativa é deixar os arquivos como estão e rodar o container como você: `docker run --user "$(id -u):$(id -g)" …`, ou `user: "1000:1000"` no Compose. Em volumes nomeados, a imagem normalmente define a propriedade quando o volume é criado pela primeira vez, então isso afeta principalmente bind mounts.

## Próximos passos

A [seção de permissões do Linux for DevOps](/learn/guides/linux-for-devops/#file-permissions-ownership) trata de usuários, grupos e propriedade em contexto. Para decidir qual modo um arquivo deve ter depois que o dono estiver certo, o [chmod Calculator](/pt-br/chmod-calculator/) converte entre as formas octal, simbólica e `ls -l` no seu navegador.

## Referência rápida de chown

- [ ] `user:group` define os dois, `user:` usa o grupo de login do usuário, `:group` muda só o grupo.
- [ ] Mudar o dono exige root; mudar o grupo exige ser dono e membro desse grupo.
- [ ] Use IDs numéricos com containers: a propriedade é guardada como UID e GID, nunca como nomes.
- [ ] `-h` muda o próprio link simbólico; sem `-R`, o chown segue o link por padrão.
- [ ] `-R` não segue links dentro da árvore; evite `-L` em árvores onde outros podem gravar.
- [ ] `--reference=ARQUIVO` copia a propriedade; `--from=` limita uma mudança ao dono atual.
- [ ] O chown limpa setuid e setgid em executáveis; ligue-os de novo depois.
- [ ] Modo certo e acesso negado mesmo assim: confira o dono antes de partir para `chmod 777`.
