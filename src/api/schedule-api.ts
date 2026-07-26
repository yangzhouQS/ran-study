import { invoke } from '@tauri-apps/api/core';
import type { ScheduledTask } from '@/types/api-type';

export const listScheduled = () => invoke<ScheduledTask[]>('list_scheduled');
export const createScheduled = (row: Omit<ScheduledTask, 'id' | 'enabled'>) =>
  invoke<number>('create_scheduled', { row });
export const runScheduled = (name: string) => invoke<void>('run_scheduled', { name });
export const toggleScheduled = (name: string, enabled: boolean) =>
  invoke<void>('toggle_scheduled', { name, enabled });
export const deleteScheduled = (id: number, name: string) =>
  invoke<void>('delete_scheduled', { id, name });
export const exportScheduled = (path: string, ids: number[]) =>
  invoke<string>('export_scheduled', { path, ids });
export const importScheduled = (path: string) =>
  invoke<number>('import_scheduled', { path });
