---
title: "Cómo leer una consulta de PromQL"
description: "Una consulta de PromQL se lee de dentro hacia afuera, no de izquierda a derecha. Aprende las cuatro capas —selectores, rangos, funciones y agregaciones— para que puedas descifrar cualquier expresión de Prometheus de un vistazo."
pubDate: 2026-06-08
tags: ["promql", "prometheus", "observability"]
lang: es
translationOf: "reading-promql"
---

![Cómo leer una consulta de PromQL: descifrar de dentro hacia afuera los selectores, rangos, funciones y agregaciones de Prometheus](/blog/reading-promql-hero.svg)

PromQL parece denso la primera vez que te lo encuentras. Una línea como `histogram_quantile(0.99, sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))` se lee como una sola palabra larga, y el instinto es recorrerla de izquierda a derecha como una frase. Esa es la dirección equivocada. PromQL es un lenguaje funcional, así que el significado fluye desde la expresión **más interna** hacia afuera, igual que evaluarías una fórmula anidada en matemáticas. Una vez que lo lees de dentro hacia afuera, casi toda consulta se descompone en las mismas cuatro capas.

## Las cuatro capas

Casi toda expresión de PromQL no trivial se construye a partir de estas, apiladas de dentro hacia afuera:

1. **Un selector**: de qué series partes.
2. **Un rango**: sobre qué ventana de tiempo (solo cuando necesitas historial, no un instante).
3. **Una función**: qué transformación aplicas a esas muestras.
4. **Una agregación**: cómo colapsas muchas series en menos.

Léelas en ese orden y la consulta se explica sola.

![Una consulta de PromQL descompuesta en nombre de métrica, comparador de etiquetas, selector de rango, función rate y agregación](/blog/reading-promql-diagram.svg)

## Capa 1: el selector

El núcleo de cualquier consulta es un **selector de métrica**: un nombre de métrica más comparadores de etiquetas opcionales entre llaves.

```promql
http_requests_total{job="api", status=~"5.."}
```

Esto selecciona toda serie llamada `http_requests_total` donde la etiqueta `job` es igual a `api` y la etiqueta `status` coincide con la expresión regular `5..` (cualquier código 5xx). Los comparadores son la parte importante:

- `=` coincidencia exacta
- `!=` no igual
- `=~` coincidencia con expresión regular
- `!~` la expresión regular no coincide

Por sí solo, un selector devuelve un **vector instantáneo**: una muestra actual por cada serie que coincide. Esa distinción importa para todo lo que sigue.

## Capa 2: el rango

Añade una duración entre corchetes y el selector se convierte en un **vector de rango**: cada muestra de esa ventana, por serie, no solo la última.

```promql
http_requests_total{job="api"}[5m]
```

No puedes graficar un vector de rango directamente; es materia prima. Se lo pasas a una función que sabe qué hacer con una ventana de muestras. El ejemplo clásico es `rate`:

```promql
rate(http_requests_total{job="api"}[5m])
```

`rate` examina las muestras del contador durante los últimos 5 minutos y devuelve la tasa de incremento media por segundo. Este es el patrón más común en Prometheus, y vale la pena interiorizar por qué existe: `http_requests_total` es un **contador** que solo sube (hasta que un reinicio lo restablece), así que su valor en bruto carece de sentido en un panel. Lo que de verdad te importa es la tasa de cambio. `rate` también gestiona de forma transparente los reinicios del contador, razón por la cual nunca deberías calcular tasas a mano.

Una breve nota sobre el tamaño de la ventana: el rango (`[5m]`) debería cubrir holgadamente al menos unos cuantos intervalos de scrape. Demasiado corto y obtienes resultados ruidosos y con huecos; demasiado largo y suavizas hasta hacer desaparecer los picos que intentabas capturar.

![Ilustración: una consulta de PromQL como capas apiladas iluminadas en neón — selectores en la base, luego rangos, funciones y agregación — leída de dentro hacia afuera](/blog/in-content/reading-promql.webp)

## Capa 3: funciones

Las funciones transforman vectores. Las que verás constantemente:

