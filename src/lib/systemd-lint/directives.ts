/**
 * The directive tables — what this validator knows, per section.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  TWO TABLES, TWO JOBS                                                    │
 * │                                                                          │
 * │  1. `SECTION_TABLES` — the directives each CHECKED section accepts, with  │
 * │     a value kind. Used for value validation and for "is this name known   │
 * │     HERE?".                                                              │
 * │  2. `DIRECTIVE_SECTIONS` — every directive name in the whole of systemd    │
 * │     this file knows about, mapped to the section(s) that own it,           │
 * │     including sections whose values are NOT checked ([Mount], [Path],     │
 * │     [Swap], [Automount], [Slice], [Scope]). That is what turns "unknown   │
 * │     here" into the far more useful "User= belongs in [Service], not       │
 * │     [Unit]".                                                             │
 * │                                                                          │
 * │  VALUE VALIDATION IS DELIBERATELY CONSERVATIVE                           │
 * │                                                                          │
 * │  A directive is only marked `enum` when systemd parses it with a plain    │
 * │  string table and NO boolean fallback. `ProtectSystem=` and               │
 * │  `ProtectHome=` take named values *or* a boolean, and `RestrictNamespaces=`│
 * │  takes a boolean or a namespace list — flagging a legal value there would │
 * │  be exactly the cry-wolf failure this tool exists to avoid, so they are   │
 * │  carried as opaque strings instead. Same reasoning for time spans, paths  │
 * │  and unit names: `5min`, `/var/lib/x` and `network.target` are checked by  │
 * │  the rules that care, not by a blanket pattern.                          │
 * │                                                                          │
 * │  CASE MATTERS, ASYMMETRICALLY                                            │
 * │                                                                          │
 * │  systemd compares directive NAMES and ENUM values case-sensitively, but   │
 * │  BOOLEANS case-insensitively (`parse_boolean` uses a case-insensitive     │
 * │  compare). So `Type=Simple` is discarded while `Persistent=True` works,   │
 * │  and this file encodes that difference rather than smoothing it over.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/** How a value is checked, if at all. */
export type ValueKind = 'string' | 'bool' | 'enum' | 'exec' | 'calendar';

export interface DirectiveSpec {
  kind: ValueKind;
  /** True when repeating the directive APPENDS instead of replacing. */
  list?: boolean;
  /** Allowed values for `kind: 'enum'` — compared case-sensitively. */
  values?: readonly string[];
  /** How systemd names this setting in its own "Failed to parse …" log line. */
  logLabel?: string;
  /** Present when systemd still accepts the name but has moved on. */
  deprecated?: string;
}

/* ────────────────────────────────────────────────────────────────────────
 * Shorthand builders — the tables below are data, and stay readable.
 * ──────────────────────────────────────────────────────────────────────── */

const S: DirectiveSpec = { kind: 'string' };
const L: DirectiveSpec = { kind: 'string', list: true };
const B: DirectiveSpec = { kind: 'bool' };
const X: DirectiveSpec = { kind: 'exec', list: true };

function enumOf(values: readonly string[], logLabel: string): DirectiveSpec {
  return { kind: 'enum', values, logLabel };
}

function deprecated(note: string, base: DirectiveSpec = S): DirectiveSpec {
  return { ...base, deprecated: note };
}

/** Every directive whose value is one of a fixed set of names. */
const TYPE_VALUES = [
  'simple',
  'exec',
  'forking',
  'oneshot',
  'dbus',
  'notify',
  'notify-reload',
  'idle',
] as const;

const RESTART_VALUES = [
  'no',
  'on-success',
  'on-failure',
  'on-abnormal',
  'on-watchdog',
  'on-abort',
  'always',
] as const;

const ACTION_VALUES = [
  'none',
  'reboot',
  'reboot-force',
  'reboot-immediate',
  'poweroff',
  'poweroff-force',
  'poweroff-immediate',
  'soft-reboot',
  'soft-reboot-force',
  'kexec',
  'kexec-force',
  'halt',
  'halt-force',
  'halt-immediate',
  'exit',
  'exit-force',
] as const;

/* ────────────────────────────────────────────────────────────────────────
 * [Unit]
 * ──────────────────────────────────────────────────────────────────────── */

