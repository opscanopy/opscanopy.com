---
title: "Unable to get local issuer certificate: curl, git, npm e pip"
description: "Por que curl, git, npm e pip mostram unable to get local issuer certificate, qual trust store cada um lê e as correções que adicionam uma CA sem substituí-lo."
pubDate: 2026-09-26
tags: ["security", "tls", "certificates", "debugging"]
lang: pt-br
translationOf: "unable-to-get-local-issuer-certificate"
relatedTool:
  name: "Certificate Decoder"
  href: "/certificate-decoder"
---

![Quatro clientes de linha de comando, curl, git, npm e pip, cada um conferindo o certificado do servidor no seu próprio trust store, e um deles sem o emissor](/blog/unable-to-get-local-issuer-certificate-hero.svg)
<!-- keywords: primary: unable to get local issuer certificate (>1000, KD Medium) | title phrase: ssl certificate problem: unable to get local issuer certificate (>100, Easy) | secondaries: curl unable to get local issuer certificate, git ssl certificate problem unable to get local issuer certificate (Easy), npm unable to get local issuer certificate (Easy), pip unable to get local issuer certificate (Easy), curl: (60) ssl certificate problem | source: ahrefs free (2026-09-26) -->
<!-- insight: the string means different things per client: curl/git/pip print it for a missing intermediate AND an untrusted root, Node/npm only when the chain arrived and the root is missing from Node's bundled store (proxy/private CA); most usual fixes (--cacert, http.sslCAInfo, npm cafile) replace the trust store, NODE_EXTRA_CA_CERTS appends, and pip --cert adds only under truststore (pip 24.2+, Python 3.10+) | serp-checked: 2026-09-26 -->

É o seu primeiro dia no emprego novo, você vai clonar um repositório e o comando para logo no handshake:

```text
curl: (60) SSL certificate problem: unable to get local issuer certificate
More details here: https://curl.se/docs/sslcerts.html
```

Em seguida, `git clone`, `npm install` e `pip install` também falham. O navegador continua abrindo a página normalmente. "Unable to get local issuer certificate" é um único erro do OpenSSL, mas cada cliente faz a verificação contra um trust store (o repositório de certificados confiáveis) diferente, e é por isso que a mesma correção funciona numa ferramenta e não na seguinte.

> **TL;DR**
>
> - O erro é o código 20 do OpenSSL: a cadeia termina num certificado cujo emissor não está no trust store *deste cliente*.
> - Rode `openssl s_client -showcerts` contra o host e leia as linhas `i:`. Um único certificado: falta o intermediário. Um emissor corporativo ou de fornecedor: um proxy de inspeção TLS.
> - curl, git, Node/npm e pip leem cada um um trust store diferente, então instalar uma CA num lugar raramente resolve os quatro.
> - `--cacert`, `http.sslCAInfo` e o `cafile` do npm **substituem** o trust store. `NODE_EXTRA_CA_CERTS` acrescenta.

## O que significa "unable to get local issuer certificate"?

