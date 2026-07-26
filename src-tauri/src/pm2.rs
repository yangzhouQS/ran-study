use crate::error::{RanError, RanResult};
use crate::nvm::node_exe;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pm2Process {
    pub name: String,
    pub pid: Option<i32>,
    pub status: String,
    pub cpu: Option<f64>,
    pub memory: Option<f64>,
}

pub fn node_path(root: &Path) -> PathBuf {
    node_exe(root)
}
/// 激活 Node 全局安装的 pm2 入口
pub fn pm2_bin(root: &Path) -> PathBuf {
    node_path(root)
        .parent()
        .unwrap()
        .join("node_modules")
        .join("pm2")
        .join("bin")
        .join("pm2.js")
}
pub fn pm2_installed(root: &Path) -> bool {
    pm2_bin(root).exists()
}
pub fn pm2_home(root: &Path) -> PathBuf {
    root.join("data").join("pm2")
}

/// 用激活 Node 的 npm 全局安装 pm2
pub fn ensure_pm2(root: &Path) -> RanResult<()> {
    if pm2_installed(root) {
        return Ok(());
    }
    let node = node_path(root);
    if !node.exists() {
        return Err(RanError::Other(
            "未找到激活的 Node，先用 nvm 安装并 use 一个版本".into(),
        ));
    }
    let npm_cli = node
        .parent()
        .unwrap()
        .join("node_modules")
        .join("npm")
        .join("bin")
        .join("npm-cli.js");
    if !npm_cli.exists() {
        return Err(RanError::Other("未找到 npm-cli.js".into()));
    }
    std::env::set_var("PM2_HOME", pm2_home(root));
    let st = Command::new(&node)
        .arg(&npm_cli)
        .args(["i", "-g", "pm2"])
        .status()?;
    if !st.success() {
        return Err(RanError::Other("npm i -g pm2 失败".into()));
    }
    Ok(())
}

/// 运行 pm2（node pm2.js ...），返回 stdout
pub fn run_pm2(root: &Path, args: &[&str]) -> RanResult<String> {
    let node = node_path(root);
    let bin = pm2_bin(root);
    if !bin.exists() {
        return Err(RanError::Other("pm2 未安装".into()));
    }
    std::env::set_var("PM2_HOME", pm2_home(root));
    let out = Command::new(&node)
        .arg(&bin)
        .args(args)
        .output()
        .map_err(|e| RanError::Other(format!("运行 pm2 失败: {e}")))?;
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

pub fn list(root: &Path) -> RanResult<Vec<Pm2Process>> {
    let text = run_pm2(root, &["jlist"])?;
    Ok(parse_jlist(&text))
}

pub fn parse_jlist(text: &str) -> Vec<Pm2Process> {
    let start = text.find('[');
    let end = text.rfind(']');
    let Some((s, e)) = start.zip(end) else {
        return Vec::new();
    };
    let slice = &text[s..=e];
    #[derive(Deserialize)]
    struct Monit {
        cpu: Option<f64>,
        memory: Option<f64>,
    }
    #[derive(Deserialize)]
    struct Env {
        status: Option<String>,
    }
    #[derive(Deserialize)]
    struct Row {
        name: Option<String>,
        pid: Option<i32>,
        #[serde(rename = "pm2_env")]
        env: Option<Env>,
        monit: Option<Monit>,
    }
    let rows: Vec<Row> = serde_json::from_str(slice).unwrap_or_default();
    rows.into_iter()
        .map(|r| {
            let monit = r.monit;
            Pm2Process {
                name: r.name.unwrap_or_default(),
                pid: r.pid,
                status: r
                    .env
                    .and_then(|e| e.status)
                    .unwrap_or_else(|| "unknown".into()),
                cpu: monit.as_ref().and_then(|m| m.cpu),
                memory: monit.as_ref().and_then(|m| m.memory),
            }
        })
        .collect()
}

pub struct AppInput {
    pub name: String,
    pub script: String,
    pub cwd: String,
    pub env: HashMap<String, String>,
}

pub fn start_app(root: &Path, app: &AppInput) -> RanResult<()> {
    let mut cmd = Command::new(node_path(root));
    cmd.arg(pm2_bin(root));
    cmd.args(["start", &app.script, "--name", &app.name, "--cwd", &app.cwd]);
    cmd.env("PM2_HOME", pm2_home(root));
    for (k, v) in &app.env {
        cmd.env(k, v);
    }
    let st = cmd.status()?;
    if !st.success() {
        return Err(RanError::Other(format!("pm2 start {} 失败", app.name)));
    }
    Ok(())
}
pub fn stop_app(root: &Path, name: &str) -> RanResult<()> {
    let _ = run_pm2(root, &["stop", name])?;
    Ok(())
}
pub fn restart_app(root: &Path, name: &str) -> RanResult<()> {
    let _ = run_pm2(root, &["restart", name])?;
    Ok(())
}
pub fn delete_app(root: &Path, name: &str) -> RanResult<()> {
    let _ = run_pm2(root, &["delete", name])?;
    Ok(())
}
pub fn save(root: &Path) -> RanResult<()> {
    let _ = run_pm2(root, &["save"])?;
    Ok(())
}
pub fn resurrect(root: &Path) -> RanResult<()> {
    let _ = run_pm2(root, &["resurrect"])?;
    Ok(())
}

/// 读取某应用 pm2 日志尾 N 行（kind: "out" | "error"）
pub fn read_logs(root: &Path, name: &str, kind: &str, lines: usize) -> RanResult<String> {
    let log = pm2_home(root)
        .join("logs")
        .join(format!("{name}-{kind}.log"));
    if !log.exists() {
        return Ok(String::new());
    }
    let text = std::fs::read_to_string(&log)?;
    let collected: Vec<&str> = text.lines().rev().take(lines).collect();
    Ok(collected.into_iter().rev().collect::<Vec<_>>().join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_jlist_basic() {
        let text = r#"[{"name":"app","pid":12,"pm2_env":{"status":"online"},"monit":{"cpu":1.0,"memory":12345.0}}]"#;
        let v = parse_jlist(text);
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].name, "app");
        assert_eq!(v[0].status, "online");
        assert_eq!(v[0].pid, Some(12));
    }

    #[test]
    fn parse_jlist_dirty_output() {
        let text = "some noise [{\"name\":\"x\",\"pid\":null,\"pm2_env\":{\"status\":\"stopped\"}}] tail";
        let v = parse_jlist(text);
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].status, "stopped");
    }
}
