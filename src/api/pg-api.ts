import { invoke } from '@tauri-apps/api/core';

export const testPgConnection = (id: number, username: string, password: string) =>
  invoke<boolean>('test_pg_connection', { id, username, password });
export const savePgCredentials = (id: number, username: string, password: string) =>
  invoke<void>('save_pg_credentials', { id, username, password });
export const getPgCredentials = (id: number) =>
  invoke<[string, string]>('get_pg_credentials', { id });
export const listPgDatabases = (id: number) => invoke<string[]>('list_pg_databases', { id });
export const createPgDatabase = (id: number, name: string, newUser?: string, newPassword?: string) =>
  invoke<void>('create_pg_database', {
    id,
    name,
    newUser: newUser ?? null,
    newPassword: newPassword ?? null,
  });
export const changePgPassword = (id: number, targetUser: string, newPassword: string) =>
  invoke<void>('change_pg_password', { id, targetUser, newPassword });
export const backupPg = (id: number, db: string, dest?: string) =>
  invoke<string>('backup_pg', { id, db, dest: dest ?? null });
export const importPg = (id: number, db: string, src: string) =>
  invoke<void>('import_pg', { id, db, src });
export const runPgQuery = (id: number, sql: string) =>
  invoke<string>('run_pg_query', { id, sql });