const CONDITION_NAMES = [
  'Architecture',
  'Virtualization',
  'Host',
  'KernelCommandLine',
  'KernelVersion',
  'Credential',
  'Environment',
  'Security',
  'Capability',
  'ACPower',
  'NeedsUpdate',
  'FirstBoot',
  'PathExists',
  'PathExistsGlob',
  'PathIsDirectory',
  'PathIsSymbolicLink',
  'PathIsMountPoint',
  'PathIsReadWrite',
  'PathIsEncrypted',
  'DirectoryNotEmpty',
  'FileNotEmpty',
  'FileIsExecutable',
  'User',
  'Group',
  'ControlGroupController',
  'Memory',
  'CPUs',
  'CPUFeature',
  'OSRelease',
  'MemoryPressure',
  'CPUPressure',
  'IOPressure',
] as const;

/** `ConditionX=` and `AssertX=` are both lists and both repeat-append. */
function conditionEntries(): Record<string, DirectiveSpec> {
  const out: Record<string, DirectiveSpec> = {};
  for (const name of CONDITION_NAMES) {
    out[`Condition${name}`] = L;
    out[`Assert${name}`] = L;
  }
  return out;
}

const UNIT_DIRECTIVES: Record<string, DirectiveSpec> = {
  Description: S,
  Documentation: L,
  Wants: L,
  Requires: L,
  Requisite: L,
  BindsTo: L,
  PartOf: L,
  Upholds: L,
  Conflicts: L,
  Before: L,
  After: L,
  OnFailure: L,
  OnSuccess: L,
  OnFailureJobMode: S,
  OnFailureIsolate: deprecated('Use `OnFailureJobMode=isolate` instead.', B),
  PropagatesReloadTo: L,
  ReloadPropagatedFrom: L,
  PropagatesStopTo: L,
  StopPropagatedFrom: L,
  JoinsNamespaceOf: L,
  RequiresMountsFor: L,
  WantsMountsFor: L,
  StopWhenUnneeded: B,
  RefuseManualStart: B,
  RefuseManualStop: B,
  AllowIsolate: B,
  DefaultDependencies: B,
  SurviveFinalKillSignal: B,
  CollectMode: enumOf(['inactive', 'inactive-or-failed'], 'garbage collection mode'),
  FailureAction: enumOf(ACTION_VALUES, 'emergency action'),
  SuccessAction: enumOf(ACTION_VALUES, 'emergency action'),
  FailureActionExitStatus: S,
  SuccessActionExitStatus: S,
  JobTimeoutSec: S,
  JobRunningTimeoutSec: S,
  JobTimeoutAction: enumOf(ACTION_VALUES, 'emergency action'),
  JobTimeoutRebootArgument: S,
  StartLimitIntervalSec: S,
  StartLimitBurst: S,
  StartLimitAction: enumOf(ACTION_VALUES, 'emergency action'),
  RebootArgument: S,
  SourcePath: S,
  IgnoreOnIsolate: B,
  ...conditionEntries(),
};

/* ────────────────────────────────────────────────────────────────────────
 * [Install]
 * ──────────────────────────────────────────────────────────────────────── */

const INSTALL_DIRECTIVES: Record<string, DirectiveSpec> = {
  Alias: L,
  WantedBy: L,
  RequiredBy: L,
  UpheldBy: L,
  Also: L,
  DefaultInstance: S,
};

/* ────────────────────────────────────────────────────────────────────────
 * Shared execution environment — systemd.exec(5). Valid in [Service],
 * [Socket], [Mount] and [Swap].
 * ──────────────────────────────────────────────────────────────────────── */

