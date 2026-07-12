---
title: "Cómo validar tu .gitlab-ci.yml antes de hacer push"
description: "Deja de subir pipelines rotos. Valida tu .gitlab-ci.yml en busca de errores de YAML y estructurales desde el navegador: antes del commit, no después del pipeline en rojo."
pubDate: 2026-06-11
tags: ["gitlab-ci","ci-cd","yaml"]
lang: es
translationOf: "validate-gitlab-ci-yml"
relatedTool:
  name: "GitLab CI Validator"
  href: "/gitlab-ci-validator"
---

![Validador de GitLab CI revisando un .gitlab-ci.yml en busca de errores de YAML y de pipeline antes del push](/blog/validate-gitlab-ci-yml-hero.svg)

Cambias una línea en `.gitlab-ci.yml`, haces push y te pones con otra cosa. Dos minutos después el pipeline se pone en rojo, y no porque la build se haya roto, sino porque un job apunta a un `stage` que renombraste la semana pasada. Corriges el error, vuelves a hacer push, vuelves a esperar. Este es el bucle, y la única forma de salir de él es validar `.gitlab-ci.yml` *antes* de que el commit aterrice, no después de que el runner te lo diga.

Lo frustrante es que GitLab ya sabe que tu configuración está rota en cuanto la parsea. Simplemente no te lo dice hasta que ya has hecho push y has quemado un minuto de CI. La solución es ejecutar esa misma comprobación en local, en el navegador, antes de hacer `git push`.

## El bucle de hacer push y rezar

Esta es la forma del problema. Editas un job, haces push y dejas que GitLab te haga de linter:

```bash
git add .gitlab-ci.yml
git commit -m "split deploy into staging + prod"
git push
# wait for the runner to pick up the pipeline...
# pipeline failed: "chosen stage prod does not exist"
git commit -am "fix: declare prod stage"
git push
# wait again...
```

Cada ida y vuelta es un commit que no querías, un slot de runner que no necesitabas y un cambio de contexto que cuesta más que el propio error tipográfico. Los errores que provocan esto casi nunca necesitan un runner para detectarse. Son visibles en el momento en que se parsea el YAML y se resuelve el grafo de jobs, que es exactamente lo que hace un validador en local.

## Dos tipos de errores: sintaxis YAML frente a estructura

Cuando GitLab rechaza un pipeline, el fallo es de una de dos categorías, y cada una tiene una solución completamente distinta.

El primero es un **error de sintaxis YAML**: el archivo ni siquiera es YAML válido, así que nada río abajo puede leerlo. El segundo es un **error estructural**: el YAML parsea bien, pero el *pipeline* que describe no es válido: un job sin script, un stage que nunca se declaró, un `needs` que apunta a un job que no existe.

```yaml
# YAML error — the parser can't even build a document
build:
  script:
    - make
   - make test      # inconsistent indentation: parser bails here

# Structural error — valid YAML, invalid pipeline
deploy:
  stage: prod        # "prod" is not in stages: → GitLab refuses to run it
  script: ./deploy.sh
```

Que el YAML sea válido es solo la mitad del trabajo. El [GitLab CI Validator](/gitlab-ci-validator) comprueba ambas cosas en una sola pasada: primero parsea el YAML, y solo si eso tiene éxito ejecuta las comprobaciones estructurales sobre tus jobs. Si el parseo falla, obtienes un único error con referencia a la línea y nada más: no tiene sentido reportar "undefined stage" en un documento que ni siquiera parseó.

![Ilustración: un .gitlab-ci.yml brillante analizado por herramientas de CI lint, yamllint y comprobaciones del editor, con veredictos de OK y de error fluyendo hacia un draft merge request](/blog/in-content/validate-gitlab-ci-yml.webp)

## Errores de YAML que muerden: indentación, tabulaciones, claves duplicadas

En YAML el espacio en blanco es significativo, y la configuración de CI es justo el tipo de estructura anidada donde eso muerde. El clásico mensaje de error de GitLab —`did not find expected key`— casi siempre es uno de estos.

```yaml
test:
  stage: test
	script:              # a literal TAB instead of spaces → parse error
    - npm test

variables:
  DEPLOY_ENV: staging
  DEPLOY_ENV: prod       # duplicate key — the first value is silently lost

deploy:
  script: &deploy_steps  # anchor defined...
    - ./deploy.sh
rollback:
  script: *deploy_step   # ...but referenced with a typo → "unknown alias"
```

