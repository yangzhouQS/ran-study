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
