---
title: "O guia completo das faixas de endereços IP privados (RFC 1918)"
description: "As três faixas de IP privado da RFC 1918, a pegadinha de 172.16.0.0/12, os endereços que só parecem privados e como escolher uma faixa sem colisão."
pubDate: 2026-09-17
tags: ["networking", "security"]
lang: pt-br
translationOf: "private-ip-address-ranges-rfc-1918"
relatedTool:
  name: "Subnet Calculator"
  href: "/subnet-calculator"
---

![Três blocos de endereços aninhados representando as faixas privadas da RFC 1918: 10.0.0.0/8, 172.16.0.0/12 e 192.168.0.0/16](/blog/private-ip-address-ranges-rfc-1918-hero.svg)
<!-- keywords: private ip address ranges | rfc 1918, private ip ranges, is 172.32 private, 172.16.0.0/12 range, 100.64.0.0/10 | source: marketing brief, ahrefs unchecked (2026-10-04) -->

Uma regra de security group diz "permitir a partir de redes privadas", e alguém escreveu `172.0.0.0/8`. Parece razoável. Também abre a porta para cerca de 15 milhões de endereços públicos, porque só um dezesseis avos desse bloco é privado. O espaço de endereçamento privado é pequeno, definido com precisão e fácil de lembrar errado, e os erros aparecem como buracos no firewall, rotas de VPN que silenciosamente não levam a lugar nenhum e pedidos de VPC peering que a nuvem recusa.

Este post é a referência: as três faixas, o limite que pega as pessoas, os blocos que parecem privados mas não são e como escolher uma faixa da qual você não vai se arrepender.

## As três faixas de endereços IP privados

A RFC 1918, publicada em 1996 como BCP 5, reserva três blocos IPv4 para uso dentro de redes privadas. Eles não são atribuídos a ninguém, ninguém os roteia na internet pública e qualquer um pode reutilizá-los atrás da própria borda.

| Bloco | Faixa | Endereços | Uso típico |
|---|---|---|---|
| `10.0.0.0/8` | 10.0.0.0 – 10.255.255.255 | 16.777.216 | Grandes empresas, VPCs na nuvem, redes de pods do Kubernetes |
| `172.16.0.0/12` | 172.16.0.0 – 172.31.255.255 | 1.048.576 | Padrões do Docker, a VPC padrão da AWS (`172.31.0.0/16`) |
| `192.168.0.0/16` | 192.168.0.0 – 192.168.255.255 | 65.536 | Roteadores domésticos, escritórios pequenos, redes de laboratório |

Cada um tem uma página detalhada se você quiser ver rede, máscara e quantidade de hosts: [10.0.0.0/8](/subnet-calculator/10-0-0-0-8/), [172.16.0.0/12](/subnet-calculator/172-16-0-0-12/) e [192.168.0.0/16](/subnet-calculator/192-168-0-0-16/). O bloco que a maioria das pessoas já digitou de fato é o `/24` do roteador de casa, [192.168.1.0/24](/subnet-calculator/192-168-1-0-24/).

Repare no que a RFC 1918 não diz. Ela não diz que esses endereços são seguros, ocultos ou inalcançáveis. Diz que eles não são globalmente únicos e que, por isso, roteadores na internet pública não devem transportá-los. É uma afirmação sobre roteamento, não sobre controle de acesso.

## Por que 172.16.0.0/12 engana tanta gente

O primeiro e o último bloco caem em limites de octeto: tudo que começa com `10.` é privado, tudo que começa com `192.168.` também. O do meio, não. Um `/12` fixa os primeiros 12 bits, ou seja, o primeiro octeto inteiro mais os quatro bits mais altos do segundo. No segundo octeto, esses quatro bits são `0001`, então o octeto só pode ir de `0001 0000` (16) a `0001 1111` (31).

```text
172.16.0.0/12
first octet   172  = 1010 1100   (fixed)
second octet   16  = 0001 0000   (top 4 bits fixed: 0001)
               31  = 0001 1111   (last value that keeps 0001)
               32  = 0010 0000   (top bits change: outside the block)

private:  172.16.0.0 – 172.31.255.255
public:   172.0.0.0 – 172.15.255.255 and 172.32.0.0 – 172.255.255.255
```

