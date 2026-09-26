---
title: "Unable to get local issuer certificate: curl, git, npm y pip"
description: "Por qué curl, git, npm y pip muestran unable to get local issuer certificate, qué almacén de confianza lee cada uno y cómo añadir una CA sin reemplazarlo."
pubDate: 2026-09-26
tags: ["security", "tls", "certificates", "debugging"]
lang: es
translationOf: "unable-to-get-local-issuer-certificate"
relatedTool:
  name: "Certificate Decoder"
  href: "/certificate-decoder"
---

![curl, git, npm y pip comprueban cada uno el certificado del servidor contra su propio almacén de confianza, y a uno de ellos le falta el emisor](/blog/unable-to-get-local-issuer-certificate-hero.svg)
<!-- keywords: primary: unable to get local issuer certificate (>1000, KD Medium) | title phrase: ssl certificate problem: unable to get local issuer certificate (>100, Easy) | secondaries: curl unable to get local issuer certificate, git ssl certificate problem unable to get local issuer certificate (Easy), npm unable to get local issuer certificate (Easy), pip unable to get local issuer certificate (Easy), curl: (60) ssl certificate problem | source: ahrefs free (2026-09-26) -->
<!-- insight: the string means different things per client: curl/git/pip print it for a missing intermediate AND an untrusted root, Node/npm only when the chain arrived and the root is missing from Node's bundled store (proxy/private CA); most usual fixes (--cacert, http.sslCAInfo, npm cafile) replace the trust store, NODE_EXTRA_CA_CERTS appends, and pip --cert adds only under truststore (pip 24.2+, Python 3.10+) | serp-checked: 2026-09-26 -->

Es tu primera mañana en un trabajo nuevo, clonas un repositorio y el comando se detiene en el handshake:

```text
curl: (60) SSL certificate problem: unable to get local issuer certificate
More details here: https://curl.se/docs/sslcerts.html
```

Después fallan también `git clone`, `npm install` y `pip install`. El navegador, en cambio, sigue cargando la página. "Unable to get local issuer certificate" es un único error de OpenSSL, pero cada cliente lo comprueba contra un almacén de confianza distinto, y por eso la misma solución funciona en una herramienta y no en la siguiente.

> **TL;DR**
>
> - Es el código 20 de OpenSSL: la cadena termina en un certificado cuyo emisor no está en el almacén de confianza de *este cliente*.
> - Ejecuta `openssl s_client -showcerts` contra el host y lee las líneas `i:`. Un solo certificado: falta un intermedio. Un emisor corporativo o de un proveedor: un proxy de inspección TLS.
> - curl, git, Node/npm y pip leen cada uno un almacén distinto, así que instalar una CA en un sitio rara vez arregla los cuatro.
> - `--cacert`, `http.sslCAInfo` y el `cafile` de npm **reemplazan** el almacén. `NODE_EXTRA_CA_CERTS` añade.

## ¿Qué significa "unable to get local issuer certificate"?

