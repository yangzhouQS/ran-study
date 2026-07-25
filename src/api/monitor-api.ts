import { invoke } from '@tauri-apps/api/core';
import type { SystemStats } from '@/types/api-type';

export const getSystemStats = () => invoke<SystemStats>('get_system_stats');
