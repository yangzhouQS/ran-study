use super::{task_progress, AppState};
use crate::error::{RanError, RanResult};
use crate::nvm::{self, NodeVersion};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub fn node_provisioned(state: State<'_, Arc<AppState>>) -> RanResult<bool> {
    Ok(nvm::is_provisioned(&state.root))
}

#[tauri::command]
pub fn known_node_versions() -> RanResult<Vec<String>> {
    Ok(nvm::known_versions())
}

#[tauri::command]
pub fn node_versions_local(state: State<'_, Arc<AppState>>) -> RanResult<Vec<NodeVersion>> {
    nvm::list_local(&state.root)
}

#[tauri::command]
pub async fn provision_nvm(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> RanResult<()> {
    let root = state.root.clone();
    let st = state.inner().clone();
    let task = st.tasks.create("nvm", "nvm-windows");
    let id = task.id.clone();
    let progress = task_progress(st.clone(), id.clone(), app.clone());
    match nvm::provision(&root, progress).await {
        Ok(_) => {
            st.tasks.finish(&id, true);
            let _ = app.emit("task://progress", st.tasks.get(&id));
            Ok(())
        }
        Err(e) => {
            st.tasks.set_progress(&id, 100, &e.to_string());
            st.tasks.finish(&id, false);
            let _ = app.emit("task://progress", st.tasks.get(&id));
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn install_node(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    version: String,
) -> RanResult<()> {
    let root = state.root.clone();
    let st = state.inner().clone();
    let task = st.tasks.create("node", &format!("node@{version}"));
    let id = task.id.clone();
    let res = tokio::task::spawn_blocking(move || nvm::install_version(&root, &version))
        .await
        .map_err(|e| RanError::Other(e.to_string()))?;
    match res {
        Ok(_) => st.tasks.finish(&id, true),
        Err(e) => {
            st.tasks.set_progress(&id, 100, &e.to_string());
            st.tasks.finish(&id, false);
        }
    }
    let _ = app.emit("task://progress", st.tasks.get(&id));
    Ok(())
}

#[tauri::command]
pub fn use_node(state: State<'_, Arc<AppState>>, version: String) -> RanResult<()> {
    nvm::use_version(&state.root, &version)
}

#[tauri::command]
pub fn uninstall_node(state: State<'_, Arc<AppState>>, version: String) -> RanResult<()> {
    nvm::uninstall_version(&state.root, &version)
}
