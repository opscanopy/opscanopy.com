---
title: "Comando chmod en Linux: sintaxis, ejemplos y errores comunes"
description: "El comando chmod en Linux explicado: modos octal y simbólico, chmod +x, chmod -R y sus trampas, setuid, setgid y sticky bit, umask y cómo resolver Permission denied."
pubDate: 2026-10-03
tags: ["linux", "security", "devops"]
lang: es
translationOf: "chmod-command-linux"
relatedTool:
  name: "chmod Calculator"
  href: "/chmod-calculator"
---

![Una cuadrícula de tres por tres con los bits de lectura, escritura y ejecución para propietario, grupo y otros](/blog/chmod-command-linux-hero.svg)
<!-- keywords: chmod command | chmod +x, chmod recursive, chmod -R, chmod command in linux, linux chmod | source: ahrefs free (2026-10-04) -->

Un script de despliegue falla con `Permission denied`. Un repositorio recién clonado no quiere ejecutar `./build.sh`. SSH rechaza una clave porque sus «permissions are too open». Un servidor web devuelve 403 para archivos que están claramente en el disco. Todos estos casos terminan en el mismo comando, y casi siempre la solución es una línea. El problema es que la línea equivocada, ejecutada con `-R`, puede hacer más daño que el error original.

Este artículo explica cómo lee `chmod` sus argumentos, las dos formas de escribir un modo, las trampas del modo recursivo, los tres bits especiales y una lista de comprobación para el momento en que aparece un error de permisos.

## La sintaxis

```bash
chmod [opciones] MODO ARCHIVO...
chmod [opciones] --reference=ARCHIVO_REF ARCHIVO...
```

`MODO` es un número (`755`) o una expresión simbólica (`u+x`). Cada archivo indicado recibe el cambio. Las opciones que de verdad vas a usar son pocas:

- `-R`, `--recursive`: aplicar a un directorio y a todo lo que contiene.
- `-v`, `--verbose`: imprimir una línea por cada archivo procesado.
- `-c`, `--changes`: imprimir una línea solo cuando un modo cambia de verdad. Útil en scripts, porque la salida es un diff.
- `--reference=ARCHIVO`: copiar el modo de otro archivo en lugar de escribirlo.

Solo el propietario del archivo (o root) puede cambiar su modo. Pertenecer al grupo del archivo, aunque tenga permiso de escritura, no basta.

## Cómo leer un modo

`ls -l` imprime diez caracteres al principio de cada línea:

```text
-rwxr-x---  1 deploy  web  4120 Oct  3 09:12 build.sh
```

El primer carácter es el tipo (`-` archivo, `d` directorio, `l` enlace simbólico). Los nueve siguientes son tres grupos de tres: **propietario** (`u`), **grupo** (`g`) y **otros** (`o`). Dentro de cada grupo las posiciones son siempre lectura, escritura y ejecución, en ese orden, con `-` para un bit desactivado. Así, `rwxr-x---` significa que el propietario puede hacerlo todo, los miembros de `web` pueden leer y ejecutar el script, y nadie más puede tocarlo.

En un directorio, las mismas letras significan algo ligeramente distinto. `r` permite listar los nombres que contiene, `w` permite crear, renombrar y borrar entradas, y `x` permite *entrar* en el directorio y llegar a lo que hay dentro por su nombre. Un directorio con `r` pero sin `x` es una lista de nombres que no puedes abrir.

## Modo octal: tres dígitos, uno por clase

Cada permiso tiene un valor: lectura vale 4, escritura 2 y ejecución 1. Súmalos por clase y obtienes un dígito para el propietario, otro para el grupo y otro para los demás:

| Dígito | Bits | Significado |
|---|---|---|
| 7 | `rwx` | leer, escribir, ejecutar |
| 6 | `rw-` | leer, escribir |
| 5 | `r-x` | leer, ejecutar |
| 4 | `r--` | solo leer |
| 0 | `---` | nada |

De ahí salen los modos que verás una y otra vez:

- [`755`](/chmod-calculator/755/) (`rwxr-xr-x`): scripts, binarios y la mayoría de directorios. El propietario escribe; los demás leen y ejecutan.
- [`644`](/chmod-calculator/644/) (`rw-r--r--`): archivos normales como configuraciones y HTML. Legibles por todos, escribibles por el propietario.
- [`600`](/chmod-calculator/600/) (`rw-------`): secretos. Claves privadas SSH, archivos `.env`, kubeconfigs.
- [`700`](/chmod-calculator/700/) (`rwx------`): directorios privados, con `~/.ssh` como caso clásico.
- [`775`](/chmod-calculator/775/) (`rwxrwxr-x`): un directorio en el que escribe todo un equipo, normalmente junto con un grupo compartido.

