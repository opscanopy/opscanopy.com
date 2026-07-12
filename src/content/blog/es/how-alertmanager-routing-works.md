---
title: "Cómo funciona el enrutamiento de Alertmanager: matchers, continue y el árbol de rutas"
description: "Un modelo mental claro del enrutamiento de Alertmanager — el árbol de rutas, los matchers, el flag continue, la agrupación y la herencia de receiver — para que sepas exactamente a dónde va cada alerta."
pubDate: 2026-06-17
tags: ["alertmanager","observability","alerting"]
lang: es
translationOf: "how-alertmanager-routing-works"
relatedTool:
  name: "Alertmanager Route Tester"
  href: "/alertmanager-route-tester"
---

![Diagrama del enrutamiento de Alertmanager: las labels de una alerta entran en el árbol de rutas por la raíz y descienden por las rutas hijas coincidentes hasta llegar a un receiver](/blog/how-alertmanager-routing-works-hero.svg)

Anoche se disparó una alerta `severity=critical` y al equipo de guardia nunca le llegó el aviso. La alerta era real, el receiver existía, el webhook de Slack funcionaba. El problema estaba tres líneas más arriba en la configuración: una ruta catch-all demasiado amplia se situaba por encima de la ruta del equipo y se tragaba en silencio todo lo que llegaba hasta ella. Nadie tocó el receiver — tocaron el orden.

Eso es lo que hace que el enrutamiento de Alertmanager sea fácil de equivocar. Los receivers suelen estar bien. Es en el árbol de rutas donde viven las sorpresas. Una vez que tienes un modelo preciso de cómo se recorre el árbol de rutas — cómo se evalúan los matchers, cuándo `continue` mantiene a una alerta en movimiento y qué hereda cada hijo de su padre — la pregunta "¿por qué fue esta alerta ahí?" deja de ser un juego de adivinanzas. Este post construye ese modelo, y cada regla que aparece aquí coincide con lo que el [Alertmanager Route Tester](/alertmanager-route-tester) hace realmente cuando recorre un árbol frente a una alerta de ejemplo.

## El enrutamiento es un árbol, no una lista

La lectura errónea más habitual de una configuración de Alertmanager es tratar `routes:` como una lista plana de reglas contra las que se comprueba cada alerta. No es una lista. Es un árbol, y cada alerta entra por el mismo sitio: la ruta raíz.

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

La ruta raíz es especial: se entra en ella para **todas** las alertas, sin importar sus propios matchers. Es el catch-all. Su `receiver` es el receiver por defecto en el que aterriza una alerta cuando nada más específico coincide, y sus campos de agrupación son la base que todo lo que está por debajo hereda. Dentro de la raíz hay una lista `routes:` — sus hijos. Cada hijo puede tener su propio `routes:`, y así sucesivamente hacia abajo. Una alerta desciende desde la raíz a través de los hijos que coincidan, y el receiver en el que acaba es el del nodo donde se detiene el descenso.

Así que cuando leas un `alertmanager.yml`, no recorras la lista de rutas buscando la regla que coincide. Empieza por la raíz y desciende. El árbol de rutas de Alertmanager es un árbol de decisión que trazas de arriba abajo, en profundidad.

## Cómo coincide una ruta: la sintaxis de matchers (y los antiguos match/match_re)

Un nodo de ruta coincide con una alerta cuando **todos** sus propios matchers se cumplen frente a las labels de la alerta. Un AND lógico, sin excepciones. Un nodo sin matchers siempre coincide. Hay tres maneras de declarar esos matchers de Alertmanager, y verás las tres en configuraciones reales.

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

La forma moderna `matchers:` lleva su operador en línea. Hay cuatro: `=` (igual), `!=` (distinto), `=~` (coincidencia regex) y `!~` (no coincidencia regex). Los valores pueden ir entre comillas o sin ellas. Las dos formas antiguas son azúcar sintáctico sobre el mismo motor — `match:` es un conjunto de matchers `=`, y `match_re:` es un conjunto de matchers `=~`.

Hay dos detalles que confunden constantemente a la gente:

- **Las regexes están totalmente ancladas.** Alertmanager envuelve cada patrón `=~`, `!~` y `match_re` como `^(?:…)$`. Así que `env=~"staging"` coincide con el valor `staging` y nada más — `env=staging-eu` **no** coincide. Tienes que escribir `env=~"staging-.*"` para cubrir el resto del valor. Esta es la causa más frecuente de "mi ruta no coincide con nada".
- **Una label ausente es la cadena vacía.** Alertmanager compara una label ausente como `""`. Así que `foo=""` coincide con una alerta que no tiene ninguna label `foo`, y `foo!=""` exige que `foo` esté presente y no vacía. Útil, y a veces sorprendente.

