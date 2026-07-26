export interface SystemInfo {
  rootDir: string;
  initialized: boolean;
}

export interface Settings {
  rootDir: string;
  mirror: string;
  proxy: string;
}

export type TaskStatus = 'Queued' | 'Running' | 'Done' | 'Failed' | 'Cancelled';

export interface Task {
  id: string;
  kind: string;
  target: string;
  status: TaskStatus;
  progress: number;
  message: string;
  logPath: string;
  createdAt: number;
  updatedAt: number;
}

export interface ManifestVersion {
  version: string;
  lts: boolean;
}

export interface SoftwareCatalog {
  id: string;
  versions: ManifestVersion[];
  downloadUrlTemplate: string;
  archive: string;
  mirror: string;
}

export type RunMode = 'Portable' | 'Service';
export type RunStatus = 'Running' | 'Stopped' | 'Unknown';

export interface ControlResult {
  status: RunStatus;
  command: string;
}

export interface InstalledSoftware {
  id: number;
  provider: string;
  version: string;
  installPath: string;
  binPath: string;
  dataPath: string;
  configPath: string;
  port: number;
  runMode: RunMode;
  serviceName: string | null;
  linked?: boolean;
}

export interface NodeVersion {
  version: string;
  active: boolean;
}

export interface Pm2Process {
  name: string;
  pid: number | null;
  status: string;
  cpu: number | null;
  memory: number | null;
}

export interface Pm2App {
  id: number;
  name: string;
  script: string;
  cwd: string;
  nodeVersion: string;
  envJson: string;
  autostart: boolean;
  status: string;
}

export interface ProcInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  user: string;
  command: string;
}

export interface SvcInfo {
  name: string;
  state: string;
  display: string;
}

export interface PortInfo {
  port: number;
  pid: number;
  name: string;
  address: string;
}

export interface DiskInfo {
  name: string;
  mountPoint: string;
  total: number;
  available: number;
}

export interface SystemStats {
  cpu: number;
  memTotal: number;
  memUsed: number;
  disks: DiskInfo[];
  netRx: number;
  netTx: number;
}

export interface ScheduledTask {
  id: number;
  name: string;
  command: string;
  trigger: string;
  enabled: boolean;
}

export interface TerminalOutput {
  sessionId: string;
  data: string;
}

export interface MysqlInstance {
  id: number;
  softwareId: number;
  name: string;
  port: number;
  dataPath: string;
  configPath: string;
  serviceName: string | null;
  status: string;
}

export interface MonitorSample {
  ts: number;
  cpu: number;
  memUsed: number;
  memTotal: number;
  procs: string;
}

export interface DashboardSummary {
  installedSoftware: number;
  mysqlCount: number;
  redisCount: number;
  nodeVersions: number;
  pm2Apps: number;
  scheduledTasks: number;
  runningTasks: number;
  cpu: number;
  memUsed: number;
  memTotal: number;
  uptime: number;
}

export interface LogFile {
  path: string;
  name: string;
  size: number;
}

export interface CustomApp {
  id: number;
  name: string;
  exe: string;
  args: string;
  cwd: string;
  serviceName: string | null;
  pid: number;
  status: string;
}
