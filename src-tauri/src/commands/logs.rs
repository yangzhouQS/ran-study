use super::AppState;
use crate::error::RanResult;
use crate::logs::{self, LogFile, MergedLine};
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

#[tauri::command]
pub fn read_merged_logs(
    state: State<'_, Arc<AppState>>,
    paths: Vec<String>,
    lines_per_file: usize,
) -> RanResult<Vec<MergedLine>> {
    // 如果 paths 为空，自动读取所有日志文件
    let target = if paths.is_empty() {
        let all = logs::list(&state.root)?;
        all.into_iter().map(|f| f.path).collect()
    } else {
        paths
    };
    logs::read_merged(&target, lines_per_file)
}
