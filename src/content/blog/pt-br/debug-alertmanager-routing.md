---
title: "Por Que Meu Alerta Não Chega ao Receiver Certo? Depurando o Roteamento do Alertmanager"
description: "Alertas indo para o receiver errado, ou para nenhum receiver? Depure o roteamento do Alertmanager — primeiro match vence, continue ausente, regex de matcher e defaults catch-all."
pubDate: 2026-06-18
tags: ["alertmanager","observability","alerting"]
lang: pt-br
translationOf: "debug-alertmanager-routing"
relatedTool:
  name: "Alertmanager Route Tester"
  href: "/alertmanager-route-tester"
---

![Depurando o roteamento do Alertmanager: um alerta com labels percorrendo uma árvore de rotas para encontrar o receiver correto em vez do errado](/blog/debug-alertmanager-routing-hero.svg)

Você publicou uma nova regra de alerta, ela disparou em produção e o page foi para o time errado — ou ninguém foi acionado. A regra está correta e o alerta está disparando, mas o seu problema de receiver errado no Alertmanager é real: a notificação caiu em algum lugar que você não esperava. Quando o Alertmanager não roteia da forma que você pretendia, o bug quase nunca está no alerta. Ele está na árvore de `route`, e árvores de roteamento são código pelo qual você não consegue passar passo a passo com facilidade.

O Alertmanager despacha cada alerta percorrendo uma árvore de rotas. A raiz é o catch-all por onde todo alerta entra; a partir dela, ele desce para rotas filhas cujos matchers se sustentam contra os labels do alerta. Erre o percurso e o alerta cai silenciosamente na folha errada. Este post cobre os cinco bugs que causam isso, e como percorrer a árvore você mesmo — sem `amtool`, sem reload, sem instância ativa.

## O sintoma: pages silenciosos, ou o time errado é acionado

Duas formas do mesmo problema. Ou um alerta que você esperava que acionasse o time de banco de dados foi para um canal catch-all do Slack que ninguém acompanha, ou um alerta `severity=critical` não gerou page nenhum. Ambos vêm da mesma causa raiz: a rota que o alerta *de fato* casou não é a rota que você *acha* que ele casou.

Aqui está a árvore com a qual a maioria das pessoas começa — o exemplo canônico de roteamento:

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - receiver: 'team-X-mails'
      match:
        team: frontend
    - receiver: 'team-DB-pages'
      match:
        service: database
    - receiver: 'team-Y-mails'
      match:
        team: backend
```

Um alerta com `service=database` chega em `team-DB-pages`. Simples o suficiente — até a árvore crescer, irmãos serem reordenados, alguém adicionar um regex, e o percurso parar de fazer o que você lê no papel. A correção é sempre a mesma: pare de raciocinar de cabeça e percorra a árvore contra os labels exatos que o alerta carrega. Cada bug abaixo é uma forma diferente de o percurso te surpreender.

## Bug 1: o primeiro match vence e você esqueceu o continue: true

Esse é o bug de roteamento mais comum do Alertmanager. Dentro de uma rota que casou, as rotas filhas são avaliadas **de cima para baixo**, e o alerta desce para o **primeiro** filho que casa — e então a varredura dos irmãos para. Os irmãos seguintes nunca rodam.

Isso morde com mais força quando você quer que um alerta chegue a dois receivers — digamos, todo alerta crítico espelhado para um receiver de auditoria *e* roteado para o time responsável:

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname']
  routes:
    - receiver: 'all-critical-audit'
      matchers:
        - severity="critical"
    - receiver: 'team-Y-pages'
      match:
        team: backend
```

Dispare um alerta com `team=backend` e `severity=critical`. Ele casa com o primeiro irmão, `all-critical-audit`, e a varredura para por ali. `team-Y-pages` nunca é alcançado, então o time de backend nunca é acionado. O canal de auditoria registrou o alerta, então *parece* que o roteamento funcionou — que é exatamente por que esse é difícil de detectar.

A correção é uma linha. Uma rota que casou com `continue: true` não para a varredura dos irmãos, então o alerta continua caindo para os irmãos seguintes que também casam:

```yaml
    routes:
      - receiver: 'all-critical-audit'
        matchers:
          - severity="critical"
        continue: true        # keep going to later siblings
      - receiver: 'team-Y-pages'
        match:
          team: backend
```

Agora ambos disparam. Um alerta só pode chegar a mais de um receiver quando `continue: true` está definido em uma rota que casou; sem isso, o primeiro irmão que casa sempre vence.

## Bug 2: o matcher não casa (regex, aspas, um label ausente)

Se o alerta pula silenciosamente uma rota que você tinha certeza que ele atingiria, provavelmente o matcher não está casando. Três armadilhas respondem por quase todos esses casos.

**Regexes são totalmente ancorados.** Tanto `match_re` quanto os operadores `=~` / `!~` envolvem o seu padrão como `^(?:…)$`. Um padrão parcial nunca casa com um valor mais longo:

```yaml
matchers:
  - env=~"staging"      # env=staging-eu does NOT match — anchored to exactly "staging"
```

```yaml
matchers:
  - env=~"staging-.*"   # env=staging-eu matches now
```

**Um label ausente é a string vazia.** O Alertmanager trata um label ausente no alerta como `""`, então `team=""` casa com um alerta que *não* tem o label `team`, e `team!=""` exige que ele esteja presente e não vazio. Se você escreve `match: { team: frontend }` mas o alerta nunca define um label `team`, o matcher compara `frontend` contra `""`, falha, e a rota é pulada — você cai através dela.

**Operadores e aspas nas strings de `matchers:`.** A forma moderna `matchers:` aceita strings como `foo="bar"`, `foo=~"re"`, `foo!="x"` e `foo!~"re"`; o valor pode estar entre aspas ou sem elas. Os operadores de dois caracteres (`=~`, `!~`, `!=`) são reconhecidos antes do `=` simples, então `severity!="info"` é interpretado como um diferente-de. Erre as aspas — deixe uma aspa aberta, por exemplo — e o matcher fica inválido; um matcher inválido não pode se sustentar, então a rota é pulada.

Aqui está uma rota com matcher que combina um regex com uma desigualdade:

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname', 'env']
  routes:
    - receiver: 'staging-slack'
      matchers:
        - env=~"staging-.*"
        - severity!="info"
    - receiver: 'prod-pager'
      match_re:
        env: 'prod-.*'
```

Todos os matchers de uma rota precisam se sustentar para que ela case — é um E lógico. Um alerta com `env=staging-eu` e `severity=warning` chega em `staging-slack`: o `staging-.*` ancorado casa e `severity` não é `info`. Mude `severity` para `info` e o segundo matcher falha, então a rota inteira é pulada.

Se as suas regras de alerta carregam os labels errados já de início — ou estão sem os labels que as suas rotas usam para casar — corrija isso na origem. O [Prometheus Relabel Tester](/prometheus-relabel-tester) mostra uma prévia exata de quais labels sobrevivem às suas regras de relabel antes mesmo de chegarem à árvore de rotas.

## Bug 3: uma rota catch-all default engole tudo antes da sua rota ser alcançada

Uma rota catch-all do Alertmanager deveria ser uma rede de segurança — o receiver que dispara quando nada mais específico casa. Mas um catch-all posicionado *acima* de um irmão específico, em vez de abaixo dele, vira uma armadilha. Combinado com o primeiro-match-vence, uma regra ampla no topo encobre todas as regras específicas abaixo dela:

```yaml
# Trap: the broad rule above shadows the specific one
routes:
  - receiver: catch-all
    matchers: ['severity=~".*"']   # matches everything
  - receiver: db-pager             # NEVER reached
    match: { service: database }
```

`severity=~".*"` casa com qualquer alerta que tenha um label `severity` (ancorado, mas `.*` cobre o valor inteiro). É o primeiro irmão, então a varredura para por ali — `db-pager` é código morto. O time de banco de dados nunca é acionado.

Há duas formas corretas de pensar sobre um catch-all. Ou coloque as suas rotas específicas primeiro e a ampla por último:

```yaml
# Fix: specific first, broad last
routes:
  - receiver: db-pager
    match: { service: database }
  - receiver: catch-all
    matchers: ['severity=~".*"']