- `rate(...)`: tasa media por segundo de un contador sobre un rango.
- `irate(...)`: tasa instantánea a partir de las dos últimas muestras; más abrupta, buena para gráficos de cambio rápido.
- `increase(...)`: incremento total sobre el rango (esencialmente `rate × seconds`).
- `histogram_quantile(φ, ...)`: estima un cuantil (p. ej. p99) a partir de los buckets de un histograma.
- Comparaciones del estilo `rate(...[5m]) > 0`: filtrado, cubierto más abajo.

Así que `rate(http_requests_total{job="api", status=~"5.."}[5m])` se lee, de dentro hacia afuera, como: *toma el contador de peticiones 5xx del job api, sobre una ventana de 5 minutos, y dame la tasa de error por segundo, por serie.*

## Capa 4: agregación

Un selector con una etiqueta `job` y una etiqueta `status` todavía puede coincidir con docenas de series: una por instancia, por pod, por código de estado. Los operadores de agregación las colapsan.

```promql
sum by (job) (rate(http_requests_total{status=~"5.."}[5m]))
```

`sum by (job)` suma las tasas por serie, conservando **solo** la etiqueta `job` y descartando el resto. El resultado es una línea de tasa de error por cada job. Las dos cláusulas que hay que conocer:

- `by (labels)`: conserva estas etiquetas, agrega todo lo demás.
- `without (labels)`: agrega estas etiquetas, conserva todo lo demás.

Otros agregadores siguen la misma gramática: `avg`, `max`, `min`, `count`, `topk`, `quantile`. El modelo mental nunca cambia: *combinar muchas series en menos, agrupadas por las etiquetas que yo nombre.*

## Juntándolo todo

Ahora la intimidante consulta del principio se descompone con limpieza. Léela de dentro hacia afuera:

```promql
histogram_quantile(
  0.99,
  sum by (le, route) (
    rate(http_request_duration_seconds_bucket[5m])
  )
)
```

1. `http_request_duration_seconds_bucket[5m]`: los buckets del histograma de latencia, sobre 5 minutos.
2. `rate(...)`: tasa por segundo de cada bucket, de modo que los reinicios y el escalado quedan gestionados.
3. `sum by (le, route) (...)`: suma las tasas entre instancias, conservando `le` (el límite del bucket, requerido por el siguiente paso) y `route`.
4. `histogram_quantile(0.99, ...)`: estima la latencia del percentil 99 a partir de esos buckets, por ruta.

En lenguaje llano: **la latencia de petición p99 por ruta durante los últimos 5 minutos.** Una capa a la vez, no es nada densa.

## Algunas trampas que conviene conocer

- **Agregar antes de aplicar rate.** `rate(sum(...))` es casi siempre un error. Aplica primero el `rate` y luego `sum`: sumar contadores a través de reinicios da resultados sin sentido. La forma correcta es `sum(rate(...))`.
- **Descartar `le`.** `histogram_quantile` necesita la etiqueta `le` intacta, así que tu cláusula `by (...)` debe incluirla.
- **Las comparaciones filtran, no solo colorean.** `rate(...)[5m]) > 0` no devuelve booleanos: *descarta* toda serie donde la condición sea falsa. Así es como construyes expresiones de alerta.
- **Desajuste entre instantáneo y rango.** Pasar un vector instantáneo donde una función espera un vector de rango (o viceversa) es el error de análisis más común. Si una función se queja, revisa tus corchetes.

## Descifra cualquier consulta en segundos

El método de dentro hacia afuera funciona en toda expresión de PromQL que te encuentres, pero desmenuzar a mano una consulta de producción profundamente anidada sigue siendo tedioso, y es fácil equivocarse de forma sutil bajo presión. Para eso existe precisamente el **PromQL Explainer**: pega cualquier consulta de Prometheus y obtén un desglose en lenguaje llano, capa por capa, de sus selectores, rangos, funciones, agregaciones y comparaciones. Todo se ejecuta en el lado del cliente, así que tus consultas nunca salen del navegador.

La próxima vez que un panel de un dashboard o una regla de alerta te deje entrecerrando los ojos, no lo adivines.

[Explica una consulta de PromQL →](/promql-explainer/)
