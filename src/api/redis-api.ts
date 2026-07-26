import { invoke } from '@tauri-apps/api/core';

export const redisListKeys = (id: number, pw: string) =>
  invoke<string[]>('redis_list_keys', { id, pw });
export const redisAddKey = (id: number, pw: string, key: string, val: string) =>
  invoke<void>('redis_add_key', { id, pw, key, val });
export const redisGetKey = (id: number, pw: string, key: string) =>
  invoke<string>('redis_get_key', { id, pw, key });
export const redisDelKey = (id: number, pw: string, key: string) =>
  invoke<void>('redis_del_key', { id, pw, key });
export const redisRun = (id: number, pw: string, args: string[]) =>
  invoke<string>('redis_run', { id, pw, args });
export const redisRunRemote = (host: string, port: number, pw: string, args: string[]) =>
  invoke<string>('redis_run_remote', { host, port, pw, args });
export const redisChangePassword = (id: number, curPw: string, newPw: string) =>
  invoke<void>('redis_change_password', { id, curPw, newPw });
