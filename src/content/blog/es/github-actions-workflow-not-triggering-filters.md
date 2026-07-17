---
title: "Por qué tu workflow de GitHub Actions no se disparó: los filtros branches, tags y paths explicados"
description: "Por qué tu workflow de GitHub Actions no se disparó: nombre de rama que no coincide, la semántica AND de los filtros branches + paths, el requisito del glob **, paths-ignore en pull_request, y las correcciones."
pubDate: 2026-06-14
tags: ["github-actions", "ci-cd", "debugging"]
relatedTool:
  name: "Probador de Expresiones y Disparadores de GitHub Actions"
  href: "/github-actions-expression-tester"
lang: es
translationOf: "github-actions-workflow-not-triggering-filters"
---

![El workflow de GitHub Actions no se disparó: las reglas de los filtros branches, tags y paths explicadas](/blog/github-actions-workflow-not-triggering-filters-hero.svg)

Hiciste push de un commit, abriste la pestaña Actions, y no hay nada ahí. Ni una X roja, ni un punto amarillo: el workflow simplemente no se ejecutó. No hay error que leer, ni log que filtrar, porque un workflow que no se dispara no produce ninguna ejecución en absoluto. La decisión ocurrió antes de que se asignara ningún runner, dentro de la lógica de filtrado de eventos de GitHub, y esa lógica es más sorprendente de lo que los docs dan a entender.

Casi todos los reportes de "por qué no se disparó mi workflow de GitHub Actions" se reducen a una de un puñado de causas: el archivo del workflow no está en la rama a la que hiciste push, tu filtro `branches` no coincide con la ref, o —la más grande— combinaste `branches` y `paths` sin darte cuenta de que se aplican con un AND entre ambos. Aquí tienes cada causa con la regla decisiva y la corrección.

## 1. El archivo del workflow no está en la rama destino

GitHub lee los disparadores `on:` de la versión del archivo del workflow **que existe en la rama que recibe el evento**, no de tu rama por defecto. Si añadiste `.github/workflows/ci.yml` en `main` pero haces push a una rama `feature/x` que se ramificó *antes* de que ese archivo existiera, ahí no hay ningún workflow que disparar.

```yaml
# on main, but feature/x branched before this file existed
on:
  push:
    branches: ['**']
```

Esta es la falsa alarma más común. La corrección es mecánica: haz merge o rebase de `main` sobre la rama para que el archivo del workflow esté presente, y luego vuelve a hacer push. La misma regla explica por qué las ediciones a los disparadores `on:` solo "surten efecto" una vez que el cambio llega a la rama en la que estás probando.

Por qué importa: no hay mensaje de error para "aquí no hay ningún archivo de workflow". Es lo primero que debes descartar antes de sospechar de tus filtros.

![Un flujo de decisión que muestra cómo los filtros branches, tags y paths deciden si un workflow de GitHub Actions se dispara en un push](/blog/github-actions-workflow-not-triggering-filters-diagram.svg)

## 2. El filtro de rama no coincide con la ref

`branches` y `tags` son patrones glob, y las reglas de glob son más estrictas que las del glob del shell. Un `*` a secas coincide con **un segmento de ruta**: se detiene en `/`. Para coincidir a través de las barras necesitas `**`.

```yaml
# BAD — '*' does not cross '/', so 'release/1.2' never matches
on:
  push:
    branches:
      - 'release/*'   # matches release/1.2 ... actually this IS fine
      - 'feature*'    # matches 'feature' and 'featureX' but NOT 'feature/login'
```

La trampa es `feature*` frente a `feature/**`. `feature*` coincide con el segmento literal `featureX`, pero una rama llamada `feature/login` contiene una barra, y `*` no la cruzará. Lo que quieres es `feature/**`.

```yaml
# FIXED — ** crosses slashes
on:
  push:
    branches:
      - 'release/**'
      - 'feature/**'
      - main
```

Los caracteres glob que GitHub respeta: `*` (cualquier carácter excepto `/`), `**` (cualquier carácter incluyendo `/`), `?` (un carácter), `+` (uno o más del carácter anterior), rangos de caracteres `[]`, `!` al inicio de un patrón para negar, y `\` para escapar un carácter especial (de modo que `\*` coincide con un asterisco literal). El orden importa para la negación: un `!pattern` posterior excluye refs que un patrón anterior había incluido.

Por qué importa: que `*` no cruce `/` es responsable de una gran parte de los reportes de "filtro branches de github actions no funciona". Ante la duda, recurre a `**`.

![Ilustración synthwave: un evento push llega a un terminal retro que muestra WORKFLOW START mientras los filtros branches, tags y paths aprueban o rechazan refs y archivos modificados](/blog/in-content/github-actions-workflow-not-triggering-filters.webp)

## 3. La semántica AND de `branches` + `paths`

Esta es la que quema a los ingenieros con experiencia. Cuando un evento `push` o `pull_request` tiene **a la vez** un filtro de rama y un filtro de ruta, el evento debe satisfacer **ambos** para dispararse. Se combinan con un AND, no con un OR.

```yaml
# BAD — intent: "run on a push to main, OR when src changes"
# reality: "run only on a push to main AND when src/** changed"
on:
  push:
    branches: [main]
    paths: ['src/**']
```

Un push a `main` que solo toca `README.md` **no** ejecutará este workflow: la rama coincidió, pero ninguna ruta lo hizo, y ambas deben cumplirse. La gente lee este bloque como un OR y se queda perpleja cuando los commits solo de documentación se saltan CI.

Si realmente quieres "siempre los pushes a main, más cualquier rama cuando cambie `src`", eso son dos conjuntos de filtros separados, que `on:` no puede expresar en un solo bloque `push`: lo divides entre disparadores o usas condiciones `if:` a nivel de job sobre `github.ref` en su lugar.

```yaml
# FIXED — be explicit that you want both conditions, or drop one
on:
  push:
    branches: [main]
    paths:
      - 'src/**'
      - '.github/workflows/**'   # so CI changes still trigger
