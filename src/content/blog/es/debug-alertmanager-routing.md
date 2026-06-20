---
title: "¿Por qué mi alerta no llega al receiver correcto? Cómo depurar el enrutamiento de Alertmanager"
description: "¿Las alertas van al receiver equivocado, o a ninguno? Depura el enrutamiento de Alertmanager: gana la primera coincidencia, el continue ausente, las regex de matcher y los valores por defecto catch-all."
pubDate: 2026-06-18
tags: ["alertmanager","observability","alerting"]
lang: es
translationOf: "debug-alertmanager-routing"
relatedTool:
  name: "Alertmanager Route Tester"
  href: "/alertmanager-route-tester"
---

![Depuración del enrutamiento de Alertmanager: una alerta con labels recorriendo un árbol de rutas para encontrar el receiver correcto en lugar del equivocado](/blog/debug-alertmanager-routing-hero.svg)

Desplegaste una nueva regla de alerta, se disparó en producción y el aviso llegó al equipo equivocado, o nadie recibió ningún aviso. La regla es correcta y la alerta se está disparando, pero tu problema de receiver equivocado en Alertmanager es real: la notificación aterrizó en un lugar que no esperabas. Cuando Alertmanager no enruta como pretendías, el bug casi nunca está en la alerta. Está en el árbol `route`, y los árboles de enrutamiento son código que no puedes depurar paso a paso con facilidad.

Alertmanager despacha cada alerta recorriendo un árbol de rutas. La raíz es el catch-all por el que entra toda alerta; desde ahí desciende hacia rutas hijas cuyos matchers se cumplen contra los labels de la alerta. Equivoca el recorrido y la alerta aterriza en silencio en la hoja equivocada. Este artículo cubre los cinco bugs que lo provocan, y cómo recorrer el árbol tú mismo: sin `amtool`, sin reload, sin instancia en vivo.

## El síntoma: avisos silenciosos, o el equipo equivocado recibe el aviso

Dos formas del mismo problema. O bien una alerta que esperabas que avisara al equipo de base de datos fue a un canal de Slack catch-all que nadie mira, o una alerta con `severity=critical` no generó ningún aviso. Ambas provienen de la misma causa raíz: la ruta que la alerta *realmente* coincidió no es la ruta que *crees* que coincidió.

Este es el árbol del que parte la mayoría: el ejemplo canónico de enrutamiento:

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

Una alerta con `service=database` llega a `team-DB-pages`. Bastante simple, hasta que el árbol crece, los hermanos se reordenan, alguien añade una regex y el recorrido deja de hacer lo que leías sobre el papel. La solución es siempre la misma: deja de razonar mentalmente y recorre el árbol contra los labels exactos que lleva la alerta. Cada bug de abajo es una manera distinta en que el recorrido te sorprende.

## Bug 1: gana la primera coincidencia y olvidaste continue: true

Este es el bug más común de "Alertmanager no enruta". Dentro de una ruta coincidente, las rutas hijas se evalúan **de arriba abajo**, y la alerta desciende por la **primera** hija coincidente; entonces el escaneo de hermanos se detiene. Los hermanos posteriores nunca se ejecutan.

Eso muerde con más fuerza cuando quieres que una alerta llegue a dos receivers; por ejemplo, que cada alerta crítica se refleje en un receiver de auditoría *y* se enrute al equipo responsable:

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

Dispara una alerta con `team=backend` y `severity=critical`. Coincide con el primer hermano, `all-critical-audit`, y el escaneo se detiene ahí. Nunca se alcanza `team-Y-pages`, así que el equipo de backend nunca recibe el aviso. El canal de auditoría lo registró, así que *parece* que el enrutamiento funcionó, que es exactamente por lo que este es difícil de detectar.

La solución es una línea. Una ruta coincidente con `continue: true` no detiene el escaneo de hermanos, así que la alerta sigue cayendo hacia los hermanos coincidentes posteriores:

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