Então `172.32.0.1` é um endereço público, e `172.15.0.1` também. Uma regra escrita como `172.0.0.0/8` ou uma regex casando `^172\.` cobre dezesseis vezes o espaço que você queria.

O outro motivo para esse bloco importar: o Docker o usa por padrão. A rede `bridge` padrão é `172.17.0.0/16`, e as redes definidas pelo usuário são alocadas a partir do resto do espaço 172.16/12 e depois de 192.168/16 (os pools são configuráveis no `daemon.json`). Você vê o que tem com:

```bash
docker network inspect bridge --format '{{(index .IPAM.Config 0).Subnet}}'
docker network ls -q | xargs docker network inspect \
  --format '{{.Name}} {{range .IPAM.Config}}{{.Subnet}}{{end}}'
```

Se a VPN do escritório ou uma VPC com peering também estiver em `172.17.0.0/16` ou `172.18.0.0/16`, o host agora tem duas rotas para o mesmo prefixo, e o tráfego para a rede remota vai para uma bridge local do Docker. Parece "a VPN conecta, mas nada responde".

> **Dica:** se hosts Docker e redes corporativas vivem colidindo, defina `default-address-pools` em `/etc/docker/daemon.json` com uma faixa que ninguém mais use, em vez de renumerar a rede em volta do Docker.

## Endereços que parecem privados mas não são RFC 1918

Vários outros blocos reservados se comportam como "não públicos" na prática e acabam no mesmo saco da RFC 1918 em regras de firewall e allowlists. As regras deles são diferentes, e tratá-los como intercambiáveis causa bugs reais.

| Bloco | Definido em | O que é |
|---|---|---|
| `100.64.0.0/10` | RFC 6598 | Espaço de endereçamento compartilhado para NAT de operadora (CGNAT). Também usado pelo Tailscale para endereços de nós. Não é RFC 1918: não o use nas suas próprias LANs se o seu provedor puder usá-lo upstream. |
| `169.254.0.0/16` | RFC 3927 | Link-local IPv4, autoatribuído quando o DHCP falha. Os serviços de metadados da nuvem ficam em `169.254.169.254`, e é por isso que filtros contra SSRF também precisam bloquear esse bloco. |
| `127.0.0.0/8` | RFC 1122 | Loopback. O `/8` inteiro, não só `127.0.0.1`. |
| `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24` | RFC 5737 | TEST-NET-1, -2 e -3, reservados para documentação. Certos em exemplos, errados em configurações. |
| `198.18.0.0/15` | RFC 2544 | Reservado para benchmarks de rede. |
| `fc00::/7` | RFC 4193 | Endereços IPv6 únicos locais (ULA). O equivalente IPv6 mais próximo da RFC 1918; na prática, usa-se `fd00::/8` com um ID global aleatório de 40 bits. |
| `fe80::/10` | RFC 4291 | Link-local IPv6, presente em toda interface IPv6. |

> **Atenção:** uma checagem de "este endereço é interno?" que só testa os três blocos da RFC 1918 vai aceitar tranquilamente `127.0.0.1`, `169.254.169.254` e `[::1]`. Para proteção contra SSRF, teste contra o registro completo de endereços de uso especial (RFC 6890 e os registros da IANA) e resolva o hostname antes de checar, não depois.

## NAT não é firewall

O endereçamento privado se popularizou por causa do NAT, e o efeito colateral do NAT é que conexões de entrada não solicitadas normalmente não têm para onde ir. Esse efeito colateral não é um controle de segurança. Um roteador com redirecionamento de portas, uma requisição UPnP de um dispositivo da LAN, um endereço IPv6 no mesmo host sem NAT nenhum ou um atacante que já está dentro da rede passam por cima dele.

Endereços RFC 1918 também não estão escondidos de ninguém na mesma rede, na mesma VPN ou em uma VPC com peering. Dentro desses limites, são endereços roteáveis comuns. Se um serviço só deve aceitar tráfego de certos hosts, registre isso como regra de firewall ou de security group com faixas de origem explícitas. O endereço privado diz onde o serviço mora, não quem pode alcançá-lo.

