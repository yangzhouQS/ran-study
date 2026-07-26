use crate::error::RanResult;
use crate::sysproc::{self, PortInfo, ProcInfo, SvcInfo};

#[tauri::command]
pub fn list_processes() -> RanResult<Vec<ProcInfo>> {
    Ok(sysproc::list_processes())
}

#[tauri::command]
pub fn kill_process(pid: u32, name: String) -> RanResult<()> {
    sysproc::kill_process(pid, &name)
}

#[tauri::command]
pub fn list_services() -> RanResult<Vec<SvcInfo>> {
    sysproc::list_services()
}

#[tauri::command]
pub fn control_service(name: String, action: String) -> RanResult<()> {
    sysproc::control_service(&name, &action)
}

#[tauri::command]
pub fn process_protected(name: String) -> bool {
    sysproc::is_protected_process(&name)
}

#[tauri::command]
pub fn service_protected(name: String) -> bool {
    sysproc::is_protected_service(&name)
}

#[tauri::command]
pub fn list_ports() -> RanResult<Vec<PortInfo>> {
    sysproc::list_listening_ports()
}
