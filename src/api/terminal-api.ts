import { invoke } from '@tauri-apps/api/core';

export const openTerminal = () => invoke<string>('open_terminal');
export const writeTerminal = (sessionId: string, data: string) =>
  invoke<void>('write_terminal', { sessionId, data });
export const closeTerminal = (sessionId: string) =>
  invoke<void>('close_terminal', { sessionId });
