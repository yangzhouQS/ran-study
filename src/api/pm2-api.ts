import { invoke } from '@tauri-apps/api/core';
import type { Pm2App, Pm2Process } from '@/types/api-type';

export const pm2Installed = () => invoke<boolean>('pm2_installed');
export const ensurePm2 = () => invoke<void>('ensure_pm2');
export const pm2List = () => invoke<Pm2Process[]>('pm2_list');
export const pm2Logs = (name: string, kind: 'out' | 'error', lines: number) =>
  invoke<string>('pm2_logs', { name, kind, lines });
export const pm2Apps = () => invoke<Pm2App[]>('pm2_apps');
export const addPm2App = (row: Omit<Pm2App, 'id' | 'status'>) =>
  invoke<number>('add_pm2_app', { row });
export const stopPm2App = (name: string) => invoke<void>('stop_pm2_app', { name });
export const restartPm2App = (name: string) => invoke<void>('restart_pm2_app', { name });
export const deletePm2App = (id: number, name: string) =>
  invoke<void>('delete_pm2_app_cmd', { id, name });
export const pm2BootEnabled = () => invoke<boolean>('pm2_boot_enabled');
export const pm2BootSet = (enabled: boolean) => invoke<void>('pm2_boot_set', { enabled });
