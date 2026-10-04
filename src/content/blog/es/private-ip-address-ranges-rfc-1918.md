---
title: "La guía completa de los rangos de direcciones IP privadas (RFC 1918)"
description: "Los tres rangos de IP privadas del RFC 1918, la trampa de 172.16.0.0/12, las direcciones que solo parecen privadas y cómo elegir un rango que no choque."
pubDate: 2026-09-17
tags: ["networking", "security"]
lang: es
translationOf: "private-ip-address-ranges-rfc-1918"
relatedTool:
  name: "Subnet Calculator"
  href: "/subnet-calculator"
---

![Tres bloques de direcciones anidados que representan los rangos privados del RFC 1918: 10.0.0.0/8, 172.16.0.0/12 y 192.168.0.0/16](/blog/private-ip-address-ranges-rfc-1918-hero.svg)
<!-- keywords: private ip address ranges | rfc 1918, private ip ranges, is 172.32 private, 172.16.0.0/12 range, 100.64.0.0/10 | source: marketing brief, ahrefs unchecked (2026-10-04) -->

Una regla de un security group dice «permitir desde redes privadas», y alguien ha escrito `172.0.0.0/8`. Parece razonable. También abre el puerto a unos 15 millones de direcciones públicas, porque solo una dieciseisava parte de ese bloque es privada. El espacio de direcciones privadas es pequeño, está definido con precisión y es fácil recordarlo mal, y los errores se manifiestan como agujeros en el firewall, rutas de VPN que no llevan a ninguna parte sin avisar y solicitudes de VPC peering que la nube rechaza.

Este artículo es la referencia: los tres rangos, el límite que confunde a la gente, los bloques que parecen privados y no lo son, y cómo elegir un rango del que no te arrepientas.

## Los tres rangos de direcciones IP privadas

El RFC 1918, publicado en 1996 como BCP 5, reserva tres bloques IPv4 para uso dentro de redes privadas. No se asignan a nadie, nadie los enruta en internet y cualquiera puede reutilizarlos detrás de su propio perímetro.

| Bloque | Rango | Direcciones | Uso típico |
|---|---|---|---|
| `10.0.0.0/8` | 10.0.0.0 – 10.255.255.255 | 16.777.216 | Grandes empresas, VPC en la nube, redes de pods de Kubernetes |
| `172.16.0.0/12` | 172.16.0.0 – 172.31.255.255 | 1.048.576 | Valores por defecto de Docker, la VPC por defecto de AWS (`172.31.0.0/16`) |
| `192.168.0.0/16` | 192.168.0.0 – 192.168.255.255 | 65.536 | Routers domésticos, oficinas pequeñas, redes de laboratorio |

Cada uno tiene una página desarrollada si quieres ver la red, la máscara y el número de hosts: [10.0.0.0/8](/subnet-calculator/10-0-0-0-8/), [172.16.0.0/12](/subnet-calculator/172-16-0-0-12/) y [192.168.0.0/16](/subnet-calculator/192-168-0-0-16/). El bloque que la mayoría ha escrito alguna vez es el `/24` del router de casa, [192.168.1.0/24](/subnet-calculator/192-168-1-0-24/).

Fíjate en lo que el RFC 1918 no dice. No dice que estas direcciones sean seguras, estén ocultas o sean inalcanzables. Dice que no son únicas a nivel global, y que por eso los routers de internet no deben transportarlas. Es una afirmación sobre enrutamiento, no sobre control de acceso.

## Por qué 172.16.0.0/12 confunde a tanta gente

El primer y el último bloque caen en límites de octeto: todo lo que empieza por `10.` es privado, y todo lo que empieza por `192.168.` también. El del medio no. Un `/12` fija los primeros 12 bits, es decir, el primer octeto entero más los cuatro bits altos del segundo. En el segundo octeto esos cuatro bits son `0001`, así que el octeto solo puede ir de `0001 0000` (16) a `0001 1111` (31).

```text
172.16.0.0/12
first octet   172  = 1010 1100   (fixed)
second octet   16  = 0001 0000   (top 4 bits fixed: 0001)
               31  = 0001 1111   (last value that keeps 0001)
               32  = 0010 0000   (top bits change: outside the block)

private:  172.16.0.0 – 172.31.255.255
public:   172.0.0.0 – 172.15.255.255 and 172.32.0.0 – 172.255.255.255
```

