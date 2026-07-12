---
title: "Aprende DevOps en 90 días: la ruta gratuita y centrada en incidentes de desarrollador a ingeniero DevOps"
description: "Por qué creamos Mission: 90 Days DevOps — una ruta gratuita día a día de Linux a Kubernetes con misiones de incidentes jugables. El plan completo, las decisiones de diseño y los compromisos honestos."
pubDate: 2026-07-12
tags: ["devops", "career", "learning"]
lang: es
translationOf: "learn-devops-in-90-days"
relatedTool:
  name: "Mission: 90 Days DevOps"
  href: "/mission-90/"
---

![Aprende DevOps en 90 días: una ruta gratuita y centrada en incidentes de desarrollador a ingeniero DevOps](/blog/learn-devops-in-90-days-hero.svg)

Hay un momento que todo nuevo ingeniero de operaciones recuerda: la primera vez que algo real se rompe. El tutorial terminó hace semanas, el camino feliz no aparece por ningún lado y un pod está atascado en `CrashLoopBackOff` — o un cron job dejó de ejecutarse en silencio, o el sitio entero responde 502. Los tutoriales enseñan comandos. Los incidentes forman ingenieros.

Ese vacío es la razón por la que creamos [Mission: 90 Days DevOps](/mission-90/) — un programa gratuito y guiado que te lleva de tu primer comando en la terminal a estar listo para trabajar en 90 días, con una lección enfocada al día y una misión de incidente con narrativa que resolver al final de cada semana. Los 90 días y las 10 misiones ya están disponibles. Sin registro, sin muro de correo, sin paywall; tu progreso se guarda en tu propio navegador. Este artículo explica qué contiene, el orden y el porqué, y las decisiones de diseño que hay detrás — incluidas las que tienen compromisos reales.

## La regla de ordenación: cada capa debe permitirte depurar la capa de arriba

La mayoría de las hojas de ruta de DevOps fallan de una de dos maneras. O te entregan un árbol de habilidades de 200 nodos sin secuencia alguna, o empiezan por lo llamativo — Kubernetes antes que Linux, que es como la gente acaba copiando y pegando comandos de `kubectl` que no sabe depurar.

El orden del programa nace de una sola regla: **cada capa debe permitirte depurar la capa de arriba.**

- Los problemas de Kubernetes suelen ser problemas de contenedores.
- Los problemas de contenedores suelen ser problemas de Linux.
- Los problemas de redes en la nube suelen ser problemas de DNS y puertos que puedes aprender en localhost.

Así que los 90 días van así: Linux primero, contenedores segundo, nube tercero, orquestación cuarto y preparación para el empleo al final — de 45 a 60 minutos al día, unas 80 horas de trabajo troncal en total. Es un compromiso real, no una promesa de "10 minutos al día", pero cabe junto a un trabajo a tiempo completo, y 90 días es un plazo lo bastante corto como para ver la meta desde el Día 1.

![La ruta de 90 días: cinco fases desde los fundamentos de Linux hasta estar listo para trabajar, con una misión de incidente cerrando cada semana](/blog/learn-devops-in-90-days-diagram.svg)

## Las cinco fases

**Fase 1 — Linux y la terminal (Días 1–21).** Tres semanas de archivos, permisos, procesos, systemd, logs, DNS y puertos, bash, cron y SSH. Se hace largo cuando Kubernetes te está llamando, pero casi todos los incidentes terminan con alguien conectado por SSH a una máquina leyendo logs — aquí es donde eso deja de dar miedo. Todo corre en local sobre WSL2 o cualquier máquina Linux. Coste: cero.

**Fase 2 — Docker y CI/CD (Días 22–45).** Empaquetar software y publicarlo automáticamente, emparejados a propósito: imágenes, Dockerfiles, volúmenes, redes y compose por un lado; flujos de trabajo reales de Git y pipelines de GitHub Actions por el otro. La fase termina con el **Proyecto 1**: contenerizar `linkstash`, un acortador de URLs en FastAPI, base de datos incluida. Todavía completamente local, todavía coste cero.

**Fase 3 — AWS (Días 46–65).** IAM y VPC primero — porque la mayor parte de la confusión con AWS es "por qué esta cosa no puede hablar con aquella otra", y la respuesta casi siempre es un security group o una ruta de subred — y después S3, RDS, balanceadores de carga y monitorización. El **Proyecto 2** despliega el mismo contenedor de `linkstash` como es debido: ECS Fargate detrás de un ALB con RDS Postgres en dos zonas de disponibilidad.

**Fase 4 — Kubernetes y Terraform (Días 66–85).** Pods, Services, configuración, probes, ingress y Helm — practicados primero en clústeres locales de `kind`, donde equivocarse es gratis — y luego Terraform, para que la infraestructura se convierta en código revisable en lugar de clics en la consola. El **Proyecto 3** es el proyecto final: `linkstash` otra vez, ahora sobre k3s en una única instancia EC2, aprovisionada por completo con Terraform, empaquetada como un chart de Helm y servida con TLS real por Traefik y cert-manager.

**Fase 5 — Listo para el empleo (Días 86–90).** La parte que toda hoja de ruta se salta: convertir el trabajo en una contratación. Un currículum reconstruido en torno a los tres proyectos, pulido del portafolio y de GitHub, fundamentos de gestión de incidentes — niveles de severidad, postmortems sin culpables, presupuestos de error — y un entrenamiento de entrevistas. Cada día del programa termina con entre tres y cinco preguntas de entrevista, así que para el Día 86 ya habrás respondido más de 300.

