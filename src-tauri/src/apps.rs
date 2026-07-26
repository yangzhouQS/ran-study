use crate::error::{RanError, RanResult};
use crate::elevation;
use crate::provider::{process, service, RunStatus};
use crate::repo::CustomAppRow;
use std::path::Path;

/// 服务模式：经 sidecar(nssm) 注册
pub fn register_service(app: &CustomAppRow) -> RanResult<()> {
    let Some(svc) = &app.service_name else {
        return Ok(());
    };
    if let Ok(sc) = elevation::sidecar_path() {
        let args = elevation::build_nssm_install_args(svc, &app.exe, &app.args, &app.cwd);
        let _ = elevation::run_elevated(sc.to_str().unwrap_or(""), &args);
    }
    Ok(())
}

pub fn unregister_service(app: &CustomAppRow) -> RanResult<()> {
    let Some(svc) = &app.service_name else {
        return Ok(());
    };
    if let Ok(sc) = elevation::sidecar_path() {
        let args = elevation::build_nssm_remove_args(svc);
        let _ = elevation::run_elevated(sc.to_str().unwrap_or(""), &args);
    }
    Ok(())
}

/// 启动；便携模式返回 PID，服务模式返回 0
pub fn start(root: &Path, app: &CustomAppRow) -> RanResult<i64> {
    match &app.service_name {
        Some(svc) => {
            service::nssm_start(svc, &root.join("tools"))?;
            Ok(0)
        }
        None => {
            if !Path::new(&app.exe).exists() {
                return Err(RanError::Other(format!("可执行文件不存在: {}", app.exe)));
            }
            let args: Vec<&str> = app.args.split_whitespace().collect();
            let cwd = if app.cwd.is_empty() {
                None
            } else {
                Some(Path::new(&app.cwd))
            };
            let pid = process::spawn_child(Path::new(&app.exe), &args, cwd)?;
            Ok(pid as i64)
        }
    }
}

pub fn stop(root: &Path, app: &CustomAppRow) -> RanResult<()> {
    match &app.service_name {
        Some(svc) => service::nssm_stop(svc, &root.join("tools")),
        None => {
            if app.pid > 0 {
                process::kill_tree(app.pid as u32)
            } else {
                Ok(())
            }
        }
    }
}

pub fn status(_root: &Path, app: &CustomAppRow) -> RanResult<RunStatus> {
    match &app.service_name {
        Some(svc) => {
            let t = service::sc_query_status(svc)?;
            Ok(if service::parse_running(&t) {
                RunStatus::Running
            } else {
                RunStatus::Stopped
            })
        }
        None => {
            if app.pid > 0 && process::pid_alive(app.pid as u32) {
                Ok(RunStatus::Running)
            } else {
                Ok(RunStatus::Stopped)
            }
        }
    }
}
