---
title: "Cómo leer la notación CIDR, con ejemplos reales"
description: "Cómo leer la notación CIDR: qué significa el número tras la barra, una tabla de prefijo a máscara de /8 a /32 y ejemplos reales de VPC, firewalls y Kubernetes."
pubDate: 2026-09-14
tags: ["networking", "devops"]
lang: es
translationOf: "how-to-read-cidr-notation"
relatedTool:
  name: "CIDR / Subnet Checker"
  href: "/cidr-checker"
---

![Una dirección IPv4 dividida en la barra en un prefijo de red fijo y un rango de hosts variable](/blog/how-to-read-cidr-notation-hero.svg)
<!-- keywords: how to read cidr notation | cidr notation explained, what does /24 mean, cidr to netmask, cidr examples | source: marketing brief, ahrefs unchecked (2026-10-04) -->

Una regla de un security group dice `10.0.32.0/20`. Un módulo de Terraform pide un `pod_cidr`. La allowlist de un firewall tiene una entrada que termina en `/32`, y un compañero pregunta si `10.0.37.200` está «dentro del rango de la VPC». Las cuatro preguntas se reducen a una sola habilidad: leer el número que va después de la barra.

CIDR (Classless Inter-Domain Routing, especificado hoy en el RFC 4632) sustituyó en 1993 al antiguo esquema de clases A/B/C. Su notación empaqueta una dirección y una máscara en una sola cadena, y en cuanto sepas leerla podrás responder de cabeza a la mayoría de preguntas de subnetting.

## Qué significa el número tras la barra

Una dirección IPv4 tiene 32 bits, escritos como cuatro octetos de 8 bits. En `10.0.32.0/20`, `/20` es la **longitud del prefijo**: los primeros 20 bits son la parte de red y son fijos para todas las direcciones del bloque. Los 32 − 20 = 12 bits restantes son la parte de host y pueden tomar cualquier valor.

Eso te da directamente el tamaño del bloque:

- **Direcciones del bloque** = 2^(32 − prefijo). Para `/20` son 2^12 = 4.096.
- **Hosts utilizables** en una LAN clásica = 2^(32 − prefijo) − 2, porque la dirección de host con todo ceros nombra la red y la de todo unos es el broadcast. Para `/20` son 4.094.

Un número mayor tras la barra significa un bloque *más pequeño*. Cada paso hacia arriba lo divide por la mitad: un `/24` tiene 256 direcciones, un `/25` tiene 128 y un `/26` tiene 64.

### La máscara de red es lo mismo escrito en largo

Una máscara de red escribe esos 20 bits fijos como unos y los 12 libres como ceros, y lo muestra en decimal con puntos:

```text
/20  =  11111111.11111111.11110000.00000000
     =  255     .255     .240     .0
```

Así que `10.0.32.0/20` y `10.0.32.0 255.255.240.0` describen la misma red.

## De CIDR a máscara de red: la tabla que vale la pena memorizar

No necesitas los 33 prefijos. Estos son los que aparecen en configuraciones reales:

| Prefijo | Máscara de red | Direcciones | Hosts utilizables |
|---|---|---|---|
| /8 | 255.0.0.0 | 16.777.216 | 16.777.214 |
| /12 | 255.240.0.0 | 1.048.576 | 1.048.574 |
| /16 | 255.255.0.0 | 65.536 | 65.534 |
| /20 | 255.255.240.0 | 4.096 | 4.094 |
| /22 | 255.255.252.0 | 1.024 | 1.022 |
| /24 | 255.255.255.0 | 256 | 254 |
| /26 | 255.255.255.192 | 64 | 62 |
| /27 | 255.255.255.224 | 32 | 30 |
| /28 | 255.255.255.240 | 16 | 14 |
| /29 | 255.255.255.248 | 8 | 6 |
| /30 | 255.255.255.252 | 4 | 2 |
| /31 | 255.255.255.254 | 2 | 2 |
| /32 | 255.255.255.255 | 1 | 1 |

