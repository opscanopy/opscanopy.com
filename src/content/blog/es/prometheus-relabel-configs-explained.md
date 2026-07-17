---
title: "relabel_configs de Prometheus explicado: una guía práctica"
description: "Entiende los relabel_configs de Prometheus de principio a fin —source_labels, regex, replacement y cada action (replace, keep, drop, labelmap, hashmod)— con recetas listas para copiar y pegar."
pubDate: 2026-06-13
tags: ["prometheus","observability","relabeling"]
lang: es
translationOf: "prometheus-relabel-configs-explained"
relatedTool:
  name: "Prometheus Relabel Tester"
  href: "/prometheus-relabel-tester"
---

![Diagrama de un pipeline de relabel_configs de Prometheus que muestra los source_labels unidos en un valor, comparado con una regex anclada, y una action como replace, keep, drop, labelmap o hashmod reescribiendo las etiquetas de salida.](/blog/prometheus-relabel-configs-explained-hero.svg)

Un target que esperabas scrapear nunca aparece en Prometheus. Ningún error en los logs, ningún scrape fallido, nada en rojo en la página de targets: la serie sencillamente no está ahí. Añades `--log.level=debug`, reinicias, entrecierras los ojos ante la salida y al final lo encuentras: una regla `keep` tres líneas más abajo en tus `relabel_configs` descartó el target en silencio porque la regex no coincidió como suponías. Ese fallo silencioso es justamente la razón por la que `relabel_configs` merece una lectura atenta. El relabeling de Prometheus reescribe, conserva o descarta targets y sus etiquetas, y cuando se equivoca no se queja: simplemente tira tus métricas.

Esta guía recorre el relabeling de Prometheus desde cero: qué hace, los campos con los que se construye cada regla y cada action con un pequeño ejemplo. La semántica de aquí coincide exactamente con la que implementa el motor del [Prometheus Relabel Tester](/prometheus-relabel-tester/), así que puedes pegar en él cualquier fragmento de los de abajo y ver cómo cambian las etiquetas.

## Qué hace realmente el relabeling

El relabeling se ejecuta sobre un conjunto de etiquetas y produce un nuevo conjunto de etiquetas. Eso es todo. Cada target que Prometheus descubre llega como un saco de etiquetas: su dirección, su job y un montón de etiquetas `__meta_*` procedentes del service discovery. Antes de que ocurra el scrape, tus reglas de `relabel_configs` se ejecutan de arriba abajo sobre esas etiquetas. Cada regla ve la salida de la anterior.

Una regla puede hacer una de estas tres cosas con ese conjunto de etiquetas:

- **Reescribir** una etiqueta (o crear una): `replace`, `labelmap`, `lowercase`, `uppercase`, `hashmod`.
- **Descartar el target entero** para que nunca se scrapee: `keep`, `drop`, `keepequal`, `dropequal`.
- **Eliminar etiquetas concretas** por nombre: `labeldrop`, `labelkeep`.

```yaml
scrape_configs:
  - job_name: api
    static_configs:
      - targets: ["10.0.0.5:8080"]
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
```

Después de que esta regla se ejecute, el target lleva una etiqueta `instance` copiada de `__address__`. Nada dio error, nada se descartó: se reescribió una etiqueta. Ese es todo el trabajo del relabeling, repetido regla a regla.

Hay dos lugares donde corre el relabeling. `relabel_configs` se ejecuta *antes* del scrape, sobre las etiquetas de descubrimiento del target, y puede conservar o descartar targets enteros. `metric_relabel_configs` se ejecuta *después* del scrape, sobre las etiquetas de cada sample, y se usa para descartar o reescribir series temporales concretas. Mismas actions, misma semántica: solo cambian el momento y la entrada.

## Los componentes: source_labels, separator, regex, modulus, target_label, replacement, action

Cada regla de relabeling se monta a partir del mismo puñado de campos. La mayoría tiene valores por defecto, así que rara vez una regla los define todos.

