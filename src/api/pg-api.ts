import { invoke } from '@tauri-apps/api/core';

export const listPgDatabases = (id: number) => invoke<string[]>('list_pg_databases', { id });
export const createPgDatabase = (id: number, name: string, password: string | null) =>
  invoke<void>('create_pg_database', { id, name, password });
export const changePgPassword = (id: number, newPassword: string) =>
  invoke<void>('change_pg_password', { id, newPassword });
export const backupPg = (id: number, db: string, dest?: string) =>
  invoke<string>('backup_pg', { id, db, dest: dest ?? null });
export const importPg = (id: number, db: string, src: string) =>
  invoke<void>('import_pg', { id, db, src });
export const runPgQuery = (id: number, sql: string) =>
  invoke<string>('run_pg_query', { id, sql });
