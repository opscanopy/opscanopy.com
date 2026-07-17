---
title: "LogQL vs PromQL: la misma consulta en ambos lenguajes"
description: "LogQL toma prestada la forma de PromQL, pero parte de líneas de log, no de métricas. Así es como se alinean ambos lenguajes de consulta, dónde se traducen con limpieza y dónde simplemente no lo hacen."
pubDate: 2026-06-05
tags: ["logql", "promql", "observability"]
lang: es
translationOf: "logql-vs-promql"
---

![LogQL vs PromQL: la misma consulta en ambos lenguajes, lado a lado](/blog/logql-vs-promql-hero.svg)

Si has escrito consultas de Prometheus, LogQL de Grafana Loki te resultará tranquilizadoramente familiar: `rate(...)`, `sum by (...)`, los vectores de rango `[5m]`, los mismos operadores de comparación. Esa familiaridad es deliberada y resulta genuinamente útil: gran parte de la memoria muscular de PromQL se transfiere directamente. Pero los dos lenguajes parten de materia prima diferente, y en el momento en que lo olvidas, tu traducción se rompe de formas difíciles de detectar. PromQL consulta una base de datos de **métricas**. LogQL consulta **líneas de log** y las convierte en métricas sobre la marcha. Todo lo que se corresponde con limpieza, y todo lo que no, se deriva de esa única diferencia.

## Las dos mitades de LogQL

Cada consulta de LogQL comienza con un **selector de logs** y una **pipeline** opcional — la parte que no tiene equivalente en PromQL porque PromQL nunca toca logs en bruto:

```logql
{app="api", env="prod"} |= "panic" | logfmt | level="error"
```

Eso selecciona el stream `api`/`prod`, conserva las líneas que contienen `panic`, las analiza como logfmt y luego filtra a `level=error`. El resultado sigue siendo un conjunto de líneas de log. Para obtener algo que puedas graficar o sobre lo que alertar — un número a lo largo del tiempo — lo envuelves en una **consulta de métrica**:

```logql
sum by (app) (count_over_time({app="api", env="prod"} |= "panic" | logfmt | level="error" [5m]))
```

Solo la mitad externa de esa expresión se parece a PromQL. La parte interna `{...} |= ... | logfmt | ...` es Loki puro, y es donde realmente recae la mayor parte del esfuerzo de traducción.

![La misma consulta escrita en PromQL y LogQL lado a lado, con las partes equivalentes conectadas mediante flechas](/blog/logql-vs-promql-diagram.svg)

## Dónde se alinean LogQL y PromQL

La capa de agregación es donde los lenguajes convergen, y las correspondencias son prácticamente uno a uno.

Una tasa de contador en PromQL:

```promql
sum by (status) (rate(http_requests_total{job="api"}[5m]))
```

La forma de LogQL que responde la misma pregunta a partir de logs:

```logql
sum by (status) (rate({job="api"} | logfmt [5m]))
```

Los operadores de agregación (`sum`, `avg`, `min`, `max`, `count`, `topk`, `quantile`) y las cláusulas de agrupación `by` / `without` se comportan de forma idéntica. Los operadores de comparación (`>`, `<`, `==`, `!=`) y la aritmética binaria funcionan de la misma manera, por lo que un umbral de alerta se traslada casi al pie de la letra:

```promql
# PromQL: more than 10 errors/sec
sum(rate(http_requests_total{status=~"5.."}[5m])) > 10
```

```logql
# LogQL: more than 10 error lines/sec
sum(rate({job="api"} | logfmt | status=~"5.." [5m])) > 10
```

La familia `_over_time` de Loki también refleja las funciones de rango de Prometheus allí donde el concepto sobrevive: `count_over_time`, `rate`, `bytes_rate`, `avg_over_time`, `max_over_time`, `quantile_over_time`. Si has usado `avg_over_time(metric[5m])` en PromQL, la forma desempaquetada de LogQL se lee igual una vez que has extraído un valor numérico sobre el que operar.

## Dónde divergen — y por qué un traslado literal falla

Las trampas se concentran en torno a la mitad de LogQL que PromQL no tiene.