const EXEC_DIRECTIVES: Record<string, DirectiveSpec> = {
  User: S,
  Group: S,
  SupplementaryGroups: L,
  SetLoginEnvironment: B,
  DynamicUser: B,
  WorkingDirectory: S,
  RootDirectory: S,
  RootImage: S,
  RootImageOptions: L,
  RootHash: S,
  RootHashSignature: S,
  RootVerity: S,
  MountAPIVFS: B,
  ProtectSystem: S,
  ProtectHome: S,
  ProtectProc: enumOf(['noaccess', 'invisible', 'ptraceable', 'default'], 'protect proc value'),
  ProcSubset: enumOf(['all', 'pid'], 'proc subset value'),
  ReadWritePaths: L,
  ReadOnlyPaths: L,
  InaccessiblePaths: L,
  ExecPaths: L,
  NoExecPaths: L,
  TemporaryFileSystem: L,
  // NOT a plain boolean: systemd 257 added `PrivateTmp=disconnected`. Marking it
  // `bool` would report a legal value as an error, which is precisely the
  // cry-wolf failure this table is written to avoid.
  PrivateTmp: S,
  PrivateDevices: B,
  PrivateNetwork: B,
  NetworkNamespacePath: S,
  PrivateIPC: B,
  IPCNamespacePath: S,
  PrivateUsers: S,
  PrivateMounts: B,
  ProtectClock: B,
  ProtectKernelTunables: B,
  ProtectKernelModules: B,
  ProtectKernelLogs: B,
  ProtectControlGroups: S,
  ProtectHostname: S,
  RestrictAddressFamilies: L,
  RestrictNamespaces: S,
  RestrictRealtime: B,
  RestrictSUIDSGID: B,
  LockPersonality: B,
  MemoryDenyWriteExecute: B,
  SystemCallFilter: L,
  SystemCallErrorNumber: S,
  SystemCallArchitectures: L,
  SystemCallLog: L,
  CapabilityBoundingSet: L,
  AmbientCapabilities: L,
  NoNewPrivileges: B,
  SecureBits: L,
  SELinuxContext: S,
  AppArmorProfile: S,
  SmackProcessLabel: S,
  KeyringMode: enumOf(['inherit', 'private', 'shared'], 'keyring mode'),
  UMask: S,
  Environment: L,
  EnvironmentFile: L,
  PassEnvironment: L,
  UnsetEnvironment: L,
  StandardInput: S,
  StandardOutput: S,
  StandardError: S,
  StandardInputText: L,
  StandardInputData: L,
  TTYPath: S,
  TTYReset: B,
  TTYVHangup: B,
  TTYVTDisallocate: B,
  TTYRows: S,
  TTYColumns: S,
  SyslogIdentifier: S,
  SyslogFacility: S,
  SyslogLevel: S,
  SyslogLevelPrefix: B,
  LogLevelMax: S,
  LogExtraFields: L,
  LogRateLimitIntervalSec: S,
  LogRateLimitBurst: S,
  LogFilterPatterns: L,
  LogNamespace: S,
  Nice: S,
  CPUSchedulingPolicy: S,
  CPUSchedulingPriority: S,
  CPUSchedulingResetOnFork: B,
  CPUAffinity: L,
  NUMAPolicy: S,
  NUMAMask: S,
  IOSchedulingClass: S,
  IOSchedulingPriority: S,
  OOMScoreAdjust: S,
  CoredumpFilter: L,
  TimerSlackNSec: S,
  Personality: S,
  IgnoreSIGPIPE: B,
  LimitCPU: S,
  LimitFSIZE: S,
  LimitDATA: S,
  LimitSTACK: S,
  LimitCORE: S,
  LimitRSS: S,
  LimitNOFILE: S,
  LimitAS: S,
  LimitNPROC: S,
  LimitMEMLOCK: S,
  LimitLOCKS: S,
  LimitSIGPENDING: S,
  LimitMSGQUEUE: S,
  LimitNICE: S,
  LimitRTPRIO: S,
  LimitRTTIME: S,
  StateDirectory: L,
  RuntimeDirectory: L,
  CacheDirectory: L,
  LogsDirectory: L,
  ConfigurationDirectory: L,
  StateDirectoryMode: S,
  RuntimeDirectoryMode: S,
  CacheDirectoryMode: S,
  LogsDirectoryMode: S,
  ConfigurationDirectoryMode: S,
  RuntimeDirectoryPreserve: S,
  BindPaths: L,
  BindReadOnlyPaths: L,
  MountFlags: S,
  MountImages: L,
  ExtensionDirectories: L,
  ExtensionImages: L,
  ImportCredential: L,
  LoadCredential: L,
  LoadCredentialEncrypted: L,
  SetCredential: L,
  SetCredentialEncrypted: L,
  Capabilities: deprecated('Removed from systemd; use `CapabilityBoundingSet=` and `AmbientCapabilities=`.'),
};