Un validador en el navegador parsea con un lector de YAML de verdad, así que reporta la línea exacta donde se rompió la estructura. Cuando pegas la configuración y el resultado es `Could not parse YAML: ... (line 4, column 2)`, ese es el parser diciéndote con precisión dónde mirar: vuelve a indentar, cambia la tabulación por espacios o corrige el nombre del anchor, y valida de nuevo.

## Errores estructurales que GitLab detecta tarde: stages no declarados, jobs sin script, needs/extends incorrectos

Estos son los que te hacen esperar a un runner solo para que te digan que el pipeline nunca arrancó. Son la verdadera razón para validar GitLab CI antes del push. El validador modela las reglas de la referencia de palabras clave de `.gitlab-ci.yml` de GitLab y señala cada una con el job que la provoca, la línea y la solución.

![Flujo de un pipeline de validación: pegar .gitlab-ci.yml, parsear YAML, ejecutar comprobaciones estructurales y luego mostrar válido o una lista de errores](/blog/validate-gitlab-ci-yml-diagram.svg)

**Un job sin superficie ejecutable.** Todo job visible tiene que *hacer* algo: ejecutar comandos con `script:` (o el más reciente `run:`), arrancar un pipeline río abajo con `trigger:`, o heredar uno de ellos mediante `extends:`. Un job que no tiene ninguno se rechaza con el familiar "job config should implement a script: or a trigger: keyword."

```yaml
# ERROR — empty-job defines no script, run, trigger, or extends
empty-job:
  stage: test
  # nothing here → GitLab won't run it
```

Ten en cuenta que un `script: []` o un `script: ""` *vacíos* también cuentan como ausentes: el validador trata como superficie ejecutable real solo una cadena o lista de comandos no vacía, igual que hace GitLab.

**Un stage que no está declarado.** Si el `stage:` de un job no está en tu lista `stages:` (o no es uno de los cinco por defecto: `.pre`, `build`, `test`, `deploy`, `.post`), GitLab no sabe cuándo ejecutarlo.

```yaml
stages:
  - build
  - test

release-job:
  stage: release      # ERROR — "release" is not in stages:
  script: make release
```

Hay una variante sutil que el validador también detecta: un job que *omite* `stage:` toma por defecto el stage implícito `test`. Si declaraste una lista `stages:` personalizada que no incluye `test`, ese job ahora apunta a un stage que nunca declaraste, y GitLab falla con "chosen stage test does not exist."

**`needs` / `dependencies` / `extends` apuntando a un job que no existe.** Cada nombre en `needs:`, `dependencies:` o `extends:` tiene que resolverse a un job real o a un `.template` oculto en el mismo archivo.

```yaml
test:
  stage: test
  needs:
    - compile          # ERROR — no job named "compile"
  extends: .base       # ERROR — no template named ".base"
  script: make test
```

El validador construye el conjunto de todos los ids de job y de todos los `.template`, y luego comprueba cada referencia contra él. Renombra un template y olvídate de actualizar un `extends:`, y te dirá qué job se rompió antes que el runner.

**Un `when:` inválido o un `rules:` que no es lista.** La palabra clave `when:` solo acepta `on_success`, `on_failure`, `always`, `manual`, `delayed` o `never`. Y `rules:` tiene que ser una *lista* YAML de objetos de regla: un mapping suelto es un error común que cambia silenciosamente cuándo se ejecuta un job.

```yaml
deploy:
  stage: deploy
  when: sometimes      # ERROR — not an allowed when value
  rules:
    if: '$CI_COMMIT_TAG'   # ERROR — rules must be a list, not a mapping
  script: ./deploy.sh
```

También saca a la luz avisos de menor severidad: los antiguos `only`/`except` reciben una nota informativa recomendando `rules:` (los dos no se pueden combinar en un mismo job), una clave de nivel superior que está a una sola edición de una palabra clave reservada —por ejemplo `varables:` o `beforescript:`— recibe una advertencia de error tipográfico, y las formas mal construidas de `image:`/`services:` se marcan como errores.

## Validar antes del push: GitLab CI Lint frente a un validador en el navegador