El servidor envía un certificado hoja y, si está bien configurado, los intermedios. Tu cliente construye una cadena hacia arriba a partir de la hoja y necesita que su extremo superior sea una raíz que ya tenga en local. OpenSSL lanza el error 20, `X509_V_ERR_UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, cuando el certificado superior no está autofirmado y no existe ningún emisor para él en el almacén local.

Eso abarca dos situaciones distintas. Si el servidor envió solo la hoja, la cadena se detiene en la profundidad 0 porque falta el intermedio. Si llegaron la hoja y el intermedio pero la raíz no está en tu almacén, la cadena se detiene en la profundidad 1 o 2. Ese es el caso de la CA privada y del proxy.

Conviene reconocer a sus vecinos en el [x509_txt.c](https://github.com/openssl/openssl/blob/master/crypto/x509/x509_txt.c) de OpenSSL:

```text
18  self-signed certificate
19  self-signed certificate in certificate chain
20  unable to get local issuer certificate
21  unable to verify the first certificate
```

Un proxy que además envía su propia raíz produce el 19 en lugar del 20. El mecanismo detrás de todos ellos es el recorrido de la cadena que se explica en [x509: certificate signed by unknown authority](/blog/x509-certificate-signed-by-unknown-authority/), que es la forma en que Go expresa el mismo fallo.

## ¿Por qué la misma URL falla en un cliente y funciona en otro?

curl, git y Python en Linux o macOS se detienen en el primer error de verificación, así que un servidor que envía solo la hoja les da el código 20. `openssl s_client` sigue adelante: contra `incomplete-chain.badssl.com` imprime `num=20`, luego `num=21`, y termina con `Verify return code: 21 (unable to verify the first certificate)`.

Node, en cambio, informa del *último* error. Por eso un servidor que envía solo la hoja aparece en Node 24.16.0 como `unable to verify the first certificate` (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`), y el propio Node sugiere probar `--use-system-ca` si la CA raíz está instalada en local. Cuando npm o Node imprimen `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, los intermedios llegaron y lo que falta en el almacén de Node es la raíz: la firma típica de un proxy o de una CA privada.

Windows vuelve a ser distinto. El curl 8.4.0 que trae Git for Windows y el curl.exe de System32 usan Schannel, y ambos devolvieron 200 para la misma cadena incompleta, porque Schannel descarga los intermedios que faltan y lee el almacén de Windows. El Python 3.13 de python.org en Windows también pasó. Lo que falla es git en sí, que Git for Windows configura con `http.sslBackend=openssl`, además de WSL y los contenedores.

| Lo que ves | Dónde | Causa más probable |
|---|---|---|
| Error 20, el navegador va bien, `s_client` muestra un solo certificado | curl, git, pip | [Al servidor le falta su intermedio](#causa-2-al-servidor-le-falta-su-certificado-intermedio) |
| Fallan todos los hosts HTTPS, solo en la red de la oficina o en la VPN | cualquier cliente | [Proxy de inspección TLS](#causa-1-un-proxy-de-inspección-tls-está-volviendo-a-firmar-tu-tráfico) |
| `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` | npm, Node | Proxy o CA privada |
| `unable to verify the first certificate` | npm, Node | Al servidor le falta su intermedio |
| Funciona con el curl de Windows/Schannel, falla en git, WSL o un contenedor | Windows | Schannel reparó la cadena o confía en el almacén de Windows |
| Falla solo en `docker build` o en un contenedor | imagen | [Al almacén de la imagen le falta la CA](#causa-3-por-qué-falla-solo-dentro-de-una-imagen-docker) |

## ¿Qué almacén de confianza lee cada cliente?

La mayoría de las listas de soluciones se saltan esto. No hay un único "almacén de confianza del sistema" que sirva a todas las herramientas: cada cliente tiene su propio valor por defecto y su propia forma de sobrescribirlo, con semánticas distintas.

![Qué almacén de confianza lee cada cliente: curl y git leen un archivo de bundle PEM, Node y npm leen una lista de Mozilla compilada dentro de Node, pip lee certifi más el almacén del sistema, y los clientes Schannel leen el almacén de certificados de Windows](/blog/unable-to-get-local-issuer-certificate-diagram.svg)

| Cliente | Almacén por defecto | Opción para sobrescribirlo y qué hace |
|---|---|---|
| curl (compilado con OpenSSL) | Archivo de bundle de CA elegido al compilar | `--cacert`, `CURL_CA_BUNDLE`: reemplazan |
| git, backend openssl | El bundle que trae Git o el del sistema | `http.sslCAInfo`, `GIT_SSL_CAINFO`: reemplazan |
| Node, npm | Lista de CA de Mozilla fijada cuando se publicó esa versión de Node | `NODE_EXTRA_CA_CERTS`: añade. `cafile` de npm: reemplaza |
| pip 24.2+ con Python 3.10+ | certifi más el almacén del sistema | `--cert`, `PIP_CERT`: añaden un bundle |
| requests | certifi | `REQUESTS_CA_BUNDLE`: reemplaza |
| curl.exe, git con schannel | Almacén de certificados de Windows | Lo gestiona Windows o una directiva de grupo |

Node no lee el almacén del sistema por defecto ([documentación de la CLI de Node](https://nodejs.org/api/cli.html#node_extra_ca_certsfile)), así que instalar una CA corporativa en Windows, macOS o Debian no arregla npm. `--use-system-ca` (v23.8.0 y v22.15.0; en Linux, desde v23.9.0) y `NODE_USE_SYSTEM_CA=1` (v24.6.0 y v22.19.0) cambian eso. En Python, `requests` pasa explícitamente la ruta de certifi, así que `SSL_CERT_FILE` no le llega.

pip es distinto: con truststore, `--cert` añade. pip 26.0.1 con Python 3.13 seguía llegando a PyPI con `--cert` apuntando a una única raíz sin relación; con `--use-deprecated=legacy-certs`, el mismo comando fallaba con este error.

> **Cuidado:** una opción de tipo "reemplazar" que apunta a un archivo con solo tu CA corporativa arregla el host que pasa por el proxy y rompe todos los públicos. Con `GIT_SSL_CAINFO` apuntando a un archivo de una sola raíz, `git ls-remote https://github.com/git/git.git` falla con este mismo error. Apunta las opciones que reemplazan a un bundle completo que además contenga tu CA.

