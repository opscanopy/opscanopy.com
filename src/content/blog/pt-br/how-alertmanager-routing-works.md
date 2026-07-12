---
title: "Como funciona o roteamento do Alertmanager: matchers, continue e a árvore de rotas"
description: "Um modelo mental claro para o roteamento do Alertmanager — a árvore de rotas, os matchers, a flag continue, o agrupamento e a herança de receivers — para você saber exatamente para onde cada alerta vai."
pubDate: 2026-06-17
tags: ["alertmanager","observability","alerting"]
lang: pt-br
translationOf: "how-alertmanager-routing-works"
relatedTool:
  name: "Alertmanager Route Tester"
  href: "/alertmanager-route-tester"
---

![Diagrama do roteamento do Alertmanager: os labels de um alerta entram na árvore de rotas pela raiz e descem pelas rotas filhas correspondentes até chegar a um receiver](/blog/how-alertmanager-routing-works-hero.svg)

Um alerta `severity=critical` disparou ontem à noite e o time de plantão nunca foi acionado. O alerta era real, o receiver existia, o webhook do Slack funcionava. O problema estava três linhas acima na configuração: uma rota catch-all abrangente ficava acima da rota do time e engolia silenciosamente tudo que chegava até ela. Ninguém mexeu no receiver — mexeram na ordem.

É isso que torna o roteamento do Alertmanager tão fácil de errar. Os receivers geralmente estão corretos. É na árvore de rotas que moram as surpresas. Quando você tem um modelo preciso de como a árvore de rotas é percorrida — como os matchers são avaliados, quando o `continue` mantém um alerta em movimento e o que cada filho herda do seu pai — "por que esse alerta foi parar ali?" deixa de ser um jogo de adivinhação. Este post constrói esse modelo, e cada regra aqui corresponde ao que o [Alertmanager Route Tester](/alertmanager-route-tester) realmente faz quando percorre uma árvore com um alerta de exemplo.

## Roteamento é uma árvore, não uma lista

A leitura equivocada mais comum de uma configuração do Alertmanager é tratar `routes:` como uma lista plana de regras contra as quais cada alerta é verificado. Não é uma lista. É uma árvore, e todo alerta entra no mesmo lugar: a rota raiz.

```yaml
route:
  receiver: 'default-receiver'        # the root — the catch-all
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:                              # child routes
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

A rota raiz é especial: ela é acessada por **todos** os alertas, independentemente dos seus próprios matchers. É a catch-all. Seu `receiver` é o destino padrão onde um alerta cai quando nada mais específico corresponde, e seus campos de agrupamento são a base que tudo abaixo herda. Dentro da raiz fica uma lista `routes:` — seus filhos. Cada filho pode ter seu próprio `routes:`, e assim por diante árvore abaixo. Um alerta desce a partir da raiz por meio de qualquer filho que corresponda, e o receiver no qual ele acaba é o do nó onde a descida para.

Então, quando você ler um `alertmanager.yml`, não percorra a lista de rotas procurando a regra que corresponde. Comece na raiz e desça. A árvore de rotas do Alertmanager é uma árvore de decisão que você percorre de cima para baixo, em profundidade.

## Como uma rota corresponde: a sintaxe matchers (e os antigos match/match_re)

Um nó de rota corresponde a um alerta quando **todos** os seus próprios matchers se aplicam aos labels do alerta. AND lógico, sem exceções. Um nó sem matchers sempre corresponde. Há três formas de declarar esses matchers do Alertmanager, e você verá as três em configurações reais.

```yaml
routes:
  # Modern matchers: syntax — preferred. One operator per line.
  - receiver: 'staging-slack'
    matchers:
      - env=~"staging-.*"      # =~ regex
      - severity!="info"       # != inequality

  # Older match: exact string equality on each key.
  - receiver: 'team-X-mails'
    match:
      team: frontend

  # Older match_re: each value is a regex.
  - receiver: 'prod-pager'
    match_re:
      env: 'prod-.*'
