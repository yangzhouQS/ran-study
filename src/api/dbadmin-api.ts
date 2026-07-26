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

import type { MysqlInstance, RunMode } from '@/types/api-type';

export const listMysqlInstances = (id: number) =>
  invoke<MysqlInstance[]>('list_mysql_instances', { id });
export const createMysqlInstance = (
  id: number,
  name: string,
  port: number,
  runMode: RunMode,
) => invoke<number>('create_mysql_instance', { id, name, port, runMode });
export const startMysqlInstance = (id: number, instId: number) =>
  invoke<void>('start_mysql_instance', { id, instId });
export const stopMysqlInstance = (id: number, instId: number) =>
  invoke<void>('stop_mysql_instance', { id, instId });
export const statusMysqlInstance = (id: number, instId: number) =>
  invoke<boolean>('status_mysql_instance', { id, instId });
export const deleteMysqlInstance = (id: number, instId: number) =>
  invoke<void>('delete_mysql_instance', { id, instId });