## ¿Cómo confirmas qué causa tienes?

Pregúntale al servidor qué envía, usando el mismo host al que llamó tu cliente. Mantén `-servername` para que SNI elija el certificado correcto:

```bash
openssl s_client -connect registry.npmjs.org:443 -servername registry.npmjs.org -showcerts </dev/null
```

Lee los pares numerados `s:` (sujeto) e `i:` (emisor):

- **Un solo certificado, emisor público, `depth=0` en la línea del error:** al servidor le falta un intermedio.
- **El emisor superior es tu empresa o un proveedor de seguridad como Zscaler:** un proxy de inspección TLS, aunque solo haya llegado la hoja.

Para leer la cadena sin dejarte la vista en el PEM, pega la transcripción completa en el [Certificate Decoder](/es/certificate-decoder/); ignora el texto que rodea a los certificados.

Con una captura de `incomplete-chain.badssl.com` que solo contiene la hoja, lanza un error `missing intermediate` y nombra lo que falta: `The chain is missing the intermediate that issued *.badssl.com: "C=US, O=Let's Encrypt, CN=YR2".` Su mensaje dice que los runtimes fallan con "unable to get local issuer certificate". Node es la excepción, como vimos en la sección anterior.

El límite, dicho con honestidad: el decoder no puede ver el almacén de confianza de tu cliente. Si el proxy envía su intermedio, la cadena es válida en sí misma y el resultado es `chain order OK · 1 signature verified`, sin incluir la raíz. Un proxy que envía solo la hoja da `missing intermediate`, pero un emisor corporativo sigue significando proxy, no un bug del servidor. En cualquier caso, lee el nombre del emisor.

## ¿Cuáles son las causas, por orden de frecuencia?

Tres causas, empezando por la más habitual en redes corporativas. Cada una tiene una señal, una solución y una comprobación.

### Causa 1: ¿un proxy de inspección TLS está volviendo a firmar tu tráfico?

