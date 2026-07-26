import { invoke } from '@tauri-apps/api/core';
import type { LogFile } from '@/types/api-type';

export const listLogFiles = () => invoke<LogFile[]>('list_log_files');
export const readLogFile = (path: string, lines: number) =>
  invoke<string>('read_log_file', { path, lines });
