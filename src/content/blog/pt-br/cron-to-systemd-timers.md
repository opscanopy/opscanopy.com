---
title: "Migrando do cron para os timers do systemd"
description: "Um guia prático para converter entradas de crontab em units .timer e .service do systemd — sintaxe OnCalendar, logging, atrasos randomizados, execuções de recuperação e as pegadinhas que mordem durante a migração."
pubDate: 2026-05-20
tags: ["systemd", "cron", "linux"]
lang: pt-br
translationOf: "cron-to-systemd-timers"
---

![Migrando do cron para os timers do systemd: convertendo entradas de crontab em units .timer e .service](/blog/cron-to-systemd-timers-hero.svg)

O cron tem comandado os jobs agendados do mundo há quarenta anos e, na maioria dos servidores, ainda funciona bem. Mas no momento em que um job precisa de logging estruturado, um ambiente controlado, ordenação de dependências ou uma forma de se recuperar depois que a máquina ficou desligada, o modelo do cron começa a ranger. É aí que entram os timers do systemd — e se a sua distribuição já roda systemd (Debian, Ubuntu, RHEL, Fedora, Arch e SUSE todas rodam), você tem um agendador mais capaz parado sem uso.

Este post percorre o que realmente muda quando você migra, com units reais que você pode adaptar.

## Por que se dar ao trabalho de sair do cron

O cron é uma única linha. Essa brevidade é o seu atrativo e o seu limite:

- **Logging.** A saída de um job cron vai para onde você redirecionar e, se você esquecer, ela é enviada por e-mail para uma caixa postal que ninguém lê. Um service do systemd escreve no journal automaticamente — `journalctl -u myjob.service` mostra cada execução, com timestamps e códigos de saída.
- **Ambiente.** O cron roda com um `PATH` deliberadamente mínimo e quase nenhum ambiente, o que é a clássica armadilha do "funciona no meu shell, falha no cron". Uma unit de service declara o seu ambiente explicitamente.
- **Execuções perdidas.** Se o host estiver suspenso ou desligado no minuto agendado, o cron simplesmente pula o job. Um timer com `Persistent=true` o executa assim que a máquina volta.
- **Sobreposição e recursos.** O systemd não inicia uma segunda cópia de um job enquanto a primeira ainda está rodando, e você pode anexar `CPUQuota=`, `MemoryMax=` e outros controles de recursos a uma unit.

Você não precisa migrar tudo. Mas para jobs em que uma falha silenciosa lhe custa caro, os timers valem os dois arquivos que exigem.

![Uma linha de crontab mapeada para uma unit .timer do systemd com OnCalendar e uma unit .service com ExecStart](/blog/cron-to-systemd-timers-diagram.svg)

## O modelo de dois arquivos

Uma linha do cron faz agendamento e execução em um só lugar. O systemd divide isso em um **service** (o que executar) e um **timer** (quando executar). Eles compartilham um nome base.

Pegue esta entrada de crontab — rodar um script de backup todo dia às 02:30:

```cron
30 2 * * * /usr/local/bin/backup.sh
```

Isso se torna duas units em `/etc/systemd/system/`.

O service, `backup.service`:

```ini
[Unit]
Description=Nightly backup
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/backup.sh
```

O timer, `backup.timer`:

```ini
[Unit]
Description=Run nightly backup at 02:30

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true

[Install]
WantedBy=timers.target
```

`Type=oneshot` diz ao systemd que se espera que o job execute, termine e saia — o tipo certo para quase toda tarefa no estilo cron. A seção `[Install]` do timer é o que faz o `systemctl enable` funcionar; sem `WantedBy=timers.target`, o timer não será armado no boot.

