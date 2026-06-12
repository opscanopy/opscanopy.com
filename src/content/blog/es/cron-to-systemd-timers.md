---
title: "Migrar de cron a temporizadores de systemd"
description: "Una guía práctica para convertir entradas de crontab en unidades .timer y .service de systemd: sintaxis OnCalendar, registro de logs, retardos aleatorios, ejecuciones de recuperación y las trampas que aparecen durante la migración."
pubDate: 2026-05-20
tags: ["systemd", "cron", "linux"]
lang: es
translationOf: "cron-to-systemd-timers"
---

Cron ha gestionado las tareas programadas del mundo durante cuarenta años, y en la mayoría de los servidores todavía funciona bien. Pero en el momento en que una tarea necesita registro estructurado de logs, un entorno controlado, ordenación por dependencias o una forma de recuperarse después de que la máquina haya estado apagada, el modelo de cron empieza a quedarse corto. Ahí es donde entran los temporizadores de systemd, y si tu distribución ya ejecuta systemd (Debian, Ubuntu, RHEL, Fedora, Arch y SUSE lo hacen), tienes un programador más capaz que no estás usando.

Este artículo recorre lo que realmente cambia cuando migras, con unidades reales que puedes adaptar.

## Por qué molestarse en abandonar cron

Cron es una sola línea. Esa brevedad es su atractivo y su límite:

- **Registro de logs.** La salida de una tarea de cron va a donde la redirijas, y si lo olvidas, se envía por correo a un buzón que nadie lee. Un servicio de systemd escribe en el journal automáticamente: `journalctl -u myjob.service` te muestra cada ejecución, con marcas de tiempo y códigos de salida.
- **Entorno.** Cron se ejecuta con un `PATH` deliberadamente mínimo y casi sin entorno, que es la clásica trampa de “funciona en mi shell, falla en cron”. Una unidad de servicio declara su entorno de forma explícita.
- **Ejecuciones perdidas.** Si el host está suspendido o apagado en el minuto programado, cron simplemente se salta la tarea. Un temporizador con `Persistent=true` la ejecuta en cuanto la máquina vuelve a estar disponible.
- **Solapamiento y recursos.** systemd no iniciará una segunda copia de una tarea mientras la primera siga ejecutándose, y puedes adjuntar `CPUQuota=`, `MemoryMax=` y otros controles de recursos a una unidad.

No necesitas migrar todo. Pero para las tareas en las que un fallo silencioso te cuesta caro, los temporizadores valen los dos archivos que requieren.

## El modelo de dos archivos

Una línea de cron hace la programación y la ejecución en un solo lugar. systemd divide esto en un **servicio** (qué ejecutar) y un **temporizador** (cuándo ejecutarlo). Comparten un nombre base.

Toma esta entrada de crontab, que ejecuta un script de copia de seguridad todos los días a las 02:30:

```cron
30 2 * * * /usr/local/bin/backup.sh
```

Eso se convierte en dos unidades en `/etc/systemd/system/`.

El servicio, `backup.service`:

```ini
[Unit]
Description=Nightly backup
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/backup.sh
```

El temporizador, `backup.timer`:

```ini
[Unit]
Description=Run nightly backup at 02:30

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true

[Install]
WantedBy=timers.target
```

`Type=oneshot` le indica a systemd que se espera que la tarea se ejecute, termine y salga: el tipo correcto para casi cualquier tarea al estilo de cron. La sección `[Install]` del temporizador es lo que hace que `systemctl enable` funcione; sin `WantedBy=timers.target`, el temporizador no se activará al arrancar.

