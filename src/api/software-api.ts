import { invoke } from '@tauri-apps/api/core';
import type {
  ControlResult,
  InstalledSoftware,
  RunMode,
  SoftwareCatalog,
} from '@/types/api-type';

export const listCatalog = () => invoke<SoftwareCatalog[]>('list_catalog');
export const listInstalled = () => invoke<InstalledSoftware[]>('list_installed');
export const checkAllStatus = () => invoke<[number, boolean][]>('check_all_status');
export const installSoftware = (provider: string, version: string, runMode: RunMode) =>
  invoke<string>('install_software', { provider, version, runMode });
export const linkSoftware = (params: {
  provider: string;
  installPath: string;
  version?: string;
  binPath?: string;
  configPath?: string;
  port?: number;
  dataPath?: string;
  serviceName?: string;
  runMode: RunMode;
}) => invoke<number>('link_software', params);
export const updateSoftware = (params: {
  id: number;
  version: string;
  installPath: string;
  binPath: string;
  configPath: string;
  dataPath: string;
  port: number;
  serviceName: string | null;
  runMode: RunMode;
}) => invoke<void>('update_software', params);
export const controlSoftware = (id: number, action: 'start' | 'stop' | 'restart' | 'status') =>
  invoke<ControlResult>('control_software', { id, action });
export const uninstallSoftware = (id: number) => invoke<void>('uninstall_software', { id });
export const readSoftwareConfig = (id: number) =>
  invoke<string>('read_software_config', { id });
export const writeSoftwareConfig = (id: number, content: string) =>
  invoke<void>('write_software_config', { id, content });
