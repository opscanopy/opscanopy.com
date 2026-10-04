---
title: "Como ler a notação CIDR, com exemplos do mundo real"
description: "Como ler a notação CIDR: o número depois da barra, uma tabela de prefixo para máscara de /8 a /32 e exemplos reais de VPCs, firewalls e Kubernetes."
pubDate: 2026-09-14
tags: ["networking", "devops"]
lang: pt-br
translationOf: "how-to-read-cidr-notation"
relatedTool:
  name: "CIDR / Subnet Checker"
  href: "/cidr-checker"
---

![Um endereço IPv4 dividido na barra em um prefixo de rede fixo e uma faixa de hosts variável](/blog/how-to-read-cidr-notation-hero.svg)
<!-- keywords: how to read cidr notation | cidr notation explained, what does /24 mean, cidr to netmask, cidr examples | source: marketing brief, ahrefs unchecked (2026-10-04) -->

Uma regra de security group diz `10.0.32.0/20`. Um módulo do Terraform pede um `pod_cidr`. Uma allowlist de firewall tem uma entrada terminando em `/32`, e um colega pergunta se `10.0.37.200` está "na faixa da VPC". As quatro perguntas se resumem a uma habilidade: ler o número depois da barra.

O CIDR (Classless Inter-Domain Routing, hoje especificado na RFC 4632) substituiu em 1993 o antigo esquema de classes A/B/C. Sua notação junta um endereço e uma máscara em uma única string, e depois que você aprende a lê-la, responde de cabeça à maioria das perguntas de sub-redes.

## O que significa o número depois da barra

Um endereço IPv4 tem 32 bits, escritos como quatro octetos de 8 bits. Em `10.0.32.0/20`, o `/20` é o **comprimento do prefixo**: os primeiros 20 bits são a parte de rede e são fixos para todos os endereços do bloco. Os 32 − 20 = 12 bits restantes são a parte de host e podem assumir qualquer valor.

Isso dá o tamanho do bloco diretamente:

- **Endereços no bloco** = 2^(32 − prefixo). Para `/20`, são 2^12 = 4.096.
- **Hosts utilizáveis** em uma LAN clássica = 2^(32 − prefixo) − 2, porque o endereço de host só com zeros nomeia a rede e o só com uns é o broadcast. Para `/20`, são 4.094.

Um número maior depois da barra significa um bloco *menor*. Cada passo para cima corta o bloco pela metade: um `/24` tem 256 endereços, um `/25` tem 128, um `/26` tem 64.

### A máscara de rede é a mesma coisa por extenso

Uma máscara de rede escreve esses 20 bits fixos como uns e os 12 bits livres como zeros, e mostra o resultado em decimal pontuado:

```text
/20  =  11111111.11111111.11110000.00000000
     =  255     .255     .240     .0
```

Então `10.0.32.0/20` e `10.0.32.0 255.255.240.0` descrevem a mesma rede.

## De CIDR para máscara de rede: a tabela que vale decorar

Você não precisa dos 33 prefixos. Estes são os que aparecem em configurações reais:

| Prefixo | Máscara de rede | Endereços | Hosts utilizáveis |
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

Duas linhas quebram de propósito a regra do "menos dois".

### /31: links ponto a ponto (RFC 3021)

Um `/30` em um link entre dois roteadores desperdiça metade dos endereços com rede e broadcast. A RFC 3021 permite que um `/31` carregue exatamente dois hosts sem endereço de rede nem de broadcast, porque em um link ponto a ponto não há mais ninguém para receber o broadcast.

### /32: um endereço

Um `/32` fixa os 32 bits, então o bloco é um único host. É assim que você nomeia uma máquina em uma tabela de rotas ou em uma allowlist, e o detalhamento completo está na [página /32 do Subnet Calculator](/subnet-calculator/32/).

> **Dica:** o endereço antes da barra deve ser o primeiro do bloco. `10.0.1.0/16` é ambíguo (você quis dizer `10.0.0.0/16` ou `10.0.1.0/24`?), e parsers rigorosos o rejeitam em vez de adivinhar.

```bash
python3 -c "import ipaddress; print(ipaddress.ip_network('10.0.1.0/16'))"
# ValueError: 10.0.1.0/16 has host bits set

python3 -c "import ipaddress; n = ipaddress.ip_network('10.0.32.0/20'); print(n.netmask, n.num_addresses, n[-1])"
# 255.255.240.0 4096 10.0.47.255
```

## Exemplos de CIDR em infraestrutura real

### Uma VPC dividida em sub-redes /24

Um layout comum na nuvem é uma VPC `10.0.0.0/16` dividida em sub-redes `/24`: `10.0.1.0/24` para os load balancers públicos, `10.0.10.0/24` para os nós de aplicação, e assim por diante. Um `/16` comporta 2^(24 − 16) = 256 dessas sub-redes, então raramente falta espaço. As páginas de [/16](/subnet-calculator/16/) e [/24](/subnet-calculator/24/) mostram os dois blocos completos.

A quantidade utilizável é menor do que a tabela diz. A AWS reserva cinco endereços em toda sub-rede (o endereço de rede, o roteador da VPC no `.1`, o resolvedor DNS no `.2`, um reservado para uso futuro no `.3` e o último endereço), então uma sub-rede `/24` dá 251 endereços atribuíveis, não 254.

### /28: o menor bloco que a AWS cria