## Una sola aplicación, llevada por toda la pila

La decisión de diseño que defenderíamos con más fuerza: el programa construye **una aplicación de tres maneras**, no tres proyectos desechables.

`linkstash` se conteneriza en la Fase 2, se despliega en AWS en la Fase 3 y se orquesta en Kubernetes en la Fase 4. En una entrevista, eso convierte "hice unos tutoriales" en "aquí hay un sistema que he ejecutado de tres maneras, y aquí está el porqué de cada capa". La comparación — archivo de compose frente a task definition frente a chart de Helm, `depends_on` frente a target groups frente a readiness probes — es exactamente la historia que piden los entrevistadores.

## Los incidentes son el plan de estudios, no un extra

Leer sobre `journalctl` y usarlo a las 00:14 durante una caída son habilidades distintas, y solo una de ellas es un trabajo. Por eso los cierres de semana no son cuestionarios — son **misiones**: simulaciones de incidentes con narrativa que corren en una terminal dentro de tu navegador. Sin configuración, sin cuenta de nube, sin necesidad de escribir código.

Empiezas la primera semana con *Server Down!* — un servidor web de producción está caído a las 2 de la madrugada y tienes que encontrar el proceso desbocado, matarlo y levantar nginx de nuevo. En la última semana te enfrentas a *The Midnight Outage*: un SEV-1 en el que un único cambio en un security group se encadena en health checks fallidos del balanceador de carga, un failover de DNS y pods en la región de respaldo que no pueden arrancar porque alguien borró el Secret que montan. La solución tiene que aplicarse **upstream-first** — reabrir la ruta de red, restaurar el Secret y después confirmar que el DNS se recuperó — en ese orden, porque reiniciar los pods nunca fue el problema.

Entre medias: un misterio de DNS, un bloqueo por permisos, una pila de contenedores en bucle de fallos, un pipeline de CI roto, una factura sorpresa de AWS, una tabla de producción borrada, un clúster de Kubernetes en caos y un lock de estado de Terraform obsoleto. Diez misiones, cada una ensayando exactamente el bucle de diagnóstico que su semana enseñó.

## Diseñado para costar (casi) nada

Una ruta de aprendizaje que va acumulando en silencio una factura en la nube es una ruta de aprendizaje rota. Por eso las reglas de presupuesto son estructurales:

- Las Fases 1 y 2 y los fundamentos de Kubernetes corren **completamente en local** — WSL2, Docker, `kind` y providers locales de Terraform. Gasto en la nube: cero.
- Cada día de AWS empieza con una **caja de costes** que indica exactamente cuánto cuesta el laboratorio y bajo qué condiciones es gratis, y termina con un **desmontaje obligatorio**.
- El proyecto final de Kubernetes usa k3s en una t3.small (unos $19 al mes si la olvidas encendida, en la práctica gratis dentro del free tier con desmontaje el mismo día) en lugar de EKS, cuyo plano de control cuesta por sí solo unos $73 al mes. La misma API de Kubernetes, los mismos manifiestos, el mismo Helm — simplemente no le pagas a AWS por alojarte el API server. El compromiso, dicho con honestidad: no tocarás el pegamento específico de EKS como IRSA o los managed node groups, algo que está perfectamente bien aprender ya en el trabajo.

## Cómo es un día

Cada uno de los 90 días tiene la misma forma, así que siempre sabes qué significa "terminado":

1. **Un concepto breve** — menos de 600 palabras, un diagrama, una analogía del mundo real. Se lee en cinco minutos.
2. **Un laboratorio práctico** — comandos reales con salida real, reproducible en tu máquina.
3. **Errores comunes y sus soluciones** — las cadenas de error reales con las que te toparás, por qué ocurren y cómo las detectarías en producción.
4. **Preguntas y respuestas de entrevista** — de tres a cinco preguntas con respuestas que vale la pena decir en voz alta.

Existen extras opcionales de "Profundiza" para los días en que tienes más tiempo, y la siguiente lección nunca los da por supuestos.

## Los compromisos honestos

- **90 días te hacen contratable como junior, no senior.** Contribuirás y depurarás desde la primera semana en el trabajo; la profundidad llega con horas de guardia.
- **Es un programa con opiniones.** GitHub Actions en lugar de Jenkins, AWS en lugar de Azure, k3s en lugar de EKS. Cada hueco recibió la opción por defecto de mayor apalancamiento; tu trabajo objetivo puede ser distinto.
- **Ir a tu ritmo exige autodisciplina.** El seguimiento del progreso ayuda; no sustituye presentarse cada día.
- **La fase de AWS necesita una tarjeta registrada.** La disciplina de desmontaje mantiene el gasto cerca de cero, pero el riesgo nunca es exactamente cero.

## Empieza hoy

Todo está disponible: [los 90 días](/mission-90/), las [diez misiones](/mission-90/missions/) y los tres proyectos. Empieza con el Día 1 — o, si quieres sentir el sentido de todo el programa en diez minutos, juega primero a *Server Down!*. No necesita nada más que una pestaña del navegador, y termina como termina todo buen incidente: con el sitio de nuevo en pie, y tú sabiendo exactamente por qué.
