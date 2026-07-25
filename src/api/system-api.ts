import { invoke } from '@tauri-apps/api/core';
import type { Settings, SystemInfo } from '@/types/api-type';

export const getSystemInfo = () => invoke<SystemInfo>('get_system_info');
export const initRoot = () => invoke<void>('init_root');
export const getSettings = () => invoke<Settings>('get_settings');
export const setRootDir = (rootDir: string) =>
  invoke<void>('set_root_dir', { rootDir });
