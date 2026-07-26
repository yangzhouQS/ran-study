use super::AppState;
use crate::apps;
use crate::error::{RanError, RanResult};
use crate::provider::service;
use crate::repo::CustomAppRow;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

fn find(state: &State<'_, Arc<AppState>>, id: i64) -> RanResult<CustomAppRow> {
    state
        .repo
        .list_custom_apps()?
        .into_iter()
        .find(|a| a.id == id)
        .ok_or_else(|| RanError::NotFound(format!("custom app {id}")))
}

#[tauri::command]
pub fn list_custom_apps(state: State<'_, Arc<AppState>>) -> RanResult<Vec<CustomAppRow>> {
    state.repo.list_custom_apps()
}

#[tauri::command]
pub async fn add_custom_app(
    state: State<'_, Arc<AppState>>,
    name: String,
    exe: String,
    args: String,
    cwd: String,
    service_mode: bool,
) -> RanResult<i64> {
    let service_name = if service_mode {
        Some(format!("ran-app-{}", name))
    } else {
        None
    };
    if service_mode {
        // 置备 nssm（服务包装器）
        let tools = state.root.join("tools");
        service::ensure_nssm(&tools, |_, _| {}).await?;
    }
    let row = CustomAppRow {
        id: 0,
        name: name.clone(),
        exe,
        args,
        cwd,
        service_name: service_name.clone(),
        pid: 0,
        status: "stopped".into(),
    };
    if service_mode {
        apps::register_service(&row)?;
    }
    let id = state.repo.insert_custom_app(&row)?;
    Ok(id)
}

#[tauri::command]
pub fn start_custom_app(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> RanResult<()> {
    let mut row = find(&state, id)?;
    let pid = apps::start(&state.root, &row)?;
    row.pid = pid;
    let _ = state.repo.update_custom_app(id, pid, "running");
    let _ = app.emit("apps://changed", ());
    Ok(())
}

#[tauri::command]
pub fn stop_custom_app(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> RanResult<()> {
    let row = find(&state, id)?;
    apps::stop(&state.root, &row)?;
    let _ = state.repo.update_custom_app(id, 0, "stopped");
    let _ = app.emit("apps://changed", ());
    Ok(())
}

#[tauri::command]
pub fn status_custom_app(state: State<'_, Arc<AppState>>, id: i64) -> RanResult<bool> {
    let row = find(&state, id)?;
    let s = apps::status(&state.root, &row)?;
    let running = s == crate::provider::RunStatus::Running;
    let txt = if running { "running" } else { "stopped" };
    let _ = state.repo.update_custom_app(id, row.pid, txt);
    Ok(running)
}

#[tauri::command]
pub fn delete_custom_app(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> RanResult<()> {
    let row = find(&state, id)?;
    let _ = apps::stop(&state.root, &row);
    apps::unregister_service(&row)?;
    state.repo.delete_custom_app(id)?;
    let _ = app.emit("apps://changed", ());
    Ok(())
}
