---
title: "Leer expresiones cron: una guía campo por campo"
description: "Una guía práctica, campo por campo, para leer expresiones cron — los cinco campos de tiempo, rangos, pasos, listas y @macros — además de las trampas que hacen que las programaciones se disparen cuando menos lo esperas."
pubDate: 2026-05-13
tags: ["cron", "scheduling", "devops"]
lang: es
translationOf: "cron-expressions-explained"
---

![Leer expresiones cron campo por campo: una guía de programación de los cinco campos de tiempo de cron, rangos y pasos](/blog/cron-expressions-explained-hero.svg)

Casi cualquiera que administre un backend ha mirado fijamente una línea como `*/15 9-17 * * 1-5` y ha recordado a medias lo que hace. La sintaxis de cron es compacta, lo cual es su gran virtud y su gran trampa: cinco diminutos campos codifican una programación recurrente, y un solo carácter mal colocado puede convertir "cada tarde entre semana" en "cada minuto, para siempre". Esta guía lee una expresión cron tal como lo hace el demonio — campo por campo — para que la próxima vez que te encuentres con una puedas descifrarla a primera vista.

## Los cinco campos

Una expresión cron estándar consta de cinco campos separados por espacios en blanco, siempre en este orden:

```text
┌───────────── minute        (0–59)
│ ┌─────────── hour          (0–23)
│ │ ┌───────── day of month  (1–31)
│ │ │ ┌─────── month         (1–12 or JAN–DEC)
│ │ │ │ ┌───── day of week   (0–6, Sun=0; 7 also = Sun)
│ │ │ │ │
* * * * *
```

El trabajo se ejecuta en cada minuto en el que **todos** los campos de tiempo coinciden con el momento actual. Un campo con `*` significa "cualquier valor", así que el canónico `* * * * *` se dispara una vez por minuto. Lee de izquierda a derecha y las programaciones más comunes saltan a la vista enseguida:

```text
0 * * * *      at minute 0 of every hour          → hourly, on the hour
30 2 * * *      at 02:30 every day                 → a nightly batch job
0 0 1 * *      at 00:00 on day 1 of every month    → monthly rollover
0 9 * * 1      at 09:00 every Monday               → start-of-week report
```

Ten en cuenta que los segundos **no** forman parte del cron Unix estándar. Algunas implementaciones (Quartz, muchas bibliotecas de Go y Node; Kubernetes es la excepción notable que se queda en cinco) anteponen un sexto campo de segundos. Si una expresión de seis campos se comporta de forma extraña en un `crontab` simple, ese campo adicional suele ser el motivo.

![Los cinco campos de una expresión cron etiquetados como minuto, hora, día del mes, mes y día de la semana, con anotaciones de paso y rango](/blog/cron-expressions-explained-diagram.svg)

## Rangos, pasos y listas

Tres operadores hacen la mayor parte del trabajo pesado, y se combinan dentro de un mismo campo:

- **Rango** `a-b` — un intervalo inclusivo. `9-17` en el campo de la hora significa de las 9 a las 17 horas.
- **Paso** `*/n` o `a-b/n` — cada enésimo valor. `*/15` en el campo de los minutos significa 0, 15, 30, 45. `9-17/2` significa 9, 11, 13, 15, 17.
- **Lista** `a,b,c` — un conjunto explícito. `1,15` en el campo del día del mes significa el día 1 y el día 15.

Puestos en conjunto, la expresión del párrafo inicial se descifra con claridad:

```text
*/15 9-17 * * 1-5
 │    │   │ │  └── Monday through Friday
 │    │   │ └───── every month
 │    │   └─────── every day of the month
 │    └─────────── hours 9 through 17 (9 AM–5 PM)
 └──────────────── every 15th minute (0, 15, 30, 45)
```

Es decir: **cada 15 minutos, entre las 9 de la mañana y las 5 de la tarde, de lunes a viernes.** Una cadencia razonable para un trabajo de sincronización que debería descansar de noche y los fines de semana. El peligro está en lo poco que esto se diferencia de `* 9-17 * * 1-5`, que elimina el paso y se dispara *cada minuto* dentro de esa ventana — 60× la carga. El carácter que separa una programación pulcra de una denegación de servicio accidental tiene dos caracteres de ancho.

