---
title: "Testes unitários de regras de alerta do Loki: a lacuna que o promtool deixa"
description: "O Prometheus tem o promtool test rules. O Loki não tem nada equivalente. Veja por que testar regras de alerta em LogQL importa, como deveria ser um teste unitário de regra do Loki e como fechar essa lacuna hoje."
pubDate: 2026-04-15
tags: ["loki", "observability", "testing"]
lang: pt-br
translationOf: "unit-testing-loki-alert-rules"
---

![Testes unitários de regras de alerta do Loki: um loop de teste no estilo do promtool para regras de alerta em LogQL](/blog/unit-testing-loki-alert-rules-hero.svg)

Se você roda o Prometheus, já tem uma rede de segurança para a sua lógica de alertas: `promtool test rules`. Você alimenta a ferramenta com uma série de amostras sintéticas, declara o que deve disparar e quando, e a CI avisa no instante em que uma refatoração quebra um alerta. É a diferença entre pegar uma regra de paginação quebrada na revisão de código e descobri-la durante um incidente.

O Grafana Loki não tem equivalente. Você pode escrever regras de alerta e de gravação em LogQL que parecem quase idênticas às suas primas do Prometheus, carregá-las no ruler e colocá-las em produção — mas não há uma forma de primeira classe para afirmar que um determinado fluxo de logs produz o alerta que você espera. A lacuna é real, é antiga e é exatamente o tipo de coisa que te morde às 3&nbsp;da manhã.

## Por que o promtool não cobre o Loki

O movimento instintivo é recorrer ao `promtool` e apontá-lo para as suas regras do Loki. Não funciona, e o motivo é fundamental, não cosmético.

O `promtool test rules` avalia PromQL contra um banco de dados sintético de **séries temporais**. Você descreve métricas com a sintaxe `series`/`values` e a ferramenta as reproduz através do mecanismo de regras. Mas uma regra de alerta do Loki não parte de métricas — ela parte de **linhas de log**. Uma regra como `count_over_time({app="api"} |= "panic" [5m]) > 0` precisa executar um pipeline LogQL (seletor de stream, filtro de linha, extração de labels e, então, uma agregação de métrica) sobre entradas de log brutas antes que exista qualquer série a ser avaliada. O promtool não tem conceito de um stream de logs, não tem parser de LogQL e não tem como materializar as métricas intermediárias da forma que o mecanismo de consultas do Loki faz. Alimentá-lo com regras do Loki ou gera erro ou, silenciosamente, testa a coisa errada.

Portanto, a superfície de teste que importa para o Loki — "dadas estas linhas de log, esta regra LogQL dispara?" — é precisamente a superfície que o promtool não consegue alcançar.

![Um loop de teste unitário de regra de alerta do Loki: streams de log sintéticos avaliados em um momento escolhido e verificados contra os alertas esperados](/blog/unit-testing-loki-alert-rules-diagram.svg)

## Por que isso importa

Regras de alerta em LogQL são enganosamente fáceis de errar de formas sutis:

- Um filtro de linha que casa com mais (ou menos) do que você imagina por causa de um regex sem escape ou de um limite de palavra ausente.
- Uma label que você usa em `unwrap` ou `label_format` incorretamente, de modo que a agregação agrupa da maneira errada.
- Um intervalo `[5m]` e uma cláusula `for: 10m` que interagem de tal forma que o alerta nunca tem dados suficientes para disparar, ou dispara muito mais tarde do que o pretendido.
- Uma regra de gravação cuja série de saída muda silenciosamente de labels após uma edição no pipeline, quebrando todo alerta a jusante que seleciona sobre ela.

Nenhum desses problemas é capturado por linting de YAML ou por uma verificação de schema. São bugs **comportamentais**, e a única forma honesta de pegá-los é rodar a regra contra uma entrada representativa e afirmar sobre a saída. Sem um harness de testes, essa verificação acontece manualmente, com pouca frequência e, geralmente, depois que algo já paginou a equipe errada — ou deixou de paginar a equipe certa.

## Como deveria ser um teste unitário de regra do Loki

O modelo que o promtool estabeleceu é o correto; ele só precisa de uma entrada no formato de log. Em vez de séries sintéticas, um teste de regra do Loki deveria aceitar **streams** sintéticos (um conjunto de labels mais linhas de log com timestamp), avaliar a regra em um momento escolhido e afirmar sobre os alertas produzidos — algo assim:

```yaml
# loki-rule-tests.yaml
tests:
  - name: panic in api logs fires PanicDetected
    # Synthetic log streams replayed through the LogQL engine.
    input_streams:
      - labels: '{app="api", env="prod"}'
        entries:
          - { ts: "2026-06-08T10:00:30Z", line: "level=info msg=ok" }
          - { ts: "2026-06-08T10:01:10Z", line: "level=error msg=panic: nil map" }
          - { ts: "2026-06-08T10:02:40Z", line: "level=error msg=panic: nil map" }

    # Evaluate the rule group at this instant.
    eval_time: 2026-06-08T10:05:00Z

    alert_rule_test:
      - alertname: PanicDetected
        # What we expect the ruler to emit at eval_time.
        exp_alerts:
          - exp_labels:
              app: api
              env: prod
              severity: critical
            exp_annotations:
              summary: "Panic detected in api"
```

A regra sob teste é a mesma regra que você coloca em produção no ruler:

```yaml
groups:
  - name: api-alerts
    rules:
      - alert: PanicDetected
        expr: |
          count_over_time({app="api", env="prod"} |= "panic" [5m]) > 1
        for: 0m
        labels:
          severity: critical
        annotations:
          summary: "Panic detected in {{ $labels.app }}"
```

Lidos em conjunto, o teste diz: dadas duas linhas de panic na janela de cinco minutos anterior a `10:05`, a expressão `count_over_time(...) > 1` deve ser verdadeira, e o ruler deve emitir um alerta `PanicDetected` carregando `severity=critical` e as labels `app`/`env` do stream. Inverta a entrada para uma única linha de panic, ou mova uma entrada para fora da janela `[5m]`, e `exp_alerts` fica vazio — o teste agora protege tanto o caso de disparo quanto o de não disparo.

Esse é o formato que toda equipe que o pediu no rastreador do Loki vem descrevendo — veja os pedidos de longa data nas issues do Loki [#7655](https://github.com/grafana/loki/issues/7655) e [#16659](https://github.com/grafana/loki/issues/16659), onde a comunidade apontou repetidamente que um teste unitário no estilo do promtool para regras LogQL simplesmente ainda não existe.

## Fechando a lacuna hoje

Você não precisa esperar o upstream entregar isso. O **AlertLint** roda exatamente esse loop de teste no seu navegador: cole suas regras de alerta e de gravação do Loki, defina `input_streams`, declare seus `exp_alerts` e afirme passou ou falhou antes que a regra chegue ao ruler. Tudo é avaliado no lado do cliente — suas regras e logs nunca saem do dispositivo — então você pode integrá-lo à revisão sem tocar na infraestrutura nem enviar dados a lugar algum.

Se você já colocou um alerta do Loki em produção e torceu para que funcionasse, este é o passo que estava faltando.

[Experimente o AlertLint — o testador de regras de alerta do Loki →](/loki-alert-rule-tester)