Conseguir que esas labels lleguen a la alerta en primer lugar es una tarea aparte que ocurre en el momento del scrape — si la label que comprueba tu matcher nunca se asignó, rastréala hasta tu configuración de scrape con el [Prometheus Relabel Tester](/prometheus-relabel-tester) antes de echarle la culpa al árbol de rutas.

![Ilustración: una alerta entrante desciende por el árbol de rutas de Alertmanager desde la ruta raíz hacia rutas hijas con matchers y continue: true, hasta aterrizar en la ruta coincidente](/blog/in-content/how-alertmanager-routing-works.webp)

## Coincidencia en profundidad y continue: gana el primer hermano que coincide, salvo que continue sea true

Esta es la regla que rompió el ejemplo de la madrugada. Dentro de una ruta coincidente, las rutas hijas se evalúan **en orden, de arriba abajo**. La alerta desciende al **primer** hijo cuyos matchers se cumplan todos — y entonces, por defecto, el barrido de hermanos **se detiene**. Los hermanos posteriores ni siquiera se comprueban.

```yaml
# TRAP: the broad rule above shadows the specific one
routes:
  - receiver: catch-all
    matchers: ['severity=~".*"']   # matches everything
  - receiver: db-pager             # NEVER reached
    match: { service: database }
```

Una alerta `service=database, severity=critical` llega primero a `catch-all`, esa coincidencia detiene el barrido, y `db-pager` es código muerto. La solución es ordenar lo específico antes que lo amplio, o bien poner `continue: true`.

`continue: true` en una ruta coincidente le indica a Alertmanager que **no** detenga el barrido de hermanos después de que esa ruta coincida. La evaluación sigue hacia los hermanos posteriores, cada uno de los cuales también puede coincidir. Esa es la única manera de que una sola alerta aterrice en más de un receiver.

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

Para una alerta `team=backend, severity=critical`, la primera ruta coincide y normalmente detendría el barrido — pero `continue: true` la mantiene viva, la segunda ruta también coincide, y se disparan **ambos** receivers. Quita el `continue` y solo se dispara `all-critical-audit`; el equipo nunca se entera.

El recorrido es en profundidad: cuando un hijo coincide, la alerta desciende al subárbol *de ese hijo* y se resuelve ahí antes de que cualquier `continue` la lleve al siguiente hermano. El Alertmanager Route Tester etiqueta cada receiver al que se llegó únicamente porque un hermano anterior puso `continue: true`, para que veas de un vistazo qué coincidencias son la ruta principal y cuáles son fan-out.

## Agrupación: group_by, group_wait, group_interval, repeat_interval

El enrutamiento decide *a dónde* va una alerta. La agrupación decide *cómo* se agrupan y se acompasan sus notificaciones una vez que llega. Cuatro campos la controlan, y viven en los nodos de ruta justo al lado de los matchers.

```yaml
route:
  receiver: 'default-receiver'
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 30s          # wait this long to collect more alerts for a new group
  group_interval: 5m       # then wait this long before sending updates to that group
  repeat_interval: 4h      # re-send an unresolved group no more often than this
```

- **`group_by`** es la lista de labels que define un grupo. Las alertas que comparten los mismos valores para esas labels se agrupan en una única notificación. Un caso especial habitual es `group_by: ['...']`, que agrupa por *todas* las labels (cada alerta distinta es su propio grupo), mientras que la ausencia de agrupación agrega todo en un único grupo.
- **`group_wait`** es cuánto tiempo retiene Alertmanager un grupo recién creado antes de enviar la primera notificación, para que una ráfaga de alertas relacionadas llegue como un solo aviso en lugar de veinte.
- **`group_interval`** es el intervalo mínimo antes de que envíe una notificación *actualizada* para un grupo que ya se disparó (por ejemplo, cuando una nueva alerta se une al grupo).
- **`repeat_interval`** es cada cuánto vuelve a notificar sobre un grupo que sigue activo y sin resolver.

Estos son la diferencia entre un único aviso útil y una tormenta de alertas. Y, fundamental — se heredan.

## Herencia: las rutas hijas heredan receiver y group_by del padre

