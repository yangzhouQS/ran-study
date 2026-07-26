import { invoke } from '@tauri-apps/api/core';

export const readTextFile = (path: string) => invoke<string>('read_text_file', { path });
export const writeTextFile = (path: string, content: string) =>
  invoke<void>('write_text_file', { path, content });