/* ────────────────────────────────────────────────────────────────────────
 * Shared resource control — systemd.resource-control(5).
 * ──────────────────────────────────────────────────────────────────────── */

const CGROUP_V1_NOTE =
  'It is a cgroup v1 name. On a cgroup v2 host (every current distribution) systemd maps or ignores it';

const RESOURCE_DIRECTIVES: Record<string, DirectiveSpec> = {
  Slice: S,
  Delegate: S,
  DelegateSubgroup: S,
  DisableControllers: L,
  CPUAccounting: B,
  CPUWeight: S,
  StartupCPUWeight: S,
  CPUQuota: S,
  CPUQuotaPeriodSec: S,
  AllowedCPUs: S,
  StartupAllowedCPUs: S,
  AllowedMemoryNodes: S,
  StartupAllowedMemoryNodes: S,
  MemoryAccounting: B,
  MemoryMin: S,
  MemoryLow: S,
  MemoryHigh: S,
  MemoryMax: S,
  MemorySwapMax: S,
  MemoryZSwapMax: S,
  TasksAccounting: B,
  TasksMax: S,
  IOAccounting: B,
  IOWeight: S,
  StartupIOWeight: S,
  IODeviceWeight: L,
  IOReadBandwidthMax: L,
  IOWriteBandwidthMax: L,
  IOReadIOPSMax: L,
  IOWriteIOPSMax: L,
  IODeviceLatencyTargetSec: L,
  IPAccounting: B,
  IPAddressAllow: L,
  IPAddressDeny: L,
  IPIngressFilterPath: L,
  IPEgressFilterPath: L,
  DeviceAllow: L,
  DevicePolicy: enumOf(['auto', 'closed', 'strict'], 'device policy'),
  ManagedOOMSwap: enumOf(['auto', 'kill'], 'managed OOM mode'),
  ManagedOOMMemoryPressure: enumOf(['auto', 'kill'], 'managed OOM mode'),
  ManagedOOMMemoryPressureLimit: S,
  ManagedOOMPreference: enumOf(['none', 'avoid', 'omit'], 'managed OOM preference'),
  CPUShares: deprecated(`${CGROUP_V1_NOTE} — use \`CPUWeight=\`.`),
  StartupCPUShares: deprecated(`${CGROUP_V1_NOTE} — use \`StartupCPUWeight=\`.`),
  MemoryLimit: deprecated(`${CGROUP_V1_NOTE} — use \`MemoryMax=\`.`),
  BlockIOAccounting: deprecated(`${CGROUP_V1_NOTE} — use \`IOAccounting=\`.`, B),
  BlockIOWeight: deprecated(`${CGROUP_V1_NOTE} — use \`IOWeight=\`.`),
  StartupBlockIOWeight: deprecated(`${CGROUP_V1_NOTE} — use \`StartupIOWeight=\`.`),
  BlockIODeviceWeight: deprecated(`${CGROUP_V1_NOTE} — use \`IODeviceWeight=\`.`, L),
  BlockIOReadBandwidth: deprecated(`${CGROUP_V1_NOTE} — use \`IOReadBandwidthMax=\`.`, L),
  BlockIOWriteBandwidth: deprecated(`${CGROUP_V1_NOTE} — use \`IOWriteBandwidthMax=\`.`, L),
};

/** Shared kill settings — systemd.kill(5). */
const KILL_DIRECTIVES: Record<string, DirectiveSpec> = {
  KillMode: enumOf(['control-group', 'mixed', 'process', 'none'], 'kill mode'),
  KillSignal: S,
  RestartKillSignal: S,
  SendSIGHUP: B,
  SendSIGKILL: B,
  FinalKillSignal: S,
  WatchdogSignal: S,
};

/* ────────────────────────────────────────────────────────────────────────
 * [Service], [Timer], [Socket]
 * ──────────────────────────────────────────────────────────────────────── */

