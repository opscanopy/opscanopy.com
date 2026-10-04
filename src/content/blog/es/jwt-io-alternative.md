---
title: "Una alternativa a jwt.io: decodifica un JWT sin pegarlo en la web de otro"
description: "¿Buscas una alternativa a jwt.io? Qué puede demostrar un decodificador de JWT en el navegador sobre tus datos, cómo comprobarlo tú mismo y una opción offline."
pubDate: 2026-09-21
updatedDate: 2026-10-04
tags: ["security", "jwt", "developer-experience"]
lang: es
translationOf: "jwt-io-alternative"
relatedTool:
  name: "JWT Decoder & Encoder"
  href: "/jwt-decoder"
---

![Un JSON Web Token mostrado como tres segmentos conectados —header, payload y firma— que representan un JWT decodificado íntegramente en el navegador](/blog/jwt-io-alternative-hero.svg)
<!-- keywords: jwt.io alternative | is jwt.io safe, jwt decoder offline, decode jwt online, secure jwt decoder, online jwt decoder risks | source: ahrefs free (2026-09-21); marketing brief, ahrefs unchecked (2026-10-04) -->

Un compañero suelta un token en un hilo de Slack: «¿por qué da 401?». Lo copias, abres una pestaña nueva y ya lo estás pegando en jwt.io cuando te das cuenta de lo que tienes entre manos: un access token de producción en vigor.

¿Pasa algo? Probablemente das por hecho que no. El objetivo de este artículo es cambiar esa suposición por algo que puedas comprobar.

> **TL;DR**
>
> - Decodificar un JWT son dos decodificaciones base64url. Sin clave, sin servidor y sin nada que haya que subir.
> - Si una *página concreta* envía tu token a algún sitio es algo que puedes comprobar en DevTools → Network en unos cinco segundos. Hazlo en lugar de fiarte de ningún proveedor, nosotros incluidos.
> - ¿Máquina aislada o con políticas estrictas? `cut | tr | base64 -d` decodifica un JWT, y `openssl dgst -hmac` recalcula una firma HS256 para que puedas compararla, sin navegador.
> - Decodificar no es verificar, y ninguna de las dos cosas sustituye la verificación en el servidor contra tus claves de firma reales.

## ¿Es seguro jwt.io?

Es la pregunta equivocada, o al menos incompleta. «Seguro» depende de lo que haga una página concreta con lo que escribes, y eso lo puedes comprobar en lugar de creértelo.

El mecanismo que importa: el header y el payload de `header.payload.signature` son JSON codificado en base64url. No hay ningún paso de cifrado. Así que cualquier herramienta que los decodifique en el motor JavaScript de tu propio navegador puede hacer todo el trabajo sin una sola petición de red.

jwt.io es un depurador veterano y muy usado, mantenido por Auth0, y su decodificación funciona exactamente así, en tu navegador.

Pero «decodifica en local» describe una ruta de código en una página. No garantiza nada sobre todas las peticiones que haga el origen de esa página. Una página puede decodificar en local y aun así cargar analítica, anuncios u otros scripts de terceros que no tienen nada que ver con la decodificación.

## La comprobación de cinco segundos en la pestaña Network

La forma fiable de saber qué hace un decodificador con tu token (jwt.io, este o una extensión del navegador) es observarlo:

1. Abre las DevTools y ve a la pestaña **Network**.
2. Vacía la lista de peticiones. Deja el filtro en **All**, o al menos incluye **Fetch/XHR** y **WS**, para que también aparezca el tráfico WebSocket.
3. Pega tu token.
4. Espera unos segundos, porque una baliza puede dispararse con retraso. Luego mira qué se ha enviado. Si ninguna petición saliente contiene el token, o no se dispara nada al pegarlo, no se ha enviado nada.

Eso es más convincente que cualquier afirmación en un blog, incluido este.

Nos aplicamos el mismo criterio. El [decodificador de JWT](/jwt-decoder/) de este sitio hace la decodificación, el análisis de claims y la verificación de firmas íntegramente en el navegador, con JavaScript y la Web Crypto API.

Para ser precisos con todo lo demás que carga este sitio: sus propios recursos estáticos, Google Analytics (el script gtag.js más los pings de páginas vistas y eventos) y Cloudflare Web Analytics. Ninguno lleva el token que escribes.

