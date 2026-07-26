use super::AppState;
use crate::elevation;
use crate::error::{RanError, RanResult};
use crate::provider::{Manifest, RunMode, RunStatus, SoftwareSpec};
use std::path::PathBuf;
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

/// 批量检测所有已登记软件的运行状态（服务→sc query，便携→端口探测）
#[tauri::command]
pub fn check_all_status(state: State<'_, Arc<AppState>>) -> RanResult<Vec<(i64, bool)>> {
    let specs = state.repo.list_software()?;
    let mut out = Vec::new();
    for spec in specs {
        let running = if let Some(svc) = &spec.service_name {
            match crate::provider::service::sc_query_status(svc) {
                Ok(t) => crate::provider::service::parse_running(&t),
                Err(_) => false,
            }
        } else {
            crate::download::port_open("127.0.0.1", spec.port)
        };
        out.push((spec.id, running));
    }
    Ok(out)
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
    {
        let s = state.settings.lock().unwrap().clone();
        std::env::set_var("RAN_MIRROR", &s.mirror);
        std::env::set_var("RAN_PROXY", &s.proxy);
    }
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
                crate::logs::audit(&st.root, "install", &format!("{provider}@{version}"));
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

/// 接入已安装的外部软件（不下载，仅登记到库，可启停/查看状态）
#[tauri::command]
pub fn link_software(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    provider: String,
    install_path: String,
    version: Option<String>,
    bin_path: Option<String>,
    config_path: Option<String>,
    port: Option<u16>,
    data_path: Option<String>,
    service_name: Option<String>,
    run_mode: RunMode,
) -> RanResult<i64> {
    let inst = PathBuf::from(&install_path);
    let bin = match bin_path {
        Some(b) if !b.is_empty() => PathBuf::from(b),
        _ => match provider.as_str() {
            "mysql" => inst.join("bin").join("mysqld.exe"),
            "postgres" => inst.join("bin").join("pg_ctl.exe"),
            _ => inst.join("redis-server.exe"),
        },
    };
    if !bin.exists() {
        return Err(RanError::Other(format!("未找到可执行文件: {}", bin.display())));
    }
    let data_p = data_path.map(PathBuf::from);
    let cfg = match config_path {
        Some(c) if !c.is_empty() => PathBuf::from(c),
        _ => match provider.as_str() {
            "mysql" => inst.join("my.ini"),
            "postgres" => data_p
                .as_ref()
                .map(|d| d.join("postgresql.conf"))
                .unwrap_or_default(),
            _ => inst.join("redis.conf"),
        },
    };
    let p = port.unwrap_or_else(|| match provider.as_str() {
        "mysql" => 3306,
        "postgres" => 5432,
        _ => 6379,
    });
    let spec = SoftwareSpec {
        id: 0,
        provider: provider.clone(),
        version: version.unwrap_or_else(|| "linked".into()),
        install_path: inst,
        bin_path: bin,
        data_path: data_p.unwrap_or_default(),
        config_path: cfg,
        port: p,
        run_mode,
        service_name,
        linked: true,
    };
    let id = state.repo.insert_software(&spec)?;
    crate::logs::audit(&state.root, "link", &format!("{}@{}", provider, spec.version));
    let _ = app.emit("software://changed", ());
    Ok(id)
}

/// 编辑已登记软件的属性（bin/配置/端口/服务名/模式/版本/目录等）
#[tauri::command]
pub fn update_software(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: i64,
    version: String,
    install_path: String,
    bin_path: String,
    config_path: String,
    data_path: String,
    port: u16,
    service_name: Option<String>,
    run_mode: RunMode,
) -> RanResult<()> {
    state.repo.update_software_fields(
        id,
        &version,
        &install_path,
        &bin_path,
        &config_path,
        &data_path,
        port,
        service_name.as_deref(),
        run_mode,
    )?;
    crate::logs::audit(&state.root, "update", &format!("software {id}"));
    let _ = app.emit("software://changed", ());
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ControlResult {
    pub status: RunStatus,
    pub command: String,
}

fn cmd_str(action: &str, spec: &SoftwareSpec, linked_svc: &Option<String>) -> String {
    if let Some(svc) = linked_svc {
        return match action {
            "start" => format!("sc start {svc}"),
            "stop" => format!("sc stop {svc}"),
            "restart" => format!("sc stop {svc} → 1.2s → sc start {svc}"),
            _ => format!("sc query {svc}"),
        };
    }
    let bin = spec.bin_path.display();
    let cfg = spec.config_path.display();
    let data = spec.data_path.display();
    let port = spec.port;
    let svc = spec.service_name.as_deref().unwrap_or("?");
    match spec.provider.as_str() {
        "mysql" => match (spec.run_mode, action) {
            (RunMode::Portable, "start") => format!("mysqld --defaults-file={cfg}"),
            (RunMode::Portable, "stop") => format!("mysqladmin -u root -P {port} shutdown"),
            (RunMode::Portable, "restart") => {
                format!("mysqladmin -u root -P {port} shutdown → 1.2s → mysqld --defaults-file={cfg}")
            }
            (RunMode::Service, "start") => format!("sc start {svc}"),
            (RunMode::Service, "stop") => format!("sc stop {svc}"),
            (RunMode::Service, "restart") => format!("sc stop {svc} → 1.2s → sc start {svc}"),
            _ => format!("port check :{port}"),
        },
        "redis" => match (spec.run_mode, action) {
            (RunMode::Portable, "start") => format!("redis-server {cfg}"),
            (RunMode::Portable, "stop") => format!("redis-cli -p {port} shutdown"),
            (RunMode::Portable, "restart") => {
                format!("redis-cli -p {port} shutdown → 1.2s → redis-server {cfg}")
            }
            (RunMode::Service, "start") => format!("nssm start {svc}"),
            (RunMode::Service, "stop") => format!("nssm stop {svc}"),
            (RunMode::Service, "restart") => format!("nssm stop {svc} → 1.2s → nssm start {svc}"),
            _ => format!("port check :{port}"),
        },
        "postgres" => match (spec.run_mode, action) {
            (RunMode::Portable, "start") => format!("pg_ctl start -D {data} -w"),
            (RunMode::Portable, "stop") => format!("pg_ctl stop -D {data} -m fast"),
            (RunMode::Portable, "restart") => {
                format!("pg_ctl stop -D {data} -m fast → 1.2s → pg_ctl start -D {data} -w")
            }
            (RunMode::Service, "start") => format!("sc start {svc}"),
            (RunMode::Service, "stop") => format!("sc stop {svc}"),
            _ => format!("port check :{port}"),
        },
        _ => format!("{bin} {action}"),
    }
}

#[tauri::command]
pub async fn control_software(
    state: State<'_, Arc<AppState>>,
    id: i64,
    action: String,
) -> RanResult<ControlResult> {
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
    let linked_svc = if spec.linked {
        spec.service_name.clone()
    } else {
        None
    };
    let cur_status = || async {
        if let Some(svc) = &linked_svc {
            let t = crate::provider::service::sc_query_status(svc)?;
            Ok(if crate::provider::service::parse_running(&t) {
                RunStatus::Running
            } else {
                RunStatus::Stopped
            })
        } else if spec.linked {
            Ok(if crate::download::port_open("127.0.0.1", spec.port) {
                RunStatus::Running
            } else {
                RunStatus::Stopped
            })
        } else {
            prov.status(&spec).await
        }
    };
    let cmd = cmd_str(&action, &spec, &linked_svc);
    match action.as_str() {
        "start" => {
            if let Some(svc) = &linked_svc {
                crate::provider::service::sc_start(svc)?;
            } else {
                prov.start(&spec).await?;
            }
            let s = cur_status().await?;
            upd(&state.repo, id, s);
            crate::logs::audit(&state.root, "start", &format!("{}@{}", spec.provider, spec.version));
            Ok(ControlResult { status: s, command: cmd })
        }
        "stop" => {
            if let Some(svc) = &linked_svc {
                crate::provider::service::sc_stop(svc)?;
            } else {
                prov.stop(&spec).await?;
            }
            let s = cur_status().await?;
            upd(&state.repo, id, s);
            crate::logs::audit(&state.root, "stop", &format!("{}@{}", spec.provider, spec.version));
            Ok(ControlResult { status: s, command: cmd })
        }
        "restart" => {
            if let Some(svc) = &linked_svc {
                crate::provider::service::sc_stop(svc)?;
            } else {
                prov.stop(&spec).await?;
            }
            tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
            if let Some(svc) = &linked_svc {
                crate::provider::service::sc_start(svc)?;
            } else {
                prov.start(&spec).await?;
            }
            let s = cur_status().await?;
            upd(&state.repo, id, s);
            crate::logs::audit(&state.root, "restart", &format!("{}@{}", spec.provider, spec.version));
            Ok(ControlResult { status: s, command: cmd })
        }
        "status" => {
            let s = cur_status().await?;
            upd(&state.repo, id, s);
            Ok(ControlResult { status: s, command: cmd })
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
    if spec.linked {
        // 外部接入：仅停止服务、删除登记，不删除原始文件
        if spec.run_mode == RunMode::Service {
            if let Some(svc) = &spec.service_name {
                let _ = crate::provider::service::sc_stop(svc);
            }
        }
        state.repo.delete_software(id)?;
        crate::logs::audit(&state.root, "unlink", &format!("{}@{}", spec.provider, spec.version));
        return Ok(());
    }
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
    crate::logs::audit(&state.root, "uninstall", &format!("{}@{}", spec.provider, spec.version));
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

fn find_spec(state: &State<'_, Arc<AppState>>, id: i64) -> RanResult<SoftwareSpec> {
    state
        .repo
        .list_software()?
        .into_iter()
        .find(|s| s.id == id)
        .ok_or_else(|| RanError::NotFound(format!("software {id}")))
}

#[tauri::command]
pub fn read_software_config(state: State<'_, Arc<AppState>>, id: i64) -> RanResult<String> {
    let spec = find_spec(&state, id)?;
    std::fs::read_to_string(&spec.config_path)
        .map_err(|e| RanError::Other(format!("读取 {} 失败: {e}", spec.config_path.display())))
}

#[tauri::command]
pub fn write_software_config(
    state: State<'_, Arc<AppState>>,
    id: i64,
    content: String,
) -> RanResult<()> {
    let spec = find_spec(&state, id)?;
    std::fs::write(&spec.config_path, content)?;
    Ok(())
}
