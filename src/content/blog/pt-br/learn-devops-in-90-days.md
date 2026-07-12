---
title: "Aprenda DevOps em 90 dias: o caminho gratuito e guiado por incidentes de desenvolvedor a engenheiro DevOps"
description: "Por que criamos o Mission: 90 Days DevOps — um caminho gratuito, dia a dia, do Linux ao Kubernetes com missões de incidente jogáveis. O plano completo, as decisões de design e os tradeoffs honestos."
pubDate: 2026-07-12
tags: ["devops", "career", "learning"]
lang: pt-br
translationOf: "learn-devops-in-90-days"
relatedTool:
  name: "Mission: 90 Days DevOps"
  href: "/mission-90/"
---

![Aprenda DevOps em 90 dias: um caminho gratuito e guiado por incidentes de desenvolvedor a engenheiro DevOps](/blog/learn-devops-in-90-days-hero.svg)

Existe um momento de que todo engenheiro de operações novato se lembra: a primeira vez em que algo real quebra. O tutorial terminou semanas atrás, o caminho feliz não está em lugar nenhum à vista, e um pod está travado em `CrashLoopBackOff` — ou um cron job parou silenciosamente, ou o site inteiro responde 502. Tutoriais ensinam comandos. Incidentes formam engenheiros.

Essa lacuna é o motivo pelo qual criamos o [Mission: 90 Days DevOps](/mission-90/) — um programa gratuito e guiado que leva você do seu primeiro comando no terminal a pronto para o mercado em 90 dias, com uma lição focada por dia e uma missão de incidente guiada por história para resolver ao fim de cada semana. Todos os 90 dias e todas as 10 missões já estão no ar. Sem cadastro, sem barreira de e-mail, sem paywall; seu progresso fica salvo no seu próprio navegador. Este post explica o que há no programa, a ordem e o porquê dela, e as decisões de design por trás de tudo — inclusive as que envolvem tradeoffs reais.

## A regra de ordenação: cada camada precisa permitir depurar a camada acima dela

A maioria dos roadmaps de DevOps falha de uma de duas formas. Ou eles entregam uma árvore de habilidades com 200 nós e nenhuma sequência, ou começam pela coisa brilhante — Kubernetes antes de Linux, que é como as pessoas acabam copiando e colando comandos `kubectl` que não conseguem depurar.

A ordem do programa vem de uma única regra: **cada camada precisa permitir depurar a camada acima dela.**

- Problemas de Kubernetes geralmente são problemas de contêiner.
- Problemas de contêiner geralmente são problemas de Linux.
- Problemas de rede na nuvem geralmente são problemas de DNS e portas que você pode aprender no localhost.

Por isso os 90 dias seguem Linux primeiro, contêineres em segundo, nuvem em terceiro, orquestração em quarto e preparação para o emprego por último — 45 a 60 minutos por dia, cerca de 80 horas de trabalho principal no total. É um compromisso de verdade, não uma promessa de "10 minutos por dia", mas cabe ao lado de um emprego em tempo integral, e 90 dias é curto o bastante para você enxergar a linha de chegada desde o Dia 1.

![O caminho de 90 dias: cinco fases, dos fundamentos de Linux até pronto para o mercado, com uma missão de incidente fechando cada semana](/blog/learn-devops-in-90-days-diagram.svg)

## As cinco fases

**Fase 1 — Linux e o terminal (Dias 1–21).** Três semanas sobre arquivos, permissões, processos, systemd, logs, DNS e portas, bash, cron e SSH. Parece longo quando o Kubernetes está chamando, mas quase todo incidente termina com alguém conectado via SSH em uma máquina lendo logs — é aqui que isso deixa de ser assustador. Tudo roda localmente no WSL2 ou em qualquer máquina Linux. Custo: zero.

**Fase 2 — Docker e CI/CD (Dias 22–45).** Empacotar software e entregá-lo automaticamente, em um pareamento deliberado: imagens, Dockerfiles, volumes, redes e compose de um lado; workflows reais de Git e pipelines do GitHub Actions do outro. A fase termina com o **Projeto 1**: containerizar o `linkstash`, um encurtador de URLs em FastAPI, banco de dados incluído. Ainda totalmente local, ainda com custo zero.

**Fase 3 — AWS (Dias 46–65).** IAM e VPC primeiro — porque a maior parte da confusão na AWS é "por que essa coisa não consegue falar com aquela outra", e a resposta quase sempre é um security group ou uma rota de sub-rede — depois S3, RDS, load balancers e monitoramento. O **Projeto 2** implanta o mesmo contêiner `linkstash` do jeito certo: ECS Fargate atrás de um ALB com RDS Postgres em duas zonas de disponibilidade.

**Fase 4 — Kubernetes e Terraform (Dias 66–85).** Pods, Services, configuração, probes, ingress e Helm — praticados primeiro em clusters `kind` locais, onde errar não custa nada — e depois Terraform, para que a infraestrutura vire código revisável em vez de cliques no console. O **Projeto 3** é o projeto de conclusão: `linkstash` de novo, agora em k3s em uma única instância EC2, provisionada inteiramente por Terraform, empacotado como um Helm chart e servido com TLS de verdade por Traefik e cert-manager.

