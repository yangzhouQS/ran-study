use crate::error::RanResult;
use crate::monitor::{self, SystemStats};

#[tauri::command]
pub fn get_system_stats() -> RanResult<SystemStats> {
    Ok(monitor::snapshot())
}
