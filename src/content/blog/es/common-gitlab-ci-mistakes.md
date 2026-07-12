---
title: "7 errores comunes en .gitlab-ci.yml (y cómo detectarlos)"
description: "Los errores de .gitlab-ci.yml que ponen los pipelines en rojo: stages sin definir, jobs sin script, needs y rules rotos, mal uso de anchors — cada uno con una solución que puedes copiar."
pubDate: 2026-06-12
tags: ["gitlab-ci","ci-cd","yaml"]
lang: es
translationOf: "common-gitlab-ci-mistakes"
relatedTool:
  name: "GitLab CI Validator"
  href: "/gitlab-ci-validator"
---

![.gitlab-ci.yml anotado mostrando los errores más comunes de GitLab CI — un stage sin definir, un job sin script y una referencia needs rota — señalados antes de que se ejecute el pipeline](/blog/common-gitlab-ci-mistakes-hero.svg)

Haces un push con un cambio de una sola línea, cambias de pestaña y 30 segundos después el icono del pipeline se pone rojo. No es un test que falla: el pipeline ni siquiera arrancó. GitLab imprimió `This GitLab CI configuration is invalid` y una única línea escueta sobre un stage o un script. Relees el YAML tres veces, encuentras el error tipográfico, haces push de nuevo y vuelves a esperar. La mayoría de los errores de GitLab CI que te cuestan ese ida y vuelta no son nada exóticos. Son el mismo puñado de configuraciones incorrectas de pipelines de GitLab, repetidas en cada equipo: un stage que nunca se declaró, un job que no hace nada, un `needs` que apunta a un job al que le cambiaste el nombre.

La buena noticia es que estos errores de YAML de GitLab CI son estructurales, lo que significa que se pueden detectar antes de hacer commit. A continuación están los siete que aparecen con más frecuencia, cada uno con su síntoma, un ejemplo mínimo roto y la solución que puedes pegar directamente.

## 1. Referenciar un stage que no está definido

```yaml
stages:
  - build
  - test

release-job:
  stage: release      # not in stages:
  script:
    - make release
```

GitLab lo rechaza con algo como `chosen stage release does not exist; available stages are .pre, build, test, .post`. El `stage:` de un job tiene que ser uno de los nombres de tu lista `stages:` de nivel superior, o uno de los cinco stages implícitos que GitLab siempre proporciona: `.pre`, `build`, `test`, `deploy` y `.post`.

Hay una versión más silenciosa de este bug. Un job sin ningún `stage:` adopta por defecto `test`. Si declaraste una lista `stages:` personalizada que no incluye `test`, ese job no tiene dónde ejecutarse y GitLab da el mismo error. La solución es la misma en ambos casos: declarar el stage.

```yaml
stages:
  - build
  - test
  - release

release-job:
  stage: release
  script:
    - make release
```

## 2. Un job sin script (y la confusión con el script global/default)

```yaml
stages:
  - test

empty-job:
  stage: test
  # no script, run, trigger, or extends
```

Esto produce el error de job de GitLab CI sin script: `job config should implement a script: or a trigger: keyword`. Un job visible tiene que *hacer* algo. Hay exactamente cuatro formas de cumplir con eso: ejecutar comandos con `script:` (o el más reciente `run:`), iniciar un pipeline descendente con `trigger:`, o heredar uno de esos de otro sitio mediante `extends:`. Un job que no tenga ninguna de las cuatro es rechazado.

La confusión que provoca esto es el bloque global/default. Los equipos definen una sección `before_script:` o `default:` y dan por hecho que un job hereda de ella un *comando*. No es así. `before_script` se ejecuta *alrededor* de tu script; no es el script. `default:` aporta valores por defecto para claves como `image:` y `cache:`, pero no le da a un job una superficie ejecutable. El job sigue necesitando su propio `script:` (o un `trigger`, `run` o `extends`).

```yaml
empty-job:
  stage: test
  script:
    - make check
```

Las plantillas ocultas con prefijo de punto son la excepción — más sobre ellas en el error número seis. Tienen permitido ser fragmentos parciales, así que no están obligadas a llevar un script.

![Ilustración synthwave: una lupa examina un .gitlab-ci.yml en un monitor CRT retro, rodeado de iconos de neón numerados con errores comunes de pipeline — una pieza de puzle rota, un escudo agrietado, engranajes y un reloj de arena](/blog/in-content/common-gitlab-ci-mistakes.webp)

## 3. needs apuntando a un job de un stage posterior o a un job que no existe

```yaml
stages:
  - build
  - test

build:
  stage: build
  script: make

test:
  stage: test
  needs:
    - compile      # no such job
  script: make test
```

