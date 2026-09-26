---
title: "Datasource ${DS_PROMETHEUS} was not found: causa y solución"
description: "Por qué Grafana dice Datasource ${DS_PROMETHEUS} was not found en dashboards provisionados, cómo hallar cada placeholder con jq y cuatro arreglos para CI."
pubDate: 2026-10-19
draft: true
tags: ["observability", "prometheus"]
lang: es
translationOf: "grafana-datasource-was-not-found"
relatedTool:
  name: "Grafana Dashboard Validator"
  href: "/grafana-dashboard-validator"
---

![Un dashboard de Grafana exportado cuyos paneles siguen apuntando a un placeholder DS_PROMETHEUS sin rellenar en lugar de a un datasource de Prometheus real](/blog/grafana-datasource-was-not-found-hero.svg)
<!-- keywords: primary: datasource ${ds_prometheus} was not found (<100, n/a) | secondaries: grafana ds_prometheus not found, ds_prometheus not found, grafana datasource not found, grafana __inputs | source: ahrefs free (2026-09-26) -->
<!-- insight: the error text is a lookup key: the exporter names the placeholder from the datasource NAME (first space only), TemplateSrv returns an unknown ${...} unchanged, and provisioning, POST /api/dashboards/db and Terraform store the file verbatim, so DS_* inputs carry no value to substitute, still true in 13.2 | serp-checked: 2026-09-26 -->

Exportaste un dashboard desde staging, subiste el JSON junto a tu configuración de provisioning y reiniciaste Grafana. El dashboard aparece en la carpeta correcta. Todos los paneles están vacíos, y cada uno lleva la misma esquina roja:

```text
Datasource ${DS_PROMETHEUS} was not found
```

Tu datasource de Prometheus existe y funciona en Explore. Este error de datasource no encontrado en Grafana, que mucha gente busca como "DS_PROMETHEUS not found", no significa que falte el datasource. Grafana imprime tal cual la clave de búsqueda que recibió, y esa clave es un placeholder que nadie rellenó. En cuanto lo ves así, la solución es mecánica.

> **TL;DR**
>
> - La opción de exportar para compartir ("Export for sharing externally" en Grafana 10 a 11) cambia cada datasource por `${DS_<NAME>}` y los enumera en `__inputs`. Solo el diálogo Import y la API de importación los rellenan.
> - El provisioning por archivos, `POST /api/dashboards/db` y Terraform guardan el archivo tal cual, así que el placeholder llega hasta el panel.
> - Para encontrarlos: `jq -r 'paths(type == "string" and startswith("${DS_")) | map(tostring) | join(".")' dashboard.json`.
> - Se corrige sustituyendo un `{ type, uid }` real, fijando ese uid en el provisioning del datasource, añadiendo una variable de datasource llamada `DS_PROMETHEUS` o enviando el dashboard a `/api/dashboards/import` con `inputs`.

## ¿Por qué Grafana dice "Datasource ${DS_PROMETHEUS} was not found"?

