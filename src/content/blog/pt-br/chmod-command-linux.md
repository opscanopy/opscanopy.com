---
title: "Comando chmod no Linux: sintaxe, exemplos e erros comuns"
description: "O comando chmod no Linux explicado: modos octal e simbólico, chmod +x, chmod -R e suas armadilhas, setuid, setgid e sticky bit, umask e como resolver Permission denied."
pubDate: 2026-10-03
tags: ["linux", "security", "devops"]
lang: pt-br
translationOf: "chmod-command-linux"
relatedTool:
  name: "chmod Calculator"
  href: "/chmod-calculator"
---

![Uma grade de três por três com os bits de leitura, escrita e execução para dono, grupo e outros](/blog/chmod-command-linux-hero.svg)
<!-- keywords: chmod command | chmod +x, chmod recursive, chmod -R, chmod command in linux, linux chmod | source: ahrefs free (2026-10-04) -->

Um script de deploy falha com `Permission denied`. Um repositório recém-clonado não executa `./build.sh`. O SSH recusa uma chave porque as "permissions are too open". Um servidor web devolve 403 para arquivos que claramente estão no disco. Todos esses casos terminam no mesmo comando, e na maioria das vezes a correção é uma linha. O problema é que a linha errada, executada com `-R`, pode causar mais estrago que o erro original.

Este post mostra como o `chmod` lê seus argumentos, as duas formas de escrever um modo, as armadilhas do modo recursivo, os três bits especiais e um checklist para a hora em que um erro de permissão aparece.

## A sintaxe

```bash
chmod [opções] MODO ARQUIVO...
chmod [opções] --reference=ARQUIVO_REF ARQUIVO...
```

`MODO` é um número (`755`) ou uma expressão simbólica (`u+x`). Cada arquivo listado recebe a mudança. As opções que você vai usar de verdade são poucas:

- `-R`, `--recursive`: aplicar a um diretório e a tudo que está dentro dele.
- `-v`, `--verbose`: imprimir uma linha para cada arquivo processado.
- `-c`, `--changes`: imprimir uma linha só quando um modo realmente muda. Útil em scripts, porque a saída vira um diff.
- `--reference=ARQUIVO`: copiar o modo de outro arquivo em vez de digitá-lo.

Só o dono do arquivo (ou o root) pode mudar o modo dele. Fazer parte do grupo do arquivo, mesmo com permissão de escrita, não basta.

## Como ler um modo

O `ls -l` imprime dez caracteres no começo de cada linha:

```text
-rwxr-x---  1 deploy  web  4120 Oct  3 09:12 build.sh
```

O primeiro caractere é o tipo (`-` arquivo, `d` diretório, `l` link simbólico). Os nove seguintes são três grupos de três: **dono** (`u`), **grupo** (`g`) e **outros** (`o`). Dentro de cada grupo, as posições são sempre leitura, escrita e execução, nessa ordem, com `-` para um bit desligado. Então `rwxr-x---` quer dizer que o dono pode tudo, os membros de `web` podem ler e executar o script, e mais ninguém pode mexer nele.

Em um diretório, as mesmas letras significam algo um pouco diferente. `r` permite listar os nomes lá dentro, `w` permite criar, renomear e apagar entradas, e `x` permite *entrar* no diretório e chegar a qualquer coisa dentro dele pelo nome. Um diretório com `r` mas sem `x` é uma lista de nomes que você não consegue abrir.

## Modo octal: três dígitos, um por classe

Cada permissão tem um valor: leitura vale 4, escrita 2 e execução 1. Some por classe e você tem um dígito para o dono, um para o grupo e um para os outros:

| Dígito | Bits | Significado |
|---|---|---|
| 7 | `rwx` | ler, escrever, executar |
| 6 | `rw-` | ler, escrever |
| 5 | `r-x` | ler, executar |
| 4 | `r--` | só ler |
| 0 | `---` | nada |

Daí saem os modos que você vai ver o tempo todo:

- [`755`](/pt-br/chmod-calculator/755/) (`rwxr-xr-x`): scripts, binários e a maioria dos diretórios. O dono escreve; todo o resto lê e executa.
- [`644`](/chmod-calculator/644/) (`rw-r--r--`): arquivos comuns, como configurações e HTML. Legíveis por todos, graváveis pelo dono.
- [`600`](/pt-br/chmod-calculator/600/) (`rw-------`): segredos. Chaves privadas SSH, arquivos `.env`, kubeconfigs.
- [`700`](/pt-br/chmod-calculator/700/) (`rwx------`): diretórios privados, sendo `~/.ssh` o caso clássico.
- [`775`](/chmod-calculator/775/) (`rwxrwxr-x`): um diretório onde um time inteiro escreve, normalmente junto com um grupo compartilhado.

