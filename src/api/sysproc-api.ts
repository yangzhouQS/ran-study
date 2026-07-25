import { invoke } from '@tauri-apps/api/core';
import type { ProcInfo, SvcInfo } from '@/types/api-type';

export const listProcesses = () => invoke<ProcInfo[]>('list_processes');
export const killProcess = (pid: number) => invoke<void>('kill_process', { pid });
export const listServices = () => invoke<SvcInfo[]>('list_services');
export const controlService = (name: string, action: 'start' | 'stop') =>
  invoke<void>('control_service', { name, action });