```

Por qué importa: la semántica AND está documentada en una sola frase y contradice la intuición de la mayoría. Si tu workflow se salta "aleatoriamente" algunos pushes a la rama correcta, un filtro de ruta es casi siempre la causa.

## 4. `paths` sin un acompañante `branches` aún necesita una ref real

Un corolario sutil: cuando filtras con `on.push.paths` y quieres que se aplique a todas las ramas, no necesitas un bloque `branches` en absoluto; omitirlo significa "todas las ramas". Pero en el momento en que añades `branches`, entra en juego la regla #3. A veces la gente añade `branches: ['**']` creyendo que es necesario para que `paths` funcione; no lo es, y añadirlo no cambia nada porque `**` coincide con todas las ramas de todos modos. Lo que hay que interiorizar es que un filtro ausente significa "coincidir con todo", y un filtro presente acota.

```yaml
# These behave identically: paths applies to every branch
on:
  push:
    paths: ['src/**']
# vs
on:
  push:
    branches: ['**']
    paths: ['src/**']
```

## 5. `paths-ignore` y el diff que es demasiado grande

`paths-ignore` se salta la ejecución **solo si cada archivo cambiado coincide con un patrón de ignorado**. Si un solo archivo cae fuera de la lista de ignorados, el workflow se ejecuta. Así que un único cambio descarriado derrota todo el filtro, que suele ser lo que quieres, pero sorprende a quienes esperan que "ignora estos archivos" signifique "ignora los commits que tocan estos archivos".

```yaml
# Skips ONLY when every changed file is docs; one code file => runs
on:
  push:
    paths-ignore:
      - 'docs/**'
      - '**.md'
```

Aquí viven dos trampas más. Primera, los filtros de ruta se evalúan contra el **diff**, y GitHub solo inspecciona hasta 300 archivos cambiados (1.000 commits); más allá de ese límite, el filtrado de rutas se rinde y el workflow se ejecuta (o se evalúa como si el filtro hubiera pasado). Un force-push gigantesco o un merge enorme pueden disparar un workflow que tu `paths-ignore` "debería" haber saltado. Segunda, no puedes mezclar `paths` y `paths-ignore` en el mismo disparador; elige uno.

Por qué importa: `paths-ignore` es una compuerta de todo-o-nada sobre el diff, y el techo de 300 archivos significa que no es una garantía firme en cambios grandes.

## 6. `pull_request`, forks y `pull_request_target`

Los filtros de rama en `pull_request` coinciden con la rama **base** (donde se fusionará la PR), no con la rama head en la que el contribuidor está trabajando. Si escribes `branches: [main]` esperando que coincida con la `feature/x` del contribuidor, no lo hará: coincide con las PRs *dirigidas* a `main`.

```yaml
# Runs on PRs whose BASE (merge target) is main or a release branch
on:
  pull_request:
    branches:
      - main
      - 'release/**'
```

Y `pull_request` desde un fork está restringido: la PR de un contribuidor primerizo puede requerir aprobación manual antes de que se ejecute ningún workflow, lo que se ve idéntico a "no se disparó". Si cambiaste a `pull_request_target` para sortear las restricciones de los forks, ten en cuenta que lee el workflow y los disparadores de la versión del archivo de la rama **base**, y conlleva un riesgo de seguridad real, tratado en nuestro artículo [errores de seguridad en GitHub Actions](/blog/github-actions-security-misconfigurations/).

## Una chuleta de filtros para copiar y pegar

```yaml
on:
  push:
    branches:                 # ref globs; missing = all branches
      - main
      - 'release/**'          # ** crosses '/'; '*' does not
      - 'feature/**'
    tags:
      - 'v[0-9]+.[0-9]+.[0-9]+'   # numeric semver tags only
    paths:                    # ANDed with branches — BOTH must match
      - 'src/**'
      - '.github/workflows/**'
  pull_request:
    branches: [main]          # matches the PR's BASE branch
    paths-ignore:             # skip only if EVERY changed file matches
      - '**.md'
```

Referencia rápida de los caracteres glob: `*` = cualquier carácter excepto `/`, `**` = cualquier carácter incluyendo `/`, `?` = un carácter, `+` = uno o más del carácter anterior, `[a-z]` = rango, `!` inicial = negar, `\` = escapar.

## Deja de adivinar — repite tu evento

La razón por la que estos bugs son enloquecedores es que el ciclo de retroalimentación es "haz push y reza". No hay dry-run, no hay `--explain`, solo una pestaña Actions vacía. Así que haces un commit de una línea, push, refrescas, esperas y repites, quemando minutos por cada conjetura contra una semántica de la que no estás seguro.

El **Probador de Expresiones y Disparadores de GitHub Actions** cierra ese ciclo. Pega tu bloque `on:`, describe el evento —`push` a `feature/login`, tag `v2.1.0`, o un `pull_request` dirigido a `main` con una lista de archivos cambiados— y evalúa cada filtro `branches`, `tags`, `paths` y `paths-ignore` con el mismo motor de glob y la misma semántica AND que usa GitHub. Obtienes una tabla **RUNS / SKIPPED** por job con la razón decisiva exacta: "la rama coincidió, pero ningún filtro de ruta lo hizo", o "`*` no cruza `/`". Es 100% en tu navegador: el YAML de tu workflow nunca sale de la página.

Ve exactamente qué jobs se ejecutan antes de hacer push, no después.

[Abre el Probador de Expresiones y Disparadores de GitHub Actions →](/github-actions-expression-tester/)
