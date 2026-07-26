use super::AppState;
use crate::error::RanResult;
use crate::monitor::{self, SystemStats};
use crate::repo::MonitorSampleRow;
use crate::sysproc::{self, ProcInfo};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn get_system_stats() -> RanResult<SystemStats> {
    Ok(monitor::snapshot())
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
