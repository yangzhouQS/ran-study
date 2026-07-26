use super::AppState;
use crate::error::RanResult;
use crate::monitor::{self, SystemStats};
use crate::nvm;
use crate::repo::MonitorSampleRow;
use crate::sysproc::{self, ProcInfo};
use serde::Serialize;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn get_system_stats() -> RanResult<SystemStats> {
    Ok(monitor::snapshot())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSummary {
    pub installed_software: usize,
    pub mysql_count: usize,
    pub redis_count: usize,
    pub node_versions: usize,
    pub pm2_apps: usize,
    pub scheduled_tasks: usize,
    pub running_tasks: usize,
    pub cpu: f32,
    pub mem_used: u64,
    pub mem_total: u64,
    pub uptime: u64,
}

#[tauri::command]
pub fn dashboard_summary(state: State<'_, Arc<AppState>>) -> RanResult<DashboardSummary> {
    let sw = state.repo.list_software().unwrap_or_default();
    let mysql_count = sw.iter().filter(|s| s.provider == "mysql").count();
    let redis_count = sw.iter().filter(|s| s.provider == "redis").count();
    let node_versions = nvm::list_local(&state.root).unwrap_or_default().len();
    let pm2_apps = state.repo.list_pm2_apps().unwrap_or_default().len();
    let scheduled_tasks = state.repo.list_scheduled().unwrap_or_default().len();
    let running_tasks = state
        .tasks
        .list()
        .iter()
        .filter(|t| {
            matches!(
                t.status,
                crate::task::model::TaskStatus::Running | crate::task::model::TaskStatus::Queued
            )
        })
        .count();
    let stats = monitor::snapshot();
    let uptime = sysinfo::System::uptime();
    Ok(DashboardSummary {
        installed_software: sw.len(),
        mysql_count,
        redis_count,
        node_versions,
        pm2_apps,
        scheduled_tasks,
        running_tasks,
        cpu: stats.cpu,
        mem_used: stats.mem_used,
        mem_total: stats.mem_total,
        uptime,
    })
}

#[tauri::command]
pub fn list_monitor_history(
    state: State<'_, Arc<AppState>>,
    hours: i64,
) -> RanResult<Vec<MonitorSampleRow>> {
    let since = chrono::Utc::now().timestamp() - hours * 3600;
    state.repo.list_monitor_since(since)
}

#[tauri::command]
pub fn clear_monitor_history(state: State<'_, Arc<AppState>>) -> RanResult<()> {
    state.repo.clear_monitor()
}

#[tauri::command]
pub fn top_processes(n: usize) -> RanResult<Vec<ProcInfo>> {
    Ok(sysproc::list_processes().into_iter().take(n).collect())
}
