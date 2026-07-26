import { invoke } from '@tauri-apps/api/core';
import type { CustomApp } from '@/types/api-type';

export const listCustomApps = () => invoke<CustomApp[]>('list_custom_apps');
export const addCustomApp = (
  name: string,
  exe: string,
  args: string,
  cwd: string,
  serviceMode: boolean,
) =>
  invoke<number>('add_custom_app', { name, exe, args, cwd, serviceMode });
export const startCustomApp = (id: number) => invoke<void>('start_custom_app', { id });
export const stopCustomApp = (id: number) => invoke<void>('stop_custom_app', { id });
export const statusCustomApp = (id: number) => invoke<boolean>('status_custom_app', { id });
export const deleteCustomApp = (id: number) => invoke<void>('delete_custom_app', { id });
