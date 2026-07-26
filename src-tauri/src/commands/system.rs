use super::AppState;
use crate::error::{RanError, RanResult};
use crate::paths;
use crate::settings::Settings;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub root_dir: String,
    pub initialized: bool,
}

#[tauri::command]
pub fn get_system_info(state: State<'_, Arc<AppState>>) -> RanResult<SystemInfo> {
    let initialized = state.config_dir().join("ran.db").exists();
    Ok(SystemInfo {
        root_dir: state.root.to_string_lossy().to_string(),
        initialized,
    })
}

#[tauri::command]
pub fn init_root(state: State<'_, Arc<AppState>>) -> RanResult<()> {
    paths::ensure_layout(&state.root)?;
    *state.settings.lock().unwrap_or_else(|e| e.into_inner()) = Settings::load(&state.config_dir())?;
    Ok(())
}

#[tauri::command]
pub fn get_settings(state: State<'_, Arc<AppState>>) -> RanResult<Settings> {
    Ok(state.settings.lock().unwrap_or_else(|e| e.into_inner()).clone())
}

#[tauri::command]
pub fn update_settings(
    state: State<'_, Arc<AppState>>,
    mirror: String,
    proxy: String,
) -> RanResult<()> {
    let mut s = state.settings.lock().unwrap_or_else(|e| e.into_inner());
    s.mirror = mirror;
    s.proxy = proxy;
    s.save(&state.config_dir())?;
    Ok(())
}

/// 切换根目录：写入引导指针 + 在新目录落 settings（重启后生效）
#[tauri::command]
pub fn set_root_dir(state: State<'_, Arc<AppState>>, root_dir: String) -> RanResult<()> {
    let path = PathBuf::from(&root_dir);
    if !path.parent().map(|p| p.exists()).unwrap_or(false) {
        return Err(RanError::Other("目标父目录不存在".into()));
    }
    paths::ensure_layout(&path)?;
    crate::settings::write_bootstrap_root(&path)?;
    let mut s = state.settings.lock().unwrap_or_else(|e| e.into_inner());
    s.root_dir = root_dir;
    s.save(&path.join("config"))?;
    Ok(())
}
