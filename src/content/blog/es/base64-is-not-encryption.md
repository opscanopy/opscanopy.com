---
title: "Base64 no es cifrado: cómo proteger de verdad una API key"
description: "¿Base64 es cifrado? No. Qué hace Base64, por dónde se filtran los secretos codificados, qué protege de verdad una API key y cuándo Base64 es la herramienta adecuada."
pubDate: 2026-09-08
tags: ["security", "developer-experience"]
lang: es
translationOf: "base64-is-not-encryption"
relatedTool:
  name: "Base64 Encoder / Decoder"
  href: "/base64-encoder-decoder"
---

![Una API key codificada en Base64 y decodificada de inmediato, lo que muestra que la codificación no protege nada](/blog/base64-is-not-encryption-hero.svg)
<!-- keywords: is base64 encryption | base64 vs encryption, base64 decode, how to secure an api key, kubernetes secret base64 | source: marketing brief, ahrefs unchecked (2026-10-04) -->

Llega un pull request con un archivo de configuración que contiene esta línea:

```yaml
PAYMENTS_API_KEY: b3BzX2xpdmVfN2YzYTljMmU=
```

La nota del autor dice que la clave está «codificada, así que se puede commitear». No se puede. Cualquiera que lea esa línea recupera la clave con un solo comando, y lo mismo hace cada escáner que rastrea repositorios públicos buscando justo este patrón.

> **TL;DR**
>
> - Base64 es una codificación. No tiene clave, así que cualquiera puede revertirla al instante.
> - El `Secret.data` de Kubernetes está en Base64 porque YAML necesita texto, no porque oculte nada.
> - Lo que protege una clave es dónde vive y quién puede leerla: un gestor de secretos o un KMS, inyección en tiempo de ejecución, alcance reducido, rotación y TLS en tránsito.
> - Base64 es la herramienta correcta para mover bytes por canales que solo admiten texto. Para eso sirve, y para nada más.

## Qué hace realmente Base64

Base64, definido en el RFC 4648, convierte bytes arbitrarios en una cadena formada por 64 caracteres imprimibles: `A–Z`, `a–z`, `0–9`, `+` y `/`, con `=` como relleno. Lee la entrada de tres en tres bytes (24 bits) y escribe cuatro caracteres de seis bits cada uno. Los tres bytes ASCII de `Man` salen como `TWFu`.

Esa proporción de 3 a 4 explica por qué los datos codificados ocupan aproximadamente un 33 % más que el original. Cuando la longitud de la entrada no es múltiplo de tres, la salida recibe uno o dos `=` para que su longitud siga siendo múltiplo de cuatro.

El mismo RFC define una variante segura para URL, base64url, que cambia `+` por `-` y `/` por `_` para que el resultado pueda ir en una URL o en un nombre de archivo. Los JWT la usan, normalmente sin el relleno.

En todo ese proceso no hay ningún secreto. Decodificar es leer la misma tabla al revés:

```bash
printf '%s' 'b3BzX2xpdmVfN2YzYTljMmU=' | base64 -d
# ops_live_7f3a9c2e
```

En versiones antiguas de macOS la opción es `-D`; `--decode` funciona tanto en GNU como en BSD.

> **Consejo:** usa `printf '%s'` o `echo -n` al codificar. Un `echo` a secas añade un salto de línea, y ese salto también se codifica. Un valor Base64 que termina en `Cg==` suele indicar que alguien codificó `"value\n"` por accidente, y ese salto de línea sobrante rompe la credencial sin hacer ruido.

## ¿Base64 es cifrado? Por qué lo parece y por qué no lo es

El cifrado transforma los datos con una clave, de modo que la salida no le sirve a nadie que no tenga esa clave. Base64 no tiene clave. El algoritmo es público, idéntico en todas partes y cualquiera puede revertirlo.

*Parece* cifrado porque, a simple vista, la salida es ilegible para una persona. `YWRtaW46aHVudGVyMg==` no dice claramente `admin:hunter2`, así que da la sensación de estar protegido. No lo está. El disfraz aguanta un vistazo rápido y nada más, y los escáneres automáticos de secretos decodifican Base64 de forma rutinaria.

### El caso de los Secrets de Kubernetes

La fuente más habitual de esta confusión es Kubernetes. Un manifiesto `Secret` guarda sus valores codificados en Base64 bajo `data`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: payments
type: Opaque
data:
  api-key: b3BzX2xpdmVfN2YzYTljMmU=