const SERVICE_DIRECTIVES: Record<string, DirectiveSpec> = {
  ...EXEC_DIRECTIVES,
  ...RESOURCE_DIRECTIVES,
  ...KILL_DIRECTIVES,
  Type: enumOf(TYPE_VALUES, 'service type'),
  ExitType: enumOf(['main', 'cgroup'], 'service exit type'),
  RemainAfterExit: B,
  GuessMainPID: B,
  PIDFile: S,
  BusName: S,
  ExecStart: X,
  ExecStartPre: X,
  ExecStartPost: X,
  ExecCondition: X,
  ExecReload: X,
  ExecStop: X,
  ExecStopPost: X,
  RestartSec: S,
  RestartSteps: S,
  RestartMaxDelaySec: S,
  RestartMode: enumOf(['normal', 'direct'], 'service restart mode'),
  TimeoutStartSec: S,
  TimeoutStopSec: S,
  TimeoutAbortSec: S,
  TimeoutSec: S,
  TimeoutStartFailureMode: enumOf(['terminate', 'abort', 'kill'], 'timeout failure mode'),
  TimeoutStopFailureMode: enumOf(['terminate', 'abort', 'kill'], 'timeout failure mode'),
  RuntimeMaxSec: S,
  RuntimeRandomizedExtraSec: S,
  WatchdogSec: S,
  Restart: enumOf(RESTART_VALUES, 'service restart specifier'),
  RestartPreventExitStatus: L,
  RestartForceExitStatus: L,
  SuccessExitStatus: L,
  RootDirectoryStartOnly: B,
  NonBlocking: B,
  NotifyAccess: enumOf(['none', 'main', 'exec', 'all'], 'notify access specifier'),
  Sockets: L,
  FileDescriptorStoreMax: S,
  FileDescriptorStorePreserve: S,
  USBFunctionDescriptors: S,
  USBFunctionStrings: S,
  OOMPolicy: enumOf(['continue', 'stop', 'kill'], 'OOM policy'),
  OpenFile: L,
  ReloadSignal: S,
  PermissionsStartOnly: deprecated(
    'Use the “+” prefix on the individual Exec* line that needs full privileges instead.',
    B,
  ),
  // systemd 229 moved the start-rate-limit and emergency-action settings from
  // [Service] to [Unit], but load-fragment-gperf.gperf.in still carries a
  // `Service.` entry for each of these five — upstream `docker.service` ships
  // `StartLimitBurst=` in [Service] on purpose. Calling that "wrong-section, has
  // no effect at all" was a false error on a working unit, and the fix would have
  // been a no-op. NOTE the two that are NOT aliased: `StartLimitIntervalSec=` and
  // `SuccessAction=` have no `Service.` entry, so those stay wrong-section errors.
  StartLimitInterval: deprecated(
    'It moved to [Unit] as `StartLimitIntervalSec=`; systemd still reads it here for compatibility.',
  ),
  StartLimitBurst: deprecated('It moved to [Unit]; systemd still reads it here for compatibility.'),
  StartLimitAction: deprecated(
    'It moved to [Unit]; systemd still reads it here for compatibility.',
    enumOf(ACTION_VALUES, 'emergency action'),
  ),
  FailureAction: deprecated(
    'It moved to [Unit]; systemd still reads it here for compatibility.',
    enumOf(ACTION_VALUES, 'emergency action'),
  ),
  RebootArgument: deprecated('It moved to [Unit]; systemd still reads it here for compatibility.'),
  SysVStartPriority: deprecated('A SysV compatibility leftover with no effect on a native unit.'),
};

const TIMER_DIRECTIVES: Record<string, DirectiveSpec> = {
  OnCalendar: { kind: 'calendar', list: true },
  OnActiveSec: L,
  OnBootSec: L,
  OnStartupSec: L,
  OnUnitActiveSec: L,
  OnUnitInactiveSec: L,
  OnClockChange: B,
  OnTimezoneChange: B,
  AccuracySec: S,
  RandomizedDelaySec: S,
  RandomizedOffsetSec: S,
  FixedRandomDelay: B,
  Persistent: B,
  WakeSystem: B,
  RemainAfterElapse: B,
  DeferReactivation: B,
  Unit: S,
};