```yaml
- source_labels: [job, instance]   # which label values to read
  separator: ";"                   # how to join them (default ";")
  regex: "(.*);(.*)"               # pattern to match the joined value (default "(.*)")
  modulus: 8                       # only for hashmod
  target_label: combined           # label to write (required by some actions)
  replacement: "$1-$2"             # value to write, with $1/${1} expansion (default "$1")
  action: replace                  # what to do (default "replace")
```

Así procesa una regla todo esto. Prometheus lee cada nombre en `source_labels`, busca su valor (una etiqueta ausente se lee como la cadena vacía) y los une con `separator`. El separador por defecto es un único punto y coma, así que `source_labels: [job, instance]` sobre `job="api"`, `instance="10.0.0.1:9090"` produce el valor unido `api;10.0.0.1:9090`.

Ese valor unido se compara con `regex`. El detalle que a todo el mundo se le escapa: **la regex está completamente anclada**. Prometheus envuelve tu patrón como `^(?:your-regex)$`, así que debe coincidir con el valor unido *entero*, no solo con una parte.

```yaml
# This does NOT match "api-server" — the regex must match the whole value.
- source_labels: [job]
  regex: api
  action: keep
```

Una regla `regex: api` no conservará un target cuyo `job` sea `api-server`, porque `^(?:api)$` solo coincide con la cadena literal `api`. Necesitarías `api.*` o `(api.*)`. Este único hecho explica la mayoría de los misterios del estilo "mi target desapareció".

Cuando la regex coincide y la action escribe una etiqueta, `replacement` aporta el valor. Los grupos de captura se expanden como `$1`, `${1}`, o los grupos nombrados `$name`/`${name}`; el replacement por defecto es `$1`, que es por lo que un `replace` simple con `regex: (.*)` copia el valor de origen sin cambios. `modulus` solo lo lee `hashmod`, y `target_label` es obligatorio para `replace`, `hashmod`, `lowercase`, `uppercase`, `keepequal` y `dropequal`.

![Ilustración synthwave de una regla de relabeling: los source_labels fluyen hacia una regex anclada, el replacement $1:$2 se expande y actions como replace, keep, labelmap y hashmod reescriben las etiquetas.](/blog/in-content/prometheus-relabel-configs-explained.webp)

## Las actions una a una: replace, keep, drop, labelmap, labelkeep, labeldrop, hashmod

Prometheus admite once actions. Cada ejemplo de abajo es una regla completa y ejecutable.

### replace

Une las etiquetas de origen, compara la regex, expande `$1`/`${1}` en `replacement` y asigna `target_label`.

```yaml
- source_labels: [__address__]
  regex: "([^:]+):.*"
  target_label: ip
  replacement: "$1"
```

`__address__="10.0.0.5:8080"` se convierte en una nueva etiqueta `ip="10.0.0.5"`. Si la regex no coincide, el conjunto de etiquetas se deja sin cambios. Hay un detalle peligroso que conviene memorizar: **si el replacement expandido es la cadena vacía, `replace` borra el target label** en lugar de dejarlo en blanco.

```yaml
# When tmp_instance is empty, this DELETES the instance label.
- source_labels: [tmp_instance]
  regex: "(.+)"
  target_label: instance
  replacement: "$1"
```

Con `instance="old"`, `tmp_instance=""`, la regex `(.+)` no consigue coincidir con un valor vacío, así que no pasa nada: `instance` sobrevive. Pero cambia el origen para que la expansión acabe siendo una cadena vacía y la etiqueta `instance` desaparece por completo. Esa asimetría es una fuente frecuente del "¿adónde fue a parar mi etiqueta?".

### keep

Descarta el target entero salvo que el origen unido coincida con la regex.

```yaml
- source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
  action: keep
  regex: "true"
```

Solo sobreviven los pods anotados con `prometheus.io/scrape: "true"`; todo lo demás se descarta antes de scrapear. `keep` es una puerta de tipo lista de permitidos.

### drop

El espejo de `keep`: descarta el target cuando el origen unido *sí* coincide.

```yaml
- source_labels: [__name__]
  action: drop
  regex: "go_gc_.*"
```