Dos filas rompen a propósito la regla de «menos dos».

### /31: enlaces punto a punto (RFC 3021)

Un `/30` en un enlace entre dos routers desperdicia la mitad de sus direcciones en la de red y la de broadcast. El RFC 3021 permite que un `/31` lleve exactamente dos hosts sin dirección de red ni de broadcast, porque en un enlace punto a punto no hay nadie más a quien hacer broadcast.

### /32: una sola dirección

Un `/32` fija los 32 bits, así que el bloque es un único host. Es la forma de nombrar una máquina concreta en una tabla de rutas o en una allowlist, y puedes ver el desglose completo en la [página /32 del Subnet Calculator](/subnet-calculator/32/).

> **Consejo:** la dirección antes de la barra debería ser la primera del bloque. `10.0.1.0/16` es ambigua (¿querías decir `10.0.0.0/16` o `10.0.1.0/24`?), y los parsers estrictos la rechazan en lugar de adivinar.

```bash
python3 -c "import ipaddress; print(ipaddress.ip_network('10.0.1.0/16'))"
# ValueError: 10.0.1.0/16 has host bits set

python3 -c "import ipaddress; n = ipaddress.ip_network('10.0.32.0/20'); print(n.netmask, n.num_addresses, n[-1])"
# 255.255.240.0 4096 10.0.47.255
```

## Ejemplos de CIDR en infraestructura real

### Una VPC dividida en subredes /24

Un diseño cloud habitual es una VPC `10.0.0.0/16` dividida en subredes `/24`: `10.0.1.0/24` para los balanceadores públicos, `10.0.10.0/24` para los nodos de aplicación, y así sucesivamente. Un `/16` admite 2^(24 − 16) = 256 subredes de ese tamaño, así que rara vez te quedas sin espacio. Las páginas de [/16](/subnet-calculator/16/) y [/24](/subnet-calculator/24/) muestran ambos bloques completos.

El número utilizable es menor de lo que indica la tabla. AWS reserva cinco direcciones en cada subred (la dirección de red, el router de la VPC en `.1`, el resolvedor DNS en `.2`, una reservada para uso futuro en `.3` y la última dirección), de modo que una subred `/24` te da 251 direcciones asignables, no 254.

### /28: el bloque más pequeño que crea AWS

AWS acepta bloques CIDR de VPC y de subred desde `/16` hasta `/28`. Tras las cinco direcciones reservadas, un [/28](/subnet-calculator/28/) deja 11 utilizables, suficiente para la subred de un NAT gateway o un puñado de interface endpoints, y poco más. Azure y Google Cloud fijan sus propios mínimos y reservas, así que lee la documentación del proveedor antes de dimensionar una subred tan justa.

### 0.0.0.0/0: todo

El prefijo cero no fija ningún bit, así que `0.0.0.0/0` coincide con cualquier dirección IPv4. En una tabla de rutas es la ruta por defecto («envía aquí todo lo que no tenga una coincidencia más específica»). En una regla de entrada de un security group significa todo internet, que es justo lo que quieres en el puerto 443 de un balanceador público y justo lo que no quieres en el puerto 22. El equivalente en IPv6 es `::/0`.

### Entradas /32 en una allowlist

Cuando un proveedor dice «permitan nuestras IP de salida», cada entrada suele llegar como `/32`, por ejemplo `203.0.113.10/32`. Si escribes `203.0.113.10/24` en su lugar, permites en silencio 256 direcciones, la mayoría de las cuales pertenecen a otra persona.

### CIDR de pods y de servicios en Kubernetes

Un clúster autogestionado creado con `kubeadm` recibe un rango de pods como `--pod-network-cidr=10.244.0.0/16` (el rango que espera el manifiesto por defecto de Flannel). El controller manager asigna luego a cada nodo su propio trozo, un `/24` por defecto, así que un rango de pods `/16` admite hasta 256 nodos. Los servicios reciben un rango aparte: kubeadm usa `10.96.0.0/12` por defecto.