GitLab incluye su propio comprobador: CI Lint, dentro del editor de pipelines. Es la fuente autorizada: resuelve los archivos de `include:` y las variables de CI/CD a nivel de proyecto, que una herramienta del lado del cliente no puede ver. Pero tiene un coste: requiere un proyecto y haber iniciado sesión. No puedes lintar un fragmento de una revisión de código, una configuración que estás redactando sin conexión, o un pipeline propietario que preferirías no pegar en un formulario alojado.

Entonces, ¿qué comprueba en realidad un validador en el navegador? Según el motor, el flujo es determinista y completamente local:

1. **Parsea el YAML.** Cualquier fallo devuelve un único error con referencia a la línea y se detiene: no hay hallazgos estructurales sobre un documento que no parsea.
2. **Divide el nivel superior** en palabras clave globales (`stages`, `default`, `variables`, `image`, `services`…), jobs visibles y `.templates` ocultos.
3. **Resuelve los stages** —tu lista `stages:` declarada, o los cinco por defecto— en el conjunto contra el que se comprueba el `stage:` de cada job.
4. **Comprueba cada job** en busca de una superficie ejecutable, un stage conocido, objetivos reales de `needs`/`extends`/`dependencies`, un `when:` válido, un `rules:` con forma de lista y formas razonables de `image`/`services`.
5. **Ordena por severidad** —primero los errores, luego las advertencias y por último la información—, cada uno con la línea y una remediación concreta. Nunca lanza una excepción; un fallo de parseo se reporta, no provoca un crash.

La lectura honesta: un resultado limpio en el navegador es una fuerte confianza previa al push sobre la *estructura y la sintaxis*. Detecta toda la clase de errores que hacen fallar un pipeline antes de que se ejecute ningún job. Para tener certeza absoluta sobre una configuración que usa `include:` o variables de proyecto, confírmalo con el propio CI Lint de GitLab una vez que hayas hecho push al proyecto, pero usa la pasada en el navegador para que ese push cuente.

Si además usas GitHub Actions, la misma idea aplica allí: el [GitHub Actions Validator](/github-actions-validator) encuentra problemas de YAML y de seguridad en tus archivos de workflow, y el [GitHub Actions Expression Tester](/github-actions-expression-tester) evalúa esas expresiones `${{ … }}` antes de que hagas push.

## Intégralo en tu flujo de trabajo

El validador es una herramienta de pegar y comprobar, pero el hábito que quieres es "nunca hacer push de configuración de CI que no hayas validado." Un hook de pre-commit hace eso automático para la mitad del YAML: capturar los errores de parseo antes de que el commit siquiera se forme.

```bash
#!/usr/bin/env bash
# .git/hooks/pre-commit — block a commit if .gitlab-ci.yml isn't valid YAML
set -euo pipefail

if git diff --cached --name-only | grep -q '^\.gitlab-ci\.yml$'; then
  # Fail fast on a syntax error before the commit lands.
  python -c "import sys, yaml; yaml.safe_load(open('.gitlab-ci.yml'))" \
    || { echo "✗ .gitlab-ci.yml is not valid YAML — commit blocked"; exit 1; }
  echo "✓ .gitlab-ci.yml parses — paste it into the validator for structural checks"
fi
```

Un parseo de YAML local captura al instante la clase de errores de indentación y tabulaciones. Para la clase estructural —stages no declarados, `needs` rotos, jobs sin script— pega el archivo en el validador del navegador antes de hacer push. Juntos cubren ambas categorías de error de la segunda sección, y ninguno necesita un runner.

```bash
# the loop you actually want
$ git add .gitlab-ci.yml          # pre-commit hook checks YAML
# paste .gitlab-ci.yml → validator → 0 errors
$ git commit -m "split deploy into staging + prod"
$ git push                        # green on the first try
```

## Valídalo ahora

La próxima vez que toques `.gitlab-ci.yml`, no dejes que el runner sea lo primero que lo lea. Pega el archivo en el [GitLab CI Validator](/gitlab-ci-validator) y obtendrás los errores de YAML y los fallos estructurales —stages no declarados, jobs sin script, `needs`/`extends` rotos, `when:` inválido— en una sola pasada, con la línea y la solución de cada uno. Se ejecuta por completo en tu navegador: sin proyecto, sin inicio de sesión y sin subir nada, así que es seguro para pipelines internos.

Si alguna vez has hecho push de un cambio de CI y has rezado para que funcionara, este es el paso que faltaba.
