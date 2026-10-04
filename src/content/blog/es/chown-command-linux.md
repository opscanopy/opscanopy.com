---
title: "Comando chown en Linux: cambiar propietario y grupo de archivos"
description: "El comando chown en Linux explicado: sintaxis user:group, chown -R y enlaces simbólicos, --reference, chgrp, chmod vs chown y cómo arreglar permisos de volúmenes Docker con IDs numéricos."
pubDate: 2026-10-04
tags: ["linux", "security", "devops"]
lang: es
translationOf: "chown-command-linux"
relatedTool:
  name: "chmod Calculator"
  href: "/chmod-calculator"
---

![Una llave que entrega una carpeta de un usuario a otro](/blog/chown-command-linux-hero.svg)
<!-- keywords: chown command | chown recursive, chown -R, chown linux, chmod vs chown | source: ahrefs free (2026-10-04) -->

Los permisos dicen *qué* pueden hacer el propietario, el grupo y todos los demás. La propiedad dice *quiénes* son el propietario y el grupo. Cuando un archivo tiene un modo razonable como `600` y aun así un servicio no puede leerlo, el problema rara vez es el modo: el archivo pertenece al usuario equivocado. Eso es lo que arregla `chown`.

Este artículo cubre la sintaxis de propietario y grupo, los cambios recursivos y las reglas de enlaces simbólicos que los acompañan, cómo copiar la propiedad de otro archivo, `chgrp`, el reparto de trabajo entre chown y chmod, y el caso real más común: un contenedor que no puede escribir en su propio volumen.

## La sintaxis

```bash
chown [opciones] PROPIETARIO[:GRUPO] ARCHIVO...
chown [opciones] --reference=ARCHIVO_REF ARCHIVO...
```

Propietario y grupo se escriben juntos, sin espacios, y cada uno puede ser un nombre o un ID numérico. Las formas se diferencian en detalles pequeños pero importantes:

| Escribes | El propietario pasa a ser | El grupo pasa a ser |
|---|---|---|
| `chown deploy archivo` | `deploy` | sin cambios |
| `chown deploy:web archivo` | `deploy` | `web` |
| `chown deploy: archivo` | `deploy` | el grupo de login de `deploy` |
| `chown :web archivo` | sin cambios | `web` (igual que `chgrp web archivo`) |
| `chown 1000:1000 archivo` | UID 1000 | GID 1000 |

Los dos puntos finales de `deploy:` pasan desapercibidos y son útiles: asignan el grupo primario del usuario sin que tengas que buscarlo. Algunos scripts antiguos usan un punto (`deploy.web`). GNU chown todavía lo acepta con un aviso, pero es ambiguo con nombres de usuario que contienen un punto, así que usa los dos puntos.

## Quién puede ejecutarlo

Cambiar el **propietario** de un archivo requiere root (en rigor, la capability `CAP_CHOWN`). Un usuario normal no puede regalar un archivo, ni siquiera uno suyo; si pudiera, cualquiera esquivaría las cuotas de disco o dejaría archivos a nombre de otro. Por eso la mayoría de comandos `chown` de la documentación empiezan por `sudo`.

Cambiar solo el **grupo** está permitido al propietario del archivo, siempre que sea miembro del grupo de destino. Root puede asignar cualquier grupo.

## Opciones útiles

- `-R`, `--recursive`: cambiar un directorio y todo lo que contiene.
- `-v`, `--verbose`: informar de cada archivo procesado; `-c`, `--changes` informa solo de los archivos cuya propiedad cambió de verdad.
- `-h`, `--no-dereference`: cambiar el propio enlace simbólico en vez del archivo al que apunta.
- `--reference=ARCHIVO`: copiar propietario y grupo de otro archivo.
- `--from=PROPIETARIO[:GRUPO]`: cambiar solo los archivos que tienen ahora ese propietario y ese grupo.
- `--preserve-root`: negarse a actuar de forma recursiva sobre `/`. Merece la pena en cualquier script que construya la ruta a partir de una variable.

## chown -R: propiedad recursiva

El caso recursivo de todos los días es entregar el directorio de una aplicación al usuario que la ejecuta:

```bash
sudo chown -R www-data:www-data /var/www/site
```

A diferencia de `chmod -R`, el `chown` recursivo no tiene la trampa de archivos frente a directorios, porque unos y otros quieren el mismo propietario. El peligro es la ruta. `sudo chown -R deploy: /` con un espacio de más, o un `$APP_DIR` que se expande a nada, reescribe la propiedad de todo el sistema y es muy difícil de deshacer. Pon las variables entre comillas, compruébalas y usa `--preserve-root`.

`--from` hace más seguros los cambios recursivos cuando solo quieres tocar algunos archivos. Por ejemplo, después de cambiar el UID de un usuario, esto reasigna solo los archivos que aún llevan el antiguo:

```bash
sudo chown -R --from=1001 1005 /srv/data
```

## Enlaces simbólicos: qué cambia chown

Un enlace simbólico tiene su propio propietario, distinto del de su destino, y el comportamiento por defecto de chown depende de si es recursivo:

- **No recursivo:** `chown deploy enlace` cambia el *destino*, no el enlace. Añade `-h` para cambiar el propio enlace.
- **Recursivo:** `-R` no sigue los enlaces simbólicos que encuentra dentro del árbol (`-P` es el valor por defecto). Añade `-H` para seguir los enlaces nombrados en la línea de comandos, o `-L` para seguir todo enlace a un directorio.

Ten cuidado con `-L`, y con `--dereference` combinado con `-R`. Si alguien que puede escribir dentro del árbol coloca un enlace a `/etc` mientras un `chown -R -L` lanzado por root lo recorre, el cambio de propiedad cae sobre `/etc`. En árboles donde otros pueden escribir, quédate con el comportamiento por defecto.

