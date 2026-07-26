import { invoke } from '@tauri-apps/api/core';
import type { DashboardSummary, MonitorSample, ProcInfo, SystemStats } from '@/types/api-type';

export const getSystemStats = () => invoke<SystemStats>('get_system_stats');
export const dashboardSummary = () => invoke<DashboardSummary>('dashboard_summary');
export const listMonitorHistory = (hours: number) =>
  invoke<MonitorSample[]>('list_monitor_history', { hours });
export const clearMonitorHistory = () => invoke<void>('clear_monitor_history');
export const topProcesses = (n: number) => invoke<ProcInfo[]>('top_processes', { n });