```

A forma moderna `matchers:` carrega o operador inline. São quatro: `=` (igual a), `!=` (diferente de), `=~` (regex corresponde) e `!~` (regex não corresponde). Os valores podem estar entre aspas ou sem aspas. As duas formas mais antigas são açúcar sintático sobre o mesmo mecanismo — `match:` é um conjunto de matchers `=`, e `match_re:` é um conjunto de matchers `=~`.

Dois detalhes confundem as pessoas o tempo todo:

- **As regexes são totalmente ancoradas.** O Alertmanager envolve todo padrão `=~`, `!~` e `match_re` como `^(?:…)$`. Então `env=~"staging"` corresponde ao valor `staging` e a mais nada — `env=staging-eu` **não** corresponde. Você precisa escrever `env=~"staging-.*"` para cobrir o restante do valor. Essa é a causa mais frequente de "minha rota não corresponde a nada".
- **Um label ausente é a string vazia.** O Alertmanager compara um label ausente como `""`. Então `foo=""` corresponde a um alerta que não tem nenhum label `foo`, e `foo!=""` exige que `foo` esteja presente e não vazio. Útil e, de vez em quando, surpreendente.

Colocar esses labels no alerta em primeiro lugar é um trabalho à parte, que acontece no momento do scrape — se o label que seu matcher verifica nunca foi definido, rastreie de volta até a sua configuração de scrape com o [Prometheus Relabel Tester](/prometheus-relabel-tester) antes de culpar a árvore de rotas.

![Ilustração: um alerta de entrada desce pela árvore de rotas do Alertmanager, da rota raiz para rotas filhas com matchers e continue: true, até cair na rota correspondente](/blog/in-content/how-alertmanager-routing-works.webp)

## Correspondência em profundidade e continue: o primeiro irmão correspondente vence, a menos que continue seja true

Aqui está a regra que o exemplo da madrugada quebrou. Dentro de uma rota correspondente, as rotas filhas são avaliadas **em ordem, de cima para baixo**. O alerta desce para o **primeiro** filho cujos matchers se aplicam por completo — e então, por padrão, a varredura dos irmãos **para**. Os irmãos seguintes nem chegam a ser verificados.

```yaml
# TRAP: the broad rule above shadows the specific one
routes:
  - receiver: catch-all
    matchers: ['severity=~".*"']   # matches everything
  - receiver: db-pager             # NEVER reached
    match: { service: database }
```

Um alerta `service=database, severity=critical` atinge `catch-all` primeiro, essa correspondência para a varredura, e `db-pager` vira código morto. A correção é ou ordenar do específico para o abrangente, ou definir `continue: true`.

`continue: true` em uma rota correspondente diz ao Alertmanager para **não** parar a varredura dos irmãos depois que aquela rota corresponde. A avaliação prossegue para os irmãos seguintes, cada um dos quais também pode corresponder. Essa é a única maneira de um único alerta cair em mais de um receiver.

```yaml
# Mirror every critical alert to an audit receiver,
# THEN keep routing so the owning team is still paged.
routes:
  - receiver: all-critical-audit
    matchers: ['severity="critical"']
    continue: true               # <- do not stop here
  - receiver: team-backend
    match: { team: backend }
```

Para um alerta `team=backend, severity=critical`, a primeira rota corresponde e normalmente pararia a varredura — mas `continue: true` a mantém viva, a segunda rota também corresponde, e **ambos** os receivers disparam. Remova o `continue` e apenas `all-critical-audit` dispara; o time nunca fica sabendo.

A varredura é em profundidade: quando um filho corresponde, o alerta desce para a subárvore *daquele filho* e se resolve ali antes que qualquer `continue` o leve ao próximo irmão. O Alertmanager Route Tester marca cada receiver que foi alcançado apenas porque um irmão anterior definiu `continue: true`, para que você veja num relance quais correspondências são o caminho principal e quais são fan-out.

## Agrupamento: group_by, group_wait, group_interval, repeat_interval

O roteamento decide *para onde* um alerta vai. O agrupamento decide *como* suas notificações são agrupadas e ritmadas depois que ele chega lá. Quatro campos controlam isso, e eles ficam nos nós de rota, lado a lado com os matchers.

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 30s          # wait this long to collect more alerts for a new group
  group_interval: 5m       # then wait this long before sending updates to that group
  repeat_interval: 4h      # re-send an unresolved group no more often than this
```

- **`group_by`** é a lista de labels que define um grupo. Alertas que compartilham os mesmos valores para esses labels são reunidos em uma única notificação. Um caso especial comum é `group_by: ['...']`, que agrupa por *todos* os labels (cada alerta distinto é seu próprio grupo), e a ausência de agrupamento junta tudo em um único grupo.
- **`group_wait`** é por quanto tempo o Alertmanager segura um grupo recém-criado antes de enviar a primeira notificação, para que uma rajada de alertas relacionados chegue como um único acionamento em vez de vinte.
- **`group_interval`** é o intervalo mínimo antes de ele enviar uma notificação *atualizada* para um grupo que já disparou (por exemplo, quando um novo alerta entra no grupo).
- **`repeat_interval`** é com que frequência ele renotifica sobre um grupo que ainda está disparando e não resolvido.

Esses campos fazem a diferença entre um único acionamento útil e uma tempestade de alertas. E, crucialmente — eles são herdados.

## Herança: rotas filhas herdam receiver e group_by do pai