const SOCKET_DIRECTIVES: Record<string, DirectiveSpec> = {
  ...EXEC_DIRECTIVES,
  ...RESOURCE_DIRECTIVES,
  ...KILL_DIRECTIVES,
  ListenStream: L,
  ListenDatagram: L,
  ListenSequentialPacket: L,
  ListenFIFO: L,
  ListenSpecial: L,
  ListenNetlink: L,
  ListenMessageQueue: L,
  ListenUSBFunction: L,
  SocketProtocol: S,
  BindIPv6Only: S,
  Backlog: S,
  BindToDevice: S,
  SocketUser: S,
  SocketGroup: S,
  SocketMode: S,
  DirectoryMode: S,
  Accept: B,
  Writable: B,
  FlushPending: B,
  MaxConnections: S,
  MaxConnectionsPerSource: S,
  KeepAlive: B,
  KeepAliveTimeSec: S,
  KeepAliveIntervalSec: S,
  KeepAliveProbes: S,
  NoDelay: B,
  Priority: S,
  DeferAcceptSec: S,
  ReceiveBuffer: S,
  SendBuffer: S,
  IPTOS: S,
  IPTTL: S,
  Mark: S,
  ReusePort: B,
  SmackLabel: S,
  SmackLabelIPIn: S,
  SmackLabelIPOut: S,
  SELinuxContextFromNet: B,
  PipeSize: S,
  MessageQueueMaxMessages: S,
  MessageQueueMessageSize: S,
  FreeBind: B,
  Transparent: B,
  Broadcast: B,
  PassCredentials: B,
  PassSecurity: B,
  PassPacketInfo: B,
  PassFileDescriptorsToExec: B,
  TCPCongestion: S,
  ExecStartPre: X,
  ExecStartPost: X,
  ExecStopPre: X,
  ExecStopPost: X,
  TimeoutSec: S,
  Service: S,
  RemoveOnStop: B,
  Symlinks: L,
  FileDescriptorName: S,
  TriggerLimitIntervalSec: S,
  TriggerLimitBurst: S,
  PollLimitIntervalSec: S,
  PollLimitBurst: S,
};

/* ────────────────────────────────────────────────────────────────────────
 * Sections whose VALUES are not checked, but whose directive NAMES are
 * still known — so a directive written in the wrong section can be named.
 * ──────────────────────────────────────────────────────────────────────── */

const MOUNT_ONLY = [
  'What',
  'Where',
  'Type',
  'Options',
  'SloppyOptions',
  'LazyUnmount',
  'ReadWriteOnly',
  'ForceUnmount',
  'DirectoryMode',
  'TimeoutSec',
] as const;

const AUTOMOUNT_ONLY = ['Where', 'ExtraOptions', 'DirectoryMode', 'TimeoutIdleSec'] as const;

const PATH_ONLY = [
  'PathExists',
  'PathExistsGlob',
  'PathChanged',
  'PathModified',
  'DirectoryNotEmpty',
  'Unit',
  'MakeDirectory',
  'DirectoryMode',
  'TriggerLimitIntervalSec',
  'TriggerLimitBurst',
] as const;

const SWAP_ONLY = ['What', 'Priority', 'Options', 'TimeoutSec'] as const;

/* ────────────────────────────────────────────────────────────────────────
 * The public surface
 * ──────────────────────────────────────────────────────────────────────── */

/** Sections whose directives this validator checks name-by-name and value-by-value. */
export const CHECKED_SECTIONS = ['Unit', 'Install', 'Service', 'Timer', 'Socket'] as const;

/**
 * Sections systemd knows that this validator deliberately does not check
 * directive-by-directive. Their names are still known (so `What=` in [Service]
 * can be attributed), and a unit using one gets a note saying so out loud.
 */
export const UNCHECKED_SECTIONS = ['Mount', 'Automount', 'Path', 'Swap', 'Slice', 'Scope'] as const;

/** Every section name systemd itself accepts in a unit file. */
export const KNOWN_SECTIONS: readonly string[] = [...CHECKED_SECTIONS, ...UNCHECKED_SECTIONS];

/** Directive table per checked section. */
export const SECTION_TABLES: Record<string, Record<string, DirectiveSpec>> = {
  Unit: UNIT_DIRECTIVES,
  Install: INSTALL_DIRECTIVES,
  Service: SERVICE_DIRECTIVES,
  Timer: TIMER_DIRECTIVES,
  Socket: SOCKET_DIRECTIVES,
};

/**
 * Directive name → every section that accepts it, in the order the sections are
 * listed above. Built from the tables (plus the unchecked sections' own names),
 * so it can never drift out of step with them.
 */
