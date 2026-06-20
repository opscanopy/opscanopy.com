---
title: "Lendo expressões cron: um guia campo a campo"
description: "Um guia prático, campo a campo, para ler expressões cron — os cinco campos de tempo, intervalos, passos, listas e @macros — além das pegadinhas que fazem os agendamentos dispararem quando você menos espera."
pubDate: 2026-05-13
tags: ["cron", "scheduling", "devops"]
lang: pt-br
translationOf: "cron-expressions-explained"
---

![Lendo expressões cron campo a campo: um guia de agendamento para os cinco campos de tempo do cron, intervalos e passos](/blog/cron-expressions-explained-hero.svg)

Quase todo mundo que mantém um backend já encarou uma linha como `*/15 9-17 * * 1-5` e lembrou só pela metade o que ela faz. A sintaxe do cron é compacta, o que é sua grande virtude e sua grande armadilha: cinco campos minúsculos codificam um agendamento recorrente, e um único caractere fora do lugar pode transformar “toda tarde de dia útil” em “a cada minuto, para sempre.” Este guia lê uma expressão cron do jeito que o daemon lê — campo a campo — para que, da próxima vez que você se deparar com uma, consiga decodificá-la de bate-pronto.

## Os cinco campos

Uma expressão cron padrão tem cinco campos separados por espaços em branco, sempre nesta ordem:

```text
┌───────────── minute        (0–59)
│ ┌─────────── hour          (0–23)
│ │ ┌───────── day of month  (1–31)
│ │ │ ┌─────── month         (1–12 or JAN–DEC)
│ │ │ │ ┌───── day of week   (0–6, Sun=0; 7 also = Sun)
│ │ │ │ │
* * * * *
```

A tarefa roda a cada minuto em que **todos** os campos de tempo correspondem ao momento atual. Um campo com `*` significa “todo valor,” então o canônico `* * * * *` dispara uma vez por minuto. Leia da esquerda para a direita e os agendamentos mais comuns aparecem rapidamente:

```text
0 * * * *      at minute 0 of every hour          → hourly, on the hour
30 2 * * *      at 02:30 every day                 → a nightly batch job
0 0 1 * *      at 00:00 on day 1 of every month    → monthly rollover
0 9 * * 1      at 09:00 every Monday               → start-of-week report
```

Note que segundos **não** fazem parte do cron Unix padrão. Algumas implementações (Quartz, muitas bibliotecas de Go e Node; Kubernetes é a exceção notável que permanece com cinco) acrescentam um sexto campo de segundos no início. Se uma expressão de seis campos se comportar de forma estranha no `crontab` puro, normalmente é por causa desse campo extra.

![Os cinco campos de uma expressão cron rotulados como minuto, hora, dia do mês, mês e dia da semana, com anotações de passo e intervalo](/blog/cron-expressions-explained-diagram.svg)

## Intervalos, passos e listas

Três operadores fazem a maior parte do trabalho pesado, e eles se combinam dentro de um único campo:

- **Intervalo** `a-b` — um trecho inclusivo. `9-17` no campo de hora significa das horas 9 às 17.
- **Passo** `*/n` ou `a-b/n` — a cada enésimo valor. `*/15` no campo de minuto significa 0, 15, 30, 45. `9-17/2` significa 9, 11, 13, 15, 17.
- **Lista** `a,b,c` — um conjunto explícito. `1,15` no campo de dia do mês significa o dia 1 e o dia 15.

Juntando tudo, a expressão do parágrafo de abertura se decodifica de forma clara:

```text
*/15 9-17 * * 1-5
 │    │   │ │  └── Monday through Friday
 │    │   │ └───── every month
 │    │   └─────── every day of the month
 │    └─────────── hours 9 through 17 (9 AM–5 PM)
 └──────────────── every 15th minute (0, 15, 30, 45)
```

Ou seja: **a cada 15 minutos, entre 9h e 17h, de segunda a sexta.** Uma cadência razoável para uma tarefa de sincronização que deve descansar à noite e nos fins de semana. O perigo é o quão pouco isso difere de `* 9-17 * * 1-5`, que abandona o passo e dispara *a cada minuto* dentro dessa janela — 60× a carga. O caractere que separa um agendamento bem-feito de uma negação de serviço acidental tem dois caracteres de largura.

