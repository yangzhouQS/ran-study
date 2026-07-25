import { invoke } from '@tauri-apps/api/core';

export const listMysqlDatabases = (id: number) =>
  invoke<string[]>('list_mysql_databases', { id });
export const createMysqlDatabase = (id: number, name: string, password: string | null) =>
  invoke<void>('create_mysql_database', { id, name, password });
export const changeRootPassword = (id: number, newPassword: string) =>
  invoke<void>('change_root_password', { id, newPassword });
export const backupMysql = (id: number, db: string, dest?: string) =>
  invoke<string>('backup_mysql', { id, db, dest: dest ?? null });
export const importMysql = (id: number, db: string, src: string) =>
  invoke<void>('import_mysql', { id, db, src });
export const runMysqlQuery = (id: number, sql: string) =>
  invoke<string>('run_mysql_query', { id, sql });