export const DIRECTIVE_SECTIONS: Map<string, string[]> = (() => {
  const map = new Map<string, string[]>();
  const add = (name: string, section: string) => {
    const list = map.get(name);
    if (list) {
      if (!list.includes(section)) list.push(section);
    } else {
      map.set(name, [section]);
    }
  };
  for (const section of CHECKED_SECTIONS) {
    for (const name of Object.keys(SECTION_TABLES[section])) add(name, section);
  }
  for (const name of MOUNT_ONLY) add(name, 'Mount');
  for (const name of AUTOMOUNT_ONLY) add(name, 'Automount');
  for (const name of PATH_ONLY) add(name, 'Path');
  for (const name of SWAP_ONLY) add(name, 'Swap');
  // [Slice] and [Scope] only take resource-control settings, which [Service]
  // already owns — nothing new to add, and attributing a cgroup directive to
  // [Slice] instead of [Service] would send people to the wrong file.
  return map;
})();

/** Every directive name this file knows about, in table order. */
export const ALL_DIRECTIVE_NAMES: readonly string[] = [...DIRECTIVE_SECTIONS.keys()];

/** The spec for `name` in `section`, or `undefined` when it does not belong there. */
export function specFor(section: string, name: string): DirectiveSpec | undefined {
  const table = SECTION_TABLES[section];
  return table ? table[name] : undefined;
}

/** True when repeating `name` in `section` appends rather than replaces. */
export function isListDirective(section: string, name: string): boolean {
  return specFor(section, name)?.list === true;
}

/** The values systemd accepts for a boolean, exactly as `parse_boolean` does. */
const TRUE_WORDS = new Set(['1', 'yes', 'y', 'true', 't', 'on']);
const FALSE_WORDS = new Set(['0', 'no', 'n', 'false', 'f', 'off']);

/** `true`/`false` for a boolean systemd would accept, `null` for one it would not. */
export function parseBooleanValue(value: string): boolean | null {
  const lower = value.trim().toLowerCase();
  if (TRUE_WORDS.has(lower)) return true;
  if (FALSE_WORDS.has(lower)) return false;
  return null;
}

/** The `Listen*` directives — a [Socket] needs at least one of them. */
export const LISTEN_DIRECTIVES: readonly string[] = [
  'ListenStream',
  'ListenDatagram',
  'ListenSequentialPacket',
  'ListenFIFO',
  'ListenSpecial',
  'ListenNetlink',
  'ListenMessageQueue',
  'ListenUSBFunction',
];

/** The [Timer] directives that actually make a timer fire. */
export const TIMER_TRIGGERS: readonly string[] = [
  'OnCalendar',
  'OnActiveSec',
  'OnBootSec',
  'OnStartupSec',
  'OnUnitActiveSec',
  'OnUnitInactiveSec',
  'OnClockChange',
  'OnTimezoneChange',
];

/** Every `Exec*` directive, for the path and shell-syntax rules. */
export const EXEC_DIRECTIVE_NAMES: readonly string[] = [
  'ExecStart',
  'ExecStartPre',
  'ExecStartPost',
  'ExecCondition',
  'ExecReload',
  'ExecStop',
  'ExecStopPre',
  'ExecStopPost',
];

/**
 * The `%` specifiers systemd expands in unit values, per systemd.unit(5)
 * "SPECIFIERS". Anything else after a `%` is not expanded, and systemd fails to
 * resolve the value rather than passing it through — hence the rule.
 */
export const KNOWN_SPECIFIERS: readonly string[] = [
  'a',
  'A',
  'b',
  'B',
  'C',
  'd',
  'D',
  'E',
  'f',
  'g',
  'G',
  'h',
  'H',
  'i',
  'I',
  'j',
  'J',
  'l',
  'L',
  'm',
  'M',
  'n',
  'N',
  'o',
  'p',
  'P',
  'q',
  's',
  'S',
  't',
  'T',
  'u',
  'U',
  'v',
  'V',
  'w',
  'W',
  'y',
  'Y',
  '%',
];

/** Specifiers that only mean something in a template (`name@.service`) unit. */
export const INSTANCE_SPECIFIERS: readonly string[] = ['i', 'I', 'j', 'J', 'p', 'P', 'f'];