Ahora se disparan ambos. Una alerta solo puede llegar a más de un receiver cuando se establece `continue: true` en una ruta coincidente; sin él, el primer hermano coincidente siempre gana.

## Bug 2: el matcher no coincide (regex, comillas, un label ausente)

Si la alerta se salta en silencio una ruta que estabas seguro de que iba a alcanzar, probablemente el matcher no esté coincidiendo. Tres trampas explican casi todos estos casos.

**Las regex están totalmente ancladas.** Tanto `match_re` como los operadores `=~` / `!~` envuelven tu patrón como `^(?:…)$`. Un patrón parcial nunca coincide con un valor más largo:

```yaml
matchers:
  - env=~"staging"      # env=staging-eu does NOT match — anchored to exactly "staging"
```

```yaml
matchers:
  - env=~"staging-.*"   # env=staging-eu matches now
```

**Un label ausente es la cadena vacía.** Alertmanager trata un label ausente en la alerta como `""`, así que `team=""` coincide con una alerta que *no* tiene label `team` y `team!=""` exige que esté presente y no vacío. Si escribes `match: { team: frontend }` pero la alerta nunca establece un label `team`, el matcher compara `frontend` contra `""`, falla, y la ruta se omite: te cuelas hacia abajo.

**Operadores y comillas en las cadenas de `matchers:`.** La forma moderna `matchers:` toma cadenas como `foo="bar"`, `foo=~"re"`, `foo!="x"` y `foo!~"re"`; el valor puede ir entre comillas o sin ellas. Los operadores de dos caracteres (`=~`, `!~`, `!=`) se reconocen antes que el `=` simple, así que `severity!="info"` se analiza como un "distinto de". Equivoca las comillas (deja una comilla abierta, por ejemplo) y el matcher queda inválido; un matcher inválido no puede cumplirse, así que la ruta se omite.

Esta es una ruta con matchers que combina una regex con una desigualdad:

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

Todos los matchers de una ruta deben cumplirse para que coincida: es un AND lógico. Una alerta con `env=staging-eu` y `severity=warning` llega a `staging-slack`: el anclado `staging-.*` coincide y `severity` no es `info`. Cambia `severity` a `info` y el segundo matcher falla, así que toda la ruta se omite.

Si tus reglas de alerta llevan los labels equivocados desde el principio, o les faltan aquellos por los que enrutan tus rutas, corrígelo aguas arriba. El [Prometheus Relabel Tester](/prometheus-relabel-tester) muestra exactamente qué labels sobreviven a tus reglas de relabel antes de que lleguen siquiera al árbol de rutas.

## Bug 3: una ruta catch-all por defecto se traga todo antes de que se alcance tu ruta

Una ruta catch-all de Alertmanager se supone que es una red de seguridad: el receiver que se dispara cuando nada más específico coincide. Pero un catch-all colocado *encima* de un hermano específico, en lugar de debajo, se convierte en una trampa. Combinado con "gana la primera coincidencia", una regla amplia en la parte superior ensombrece toda regla específica que tenga debajo:

```yaml
# Trap: the broad rule above shadows the specific one
routes:
  - receiver: catch-all
    matchers: ['severity=~".*"']   # matches everything
  - receiver: db-pager             # NEVER reached
    match: { service: database }
```

`severity=~".*"` coincide con cualquier alerta que tenga un label `severity` (anclado, pero `.*` cubre todo el valor). Es el primer hermano, así que el escaneo se detiene ahí: `db-pager` es código muerto. El equipo de base de datos nunca recibe el aviso.

Hay dos formas correctas de pensar en un catch-all. O pones tus rutas específicas primero y la amplia al final:

```yaml
# Fix: specific first, broad last
routes:
  - receiver: db-pager
    match: { service: database }
  - receiver: catch-all
    matchers: ['severity=~".*"']
```