La referencia al datasource de un panel pasa por `DatasourceSrv.get()`, que procesa el uid con el servicio de plantillas antes de buscarlo. El servicio de plantillas devuelve [sin cambios](https://github.com/grafana/grafana/blob/v13.2.2/public/app/features/templating/template_srv.ts) cualquier `${...}` para el que no tenga variable. Así que la clave sigue siendo la cadena literal `${DS_PROMETHEUS}`, ningún datasource tiene ese uid ni ese nombre, y [`loadDatasource()`](https://github.com/grafana/grafana/blob/v13.2.2/public/app/features/plugins/datasource_srv.ts) rechaza la petición con el mensaje que ves.

El placeholder llegó ahí durante la exportación. Con la opción de exportar activada, Grafana escribe esto:

```json
{
  "__inputs": [
    {
      "name": "DS_PROMETHEUS",
      "label": "Prometheus",
      "description": "",
      "type": "datasource",
      "pluginId": "prometheus",
      "pluginName": "Prometheus"
    }
  ],
  "panels": [
    {
      "type": "timeseries",
      "title": "Request rate",
      "datasource": { "type": "prometheus", "uid": "${DS_PROMETHEUS}" },
      "targets": [
        {
          "datasource": { "type": "prometheus", "uid": "${DS_PROMETHEUS}" },
          "expr": "sum(rate(http_requests_total{job=\"$job\"}[5m]))"
        }
      ]
    }
  ],
  "templating": {
    "list": [
      {
        "type": "query",
        "name": "job",
        "datasource": { "type": "prometheus", "uid": "${DS_PROMETHEUS}" },
        "query": "label_values(up, job)"
      }
    ]
  }
}
```

`__inputs` es una pregunta para quien importa: ¿cuál de tus datasources debe sustituir a `DS_PROMETHEUS`? El diálogo Import la formula. Después, el [evaluador de plantillas](https://github.com/grafana/grafana/blob/v13.2.2/pkg/services/dashboardimport/utils/dash_template_evaluator.go) del servidor reemplaza cada `${name}` declarado por el valor que elegiste y elimina `__inputs`.

Nada más la formula. Un comentario del propio código de Grafana en [export_inputs.go](https://github.com/grafana/grafana/blob/v13.2.2/apps/dashboard/pkg/migration/conversion/export_inputs.go) dice que una plantilla escrita mediante Terraform, provisioning o un POST directo "is stored verbatim" y que "DS_* inputs carry no value to substitute". La petición para soportarlo en provisioning, [grafana/grafana#10786](https://github.com/grafana/grafana/issues/10786), está abierta desde 2018.

> **Importante:** Grafana 13.2.0 ([#129213](https://github.com/grafana/grafana/pull/129213)) empezó a resolver los inputs constantes `${VAR_*}` en dashboards guardados mediante provisioning o un POST directo. Deja explícitamente sin resolver los inputs `DS_*`, así que en 13.2.2 este error se comporta exactamente igual que antes.

En Grafana 7.x y las primeras 8.x el mismo fallo decía `Datasource named ${DS_PROMETHEUS} was not found`, la redacción que citan la mayoría de los hilos de los foros. Una variable de consulta que apunta al placeholder aparece en cambio como un aviso de templating, que en los hilos se recoge como `Error updating options: Datasource named ${DS_PROMETHEUS} was not found` o `Failed to upgrade legacy queries Datasource ${DS_PROMETHEUS} was not found`.

## ¿De dónde sale el nombre DS_PROMETHEUS?

Del nombre visible del datasource, no de su tipo. El [exportador](https://github.com/grafana/grafana/blob/v13.2.2/public/app/features/dashboard-scene/scene/export/exporters.ts) lo construye como `'DS_' + ds.name.replace(' ', '_').toUpperCase()`. Obtienes `DS_PROMETHEUS` solo porque el nombre por defecto es "Prometheus". Un datasource llamado "Thanos" se exporta como `${DS_THANOS}`.

Ese `replace` de JavaScript con un patrón de tipo cadena cambia solo el primer espacio. Un datasource llamado "Prometheus Prod EU" se exporta como `${DS_PROMETHEUS_PROD EU}`, con el espacio incluido. Las referencias de library panels reciben el sufijo `-FOR-LIBRARY-PANEL`, y las variables constantes se convierten en inputs `VAR_<NAME>`.

La opción que produce todo esto ha cambiado de sitio entre versiones:

- Grafana 10 a 11: **Export for sharing externally**.
- Grafana 11.2 a 12.3 también la rotulan **Export the dashboard to use in another instance** (de 12.1 a 12.3 se llega por **Export** → **Export as code**).
- Grafana 12.4 y 13: **Export** → **Export as code**, opción **Share dashboard with another instance**, con un modelo Classic o V2 Resource en Advanced options.

Si exportas para tu propio repositorio de provisioning, deja la opción desactivada. La [documentación sobre compartir](https://grafana.com/docs/grafana/latest/dashboards/share-dashboards-panels/) detalla las opciones de cada versión.

## ¿Cómo confirmas qué placeholders hay en el archivo?

Tres comprobaciones, en este orden. Primero, enumera lo que el archivo espera que se rellene:

```bash
jq -c '.__inputs[] | {name, pluginId}' dashboard.json
```

```text
{"name":"DS_PROMETHEUS","pluginId":"prometheus"}
```

Segundo, busca cada cadena que todavía contenga un placeholder, incluidas las de las variables de consulta. Mantén el filtro entre comillas simples para que la shell no expanda `${DS_...}`:

```bash
jq -r 'paths(type == "string" and startswith("${DS_")) | map(tostring) | join(".")' dashboard.json
```

```text
panels.0.datasource.uid
panels.0.targets.0.datasource.uid
templating.list.0.datasource.uid
```

`grep -nF '${DS_' dashboard.json` da la misma respuesta con números de línea. Tercero, enumera los uids que existen de verdad en la instancia de destino. `GET /api/datasources` devuelve `id`, `uid`, `orgId`, `name` y `type`, según la [documentación de la API de data sources](https://grafana.com/docs/grafana/latest/developers/http_api/data_source/):

```bash
curl -sS -H "Authorization: Bearer $GRAFANA_TOKEN" "$GRAFANA_URL/api/datasources" \
  | jq -r '.[] | [.uid, .name, .type] | @tsv'
```

Para ahorrarte el jq, pega el JSON del dashboard en el [Grafana Dashboard Validator](/es/grafana-dashboard-validator/). Con el archivo exportado de arriba informa de un error, bajo la regla [unresolved-ds-input](/es/grafana-dashboard-validator/#rule-unresolved-ds-input). Los avisos que lo acompañan se deben al extracto recortado, que no tiene uid, title, gridPos ni schemaVersion:

```text
[error] unresolved-ds-input @ __inputs[0]
"__inputs" declares "DS_PROMETHEUS", an import placeholder that only the Grafana import dialog fills in.
```

Su límite: solo lee el archivo. Un dashboard con un uid de aspecto real, como `P1809F7CD0C75ACF3`, pasa tanto si ese uid existe en tu instancia como si no, así que compruébalo contra `/api/datasources`.

## ¿Cuál es tu causa?

| Lo que ves | Causa más probable |
|---|---|
| Hay `__inputs` y el archivo lo carga el provisioning o Terraform | Un archivo solo para importar usado como archivo provisionado |
| No hay `__inputs`, pero sigue habiendo `${DS_...}` en los paneles | Placeholders que quedaron tras borrar `__inputs` |
| El error nombra un uid de aspecto real, no un placeholder | El uid difiere entre instancias |
| Existe la variable `DS_PROMETHEUS`, pero no es `type: datasource` | Variable con el tipo equivocado |

**1. Se provisionó un archivo exportado.** Señal: `__inputs` está presente y el dashboard entró por el proveedor de archivos, `/api/dashboards/db` o Terraform. Solución: sustituye un uid real o cárgalo mediante la API de importación. Verificación: el recuento de placeholders de más abajo da 0.

**2. Placeholders sin `__inputs`.** Señal: alguien borró `__inputs`, o un chart empaquetó el dashboard sin él. El diálogo Import ya no tiene nada que preguntar, y el error sobrevive a una importación desde la interfaz. Solución: sustituye o añade la variable de datasource. Verificación: los paneles se muestran tras recargar.

**3. El uid no existe aquí.** Señal: tras la sustitución, el error imprime un uid. Grafana genera un uid automáticamente cuando el provisioning no lo define, así que staging y producción no coinciden. Solución: fija el uid en el provisioning del datasource. Verificación: `/api/datasources` lo lista.

**4. Una variable con el nombre correcto pero el tipo equivocado.** Señal: `templating.list` contiene `DS_PROMETHEUS`, pero como variable custom. Se resuelve a su propio valor, no al uid de un datasource. Solución: conviértela en `type: datasource`. Verificación: el guard de CI de más abajo imprime 0 para ese archivo.

Si el mensaje lleva dos puntos, `Datasource: ${DS_PROMETHEUS} was not found`, lo que falló fue la carga del plugin. Es otro problema.

## ¿Cómo se corrige para el provisioning y la API?

**Sustituye un uid real.** Este `walk` reemplaza cada objeto con placeholder, incluido el de la variable de consulta, y elimina las claves que solo sirven para importar:

```bash
jq --arg uid P1809F7CD0C75ACF3 \
  'walk(if type == "object" and .uid == "${DS_PROMETHEUS}"
        then .uid = $uid else . end)
   | del(.__inputs, .__requires)' \
  dashboard.json > dashboard.provisioned.json
```

Prueba el filtro con tu propio archivo en el [jq playground](/es/jq-playground/), que ejecuta jq de verdad.

**Fija el uid para que coincida en todas partes.** Define `uid` en el provisioning del datasource y el valor sustituido será cierto en todas las instancias:

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    uid: prometheus-main
    access: proxy
    url: http://prometheus:9090
```

El proveedor de dashboards no necesita nada especial, pero ten en cuenta que nunca lee `__inputs`:

```yaml
apiVersion: 1
providers:
  - name: platform
    orgId: 1
    folder: Platform
    type: file
    disableDeletion: true
    updateIntervalSeconds: 30
    allowUiUpdates: false
    options:
      path: /var/lib/grafana/dashboards
```

Ambos formatos están en la [documentación de provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/).

**Conserva el placeholder y defínelo.** Una variable de tipo datasource con exactamente el nombre del placeholder resuelve `${DS_PROMETHEUS}` a un uid real. Su `query` es el id del plugin:

```json
{
  "templating": {
    "list": [
      { "type": "datasource", "name": "DS_PROMETHEUS", "query": "prometheus" }
    ]
  }
}
```

**Usa la API de importación.** `POST /api/dashboards/import` es el endpoint al que envía el diálogo Import. Requiere `dashboards:create` y no aparece en la documentación actual de la API HTTP, así que su forma sale del código fuente. Sustituye `<folder-uid>` por el uid real de la carpeta de destino: el proveedor de arriba crea la carpeta por su título, así que su uid no tiene por qué ser `platform`.

```bash
jq -n --slurpfile dash dashboard.json \
  --arg uid prometheus-main --arg folder '<folder-uid>' \
  '{dashboard: $dash[0], overwrite: true, folderUid: $folder,
    inputs: [{name: "DS_PROMETHEUS", type: "datasource",
              pluginId: "prometheus", value: $uid}]}' \
  > payload.json

curl -sS -X POST \
  -H "Authorization: Bearer $GRAFANA_TOKEN" \
  -H "Content-Type: application/json" \
  --data @payload.json "$GRAFANA_URL/api/dashboards/import"
```

Si omites un input, falla con HTTP 400 y el mensaje dentro de un cuerpo JSON:

```json
{"message":"dashboard import failed: missing dashboard input variable DS_PROMETHEUS"}
```

## ¿Borrar __inputs es la solución que no soluciona nada?

Sí. Borrar `__inputs` hace que el archivo parezca un dashboard normal, pero cada `${DS_PROMETHEUS}` sigue ahí. El error pasa de "provisionado mal" a la causa 2, y ahora ni siquiera el diálogo Import puede repararlo, porque el evaluador solo sustituye los nombres declarados en `__inputs`.

La segunda falsa solución es cambiar el placeholder por el nombre del datasource, `"Prometheus"`. Grafana busca una clave por uid y después por nombre, así que funciona hasta que alguien renombra el datasource u otra instancia lo llama de otra forma. Por eso el validador marca esa forma de cadena simple con la regla [datasource-by-name](/es/grafana-dashboard-validator/#rule-datasource-by-name).

> **Cuidado:** renombrar el datasource para que coincida con el placeholder no cambia nada. El panel busca un datasource cuyo uid o nombre sea el literal `${DS_PROMETHEUS}`.

## ¿Cómo evitas que vuelva en CI?

Haz fallar el pipeline cuando un dashboard subido al repositorio todavía tenga un placeholder que ninguna variable de datasource define:

```bash
status=0
for f in dashboards/*.json; do
  n=$(jq '[.templating.list[]? | select(.type == "datasource") | .name] as $vars
    | [.. | strings | select(startswith("${DS_"))
       | ltrimstr("${") | rtrimstr("}")
       | select(IN($vars[]) | not)] | length' "$f")
  if [ "$n" -ne 0 ]; then echo "$f: $n unresolved placeholder(s)"; status=1; fi
done
exit "$status"
```

Con el archivo exportado imprime 3 para ese dashboard. Tras la sustitución con `walk`, o con la variable de datasource `DS_PROMETHEUS` en su sitio, imprime 0.

Recorre los archivos uno a uno en lugar de pasar un glob a `jq -e`, que fija su código de salida solo a partir de la última salida. Ejecuta el guard en el mismo job que copia los dashboards a la ruta de provisioning, para que un archivo que falla nunca llegue a Grafana.

Combínalo con la comprobación de uids, porque un archivo limpio puede seguir nombrando un uid que falta en algún entorno. La misma disciplina se aplica a las consultas que contiene: [Cómo leer una consulta de PromQL](/es/blog/reading-promql/) explica qué preguntan los paneles, y [LogQL vs PromQL](/es/blog/logql-vs-promql/) ayuda cuando hay un panel de Loki al lado.

## ¿Qué revisar antes de publicar un archivo de dashboard?

1. Exporta con la opción de compartir desactivada cuando el archivo sea para tu propio repositorio de provisioning.
2. Ejecuta el filtro `paths(...)` y revisa cada ubicación que imprima.
3. Enumera los uids con `GET /api/datasources` en cada instancia de destino.
4. Fija esos uids en el provisioning de datasources, para que todos los entornos coincidan.
5. Sustituye con `walk`, o añade una variable de datasource por cada placeholder.
6. Elimina `__inputs` y `__requires` solo después de la sustitución.
7. Usa `/api/dashboards/import` con `inputs` si necesitas conservar el archivo compartible.
8. Añade el guard de CI y haz que sea obligatorio antes del despliegue.

Antes de que el próximo dashboard llegue a tu carpeta de provisioning, pégalo en el [Grafana Dashboard Validator](/es/grafana-dashboard-validator/) y corrige lo que marque.

¿Mantienes los dashboards exportados para compartir y los provisionados como archivos separados, o generas uno a partir del otro en CI?