Así que `172.32.0.1` es una dirección pública, y también lo es `172.15.0.1`. Una regla escrita como `172.0.0.0/8` o una regex que busca `^172\.` cubre dieciséis veces el espacio que pretendías.

La otra razón por la que este bloque importa: Docker lo usa por defecto. La red `bridge` por defecto es `172.17.0.0/16`, y las redes definidas por el usuario se asignan del resto del espacio 172.16/12 y después de 192.168/16 (los pools se configuran en `daemon.json`). Puedes ver lo que tienes con:

```bash
docker network inspect bridge --format '{{(index .IPAM.Config 0).Subnet}}'
docker network ls -q | xargs docker network inspect \
  --format '{{.Name}} {{range .IPAM.Config}}{{.Subnet}}{{end}}'
```

Si la VPN de tu oficina o una VPC emparejada también vive en `172.17.0.0/16` o `172.18.0.0/16`, el host tiene ahora dos rutas hacia el mismo prefijo, y el tráfico para la red remota acaba en un bridge local de Docker. Se ve como «la VPN conecta pero nada responde».

> **Consejo:** si los hosts de Docker y las redes corporativas chocan una y otra vez, define `default-address-pools` en `/etc/docker/daemon.json` con un rango que nadie más use, en lugar de renumerar la red alrededor de Docker.

## Direcciones que parecen privadas pero no son RFC 1918

Varios otros bloques reservados se comportan como «no públicos» en la práctica, y se meten en el mismo saco que el RFC 1918 en reglas de firewall y allowlists. Tienen reglas distintas, y tratarlos como intercambiables causa bugs reales.

| Bloque | Definido en | Qué es |
|---|---|---|
| `100.64.0.0/10` | RFC 6598 | Espacio de direcciones compartido para NAT de operador (CGNAT). Tailscale también lo usa para las direcciones de sus nodos. No es RFC 1918: no lo uses en tus propias LAN si tu ISP puede usarlo aguas arriba. |
| `169.254.0.0/16` | RFC 3927 | Link-local IPv4, autoasignado cuando falla DHCP. Los servicios de metadatos de la nube viven en `169.254.169.254`, por eso los filtros contra SSRF también deben bloquear este bloque. |
| `127.0.0.0/8` | RFC 1122 | Loopback. Todo el `/8`, no solo `127.0.0.1`. |
| `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24` | RFC 5737 | TEST-NET-1, -2 y -3, reservados para documentación. Correctos en ejemplos, incorrectos en configuraciones. |
| `198.18.0.0/15` | RFC 2544 | Reservado para benchmarking de redes. |
| `fc00::/7` | RFC 4193 | Direcciones IPv6 únicas locales (ULA). El equivalente IPv6 más cercano al RFC 1918; en la práctica se usa `fd00::/8` con un ID global aleatorio de 40 bits. |
| `fe80::/10` | RFC 4291 | Link-local IPv6, presente en toda interfaz IPv6. |

> **Cuidado:** una comprobación de «¿esta dirección es interna?» que solo prueba los tres bloques del RFC 1918 aceptará sin problema `127.0.0.1`, `169.254.169.254` y `[::1]`. Para protegerte de SSRF, compara contra el registro completo de direcciones de uso especial (RFC 6890 y los registros de IANA), y resuelve el nombre de host antes de comprobar, no después.

## NAT no es un firewall

El direccionamiento privado se extendió gracias al NAT, y el efecto secundario del NAT es que las conexiones entrantes no solicitadas normalmente no tienen adónde ir. Ese efecto secundario no es un control de seguridad. Un router con redirección de puertos, una petición UPnP de un dispositivo de la LAN, una dirección IPv6 en el mismo host sin NAT alguno o un atacante que ya está dentro de la red se lo saltan.

Las direcciones del RFC 1918 tampoco están ocultas para nadie que esté en la misma red, la misma VPN o una VPC emparejada. Dentro de esos límites son direcciones enrutables normales. Si un servicio solo debe aceptar tráfico de ciertos hosts, déjalo escrito como regla de firewall o de security group con rangos de origen explícitos. La dirección privada indica dónde vive el servicio, no quién puede alcanzarlo.