## --reference: copiar la propiedad de otro archivo

Cuando un archivo debe coincidir con sus vecinos, copia la propiedad en lugar de escribirla:

```bash
sudo chown --reference=/etc/nginx/nginx.conf /etc/nginx/conf.d/api.conf
```

Si el archivo de referencia es un enlace simbólico, chown usa el propietario y el grupo del archivo al que apunta. `chmod --reference` hace lo mismo con el modo, y juntos dejan un archivo nuevo idéntico a uno existente.

## chgrp

`chgrp web report.csv` cambia solo el grupo. Equivale exactamente a `chown :web report.csv`, admite las mismas opciones `-R`, `-h` y `--reference`, y es práctico en scripts porque deja clara la intención. Combinado con el bit setgid en un directorio (`chmod g+s shared/`), da una carpeta de equipo en la que cada archivo nuevo queda en el grupo del equipo.

## chown borra setuid y setgid

En Linux, cambiar el propietario o el grupo de un archivo ejecutable borra sus bits setuid y setgid, y desde el kernel 2.2.13 eso ocurre incluso cuando lo hace root. Es una regla de seguridad: un binario setuid no debe empezar a ejecutarse en silencio como otro usuario. Si cambias con chown un archivo que de verdad necesita esos bits, vuelve a activarlos después y compruébalo con `ls -l`:

```bash
sudo chown root:root /usr/local/bin/helper
sudo chmod 4755 /usr/local/bin/helper
```

La documentación de GNU coreutils advierte que el comportamiento exacto depende de la llamada al sistema, así que en otros sistemas compruébalo antes de confiar en él.

## chmod vs chown

Los dos comandos se confunden a menudo porque resuelven el mismo síntoma, `Permission denied`, desde lados distintos:

| | chmod | chown |
|---|---|---|
| Cambia | los bits de modo (`rwx` para propietario, grupo y otros) | el propietario y el grupo |
| Responde a | ¿qué puede hacer cada clase? | ¿quién está en cada clase? |
| Quién puede usarlo | el propietario del archivo o root | root para el propietario; el propietario para grupos a los que pertenece |
| Caso típico | un script no es ejecutable | un usuario de servicio no puede leer sus propios archivos |

Una regla útil: si el modo parece correcto para la tarea (`600` para una clave, `644` para una configuración) pero el proceso sigue fallando, mira el propietario. Abrir el modo a `777` «arregla» el error dejando entrar a todo el mundo, lo cual es un problema de seguridad, no una solución. La [guía del comando chmod](/es/blog/chmod-command-linux/) cubre el otro lado, y modos como [`600`](/chmod-calculator/600/), [`644`](/chmod-calculator/644/) y [`755`](/chmod-calculator/755/) tienen cada uno una página que explica quién puede hacer qué.

## Arreglar permisos de volúmenes Docker

El problema de chown más común en el trabajo DevOps es un contenedor que no puede escribir en un bind mount:

```text
mkdir: cannot create directory '/app/data/cache': Permission denied
```

La causa es que el kernel guarda la propiedad como números, no como nombres. Una imagen que se ejecuta como usuario sin privilegios (las imágenes oficiales de Node traen un usuario `node` con UID 1000; la imagen de Postgres basada en Debian se ejecuta como UID 999) escribe con ese UID, mientras que el directorio del host que montaste probablemente pertenece a tu usuario o a root. Los nombres dentro y fuera del contenedor no significan nada el uno para el otro; solo tienen que coincidir los números.

Averigua con qué UID se ejecuta el contenedor y entrega el directorio del host a ese UID:

```bash
docker run --rm my-image id          # uid=1000(node) gid=1000(node)
sudo chown -R 1000:1000 ./data
```

Usa aquí la forma numérica. `chown -R node:node ./data` en el host o falla o elige al usuario que casualmente se llame `node` en esa máquina. La alternativa es dejar los archivos como están y ejecutar el contenedor como tú: `docker run --user "$(id -u):$(id -g)" …`, o `user: "1000:1000"` en Compose. En los volúmenes con nombre, la imagen suele fijar la propiedad cuando el volumen se crea por primera vez, así que esto afecta sobre todo a los bind mounts.

## Siguientes pasos

La [sección de permisos de Linux for DevOps](/learn/guides/linux-for-devops/#file-permissions-ownership) trata usuarios, grupos y propiedad en contexto. Para decidir qué modo debe tener un archivo una vez que su propietario es el correcto, la [chmod Calculator](/es/chmod-calculator/) convierte entre las formas octal, simbólica y de `ls -l` en tu navegador.

## Referencia rápida de chown

- [ ] `user:group` fija ambos, `user:` usa el grupo de login del usuario, `:group` cambia solo el grupo.
- [ ] Cambiar el propietario requiere root; cambiar el grupo requiere ser propietario y miembro de ese grupo.
- [ ] Usa IDs numéricos con contenedores: la propiedad se guarda como UID y GID, nunca como nombres.
- [ ] `-h` cambia el propio enlace simbólico; sin `-R`, chown sigue el enlace por defecto.
- [ ] `-R` no sigue enlaces dentro del árbol; evita `-L` en árboles donde otros pueden escribir.
- [ ] `--reference=ARCHIVO` copia la propiedad; `--from=` limita un cambio al propietario actual.
- [ ] chown borra setuid y setgid en ejecutables; vuelve a activarlos después.
- [ ] Modo correcto y aun así denegado: revisa el propietario antes de recurrir a `chmod 777`.
