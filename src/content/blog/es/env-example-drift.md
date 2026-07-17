---
title: "Deja de publicar un .env.example desactualizado"
description: "Tu .env.example es documentación que se pudre en silencio. Aquí te explicamos por qué la deriva de variables de entorno rompe el onboarding y los despliegues, cómo detectar claves faltantes y sin usar, y cómo mantener honesto el archivo de ejemplo."
pubDate: 2026-06-02
tags: ["configuration", "developer-experience", "twelve-factor"]
lang: es
translationOf: "env-example-drift"
---

![Deja de publicar un .env.example desactualizado: detectando la deriva de configuración de entorno entre tu .env y tu .env.example](/blog/env-example-drift-hero.svg)

Un `.env.example` es el único archivo de tu repositorio que nadie ejecuta, nadie prueba y todo el mundo confía en él. Es el contrato que un nuevo compañero de equipo lee en su primer día para responder la única pregunta que importa: ¿qué variables de entorno necesito configurar antes de que esto arranque? Cuando ese archivo es correcto, el onboarding es un copiar-y-rellenar de cinco minutos. Cuando está mal, te encuentras con el tipo de error más desmoralizante: la aplicación se cae al arrancar con `undefined is not a function`, o peor, funciona tan tranquila con una funcionalidad desactivada en silencio porque un flag tenía su valor predeterminado en off.

El problema es que `.env.example` es documentación, y la documentación deriva. Código que lee `process.env.STRIPE_WEBHOOK_SECRET` se publica en una rama de funcionalidad. El archivo de ejemplo no recibe la nueva clave porque añadirla no forma parte de "hacer que la funcionalidad funcione", sino de "ser amable con la siguiente persona", y ese paso es invisible hasta que alguien tropieza con él. Multiplica eso a lo largo de un año de merges y el archivo de ejemplo se convierte en un museo de variables que solías necesitar, al que le faltan la mitad de las que realmente usas.

## Cómo ocurre la deriva en realidad

La deriva nunca es un único evento dramático. Es la acumulación de pequeñas omisiones razonables:

- Una nueva integración añade `SENTRY_DSN` y `SENTRY_ENVIRONMENT`. El autor del PR las tiene en su `.env` local, así que la aplicación le funciona, y el archivo de ejemplo nunca se entera de ellas.
- Se elimina una funcionalidad. El código que referenciaba `LEGACY_BILLING_URL` se borra, pero la clave permanece para siempre en `.env.example`, así que los recién llegados rellenan diligentemente un valor que no hace nada.
- Una variable se renombra de `DB_URL` a `DATABASE_URL` en el código, pero el ejemplo sigue anunciando el nombre antiguo. Ahora el archivo es activamente engañoso.
- Una clave se lee solo en un worker que rara vez se toca, así que nunca aparece en las pruebas informales, hasta que ese worker se despliega en un entorno nuevo sin ningún valor configurado.

Ninguno de estos casos hace saltar tu linter, tu verificador de tipos ni tus pruebas. El archivo de ejemplo no forma parte del grafo de compilación, así que nada te avisa de que está desincronizado. El único ciclo de retroalimentación es el de un humano que sale escaldado.

![Un archivo .env y un .env.example comparados lado a lado, resaltando una clave que falta en el ejemplo y una clave sobrante y obsoleta](/blog/env-example-drift-diagram.svg)

## Los dos modos de fallo

Hay exactamente dos maneras en que el archivo de ejemplo puede estar mal, y fallan en direcciones opuestas:

**Las claves faltantes** son variables que tu código lee y que el ejemplo no menciona. Estas son las peligrosas. Una clave faltante significa que un checkout nuevo arranca en un estado indefinido: una caída si tienes suerte, una mala configuración silenciosa si no la tienes.

**Las claves sin usar** son variables que el ejemplo anuncia pero que ningún código lee ya. Estas son simplemente un desperdicio: alargan el archivo, hacen que la gente aprovisione secretos que no necesita y erosionan la confianza en el archivo como fuente de verdad. Si resulta que tres claves están muertas, ¿por qué creerías en las otras veinte?

Un archivo de ejemplo sano no tiene ninguna de las dos. Toda variable que el código lee aparece en el ejemplo, y toda variable del ejemplo se lee realmente en algún lugar.

## Cómo se ve "leer una variable" según el lenguaje

