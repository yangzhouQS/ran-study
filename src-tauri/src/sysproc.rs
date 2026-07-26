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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortInfo {
    pub port: u32,
    pub pid: u32,
    pub name: String,
    pub address: String,
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

/// 受保护进程（关键系统进程 + ran 自身）
const PROTECTED_PROCESSES: &[&str] = &[
    "ran-study",
    "ran_study",
    "ran-sidecar",
    "csrss",
    "lsass",
    "smss",
    "wininit",
    "winlogon",
    "services",
    "system",
    "registry",
    "fontdrvhost",
    "dwm",
];

/// 受保护服务（停止会导致系统异常的关键 Windows 服务）
const PROTECTED_SERVICES: &[&str] = &[
    "audiosrv",
    "audioendpointbuilder",
    "bits",
    "cryptsvc",
    "dcomlaunch",
    "dhcp",
    "dnscache",
    "eventlog",
    "eventsystem",
    "lsm",
    "lanmanserver",
    "lanmanworkstation",
    "netman",
    "plugplay",
    "power",
    "profsvc",
    "rpceptmapper",
    "rpcss",
    "samss",
    "schedule",
    "sens",
    "spooler",
    "systemeventsbroker",
    "usermanager",
    "winmgmt",
    "wuauserv",
];

pub fn is_protected_process(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    let n = n.trim_end_matches(".exe");
    PROTECTED_PROCESSES.iter().any(|p| n == *p)
}

pub fn is_protected_service(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    PROTECTED_SERVICES.iter().any(|p| n == *p)
}

pub fn kill_process(pid: u32, name: &str) -> RanResult<()> {
    if is_protected_process(name) {
        return Err(RanError::Other(format!("{name} 受保护，禁止结束")));
    }
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
    if is_protected_service(name) {
        return Err(RanError::Other(format!("服务 {name} 受保护，禁止操作")));
    }
    let verb = match action {
        "start" => "start",
        "stop" => "stop",
        _ => return Err(RanError::Other("未知服务动作".into())),
    };
    let _ = Command::new("sc").args([verb, name]).status();
    Ok(())
}

// ---------- 端口检测 ----------
/// 解析 netstat -ano 文本中的 LISTENING 行 → (port, pid, address)，按端口去重
pub fn parse_listening(text: &str) -> Vec<(u32, u32, String)> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for line in text.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 5 || !parts.contains(&"LISTENING") {
            continue;
        }
        let local = parts[1];
        let pid: u32 = parts[parts.len() - 1].parse().unwrap_or(0);
        let Some(idx) = local.rfind(':') else {
            continue;
        };
        let port: u32 = local[idx + 1..].parse().unwrap_or(0);
        if port == 0 || pid == 0 {
            continue;
        }
        if !seen.insert(port) {
            continue;
        }
        out.push((port, pid, local[..idx].to_string()));
    }
    out.sort_by_key(|(p, _, _)| *p);
    out
}

/// 列出所有监听端口及其占用进程
pub fn list_listening_ports() -> RanResult<Vec<PortInfo>> {
    let out = Command::new("netstat")
        .args(["-ano"])
        .output()
        .map_err(|e| RanError::Other(e.to_string()))?;
    let text = String::from_utf8_lossy(&out.stdout);
    let entries = parse_listening(&text);
    let mut sys = sysinfo::System::new_all();
    let res = entries
        .into_iter()
        .map(|(port, pid, address)| {
            let name = sys
                .process(sysinfo::Pid::from_u32(pid))
                .map(|p| p.name().to_string_lossy().to_string())
                .unwrap_or_default();
            PortInfo {
                port,
                pid,
                name,
                address,
            }
        })
        .collect();
    Ok(res)
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

    #[test]
    fn protected_process_match() {
        assert!(is_protected_process("lsass.exe"));
        assert!(is_protected_process("ran-study"));
        assert!(!is_protected_process("chrome"));
    }

    #[test]
    fn protected_service_match() {
        assert!(is_protected_service("RpcSs"));
        assert!(is_protected_service("winmgmt"));
        assert!(!is_protected_service("MySQL80"));
    }

    #[test]
    fn parse_listening_extracts_port_pid() {
        let text = "\r\n活动连接\r\n\r\n  协议    本地地址          外部地址        状态           PID\r\n  TCP    127.0.0.1:5354         0.0.0.0:0              LISTENING       1068\r\n  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1248\r\n  TCP    [::]:445              [::]:0                 LISTENING       4\r\n  TCP    192.168.1.5:50123      10.0.0.1:443           ESTABLISHED     900\r\n";
        let v = parse_listening(text);
        // 5354, 135, 445 (50123 是 ESTABLISHED 不算；445 的 IPv4 与 IPv6 去重为一条)
        let ports: Vec<u32> = v.iter().map(|(p, _, _)| *p).collect();
        assert!(ports.contains(&5354));
        assert!(ports.contains(&135));
        assert!(ports.contains(&445));
        assert!(!ports.contains(&50123));
        let pid5354 = v.iter().find(|(p, _, _)| *p == 5354).map(|(_, pi, _)| *pi);
        assert_eq!(pid5354, Some(1068));
    }
}
