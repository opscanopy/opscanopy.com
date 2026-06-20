---
title: "Por qué tu condición \"if\" de GitHub Actions siempre se ejecuta (y cómo solucionarlo)"
description: "¿Tu condición if de GitHub Actions siempre se evalúa como verdadera? Es la trampa del texto literal: cualquier texto fuera de ${{ }} se convierte en una cadena truthy. Aquí tienes la causa y la solución."
pubDate: 2026-06-14
tags: ["github-actions", "ci-cd"]
relatedTool:
  name: "Probador de Expresiones y Disparadores de GitHub Actions"
  href: "/github-actions-expression-tester"
lang: es
translationOf: "github-actions-if-condition-always-true"
---
![Condición if de GitHub Actions que siempre se ejecuta como verdadera porque el texto literal fuera de las llaves de la expresión se convierte en una cadena truthy](/blog/github-actions-if-condition-always-true-hero.svg)

Añadiste un `if:` a un paso para que solo se ejecutara en `main`, o solo en un tag, o solo cuando un paso anterior estableciera una salida. Luego hiciste push — y el paso se ejecutó de todos modos. Cada vez. En cada rama. La condición es pura decoración.

Si tu condición `if` de GitHub Actions no funciona — concretamente, si *siempre* se evalúa como verdadera — es casi seguro que has caído en la trampa más común de todo el producto: **poner texto literal donde GitHub espera una expresión.** El runner no lanza ningún error por ello. Convierte silenciosamente tu texto en una cadena no vacía, decide que una cadena no vacía es truthy y ejecuta el paso. Este artículo muestra los patrones incorrectos exactos, las correcciones y las reglas de conversión que hay debajo, para que dejes de adivinar.

## La trampa: el texto literal fuera de `${{ }}` siempre es truthy

En un `if:`, GitHub ya evalúa el valor como una expresión — **no** envuelves todo en `${{ }}`. Pero en el momento en que cualquier texto literal se cuela fuera de las llaves de la expresión, el runner deja de tratar la línea como una condición y empieza a tratarla como una cadena. Una cadena no vacía es truthy. Tu paso siempre se ejecuta.

```yaml
# BAD — the ${{ }} is embedded in a larger string, so the whole if: is a string
- name: Deploy
  if: ${{ github.ref == 'refs/heads/main' }} && success()
  run: ./deploy.sh
```

Eso parece razonable, pero el runner ve: evaluar `${{ ... }}` como `true`, y luego concatenar ` && success()` como **texto literal**. El valor final es la cadena `"true && success()"` — no vacía, por lo tanto truthy. El paso se ejecuta en cada rama.

La solución es escribir **una sola** expresión sin llaves y sin texto suelto:

```yaml
# FIXED — a single bare expression, no ${{ }}, no trailing literal
- name: Deploy
  if: github.ref == 'refs/heads/main' && success()
  run: ./deploy.sh
```

La misma trampa te atrapa cuando entrecomillas la condición *entera*:

```yaml
# BAD — the entire condition is a quoted string literal, always truthy
- if: "${{ steps.check.outputs.changed == 'true' }}"
  run: ./build.sh
```

Envolver la expresión entre comillas convierte el valor de YAML en una cadena simple. GitHub encuentra un `${{ }}` dentro de ella, sustituye el resultado y vuelves a tener una cadena no vacía. Quita las comillas y las llaves:

```yaml
# FIXED
- if: steps.check.outputs.changed == 'true'
  run: ./build.sh
```

Regla práctica: **en un `if:` no hay `${{ }}` ni comillas envolventes.** Solo la expresión. Las llaves sirven para interpolar valores en `run:`, `name:` y `with:` — no para las condiciones.