O modo octal **substitui** todas as permissões de uma vez. `chmod 644 arquivo` não adiciona leitura para os outros: ele deixa o modo exatamente em `rw-r--r--`, seja qual for o anterior. Essa é a força dele quando você quer um estado conhecido, e o perigo quando você só queria mudar um bit.

## Modo simbólico: mudar uma coisa e deixar o resto

O modo simbólico é escrito como *quem*, *operador* e *o quê*:

- quem: `u` (dono), `g` (grupo), `o` (outros), `a` (os três)
- operador: `+` (adicionar), `-` (remover), `=` (definir exatamente)
- o quê: `r`, `w`, `x`, mais `X`, `s` e `t`, explicados mais abaixo

Alguns exemplos que valem a pena saber de cor:

```bash
chmod u+x deploy.sh        # o dono agora pode executar; nada mais muda
chmod a-w release.tar.gz   # ninguém pode escrever, nem o dono
chmod go-rwx id_ed25519    # tirar tudo do grupo e dos outros
chmod g=rx,o= app/         # o grupo fica exatamente com r-x, os outros com nada
chmod u+x,g+x tools/*.sh   # várias cláusulas, separadas por vírgula, sem espaços
```

### O que o chmod +x faz de verdade

`chmod +x arquivo` não tem *quem*, e isso tem um significado preciso. O GNU chmod trata um *quem* ausente como `a`, mas **não mexe nos bits que estão ligados na sua umask**. Com a umask comum `022`, `chmod +x` adiciona execução para dono, grupo e outros, e `644` vira `755`. Com uma umask restrita `077`, o mesmo comando só adiciona `u+x`, e `644` vira `744`. Se você quer um resultado que não dependa de quem roda o script, escreva a classe: `chmod a+x` ou `chmod u+x`.

## chmod -R e os dois erros clássicos

O modo recursivo aplica um único modo a arquivos e diretórios, e eles precisam de bits diferentes. Desse descompasso saem dois erros que aparecem em quase todo time.

**Erro um: `chmod -R 755 projeto/`.** Os diretórios ficam certos, mas agora todo arquivo é executável, incluindo `README.md`, cada `.env` e cada configuração. Nada quebra na hora, por isso o erro fica lá, e um `git status` depois mostra a árvore inteira como modificada se `core.fileMode` estiver ativo.

**Erro dois: `chmod -R 644 projeto/`.** Os arquivos ficam certos, mas todo diretório perdeu o `x`. Você não consegue mais entrar com `cd`, e nada lá dentro pode ser aberto, mesmo que cada arquivo esteja em `644`. O servidor web responde 403, e a causa não está onde você procura primeiro.

A correção é tratar os dois tipos separadamente com `find`:

```bash
find projeto/ -type d -exec chmod 755 {} +
find projeto/ -type f -exec chmod 644 {} +
```

Ou usar o `X` maiúsculo, que adiciona execução só a diretórios e a arquivos que já são executáveis para alguém:

```bash
chmod -R u=rwX,go=rX projeto/
```

Essa única linha dá `755` aos diretórios, `755` aos scripts existentes e `644` aos arquivos comuns. É o mais perto que existe de um chmod recursivo seguro.

Mais dois cuidados. Por padrão, o GNU chmod não muda o modo do próprio link simbólico (o Linux ignora as permissões de links de qualquer forma): para um link passado na linha de comando, quem muda é o *destino*, e com `-R` os links encontrados durante a varredura são ignorados. E um `-R` no caminho errado não tem volta sem backup. O `--preserve-root` só recusa uma execução recursiva no próprio `/`, então imprima o caminho antes de rodar o comando.

## Os bits especiais: setuid, setgid e sticky

Um quarto dígito octal, à frente dos outros, guarda mais três bits. No `ls -l`, eles substituem o `x` de um dos três grupos:

| Bit | Valor | Aparece como | Em um arquivo | Em um diretório |
|---|---|---|---|---|
| setuid | 4 | `s` no `x` do dono | executa como o dono do arquivo | ignorado no Linux |
| setgid | 2 | `s` no `x` do grupo | executa com o grupo do arquivo | arquivos novos herdam o grupo do diretório |
| sticky | 1 | `t` no `x` dos outros | ignorado no Linux | só o dono de uma entrada (ou o dono do diretório) pode apagá-la ou renomeá-la |

Os dois que você encontra na prática:

- [`4755`](/chmod-calculator/4755/) (`rwsr-xr-x`): setuid. O `/usr/bin/passwd` costuma ser instalado assim, para que um usuário comum possa atualizar um arquivo do root. Um binário setuid é uma fronteira de privilégio; nunca coloque esse bit em um script nem em algo que você não escreveu.
- [`1777`](/chmod-calculator/1777/) (`rwxrwxrwt`): o sticky bit em um diretório gravável por todos. É o `/tmp`: qualquer um pode criar arquivos, mas ninguém pode apagar os de outra pessoa.

