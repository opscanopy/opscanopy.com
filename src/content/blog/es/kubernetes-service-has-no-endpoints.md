---
title: "Kubernetes Service sin endpoints: el bug del selector"
description: "¿Tu Service de Kubernetes no tiene endpoints o el Deployment dice selector does not match template labels? Un bug, dos síntomas y cómo corregir ambos."
pubDate: 2026-10-12
draft: true
tags: ["kubernetes", "containers", "debugging"]
lang: es
translationOf: "kubernetes-service-has-no-endpoints"
relatedTool:
  name: "Kubernetes Label Selector Tester"
  href: "/kubernetes-label-selector-tester"
---

![El selector de un Service frente a las labels de los pods: los que coinciden entran en un EndpointSlice y de ahí reciben tráfico, mientras que una label distinta deja el Service sin endpoints](/blog/kubernetes-service-has-no-endpoints-hero.svg)
<!-- keywords: primary: kubernetes service has no endpoints (<100, KD n/a) | secondaries: selector does not match template labels, kubernetes service no endpoints, endpoints none kubernetes, kubectl get pods label selector | source: ahrefs free (2026-09-26) -->
<!-- insight: not-Ready pods stay in the EndpointSlice with ready:false (only IP-less/terminal pods drop out); a zero-match Service still gets a placeholder slice showing <unset>, so the IP's location, not the slice's existence, tells selector bug from readiness | serp-checked: 2026-09-26 -->

Los pods están en Running. El Service existe. Cada petición que le llega se queda colgada o es rechazada, y ningún log explica por qué. Haces un describe del Service y encuentras la única línea que importa:

```text
Endpoints:                <none>
```

En las versiones actuales de kubectl esa línea puede aparecer vacía en lugar de `<none>`; es el mismo problema. Tu Service de Kubernetes no tiene endpoints, y ningún componente lo notifica como error. La versión ruidosa del mismo bug aparece cuando, en cambio, aplicas el Deployment:

```text
The Deployment "checkout" is invalid: spec.template.metadata.labels: Invalid value: {"app":"check-out"}: `selector` does not match template `labels`
```

Dos errores, un solo bug: un selector que no coincide con nada.

> **TL;DR**
>
> - Un Service selecciona pods por sus labels. Si ningún conjunto de labels de un pod cumple todas las claves de `spec.selector`, el Service se queda sin endpoints y nadie se queja.
> - Rastréalo en orden: el selector del Service, luego `kubectl get pods -l <selector>`, luego `kubectl get endpointslices -l kubernetes.io/service-name=<svc>` y, por último, la condición `ready` de cada endpoint.
> - Si no hay ninguna IP de pod, el selector no coincide con nada (o los pods todavía no tienen IP). Una IP en el slice con `ready: false` apunta a la readiness, no a las labels.
> - El selector de un Deployment es inmutable en `apps/v1`. Cambiarlo implica borrarlo y recrearlo, con `--cascade=orphan` si los pods tienen que seguir funcionando.

## ¿Qué significa que un Service de Kubernetes no tenga endpoints?

Un Service no sabe nada de Deployments. Guarda un mapa de labels en `spec.selector`, y el controlador de EndpointSlice lista los pods del propio namespace del Service cuyas labels contienen todos los pares de ese mapa. Las IP de esos pods se convierten en los endpoints del Service.

![El spec.selector del Service se compara con las labels de cada pod del mismo namespace; los pods que coinciden y tienen IP se escriben en un EndpointSlice, y cada endpoint lleva una condición ready que decide si recibe tráfico](/blog/kubernetes-service-has-no-endpoints-diagram.svg)

