---
title: "Uma alternativa ao jwt.io: decodifique um JWT sem colá-lo no site de outra pessoa"
description: "Procurando uma alternativa ao jwt.io? O que um decodificador de JWT no navegador prova ou não sobre os seus dados, como conferir você mesmo e uma opção offline."
pubDate: 2026-09-10
updatedDate: 2026-10-04
tags: ["security", "jwt", "developer-experience"]
lang: pt-br
translationOf: "jwt-io-alternative"
relatedTool:
  name: "JWT Decoder & Encoder"
  href: "/jwt-decoder"
---

![Um JSON Web Token mostrado como três segmentos conectados — header, payload e assinatura — representando um JWT decodificado inteiramente no navegador](/blog/jwt-io-alternative-hero.svg)
<!-- keywords: jwt.io alternative | is jwt.io safe, jwt decoder offline, decode jwt online, secure jwt decoder, online jwt decoder risks | source: ahrefs free (2026-09-21); marketing brief, ahrefs unchecked (2026-10-04) -->

Um colega joga um token em uma thread do Slack: "por que isso está dando 401?" Você copia, abre uma aba nova e já está colando no jwt.io quando percebe o que tem nas mãos: um access token de produção válido.

Tudo bem fazer isso? Você provavelmente supõe que sim. A proposta deste post é trocar essa suposição por algo que você consegue conferir de fato.

> **TL;DR**
>
> - Decodificar um JWT são duas decodificações base64url. Sem chave, sem servidor e sem nada que precise ser enviado.
> - Se uma *página específica* manda o seu token para algum lugar é algo que você confere em DevTools → Network em uns cinco segundos. Faça isso em vez de confiar em qualquer fornecedor, nós incluídos.
> - Máquina isolada ou com política rígida? `cut | tr | base64 -d` decodifica um JWT, e `openssl dgst -hmac` recalcula uma assinatura HS256 para você comparar, sem navegador nenhum.
> - Decodificar não é verificar, e nenhum dos dois substitui a verificação no servidor contra as suas chaves de assinatura reais.

## O jwt.io é seguro?

Essa é a pergunta errada, ou pelo menos incompleta. "Seguro" depende do que uma página específica faz com o que você digita, e isso você pode conferir em vez de acreditar.

O mecanismo que importa: o header e o payload em `header.payload.signature` são JSON codificado em base64url. Não existe etapa de criptografia. Então qualquer ferramenta que os decodifique no motor JavaScript do seu próprio navegador consegue fazer o trabalho inteiro sem nenhuma requisição de rede.

O jwt.io é um depurador antigo e muito usado, mantido pela Auth0, e a decodificação dele funciona exatamente assim, no seu navegador.

Mas "decodifica localmente" descreve um caminho de código em uma página. Não garante nada sobre todas as requisições que a origem dessa página faz. Uma página pode decodificar localmente e ainda assim carregar analytics, anúncios ou outros scripts de terceiros que não têm nada a ver com a decodificação.

## A checagem de cinco segundos na aba Network

O jeito confiável de saber o que um decodificador faz com o seu token (o jwt.io, este aqui ou uma extensão do navegador) é observá-lo:

1. Abra o DevTools e vá para a aba **Network**.
2. Limpe a lista de requisições. Deixe o filtro em **All**, ou pelo menos inclua **Fetch/XHR** e **WS**, para que o tráfego de WebSocket também apareça.
3. Cole o seu token.
4. Espere alguns segundos, porque um beacon pode disparar com atraso. Depois veja o que saiu. Se nenhuma requisição de saída contém o token, ou se nada dispara quando você cola, nada foi enviado.

Isso convence mais do que qualquer afirmação em um post de blog, incluindo este.

Seguimos o mesmo padrão. O [decodificador de JWT](/jwt-decoder/) deste site faz a decodificação, a análise de claims e a verificação de assinatura inteiramente no navegador, com JavaScript e a Web Crypto API.

Para ser preciso sobre todo o resto que este site carrega: seus próprios arquivos estáticos, o Google Analytics (o script gtag.js mais os pings de visualização de página e de eventos) e o Cloudflare Web Analytics. Nenhum deles carrega o token que você digita.

