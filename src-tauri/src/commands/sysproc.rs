use crate::error::RanResult;
use crate::sysproc::{self, ProcInfo, SvcInfo};

#[tauri::command]
pub fn list_processes() -> RanResult<Vec<ProcInfo>> {
    Ok(sysproc::list_processes())
}

#[tauri::command]
pub fn kill_process(pid: u32) -> RanResult<()> {
    sysproc::kill_process(pid)
}

#[tauri::command]
pub fn list_services() -> RanResult<Vec<SvcInfo>> {
    sysproc::list_services()
}

#[tauri::command]
pub fn control_service(name: String, action: String) -> RanResult<()> {
    sysproc::control_service(&name, &action)
}