`needs:` construye el grafo acíclico dirigido que permite que los jobs arranquen antes en lugar de esperar a que termine un stage completo. Cada nombre que figure en él tiene que resolverse a un job real del mismo pipeline. Aquí `compile` se renombró en algún momento a `build` y la referencia de `needs` nunca se actualizó, así que el grafo tiene una arista colgante y el pipeline no se llega a ensamblar.

La versión clásica de este error es de orden: apuntar `needs` a un job de un stage *posterior*. `needs` solo puede referenciar jobs que se ejecutan antes — un job no puede depender de algo que todavía no se ha ejecutado. Apúntalo al job upstream real.

```yaml
test:
  stage: test
  needs:
    - build
  script: make test
```

La misma regla aplica a `dependencies:`. Cada dependencia de artefactos que listes tiene que nombrar un job que realmente exista, o la descarga fallará en tiempo de ejecución.

## 4. rules que nunca coinciden (o siempre lo hacen) — y mezclar only/except con rules

```yaml
deploy:
  stage: deploy
  when: sometimes        # not a valid when value
  rules:
    if: '$CI_COMMIT_TAG' # rules must be a list
  script: ./deploy.sh
```

En este único job se concentran dos errores de rules y extends de GitLab CI. Primero, `when:` solo acepta un conjunto fijo de valores: `on_success`, `on_failure`, `always`, `manual`, `delayed` o `never`. `sometimes` no es uno de ellos, y un error tipográfico aquí se rechaza sin más. Segundo, `rules:` tiene que ser una *lista* YAML de objetos rule. Escrito como un mapeo suelto (`if:` directamente bajo `rules:`), está mal formado; GitLab no puede leerlo como una rule.

![Un fragmento corto y roto de .gitlab-ci.yml con burbujas rojas de aviso apuntando a un stage sin definir, un job sin script y una referencia needs incorrecta](/blog/common-gitlab-ci-mistakes-diagram.svg)

La otra mitad de esta categoría es de lógica, y es más difícil de detectar porque el YAML es válido. Una rule cuyo `if:` referencia una variable que está vacía en la rama que te interesa nunca coincide de forma silenciosa, y el job nunca se ejecuta. Una rule sin condición siempre coincide. Y `rules:` no se puede combinar con las palabras clave heredadas `only:`/`except:` en el mismo job — GitLab da error si usas ambas. `only`/`except` siguen funcionando, pero ya no se desarrollan activamente, así que los pipelines nuevos deberían estandarizarse en `rules`. Escribe `rules` como una lista, con cada elemento llevando su condición y su `when`.

```yaml
deploy:
  stage: deploy
  rules:
    - if: '$CI_COMMIT_TAG'
      when: manual
  script: ./deploy.sh
```

Si tu bug es una variable de entorno que está vacía cuando esperabas un valor, eso es otra clase de problema — el [Env Example Checker](/env-example-checker) detecta la divergencia entre `.env` y `.env.example` que deja una variable sin definir desde el principio.

## 5. extends de una plantilla que no existe, o un extends circular

```yaml
.base:
  image: golang:1.22
  script: make

lint:
  extends: .bse        # typo — .bse, not .base
  script: make lint
```

`extends:` es el mecanismo DRY de GitLab: un job incorpora las claves de otro job o de una plantilla oculta y sobreescribe lo que necesita. El fallo más común es exactamente el de arriba — un error tipográfico o un cambio de nombre, de modo que `extends` apunta a una plantilla que no está en el archivo. GitLab no puede resolver `.bse`, y la configuración del job es inválida.

La variante más desagradable es un `extends` circular — `a` extiende `b`, `b` extiende `a` — que no tiene caso base que resolver y se rechaza. Mantén la cadena apuntando a una plantilla real y terminal.

```yaml
.base:
  image: golang:1.22
  script: make

lint:
  extends: .base
  script: make lint
```

`extends` también puede tomar una lista de plantillas, y cada nombre de esa lista tiene que resolverse. Una sola entrada incorrecta rompe el job entero.

## 6. anchors de YAML y jobs ocultos (con prefijo de punto) mal usados

```yaml
.deploy_template: &deploy
  stage: deploy
  script:
    - ./deploy.sh

deploy_prod:
  <<: *deploy
  environment: production
  # inherits stage + script from the anchor
```

GitLab admite tanto los anchors de YAML (`&name` / `*name` con la clave de merge `<<:`) como su propio `extends:`. Los dos resuelven el mismo problema y la gente los mezcla, que es donde empiezan los problemas. El patrón de arriba es correcto: una clave con prefijo de punto es un job *oculto* — GitLab no lo ejecuta como job, solo existe para reutilizarse. Anclarlo con `&deploy` y fusionarlo en `deploy_prod` con `<<: *deploy` funciona.