O te apoyas en el catch-all real que ya tienes: el propio `receiver` de la ruta raíz. Cuando ninguna ruta hija coincide, la ruta en la que se encuentra la alerta se convierte en la coincidencia terminal y se dispara *su* receiver. La raíz siempre establece un `receiver` por defecto, así que una alerta que no coincide con ninguna hija aún aterriza en algún lugar:

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

Una alerta con `team=platform` no coincide con ninguna hija. No da error y no se desvanece: se cuela hacia `default-receiver`, el catch-all funcionando como se pretendía. Los casos de "¿por qué no se enrutó mi alerta?" suelen ser este: *sí* se enrutó, directa al receiver por defecto, porque ninguna hija coincidió. Si una ruta se resuelve sin ningún receiver, eso sí es una mala configuración genuina: Alertmanager exige que la raíz establezca un `receiver` por defecto.

## Bug 4: el orden de las rutas entre hermanos

El Bug 3 es un catch-all tragándoselo todo. El Bug 4 es la versión más sutil y general: entre hermanos, el orden *siempre* decide qué ruta única gana, incluso cuando ambas son específicas. Como solo se toma el primer hermano coincidente (en ausencia de `continue`), dos matchers solapados en el orden equivocado enrutan la alerta al equipo equivocado.

![Una alerta mal enrutada: a la izquierda la alerta llega al árbol de rutas y aterriza en el receiver equivocado en rojo porque falta continue, a la derecha el árbol corregido la enruta al receiver correcto en verde](/blog/debug-alertmanager-routing-diagram.svg)

Considera una alerta que es a la vez una alerta de base de datos y una alerta del equipo de backend:

```yaml
# labels: service=database, team=backend, severity=critical
routes:
  - receiver: 'team-Y-pages'      # matches team=backend
    match: { team: backend }
  - receiver: 'team-DB-pages'     # matches service=database
    match: { service: database }
```

Los matchers de ambas rutas se cumplen contra esta alerta. El orden rompe el empate: `team-Y-pages` va primero, así que gana, y nunca se alcanza al on-call de base de datos (`team-DB-pages`). Intercambia las dos y gana la ruta de base de datos en su lugar. Ningún matcher es incorrecto: el *orden* es el bug.

Cuando dos hermanos pueden coincidir legítimamente ambos, tienes tres opciones: poner primero el que quieres que gane, hacer los matchers mutuamente excluyentes (añadir `service!=database` a la ruta de backend, por ejemplo), o establecer `continue: true` en la primera para que la alerta llegue a ambas. El anidamiento también ayuda: un padre coincide con el caso amplio y lo acota con hijas:

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

Una alerta con `service=web` primero desciende por `web-team`, y luego las hijas anidadas eligen el receiver según `severity`. Una alerta web con `severity=critical` recorre `root → web-team → web-team-pager`. El descenso es explícito, así que las sorpresas de orden quedan locales a una pequeña lista de hermanos en lugar de esconderse por todo el árbol.

## Bug 5: la agrupación hace que una alerta parezca ausente cuando solo está en lote

A veces la alerta se enrutó perfectamente y aun así crees que falta, porque la agrupación la agrupó con otras en lote y la notificación todavía no se ha enviado. La agrupación se controla con `group_by`, `group_wait`, `group_interval` y `repeat_interval`, y los cuatro se **heredan** árbol abajo. Una hija que no establece los suyos propios arrastra los del padre:

```yaml
route:
  group_by: ['alertname', 'cluster']
  group_wait: 30s
  routes:
    - receiver: db-pager
      match: { service: database }
      # no group_by here → INHERITS ['alertname', 'cluster']
```

La hoja `db-pager` no tiene `group_by` propio, así que hereda `['alertname', 'cluster']` y un `group_wait` de 30s de la raíz. Hay dos consecuencias que confunden a la gente. Primero, un grupo nuevo se retiene durante `group_wait` antes de su primera notificación, así que una alerta recién disparada que "no avisa" puede estar simplemente dentro de su ventana de espera. Segundo, si `group_by` es demasiado grueso, tu alerta se pliega dentro de la notificación de un grupo existente y parece que nunca se disparó por separado.