```

La codificación existe para que los valores binarios, como un keystore o un certificado, quepan en un manifiesto de texto. El campo `stringData` acepta los mismos valores en texto plano y el API server los codifica por ti, lo que demuestra lo poco que protege la codificación.

La documentación de Kubernetes lo dice de forma explícita: por defecto, los Secrets se guardan sin cifrar en el almacén de datos del API server, etcd. El cifrado en reposo se activa aparte, con una `EncryptionConfiguration` en el API server o con un proveedor KMS. Base64 no forma parte de ello.

## Por dónde se filtran los secretos codificados en Base64

Como la codificación no oculta nada, un secreto codificado se filtra por cualquier canal por el que se filtraría uno en texto plano. Los habituales:

- **Historial de Git.** Un manifiesto de Secret o un archivo `.env` commiteado sigue en el historial aunque lo borres de la punta de la rama. Quitar la línea en un commit posterior no elimina la clave. Rótala y, después, plantéate reescribir el historial.
- **Logs.** Un log de depuración que vuelca una petición, un entorno o una configuración renderizada escribe el valor codificado junto a todo lo demás. Luego los pipelines de logs lo copian a sitios con permisos de lectura más amplios.
- **`kubectl get secret -o yaml`.** Quien tenga `get` sobre los Secrets de un namespace puede leer todos sus valores, y ese permiso suele ser más amplio de lo previsto. Una salida pegada en un ticket o en un chat se lleva las claves consigo.
- **Bundles de cliente.** Una clave que viaja en el JavaScript del front-end o en una app móvil es pública, esté codificada o no. Cualquiera puede abrir las DevTools o desempaquetar la app y decodificarla.
- **Imágenes de contenedor.** Una clave incrustada con `ENV` o copiada durante un build se queda en las capas de la imagen, y `docker history` o la extracción de una capa la mostrarán.

> **Cuidado:** si una clave real se ha commiteado, se ha registrado en logs o ha salido en un bundle, la solución es rotarla. Borrar el archivo o hacer privado el repositorio cierra la exposición futura. No te dice quién la ha leído ya.

## Cómo proteger de verdad una API key

Ningún paso aislado lo resuelve. La protección viene de controlar dónde vive una clave, quién puede leerla y cuánto daño hace si se escapa.

### Guárdala en un gestor de secretos o un KMS

Usa un almacén diseñado para ello: AWS Secrets Manager o SSM Parameter Store, Google Secret Manager, Azure Key Vault o HashiCorp Vault. Cifran los valores en reposo con claves que no manejas directamente, registran cada lectura y ponen el acceso detrás de políticas IAM que puedes auditar. En Kubernetes, activa el cifrado en reposo para los Secrets y ajusta RBAC para que pocas identidades puedan hacerles `get`. Herramientas como External Secrets Operator o Sealed Secrets mantienen el texto plano fuera de tus manifiestos.

### Inyéctala en tiempo de ejecución

Haz que la aplicación lea la clave al arrancar, desde el almacén de secretos o desde una variable de entorno o un archivo montado que rellena la plataforma. Así la clave nunca aparece en el código fuente, en las imágenes ni en los logs de build. Mantén en el repositorio un `.env.example` con nombres de ejemplo y deja fuera el `.env` real. El [.env example checker](/env-example-checker/) señala las diferencias entre ambos.

### Limita su alcance

Emite claves con el conjunto mínimo de permisos que necesita la tarea: solo lectura donde basta con leer, una clave por servicio y entorno, restricciones por IP o referrer donde el proveedor las admita. Una clave de staging de solo lectura filtrada es una molestia. Una clave de administración de producción filtrada es un incidente.

### Rótala

Las claves con caducidad y la rotación programada limitan cuánto tiempo sigue siendo útil una filtración. Convierte la rotación en rutina: el día que la necesites será el día en que una clave se haya escapado.

### Cífrala en tránsito con TLS

Envía las claves solo por HTTPS. La autenticación HTTP Basic (RFC 7617) envía `username:password` en Base64 en la cabecera `Authorization`, y sobre HTTP plano cualquiera en el camino puede decodificarla. TLS protege el canal. Base64 solo da formato a la cabecera.

## Cuándo Base64 es la herramienta adecuada

Nada de esto hace que Base64 sea malo. Es la herramienta correcta para su función real, que es transportar bytes por un canal que solo maneja texto:

- **Datos binarios en JSON o YAML.** Ninguno de los dos formatos tiene un tipo de bytes, así que imágenes, certificados y keystores entran como cadenas Base64.
- **Autenticación HTTP Basic.** El formato de la cabecera lo exige, como se ha visto.
- **URI de datos.** El RFC 2397 permite incrustar una imagen pequeña o una fuente como `data:image/png;base64,…`.
- **Adjuntos de correo.** MIME (RFC 2045) usa Base64 para llevar binarios por el transporte de correo, con líneas cortadas a 76 caracteres. GNU `base64` corta a 76 por defecto por la misma razón; pasa `-w 0` para obtener una sola línea.
- **Tokens y URL.** base64url transporta identificadores binarios y segmentos de JWT sin necesidad de escapar caracteres.

En todos esos casos se espera que el receptor decodifique el valor. De eso se trata.

## Revisa la cadena sin enviarla a ninguna parte

Cuando encuentres una cadena sospechosa en un archivo de configuración o en una línea de log, decodifícala para ver qué es. Pero no pegues una posible clave de producción en una web que podría enviarla a algún sitio.

El [Base64 Encoder / Decoder](/base64-encoder-decoder/) de este sitio funciona íntegramente en tu navegador. Admite los alfabetos estándar y seguro para URL y UTF-8 completo, y nada de lo que pegues se sube. Como con cualquier herramienta, no te fíes a ciegas: abre las DevTools, vacía la pestaña Network, pega la cadena y comprueba que ninguna petición la lleva. Si la cadena resulta ser un JWT, el [decodificador de JWT](/jwt-decoder/) separa y decodifica los tres segmentos.

## Checklist: Base64 y API keys

- [ ] Ninguna API key en el repositorio, codificada o no, tampoco en el historial.
- [ ] Secrets de Kubernetes cifrados en reposo, y el `get` de RBAC sobre Secrets limitado a las identidades que lo necesitan.
- [ ] Claves guardadas en un gestor de secretos o un KMS e inyectadas en tiempo de ejecución, nunca incrustadas en imágenes ni en bundles de front-end.
- [ ] Una clave de alcance reducido por servicio y entorno.
- [ ] Un procedimiento de rotación que se haya ejecutado al menos una vez.
- [ ] Credenciales enviadas solo por TLS, incluida la autenticación Basic.
- [ ] Logs depurados de cabeceras, volcados de entorno y configuraciones renderizadas.
- [ ] Base64 usado solo para transportar bytes como texto, nunca para ocultarlos.

¿Cómo detecta tu equipo los secretos codificados antes de que se fusionen: con un escáner pre-commit, un check en CI o con revisores que saben cómo se ve `b3Bz`?