El modo octal **sustituye** todos los permisos de una vez. `chmod 644 archivo` no añade lectura para otros: deja el modo exactamente en `rw-r--r--`, fuera cual fuera antes. Es su virtud cuando quieres un estado conocido y su peligro cuando solo querías cambiar un bit. Y el modo que conviene evitar casi siempre, [`777`](/es/chmod-calculator/777/), da escritura a cualquiera.

## Modo simbólico: cambiar una cosa y dejar el resto

El modo simbólico se escribe como *quién*, *operador* y *qué*:

- quién: `u` (propietario), `g` (grupo), `o` (otros), `a` (los tres)
- operador: `+` (añadir), `-` (quitar), `=` (fijar exactamente)
- qué: `r`, `w`, `x`, más `X`, `s` y `t`, que se explican más abajo

Algunos ejemplos que conviene saberse de memoria:

```bash
chmod u+x deploy.sh        # el propietario ya puede ejecutarlo; nada más cambia
chmod a-w release.tar.gz   # nadie puede escribir, tampoco el propietario
chmod go-rwx id_ed25519    # quitar todo al grupo y a otros
chmod g=rx,o= app/         # el grupo queda exactamente en r-x, otros en nada
chmod u+x,g+x tools/*.sh   # varias cláusulas, separadas por comas, sin espacios
```

### Qué hace realmente chmod +x

`chmod +x archivo` no lleva *quién*, y eso tiene un significado preciso. GNU chmod trata un *quién* ausente como `a`, pero **no toca los bits que están activos en tu umask**. Con la umask habitual `022`, `chmod +x` añade ejecución para propietario, grupo y otros, y `644` pasa a `755`. Con una umask estricta `077`, el mismo comando solo añade `u+x`, y `644` pasa a `744`. Si quieres un resultado que no dependa de quién ejecute el script, escribe la clase: `chmod a+x` o `chmod u+x`.

## chmod -R y los dos errores clásicos

El modo recursivo aplica un mismo modo a archivos y directorios, y unos y otros necesitan bits distintos. De ese choque salen dos errores que aparecen en casi todos los equipos.

**Error uno: `chmod -R 755 proyecto/`.** Los directorios quedan bien, pero ahora todos los archivos son ejecutables, incluidos `README.md`, cada `.env` y cada configuración. Nada se rompe en el momento, por eso se queda así, y un `git status` posterior muestra todo el árbol como modificado si `core.fileMode` está activo.

**Error dos: `chmod -R 644 proyecto/`.** Los archivos quedan bien, pero todos los directorios han perdido la `x`. Ya no puedes entrar con `cd` y no se puede abrir nada de lo que contienen, aunque cada archivo tenga `644`. El servidor web responde 403 y la causa no está donde miras primero.

La solución es tratar cada tipo por separado con `find`:

```bash
find proyecto/ -type d -exec chmod 755 {} +
find proyecto/ -type f -exec chmod 644 {} +
```

O usar la `X` mayúscula, que añade ejecución solo a los directorios y a los archivos que ya son ejecutables para alguien:

```bash
chmod -R u=rwX,go=rX proyecto/
```

Esa única línea da `755` a los directorios, `755` a los scripts existentes y `644` a los archivos normales. Es lo más parecido a un chmod recursivo seguro.

Dos advertencias más. Por defecto, GNU chmod no cambia el modo del propio enlace simbólico (Linux ignora de todos modos los permisos de los enlaces): si nombras un enlace en la línea de comandos se cambia su *destino*, y con `-R` los enlaces que encuentra durante el recorrido se omiten. Y un `-R` sobre la ruta equivocada no se deshace sin copia de seguridad. `--preserve-root` solo rechaza una ejecución recursiva sobre `/` en sí, así que imprime la ruta antes de ejecutar el comando.

## Los bits especiales: setuid, setgid y sticky

Un cuarto dígito octal, delante de los otros, guarda tres bits más. En `ls -l` sustituyen a la `x` de uno de los tres grupos:

| Bit | Valor | Se ve como | En un archivo | En un directorio |
|---|---|---|---|---|
| setuid | 4 | `s` en la `x` del propietario | se ejecuta como el propietario del archivo | se ignora en Linux |
| setgid | 2 | `s` en la `x` del grupo | se ejecuta como el grupo del archivo | los archivos nuevos heredan el grupo del directorio |
| sticky | 1 | `t` en la `x` de otros | se ignora en Linux | solo el propietario de una entrada (o el del directorio) puede borrarla o renombrarla |

Los dos que encontrarás en la práctica:

- [`4755`](/chmod-calculator/4755/) (`rwsr-xr-x`): setuid. `/usr/bin/passwd` suele instalarse así para que un usuario normal pueda actualizar un archivo de root. Un binario setuid es una frontera de privilegios; nunca lo pongas en un script ni en algo que no hayas escrito tú.
- [`1777`](/chmod-calculator/1777/) (`rwxrwxrwt`): el sticky bit en un directorio escribible por todos. Es `/tmp`: cualquiera puede crear archivos, pero nadie puede borrar los de otro.

