use super::AppState;
use crate::error::RanResult;
use crate::logs::{self, LogFile};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn list_log_files(state: State<'_, Arc<AppState>>) -> RanResult<Vec<LogFile>> {
    logs::list(&state.root)
}

#[tauri::command]
pub fn read_log_file(path: String, lines: usize) -> RanResult<String> {
    logs::read(std::path::Path::new(&path), lines)
}