Uma rota filha não precisa repetir o receiver e o agrupamento que deseja. Tudo que ela **não** define é herdado do ancestral mais próximo que definiu. Isso é por campo: um filho pode sobrescrever `group_by` enquanto ainda herda `group_wait`, `group_interval`, `repeat_interval` e até `receiver`.

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname', 'cluster']
  group_wait: 30s
  repeat_interval: 4h
  routes:
    - receiver: 'team-DB-pages'
      match:
        service: database
      group_by: ['alertname', 'cluster', 'database']
      # group_wait and repeat_interval are INHERITED from the root:
      #   group_wait: 30s, repeat_interval: 4h
      routes:
        - match:
            severity: critical
          # No receiver set here, so it INHERITS 'team-DB-pages'.
          # No group_by set, so it INHERITS [alertname, cluster, database].
```

![Uma árvore de rotas do Alertmanager com uma rota raiz que se ramifica em rotas filhas rotuladas por matchers, as folhas são receivers, e um alerta de exemplo desce pelo caminho correspondente, que aparece destacado, com um ramo marcado com continue true](/blog/how-alertmanager-routing-works-diagram.svg)

O nó mais profundo dessa árvore não define nem um receiver nem `group_by`, mas um alerta `service=database, severity=critical` que chega até ele aciona `team-DB-pages` e agrupa por `[alertname, cluster, database]` — ambos puxados pela cadeia. É por isso que a folha que você está olhando pode não contar a história toda: o receiver e o agrupamento efetivos são montados percorrendo *para cima* a partir do nó correspondente até o primeiro ancestral que definiu cada campo. Quando você for depurar um alerta mal roteado ou mal agrupado, resolva a herança, não apenas a folha.

## Lendo uma árvore de rotas real: onde um determinado alerta cai

Juntando tudo. Aqui está uma árvore completa com três filhos no nível superior e uma subárvore aninhada sob um deles.

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname']
  group_wait: 30s
  repeat_interval: 4h
  routes:
    - receiver: 'all-critical-audit'
      matchers:
        - severity="critical"
      continue: true                 # mirror, then keep going
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
    - receiver: 'team-Y-mails'
      match:
        team: backend
```

Agora rastreie um alerta com estes labels:

```bash
alertname=Latency
service=web
severity=critical
instance=web-3
```

Percorrendo a árvore, em profundidade, em ordem:

1. A **raiz** é acessada (sempre). Ela não para aqui; tem filhos para avaliar.
2. Primeiro filho, `all-critical-audit`: `severity="critical"` se aplica. Corresponde → `all-critical-audit` dispara. Tem `continue: true`, então a varredura **não** para.
3. Segundo filho, `web-team`: `service: web` se aplica. O alerta desce para sua subárvore.
   - Primeiro neto, `web-team-pager`: `severity="critical"` se aplica → `web-team-pager` dispara. Sem `continue`, então este ramo para aqui. O `group_by` efetivo é `[alertname, instance]`, herdado de `web-team`.
4. A correspondência de `web-team` (uma correspondência sem `continue`) para a varredura do nível superior, então `team-Y-mails` nunca é avaliado.

Resultado final: o alerta alcança **dois** receivers — `all-critical-audit` (via `continue`) e `web-team-pager` (o caminho principal). Mude `severity` para `warning` e o quadro muda: `all-critical-audit` sai de cena, e dentro de `web-team` o alerta cai em `web-team-slack`. Remova `service=web` e ele nunca entra naquela subárvore, caindo em `team-Y-mails` se `team=backend`, ou no `default-receiver` da raiz se nada corresponder.

Se as suas próprias regras de alerta não estiverem disparando como você espera — labels errados, severidade errada, timing errado — isso é a montante do roteamento por completo; comprove a regra primeiro com o [AlertLint](/loki-alert-rule-tester) e depois rastreie onde a saída dela cai aqui.

## Teste sua árvore

Você pode fazer esse percurso à mão e, para uma árvore de três nós, vale a pena fazer uma vez para internalizar o modelo. Mas árvores reais aninham cinco níveis de profundidade, misturam `match`, `match_re` e `matchers`, e espalham `continue` entre os irmãos — e o custo de errar é um SEV-1 que não aciona ninguém, ou um warning rotineiro que acorda o time inteiro.

Então torne barato verificar. Cole sua árvore de rotas e os labels de um alerta de exemplo no [Alertmanager Route Tester](/alertmanager-route-tester) e ele faz exatamente o percurso acima — inteiramente no seu navegador, sem nada enviado. Ele relata cada receiver que o alerta alcança na ordem de avaliação, o breadcrumb do caminho da rota desde a raiz até cada nó correspondente, uma marca em qualquer receiver alcançado apenas via `continue: true`, e o `group_by` efetivo após a herança. Ele reproduz a semântica que este post descreve: regexes ancoradas, label-ausente-como-string-vazia, primeira-correspondência-depois-`continue`, e herança por campo.

Na próxima vez que um alerta cair em um lugar inesperado, você não precisa disparar um de verdade e ficar observando. Cole a árvore, cole os labels e leia o caminho que ele de fato percorreu.
