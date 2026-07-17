---
title: "Pruebas unitarias de reglas de alerta de Loki: el vacío que deja promtool"
description: "Prometheus tiene promtool test rules. Loki no tiene nada equivalente. Aquí está por qué importa probar las reglas de alerta LogQL, cómo debería verse una prueba unitaria de una regla de Loki y cómo cerrar el vacío hoy."
pubDate: 2026-04-15
tags: ["loki", "observability", "testing"]
lang: es
translationOf: "unit-testing-loki-alert-rules"
---

![Pruebas unitarias de reglas de alerta de Loki: un bucle de pruebas al estilo de promtool para reglas de alerta LogQL](/blog/unit-testing-loki-alert-rules-hero.svg)

Si ejecutas Prometheus, ya cuentas con una red de seguridad para tu lógica de alertas: `promtool test rules`. Le proporcionas una serie de muestras sintéticas, declaras qué debería dispararse y cuándo, y CI te avisa en el momento en que una refactorización rompe una alerta. Es la diferencia entre detectar una regla de aviso rota en la revisión de código y descubrirla durante un incidente.

Grafana Loki no tiene equivalente. Puedes escribir reglas de alerta y de registro LogQL que se parecen casi idénticas a sus primas de Prometheus, cargarlas en el ruler y enviarlas a producción, pero no hay una forma de primera clase de afirmar que un flujo determinado de logs produce la alerta que esperas. El vacío es real, es de larga data y es exactamente el tipo de cosa que te muerde a las 3&nbsp;a.m.

## Por qué promtool no cubre Loki

El movimiento instintivo es recurrir a `promtool` y apuntarlo a tus reglas de Loki. No funciona, y la razón es fundamental más que cosmética.

`promtool test rules` evalúa PromQL contra una base de datos sintética de **series temporales**. Describes métricas con la sintaxis `series`/`values` y la herramienta las reproduce a través del motor de reglas. Pero una regla de alerta de Loki no parte de métricas, parte de **líneas de log**. Una regla como `count_over_time({app="api"} |= "panic" [5m]) > 0` tiene que ejecutar una canalización LogQL (selector de flujo, filtro de línea, extracción de etiquetas y luego una agregación de métricas) sobre las entradas de log en bruto antes de que exista alguna serie que evaluar. promtool no tiene concepto de un flujo de logs, ni un analizador de LogQL, ni forma de materializar las métricas intermedias como lo hace el motor de consultas de Loki. Darle reglas de Loki o bien arroja un error o bien prueba silenciosamente la cosa equivocada.

Así que la superficie de prueba que importa para Loki —"dadas estas líneas de log, ¿se dispara esta regla LogQL?"— es precisamente la superficie que promtool no puede alcanzar.

![Un bucle de prueba unitaria de una regla de alerta de Loki: flujos de logs sintéticos evaluados en un momento elegido y verificados contra las alertas esperadas](/blog/unit-testing-loki-alert-rules-diagram.svg)

## Por qué esto importa

Las reglas de alerta LogQL son engañosamente fáciles de equivocar de forma sutil:

- Un filtro de línea que coincide con más (o menos) de lo que crees por culpa de una regex sin escapar o un límite de palabra ausente.
- Una etiqueta que aplicas con `unwrap` o `label_format` de forma incorrecta, de modo que la agregación agrupa de la manera equivocada.
- Un rango `[5m]` y una cláusula `for: 10m` que interactúan de modo que la alerta nunca tiene suficientes datos para dispararse, o se dispara mucho más tarde de lo previsto.
- Una regla de registro cuya serie de salida cambia silenciosamente de etiquetas tras una edición de la canalización, rompiendo cada alerta posterior que la selecciona.

Ninguno de estos se detecta con linting de YAML ni con una comprobación de esquema. Son errores **de comportamiento**, y la única forma honesta de detectarlos es ejecutar la regla contra una entrada representativa y afirmar sobre la salida. Sin un arnés de pruebas, esa verificación ocurre manualmente, con poca frecuencia y normalmente después de que algo ya haya paginado al equipo equivocado, o haya fallado en paginar al correcto.

## Cómo debería verse una prueba unitaria de una regla de Loki

El modelo que estableció promtool es el correcto; solo necesita una entrada con forma de log. En lugar de series sintéticas, una prueba de regla de Loki debería aceptar **flujos** sintéticos (un conjunto de etiquetas más líneas de log con marca de tiempo), evaluar la regla en un momento elegido y afirmar sobre las alertas producidas, algo así:

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

La regla bajo prueba es la misma regla que envías al ruler:

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

Leídas en conjunto, la prueba dice: dadas dos líneas de panic en la ventana de cinco minutos previa a las `10:05`, la expresión `count_over_time(...) > 1` debería ser verdadera, y el ruler debería emitir una alerta `PanicDetected` que lleve `severity=critical` y las etiquetas `app`/`env` del flujo. Cambia la entrada a una sola línea de panic, o mueve una entrada fuera de la ventana `[5m]`, y `exp_alerts` queda vacío: la prueba ahora protege tanto el caso de disparo como el de no disparo.

Esta es la forma que cada equipo que la ha pedido en el rastreador de Loki sigue describiendo; consulta las solicitudes de larga data en los issues de Loki [#7655](https://github.com/grafana/loki/issues/7655) y [#16659](https://github.com/grafana/loki/issues/16659), donde la comunidad ha señalado repetidamente que una prueba unitaria al estilo de promtool para reglas LogQL simplemente todavía no existe.

## Cerrar el vacío hoy

No tienes que esperar a que el proyecto upstream lance esto. **AlertLint** ejecuta exactamente este bucle de pruebas en tu navegador: pega tus reglas de alerta y de registro de Loki, define `input_streams`, declara tus `exp_alerts` y afirma el éxito o el fallo antes de que la regla llegue siquiera al ruler. Todo se evalúa del lado del cliente —tus reglas y logs nunca salen del dispositivo— de modo que puedes integrarlo en la revisión sin tocar la infraestructura ni enviar datos a ningún lugar.

Si alguna vez has enviado una alerta de Loki y has cruzado los dedos esperando que funcionara, este es el paso que falta.

[Prueba AlertLint — el probador de reglas de alerta de Loki →](/loki-alert-rule-tester/)
