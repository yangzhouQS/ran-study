use super::AppState;
use crate::error::RanResult;
use crate::repo::ScheduledTaskRow;
use crate::schedule;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn list_scheduled(state: State<'_, Arc<AppState>>) -> RanResult<Vec<ScheduledTaskRow>> {
    state.repo.list_scheduled()
}

#[tauri::command]
pub fn create_scheduled(state: State<'_, Arc<AppState>>, row: ScheduledTaskRow) -> RanResult<i64> {
    schedule::create(&row.name, &row.command, &row.trigger)?;
    let mut r = row;
    r.enabled = true;
    state.repo.insert_scheduled(&r)
}

#[tauri::command]
pub fn run_scheduled(name: String) -> RanResult<()> {
    schedule::run(&name)
}

#[tauri::command]
pub fn toggle_scheduled(name: String, enabled: bool) -> RanResult<()> {
    if enabled {
        schedule::enable(&name)
    } else {
        schedule::disable(&name)
    }
}

#[tauri::command]
pub fn delete_scheduled(state: State<'_, Arc<AppState>>, id: i64, name: String) -> RanResult<()> {
    let _ = schedule::delete(&name);
    state.repo.delete_scheduled(id)?;
    Ok(())
}