Compruébalo en la pestaña Network. Tampoco te fíes de nuestra palabra.

Una salvedad que no tiene nada que ver con la red: si guardas un snapshot en el decodificador, el token (nunca tus claves) se almacena en el localStorage de este navegador. En un equipo compartido, no guardes snapshots de tokens de producción.

## Decodificar un JWT online: lo que tiene que pasar realmente

Aquí va un ejemplo práctico con el token de muestra de jwt.io de toda la vida. Su header, su payload y su secreto fueron durante años el ejemplo por defecto de jwt.io, y se ha convertido en el token de demostración estándar para herramientas de JWT:

```text
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

Divídelo por los dos puntos y decodifica en base64url las dos primeras partes.

El header:

```json
{ "alg": "HS256", "typ": "JWT" }
```

El payload:

```json
{ "sub": "1234567890", "name": "John Doe", "iat": 1516239022 }
```

Ese es todo el paso de «decodificar». No necesitas clave porque aquí no hay nada cifrado. `iat` es un NumericDate (segundos desde la época Unix), y 1516239022 corresponde al 18 de enero de 2018.

*Verificar* es otra operación. Confirma que la firma la produjo quien tiene el secreto, aquí `your-256-bit-secret`. Tú aportas ese secreto HMAC, y la herramienta recalcula `HMACSHA256(base64url(header) + "." + base64url(payload), secret)` y compara el resultado con el tercer segmento.

> **Clave:** un token puede decodificarse sin problemas y aun así no pasar la verificación. Para eso precisamente lleva firma.

## La trampa de la verificación de firmas: los riesgos de los decodificadores de JWT online

Pegar un token en un decodificador expone un token. Tiene un `exp` y deja de funcionar cuando vence. Pegar el secreto HMAC para verificar ese token expone algo peor: la clave que firma *todos* los tokens que emite tu servicio.

Con HS256, el mismo secreto firma y verifica. Quien lo tenga puede generar un token para cualquier usuario, con cualquier claim, que tu backend aceptará como auténtico. Sigue siendo válido hasta que lo rotes, y rotarlo suele cerrar la sesión de todos los usuarios. Así que una página de decodificación que envía lo que escribes a un servidor es una molestia para un token y un incidente para un secreto.

Un flujo de trabajo seguro con decodificadores de JWT mantiene el secreto lejos de cualquier herramienta del lado del servidor:

- **HS256 con un secreto de producción:** verifica offline con `openssl` (ver más abajo), o en una herramienta de navegador solo después de que la comprobación de Network muestre que nada sale de la página.
- **RS256, ES256 o EdDSA:** la verificación solo necesita la clave pública o el JWKS, que son públicos por diseño. Pegarlos en cualquier sitio no es problema; la clave privada nunca sale de tu emisor.
- **Depurar una firma que no coincide:** reprodúcelo con un secreto desechable en un entorno de pruebas, no con el real.

> **Cuidado:** si un secreto HMAC de producción ya ha acabado en una página que nunca comprobaste, dalo por comprometido. Rótalo y asume el inicio de sesión forzado como el precio a pagar.

## Decodificador de JWT offline: sin navegador

A veces «en el navegador, comprobado con DevTools» no basta. Quizá estés en una máquina aislada. Quizá una revisión de seguridad exija cero capacidad de red, sin más, no solo que no se observen peticiones. Tienes dos opciones honestas.

### Opción 1: decodificar con herramientas en las que ya confías

base64url se diferencia del base64 estándar en dos cosas: hay dos caracteres cambiados (`-` por `+`, `_` por `/`) y se elimina el relleno `=`. Así que `cut`, `tr` y `base64` te dan el JSON sin navegador:

```bash
TOKEN='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
echo "$TOKEN" | cut -d. -f2 | tr '_-' '/+' | base64 -d 2>/dev/null
# {"sub":"1234567890","name":"John Doe","iat":1516239022}
```

> **Ojo:** `base64` espera una entrada rellenada con `=` hasta un múltiplo de 4 caracteres. GNU `base64 -d` imprime este payload igualmente (solo sale con un código distinto de cero), pero BSD/macOS es menos tolerante.

Si prefieres no depender de eso, esta función de shell rellena primero:

```bash
b64url() {
  local s
  s=$(printf '%s' "$1" | tr '_-' '/+')
  while [ $(( ${#s} % 4 )) -ne 0 ]; do s="$s="; done
  printf '%s' "$s" | base64 -d; echo
}

b64url "$(echo "$TOKEN" | cut -d. -f1)"   # {"alg":"HS256","typ":"JWT"}
b64url "$(echo "$TOKEN" | cut -d. -f2)"   # {"sub":"1234567890","name":"John Doe","iat":1516239022}
```

Con HS256 también puedes verificar offline. Recalcula el HMAC sobre `header.payload` y compáralo con el tercer segmento:

```bash
printf '%s' "$(echo "$TOKEN" | cut -d. -f1-2)" \
  | openssl dgst -sha256 -hmac 'your-256-bit-secret' -binary \
  | base64 | tr '+/' '-_' | tr -d '='
# SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c   <- matches the signature segment
```

Si quieres un manejo de opciones en condiciones y verificación integrada en lugar de one-liners de shell, existen CLI offline específicas. `jwt-cli` (`mike-engel/jwt-cli` en GitHub, escrita en Rust) es una de las más citadas.

### Opción 2: un decodificador estático sin ruta de subida

Una decodificación simple no es más que decodificar base64url en JS del lado del cliente. Así que un sitio estático no necesita backend para hacerlo, y este no lo tiene: no hay un servidor propio que pueda recibir tu token.

Eso no significa que una página *no pueda* comunicarse con nada. La Content-Security-Policy de este sitio limita las conexiones salientes a su propio origen más los endpoints de Google Analytics y Cloudflare Web Analytics, y puedes leerla en las cabeceras de respuesta. Una política acota adónde podrían ir los datos; no demuestra adónde fueron. La comprobación sigue siendo la pestaña Network.

## Cuándo usar cada opción

Sé honesto contigo mismo sobre para qué sirve cada opción:

| Opción | Ideal para | Garantía |
|---|---|---|
| **jwt.io** | Tokens no sensibles: pruebas, tutoriales, tenants que no son de producción | La ruta de decodificación es JS del lado del cliente |
| **Herramienta de navegador + pestaña Network** | Access tokens o ID tokens reales | Viste que nada salía de la pestaña (en esta visita) |
| **Decodificación por CLI** | Máquinas aisladas o políticas sin red | La más fuerte, salvo escribir la tuya propia |

La vía del navegador añade descripciones de claims, comprobación de caducidad y verificación de firmas. La vía CLI te da JSON en bruto y verificación HMAC, y nada más.

> **Importante:** ninguna de estas opciones valida la autorización. Decodificar, incluso con verificación de firma, te dice que el token está bien formado y, opcionalmente, que lo firmó quien tiene la clave con la que lo comprobaste. No sustituye la verificación en el servidor antes de actuar sobre un claim en producción. Tu backend tiene que hacer esa comprobación contra tus claves de firma reales, siempre.

¿Quieres bajar un nivel por debajo de las herramientas específicas de JWT, a la mecánica de base64url? El [Base64 Encoder / Decoder](/base64-encoder-decoder/) maneja payloads base64 y base64url arbitrarios, no solo JWT.

## Ideas clave

- Trata «¿es seguro este sitio?» como una pregunta que respondes en las DevTools, no por reputación.
- Vacía la pestaña Network, pega el token y comprueba que nada lo saca de ahí.
- Decodificar no es verificar: un payload legible no demuestra nada sobre quién lo firmó.
- En máquinas restringidas, `cut | tr | base64 -d` decodifica y `openssl dgst -hmac` te permite comprobar una firma HS256.
- Verifica siempre en el servidor contra tus claves reales antes de fiarte de un claim.

Si quieres la vía del navegador con la verificación integrada, el [decodificador de JWT](/jwt-decoder/) hace el trabajo completo: decodifica, verifica contra un secreto, PEM, JWK o JWKS, firma tus propios tokens y genera claves de prueba, sin subir nada. Confírmalo en tu propia pestaña Network antes de confiarle algo real.

¿Cuál es la regla de tu equipo para los tokens de producción: vale cualquier decodificador, una herramienta interna revisada o solo CLI? ¿Y qué los llevó a decidirlo?