Ninguno de esos rangos puede solaparse con otro, con la red de los nodos ni con nada a lo que enrutes por VPN o peering. Un solapamiento rara vez falla de forma ruidosa durante la instalación. Aparece más tarde, cuando el tráfico hacia una base de datos en una VPC emparejada sale por la red de pods. Los clústeres gestionados funcionan distinto (el VPC CNI por defecto de EKS da a los pods direcciones reales de la VPC, por ejemplo), pero la regla de no solapar es la misma.

## ¿Está esta IP dentro de ese bloque CIDR? Hacerlo a mano

La pregunta «¿está `10.0.37.200` en `10.0.32.0/20`?» es un AND bit a bit: aplica la máscara a la dirección y comprueba si obtienes de nuevo la dirección de red.

Solo importa el octeto en el que la máscara deja de ser 255. Para un `/20` es el tercer octeto, con máscara 240:

```text
37   = 00100101
240  = 11110000
AND  = 00100000 = 32   -> matches 10.0.32.0, so 10.0.37.200 is inside
```

Prueba con `10.0.48.1`: `48 AND 240 = 48`, que no es 32, así que queda fuera.

Hay un atajo más rápido. 256 − 240 = 16, así que los bloques `/20` empiezan en múltiplos de 16 en el tercer octeto: `.0`, `.16`, `.32`, `.48`, etcétera. Por tanto, `10.0.32.0/20` va de `10.0.32.0` a `10.0.47.255`. Todo lo que tenga un tercer octeto entre 32 y 47 está dentro.

## ¿Y en IPv6?

La notación es idéntica. Solo cambia la anchura: una dirección IPv6 tiene 128 bits, así que un `/64` deja 64 bits de host y un `/48` contiene 2^16 = 65.536 subredes `/64`. Las convenciones son menos flexibles que en IPv4: `/64` es el tamaño estándar de una LAN, porque la autoconfiguración sin estado espera un identificador de interfaz de 64 bits, y `/127` es el equivalente punto a punto de un `/31` (RFC 6164). Las cuentas para dividir un `/48` se desarrollan en [IPv6 subnet calculator: what ipcalc can't do](/blog/ipv6-subnet-calculator-ipcalc-sipcalc/).

## Comprueba una lista de bloques CIDR sin hacer cuentas

La aritmética a mano sobre una allowlist de 40 líneas es la forma en que se cuelan los errores. El [CIDR / Subnet Checker](/cidr-checker/) recibe una lista de rangos y una dirección, y te dice qué rangos la contienen, cuáles se solapan y cuál es el conjunto equivalente más pequeño cuando se pueden fusionar bloques adyacentes. Para un solo bloque, el [Subnet Calculator](/subnet-calculator/) muestra la red, el broadcast, el rango de hosts y la máscara. Ambos funcionan en tu navegador, así que pegar rangos internos no los envía a ninguna parte.

## Referencia rápida de CIDR

- [ ] El número tras la barra cuenta los bits **fijos**. Número mayor, bloque más pequeño.
- [ ] Direcciones = 2^(32 − prefijo); hosts utilizables = eso menos 2, salvo `/31` (2, RFC 3021) y `/32` (1).
- [ ] Las subredes cloud reservan más: AWS toma 5 por subred, así que un `/24` da 251 y un `/28` da 11.
- [ ] La dirección antes de la barra debe ser la primera del bloque; los parsers estrictos rechazan bits de host.
- [ ] `0.0.0.0/0` coincide con todo. Nunca lo pongas en un puerto de administración.
- [ ] Los hosts sueltos de una allowlist son `/32`. Un `/24` por descuido deja pasar 255 direcciones de más.
- [ ] Los rangos de pods, servicios, nodos y redes emparejadas no deben solaparse.
- [ ] Para comprobar pertenencia, haz AND de la dirección con la máscara o usa el atajo del tamaño de bloque 256 − máscara.
- [ ] IPv6 usa la misma notación sobre 128 bits; `/64` por LAN, `/127` para punto a punto.
