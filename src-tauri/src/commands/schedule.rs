use super::AppState;
use crate::error::{RanError, RanResult};
use crate::repo::ScheduledTaskRow;
use crate::schedule;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SerTask {
    name: String,
    command: String,
    trigger: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RanTaskPkg {
    version: u32,
    tasks: Vec<SerTask>,
}

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

#[tauri::command]
pub fn export_scheduled(
    state: State<'_, Arc<AppState>>,
    path: String,
    ids: Vec<i64>,
) -> RanResult<String> {
    let all = state.repo.list_scheduled()?;
    let tasks: Vec<SerTask> = all
        .into_iter()
        .filter(|t| ids.contains(&t.id))
        .map(|t| SerTask {
            name: t.name,
            command: t.command,
            trigger: t.trigger,
        })
        .collect();
    let pkg = RanTaskPkg { version: 1, tasks };
    let json =
        serde_json::to_string_pretty(&pkg).map_err(|e| RanError::Other(e.to_string()))?;
    let p = if path.trim().is_empty() {
        state.root.join("data").join("scheduled-export.ran")
    } else {
        PathBuf::from(path)
    };
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&p, json)?;
    Ok(p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn import_scheduled(state: State<'_, Arc<AppState>>, path: String) -> RanResult<i64> {
    let text = std::fs::read_to_string(&path)?;
    let pkg: RanTaskPkg =
        serde_json::from_str(&text).map_err(|e| RanError::Other(format!("解析失败: {e}")))?;
    let mut count = 0i64;
    for t in &pkg.tasks {
        schedule::create(&t.name, &t.command, &t.trigger)?;
        state.repo.insert_scheduled(&ScheduledTaskRow {
            id: 0,
            name: t.name.clone(),
            command: t.command.clone(),
            trigger: t.trigger.clone(),
            enabled: true,
        })?;
        count += 1;
    }
    Ok(count)
}