Puedes pegar cualquiera de estos en el [Probador de Expresiones y Disparadores de GitHub Actions](/github-actions-expression-tester) y verlo marcar la fuga de texto literal antes de hacer push — avisa exactamente sobre este patrón (está registrado como [actions/runner#1173](https://github.com/actions/runner/issues/1173), el bug con más reacciones del repositorio del runner).

![Una condición if de GitHub Actions que siempre es verdadera porque devuelve una cadena truthy, junto a la expresión booleana corregida](/blog/github-actions-if-condition-always-true-diagram.svg)

## El `success()` implícito que desaparece cuando añades un `if:`

Aquí va la segunda sorpresa, y es la razón de «mi paso condicional se ejecuta aunque el paso anterior haya fallado».

Cada paso y cada job tiene una **condición `success()` implícita**. Sin ningún `if:`, un paso solo se ejecuta si todo lo anterior tuvo éxito. Por eso los pipelines se detienen en el primer fallo sin que escribas nada.

En el instante en que añades un `if:` *personalizado*, ese `success()` implícito **desaparece**. Tu condición es ahora *toda* la verdad.

```yaml
# BAD — you wanted "on main", but you deleted the implicit success() guard
- name: Notify on main
  if: github.ref == 'refs/heads/main'
  run: ./notify.sh   # now runs on main EVEN IF the build above failed
```

Si todavía quieres que el paso requiera éxito, dilo explícitamente:

```yaml
# FIXED — re-add the success() guard you lost
- name: Notify on main
  if: success() && github.ref == 'refs/heads/main'
  run: ./notify.sh
```

Esto también explica por qué hay quien se desconcierta de que un paso de «limpieza» se ejecute solo en caso de éxito cuando querían que se ejecutara pasara lo que pasara — la protección implícita sigue ahí hasta que añaden `always()`.

## `success()` frente a `always()` frente a `failure()` frente a `cancelled()`

Estas cuatro funciones de estado deciden *si el paso tiene en cuenta los resultados anteriores en absoluto*. Confundirlas es la otra mitad de «mi `if` no se comporta».

- **`success()`** — verdadero solo si todos los pasos/jobs anteriores tuvieron éxito. (Este es el valor por defecto implícito.)
- **`failure()`** — verdadero si algún paso anterior falló. Úsalo para notificaciones de fallo.
- **`always()`** — verdadero incondicionalmente; el paso se ejecuta aunque un paso anterior haya fallado *o el workflow se haya cancelado*. Úsalo para la limpieza que siempre debe ocurrir.
- **`cancelled()`** — verdadero solo cuando el workflow fue cancelado.

El error clásico es combinar `always()` con otra condición mediante `&&` y esperar que siga ejecutándose al cancelar — y lo hace, pero a menudo la gente quiere lo contrario:

```yaml
# BAD — "always upload logs, but only on main" — this does NOT short-circuit on failure
- name: Upload logs
  if: github.ref == 'refs/heads/main'
  run: ./upload-logs.sh   # skipped when the build fails, because implicit success() is gone... wait, no — it's gone, so it runs? See below.
```

Para ser precisos con ese último caso: como proporcionaste un `if:` personalizado, el `success()` implícito se elimina, así que el paso se ejecuta en `main` *independientemente* de si la compilación pasó o no. Si lo que realmente quieres es «subir los logs en main, pase o falle», eso es lo que tienes — pero deja la intención explícita para que el próximo lector no tenga que adivinar:

```yaml
# FIXED — explicit: run on main whether the build passed or failed
- name: Upload logs
  if: always() && github.ref == 'refs/heads/main'
  run: ./upload-logs.sh
```

Y para una alerta solo en caso de fallo:

```yaml
# FIXED — only when something upstream broke
- name: Alert
  if: failure()
  run: ./page-oncall.sh
```

## Sorpresas de conversión: `==`, cadenas e insensibilidad a mayúsculas

Incluso con expresiones bien formadas, las reglas de comparación de GitHub hacen tropezar a la gente porque son *parecidas* a JavaScript pero no son JavaScript.

**El `==` de cadenas es insensible a mayúsculas y minúsculas.** Esto pilla a quienes comparan refs de ramas o valores de entrada:

```yaml
# Surprise: both of these are TRUE
${{ 'MAIN' == 'main' }}          # true — case-insensitive
${{ 'Refs/Heads/Main' == github.ref }}  # may be true unexpectedly
```

**Conversión laxa entre tipos.** Cuando los dos lados difieren en tipo, GitHub los convierte hacia un número: los booleanos se convierten en `1`/`0`, y las cadenas se parsean como números (una cadena vacía y `'0'` son `0`; las cadenas no numéricas se convierten en `NaN`, y cualquier comparación con `NaN` es falsa). Así que:

```yaml
${{ true == 1 }}        # true
${{ '' == 0 }}          # true  — empty string coerces to 0
${{ '3.0' == 3 }}       # true
${{ 'abc' == 0 }}       # false — 'abc' is NaN, NaN != anything
```

**`&&` y `||` devuelven operandos, no booleanos.** Igual que en JavaScript, `a && b` devuelve `b` si `a` es truthy, y en caso contrario `a`. Esto es estupendo para valores por defecto (`inputs.name || 'default'`), pero significa que `if: inputs.flag && 'yes'` se evalúa como la cadena `'yes'` — truthy — y no como un booleano limpio.

Los valores falsy son exactamente estos: `false`, `0`, `''` (cadena vacía) y `null`. Todo lo demás — incluidas las cadenas `'false'` y `'0'`... espera: `'0'` es falsy porque se convierte en el número `0`, pero `'false'` es una **cadena no vacía que no se convierte en un número**, así que `${{ 'false' }}` es **truthy**. Ese único hecho causa más bugs de «mi entrada booleana siempre es verdadera» que cualquier otro:

```yaml
# BAD — workflow_dispatch inputs are STRINGS; 'false' is truthy
on:
  workflow_dispatch:
    inputs:
      deploy: { type: boolean }
jobs:
  go:
    if: inputs.deploy   # with type: boolean this is fine...
```

```yaml
# BAD — but if the value arrives as a string 'false', this always runs
- if: github.event.inputs.deploy   # string 'false' is truthy!
  run: ./deploy.sh
```

```yaml
# FIXED — compare explicitly so the string is interpreted as data
- if: github.event.inputs.deploy == 'true'
  run: ./deploy.sh
```

## `contains` y `startsWith` no son lo mismo que `==`

Filtrar por prefijo de ref es otro punto donde la función equivocada coincide de más sin avisar:

```yaml
# BAD — contains matches ANYWHERE, so 'feature/main-fix' passes too
- if: contains(github.ref, 'main')
  run: ./deploy.sh
```

```yaml
# FIXED — anchor to the start, or compare the full ref
- if: startsWith(github.ref, 'refs/heads/release/')
  run: ./deploy.sh
# or, for an exact branch:
- if: github.ref == 'refs/heads/main'
  run: ./deploy.sh
```

Recuerda que tanto `contains` como `startsWith` hacen comparación de cadenas de forma insensible a mayúsculas, igual que `==`.

## Prueba tu `if:` antes de hacer push

La razón de que estos bugs sean tan persistentes es el ciclo de retroalimentación: tradicionalmente, la única forma de «probar» una condición ha sido hacer commit, push y leer los logs — y luego adivinar, editar y volver a hacer push. Cada conjetura equivocada es una ida y vuelta.

El [Probador de Expresiones y Disparadores de GitHub Actions](/github-actions-expression-tester) cierra ese ciclo. Pega tu expresión `if:`, define un contexto simulado de `github` / `env` / `steps` / `needs`, y observa el resultado evaluado con las reglas exactas de operadores, conversión e insensibilidad a mayúsculas de GitHub — además de un aviso explícito cuando has dejado texto literal fuera de `${{ }}` y has construido sin querer una condición siempre truthy. Funciona enteramente en tu navegador; nada de tu workflow se sube.

Si alguna vez has publicado un `if:` y has esperado que omitiera el paso, esta es la comprobación que te lo dice antes de que lo haga el runner.

[Prueba el Probador de Expresiones y Disparadores de GitHub Actions →](/github-actions-expression-tester)
