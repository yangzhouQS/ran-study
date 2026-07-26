use crate::error::{RanError, RanResult};
use crate::provider::{process, service, RunMode, SoftwareSpec};
use std::path::{Path, PathBuf};
use std::process::Command;

fn redis_cli(spec: &SoftwareSpec) -> PathBuf {
    spec.bin_path
        .parent()
        .unwrap()
        .join(if cfg!(windows) { "redis-cli.exe" } else { "redis-cli" })
}

fn tools_dir(spec: &SoftwareSpec) -> PathBuf {
    spec.install_path
        .ancestors()
        .nth(3)
        .unwrap_or(&spec.install_path)
        .join("tools")
}

fn base(spec: &SoftwareSpec, pw: &str) -> Command {
    let mut c = Command::new(redis_cli(spec));
    c.args(["-h", "127.0.0.1", "-p", &spec.port.to_string()]);
    if !pw.is_empty() {
        c.args(["-a", pw, "--no-auth-warning"]);
    }
    c
}

pub fn run(spec: &SoftwareSpec, pw: &str, args: &[&str]) -> RanResult<String> {
    let out = base(spec, pw)
        .args(args)
        .output()
        .map_err(|e| RanError::Other(e.to_string()))?;
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

pub fn list_keys(spec: &SoftwareSpec, pw: &str) -> RanResult<Vec<String>> {
    let out = run(spec, pw, &["--raw", "KEYS", "*"])?;
    Ok(out
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect())
}

pub fn add_key(spec: &SoftwareSpec, pw: &str, key: &str, val: &str) -> RanResult<()> {
    run(spec, pw, &["SET", key, val])?;
    Ok(())
}

pub fn get_key(spec: &SoftwareSpec, pw: &str, key: &str) -> RanResult<String> {
    run(spec, pw, &["--raw", "GET", key])
}

pub fn del_key(spec: &SoftwareSpec, pw: &str, key: &str) -> RanResult<()> {
    run(spec, pw, &["DEL", key])?;
    Ok(())
}

pub fn run_remote(host: &str, port: u16, pw: &str, args: &[&str]) -> RanResult<String> {
    let cli = which_redis_cli();
    let mut c = Command::new(cli);
    c.args(["-h", host, "-p", &port.to_string()]);
    if !pw.is_empty() {
        c.args(["-a", pw, "--no-auth-warning"]);
    }
    let out = c
        .args(args)
        .output()
        .map_err(|e| RanError::Other(format!("redis-cli 失败: {e}")))?;
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

/// 兜底：远程命令无实例时找一个系统 redis-cli
fn which_redis_cli() -> PathBuf {
    PathBuf::from(if cfg!(windows) { "redis-cli.exe" } else { "redis-cli" })
}

/// 改密码：重写 redis.conf 的 requirepass + 重启
pub fn change_password(
    spec: &SoftwareSpec,
    cur_pw: &str,
    new_pw: &str,
) -> RanResult<()> {
    rewrite_requirepass(&spec.config_path, new_pw)?;
    match spec.run_mode {
        RunMode::Service => {
            if let Some(svc) = &spec.service_name {
                let tools = tools_dir(spec);
                let _ = service::nssm_stop(svc, &tools);
                let _ = service::nssm_start(svc, &tools);
            }
            Ok(())
        }
        RunMode::Portable => {
            // 停旧：当前无密码用 shutdown；有密码用 -a
            let mut stop = base(spec, cur_pw);
            let _ = stop.arg("SHUTDOWN").status();
            let cfg = spec.config_path.to_string_lossy().to_string();
            process::spawn_child(&spec.bin_path, &[cfg.as_str()], Some(&spec.install_path))?;
            Ok(())
        }
    }
}

fn rewrite_requirepass(conf: &Path, new_pw: &str) -> RanResult<()> {
    let text = std::fs::read_to_string(conf).unwrap_or_default();
    let mut out: Vec<String> = Vec::new();
    let mut found = false;
    for line in text.lines() {
        if line.trim_start().to_ascii_lowercase().starts_with("requirepass ") {
            out.push(format!("requirepass {new_pw}"));
            found = true;
        } else {
            out.push(line.to_string());
        }
    }
    if !found {
        out.push(format!("requirepass {new_pw}"));
    }
    std::fs::write(conf, out.join("\n") + "\n")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rewrite_requirepass_inserts_and_replaces() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("redis.conf");
        std::fs::write(&p, "port 6379\nbind 127.0.0.1\n").unwrap();
        rewrite_requirepass(&p, "abc").unwrap();
        let s1 = std::fs::read_to_string(&p).unwrap();
        assert!(s1.contains("requirepass abc"));
        // 再次改应替换而非重复
        rewrite_requirepass(&p, "xyz").unwrap();
        let s2 = std::fs::read_to_string(&p).unwrap();
        assert_eq!(s2.matches("requirepass").count(), 1);
        assert!(s2.contains("requirepass xyz"));
    }
}
