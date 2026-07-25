import { invoke } from '@tauri-apps/api/core';
import type { Task } from '@/types/api-type';

export const listTasks = () => invoke<Task[]>('list_tasks');
export const createDemoTask = (target: string) =>
  invoke<Task>('create_demo_task', { target });
