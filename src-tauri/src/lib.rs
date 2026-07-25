mod commands;
mod download;
mod elevation;
mod error;
mod paths;
mod provider;
mod repo;
mod settings;
mod task;

use commands::system::{get_settings, get_system_info, init_root, set_root_dir};
use commands::task::{create_demo_task, list_tasks};
use provider::registry::ProviderRegistry;
use repo::Repo;
use settings::Settings;
use std::sync::{Arc, Mutex};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 1) 解析根目录：优先读引导指针，否则默认 root
    let root = settings::read_bootstrap_root().unwrap_or_else(paths::default_root);
    // 2) 首次启动即建目录，确保 repo/settings 可用
    let _ = paths::ensure_layout(&root);

    let repo = Repo::open(&root.join("config")).unwrap_or_else(|_| Repo {
        conn: Mutex::new(rusqlite::Connection::open_in_memory().unwrap()),
    });
    let settings = Settings::load(&root.join("config")).unwrap_or_default();

    let state = Arc::new(commands::AppState {
        root: root.clone(),
        settings: Mutex::new(settings),
        repo,
        providers: Mutex::new(ProviderRegistry::new()),
        tasks: task::TaskQueue::new(),
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            init_root,
            get_settings,
            set_root_dir,
            list_tasks,
            create_demo_task,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
