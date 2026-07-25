pub mod system;
pub mod task;

use crate::provider::registry::ProviderRegistry;
use crate::repo::Repo;
use crate::settings::Settings;
use crate::task::TaskQueue;
use std::sync::Mutex;

pub struct AppState {
    pub root: std::path::PathBuf,
    pub settings: Mutex<Settings>,
    pub repo: Repo,
    pub providers: Mutex<ProviderRegistry>,
    pub tasks: TaskQueue,
}

impl AppState {
    pub fn config_dir(&self) -> std::path::PathBuf {
        self.root.join("config")
    }
}
