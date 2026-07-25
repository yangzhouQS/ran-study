import { invoke } from '@tauri-apps/api/core';
import type {
  InstalledSoftware,
  RunMode,
  RunStatus,
  SoftwareCatalog,
} from '@/types/api-type';

export const listCatalog = () => invoke<SoftwareCatalog[]>('list_catalog');
export const listInstalled = () => invoke<InstalledSoftware[]>('list_installed');
export const installSoftware = (provider: string, version: string, runMode: RunMode) =>
  invoke<string>('install_software', { provider, version, runMode });
export const controlSoftware = (id: number, action: 'start' | 'stop' | 'status') =>
  invoke<RunStatus>('control_software', { id, action });
export const uninstallSoftware = (id: number) => invoke<void>('uninstall_software', { id });