Habilítalo e inícialo:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now backup.timer
```

Fíjate en que habilitas el **temporizador**, no el servicio. El temporizador invoca el servicio cuando se dispara.

## Traducir la programación: OnCalendar

La parte más difícil de la migración es el campo de programación, porque systemd usa `OnCalendar=` en lugar de los cinco campos de cron. El formato es `DOW YYYY-MM-DD HH:MM:SS`, y es realmente más legible una vez que lo aprendes. Algunas correspondencias habituales:

```text
# cron                        # OnCalendar
*/15 * * * *                  *-*-* *:0/15:00      (every 15 minutes)
0 * * * *                     *-*-* *:00:00        (hourly, on the hour)
30 2 * * *                    *-*-* 02:30:00       (daily at 02:30)
0 4 * * 1                     Mon *-*-* 04:00:00   (Mondays at 04:00)
0 0 1 * *                     *-*-01 00:00:00      (1st of the month)
0 9 * * 1-5                   Mon..Fri *-*-* 09:00:00  (weekdays at 09:00)
```

También hay atajos prácticos —`hourly`, `daily`, `weekly`, `monthly`—, de modo que `OnCalendar=daily` equivale a la medianoche de cada día. El comando más útil durante la migración es `systemd-analyze calendar`, que analiza una expresión y te muestra las próximas horas de disparo:

```bash
$ systemd-analyze calendar --iterations=3 'Mon..Fri *-*-* 09:00:00'
  Original form: Mon..Fri *-*-* 09:00:00
Normalized form: Mon..Fri *-*-* 09:00:00
    Next elapse: Mon 2026-06-08 09:00:00 UTC
       From now: 4h 12min left
       (next 3)  Tue 2026-06-09 09:00:00 UTC
                 Wed 2026-06-10 09:00:00 UTC
```

Si esa salida coincide con lo que hacía tu línea de cron, la programación es correcta. Si no coincide, has detectado el error antes de que llegara a producción.

## Las trampas que realmente te muerden

**Zona horaria.** Cron usa la hora local del sistema. Los temporizadores de systemd también lo hacen de forma predeterminada, pero `OnCalendar` se evalúa en la zona horaria del temporizador, lo que puede sorprenderte en servidores configurados en UTC. Fíjala de forma explícita con `OnCalendar=Mon *-*-* 04:00:00 America/New_York` si la hora local importa, y recuerda que las transiciones de horario de verano pueden saltarse o duplicar una ejecución.

**Estampida.** Cron dispara las tareas `0 * * * *` exactamente al :00 en toda tu flota. Añade `RandomizedDelaySec=` para repartir la carga:

```ini
[Timer]
OnCalendar=hourly
RandomizedDelaySec=300
Persistent=true
```

Eso desfasa cada ejecución hasta cinco minutos: algo muy valioso cuando cien hosts golpean la misma API.

**Entorno y directorio de trabajo.** El entorno escaso de cron hace tropezar a la gente; igual que dar por sentado un directorio de trabajo. Sé explícito en el servicio:

```ini
[Service]
Type=oneshot
WorkingDirectory=/opt/app
Environment=PATH=/usr/local/bin:/usr/bin:/bin
EnvironmentFile=-/etc/app/env
ExecStart=/opt/app/run.sh
```

El `-` al principio de `EnvironmentFile` significa “no falles si el archivo no existe”, replicando el comportamiento indulgente de cron.

**Tareas por usuario.** Un crontab de usuario se corresponde con una unidad de usuario. Coloca los archivos en `~/.config/systemd/user/`, habilítalos con `systemctl --user enable --now myjob.timer` y ejecuta `loginctl enable-linger $USER` para que el temporizador sobreviva al cierre de sesión.

## Verificar la migración

Después de habilitarlo, confirma que el temporizador está activado e inspecciona su historial:

```bash
systemctl list-timers --all          # see next/last run for every timer
journalctl -u backup.service --since today   # read the job's output
sudo systemctl start backup.service  # trigger a manual run to test now
```

`systemctl start backup.service` ejecuta la tarea de inmediato, con independencia de la programación: la forma más limpia de confirmar que la mitad del servicio funciona antes de confiar en el temporizador.

## No traduzcas a mano cada campo

La parte mecánica —convertir cinco campos de cron en una línea `OnCalendar` y montar el par `.timer`/`.service`— es exactamente el tipo de cosa que es fácil equivocar sutilmente a mano, sobre todo con valores de paso, rangos y casos límite del día de la semana. Nuestro **Cron to systemd Converter** lo hace en el navegador: pega una línea de crontab y obtén una unidad de temporizador y de servicio lista para editar, con la expresión `OnCalendar` correcta y notas de migración, sin que se suba nada a ningún sitio.

[Convierte tu crontab a temporizadores de systemd →](/cron-to-systemd)