Usado en `metric_relabel_configs`, esto silencia toda la familia de métricas `go_gc_*` antes de almacenarla. `drop` es una puerta de tipo lista de bloqueados.

### labelmap

`labelmap` opera sobre los **nombres** de las etiquetas, no sobre los valores. Por cada etiqueta cuyo nombre coincida con la regex, asigna una nueva etiqueta —cuyo nombre es el replacement expandido— con el valor de esa etiqueta.

```yaml
- action: labelmap
  regex: "__meta_kubernetes_pod_label_(.+)"
```

Una etiqueta `__meta_kubernetes_pod_label_app="api"` produce una nueva etiqueta `app="api"`. Esta es la jugada canónica para promover las etiquetas de pod de Kubernetes a etiquetas normales. El `replacement` por defecto de `$1` es lo que escribe el sufijo capturado como nuevo nombre.

### labelkeep / labeldrop

Ambas filtran etiquetas por nombre. `labeldrop` elimina toda etiqueta cuyo nombre coincida; `labelkeep` elimina toda etiqueta cuyo nombre *no* coincida.

```yaml
# Strip all leftover service-discovery metadata.
- action: labeldrop
  regex: "__meta_.+"
```

```yaml
# Keep only the four labels you care about; drop everything else.
- action: labelkeep
  regex: "(__name__|job|instance|severity)"
```

### hashmod

`hashmod` asigna a `target_label` un número de shard estable. Toma el MD5 del origen unido, lee los últimos 8 bytes de ese digest como un entero de 64 bits big-endian y almacena `hash % modulus`.

```yaml
- source_labels: [__address__]
  action: hashmod
  modulus: 3
  target_label: __tmp_shard
```

Cada target obtiene un valor `__tmp_shard` determinista de `0`, `1` o `2`. La receta del MD5 importa: el Relabel Tester la reproduce byte a byte exactamente, así que los valores de shard que muestra son los valores que Prometheus va a calcular.

### keepequal / dropequal

Estas dos no llevan regex. Comparan el valor del origen unido con el *valor actual* de `target_label` y conservan o descartan según la igualdad.

```yaml
# Drop the target if its port already equals the discovered one.
- source_labels: [__meta_port]
  action: dropequal
  target_label: port
```

`keepequal` conserva solo cuando ambos son iguales; `dropequal` descarta cuando son iguales.

### lowercase / uppercase

Asignan a `target_label` el valor del origen unido en minúsculas o mayúsculas, útil para normalizar etiquetas de descubrimiento con may/minúsculas inconsistentes.

```yaml
- source_labels: [environment]
  action: lowercase
  target_label: environment
```

`environment="PRODUCTION"` se convierte en `environment="production"`.

## Las etiquetas __meta_ del service discovery y por qué importan

Cada mecanismo de service discovery —Kubernetes, EC2, Consul, basado en ficheros— adjunta etiquetas `__meta_*` a cada target que encuentra. Estas *solo* están disponibles durante `relabel_configs`. Se eliminan antes del scrape, así que si quieres que algo de esa metadata sobreviva como etiqueta real, tienes que copiarla con `replace` o `labelmap` primero.

![El pipeline de relabeling para una regla: etiquetas de entrada, unir los source_labels con el separator, comparar la regex, aplicar la action y producir las etiquetas de salida.](/blog/prometheus-relabel-configs-explained-diagram.svg)

Un target de pod de Kubernetes llega con un aspecto aproximadamente así:

```text
__address__="10.0.0.5:8080"
__meta_kubernetes_namespace="default"
__meta_kubernetes_pod_name="api-7d9f"
__meta_kubernetes_pod_label_app="api"
__meta_kubernetes_pod_annotation_prometheus_io_scrape="true"
__meta_kubernetes_pod_annotation_prometheus_io_port="9100"
```

