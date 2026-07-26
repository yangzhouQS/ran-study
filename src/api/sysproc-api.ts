import { invoke } from '@tauri-apps/api/core';
import type { ProcInfo, SvcInfo } from '@/types/api-type';

export const listProcesses = () => invoke<ProcInfo[]>('list_processes');
export const killProcess = (pid: number, name: string) =>
  invoke<void>('kill_process', { pid, name });
export const listServices = () => invoke<SvcInfo[]>('list_services');
export const controlService = (name: string, action: 'start' | 'stop') =>
  invoke<void>('control_service', { name, action });
export const processProtected = (name: string) => invoke<boolean>('process_protected', { name });
export const serviceProtected = (name: string) => invoke<boolean>('service_protected', { name });
