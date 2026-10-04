---
title: "Base64 não é criptografia: como proteger de verdade uma chave de API"
description: "Base64 é criptografia? Não. O que o Base64 faz, por onde vazam segredos codificados, o que protege uma chave de API e quando o Base64 é a ferramenta certa."
pubDate: 2026-09-08
tags: ["security", "developer-experience"]
lang: pt-br
translationOf: "base64-is-not-encryption"
relatedTool:
  name: "Base64 Encoder / Decoder"
  href: "/base64-encoder-decoder"
---

![Uma chave de API codificada em Base64 e decodificada de volta na hora, mostrando que a codificação não protege nada](/blog/base64-is-not-encryption-hero.svg)
<!-- keywords: is base64 encryption | base64 vs encryption, base64 decode, how to secure an api key, kubernetes secret base64 | source: marketing brief, ahrefs unchecked (2026-10-04) -->

Chega um pull request com um arquivo de configuração que contém esta linha:

```yaml
PAYMENTS_API_KEY: b3BzX2xpdmVfN2YzYTljMmU=
```

A nota do autor diz que a chave está "codificada, então pode commitar". Não pode. Qualquer pessoa que consiga ler essa linha recupera a chave com um único comando, e o mesmo vale para todo scanner que varre repositórios públicos atrás exatamente desse padrão.

> **TL;DR**
>
> - Base64 é uma codificação. Não tem chave, então qualquer um consegue revertê-la, na hora.
> - O `Secret.data` do Kubernetes é Base64 porque YAML precisa de texto, não porque isso esconda alguma coisa.
> - O que protege uma chave é onde ela fica e quem pode lê-la: um gerenciador de segredos ou KMS, injeção em tempo de execução, escopo restrito, rotação e TLS em trânsito.
> - Base64 é a ferramenta certa para levar bytes por canais que só aceitam texto. É só para isso que ele serve.

## O que o Base64 realmente faz

O Base64, definido na RFC 4648, transforma bytes arbitrários em uma string formada por 64 caracteres imprimíveis: `A–Z`, `a–z`, `0–9`, `+` e `/`, com `=` como preenchimento. Ele lê a entrada de três em três bytes (24 bits) e escreve quatro caracteres de seis bits cada. Os três bytes ASCII de `Man` viram `TWFu`.

Essa proporção de 3 para 4 é o motivo de os dados codificados ficarem cerca de 33% maiores que o original. Sempre que o tamanho da entrada não é múltiplo de três, a saída ganha um ou dois `=` para que seu tamanho continue múltiplo de quatro.

A mesma RFC define uma variante segura para URLs, a base64url, que troca `+` por `-` e `/` por `_` para que o resultado possa ir em uma URL ou em um nome de arquivo. Os JWTs a usam, normalmente sem o preenchimento.

Não existe segredo nenhum nesse processo. Decodificar é ler a mesma tabela de trás para frente:

```bash
printf '%s' 'b3BzX2xpdmVfN2YzYTljMmU=' | base64 -d
# ops_live_7f3a9c2e
```

Em versões mais antigas do macOS a flag é `-D`; `--decode` funciona tanto no GNU quanto no BSD.

> **Dica:** use `printf '%s'` ou `echo -n` ao codificar. Um `echo` simples acrescenta uma quebra de linha, e essa quebra também é codificada. Um valor Base64 que termina em `Cg==` muitas vezes significa que alguém codificou `"value\n"` sem querer, e a quebra de linha sobrando estraga a credencial sem fazer barulho.

## Base64 é criptografia? Por que parece, e por que não é

Criptografia transforma dados com uma chave, de modo que a saída é inútil para quem não tem essa chave. Base64 não tem chave. O algoritmo é público, idêntico em todo lugar e reversível por qualquer pessoa.

Ele *parece* criptografia porque a saída é ilegível para um humano à primeira vista. `YWRtaW46aHVudGVyMg==` não diz obviamente `admin:hunter2`, então dá a sensação de estar protegido. Não está. O disfarce resiste a uma olhada rápida e a nada mais, e scanners automáticos de segredos decodificam Base64 por rotina.

### O caso do Secret do Kubernetes

A fonte mais comum dessa confusão é o Kubernetes. Um manifesto `Secret` guarda seus valores codificados em Base64 sob `data`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: payments
type: Opaque
data:
  api-key: b3BzX2xpdmVfN2YzYTljMmU=