## A armadilha do dia do mês / dia da semana

A regra mais surpreendente do cron é como os dois campos de “dia” se combinam. A intuição diz que eles são combinados com E (AND) como todo outro par de campos. Não são. Quando **ambos** dia do mês e dia da semana estão restritos (nenhum dos dois é `*`), o cron os trata como um **OU** (OR): a tarefa roda se *qualquer um* deles corresponder.

```text
0 0 1,15 * 5    midnight on the 1st, on the 15th, OR on any Friday
```

Essa expressão não significa “no dia 1 ou no dia 15, mas só se for sexta-feira.” Ela significa três disparos separados. Se você realmente precisa de um E (AND) — digamos, “a primeira segunda-feira do mês” — o cron puro não consegue expressar isso diretamente; você protege isso dentro da própria tarefa (`[ "$(date +\%d)" -le 07 ] || exit 0`) ou recorre a uma extensão como o operador `#` do Quartz (`MON#1`). Essa regra de OU é responsável por boa parte dos incidentes do tipo “por que isso disparou duas vezes?”.

## As @macros

A maioria dos crons aceita um punhado de atalhos nomeados que substituem uma expressão inteira de cinco campos. Eles são mais fáceis de ler e eliminam uma classe de erros de digitação:

```text
@hourly    →  0 * * * *
@daily     →  0 0 * * *   (alias: @midnight)
@weekly    →  0 0 * * 0
@monthly   →  0 0 1 * *
@yearly    →  0 0 1 1 *   (alias: @annually)
```

Há também o `@reboot`, que é especial: ele roda uma vez quando o cron é iniciado, não em nenhum agendamento de relógio. Útil para aquecer um cache após uma reinicialização, inútil para qualquer coisa relacionada a horário do dia — e uma fonte frequente de relatos do tipo “minha tarefa diária nunca rodou” quando alguém recorre a ele por engano.

## Lendo as pegadinhas

Algumas regras a mais separam as pessoas que *acham* que leem cron das que de fato leem:

- **Fusos horários.** O cron clássico roda no fuso horário local do sistema, então transições de horário de verão podem pular ou repetir uma tarefa. Uma tarefa às 02:30 roda zero vezes na noite em que o relógio adianta e duas vezes na noite em que ele atrasa. Sistemas que importam cada vez mais fixam os agendamentos em UTC exatamente por esse motivo.
- **Numeração do dia da semana.** Domingo é `0`, e `7` também é aceito como domingo na maioria das implementações — mas não em todas. Prefira os nomes de três letras (`SUN`, `MON`, …) quando puder; eles são inequívocos.
- **`*/n` não dá a volta.** `*/40` no campo de minuto dispara no minuto 0 e no 40, depois salta para o 0 da hora seguinte. Isso **não** é “a cada 40 minutos” — a contagem recomeça a cada hora, então o intervalo real entre o :40 e o :00 seguinte é de apenas 20 minutos.

Nada disso é exótico. São as bordas do dia a dia que fazem um agendamento disparar em um horário que você não pretendia, e nenhuma delas é visível só olhando para os cinco campos.

## Verifique antes de colocar em produção

O jeito honesto de ler uma expressão cron é não confiar na sua própria leitura dela. Decodifique-a em português claro e, depois, observe os timestamps reais que ela vai produzir ao longo das próximas execuções — é aí que o salto do `*/40`, o intervalo do horário de verão e o OU dos campos de dia se revelam imediatamente.

O **Cron Expression Tester** faz exatamente isso no seu navegador: cole qualquer expressão — intervalos, passos, listas, `@macros` e tudo o mais — e obtenha uma descrição em português claro ao lado dos próximos horários de execução, sem nada sendo enviado para lugar nenhum. Ele transforma “acho que isso é toda tarde de dia útil” em “aqui estão os próximos dez horários em que ela dispara,” que é a única leitura que importa.

[Experimente o Cron Expression Tester →](/cron-expression-tester)