**`rate` significa dos cosas diferentes.** En PromQL, `rate(counter[5m])` tiene en cuenta los reinicios del contador — está diseñado para series monótonamente crecientes. En LogQL, `rate({...}[5m])` es el **conteo de líneas** por segundo, sin semántica de reinicio, porque las líneas de log no se reinician. La palabra clave coincide; el significado no. Si recurres a `increase()` esperando el comportamiento de contador de PromQL, simplemente no hay nada que incrementar.

**Debes extraer un valor antes de poder hacer cálculos sobre él.** Las muestras de PromQL ya son números. Las líneas de Loki son texto, así que cualquier agregación sobre un *valor* (latencia, bytes, un campo numérico) necesita un parser más `unwrap`:

```logql
quantile_over_time(0.99, {job="api"} | logfmt | unwrap duration_seconds [5m]) by (route)
```

No hay contraparte en PromQL para `| logfmt`, `| json`, `| pattern` o `| unwrap` — existen precisamente porque la entrada no está estructurada. Traducir *desde* PromQL significa inventar este paso de extracción; traducir *hacia* PromQL significa eliminarlo y asumir que ya existe una métrica.

**La sintaxis de los selectores se solapa, pero no es intercambiable.** Ambos usan `{label="value"}` con `=`, `!=`, `=~`, `!~`. Pero un selector de PromQL nombra una métrica y coincide con etiquetas de series; un selector de stream de Loki nombra streams de logs y *debe* coincidir con al menos una etiqueta de stream indexada. Un filtro de línea como `|= "text"` no tiene ningún análogo en PromQL — lo más cerca que llega PromQL es coincidir con el valor de una etiqueta, nunca con texto libre dentro de una muestra.

**Los campos de alta cardinalidad se comportan de manera diferente.** En PromQL, agrupar por una etiqueta de alta cardinalidad suele ser un indicio de mal diseño de métricas. En LogQL, las etiquetas de pipeline extraídas (de `logfmt`/`json`) se calculan en tiempo de consulta y no están indexadas, así que `by (user_id)` es viable de una forma en que rara vez lo es en Prometheus — con un coste real en el rendimiento de la consulta, pero sin la explosión de almacenamiento. El modelo mental de lo que es "caro" no se transfiere.

## Una lista de verificación práctica para la traducción

Cuando muevas una consulta entre los dos lenguajes, recorre estos pasos en orden:

1. **Identifica la capa de métricas.** Reduce la consulta de PromQL a su agregación (`sum by (...) (rate(...))`); esa parte se traslada casi tal cual.
2. **Reconstruye la entrada.** En LogQL, reemplaza el nombre de la métrica por un selector `{stream}` más los filtros de línea y el parser (`| logfmt`, `| json`) necesarios para llegar a los mismos datos.
3. **Añade `unwrap` para cálculos sobre valores.** Cualquier promedio, cuantil o suma sobre un número — no un conteo de líneas — necesita un campo extraído y desempaquetado.
4. **Revisa de nuevo la semántica de `rate`.** Decide si te refieres al conteo de líneas por segundo (Loki) o a la tasa de contador (Prometheus). No son el mismo número.
5. **Acepta que algunas cosas no se corresponderán.** `histogram_quantile` sobre histogramas nativos de Prometheus, el `resets()` de contadores y las series respaldadas por reglas de grabación no tienen una forma limpia en LogQL — y los filtros de línea de texto libre no tienen forma en PromQL.

## Tradúcela sin conjeturas

Mantener ambos dialectos en la cabeza a la vez es exactamente el tipo de cambio de contexto que produce errores silenciosos — un `rate` que significa lo que no debe, un `unwrap` que falta, un selector que compila pero no coincide con nada. El **LogQL ↔ PromQL Helper** hace la parte mecánica por ti: pega una consulta en cualquiera de los dos lenguajes y obtén el equivalente más cercano en el otro, además de notas explícitas sobre qué se correspondió con limpieza y qué no se pudo. Se ejecuta enteramente en tu navegador — tus consultas nunca salen del dispositivo — para que puedas verificar la coherencia de una traducción antes de que llegue a un dashboard o a una regla de alerta.

[Abrir el LogQL ↔ PromQL Helper →](/logql-promql-helper/)