```

A codificação existe para que valores binários, como um keystore ou um certificado, caibam em um manifesto de texto. O campo `stringData` aceita os mesmos valores em texto puro e o API server faz a codificação por você, o que mostra o quanto a codificação protege pouco.

A documentação do Kubernetes é explícita sobre isso: por padrão, os Secrets são armazenados sem criptografia no armazenamento de dados do API server, o etcd. A criptografia em repouso é algo que você ativa à parte, com uma `EncryptionConfiguration` no API server ou um provedor KMS. O Base64 não faz parte disso.

## Por onde vazam segredos codificados em Base64

Como a codificação não esconde nada, um segredo codificado vaza por qualquer canal pelo qual um segredo em texto puro vazaria. Os de sempre:

- **Histórico do Git.** Um manifesto de Secret ou um arquivo `.env` commitado continua no histórico depois que você o apaga da ponta da branch. Remover a linha em um commit posterior não remove a chave. Faça a rotação e depois considere reescrever o histórico.
- **Logs.** Um log de depuração que despeja uma requisição, um ambiente ou uma configuração renderizada escreve o valor codificado junto com todo o resto. Depois os pipelines de log o copiam para lugares com acesso de leitura mais amplo.
- **`kubectl get secret -o yaml`.** Quem tem `get` em Secrets de um namespace consegue ler todos os valores dele, e essa permissão costuma ser mais ampla do que se pretendia. Uma saída colada em um ticket ou chat leva as chaves junto.
- **Bundles de cliente.** Uma chave que vai no JavaScript do front-end ou em um app mobile é pública, codificada ou não. Qualquer um pode abrir o DevTools ou desempacotar o app e decodificá-la.
- **Imagens de contêiner.** Uma chave embutida com `ENV` ou copiada durante um build fica nas camadas da imagem, e `docker history` ou a extração de uma camada vai mostrá-la.

> **Atenção:** se uma chave real foi commitada, registrada em log ou publicada em um bundle, a correção é a rotação. Apagar o arquivo ou tornar o repositório privado impede exposições futuras. Não diz quem já a leu.

## Como proteger de verdade uma chave de API

Nenhum passo isolado resolve. A proteção vem de controlar onde a chave fica, quem pode lê-la e quanto estrago ela faz se escapar.

### Guarde-a em um gerenciador de segredos ou KMS

Use um armazenamento feito para isso: AWS Secrets Manager ou SSM Parameter Store, Google Secret Manager, Azure Key Vault ou HashiCorp Vault. Eles criptografam os valores em repouso com chaves que você não manipula diretamente, registram cada leitura e colocam o acesso atrás de políticas de IAM que você consegue auditar. No Kubernetes, ative a criptografia em repouso para Secrets e aperte o RBAC para que poucas identidades possam fazer `get` neles. Ferramentas como External Secrets Operator ou Sealed Secrets mantêm o texto puro fora dos seus manifestos.

### Injete-a em tempo de execução

Faça a aplicação ler a chave na inicialização, a partir do armazenamento de segredos ou de uma variável de ambiente ou arquivo montado que a plataforma preenche. Assim a chave nunca aparece no código-fonte, nas imagens ou nos logs de build. Mantenha no repositório um `.env.example` com nomes de exemplo e deixe o `.env` real de fora. O [.env example checker](/env-example-checker/) aponta divergências entre os dois.

### Restrinja o escopo

Emita chaves com o menor conjunto de permissões de que a tarefa precisa: somente leitura onde ler basta, uma chave por serviço e ambiente, restrições por IP ou referrer onde o provedor permitir. Uma chave de staging somente leitura vazada é um incômodo. Uma chave de administrador de produção vazada é um incidente.

### Faça a rotação

Chaves com expiração e rotação agendada limitam por quanto tempo um vazamento continua útil. Torne a rotação rotina: o dia em que você precisar dela vai ser o dia em que uma chave escapou.

### Criptografe em trânsito com TLS

Envie chaves só por HTTPS. A autenticação HTTP Basic (RFC 7617) manda `username:password` em Base64 no header `Authorization`, e sobre HTTP puro qualquer um no caminho consegue decodificar. O TLS protege o canal. O Base64 só formata o header.

## Quando o Base64 é a ferramenta certa

Nada disso torna o Base64 ruim. Ele é a ferramenta certa para a sua função real, que é levar bytes por um canal que só lida com texto:

- **Dados binários em JSON ou YAML.** Nenhum dos dois formatos tem um tipo de bytes, então imagens, certificados e keystores entram como strings Base64.
- **HTTP Basic auth.** O formato do header exige, como visto acima.
- **Data URIs.** A RFC 2397 permite embutir uma imagem pequena ou uma fonte como `data:image/png;base64,…`.
- **Anexos de e-mail.** O MIME (RFC 2045) usa Base64 para levar binários pelo transporte de e-mail, com quebra a cada 76 caracteres. O GNU `base64` quebra em 76 por padrão pelo mesmo motivo; passe `-w 0` para ter uma linha única.
- **Tokens e URLs.** A base64url transporta identificadores binários e segmentos de JWT sem escape.

Em todos esses casos, espera-se que quem recebe decodifique o valor. Essa é a ideia.

## Confira a string sem mandá-la para lugar nenhum

Quando encontrar uma string suspeita em um arquivo de configuração ou em uma linha de log, decodifique para ver o que ela é. Mas não cole uma possível chave de produção em um site que pode mandá-la para algum lugar.

O [Base64 Encoder / Decoder](/base64-encoder-decoder/) deste site roda inteiramente no seu navegador. Ele lida com os alfabetos padrão e seguro para URL e com UTF-8 completo, e nada do que você cola é enviado. Como com qualquer ferramenta, não confie de olhos fechados: abra o DevTools, limpe a aba Network, cole a string e confira que nenhuma requisição a carrega. Se a string for um JWT, o [decodificador de JWT](/jwt-decoder/) separa e decodifica os três segmentos.

## Checklist: Base64 e chaves de API

- [ ] Nenhuma chave de API no repositório, codificada ou não, inclusive no histórico.
- [ ] Secrets do Kubernetes criptografados em repouso, e o `get` do RBAC em Secrets limitado às identidades que precisam dele.
- [ ] Chaves guardadas em um gerenciador de segredos ou KMS e injetadas em tempo de execução, nunca embutidas em imagens ou bundles de front-end.
- [ ] Uma chave de escopo restrito por serviço e ambiente.
- [ ] Um procedimento de rotação que já foi executado pelo menos uma vez.
- [ ] Credenciais enviadas só por TLS, Basic auth incluída.
- [ ] Logs limpos de headers, dumps de ambiente e configurações renderizadas.
- [ ] Base64 usado só para levar bytes como texto, nunca para escondê-los.

Como o seu time pega segredos codificados antes do merge: um scanner de pre-commit, uma verificação no CI ou revisores que sabem como `b3Bz` se parece?