Setgid em um diretório compartilhado (`chmod 2775 shared/` ou `chmod g+s shared/`) é o jeito limpo de fazer cada arquivo novo pertencer ao grupo do time. Um `S` ou `T` maiúsculo no `ls -l` indica que o bit especial está ligado mas o bit de execução embaixo dele não, o que quase sempre é um engano.

Um detalhe do GNU pega muita gente: `chmod 755 diretorio` *mantém* um bit setuid ou setgid que o diretório já tenha. Para tirá-lo, é preciso pedir explicitamente, com `chmod g-s diretorio` ou um modo de cinco dígitos como `chmod 00755 diretorio`.

## umask: de onde vem o modo inicial

Arquivos novos não nascem com `777` para serem aparados depois. Os programas pedem `666` para arquivos e `777` para diretórios, e o kernel remove os bits ligados na **umask** do processo. Com `umask 022`, arquivos começam em `644` e diretórios em `755`. Com `umask 077`, começam em `600` e `700`.

Então, quando todo arquivo que um serviço grava sai ilegível para o resto do time, a correção muitas vezes está na umask do serviço (`UMask=` em uma unit do systemd, ou `umask 002` no script de inicialização), não em um `chmod` depois do fato.

## Uma nota sobre ACLs

Se o `ls -l` imprime um `+` depois do modo (`-rw-rw-r--+`), o arquivo tem uma lista de controle de acesso, e os nove bits não contam a história toda. `getfacl arquivo` mostra as entradas extras. Em um arquivo assim, os bits de grupo que o `chmod` altera são a *máscara* da ACL, que limita cada entrada de usuário e grupo nomeados, então `chmod g-w` pode tirar silenciosamente a escrita de pessoas que nem estão no grupo do arquivo.

## Resolvendo "Permission denied"

Quando um comando falha, examine o caminho inteiro, não só o arquivo:

1. **Confira cada diretório no caminho.** Você precisa de `x` em cada diretório pai para chegar a um arquivo. `namei -l /srv/app/config/app.yml` mostra o modo e o dono de cada componente e acha o bit que falta em segundos.
2. **Confira quem você é.** `id` mostra seu usuário e seus grupos. Mudanças de grupo só valem para sessões novas, então um usuário adicionado ao `docker` há cinco minutos ainda não tem esse grupo no shell antigo.
3. **Confira o dono, não só o modo.** `rw-------` é correto para uma chave e inútil se a chave pertence ao root e o processo roda como `deploy`. Isso é trabalho para o [chown](/pt-br/blog/chown-command-linux/), não para o chmod.
4. **Confira a montagem.** Um arquivo pode estar em `755` em um sistema de arquivos montado com `noexec` e mesmo assim não executar. `findmnt -T caminho` mostra as opções de montagem.
5. **Confira a camada de segurança.** Em sistemas com SELinux, um modo correto com o contexto errado continua falhando; `ls -Z` e o log de auditoria mostram isso.
6. **Leve em conta o que programas rígidos esperam.** O OpenSSH recusa uma chave privada que o grupo ou outros podem acessar, e a verificação `StrictModes` rejeita um diretório home ou um `~/.ssh` gravável pelo grupo ou por todos. Coloque `~/.ssh` em `700` e as chaves em `600`.

## Descubra um modo sem fazer contas

O [chmod Calculator](/pt-br/chmod-calculator/) converte entre octal, simbólico e a string do `ls -l` nos dois sentidos, incluindo os bits especiais, e mostra o comando exato. Ele roda no seu navegador. Para o quadro completo de usuários, grupos e propriedade, a [seção de permissões do Linux for DevOps](/learn/guides/linux-for-devops/#file-permissions-ownership) coloca o chmod em contexto.

## Referência rápida de chmod

- [ ] O octal substitui todos os bits; o simbólico muda só o que você nomeia.
- [ ] `r` = 4, `w` = 2, `x` = 1, um dígito para dono, grupo e outros.
- [ ] `755` scripts e diretórios, `644` arquivos, `600` segredos, `700` diretórios privados.
- [ ] `chmod +x` respeita a umask; `chmod a+x` e `chmod u+x` não dependem dela.
- [ ] Nunca `chmod -R 755` nem `chmod -R 644` em uma árvore mista; use `find -type d` / `-type f`, ou `chmod -R u=rwX,go=rX`.
- [ ] Um diretório precisa de `x` para alguém entrar, em cada nível do caminho.
- [ ] `4755` setuid, `2775` setgid para diretórios de grupo compartilhados, `1777` sticky para diretórios como `/tmp`.
- [ ] Um `+` depois do modo indica uma ACL; confira o `getfacl` antes de confiar nos nove bits.
- [ ] Dono errado é problema de chown; mudar o modo não resolve.