```

Ou confie no catch-all de verdade que você já tem — o próprio `receiver` da rota raiz. Quando nenhuma rota filha casa, a rota em que o alerta está se torna o match terminal e o `receiver` *dela* dispara. A raiz sempre define um `receiver` default, então um alerta que não casa com nenhum filho ainda assim cai em algum lugar:

```yaml
route:
  receiver: 'default-receiver'     # the true catch-all
  group_by: ['alertname']
  routes:
    - receiver: 'team-X-mails'
      match: { team: frontend }
    - receiver: 'team-Y-mails'
      match: { team: backend }
```

Um alerta com `team=platform` não casa com nenhum dos filhos. Ele não dá erro e não desaparece — cai através para `default-receiver`, o catch-all funcionando como pretendido. Os casos de "por que meu alerta não roteou?" geralmente são esses: ele *roteou* sim, direto para o default, porque nenhum filho casou. Se uma rota se resolve para nenhum receiver, isso é uma configuração genuinamente incorreta — o Alertmanager exige que a raiz defina um `receiver` default.

## Bug 4: ordenação das rotas entre irmãos

O Bug 3 é um catch-all engolindo tudo. O Bug 4 é a versão mais sutil e mais geral: entre irmãos, a ordem *sempre* decide qual rota única vence, mesmo quando ambas são específicas. Como apenas o primeiro irmão que casa é escolhido (na ausência de `continue`), dois matchers que se sobrepõem na ordem errada roteiam o alerta para o time errado.

![Um alerta mal roteado: à esquerda, o alerta atinge a árvore de rotas e cai no receiver errado em vermelho porque o continue está ausente; à direita, a árvore corrigida o roteia para o receiver certo em verde](/blog/debug-alertmanager-routing-diagram.svg)

Considere um alerta que é, ao mesmo tempo, um alerta de banco de dados e um alerta do time de backend:

```yaml
# labels: service=database, team=backend, severity=critical
routes:
  - receiver: 'team-Y-pages'      # matches team=backend
    match: { team: backend }
  - receiver: 'team-DB-pages'     # matches service=database
    match: { service: database }
```

Os matchers de ambas as rotas se sustentam contra esse alerta. A ordem desempata: `team-Y-pages` vem primeiro, então vence, e o on-call de banco de dados (`team-DB-pages`) nunca é alcançado. Troque os dois e a rota de banco de dados vence. Nenhum dos matchers está errado — a *ordem* é o bug.

Quando dois irmãos podem legitimamente casar ambos, você tem três opções: colocar primeiro aquele que você quer que vença, tornar os matchers mutuamente exclusivos (adicionar `service!=database` à rota de backend, por exemplo), ou definir `continue: true` no primeiro para que o alerta chegue a ambos. Aninhar também ajuda — um pai casa o caso amplo e o estreita com filhos:

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname']
  routes:
    - receiver: 'web-team'
      match:
        service: web
      group_by: ['alertname', 'instance']
      routes:
        - receiver: 'web-team-pager'
          matchers:
            - severity="critical"
        - receiver: 'web-team-slack'
          matchers:
            - severity=~"warning|info"
```

Um alerta com `service=web` primeiro desce para `web-team`, depois os filhos aninhados escolhem o receiver pela `severity`. Um alerta web com `severity=critical` percorre `root → web-team → web-team-pager`. A descida é explícita, então surpresas de ordem ficam contidas em uma pequena lista de irmãos em vez de se esconderem pela árvore inteira.

## Bug 5: o agrupamento faz um alerta parecer ausente quando ele só está em lote

Às vezes o alerta roteou perfeitamente e você ainda acha que ele está faltando — porque o agrupamento o juntou em lote com outros e a notificação ainda *não* foi enviada. O agrupamento é controlado por `group_by`, `group_wait`, `group_interval` e `repeat_interval`, e todos os quatro são **herdados** árvore abaixo. Um filho que não define o seu próprio carrega o do pai:

```yaml
route:
  group_by: ['alertname', 'cluster']
  group_wait: 30s
  routes:
    - receiver: db-pager
      match: { service: database }
      # no group_by here → INHERITS ['alertname', 'cluster']
```