Confira isso na aba Network. Também não acredite só na nossa palavra.

Uma ressalva que não tem nada a ver com a rede: se você salvar um snapshot no decodificador, o token (nunca as suas chaves) fica guardado no localStorage deste navegador. Em uma máquina compartilhada, não salve snapshots de tokens de produção.

## Decodificar JWT online: o que realmente precisa acontecer

Veja um exemplo resolvido com o velho token de exemplo do jwt.io. O header, o payload e o segredo dele foram por anos o exemplo padrão do jwt.io, e ele virou o token de demonstração padrão das ferramentas de JWT:

```text
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

Divida nos dois pontos e decodifique em base64url as duas primeiras partes.

O header:

```json
{ "alg": "HS256", "typ": "JWT" }
```

O payload:

```json
{ "sub": "1234567890", "name": "John Doe", "iat": 1516239022 }
```

Essa é toda a etapa de "decodificar". Você não precisa de chave porque nada aqui está criptografado. `iat` é um NumericDate (segundos desde a época Unix), e 1516239022 é 18 de janeiro de 2018.

*Verificar* é outra operação. Ela confirma que a assinatura foi produzida por quem tem o segredo, aqui `your-256-bit-secret`. Você fornece esse segredo HMAC, e a ferramenta recalcula `HMACSHA256(base64url(header) + "." + base64url(payload), secret)` e compara o resultado com o terceiro segmento.

> **Importante:** um token pode decodificar sem problema e ainda assim falhar na verificação. É exatamente por isso que ele tem assinatura.

## A armadilha da verificação de assinatura: riscos de decodificadores de JWT online

Colar um token em um decodificador expõe um token. Ele tem um `exp` e para de funcionar quando esse prazo passa. Colar o segredo HMAC para verificar esse token expõe algo pior: a chave que assina *todos* os tokens que o seu serviço emite.

Com HS256, o mesmo segredo assina e verifica. Quem o tiver pode gerar um token para qualquer usuário, com quaisquer claims, que o seu backend vai aceitar como legítimo. Ele continua válido até você fazer a rotação, e a rotação normalmente desloga todos os usuários. Então uma página de decodificação que envia o que você digita para um servidor é um incômodo para um token e um incidente para um segredo.

Um fluxo de trabalho seguro com decodificadores de JWT mantém o segredo longe de qualquer ferramenta do lado do servidor:

- **HS256 com um segredo de produção:** verifique offline com `openssl` (veja abaixo), ou em uma ferramenta de navegador só depois que a checagem na aba Network mostrar que nada sai da página.
- **RS256, ES256 ou EdDSA:** a verificação só precisa da chave pública ou do JWKS, que são públicos por definição. Colar em qualquer lugar não tem problema; a chave privada nunca sai do seu emissor.
- **Depurar uma assinatura que não bate:** reproduza com um segredo descartável em um ambiente de teste, não com o real.

> **Atenção:** se um segredo HMAC de produção já foi parar em uma página que você nunca conferiu, trate-o como comprometido. Faça a rotação e aceite o login forçado como o preço.

## Decodificador de JWT offline: sem navegador

Às vezes "no navegador, conferido pelo DevTools" não basta. Talvez você esteja em uma máquina isolada. Talvez uma revisão de segurança exija zero capacidade de rede, ponto final, e não só nenhuma requisição observada. Você tem duas opções honestas.

### Opção 1: decodificar com ferramentas em que você já confia

A base64url difere do base64 padrão em dois pontos: dois caracteres são trocados (`-` no lugar de `+`, `_` no lugar de `/`) e o preenchimento `=` é removido. Então `cut`, `tr` e `base64` entregam o JSON sem navegador nenhum:

```bash
TOKEN='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
echo "$TOKEN" | cut -d. -f2 | tr '_-' '/+' | base64 -d 2>/dev/null
# {"sub":"1234567890","name":"John Doe","iat":1516239022}
```

> **Armadilha:** o `base64` espera uma entrada preenchida com `=` até um múltiplo de 4 caracteres. O GNU `base64 -d` ainda imprime este payload (só sai com código diferente de zero), mas o do BSD/macOS é menos tolerante.

Se preferir não depender disso, esta função de shell preenche antes:

```bash
b64url() {
  local s
  s=$(printf '%s' "$1" | tr '_-' '/+')
  while [ $(( ${#s} % 4 )) -ne 0 ]; do s="$s="; done
  printf '%s' "$s" | base64 -d; echo
}

b64url "$(echo "$TOKEN" | cut -d. -f1)"   # {"alg":"HS256","typ":"JWT"}
b64url "$(echo "$TOKEN" | cut -d. -f2)"   # {"sub":"1234567890","name":"John Doe","iat":1516239022}
```

Com HS256 você também pode verificar offline. Recalcule o HMAC sobre `header.payload` e compare com o terceiro segmento:

```bash
printf '%s' "$(echo "$TOKEN" | cut -d. -f1-2)" \
  | openssl dgst -sha256 -hmac 'your-256-bit-secret' -binary \
  | base64 | tr '+/' '-_' | tr -d '='
# SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c   <- matches the signature segment
```

Se você quer tratamento de flags decente e verificação embutida em vez de one-liners de shell, existem CLIs offline dedicadas. A `jwt-cli` (`mike-engel/jwt-cli` no GitHub, escrita em Rust) é uma das mais citadas.

### Opção 2: um decodificador estático sem caminho de upload

Uma decodificação simples é só decodificar base64url em JS no lado do cliente. Então um site estático não precisa de backend para isso, e este não tem: não existe servidor próprio para receber o seu token.

Isso não quer dizer que uma página *não possa* falar com nada. A Content-Security-Policy deste site limita as conexões de saída à própria origem mais os endpoints do Google Analytics e do Cloudflare Web Analytics, o que você pode ler nos headers de resposta. Uma política restringe para onde os dados poderiam ir; não prova para onde eles foram. A checagem continua sendo a aba Network.

## Quando usar cada um

Seja honesto consigo mesmo sobre para que serve cada opção:

| Opção | Melhor para | Garantia |
|---|---|---|
| **jwt.io** | Tokens não sensíveis: testes, tutoriais, tenants fora de produção | O caminho de decodificação é JS no lado do cliente |
| **Ferramenta de navegador + aba Network** | Access tokens ou ID tokens reais | Você viu que nada saiu da aba (nesta visita) |
| **Decodificação via CLI** | Máquina isolada ou política sem rede | A mais forte, só perde para escrever a sua própria |

O caminho do navegador acrescenta legendas de claims, checagem de expiração e verificação de assinatura. O caminho da CLI entrega JSON cru e verificação HMAC, e nada mais.

> **Importante:** nenhuma dessas opções valida autorização. Decodificar, mesmo com verificação de assinatura, diz que o token está bem formado e, opcionalmente, que foi assinado por quem tem a chave com que você conferiu. Isso não substitui a verificação no servidor antes de agir com base em um claim em produção. O seu backend precisa fazer essa checagem contra as suas chaves de assinatura reais, sempre.

Quer descer um nível abaixo das ferramentas específicas de JWT, até a mecânica da base64url em si? O [Base64 Encoder / Decoder](/base64-encoder-decoder/) lida com payloads base64 e base64url arbitrários, não só JWTs.

## Principais conclusões

- Trate "este site é seguro?" como uma pergunta que você responde no DevTools, não pela reputação.
- Limpe a aba Network, cole o token e confira que nada o leva para fora.
- Decodificar não é verificar: um payload legível não prova nada sobre quem o assinou.
- Em máquinas restritas, `cut | tr | base64 -d` decodifica e `openssl dgst -hmac` permite conferir uma assinatura HS256.
- Sempre verifique no servidor contra as suas chaves reais antes de confiar em um claim.

Se você quer o caminho do navegador com verificação embutida, o [decodificador de JWT](/jwt-decoder/) faz o trabalho completo: decodifica, verifica contra um segredo, PEM, JWK ou JWKS, assina os seus próprios tokens e gera chaves de teste, sem enviar nada. Confirme isso na sua própria aba Network antes de confiar a ele qualquer coisa real.

Qual é a regra do seu time para tokens de produção: vale qualquer decodificador, uma ferramenta interna aprovada ou só CLI? E o que levou o time a essa decisão?
