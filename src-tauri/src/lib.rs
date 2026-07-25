mod commands;
mod boot;
mod download;
mod elevation;
mod error;
mod monitor;
mod nvm;
mod paths;
mod pm2;
mod provider;
mod repo;
mod schedule;
mod settings;
mod sysproc;
mod task;
mod terminal;

use commands::system::{get_settings, get_system_info, init_root, set_root_dir};
use commands::task::{create_demo_task, list_tasks};
use provider::mysql::MysqlProvider;
use provider::redis::RedisProvider;
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
    std::env::set_var("RAN_TOOLS_DIR", root.join("tools"));

    let repo = Repo::open(&root.join("config")).unwrap_or_else(|_| Repo {
        conn: Mutex::new(rusqlite::Connection::open_in_memory().unwrap()),
    });
    let settings = Settings::load(&root.join("config")).unwrap_or_default();

    let mut providers = ProviderRegistry::new();
    providers.register(Arc::new(MysqlProvider));
    providers.register(Arc::new(RedisProvider));

    let state = Arc::new(commands::AppState {
        root: root.clone(),
        settings: Mutex::new(settings),
        repo,
        providers: Mutex::new(providers),
        tasks: task::TaskQueue::new(),
        terminals: std::sync::Mutex::new(std::collections::HashMap::new()),
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
            commands::software::list_catalog,
            commands::software::list_installed,
            commands::software::install_software,
            commands::software::control_software,
            commands::software::uninstall_software,
            commands::node::node_provisioned,
            commands::node::known_node_versions,
            commands::node::node_versions_local,
            commands::node::provision_nvm,
            commands::node::install_node,
            commands::node::use_node,
            commands::node::uninstall_node,
            commands::pm2::pm2_installed,
            commands::pm2::ensure_pm2,
            commands::pm2::pm2_list,
            commands::pm2::pm2_apps,
            commands::pm2::add_pm2_app,
            commands::pm2::stop_pm2_app,
            commands::pm2::restart_pm2_app,
            commands::pm2::delete_pm2_app_cmd,
            commands::pm2::pm2_boot_enabled,
            commands::pm2::pm2_boot_set,
            commands::sysproc::list_processes,
            commands::sysproc::kill_process,
            commands::sysproc::list_services,
            commands::sysproc::control_service,
            commands::monitor::get_system_stats,
            commands::schedule::list_scheduled,
            commands::schedule::create_scheduled,
            commands::schedule::run_scheduled,
            commands::schedule::toggle_scheduled,
            commands::schedule::delete_scheduled,
            commands::terminal::open_terminal,
            commands::terminal::write_terminal,
            commands::terminal::close_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
