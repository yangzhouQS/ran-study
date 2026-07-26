import { invoke } from '@tauri-apps/api/core';

export const testMysqlConnection = (id: number, username: string, password: string) =>
  invoke<boolean>('test_mysql_connection', { id, username, password });
export const saveMysqlCredentials = (id: number, username: string, password: string) =>
  invoke<void>('save_mysql_credentials', { id, username, password });
export const getMysqlCredentials = (id: number) =>
  invoke<[string, string]>('get_mysql_credentials', { id });
export const listMysqlDatabases = (id: number) => invoke<string[]>('list_mysql_databases', { id });
export const createMysqlDatabase = (
  id: number,
  name: string,
  newUser?: string,
  newPassword?: string,
) =>
  invoke<void>('create_mysql_database', {
    id,
    name,
    newUser: newUser ?? null,
    newPassword: newPassword ?? null,
  });
export const changeMysqlPassword = (id: number, targetUser: string, newPassword: string) =>
  invoke<void>('change_mysql_password', { id, targetUser, newPassword });
export const backupMysql = (id: number, db: string, dest?: string) =>
  invoke<string>('backup_mysql', { id, db, dest: dest ?? null });
export const importMysql = (id: number, db: string, src: string) =>
  invoke<void>('import_mysql', { id, db, src });
export const runMysqlQuery = (id: number, sql: string) =>
  invoke<string>('run_mysql_query', { id, sql });