Setgid en un directorio compartido (`chmod 2775 shared/` o `chmod g+s shared/`) es la forma limpia de que cada archivo nuevo pertenezca al grupo del equipo. Una `S` o `T` mayúscula en `ls -l` indica que el bit especial está activo pero el bit de ejecución de debajo no, y casi siempre es un descuido.

Un detalle de GNU sorprende a mucha gente: `chmod 755 directorio` *conserva* un bit setuid o setgid que ya tenga el directorio. Para quitarlo hay que pedirlo expresamente, con `chmod g-s directorio` o con un modo de cinco dígitos como `chmod 00755 directorio`.

## umask: de dónde sale el modo inicial

Los archivos nuevos no se crean con `777` para recortarlos después. Los programas piden `666` para archivos y `777` para directorios, y el kernel quita los bits activos en la **umask** del proceso. Con `umask 022`, los archivos empiezan en `644` y los directorios en `755`. Con `umask 077`, en `600` y `700`.

Así que, cuando todos los archivos que escribe un servicio salen ilegibles para el resto del equipo, la solución suele estar en la umask del servicio (`UMask=` en una unidad de systemd, o `umask 002` en su script de arranque), no en un `chmod` posterior.

## Una nota sobre las ACL

Si `ls -l` imprime un `+` después del modo (`-rw-rw-r--+`), el archivo tiene una lista de control de acceso y los nueve bits no lo cuentan todo. `getfacl archivo` muestra las entradas extra. En un archivo así, los bits de grupo que cambia `chmod` son la *máscara* de la ACL, que limita cada entrada de usuario y grupo con nombre, de modo que `chmod g-w` puede quitar en silencio la escritura a personas que ni siquiera están en el grupo del archivo.

## Resolver «Permission denied»

Cuando un comando falla, revisa la ruta entera y no solo el archivo:

1. **Comprueba cada directorio del camino.** Necesitas `x` en cada directorio padre para llegar a un archivo. `namei -l /srv/app/config/app.yml` muestra el modo y el propietario de cada componente y encuentra el bit que falta en segundos.
2. **Comprueba quién eres.** `id` muestra tu usuario y tus grupos. Los cambios de grupo solo se aplican a sesiones nuevas, así que un usuario añadido a `docker` hace cinco minutos todavía no lo tiene en la shell antigua.
3. **Comprueba el propietario, no solo el modo.** `rw-------` es correcto para una clave e inútil si la clave pertenece a root y el proceso corre como `deploy`. Eso es trabajo de [chown](/es/blog/chown-command-linux/), no de chmod.
4. **Comprueba el montaje.** Un archivo puede tener `755` y no ejecutarse en un sistema de archivos montado con `noexec`. `findmnt -T ruta` muestra las opciones de montaje.
5. **Comprueba la capa de seguridad.** En sistemas con SELinux, un modo correcto con el contexto equivocado sigue fallando; `ls -Z` y el log de auditoría lo muestran.
6. **Ten en cuenta lo que esperan los programas estrictos.** OpenSSH rechaza una clave privada a la que el grupo u otros pueden acceder, y su comprobación `StrictModes` rechaza un directorio home o un `~/.ssh` escribible por el grupo o por todos. Pon `~/.ssh` en `700` y las claves en `600`.

## Calcula un modo sin hacer cuentas

La [chmod Calculator](/es/chmod-calculator/) convierte entre octal, simbólico y la cadena de `ls -l` en ambos sentidos, bits especiales incluidos, y muestra el comando exacto. Funciona en tu navegador. Para el panorama completo de usuarios, grupos y propiedad, la [sección de permisos de Linux for DevOps](/learn/guides/linux-for-devops/#file-permissions-ownership) pone chmod en contexto.

## Referencia rápida de chmod

- [ ] El octal sustituye todos los bits; el simbólico cambia solo lo que nombras.
- [ ] `r` = 4, `w` = 2, `x` = 1, un dígito para propietario, grupo y otros.
- [ ] `755` scripts y directorios, `644` archivos, `600` secretos, `700` directorios privados.
- [ ] `chmod +x` respeta la umask; `chmod a+x` y `chmod u+x` no dependen de ella.
- [ ] Nunca `chmod -R 755` ni `chmod -R 644` sobre un árbol mixto; usa `find -type d` / `-type f`, o `chmod -R u=rwX,go=rX`.
- [ ] Un directorio necesita `x` para poder entrar, en cada nivel de la ruta.
- [ ] `4755` setuid, `2775` setgid para directorios de grupo compartidos, `1777` sticky para directorios tipo `/tmp`.
- [ ] Un `+` después del modo indica una ACL; mira `getfacl` antes de fiarte de los nueve bits.
- [ ] Un propietario equivocado es un problema de chown; cambiar el modo no lo arregla.