Qué sale mal:

- **Olvidar el punto.** Si tu plantilla se llama `deploy_template:` sin el punto inicial, GitLab la trata como un job real — y un job real sin script (solo un destino de anchor) dispara el error de "sin script" del error número dos.
- **Los anchors no cruzan archivos.** Un anchor de YAML es local a un solo documento. Si haces `include:` de otro archivo e intentas referenciar un anchor definido allí, no se resolverá. `extends:` es la opción segura entre archivos; recurre a él cuando la reutilización abarca includes.
- **Una clave de merge no se puede sobreescribir parcialmente como crees.** `<<:` hace un merge superficial, así que redeclarar una clave anidada reemplaza el subárbol completo en lugar de fusionarse con él.

Ante la duda, prefiere `extends:` para reutilizar jobs y reserva los anchors para fragmentos pequeños y locales de escalares o listas. Y dale siempre el punto inicial a una plantilla reutilizable para que GitLab sepa que no debe ejecutarla.

```yaml
.deploy_template:
  stage: deploy
  script:
    - ./deploy.sh

deploy_prod:
  extends: .deploy_template
  environment: production
```

## 7. include que da 404 o apunta al archivo/ref equivocado

```yaml
include:
  - project: 'platform/ci-templates'
    ref: main
    file: '/templates/deploy.yml'   # path or ref may be wrong
```

`include:` incorpora configuración de otro archivo — local, una URL remota, una plantilla u otro proyecto. Cuando la ruta, el `ref` o el proyecto son incorrectos, GitLab no puede obtenerlo y el pipeline entero no llega a compilar, a menudo con un escueto `Project not found or access denied` o un 404 en el archivo. Las causas habituales son un error de ruta con la barra inicial (las rutas de `include` local son relativas a la raíz del repositorio y necesitan la barra; un `file:` de un proyecto también requiere la ruta absoluta del repositorio), un `ref` que apunta a una rama o etiqueta que ya no existe, o un archivo de plantilla renombrado.

Haz la ruta absoluta desde la raíz, fija un `ref` que exista y verifica dos veces la ruta del proyecto.

```yaml
include:
  - project: 'platform/ci-templates'
    ref: v2.3.0          # a tag that exists
    file: '/templates/deploy.yml'
  - local: '/.ci/test.yml'
```

Una advertencia que conviene conocer: resolver `include:` requiere obtener de verdad los archivos referenciados, algo que un comprobador puramente del lado del cliente no puede hacer. Un linter local valida la *estructura* de tu bloque `include`; para la palabra final sobre si un archivo remoto se resuelve, el propio CI Lint de GitLab (que obtiene los includes y las variables del proyecto) es el respaldo.

## Detéctalos todos de una vez

Seis de estos siete errores son estructurales — residen en cómo encajan entre sí los jobs, los stages y las referencias, no en si el YAML se parsea. Esa es exactamente la brecha que se le escapa a un linter que solo comprueba sintaxis: un `.gitlab-ci.yml` puede ser YAML perfectamente válido y aun así ser un pipeline que GitLab se niega a arrancar.

El [GitLab CI Validator](/gitlab-ci-validator) ejecuta estas comprobaciones en tu navegador. Pega un `.gitlab-ci.yml` y parsea el YAML, y luego señala los problemas estructurales de arriba — un stage sin definir, un job sin `script`/`run`/`trigger`/`extends`, referencias de `needs`/`dependencies`/`extends` que apuntan a jobs que no existen, un `when:` inválido, un `rules:` que no es lista, `only`/`except` heredados, y formas incorrectas de `image`/`services` — cada uno con la línea y una solución concreta. No se sube nada; toda la comprobación es del lado del cliente, así que puedes ejecutarla contra pipelines privados y configuración propietaria de runners sin enviar nada a ningún sitio.

Si tus pipelines también corren en GitHub, la misma idea de comprobar antes de hacer push aplica a los workflows — nuestro recorrido por las [configuraciones de seguridad incorrectas en GitHub Actions](/blog/github-actions-security-misconfigurations) cubre los equivalentes del lado de GitHub, desde permisos de token demasiado amplios hasta actions de terceros sin fijar (unpinned).

Un pipeline rojo que nunca llegó a ejecutarse es el fallo más barato que se puede prevenir. Detecta los errores estructurales antes del commit, y el único rojo que verás será el de un test que falló de verdad.