A folha `db-pager` não tem `group_by` próprio, então herda `['alertname', 'cluster']` e um `group_wait` de 30s da raiz. Duas consequências derrubam as pessoas. Primeira, um novo grupo é retido por `group_wait` antes da sua primeira notificação — então um alerta recém-disparado que "não está acionando" pode estar apenas dentro da sua janela de espera. Segunda, se o `group_by` for grosseiro demais, o seu alerta é dobrado dentro da notificação de um grupo existente e parece que nunca disparou separadamente.

Sobrescreva apenas onde uma subárvore de fato precisa de um agrupamento diferente:

```yaml
route:
  group_by: ['alertname', 'cluster']
  routes:
    - receiver: db-pager
      match: { service: database }
      group_by: ['alertname', 'cluster', 'database']
```

A folha que você está lendo não é necessariamente o agrupamento que se aplica. Sempre resolva o `group_by` *efetivo* — o valor herdado do ancestral mais próximo que o definiu — antes de concluir que um alerta está faltando.

## Teste o roteamento do Alertmanager sem o amtool: percorra a árvore contra os labels do alerta

Você não precisa do `amtool config routes test`, e não precisa dar reload em um Alertmanager ativo para depurar roteamento. O percurso de roteamento é determinístico, então você pode fazê-lo na mão. Pegue os labels exatos do alerta que disparou e percorra a árvore de cima para baixo:

```bash
# The labels the alert actually carries (from the Alertmanager UI or API):
alertname=HighLatency
service=database
team=backend
severity=critical
```

Então, começando pela raiz:

1. **Entre na raiz.** Todo alerta entra — ela é o catch-all. Anote o `receiver` e o `group_by` dela como a baseline de herança.
2. **Varra os filhos de cima para baixo.** Para cada filho, verifique se *todos* os seus matchers se sustentam contra os labels. Lembre-se: regexes são ancorados, e um label ausente é `""`.
3. **Desça para o primeiro match.** A subárvore daquele filho é onde você está agora. Se ele definiu `continue: true`, continue varrendo também os irmãos seguintes — esses se tornam matches adicionais.
4. **Se nenhum filho casa, você terminou.** A rota atual é o match terminal; o `receiver` herdado dela dispara.
5. **Resolva a herança na folha.** O `receiver` e o `group_by` efetivos vêm do ancestral mais próximo que os definiu, não necessariamente da folha.

Faça isso para os labels acima contra a árvore da documentação e você cai em `team-DB-pages` via `service=database`, herdando o `group_by` da raiz. Fazer esse percurso no papel para uma árvore de 40 nós é exatamente o raciocínio propenso a erro que produziu o bug em primeiro lugar — que é a razão inteira de um tester existir.

## Encontre o receiver correspondente agora: um depurador de rotas do Alertmanager no navegador

Quando a árvore tem mais do que alguns nós, percorra-a com o [Alertmanager Route Tester](/alertmanager-route-tester) em vez de fazer isso de cabeça. Cole a sua árvore de rotas — um bloco `route:` isolado ou um `alertmanager.yml` completo, do qual apenas o bloco `route` é lido — e os labels do alerta de exemplo, um `key=value` por linha. Ele reproduz a semântica exatamente: primeiro-match-vence, fan-out com `continue: true`, regexes ancorados, label-ausente-como-string-vazia e herança de agrupamento.

O que você recebe de volta é todo receiver que o alerta alcança, em ordem de avaliação, cada um com o seu breadcrumb de caminho de rota da raiz até o nó que casou, uma tag em qualquer match alcançado somente via `continue`, e o `group_by` efetivo após a herança. É um dry run do despacho — nenhuma notificação é enviada, nada é enviado para fora, e tudo roda no seu navegador, então você pode colar com segurança nomes internos de receivers e labels privados de times.

Uma vez que os labels estejam confirmados como corretos na origem com o [Prometheus Relabel Tester](/prometheus-relabel-tester) e as suas regras estejam comprovadamente disparando com o [AlertLint](/loki-alert-rule-tester), a árvore de rotas é o último salto a acertar. Percorra-a antes que ela acione alguém — e na próxima vez que um alerta chegar ao receiver errado, você vai saber qual nó o mandou para lá.

[Abra o Alertmanager Route Tester →](/alertmanager-route-tester)