Una ruta hija no tiene por qué repetir el receiver ni la agrupación que quiere. Todo lo que **no** define se hereda del ancestro más cercano que sí lo hizo. Esto es por campo: un hijo puede sobrescribir `group_by` mientras sigue heredando `group_wait`, `group_interval`, `repeat_interval` e incluso `receiver`.

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

![Un árbol de rutas de Alertmanager con una ruta raíz que se ramifica en rutas hijas etiquetadas por sus matchers, las hojas son receivers, y una alerta de ejemplo desciende por la ruta coincidente que aparece resaltada, con una rama marcada con continue true](/blog/how-alertmanager-routing-works-diagram.svg)

El nodo más profundo de ese árbol no define ni un receiver ni un `group_by`, y sin embargo una alerta `service=database, severity=critical` que llega hasta él avisa a `team-DB-pages` y agrupa por `[alertname, cluster, database]` — ambos arrastrados a lo largo de la cadena. Por eso la hoja que estás mirando puede no contar toda la historia: el receiver y la agrupación efectivos se ensamblan subiendo *hacia arriba* desde el nodo coincidente hasta el primer ancestro que definió cada campo. Cuando depures una alerta mal enrutada o mal agrupada, resuelve la herencia, no solo la hoja.

## Leer un árbol de rutas real: dónde aterriza una alerta dada

Júntalo todo. Aquí tienes un árbol completo con tres hijos en el nivel superior y un subárbol anidado bajo uno de ellos.

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

Ahora traza una alerta con estas labels:

```bash
alertname=Latency
service=web
severity=critical
instance=web-3
```

Recorriendo el árbol, en profundidad y en orden:

1. Se entra en la **raíz** (siempre). No se detiene aquí; tiene hijos que evaluar.
2. Primer hijo, `all-critical-audit`: `severity="critical"` se cumple. Coincide → se dispara `all-critical-audit`. Tiene `continue: true`, así que el barrido **no** se detiene.
3. Segundo hijo, `web-team`: `service: web` se cumple. La alerta desciende a su subárbol.
   - Primer nieto, `web-team-pager`: `severity="critical"` se cumple → se dispara `web-team-pager`. No tiene `continue`, así que esta rama se detiene aquí. El `group_by` efectivo es `[alertname, instance]`, heredado de `web-team`.
4. La coincidencia de `web-team` (una coincidencia sin `continue`) detiene el barrido del nivel superior, así que `team-Y-mails` nunca se evalúa.

Resultado final: la alerta llega a **dos** receivers — `all-critical-audit` (vía `continue`) y `web-team-pager` (la ruta principal). Cambia `severity` a `warning` y el panorama cambia: `all-critical-audit` queda fuera, y dentro de `web-team` la alerta cae en `web-team-slack` en su lugar. Quita `service=web` y nunca entra en ese subárbol, cayendo hasta `team-Y-mails` si `team=backend`, o hasta el `default-receiver` de la raíz si nada coincide.

Si tus propias reglas de alerta no se están disparando como esperas — labels equivocadas, severidad equivocada, momento equivocado — eso está aguas arriba del enrutamiento por completo; comprueba primero la regla con [AlertLint](/loki-alert-rule-tester), y luego traza dónde aterriza su salida aquí.

## Pon a prueba tu árbol

Puedes hacer este recorrido a mano, y para un árbol de tres nodos vale la pena hacerlo una vez para interiorizar el modelo. Pero los árboles reales se anidan cinco niveles de profundidad, mezclan `match`, `match_re` y `matchers`, y reparten `continue` entre los hermanos — y el coste de equivocarse es un SEV-1 que no avisa a nadie, o un warning rutinario que despierta a todo el equipo.

Así que haz que comprobarlo sea barato. Pega tu árbol de rutas y las labels de una alerta de ejemplo en el [Alertmanager Route Tester](/alertmanager-route-tester) y hará exactamente el recorrido de arriba — íntegramente en tu navegador, sin subir nada. Informa de cada receiver al que llega la alerta en orden de evaluación, la miga de pan de la ruta desde la raíz hasta cada nodo coincidente, una etiqueta en cualquier receiver alcanzado solo vía `continue: true`, y el `group_by` efectivo tras la herencia. Reproduce la semántica que describe este post: regexes ancladas, label-ausente-como-cadena-vacía, primera-coincidencia-luego-`continue`, y herencia por campo.

La próxima vez que una alerta aterrice en un lugar inesperado, no tendrás que disparar una de verdad y quedarte mirando. Pega el árbol, pega las labels, y lee la ruta que realmente tomó.