**Fase 5 — Pronto para o mercado (Dias 86–90).** A parte que todo roadmap pula: transformar o trabalho em uma contratação. Um currículo reconstruído em torno dos três projetos, polimento do portfólio e do GitHub, fundamentos de gestão de incidentes — níveis de severidade, postmortems sem culpados, error budgets — e um treino de entrevista. Cada dia do programa termina com três a cinco perguntas de entrevista, então no Dia 86 você já terá respondido mais de 300.

## Um único app, levado por toda a stack

A decisão de design que defenderíamos com mais força: o programa constrói **uma aplicação de três formas**, não três projetos descartáveis.

O `linkstash` é containerizado na Fase 2, implantado na AWS na Fase 3 e orquestrado no Kubernetes na Fase 4. Em uma entrevista, isso transforma "fiz alguns tutoriais" em "aqui está um sistema que eu rodei de três formas, e aqui está o porquê de cada camada existir". O compara-e-contrasta — arquivo compose versus task definition versus Helm chart, `depends_on` versus target groups versus readiness probes — é precisamente a história que os entrevistadores pedem.

## Incidentes são o currículo, não um bônus

Ler sobre `journalctl` e usá-lo às 00:14 durante uma queda são habilidades diferentes, e só uma delas é um emprego. Por isso os fechamentos de semana não são quizzes — são **missões**: simulações de incidente guiadas por história que rodam em um terminal no seu navegador. Sem configuração, sem conta na nuvem, sem precisar escrever código.

Você começa a primeira semana com *Server Down!* — um servidor web de produção está fora do ar às 2 da manhã e você precisa encontrar o processo descontrolado, matá-lo e trazer o nginx de volta. Na última semana você enfrenta *The Midnight Outage*: um SEV-1 em que uma única mudança de security group vira uma cascata de health checks falhando no load balancer, um failover de DNS e pods na região de contingência que não conseguem iniciar porque alguém apagou o Secret que eles montam. A correção precisa acontecer **do upstream para baixo** — reabrir o caminho de rede, restaurar o Secret e então confirmar que o DNS se recuperou — nessa ordem, porque reiniciar pods nunca foi o problema.

No meio do caminho: um mistério de DNS, um bloqueio por permissões, uma stack de contêineres em crash loop, um pipeline de CI quebrado, uma conta surpresa da AWS, uma tabela de produção apagada, um cluster Kubernetes em caos e um lock de estado do Terraform preso. Dez missões, cada uma ensaiando exatamente o loop de diagnóstico que a sua semana ensinou.

## Projetado para custar (quase) nada

Um caminho de aprendizado que silenciosamente acumula uma conta de nuvem é um caminho de aprendizado quebrado. Por isso as regras de orçamento são estruturais:

- As Fases 1 e 2 e os fundamentos de Kubernetes rodam **inteiramente no local** — WSL2, Docker, `kind` e providers locais do Terraform. Zero gasto com nuvem.
- Todo dia de AWS abre com uma **caixa de custo** dizendo exatamente quanto o laboratório custa e sob quais condições ele sai de graça, e termina com um **teardown obrigatório**.
- O projeto de conclusão de Kubernetes usa k3s em uma t3.small (cerca de $19/mês se você esquecer dela ligada, efetivamente grátis no free tier com teardown no mesmo dia) em vez de EKS, cujo control plane sozinho custa cerca de $73/mês. Mesma API do Kubernetes, mesmos manifests, mesmo Helm — você só não paga a AWS para hospedar o API server. O tradeoff, dito com honestidade: você não vai tocar em cola específica do EKS, como IRSA ou managed node groups, o que não tem problema aprender já no emprego.

## Como é um dia

Cada um dos 90 dias tem o mesmo formato, então você sempre sabe o que "pronto" significa:

1. **Um conceito curto** — menos de 600 palavras, um diagrama, uma analogia com o mundo real. Dá para ler em cinco minutos.
2. **Um laboratório prático** — comandos reais com saída real, reproduzíveis na sua máquina.
3. **Erros comuns e correções** — as strings de erro reais que você vai encontrar, por que elas acontecem e como você as identificaria em produção.
4. **Perguntas e respostas de entrevista** — três a cinco perguntas com respostas que valem a pena dizer em voz alta.

Há extras opcionais de "Go Deeper" para os dias em que você tem mais tempo — e a lição seguinte nunca pressupõe que você os fez.

## Os tradeoffs honestos

- **90 dias tornam você contratável como júnior, não como sênior.** Você vai contribuir e depurar desde a primeira semana no emprego; a profundidade vem com o tempo de plantão.
- **É opinativo.** GitHub Actions em vez de Jenkins, AWS em vez de Azure, k3s em vez de EKS. Cada posição recebeu o padrão de maior alavancagem; o emprego que você almeja pode ser diferente.
- **Ritmo próprio exige disciplina própria.** O acompanhamento de progresso ajuda; ele não substitui aparecer todos os dias.
- **A fase de AWS exige um cartão cadastrado.** A disciplina de teardown mantém o gasto perto de zero, mas o risco nunca é exatamente zero.

## Comece hoje

Está tudo no ar: [todos os 90 dias](/mission-90/), as [dez missões](/mission-90/missions/) e os três projetos. Comece pelo Dia 1 — ou, se quiser sentir o propósito do programa inteiro em dez minutos, jogue *Server Down!* primeiro. Ele não precisa de nada além de uma aba do navegador, e termina do jeito que todo bom incidente termina: com o site de volta no ar, e você sabendo exatamente por quê.