Habilite e inicie:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now backup.timer
```

Note que você habilita o **timer**, não o service. O timer aciona o service quando dispara.

## Traduzindo o agendamento: OnCalendar

A parte mais difícil da migração é o campo de agendamento, porque o systemd usa `OnCalendar=` em vez dos cinco campos do cron. O formato é `DOW YYYY-MM-DD HH:MM:SS`, e ele é genuinamente mais legível depois que você aprende. Alguns mapeamentos comuns:

```text
# cron                        # OnCalendar
*/15 * * * *                  *-*-* *:0/15:00      (every 15 minutes)
0 * * * *                     *-*-* *:00:00        (hourly, on the hour)
30 2 * * *                    *-*-* 02:30:00       (daily at 02:30)
0 4 * * 1                     Mon *-*-* 04:00:00   (Mondays at 04:00)
0 0 1 * *                     *-*-01 00:00:00      (1st of the month)
0 9 * * 1-5                   Mon..Fri *-*-* 09:00:00  (weekdays at 09:00)
```

Também existem atalhos convenientes — `hourly`, `daily`, `weekly`, `monthly` — então `OnCalendar=daily` é equivalente à meia-noite todos os dias. O comando mais útil de todos durante a migração é o `systemd-analyze calendar`, que faz o parse de uma expressão e mostra os próximos horários de disparo:

```bash
$ systemd-analyze calendar --iterations=3 'Mon..Fri *-*-* 09:00:00'
  Original form: Mon..Fri *-*-* 09:00:00
Normalized form: Mon..Fri *-*-* 09:00:00
    Next elapse: Mon 2026-06-08 09:00:00 UTC
       From now: 4h 12min left
       (next 3)  Tue 2026-06-09 09:00:00 UTC
                 Wed 2026-06-10 09:00:00 UTC
```

Se essa saída corresponder ao que a sua linha do cron fazia, o agendamento está correto. Se não corresponder, você pegou o bug antes que ele fosse para produção.

## As pegadinhas que realmente mordem

**Fuso horário.** O cron usa a hora local do sistema. Os timers do systemd também usam por padrão, mas o `OnCalendar` é avaliado no fuso horário do timer, o que pode surpreender você em servidores configurados para UTC. Fixe-o explicitamente com `OnCalendar=Mon *-*-* 04:00:00 America/New_York` se a hora local importar, e lembre-se de que as transições de horário de verão podem pular ou duplicar uma execução.

**Manada estrondosa (thundering herd).** O cron dispara os jobs `0 * * * *` exatamente no :00 em toda a sua frota. Adicione `RandomizedDelaySec=` para distribuir a carga:

```ini
[Timer]
OnCalendar=hourly
RandomizedDelaySec=300
Persistent=true
```

Isso introduz um jitter de até cinco minutos em cada execução — algo inestimável quando cem hosts batem na mesma API.

**Ambiente e diretório de trabalho.** O ambiente esparso do cron derruba as pessoas; supor um diretório de trabalho também. Seja explícito no service:

```ini
[Service]
Type=oneshot
WorkingDirectory=/opt/app
Environment=PATH=/usr/local/bin:/usr/bin:/bin
EnvironmentFile=-/etc/app/env
ExecStart=/opt/app/run.sh
```

O `-` no início de `EnvironmentFile` significa "não falhe se o arquivo estiver ausente", espelhando o comportamento tolerante do cron.

**Jobs por usuário.** Um crontab de usuário mapeia para uma unit de usuário. Coloque os arquivos em `~/.config/systemd/user/`, habilite com `systemctl --user enable --now myjob.timer` e rode `loginctl enable-linger $USER` para que o timer sobreviva ao logout.

## Verificando a migração

Depois de habilitar, confirme que o timer está armado e inspecione o seu histórico:

```bash
systemctl list-timers --all          # see next/last run for every timer
journalctl -u backup.service --since today   # read the job's output
sudo systemctl start backup.service  # trigger a manual run to test now
```

`systemctl start backup.service` executa o job imediatamente, de forma independente do agendamento — a maneira mais limpa de confirmar que a metade do service funciona antes de confiar no timer.

## Não traduza cada campo na mão

A parte mecânica — transformar cinco campos do cron em uma linha `OnCalendar` e montar o par `.timer`/`.service` — é exatamente o tipo de coisa fácil de errar sutilmente na mão, especialmente com valores de passo, intervalos e casos extremos de dia da semana. Nosso **Cron to systemd Converter** faz isso no navegador: cole uma linha de crontab e obtenha uma unit de timer e de service pronta para editar, com a expressão `OnCalendar` correta e notas de migração, sem nada enviado para lugar nenhum.

[Converta seu crontab para timers do systemd →](/cron-to-systemd)