Las etiquetas `__meta_*` son la razón misma de que exista el relabeling. Cargan el contexto de descubrimiento —qué namespace, qué anotaciones, qué etiquetas de pod— que tú conviertes en decisiones de scrape (`keep` sobre la anotación de scrape) y en etiquetas duraderas (`labelmap` de las etiquetas de pod). Cualquier cosa que empiece con un doble guion bajo es interna y se elimina tras el relabeling, siendo `__name__` (el nombre de la métrica) la notable excepción que sobrevive hasta el almacenamiento. Como estas etiquetas solo existen en el momento del relabeling, la única forma segura de confirmar que una regla las lee correctamente es pasar un conjunto realista de `__meta_*` por tus reglas y mirar la salida.

## Recetas que reutilizarás

Estos son los patrones que aparecen en casi cualquier configuración de scrape real.

### Conservar solo los targets de prod

```yaml
- source_labels: [__meta_kubernetes_namespace]
  action: keep
  regex: "prod|production"
```

Anclada, así que `prod` coincide exactamente con el namespace `prod` y `staging-prod` *no* coincidiría salvo que escribas `.*prod.*`. La alternancia `|` admite ambas convenciones de nombres.

### Descartar métricas ruidosas (metric_relabel_configs)

```yaml
metric_relabel_configs:
  - source_labels: [__name__]
    action: drop
    regex: "go_gc_.*|process_.*"
```

Se ejecuta después del scrape, descartando familias de alta cardinalidad antes de que lleguen al almacenamiento.

### Sharding con hashmod

El patrón de sharding horizontal de dos reglas: hashear hacia una etiqueta temporal y luego conservar solo el shard que le pertenece a este Prometheus:

```yaml
- source_labels: [__address__]
  action: hashmod
  modulus: 3
  target_label: __tmp_shard

- source_labels: [__tmp_shard]
  action: keep
  regex: "0"
```

Ejecuta esto contra cuatro direcciones de ejemplo en el tester y verás exactamente cuáles dos o tres caen en el shard `0` y sobreviven; las demás se descartan, marcadas con la regla y la action responsables.

### Mapear etiquetas de SD con labelmap y luego reescribir la dirección

```yaml
# Promote every pod label to a plain label.
- action: labelmap
  regex: "__meta_kubernetes_pod_label_(.+)"

# Rebuild __address__ from the IP and an annotated port.
- source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
  action: replace
  regex: "([^:]+)(?::\\d+)?;(\\d+)"
  replacement: "$1:$2"
  target_label: __address__
```

La segunda regla muestra el idiom del origen unido en acción: dos `source_labels` unidos por el separator `;` por defecto, con una regex escrita para tener en cuenta ese separator. `__address__="10.0.2.4:8080"` unido con el puerto `9100` se convierte en `10.0.2.4:8080;9100`, la regex captura `10.0.2.4` y `9100`, y la dirección se reconstruye como `10.0.2.4:9100`.

## Prueba antes de desplegar

El relabeling es la única parte de una configuración de Prometheus donde estar casi en lo cierto no produce ningún error ni advertencia, solo series ausentes o incorrectas. El anclaje de la regex, el borrado por replacement vacío, el hashmod con MD5, el orden de unión de varios `source_labels`: cada uno es fácil de equivocar de forma sutil, y un Prometheus en producción no te dirá cuál de ellos te mordió.

Pega las recetas de este post, con un conjunto realista de etiquetas `__meta_*`, en el [Prometheus Relabel Tester](/prometheus-relabel-tester/) y verás el valor unido, la regex coincidente (o no), el diff por etiqueta y un aviso claro —nombrando la regla y la action— cada vez que se descarte un target. Funciona enteramente en tu navegador, así que puedes pegar con seguridad configuraciones de scrape internas.

Una vez que las etiquetas tienen la forma que quieres, las siguientes preguntas son qué consultas y cómo alertas. Descompón una expresión con [el PromQL Explainer](/promql-explainer/), o si estás moviendo reglas entre Loki y Prometheus, tradúcelas con [el LogQL ↔ PromQL Helper](/logql-promql-helper/). Acierta primero con las etiquetas: todo lo de aguas abajo depende de ellas.
