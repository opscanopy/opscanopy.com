/**
 * Systemd Unit Validator — the five example chips.
 *
 * Order is deliberate. The boot seed is what a first-time visitor sees before
 * touching anything, so it has to DEMONSTRATE something: a unit with nothing
 * wrong would leave the results panel with no finding to read and no row to
 * copy. So the planted-issues unit comes first and the clean one second.
 *
 *   1. planted-issues  — 2 errors + 1 warning. WantedBy= in [Unit] (so
 *                        `systemctl enable` does nothing), a typo'd Exec line,
 *                        and the missing [Install] that follows from the first.
 *   2. nginx-forking   — a real forking service, zero findings. Doubles as the
 *                        false-positive gate: its `-g 'daemon on; …'` argument
 *                        carries semicolons INSIDE quotes, which a naive
 *                        end-of-line-comment or shell-syntax check would flag.
 *   3. fstrim-timer    — an fstrim-style calendar timer: no errors, one note
 *                        about the implicit Unit=.
 *   4. user-unit       — carries `scope: 'user'`, because its point (a system
 *                        target in a user unit) only exists in that scope. The
 *                        playground flips its System/User toggle to match.
 *   5. podman-socket   — a socket unit, so the [Socket] table is reachable from
 *                        the chips.
 *
 * `engine.test.ts` pins the findings each of these produces, including the
 * summary line of example 1. Editing an example without updating those
 * assertions fails the suite, which is the point.
 */
import type { SystemdExample } from './types';

export const examples: SystemdExample[] = [
  {
    id: 'planted-issues',
    label: '3 planted issues',
    unit: `[Unit]
Description=Prune old build artifacts
WantedBy=timers.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/prune-artifacts --older-than 30d
ExecStrat=/usr/local/bin/notify-ops prune finished
`,
  },
  {
    id: 'nginx-forking',
    label: 'Clean forking service',
    unit: `[Unit]
Description=nginx HTTP and reverse proxy server
Documentation=https://nginx.org/en/docs/
After=network-online.target nss-lookup.target
Wants=network-online.target

[Service]
Type=forking
PIDFile=/run/nginx.pid
ExecStartPre=/usr/sbin/nginx -t -q -g 'daemon on; master_process on;'
ExecStart=/usr/sbin/nginx -g 'daemon on; master_process on;'
ExecReload=/usr/sbin/nginx -g 'daemon on; master_process on;' -s reload
ExecStop=-/sbin/start-stop-daemon --quiet --stop --retry QUIT/5 --pidfile /run/nginx.pid
TimeoutStopSec=5
KillMode=mixed
PrivateTmp=true

[Install]
WantedBy=multi-user.target
`,
  },
  {
    id: 'fstrim-timer',
    label: 'Weekly timer',
    unit: `[Unit]
Description=Discard unused filesystem blocks once a week
Documentation=man:fstrim(8)

[Timer]
OnCalendar=weekly
AccuracySec=1h
RandomizedDelaySec=6000
Persistent=true

[Install]
WantedBy=timers.target
`,
  },
  {
    id: 'user-unit',
    label: 'User unit',
    scope: 'user',
    unit: `[Unit]
Description=Sync notes to the backup host

[Service]
Type=oneshot
Environment=RSYNC_RSH=ssh
ExecStart=%h/.local/bin/sync-notes

[Install]
WantedBy=multi-user.target
`,
  },
  {
    id: 'podman-socket',
    label: 'Socket unit',
    unit: `[Unit]
Description=Podman API socket
Documentation=man:podman-system-service(1)

[Socket]
ListenStream=%t/podman/podman.sock
SocketMode=0660
Accept=no

[Install]
WantedBy=sockets.target
`,
  },
];