## Elegir un rango privado para una VPC, una VPN o un laboratorio

Como todo el mundo reutiliza el mismo espacio, el riesgo real es el solapamiento. Dos redes que usan el mismo prefijo no se pueden enrutar entre sí sin un NAT de por medio, y las grandes nubes rechazan directamente el VPC peering entre CIDR solapados. El solapamiento también rompe los clientes VPN: una red doméstica en `192.168.1.0/24` que se conecta a una oficina que también usa `192.168.1.0/24` no puede llegar al lado de la oficina de ese rango.

Algunas reglas que envejecen bien:

- **Evita los valores por defecto.** `192.168.0.0/24`, `192.168.1.0/24`, `10.0.0.0/16` y `172.17.0.0/16` son los que con más probabilidad ya existen en el otro extremo.
- **Elige dentro de `10.0.0.0/8` y planifica en `/16`.** Hay 256. Asigna uno por entorno o región a partir de una lista escrita, para que la próxima VPC no tenga que adivinar.
- **Deja sitio para Kubernetes.** Los CIDR de pods y de servicios son rangos aparte que no deben solaparse con la red de los nodos ni con nada con lo que hable el clúster.
- **Dimensiona para el crecimiento, no para hoy.** Cambiar el direccionamiento de una VPC en producción es mucho más trabajo que sobredimensionar al principio. Las subredes en la nube también pierden algunas direcciones reservadas (AWS reserva cinco por subred).

Dividir un `/16` planificado en bloques por subred es tarea del [Subnet Splitter](/subnet-splitter/), y comprobar si una lista de rangos existentes tiene solapamientos antes de añadir otro es lo que hace el [CIDR / Subnet Checker](/cidr-checker/).

## Comprobar si una dirección es privada con aritmética de bits

No necesitas una biblioteca para comprobar la pertenencia al RFC 1918. Una dirección está dentro de un bloque cuando sus primeros *n* bits coinciden con los primeros *n* bits del bloque, lo que en la práctica significa una máscara y una comparación:

```text
10.0.0.0/8      first octet == 10
172.16.0.0/12   first octet == 172  AND  (second octet AND 0xF0) == 0x10
192.168.0.0/16  first octet == 192  AND  second octet == 168

172.20.5.9   ->  20 AND 0xF0 = 16 (0x10)  ->  private
172.32.0.1   ->  32 AND 0xF0 = 32 (0x20)  ->  public
```

Si quieres la deducción completa de máscaras y longitudes de prefijo, [Cómo leer la notación CIDR](/es/blog/how-to-read-cidr-notation/) la desarrolla paso a paso. Para una respuesta rápida, pega cualquier dirección o bloque en el [Subnet Calculator](/subnet-calculator/): muestra la red, el broadcast y el rango de hosts, y los cálculos se hacen en tu navegador.

> **Consejo:** las bibliotecas de cada lenguaje no se ponen de acuerdo sobre qué significa «privada». Algunas incluyen loopback, link-local o `100.64.0.0/10`, y las definiciones han cambiado entre versiones. Si tu código necesita exactamente el RFC 1918, comprueba tú mismo los tres bloques en lugar de fiarte de un indicador genérico `is_private`.

## Referencia rápida

- Privadas (RFC 1918): `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`. Nada más.
- `172.16.0.0/12` termina en `172.31.255.255`. `172.32.x.x` es pública.
- El bridge por defecto de Docker es `172.17.0.0/16`; revísalo antes de elegir un rango para una VPN o una VPC.
- `100.64.0.0/10` (CGNAT), `169.254.0.0/16` (link-local, metadatos de la nube), `127.0.0.0/8` (loopback) y las TEST-NET del RFC 5737 son de uso especial, no RFC 1918.
- La contrapartida en IPv6 es `fc00::/7`, que se usa como `fd00::/8` con un ID global aleatorio.
- El direccionamiento privado y el NAT no son control de acceso. Escribe reglas de firewall explícitas.
- Los rangos solapados rompen el peering y las VPN. Mantén un plan de asignación por escrito y compara con él cada rango nuevo.