Detectar la deriva implica analizar dos cosas: el conjunto de variables que tu código referencia y el conjunto de claves que tu ejemplo declara. El lado de las referencias es la mitad más complicada porque cada ecosistema lo escribe de forma distinta:

```javascript
// Node.js — the classic
const key = process.env.STRIPE_SECRET_KEY;
const { DATABASE_URL, REDIS_URL } = process.env;

// Vite / browser builds
const api = import.meta.env.VITE_API_BASE;
```

```python
# Python — os.environ and os.getenv
import os
secret = os.environ["DJANGO_SECRET_KEY"]
debug = os.getenv("DEBUG", "false")
```

```go
// Go — os.Getenv and os.LookupEnv
addr := os.Getenv("LISTEN_ADDR")
token, ok := os.LookupEnv("GITHUB_TOKEN")
```

```bash
# Shell — direct expansion
: "${WEBHOOK_URL:?must be set}"
echo "$DEPLOY_ENV"
```

El lado del ejemplo es comparativamente uniforme: una lista de líneas `KEY=value`, a menudo con comentarios y secciones en blanco:

```bash
# .env.example
# --- Core ---
DATABASE_URL=postgres://localhost:5432/app
REDIS_URL=redis://localhost:6379

# --- Payments ---
STRIPE_SECRET_KEY=
# STRIPE_WEBHOOK_SECRET is set in code but missing here ↓
```

Resta uno del otro como conjuntos y la deriva queda al descubierto. Las claves referenciadas en el código pero ausentes del ejemplo son **faltantes**. Las claves presentes en el ejemplo pero referenciadas en ningún sitio son **sin usar**. Todo lo que está en la intersección está bien.

## Por qué un diff rápido es mejor que un `grep`

Sin duda puedes improvisar esto con `grep -rhoE 'process\.env\.[A-Z_]+'` canalizado a través de `sort -u` y comparado con `cut -d= -f1 .env.example`. La gente lo hace, y funciona a medias. El problema son los casos límite que un regex improvisado siempre se salta:

- El acceso desestructurado (`const { FOO } = process.env`) que el patrón ingenuo no captura.
- Las claves comentadas en el ejemplo que no deberían contar como "declaradas".
- Los valores entrecomillados, los prefijos `export` y los comentarios en línea que despistan a un `cut` simplón.
- Múltiples frameworks en un mismo repositorio (`process.env`, `import.meta.env` y `os.getenv`), cada uno necesitando un patrón distinto.

Para cuando hayas manejado todos esos casos, tu "rápida" tubería de shell es un script frágil que nadie quiere mantener. Un verificador hecho a propósito maneja los patrones de acceso y las peculiaridades del archivo de ejemplo de forma consistente, y lo hace sin que tengas que pegar secretos en un servicio remoto.

## Mantener el archivo honesto

La detección es el primer paso; impedir que la deriva vuelva es el segundo. Ayudan unos cuantos hábitos:

- **Haz que el ejemplo sea la fuente de verdad.** Algunos equipos cargan `.env.example` al arrancar en desarrollo y advierten sobre cualquier clave en el código que no esté declarada allí. El archivo deja de ser opcional.
- **Revísalo en la revisión de código.** Trata un nuevo `process.env.X` sin su correspondiente línea de ejemplo igual que tratarías una nueva función pública sin un comentario de documentación.
- **Poda al borrar.** Cuando elimines una funcionalidad, busca también sus claves en el ejemplo. Las claves muertas son fáciles de dejar atrás.
- **Ejecuta el diff antes de abrir el PR.** Detectar la deriva lleva segundos y le ahorra una tarde a la siguiente persona.

## Detéctalo antes de hacer commit

La forma más rápida de saber si tu archivo de ejemplo es honesto es compararlo con tu código real. **Env Example Checker** hace exactamente eso en el navegador: pega tu código fuente y tu `.env.example`, y te informa de las variables que tu código usa pero que faltan en el ejemplo, además de las claves que el ejemplo declara y que nada lee. Se ejecuta enteramente del lado del cliente —tu código y tus secretos nunca salen de la página—, así que puedes ejecutarlo en un repositorio privado sin pensarlo dos veces.

Antes de tu próximo pull request, dale al siguiente desarrollador un `.env.example` en el que realmente pueda confiar.

[Comprueba la deriva de tu .env.example →](/env-example-checker/)
