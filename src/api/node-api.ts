import { invoke } from '@tauri-apps/api/core';
import type { NodeVersion } from '@/types/api-type';

export const nodeProvisioned = () => invoke<boolean>('node_provisioned');
export const knownNodeVersions = () => invoke<string[]>('known_node_versions');
export const nodeVersionsLocal = () => invoke<NodeVersion[]>('node_versions_local');
export const provisionNvm = () => invoke<void>('provision_nvm');
export const installNode = (version: string) => invoke<void>('install_node', { version });
export const useNode = (version: string) => invoke<void>('use_node', { version });
export const uninstallNode = (version: string) => invoke<void>('uninstall_node', { version });
