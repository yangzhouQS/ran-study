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
}