O servidor envia um certificado folha (leaf) e, se estiver bem configurado, os intermediários. O seu cliente monta a cadeia de baixo para cima a partir da folha e precisa que o topo seja uma raiz que ele já tenha localmente. O OpenSSL gera o erro 20, `X509_V_ERR_UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, quando o certificado do topo não é autoassinado e não existe nenhum emissor para ele no trust store local.

Isso cobre duas situações diferentes. Se o servidor enviou só a folha, a cadeia para na profundidade 0 porque falta o intermediário. Se a folha e o intermediário chegaram, mas a raiz não está no seu trust store, a cadeia para na profundidade 1 ou 2. Esse é o caso da CA privada e do proxy.

Vale reconhecer os vizinhos dele no [x509_txt.c](https://github.com/openssl/openssl/blob/master/crypto/x509/x509_txt.c) do OpenSSL:

```text
18  self-signed certificate
19  self-signed certificate in certificate chain
20  unable to get local issuer certificate
21  unable to verify the first certificate
```

Um proxy que também envia a própria raiz produz o 19 em vez do 20. O mecanismo por trás de todos eles é a verificação da cadeia explicada em [x509: certificate signed by unknown authority](/blog/x509-certificate-signed-by-unknown-authority/), que é como o Go descreve a mesma falha.

## Por que a mesma URL falha num cliente e funciona em outro?

curl, git e Python no Linux ou no macOS param no primeiro erro de verificação, então um servidor que envia só a folha dá a eles o código 20. O `openssl s_client` segue em frente: contra `incomplete-chain.badssl.com` ele imprime `num=20`, depois `num=21`, e termina com `Verify return code: 21 (unable to verify the first certificate)`.

O Node, por sua vez, informa o *último* erro. Por isso, um servidor que envia só a folha aparece no Node 24.16.0 como `unable to verify the first certificate` (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`), e o próprio Node sugere tentar `--use-system-ca` se a CA raiz estiver instalada localmente. Quando o npm ou o Node mostra `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, os intermediários chegaram e a raiz está faltando no trust store do Node, que é a assinatura do proxy ou da CA privada.

O Windows é outra história. O curl 8.4.0 que vem com o Git for Windows e o curl.exe do System32 usam Schannel, e os dois retornaram 200 para a mesma cadeia incompleta, porque o Schannel busca os intermediários que faltam e lê o repositório de certificados do Windows. O Python 3.13 do python.org no Windows também passou. O que falha é o próprio git, que o Git for Windows configura com `http.sslBackend=openssl`, além do WSL e dos contêineres.

| O que você vê | Onde | Causa mais provável |
|---|---|---|
| Erro 20, navegador ok, `s_client` mostra um certificado | curl, git, pip | [Servidor sem o intermediário](#causa-2-o-servidor-está-sem-o-certificado-intermediário) |
| Todo host HTTPS falha, só na rede do escritório ou na VPN | qualquer cliente | [Proxy de inspeção TLS](#causa-1-um-proxy-de-inspeção-tls-está-reassinando-seu-tráfego) |
| `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` | npm, Node | Proxy ou CA privada |
| `unable to verify the first certificate` | npm, Node | Servidor sem o intermediário |
| Funciona com o curl do Windows/Schannel, falha no git, no WSL ou num contêiner | Windows | O Schannel completou a cadeia ou confia no repositório do Windows |
| Falha só no `docker build` ou num contêiner | imagem | [Trust store da imagem sem a CA](#causa-3-por-que-falha-só-dentro-de-uma-imagem-docker) |

## Qual trust store cada cliente lê?

A maioria das listas de correções pula esta parte. Não existe um único "trust store do sistema" que atenda todas as ferramentas: cada cliente tem o seu padrão e a sua própria forma de sobrescrevê-lo, com semânticas diferentes.

![Qual trust store cada cliente lê: curl e git leem um arquivo de bundle PEM, Node e npm leem uma lista da Mozilla compilada no Node, pip lê o certifi mais o repositório do sistema, e os clientes Schannel leem o repositório de certificados do Windows](/blog/unable-to-get-local-issuer-certificate-diagram.svg)

| Cliente | Trust store padrão | Como sobrescrever, e o que isso faz |
|---|---|---|
| curl (build com OpenSSL) | Arquivo de bundle de CAs definido na compilação | `--cacert`, `CURL_CA_BUNDLE`: substituem |
| git, backend openssl | O bundle que vem com o Git ou o bundle do sistema | `http.sslCAInfo`, `GIT_SSL_CAINFO`: substituem |
| Node, npm | Lista de CAs da Mozilla fixada no lançamento do Node | `NODE_EXTRA_CA_CERTS`: acrescenta. `cafile` do npm: substitui |
| pip 24.2+ no Python 3.10+ | certifi mais o repositório do sistema | `--cert`, `PIP_CERT`: adicionam um bundle |
| requests | certifi | `REQUESTS_CA_BUNDLE`: substitui |
| curl.exe, git com schannel | Repositório de certificados do Windows | Gerenciado pelo Windows ou por Group Policy |

O Node não lê o repositório do sistema operacional por padrão ([documentação da CLI do Node](https://nodejs.org/api/cli.html#node_extra_ca_certsfile)), então instalar uma CA corporativa no Windows, no macOS ou no Debian não resolve o npm. `--use-system-ca` (v23.8.0 e v22.15.0, no Linux a partir da v23.9.0) e `NODE_USE_SYSTEM_CA=1` (v24.6.0 e v22.19.0) mudam isso. No Python, o `requests` passa o caminho do certifi explicitamente, então o `SSL_CERT_FILE` não chega até ele.

O pip é diferente: com o truststore, o `--cert` adiciona. O pip 26.0.1 no Python 3.13 continuou alcançando o PyPI com `--cert` apontando para uma única raiz sem relação; com `--use-deprecated=legacy-certs`, o mesmo comando falhou com este erro.

> **Atenção:** uma opção do tipo "substitui" apontada para um arquivo que contém só a sua CA corporativa resolve o host que passa pelo proxy e quebra todos os públicos. Com `GIT_SSL_CAINFO` apontando para um arquivo com uma única raiz, `git ls-remote https://github.com/git/git.git` falha com esse mesmo erro. Aponte as opções que substituem para um bundle completo que também contenha a sua CA.

