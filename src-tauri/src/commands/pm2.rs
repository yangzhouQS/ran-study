use super::AppState;
use crate::boot;
use crate::error::RanResult;
use crate::nvm;
use crate::pm2::{self, AppInput, Pm2Process};
use crate::repo::Pm2AppRow;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn pm2_installed(state: State<'_, Arc<AppState>>) -> RanResult<bool> {
    Ok(pm2::pm2_installed(&state.root))
}

#[tauri::command]
pub fn ensure_pm2(state: State<'_, Arc<AppState>>) -> RanResult<()> {
    pm2::ensure_pm2(&state.root)
}

#[tauri::command]
pub fn pm2_list(state: State<'_, Arc<AppState>>) -> RanResult<Vec<Pm2Process>> {
    pm2::list(&state.root)
}

#[tauri::command]
pub fn pm2_logs(
    state: State<'_, Arc<AppState>>,
    name: String,
    kind: String,
    lines: usize,
) -> RanResult<String> {
    pm2::read_logs(&state.root, &name, &kind, lines)
}

#[tauri::command]
pub fn pm2_apps(state: State<'_, Arc<AppState>>) -> RanResult<Vec<Pm2AppRow>> {
    state.repo.list_pm2_apps()
}

#[tauri::command]
pub fn add_pm2_app(state: State<'_, Arc<AppState>>, row: Pm2AppRow) -> RanResult<i64> {
    let env: HashMap<String, String> = serde_json::from_str(&row.env_json).unwrap_or_default();
    pm2::start_app(
        &state.root,
        &AppInput {
            name: row.name.clone(),
            script: row.script.clone(),
            cwd: row.cwd.clone(),
            env,
        },
    )?;
    pm2::save(&state.root)?;
    if row.autostart {
        let _ = enable_boot(&state.root);
    }
    state.repo.insert_pm2_app(&row)
}

#[tauri::command]
pub fn stop_pm2_app(state: State<'_, Arc<AppState>>, name: String) -> RanResult<()> {
    pm2::stop_app(&state.root, &name)
}

#[tauri::command]
pub fn restart_pm2_app(state: State<'_, Arc<AppState>>, name: String) -> RanResult<()> {
    pm2::restart_app(&state.root, &name)
}

#[tauri::command]
pub fn delete_pm2_app_cmd(
    state: State<'_, Arc<AppState>>,
    id: i64,
    name: String,
) -> RanResult<()> {
    pm2::delete_app(&state.root, &name)?;
    pm2::save(&state.root)?;
    state.repo.delete_pm2_app(id)?;
    Ok(())
}

#[tauri::command]
pub fn pm2_boot_enabled() -> RanResult<bool> {
    Ok(boot::is_enabled())
}

#[tauri::command]
pub fn pm2_boot_set(state: State<'_, Arc<AppState>>, enabled: bool) -> RanResult<()> {
    if enabled {
        enable_boot(&state.root)
    } else {
        boot::disable()
    }
}

fn enable_boot(root: &std::path::Path) -> RanResult<()> {
    let node = nvm::node_exe(root);
    let pm2 = pm2::pm2_bin(root);
    let home = pm2::pm2_home(root);
    boot::enable(
        &node.to_string_lossy(),
        &pm2.to_string_lossy(),
        &home.to_string_lossy(),
    )
}