El selector de un Service solo admite igualdad: [la documentación de labels](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#service-and-replicationcontroller) indica que solo se admiten requisitos basados en igualdad, y todos los pares se combinan con AND. Una clave de más, un valor mal escrito o un namespace equivocado, y el conjunto de coincidencias queda vacío.

Un conjunto de coincidencias vacío es válido. El controlador sigue escribiendo un EndpointSlice de relleno sin puertos ni endpoints, así que «existe un slice» no demuestra nada. El síntoma silencioso es todo el modo de fallo, y por eso cuesta tanto encontrarlo. La [sección de Services de la guía de Kubernetes](/learn/guides/kubernetes-for-devops/#services) explica el objeto en sí si necesitas contexto.

## ¿Cómo se rastrea el selector hasta los pods?

Recorre la cadena eslabón a eslabón, empezando por lo que el Service pide de verdad, no por lo que crees que pide:

```bash
kubectl get service checkout -n shop -o jsonpath='{.spec.selector}'
kubectl get pods -n shop -l app=checkout,tier=backend
kubectl get pods -n shop --show-labels
```

El segundo comando usa el selector del Service tal cual, unido con comas. Si no devuelve ningún pod, el bug está en las labels o en el namespace, y puedes dejar de mirar la red. El tercero muestra las labels que llevan realmente los pods, para que las compares clave por clave.

Para revisar ambos manifiestos antes de que lleguen a un clúster, pega el Service en la caja Selector del [Kubernetes Label Selector Tester](/es/kubernetes-label-selector-tester/) (modo selector YAML) y el Deployment en `resources.yaml`.

El tester muestra el Deployment y su plantilla de pod como filas separadas y nombra la cláusula que falla: en la fila de la plantilla de pod marca `tier=frontend` con ✗ y el motivo `label tier="backend" ≠ "frontend"`. Una limitación honesta: muestra el namespace de cada fila pero nunca lo compara, así que un Service en `default` «coincidirá» con un pod en `shop`.

> **Cuidado:** lee la fila "Pod template", no el recuento general. Si el selector del Service se copió de las `metadata.labels` del propio Deployment y estas difieren de las labels de la plantilla, el tester informa "1 of 2 resources matches" porque la fila del Deployment coincide. La fila Pod template falla, y esa es la que selecciona un Service.

El último eslabón es el EndpointSlice. Es la salida real del controlador, así que zanja cualquier discusión. Consúltalo por la label que el controlador estampa en cada slice, como hace la [tarea debug-service](https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/#does-the-service-have-any-endpointslices):

```bash
kubectl get endpointslices -n shop -l kubernetes.io/service-name=checkout
```

Para un Service que no coincide con nada obtienes una fila, la de relleno, y su columna ENDPOINTS muestra `<unset>` en lugar de `<none>`. No verás "No resources found".

`kubectl describe service` es menos directo de lo que parece. Desde kubectl v1.31 lee EndpointSlices, y desde v1.32 su línea `Endpoints:` omite los endpoints que no están listos. Las versiones antiguas de kubectl imprimían `<none>` para un objeto Endpoints vacío; en las nuevas la línea puede aparecer simplemente vacía.

Evita `kubectl get endpoints` para esto. En un API server v1.33 o posterior responde primero con un aviso, porque la API v1 Endpoints está [obsoleta en favor de EndpointSlice](https://kubernetes.io/blog/2025/04/24/endpoints-deprecation/):

```text
Warning: v1 Endpoints is deprecated in v1.33+; use discovery.k8s.io/v1 EndpointSlice
```

## ¿Está el pod en el slice pero no Ready?

Aquí es donde fallan la mayoría de las checklists. Un pod que tiene IP pero no está Ready no sale del EndpointSlice. Sigue listado con `conditions.ready: false`, y consumidores como kube-proxy no le envían tráfico. La [referencia de condiciones](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/#conditions) describe `ready`, `serving` y `terminating`.

Los pods en Pending que aún no tienen IP, y los que han terminado en Succeeded o Failed, quedan fuera por completo. Así que el diagnóstico depende de dónde aparece la IP:

| Lo que ves | A qué apunta |
|---|---|
| Ninguna IP de pod en el slice, ningún pod en `get pods -l` | Discrepancia de selector o de namespace |
| Ninguna IP de pod en el slice, pods en Pending sin IP | Sin planificar, o el sandbox del pod aún no se ha creado |
| IP en el slice, ausente en `describe svc` | Readiness: revisa `conditions.ready` |

Imprime directamente la dirección y la condición ready de cada endpoint:

```bash
kubectl get endpointslices -n shop -l kubernetes.io/service-name=checkout \
  -o jsonpath='{range .items[*].endpoints[*]}{.addresses[0]}{" ready="}{.conditions.ready}{"\n"}{end}'
```

Si las IP están ahí con `ready=false`, las labels están bien y lo que tienes que depurar es tu [readiness probe](/learn/guides/kubernetes-for-devops/#health-probes).

## ¿Qué errores de selector lo provocan y cómo se corrige cada uno?

Revísalos en este orden. Cada uno tiene una señal, una solución y una forma de verificarla.

**1. Error tipográfico o deriva de labels.** Señal: `get pods -l` no devuelve nada, pero `--show-labels` muestra algo casi igual, como `app=Checkout` frente a `app=checkout`. Los valores distinguen mayúsculas de minúsculas. Solución: corrige el lado que esté mal, normalmente el último que se editó. Verificación: `get pods -l` lista los pods.

**2. Selector copiado de las `metadata.labels` del Deployment.** Señal: el selector del Service coincide con las labels del objeto Deployment, no con las de la plantilla de pod. Solución: cópialo de `spec.template.metadata.labels`. Verificación: la fila Pod template del tester pasa.

**3. Namespace equivocado.** Señal: los pods existen, pero no en el `metadata.namespace` del Service. El controlador solo lista pods del propio namespace del Service. Solución: mueve uno de los dos. Verificación: `get pods -n <service-namespace> -l ...` los devuelve.

**4. Pods no Ready, o todavía sin IP.** Señal: aparecen IP con `ready=false`, o los pods están en Pending. Solución: el problema de la probe o de la planificación, no el selector. Verificación: `ready=true` en el slice.

**5. Una clave de más en el selector.** Señal: todas las claves coinciden salvo una, como `tier: frontend` frente a pods con la label `tier: backend`. Solución: quita la clave o añade la label a la plantilla. Verificación: `get pods -l` con el selector completo lista los pods.

> **En la práctica:** la [tarea debug-service](https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/) cita exactamente este bug como un error habitual: un Service que selecciona `app=hostnames` mientras el Deployment, tal como lo creaban las versiones antiguas de `kubectl run`, especifica `run=hostnames`.

## ¿Por qué el Deployment rechaza su propio selector?

El error ruidoso es la misma discrepancia, detectada un nivel antes. El `spec.selector` de un Deployment debe coincidir con su `spec.template.metadata.labels`, y el API server lo impone en la validación, así que `kubectl apply` falla uses el cliente que uses. En `apps/v1` el selector no toma su valor por defecto de la plantilla, así que omitirlo no es una salida: `spec.selector` es obligatorio.

El valor erróneo se imprime de forma distinta según la versión del API server. Desde v1.34 se muestra como JSON, como en el ejemplo del principio. Los servidores más antiguos usan la sintaxis de Go:

```text
The Deployment "checkout" is invalid: spec.template.metadata.labels: Invalid value: map[string]string{"app":"check-out"}: `selector` does not match template `labels`
```

Hay dos errores vecinos que son distintos. Un selector vacío produce `empty selector is invalid for deployment`, y uno ausente se notifica como obligatorio en `spec.selector`. Los StatefulSets y DaemonSets emiten la misma cadena "does not match". La solución siempre es que las labels de la plantilla sean un superconjunto del selector; la [sección de Deployments](/learn/guides/kubernetes-for-devops/#replicasets-and-deployments) de la guía muestra la pareja correcta.

## ¿Se puede cambiar el selector de un Deployment después de crearlo?

No. En `apps/v1` el selector es inmutable, y una actualización que lo cambie falla con `field is immutable`. En un servidor v1.34 o posterior se lee así:

```text
The Deployment "checkout" is invalid: spec.selector: Invalid value: {"matchLabels":{"app":"checkout","tier":"backend"}}: field is immutable
```

La [documentación de Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#label-selector-updates) deja claro que `kubectl patch`, `kubectl edit`, `kubectl apply` y `helm upgrade` chocan todos con esto. El camino es borrar y recrear. Borrar un Deployment borra sus pods por defecto, lo que supone caída del servicio, así que déjalos huérfanos:

```bash
kubectl delete deployment checkout -n shop --cascade=orphan
kubectl apply -f deployment.yaml
kubectl get replicasets -n shop
```

El ReplicaSet huérfano mantiene sus pods atendiendo tráfico mientras se despliega el nuevo Deployment. Cuando los pods nuevos estén Ready y en el slice, borra cualquier ReplicaSet que no pertenezca a ningún Deployment.

> **Consejo:** cambia el selector del Service en último lugar. Si le añades una clave antes de que los pods nuevos lleven esa label, el Service no coincide con nada y sus endpoints se vacían al instante.

## ¿Corregir targetPort recupera los endpoints?

Esta es la solución que no soluciona nada. Un `targetPort` numérico erróneo nunca vacía la lista de endpoints: el controlador copia el número y lista el pod de todos modos. El tráfico falla entonces en el puerto, lo que desde fuera se parece, pero es otro bug. Cambiarlo no hará que se llene un slice vacío.

Un `targetPort` con nombre que el pod no declara es más sutil. El EndpointSlice sigue listando la dirección del pod, pero el puerto se descarta, así que la columna PORTS muestra `<unset>`. El controlador heredado de Endpoints va más allá y omite el pod de ese subset, de modo que cualquier cosa que siga leyendo Endpoints muestra el pod como ausente.

Reiniciar los pods o recrear el Service no cambia ninguno de los dos casos. Si querías un puerto con nombre, comprueba que el contenedor declare un puerto con exactamente ese nombre, como pide la checklist de debug-service. Si no, deja `targetPort` en paz y vuelve a las labels.

## ¿Qué revisar cuando un Service de Kubernetes no tiene endpoints?

Una rutina breve que cubre todas las causas anteriores, y también el error ruidoso:

1. Imprime el `spec.selector` del Service con `-o jsonpath` y anota su namespace.
2. Ejecuta `kubectl get pods -n <namespace> -l <selector>`. Si sale vacío, son las labels o el namespace.
3. Compara con `kubectl get pods --show-labels`, clave por clave y respetando mayúsculas.
4. Confirma que el selector se copió de `spec.template.metadata.labels`, no de las labels del propio Deployment.
5. Consulta `kubectl get endpointslices -l kubernetes.io/service-name=<svc>`. Unos endpoints `<unset>` son el slice de relleno, no un resultado.
6. Si hay IP, lee `conditions.ready`; `false` te lleva a la readiness probe.
7. Si un Deployment no se aplica, haz que su selector coincida con las labels de su plantilla. Si hay que cambiar el propio selector, bórralo con `--cascade=orphan` y recréalo.
8. Deja `targetPort` para el final, y sospecha de él solo cuando lo que falta es el puerto, no el endpoint.

Si el problema es de memoria y no de selectores, el artículo hermano sobre [OOMKilled y el exit code 137](/blog/kubernetes-oomkilled-exit-code-137/) sigue la misma rutina de confirmar y luego corregir.

Pega tu Service y tu Deployment en el [Kubernetes Label Selector Tester](/es/kubernetes-label-selector-tester/) antes del próximo apply, y lee la fila Pod template.

¿Qué label se ha desviado en tu clúster: un `app` renombrado o un `tier` que nadie recuerda haber añadido?
