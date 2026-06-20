---
title: "¿Por qué Prometheus descartó mi target? Depurando relabel_configs"
description: "Un target desapareció o una etiqueta se esfumó tras el relabeling. Depura relabel_configs frente a metric_relabel_configs, el anclaje de regex y la lógica de keep/drop."
pubDate: 2026-06-16
tags: ["prometheus","observability","relabeling"]
lang: es
translationOf: "debug-prometheus-relabeling"
relatedTool:
  name: "Prometheus Relabel Tester"
  href: "/prometheus-relabel-tester"
---

![Depurando un target de Prometheus descartado: el ciclo de vida del scrape, desde el service discovery hasta el TSDB pasando por relabel_configs, con un target resaltado como descartado.](/blog/debug-prometheus-relabeling-hero.svg)

Añadiste un nuevo exporter, recargaste Prometheus, abriste `/targets` y no está ahí. Ningún error en los logs. La configuración de scrape se parseó sin problemas. El exporter está activo y puedes hacer `curl` a su `/metrics` a mano. Pero Prometheus descartó tu target y no te dice por qué. O peor aún: el target aparece, pero una etiqueta de la que dependes para el enrutamiento o los dashboards ha desaparecido en silencio. Ambos síntomas casi siempre se remontan al mismo sitio: `relabel_configs`. Este artículo recorre cómo depurar `relabel_configs`, en qué se diferencia de `metric_relabel_configs` y el puñado de errores que explican casi todos los targets descartados.

## El síntoma: un target ausente en /targets, o una etiqueta que se esfumó

Hay dos fallos distintos y conviene ponerles nombre antes de empezar a escarbar.

El primero es el **target descartado**: nunca aparece bajo `/targets`, ni siquiera en estado "down". El service discovery lo encontró, pero una regla `keep` o `drop` lo eliminó antes de que se ejecutara el scrape. Prometheus no registra esto: desde su punto de vista, no pasó nada raro.

El segundo es la **etiqueta que desaparece**: el target se scrapea bien, pero una etiqueta que esperabas ya no está, o quedó sobrescrita con algo inesperado. Lo ves en `/targets` (pasa el cursor sobre las etiquetas) o al consultar las series y notar que la dimensión por la que querías agrupar no está.

```bash
# The target you expect is simply absent from the list:
curl -s localhost:9090/api/v1/targets | jq '.data.activeTargets[].labels.job'
# "node-exporter"
# "blackbox"
#   ← your "api" job never shows up
```

Cuando un target está ausente en silencio, la causa está aguas arriba del scrape. Eso es el relabeling. La buena noticia: el relabeling es determinista. Dadas las mismas etiquetas de entrada y las mismas reglas, obtienes el mismo resultado siempre, lo que significa que puedes reproducirlo sin conexión.

## relabel_configs frente a metric_relabel_configs: dónde se ejecuta cada uno

Los dos bloques de configuración aplican *exactamente las mismas* acciones de relabeling y la misma semántica. La única diferencia es **dónde** se ejecutan dentro del ciclo de vida del scrape, y esa diferencia decide qué síntoma estás depurando.

`relabel_configs` se ejecuta **en el momento del scrape, antes del scrape**, sobre las etiquetas del target que llegan del service discovery. Son las etiquetas que deciden *si un target llega a scrapearse o no* y cuál es su identidad (`job`, `instance`, `__address__`). Un `keep`/`drop` aquí elimina un target entero. Este es el bloque que hay que inspeccionar cuando falta un target en `/targets`.

`metric_relabel_configs` se ejecuta **después del scrape**, sobre el conjunto de etiquetas de cada muestra a medida que se ingiere. Un `keep`/`drop` aquí elimina series temporales individuales, no el target. Este es el bloque que hay que inspeccionar cuando el target está presente pero faltan series o etiquetas concretas.

![El ciclo de vida del scrape de Prometheus, que muestra el service discovery y las etiquetas __meta_, luego relabel_configs que puede descartar un target entero, después el scrape, luego metric_relabel_configs que puede descartar muestras individuales, y por último el TSDB.](/blog/debug-prometheus-relabeling-diagram.svg)

```yaml
scrape_configs:
  - job_name: api
    kubernetes_sd_configs:
      - role: pod

    # Runs BEFORE the scrape, on discovery labels (__meta_*, __address__).
    # A keep/drop here removes the whole target.
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: "true"

    # Runs AFTER the scrape, on each sample. A drop here removes series,
    # not the target.
    metric_relabel_configs:
      - source_labels: [__name__]
        action: drop
        regex: go_gc_.*
```