## Como confirmar qual é a sua causa?

Pergunte ao servidor o que ele envia, usando o host que o seu cliente chamou. Mantenha o `-servername` para que o SNI escolha o certificado certo:

```bash
openssl s_client -connect registry.npmjs.org:443 -servername registry.npmjs.org -showcerts </dev/null
```

Leia os pares numerados `s:` (subject) e `i:` (issuer):

- **Um certificado, emissor público, `depth=0` na linha de erro:** falta o intermediário no servidor.
- **O emissor do topo é a sua empresa ou um fornecedor de segurança como a Zscaler:** um proxy de inspeção TLS, mesmo quando só a folha chegou.

Para ler a cadeia sem forçar a vista no PEM, cole a transcrição inteira no [Certificate Decoder](/pt-br/certificate-decoder/); ele ignora o texto em volta dos certificados.

Numa captura de `incomplete-chain.badssl.com` só com a folha, ele gera um erro `missing intermediate` e diz o que está faltando: `The chain is missing the intermediate that issued *.badssl.com: "C=US, O=Let's Encrypt, CN=YR2".` A mensagem diz que os runtimes falham com "unable to get local issuer certificate". O Node é a exceção descrita na seção acima.

O limite, sendo honesto: o decoder não enxerga o trust store do seu cliente. Se o proxy envia o intermediário, a cadeia é internamente válida e o resultado é `chain order OK · 1 signature verified`, sem a raiz. Um proxy que envia só a folha recebe `missing intermediate`, mas um emissor corporativo continua significando proxy, não um bug no servidor. Em qualquer caso, leia o nome do emissor.

## Quais são as causas, em ordem?

Três causas, começando pela mais comum em redes corporativas. Cada uma tem um sinal, uma correção e uma verificação.

### Causa 1: um proxy de inspeção TLS está reassinando seu tráfego?