A AWS aceita blocos CIDR de VPC e de sub-rede de `/16` até `/28`. Depois dos cinco endereços reservados, um [/28](/subnet-calculator/28/) deixa 11 utilizáveis, o suficiente para a sub-rede de um NAT gateway ou um punhado de interface endpoints, e não muito mais. Azure e Google Cloud definem seus próprios mínimos e reservas, então leia a documentação do provedor antes de dimensionar uma sub-rede tão apertada.

### 0.0.0.0/0: tudo

O prefixo zero não fixa bit nenhum, então `0.0.0.0/0` casa com qualquer endereço IPv4. Em uma tabela de rotas, é a rota padrão ("mande para cá tudo que não tiver uma correspondência mais específica"). Em uma regra de entrada de security group, significa a internet inteira, que é exatamente o que você quer na porta 443 de um load balancer público e exatamente o que você não quer na porta 22. O equivalente em IPv6 é `::/0`.

### Entradas /32 em uma allowlist

Quando um fornecedor diz "liberem nossos IPs de saída", cada entrada costuma chegar como `/32`, por exemplo `203.0.113.10/32`. Digitar `203.0.113.10/24` no lugar libera silenciosamente 256 endereços, a maioria deles de outra pessoa.

### CIDRs de pods e de services no Kubernetes

Um cluster autogerenciado criado com `kubeadm` recebe uma faixa de pods como `--pod-network-cidr=10.244.0.0/16` (a faixa que o manifesto padrão do Flannel espera). O controller manager então entrega a cada nó uma fatia própria, um `/24` por padrão, então uma faixa de pods `/16` suporta até 256 nós. Os services ganham uma faixa separada: o kubeadm usa `10.96.0.0/12` por padrão.

Nenhuma dessas faixas pode se sobrepor às outras, à rede dos nós ou a qualquer coisa para a qual você roteia por VPN ou peering. Uma sobreposição raramente falha de forma barulhenta na instalação. Ela aparece depois, quando o tráfego para um banco de dados em uma VPC com peering sai pela rede de pods. Clusters gerenciados funcionam de outro jeito (o VPC CNI padrão do EKS dá aos pods endereços reais da VPC, por exemplo), mas a regra de não sobrepor é a mesma.

## Este IP está dentro daquele bloco CIDR? Fazendo à mão

A pergunta "`10.0.37.200` está em `10.0.32.0/20`?" é um AND bit a bit: aplique a máscara ao endereço e veja se o resultado é o endereço de rede.

Só importa o octeto em que a máscara deixa de ser 255. Para um `/20`, é o terceiro octeto, com máscara 240:

```text
37   = 00100101
240  = 11110000
AND  = 00100000 = 32   -> matches 10.0.32.0, so 10.0.37.200 is inside
```

Teste `10.0.48.1`: `48 AND 240 = 48`, que não é 32, então fica de fora.

Existe um atalho mais rápido. 256 − 240 = 16, então os blocos `/20` começam em múltiplos de 16 no terceiro octeto: `.0`, `.16`, `.32`, `.48` e assim por diante. Logo, `10.0.32.0/20` vai de `10.0.32.0` a `10.0.47.255`. Qualquer coisa com terceiro octeto de 32 a 47 está dentro.

## E o IPv6?

A notação é idêntica. Só muda a largura: um endereço IPv6 tem 128 bits, então um `/64` deixa 64 bits de host e um `/48` contém 2^16 = 65.536 sub-redes `/64`. As convenções são menos flexíveis que no IPv4: `/64` é o tamanho padrão de uma LAN, porque a autoconfiguração sem estado espera um identificador de interface de 64 bits, e `/127` é o equivalente ponto a ponto de um `/31` (RFC 6164). A conta por trás da divisão de um `/48` está em [IPv6 subnet calculator: what ipcalc can't do](/blog/ipv6-subnet-calculator-ipcalc-sipcalc/).

## Confira uma lista de blocos CIDR sem fazer a conta

Aritmética à mão em uma allowlist de 40 linhas é como os erros passam. O [CIDR / Subnet Checker](/cidr-checker/) recebe uma lista de faixas e um endereço e diz quais faixas o contêm, quais se sobrepõem e qual é o menor conjunto equivalente quando blocos adjacentes podem ser agregados. Para um único bloco, o [Subnet Calculator](/subnet-calculator/) mostra rede, broadcast, faixa de hosts e máscara. Os dois rodam no seu navegador, então colar faixas internas não as envia para lugar nenhum.

## Referência rápida de CIDR

- [ ] O número depois da barra conta os bits **fixos**. Número maior, bloco menor.
- [ ] Endereços = 2^(32 − prefixo); hosts utilizáveis = isso menos 2, exceto `/31` (2, RFC 3021) e `/32` (1).
- [ ] Sub-redes na nuvem reservam mais: a AWS fica com 5 por sub-rede, então um `/24` dá 251 e um `/28` dá 11.
- [ ] O endereço antes da barra precisa ser o primeiro do bloco; parsers rigorosos rejeitam bits de host.
- [ ] `0.0.0.0/0` casa com tudo. Nunca o coloque em uma porta de administração.
- [ ] Hosts únicos em uma allowlist são `/32`. Um `/24` digitado por engano deixa entrar 255 endereços a mais.
- [ ] Faixas de pods, services, nós e redes com peering não podem se sobrepor.
- [ ] Para testar se um endereço pertence ao bloco, faça AND com a máscara ou use o atalho do tamanho de bloco 256 − máscara.
- [ ] O IPv6 usa a mesma notação sobre 128 bits; `/64` por LAN, `/127` para ponto a ponto.
