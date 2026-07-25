use super::AppState;
use crate::elevation;
use crate::error::{RanError, RanResult};
use crate::provider::{Manifest, RunMode, RunStatus, SoftwareSpec};
use std::sync::Arc;
use tauri::async_runtime;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub fn list_catalog(state: State<'_, Arc<AppState>>) -> RanResult<Vec<Manifest>> {
    Ok(state
        .providers
        .lock()
        .unwrap()
        .list()
        .into_iter()
        .map(|p| p.manifest())
        .collect())
}

#[tauri::command]
pub fn list_installed(state: State<'_, Arc<AppState>>) -> RanResult<Vec<SoftwareSpec>> {
    state.repo.list_software()
}

#[tauri::command]
pub async fn install_software(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    provider: String,
    version: String,
    run_mode: RunMode,
) -> RanResult<String> {
    let prov = state
        .providers
        .lock()
        .unwrap()
        .get(&provider)
        .ok_or_else(|| RanError::NotFound(format!("provider {provider}")))?;
    let root = state.root.clone();
    let task = state.tasks.create("install", &format!("{provider}@{version}"));
    let task_id = task.id.clone();
    let st = state.inner().clone();

    let progress: crate::provider::ProgressCb = {
        let st = st.clone();
        let app = app.clone();
        let pid = task_id.clone();
        Arc::new(move |pct, msg| {
            st.tasks.set_progress(&pid, pct, msg);
            let _ = app.emit("task://progress", st.tasks.get(&pid));
        })
    };

    async_runtime::spawn(async move {
        let res = prov.install(&root, &version, run_mode, progress).await;
        match res {
            Ok(mut spec) => {
                if run_mode == RunMode::Service {
                    if let Ok(sc) = elevation::sidecar_path() {
                        let args = elevation::build_service_install_args(&spec);
                        let _ = elevation::run_elevated(sc.to_str().unwrap(), &args);
                    }
                }
                let id = st.repo.insert_software(&spec).unwrap_or(-1);
                spec.id = id;
                let _ = st.repo.update_status(id, "stopped");
                st.tasks.finish(&task_id, true);
                let _ = app.emit("task://progress", st.tasks.get(&task_id));
                let _ = app.emit("software://changed", ());
            }
            Err(e) => {
                st.tasks.set_progress(&task_id, 100, &e.to_string());
                st.tasks.finish(&task_id, false);
                let _ = app.emit("task://progress", st.tasks.get(&task_id));
            }
        }
    });

    Ok(task.id)
}

#[tauri::command]
pub async fn control_software(
    state: State<'_, Arc<AppState>>,
    id: i64,
    action: String,
) -> RanResult<RunStatus> {
    let spec = state
        .repo
        .list_software()?
        .into_iter()
        .find(|s| s.id == id)
        .ok_or_else(|| RanError::NotFound(format!("software {id}")))?;
    let prov = state
        .providers
        .lock()
        .unwrap()
        .get(&spec.provider)
        .ok_or_else(|| RanError::NotFound(spec.provider.clone()))?;
    match action.as_str() {
        "start" => {
            prov.start(&spec).await?;
            let s = prov.status(&spec).await?;
            upd(&state.repo, id, s);
            Ok(s)
        }
        "stop" => {
            prov.stop(&spec).await?;
            let s = prov.status(&spec).await?;
            upd(&state.repo, id, s);
            Ok(s)
        }
        "status" => {
            let s = prov.status(&spec).await?;
            upd(&state.repo, id, s);
            Ok(s)
        }
        _ => Err(RanError::Other("未知 action".into())),
    }
}

#[tauri::command]
pub async fn uninstall_software(state: State<'_, Arc<AppState>>, id: i64) -> RanResult<()> {
    let spec = state
        .repo
        .list_software()?
        .into_iter()
        .find(|s| s.id == id)
        .ok_or_else(|| RanError::NotFound(format!("software {id}")))?;
    let prov = state
        .providers
        .lock()
        .unwrap()
        .get(&spec.provider)
        .ok_or_else(|| RanError::NotFound(spec.provider.clone()))?;
    if spec.run_mode == RunMode::Service {
        if let Ok(sc) = elevation::sidecar_path() {
            let _ = elevation::run_elevated(
                sc.to_str().unwrap(),
                &elevation::build_service_remove_args(&spec),
            );
        }
    }
    prov.uninstall(&spec).await?;
    state.repo.delete_software(id)?;
    Ok(())
}

fn upd(repo: &crate::repo::Repo, id: i64, s: RunStatus) {
    let txt = match s {
        RunStatus::Running => "running",
        RunStatus::Stopped => "stopped",
        _ => "unknown",
    };
    let _ = repo.update_status(id, txt);
}