Si falta tu target, nunca llegas a `metric_relabel_configs`: depura primero `relabel_configs`. Si el target está presente pero una serie desapareció, es el otro bloque. Acertar con esta distinción es media batalla ganada cuando estás buscando "metric_relabel_configs vs relabel_configs" a las 2 de la madrugada.

## Los sospechosos habituales

Casi todos los targets descartados vienen de uno de estos casos. Cada uno es fácil de cometer e invisible hasta que lo reproduces.

### Un regex de keep que no coincide (porque el regex está anclado)

Esta es la causa número uno. **Prometheus ancla cada regex de relabeling**: internamente envuelve tu patrón como `^(?:<your regex>)$`. El patrón debe coincidir con el valor *completo* unido de las fuentes, no con una subcadena.

```yaml
- source_labels: [job]
  action: keep
  regex: api          # anchored to ^(?:api)$
```

Esto conserva un target cuyo `job` sea exactamente `api`. **No** conserva `api-server`, `api-prod` ni `payments-api`. Con una acción `keep`, todo lo que no coincida se descarta, así que tu target `api-server` se esfuma en silencio. La solución es coincidir con lo que realmente quieres:

```yaml
- source_labels: [job]
  action: keep
  regex: api.*        # ^(?:api.*)$ — matches api, api-server, api-prod
```

### Un drop demasiado amplio

La imagen especular. Un modelo mental sin anclaje más un regex codicioso captura más de lo previsto:

```yaml
- source_labels: [__name__]
  action: drop
  regex: .*_bucket   # drops EVERY *_bucket series, including ones you need
```

`keep` es una puerta de lista de permitidos; `drop` es una puerta de lista de denegados. Un `drop` demasiado amplio en `metric_relabel_configs` borra en silencio series que querías conservar, y solo lo notas cuando un dashboard se queda en blanco.

### source_labels equivocadas, o la unión equivocada

Cuando una regla lista varias `source_labels`, Prometheus une sus valores con el **separator** —que por defecto es un único punto y coma `;`— *antes* de aplicar el regex. Si te olvidas del separator, tu regex nunca coincide con la cadena unida:

```yaml
# job="api", instance="10.0.0.1:9090" joins to "api;10.0.0.1:9090"
- source_labels: [job, instance]
  action: keep
  regex: api          # ✗ never matches "api;10.0.0.1:9090"
```

Necesitas un regex que tenga en cuenta el `;`, por ejemplo `api;.*`. Una source label ausente tampoco es un error: Prometheus trata una etiqueta inexistente como cadena vacía al unir, así que `source_labels: [does_not_exist]` se une a `""` y un `keep` con `regex: ".+"` lo descarta todo.

### Un replacement que sobrescribió __address__ (o eliminó una etiqueta)

`replace` tiene un comportamiento sutil pero real: **si el regex no coincide, la etiqueta se deja sin cambios; pero si coincide y el replacement expandido es la cadena vacía, la etiqueta de destino se elimina, no se deja en blanco.** Sobrescribe `__address__` con un valor vacío y el target pierde efectivamente su dirección de scrape.

```yaml
# If prometheus_io_port is absent, the joined value won't match this regex,
# so __address__ is left alone. But a regex that DOES match and expands to ""
# would DELETE __address__ entirely.
- source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
  action: replace
  regex: ([^:]+)(?::\d+)?;(\d+)
  replacement: $1:$2
  target_label: __address__
```

Este es el más insidioso, porque un `instance` o un `__address__` vacío no lanza ningún error: simplemente produce un target que no se puede scrapear o que choca con otro.

## Un flujo de trabajo para depurar

Cuando falta un target, trabaja de arriba hacia abajo. La idea central es recuperar la *entrada exacta* que vieron las reglas y luego volver a aplicar las reglas sobre ella.

### 1. Vuelca las etiquetas del target, incluidas las __meta_

Prometheus expone las etiquetas de discovery previas al relabeling —las etiquetas `__meta_*`—, pero solo para los targets que sobrevivieron al relabeling, así que un target totalmente descartado no aparecerá. El truco es recargar con las reglas de relabeling quitadas temporalmente (o reducidas a un único `keep` permisivo) y luego leer las etiquetas de discovery en crudo:

```bash
# Show discovered labels for the job, including the __meta_* set the
# relabel rules actually see as input.
curl -s 'localhost:9090/api/v1/targets?state=active' \
  | jq '.data.activeTargets[]
        | select(.discoveredLabels.job=="api")
        | .discoveredLabels'
```

`discoveredLabels` es la entrada de tus `relabel_configs`. `labels` es la salida. Si un target se descarta por completo, también puedes leer directamente el estado del service discovery:

```bash
curl -s localhost:9090/api/v1/targets/metadata >/dev/null  # sanity check API is up
curl -s 'localhost:9090/service-discovery' # the SD page shows pre-relabel labels
```

### 2. Prueba las reglas contra esas etiquetas

Ya tienes la entrada. Pega las etiquetas `__meta_*` y tus `relabel_configs` en [the Prometheus Relabel Tester](/prometheus-relabel-tester) y ejecútalas. Aplica las reglas exactamente como lo hace Prometheus —regex anclado, separator `;`, expansión `$1`/`${1}`— y te dice, por cada conjunto de etiquetas, cuáles son las etiquetas resultantes, cuáles se añadieron, cambiaron o se eliminaron, y si el target fue descartado (y por qué regla).

### 3. Bisecciona la lista de reglas

Si tienes una cadena larga, comenta la segunda mitad de las reglas y vuelve a ejecutar. Si el target sobrevive, el culpable está en la mitad que quitaste; si sigue descartándose, está en la mitad que queda. Vuelve a partir por la mitad. Como el relabeling es una cadena determinista de arriba hacia abajo —cada regla ve la salida de la anterior—, la bisección converge rápido, normalmente en dos o tres rondas.

## Ejemplo resuelto: el target que desaparece, encontrado y arreglado

Esta es una forma real de este bug. Descubres un pod, quieres conservar solo los pods que se han suscrito y enrutar por entorno. El target nunca aparece.

```yaml
relabel_configs:
  - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
    action: keep
    regex: "true"

  - source_labels: [__meta_kubernetes_pod_label_env]
    action: keep
    regex: prod
```

Las etiquetas de discovery del target que esperabas:

```text
__meta_kubernetes_pod_annotation_prometheus_io_scrape="true"
__meta_kubernetes_pod_label_app="api"
__meta_kubernetes_pod_label_env="production"
__address__="10.0.0.5:8080"
```

Pasa esa entrada por las reglas. El primer `keep` pasa: `prometheus_io_scrape` es exactamente `"true"`. El segundo `keep` se une a `production` e intenta coincidir con `^(?:prod)$`. No coincide. `production` no es `prod`, el regex está anclado y `keep` descarta todo lo que no coincida. **La regla 2 descartó el target.** El tester señala exactamente eso: descartado por la regla 2, acción `keep`.

La solución es coincidir con el valor real:

```yaml
  - source_labels: [__meta_kubernetes_pod_label_env]
    action: keep
    regex: prod.*       # ^(?:prod.*)$ — now matches "production"
```

Vuelve a ejecutar. El target sobrevive, lleva `__address__="10.0.0.5:8080"` y aparece en `/targets`. Tiempo total: menos de un minuto, sin recargar Prometheus y sin esperar a un intervalo de scrape.

Mientras estás limpiando, la misma cadena suele promover etiquetas del pod y podar los metadatos de discovery. Ten en cuenta que `labelmap` opera sobre los *nombres* de las etiquetas, copiando las que coinciden a un nombre nuevo, y `labeldrop` elimina las etiquetas cuyos nombres coinciden: útil, pero otro lugar donde una etiqueta que querías puede desaparecer en silencio:

```yaml
  # Promote pod labels: __meta_kubernetes_pod_label_app="api" → app="api"
  - action: labelmap
    regex: __meta_kubernetes_pod_label_(.+)

  # Strip leftover discovery metadata before storage.
  - action: labeldrop
    regex: __meta_.+
```

## Detéctalo antes de desplegar

El bucle de depuración más rápido es el que nunca llega a un Prometheus en vivo. La razón por la que el relabeling es tan fácil de equivocar es que falla en silencio: no hay error de parseo, ni línea de log, solo un target que no está. La única comprobación honesta es ejecutar las reglas contra una entrada representativa y leer la salida, la misma idea que hay detrás de probar cualquier configuración de comportamiento en lugar de fiarte de un lint de esquema.

Cuando estés frente al misterio de un "prometheus dropped target" o un informe de "prometheus label disappeared", toma los `discoveredLabels` de la API, pégalos junto con tus reglas en [the Prometheus Relabel Tester](/prometheus-relabel-tester) y observa qué regla hace el daño: se ejecuta enteramente en tu navegador, así que las configuraciones de scrape internas y los metadatos de los targets nunca salen de tu pestaña.

Una vez que las etiquetas son correctas, el resto de la cadena de observabilidad va detrás. Desglosa una consulta que dependa de esas etiquetas con [the PromQL Explainer](/promql-explainer), o confirma que una alerta sobre las series resultantes acaba en el sitio correcto con [the Alertmanager Route Tester](/alertmanager-route-tester). Da forma primero a las etiquetas; todo lo que viene después depende de acertar en ese paso.