En redes corporativas es el culpable habitual, y la primera sospecha del equipo de la CLI de npm en [npm/cli#7326](https://github.com/npm/cli/issues/7326): "This is usually because of a proxy you are in that is not providing valid ssl certificates." El proxy termina la conexión TLS y vuelve a firmar los sitios inspeccionados con su propia CA. Tu navegador confía en esa CA gracias a las políticas de TI; tus herramientas de línea de comandos, no.

**Señal:** fallan todos los hosts públicos, el emisor superior en `s_client` es una CA corporativa o de un proveedor, y npm dice `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`:

```text
npm error code UNABLE_TO_GET_ISSUER_CERT_LOCALLY
npm error errno UNABLE_TO_GET_ISSUER_CERT_LOCALLY
npm error request to https://registry.npmjs.org/serve failed, reason: unable to get local issuer certificate
```

pip envuelve el mismo texto de OpenSSL; el número de línea de `_ssl.c` varía según la compilación de Python:

```text
[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: unable to get local issuer certificate (_ssl.c:1028)
```

**Solución:** pide a TI el certificado raíz del proxy (en PEM), instálalo una vez y después dale a cada cliente una opción que conserve las raíces públicas:

```bash
# Debian/Ubuntu/WSL: add the root to the OS bundle (.crt extension required)
sudo cp corp-root.pem /usr/local/share/ca-certificates/corp-root.crt
sudo update-ca-certificates

# curl and git: point at the full bundle, which now includes the corporate root
curl --cacert /etc/ssl/certs/ca-certificates.crt https://registry.npmjs.org/
git config --global http.sslCAInfo /etc/ssl/certs/ca-certificates.crt

# Node and npm: append to Node's own list instead of replacing it
export NODE_EXTRA_CA_CERTS="$HOME/corp-root.pem"

# pip and requests
export PIP_CERT=/etc/ssl/certs/ca-certificates.crt
export REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
```

En Git for Windows, `git config --global http.sslBackend schannel` hace que git use el almacén de Windows, que TI a menudo ya ha rellenado. pip 24.2 y posteriores con Python 3.10+ también leen el almacén del sistema junto con certifi ([documentación de pip](https://pip.pypa.io/en/stable/topics/https-certificates/)).

> **Importante:** `NODE_EXTRA_CA_CERTS` solo se lee al arrancar el proceso, y Node lo ignora cuando hay una opción `ca` explícita. El `cafile` de npm se convierte en esa opción `ca`, así que si defines ambos, los certificados adicionales se descartan sin avisar. Quédate con `NODE_EXTRA_CA_CERTS`.

**Comprobación:** `openssl s_client -connect registry.npmjs.org:443 -servername registry.npmjs.org -CAfile /etc/ssl/certs/ca-certificates.crt </dev/null` debería terminar con `Verify return code: 0 (ok)`. Después vuelve a ejecutar el comando original. Python 3.13 activa `VERIFY_X509_STRICT`, así que una CA de proxy antigua y hecha en casa puede seguir fallando ahí, con otro error, una vez que ya confías en ella.

### Causa 2: ¿al servidor le falta su certificado intermedio?

**Señal:** `s_client` muestra un solo certificado, el error está en `depth=0`, el navegador carga la página y Node dice `unable to verify the first certificate`. git lo imprime así:

```text
fatal: unable to access 'https://incomplete-chain.badssl.com/x.git/': SSL certificate problem: unable to get local issuer certificate
```

**Solución:** en el servidor. El archivo del certificado tiene que contener la hoja seguida de todos los intermedios, lo que en Let's Encrypt significa `fullchain.pem`, no `cert.pem`.

La [primera causa del post sobre x509](/blog/x509-certificate-signed-by-unknown-authority/#1-the-server-is-missing-its-intermediate) tiene las líneas de nginx. Si el servidor no es tuyo, envíale a su responsable la salida de `s_client`. Añadir el intermedio a tu propio bundle solo esconde un bug con el que se va a topar cualquier otro cliente OpenSSL.

**Comprobación:** vuelve a ejecutar `s_client`; deberías ver al menos dos certificados y `Verify return code: 0 (ok)`.

> **Consejo:** para un servidor Git interno firmado por una CA privada, limita la opción a ese host: `git config --global http.https://git.corp.example/.sslCAInfo ~/corp-ca-bundle.pem`. Los remotos públicos siguen usando el bundle por defecto, así que ahí un archivo de una sola raíz es seguro.

### Causa 3: ¿por qué falla solo dentro de una imagen Docker?

Un contenedor lleva su propio almacén de confianza, y la CA corporativa del host no entra con él. Dentro de `docker build`, npm y pip fallan contra el mismo proxy en el que tu portátil ya confía. Si la imagen no tiene ningún bundle, empieza por [la sección de contenedores del post sobre x509](/blog/x509-certificate-signed-by-unknown-authority/#2-your-container-has-no-ca-bundle-at-all).

**Señal:** el comando funciona en el host y falla en un paso `RUN` o en un contenedor en ejecución. Cómo identificar qué `RUN` falló se explica en [docker build "failed to solve"](/blog/docker-build-failed-to-solve-exit-code-1/).

**Solución:** añade la raíz con un nombre `.crt` (`update-ca-certificates` ignora sin avisar los `.pem`, según la [página de manual de Debian](https://manpages.debian.org/testing/ca-certificates/update-ca-certificates.8.en.html)) y después indica a Node y a requests dónde está el bundle regenerado:

```dockerfile
COPY corp-root.pem /usr/local/share/ca-certificates/corp-root.crt
RUN update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
ENV REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
```

`update-ca-certificates` por sí solo no ayuda a Node, que mantiene su lista compilada. En imágenes RHEL o UBI, copia la raíz a `/etc/pki/ca-trust/source/anchors/` y ejecuta `update-ca-trust extract`.

**Comprobación:** `docker run --rm <image> ls /etc/ssl/certs/ca-certificates.crt` y después vuelve a ejecutar el paso que fallaba.

## ¿Por qué -k, GIT_SSL_NO_VERIFY o strict-ssl=false no son una solución?

Todos los clientes tienen un interruptor para apagarlo: `curl -k`, `GIT_SSL_NO_VERIFY=true`, `npm config set strict-ssl false`, `NODE_TLS_REJECT_UNAUTHORIZED=0` y el `--trusted-host` de pip. Hacen desaparecer el error quitando la comprobación que lo lanzó, para todos los hosts que toque el comando.

Detrás de un proxy de inspección TLS, esa comprobación es lo único que distingue a tu proxy de cualquier otro que esté en la misma posición. Si la desactivas, una instalación acepta cualquier certificado que le den. La [recomendación del propio curl](https://curl.se/docs/sslcerts.html) sobre `--insecure` es no saltarse nunca la verificación en producción.

La solución real es un archivo de CA y una variable. Trata un `strict-ssl=false` en un `.npmrc` compartido o en una plantilla de CI como un hallazgo, no como un ajuste que copiar.

## ¿Qué deberías comprobar, y en qué orden?

1. Ejecuta `openssl s_client -showcerts` contra el host exacto y cuenta los certificados.
2. Un solo certificado y `depth=0`: al servidor le falta su intermedio. Arréglalo ahí.
3. El emisor superior es una CA corporativa o de un proveedor: pide esa raíz en PEM a TI.
4. Instálala en el almacén del sistema, con un nombre `.crt` en sistemas de la familia Debian.
5. Dale a cada cliente un bundle completo o una opción que añada: `http.sslCAInfo`, `NODE_EXTRA_CA_CERTS`, `PIP_CERT`, `REQUESTS_CA_BUNDLE`.
6. Nunca apuntes una opción que reemplaza a un archivo que solo contenga la raíz corporativa.
7. En las imágenes, repite los pasos 4 y 5 en el Dockerfile.
8. Confirma `Verify return code: 0 (ok)` y después elimina cualquier `-k` o `strict-ssl=false` que haya quedado.

La próxima vez que falle un handshake, pega la salida de `s_client` en el [Certificate Decoder](/es/certificate-decoder/) y lee el emisor antes de tocar ningún ajuste.

¿Cuál fue el último cliente de tu stack en enterarse de la CA corporativa, y cuánto tardó alguien en darse cuenta?
