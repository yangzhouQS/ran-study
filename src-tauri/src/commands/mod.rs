pub mod node;
pub mod pm2;
pub mod system;
pub mod software;
pub mod task;
pub mod sysproc;
pub mod monitor;
pub mod schedule;
pub mod terminal;
pub mod dbadmin;
pub mod redis_admin;
pub mod logs;

use crate::provider::registry::ProviderRegistry;
use crate::repo::Repo;
use crate::settings::Settings;
use crate::task::TaskQueue;
use std::sync::{Arc, Mutex};
use tauri::Emitter;

pub struct AppState {
    pub root: std::path::PathBuf,
    pub settings: Mutex<Settings>,
    pub repo: Repo,
    pub providers: Mutex<ProviderRegistry>,
    pub tasks: TaskQueue,
    pub terminals: crate::terminal::SessionMap,
}

impl AppState {
    pub fn config_dir(&self) -> std::path::PathBuf {
        self.root.join("config")
    }
}

/// 生成进度回调：(更新任务进度 + 推送 task://progress 事件)
pub fn task_progress(
    st: Arc<AppState>,
    id: String,
    app: tauri::AppHandle,
) -> crate::provider::ProgressCb {
    Arc::new(move |pct, msg| {
        st.tasks.set_progress(&id, pct, msg);
        let _ = app.emit("task://progress", st.tasks.get(&id));
    })
}