## Escolhendo uma faixa privada para VPC, VPN ou laboratório

Como todo mundo reutiliza o mesmo espaço, o risco real é a sobreposição. Duas redes que usam o mesmo prefixo não podem ser roteadas uma para a outra sem um NAT no meio, e as grandes nuvens recusam de cara o VPC peering entre CIDRs sobrepostos. A sobreposição também quebra clientes VPN: uma rede doméstica em `192.168.1.0/24` conectando a um escritório que também usa `192.168.1.0/24` não alcança o lado do escritório dessa faixa.

Algumas regras que envelhecem bem:

- **Evite os padrões.** `192.168.0.0/24`, `192.168.1.0/24`, `10.0.0.0/16` e `172.17.0.0/16` são os que mais provavelmente já existem do outro lado.
- **Escolha dentro de `10.0.0.0/8` e planeje em `/16`.** Há 256 deles. Atribua um por ambiente ou região a partir de uma lista escrita, para que a próxima VPC não precise adivinhar.
- **Deixe espaço para o Kubernetes.** CIDRs de pods e de services são faixas separadas que não podem se sobrepor à rede dos nós nem a nada com que o cluster converse.
- **Dimensione para o crescimento, não para hoje.** Reendereçar uma VPC em produção dá muito mais trabalho do que alocar com folga no começo. Sub-redes na nuvem também perdem alguns endereços para posições reservadas (a AWS reserva cinco por sub-rede).

Dividir um `/16` planejado em blocos por sub-rede é trabalho para o [Subnet Splitter](/subnet-splitter/), e verificar sobreposições em uma lista de faixas existentes antes de acrescentar outra é o que o [CIDR / Subnet Checker](/cidr-checker/) faz.

## Verificando se um endereço é privado com aritmética de bits

Você não precisa de biblioteca para testar se um endereço pertence à RFC 1918. Um endereço está dentro de um bloco quando seus primeiros *n* bits coincidem com os primeiros *n* bits do bloco, o que na prática significa uma máscara e uma comparação:

```text
10.0.0.0/8      first octet == 10
172.16.0.0/12   first octet == 172  AND  (second octet AND 0xF0) == 0x10
192.168.0.0/16  first octet == 192  AND  second octet == 168

172.20.5.9   ->  20 AND 0xF0 = 16 (0x10)  ->  private
172.32.0.1   ->  32 AND 0xF0 = 32 (0x20)  ->  public
```

Se quiser a dedução completa de máscaras e comprimentos de prefixo, [Como ler a notação CIDR](/blog/how-to-read-cidr-notation/) trabalha isso passo a passo. Para uma resposta rápida, cole qualquer endereço ou bloco no [Subnet Calculator](/subnet-calculator/): ele mostra rede, broadcast e faixa de hosts, e a conta roda no seu navegador.

> **Dica:** bibliotecas de linguagens diferentes discordam sobre o que "privado" significa. Algumas incluem loopback, link-local ou `100.64.0.0/10`, e as definições mudaram entre versões. Se o seu código precisa exatamente da RFC 1918, teste os três blocos você mesmo em vez de confiar em uma flag genérica `is_private`.

## Referência rápida

- Privados (RFC 1918): `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`. Nada mais.
- `172.16.0.0/12` termina em `172.31.255.255`. `172.32.x.x` é público.
- A bridge padrão do Docker é `172.17.0.0/16`; confira antes de escolher uma faixa de VPN ou VPC.
- `100.64.0.0/10` (CGNAT), `169.254.0.0/16` (link-local, metadados da nuvem), `127.0.0.0/8` (loopback) e as TEST-NETs da RFC 5737 são de uso especial, não RFC 1918.
- A contrapartida em IPv6 é `fc00::/7`, usado como `fd00::/8` com um ID global aleatório.
- Endereçamento privado e NAT não são controle de acesso. Escreva regras de firewall explícitas.
- Faixas sobrepostas quebram peering e VPNs. Mantenha um plano de alocação por escrito e confira cada faixa nova contra ele.
