use crate::error::{RanError, RanResult};
use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcInfo {
    pub pid: u32,
    pub name: String,
    pub cpu: f32,
    pub memory: u64,
    pub user: String,
    pub command: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SvcInfo {
    pub name: String,
    pub state: String,
    pub display: String,
}

/// 进程列表（按 CPU 降序，上限 300）
pub fn list_processes() -> Vec<ProcInfo> {
    let mut sys = sysinfo::System::new_all();
    sys.refresh_cpu_usage();
    let mut v: Vec<ProcInfo> = sys
        .processes()
        .iter()
        .map(|(pid, p)| ProcInfo {
            pid: pid.as_u32(),
            name: p.name().to_string_lossy().to_string(),
            cpu: p.cpu_usage(),
            memory: p.memory(),
            user: p.user_id().map(|u| u.to_string()).unwrap_or_default(),
            command: p
                .cmd()
                .iter()
                .map(|s| s.to_string_lossy().to_string())
                .collect::<Vec<_>>()
                .join(" "),
        })
        .collect();
    v.sort_by(|a, b| b.cpu.partial_cmp(&a.cpu).unwrap_or(std::cmp::Ordering::Equal));
    v.truncate(300);
    v
}

pub fn kill_process(pid: u32) -> RanResult<()> {
    let st = Command::new("taskkill")
        .args(["/F", "/PID", &pid.to_string()])
        .status();
    match st {
        Ok(s) if s.success() => Ok(()),
        Ok(_) => Err(RanError::Other(format!("结束 {pid} 失败"))),
        Err(e) => Err(RanError::Other(format!("taskkill 失败: {e}"))),
    }
}

pub fn list_services() -> RanResult<Vec<SvcInfo>> {
    let out = Command::new("sc")
        .args(["query", "type=", "service", "state=", "all"])
        .output()
        .map_err(|e| RanError::Other(e.to_string()))?;
    let text = String::from_utf8_lossy(&out.stdout);
    Ok(parse_services(&text))
}

pub fn parse_services(text: &str) -> Vec<SvcInfo> {
    let mut out = Vec::new();
    let mut name = String::new();
    let mut state = String::new();
    let mut display = String::new();
    for line in text.lines() {
        let t = line.trim();
        if let Some(rest) = t.strip_prefix("SERVICE_NAME:") {
            name = rest.trim().to_string();
        } else if let Some(rest) = t.strip_prefix("DISPLAY_NAME:") {
            display = rest.trim().to_string();
        } else if let Some(rest) = t.strip_prefix("STATE") {
            if let Some(val) = rest.split(':').nth(1) {
                let lower = val.to_ascii_lowercase();
                state = if lower.contains("running") {
                    "running".into()
                } else if lower.contains("stopped") {
                    "stopped".into()
                } else {
                    val.trim().to_ascii_lowercase()
                };
            }
        } else if t.is_empty() && !name.is_empty() {
            out.push(SvcInfo {
                name: std::mem::take(&mut name),
                state: std::mem::take(&mut state),
                display: std::mem::take(&mut display),
            });
        }
    }
    if !name.is_empty() {
        out.push(SvcInfo { name, state, display });
    }
    out
}

pub fn control_service(name: &str, action: &str) -> RanResult<()> {
    let verb = match action {
        "start" => "start",
        "stop" => "stop",
        _ => return Err(RanError::Other("未知服务动作".into())),
    };
    let _ = Command::new("sc").args([verb, name]).status();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_services_basic() {
        let text = "\r\nSERVICE_NAME: ran-redis-7\r\nDISPLAY_NAME: ran redis\r\n        TYPE               : 10  WIN32_OWN_PROCESS\r\n        STATE              : 4  RUNNING \r\n\r\nSERVICE_NAME: MySQL80\r\nDISPLAY_NAME: MySQL\r\n        STATE              : 1  STOPPED \r\n";
        let v = parse_services(text);
        assert_eq!(v.len(), 2);
        assert_eq!(v[0].name, "ran-redis-7");
        assert_eq!(v[0].state, "running");
        assert_eq!(v[1].state, "stopped");
    }
}