## La trampa del día del mes / día de la semana

La regla más sorprendente de cron es cómo se combinan los dos campos de "día". La intuición dice que se aplican con un AND como cualquier otro par de campos. No es así. Cuando **ambos** campos, día del mes y día de la semana, están restringidos (ninguno es `*`), cron los trata como un **OR**: el trabajo se ejecuta si *cualquiera* de los dos coincide.

```text
0 0 1,15 * 5    midnight on the 1st, on the 15th, OR on any Friday
```

Esa expresión no significa "el día 1 o el 15, pero solo si es viernes". Significa tres disparadores separados. Si realmente necesitas un AND — por ejemplo, "el primer lunes del mes" — el cron clásico no puede expresarlo directamente; lo proteges dentro del propio trabajo (`[ "$(date +\%d)" -le 07 ] || exit 0`) o recurres a una extensión como el operador `#` de Quartz (`MON#1`). Esta regla del OR es responsable de buena parte de los incidentes del tipo "¿por qué se disparó esto dos veces?".

## Los @macros

La mayoría de los cron aceptan un puñado de atajos con nombre que sustituyen a una expresión completa de cinco campos. Se leen mejor y eliminan toda una clase de errores de tipeo:

```text
@hourly    →  0 * * * *
@daily     →  0 0 * * *   (alias: @midnight)
@weekly    →  0 0 * * 0
@monthly   →  0 0 1 * *
@yearly    →  0 0 1 1 *   (alias: @annually)
```

También existe `@reboot`, que es especial: se ejecuta una vez cuando arranca cron, no según ninguna programación de reloj. Es útil para precalentar una caché tras un reinicio, e inútil para cualquier cosa relacionada con la hora del día — y una fuente frecuente de reportes del tipo "mi trabajo diario nunca se ejecutó" cuando alguien lo usa por error.

## Leer las trampas

Unas cuantas reglas más separan a quienes *creen* que leen cron de quienes realmente lo hacen:

- **Zonas horarias.** El cron clásico se ejecuta en la zona horaria local del sistema, de modo que las transiciones de horario de verano pueden saltarse o repetir un trabajo. Un trabajo de las 02:30 se ejecuta cero veces en la noche en que se adelanta el reloj y dos veces en la noche en que se atrasa. Los sistemas que importan fijan cada vez más sus programaciones a UTC precisamente por esta razón.
- **Numeración del día de la semana.** El domingo es `0`, y `7` también se acepta como domingo en la mayoría de las implementaciones — pero no en todas. Prefiere los nombres de tres letras (`SUN`, `MON`, …) cuando puedas; son inequívocos.
- **`*/n` no da la vuelta.** `*/40` en el campo de los minutos se dispara en el minuto 0 y el 40, y luego salta al 0 de la hora siguiente. **No** significa "cada 40 minutos" — la cuenta se reinicia cada hora, así que el intervalo real entre el :40 y el siguiente :00 es de solo 20 minutos.

Ninguna de estas reglas es exótica. Son los límites cotidianos que hacen que una programación se dispare a una hora que no pretendías, y ninguna de ellas es visible con solo mirar fijamente los cinco campos.

## Verifica antes de desplegar

La forma honesta de leer una expresión cron es no fiarte de tu lectura de ella. Descífrala a un texto claro y luego observa las marcas de tiempo reales que producirá a lo largo de las próximas ejecuciones — ahí es donde el bucle de `*/40`, el hueco del horario de verano y el OR del campo de día se revelan de inmediato.

El **Cron Expression Tester** hace exactamente eso en tu navegador: pega cualquier expresión — rangos, pasos, listas, `@macros` y todo lo demás — y obtén una descripción en lenguaje claro junto a las próximas horas de ejecución, sin que nada se suba a ningún sitio. Convierte "creo que esto es cada tarde entre semana" en "estas son las próximas diez veces que se dispara", que es la única lectura que cuenta.

[Prueba el Cron Expression Tester →](/cron-expression-tester/)