Sobrescribe solo donde un subárbol realmente necesite una agrupación distinta:

```yaml
route:
  group_by: ['alertname', 'cluster']
  routes:
    - receiver: db-pager
      match: { service: database }
      group_by: ['alertname', 'cluster', 'database']
```

La hoja que estás leyendo no es necesariamente la agrupación que aplica. Resuelve siempre el `group_by` *efectivo* (el valor heredado del ancestro más cercano que lo estableció) antes de concluir que una alerta falta.

## Probar el enrutamiento de Alertmanager sin amtool: recorre el árbol contra los labels de la alerta

No necesitas `amtool config routes test`, y no necesitas recargar un Alertmanager en vivo para depurar el enrutamiento. El recorrido de enrutamiento es determinista, así que puedes hacerlo a mano. Toma los labels exactos de la alerta que se está disparando y recorre el árbol de arriba abajo:

```bash
# The labels the alert actually carries (from the Alertmanager UI or API):
alertname=HighLatency
service=database
team=backend
severity=critical
```

Luego, empezando por la raíz:

1. **Entra en la raíz.** Toda alerta lo hace: es el catch-all. Anota su `receiver` y su `group_by` como línea base de herencia.
2. **Escanea las hijas de arriba abajo.** Para cada hija, comprueba si se cumplen *todos* sus matchers contra los labels. Recuerda: las regex están ancladas, y un label ausente es `""`.
3. **Desciende por la primera coincidencia.** El subárbol de esa hija es ahora donde estás. Si estableció `continue: true`, sigue escaneando también sus hermanos posteriores: esos se convierten en coincidencias adicionales.
4. **Si ninguna hija coincide, has terminado.** La ruta actual es la coincidencia terminal; se dispara su `receiver` heredado.
5. **Resuelve la herencia en la hoja.** El `receiver` y el `group_by` efectivos provienen del ancestro más cercano que los estableció, no necesariamente de la hoja.

Haz eso para los labels de arriba contra el árbol de la documentación y aterrizas en `team-DB-pages` vía `service=database`, heredando `group_by` de la raíz. Hacer este recorrido sobre papel para un árbol de 40 nodos es exactamente el razonamiento propenso a errores que produjo el bug en primer lugar, que es justo la razón por la que existe un tester.

## Encuentra ya el receiver coincidente: un depurador de rutas de Alertmanager en el navegador

Cuando el árbol tiene más de unos pocos nodos, recórrelo con el [Alertmanager Route Tester](/alertmanager-route-tester) en lugar de mentalmente. Pega tu árbol de rutas (un bloque `route:` pelado o un `alertmanager.yml` completo, del que solo se lee el bloque `route`) y los labels de la alerta de muestra, un `key=value` por línea. Reproduce la semántica exactamente: gana la primera coincidencia, el fan-out de `continue: true`, las regex ancladas, el label-ausente-como-cadena-vacía y la herencia de la agrupación.

Lo que recuperas es cada receiver que la alerta alcanza, en orden de evaluación, cada uno con su miga de pan de la ruta desde la raíz hasta el nodo coincidente, una etiqueta en cualquier coincidencia alcanzada solo vía `continue`, y el `group_by` efectivo tras la herencia. Es un ensayo del despacho: no se envía ninguna notificación, no se sube nada, y todo se ejecuta en tu navegador, así que puedes pegar con seguridad nombres de receivers internos y labels de equipo privados.

Una vez que los labels se confirman correctos en el origen con el [Prometheus Relabel Tester](/prometheus-relabel-tester) y se demuestra que tus reglas se disparan con [AlertLint](/loki-alert-rule-tester), el árbol de rutas es el último salto que hay que acertar. Recórrelo antes de que avise a alguien, y la próxima vez que una alerta llegue al receiver equivocado, sabrás qué nodo la envió allí.

[Abre el Alertmanager Route Tester →](/alertmanager-route-tester)