Em redes corporativas, esse é o culpado de sempre, e o primeiro palpite da equipe da CLI do npm em [npm/cli#7326](https://github.com/npm/cli/issues/7326): "This is usually because of a proxy you are in that is not providing valid ssl certificates." O proxy encerra o TLS e reassina os sites inspecionados com a própria CA. O seu navegador confia nessa CA por uma política da TI; as suas ferramentas de linha de comando, não.

**Sinal:** todo host público falha, o emissor do topo no `s_client` é uma CA corporativa ou de fornecedor, e o npm mostra `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`:

```text
npm error code UNABLE_TO_GET_ISSUER_CERT_LOCALLY
npm error errno UNABLE_TO_GET_ISSUER_CERT_LOCALLY
npm error request to https://registry.npmjs.org/serve failed, reason: unable to get local issuer certificate
```

O pip embrulha o mesmo texto do OpenSSL; o número da linha do `_ssl.c` varia conforme o build do Python:

```text
[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: unable to get local issuer certificate (_ssl.c:1028)
```

**Correção:** peça à TI o certificado raiz do proxy (em PEM), instale-o uma vez e depois dê a cada cliente uma opção que preserve as raízes públicas:

```bash
# Debian/Ubuntu/WSL: add the root to the OS bundle (.crt extension required)
sudo cp corp-root.pem /usr/local/share/ca-certificates/corp-root.crt
sudo update-ca-certificates

# curl and git: point at the full bundle, which now includes the corporate root
curl --cacert /etc/ssl/certs/ca-certificates.crt https://registry.npmjs.org/
git config --global http.sslCAInfo /etc/ssl/certs/ca-certificates.crt

# Node and npm: append to Node's own list instead of replacing it
export NODE_EXTRA_CA_CERTS="$HOME/corp-root.pem"

# pip and requests
export PIP_CERT=/etc/ssl/certs/ca-certificates.crt
export REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
```

No Git for Windows, `git config --global http.sslBackend schannel` faz o git usar o repositório do Windows, que muitas vezes a TI já preencheu. O pip 24.2 ou mais recente no Python 3.10+ também lê o repositório do sistema junto com o certifi ([documentação do pip](https://pip.pypa.io/en/stable/topics/https-certificates/)).

> **Importante:** o `NODE_EXTRA_CA_CERTS` só é lido quando o processo inicia, e o Node o ignora quando uma opção `ca` explícita está definida. O `cafile` do npm vira essa opção `ca`, então definir os dois descarta os certificados extras sem avisar. Prefira o `NODE_EXTRA_CA_CERTS`.

**Verificação:** `openssl s_client -connect registry.npmjs.org:443 -servername registry.npmjs.org -CAfile /etc/ssl/certs/ca-certificates.crt </dev/null` deve terminar com `Verify return code: 0 (ok)`. Depois, rode de novo o comando original. O Python 3.13 ativa o `VERIFY_X509_STRICT`, então uma CA de proxy antiga e feita em casa ainda pode falhar ali com outro erro depois de passar a ser confiável.

### Causa 2: o servidor está sem o certificado intermediário?

**Sinal:** o `s_client` mostra um único certificado, o erro está em `depth=0`, o navegador abre a página e o Node diz `unable to verify the first certificate`. O git mostra assim:

```text
fatal: unable to access 'https://incomplete-chain.badssl.com/x.git/': SSL certificate problem: unable to get local issuer certificate
```

**Correção:** no servidor. O arquivo de certificado precisa conter a folha seguida de todos os intermediários, o que no Let's Encrypt significa `fullchain.pem`, não `cert.pem`.

A [primeira causa do post sobre x509](/blog/x509-certificate-signed-by-unknown-authority/#1-the-server-is-missing-its-intermediate) traz as linhas do nginx. Se o servidor não é seu, envie a saída do `s_client` para quem cuida dele. Adicionar o intermediário ao seu próprio bundle só esconde um bug que todos os outros clientes OpenSSL vão encontrar.

**Verificação:** rode o `s_client` de novo; você deve ver pelo menos dois certificados e `Verify return code: 0 (ok)`.

> **Dica:** para um servidor Git interno assinado por uma CA privada, restrinja a opção a esse host: `git config --global http.https://git.corp.example/.sslCAInfo ~/corp-ca-bundle.pem`. Os remotes públicos continuam usando o bundle padrão, então um arquivo com uma única raiz é seguro ali.

### Causa 3: por que falha só dentro de uma imagem Docker?

Um contêiner carrega o próprio trust store, e a CA corporativa do host não vai junto para dentro dele. Dentro do `docker build`, o npm e o pip falham contra o mesmo proxy em que o seu notebook já confia. Se a imagem não tem bundle nenhum, comece pela [seção sobre contêineres do post de x509](/blog/x509-certificate-signed-by-unknown-authority/#2-your-container-has-no-ca-bundle-at-all).

**Sinal:** o comando funciona no host e falha num passo `RUN` ou num contêiner em execução. Como descobrir qual `RUN` falhou está explicado em [docker build "failed to solve"](/blog/docker-build-failed-to-solve-exit-code-1/).

**Correção:** adicione a raiz com nome `.crt` (o `update-ca-certificates` ignora `.pem` sem avisar, segundo a [man page do Debian](https://manpages.debian.org/testing/ca-certificates/update-ca-certificates.8.en.html)) e depois diga ao Node e ao requests onde está o bundle regenerado:

```dockerfile
COPY corp-root.pem /usr/local/share/ca-certificates/corp-root.crt
RUN update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
ENV REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
```

O `update-ca-certificates` sozinho não ajuda o Node, que mantém a lista compilada nele. Em imagens RHEL ou UBI, copie a raiz para `/etc/pki/ca-trust/source/anchors/` e rode `update-ca-trust extract`.

**Verificação:** `docker run --rm <image> ls /etc/ssl/certs/ca-certificates.crt` e, em seguida, rode de novo o passo que falhou.

## Por que -k, GIT_SSL_NO_VERIFY ou strict-ssl=false não são uma correção?

Todo cliente tem um botão de desligar: `curl -k`, `GIT_SSL_NO_VERIFY=true`, `npm config set strict-ssl false`, `NODE_TLS_REJECT_UNAUTHORIZED=0` e o `--trusted-host` do pip. Eles fazem o erro sumir removendo a verificação que o gerou, para todos os hosts que o comando acessa.

Atrás de um proxy de inspeção TLS, essa verificação é a única coisa que diferencia o seu proxy de qualquer outro que esteja na mesma posição. Com ela desligada, uma instalação aceita qualquer certificado que receber. A [orientação do próprio curl](https://curl.se/docs/sslcerts.html) sobre o `--insecure` é nunca pular a verificação em produção.

A correção de verdade é um arquivo de CA e uma variável. Trate um `strict-ssl=false` num `.npmrc` compartilhado ou num template de CI como um achado de auditoria, não como uma configuração a copiar.

## O que verificar, em ordem?

1. Rode `openssl s_client -showcerts` contra o host exato e conte os certificados.
2. Um certificado e `depth=0`: falta o intermediário no servidor. Corrija lá.
3. O emissor do topo é uma CA corporativa ou de fornecedor: peça essa raiz em PEM à TI.
4. Instale-a no repositório do sistema, com nome `.crt` em sistemas da família Debian.
5. Dê a cada cliente um bundle completo ou uma opção que acrescente: `http.sslCAInfo`, `NODE_EXTRA_CA_CERTS`, `PIP_CERT`, `REQUESTS_CA_BUNDLE`.
6. Nunca aponte uma opção que substitui para um arquivo que contém só a raiz corporativa.
7. Em imagens, repita os passos 4 e 5 no Dockerfile.
8. Confirme `Verify return code: 0 (ok)` e depois remova qualquer `-k` ou `strict-ssl=false` que tenha ficado para trás.

Da próxima vez que um handshake falhar, cole a saída do `s_client` no [Certificate Decoder](/pt-br/certificate-decoder/) e leia o emissor antes de mexer em qualquer configuração.

Qual cliente da sua stack foi o último a ficar sabendo da CA corporativa, e quanto tempo levou para alguém perceber?
