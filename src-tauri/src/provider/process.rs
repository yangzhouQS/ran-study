use crate::error::{RanError, RanResult};
use std::path::Path;
use std::process::{Command, Stdio};

/// 后台拉起便携进程（不弹控制台黑窗），返回 PID。stdout/stderr 丢弃（生产应重定向到日志）
pub fn spawn_child(exe: &Path, args: &[&str], cwd: Option<&Path>) -> RanResult<u32> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;
    // CREATE_NO_WINDOW: 不为控制台程序创建窗口（与 DETACHED_PROCESS 互斥）
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;

    let mut cmd = Command::new(exe);
    cmd.args(args);
    if let Some(d) = cwd {
        cmd.current_dir(d);
    }
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP);

    let child = cmd
        .spawn()
        .map_err(|e| RanError::Other(format!("spawn {} 失败: {e}", exe.display())))?;
    Ok(child.id())
}

/// 结束进程树（taskkill /T /F）。进程已退出则视为成功
pub fn kill_tree(pid: u32) -> RanResult<()> {
    let _ = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    Ok(())
}

/// PID 是否存活
pub fn pid_alive(pid: u32) -> bool {
    Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}")])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .map(|o| {
            let s = String::from_utf8_lossy(&o.stdout);
            s.contains(&pid.to_string())
        })
        .unwrap_or(false)
}

/// 按端口查找监听进程并强制结束（优雅停止失败时的兜底）
pub fn kill_by_port(port: u16) -> RanResult<u32> {
    let out = Command::new("netstat")
        .args(["-ano"])
        .output()
        .map_err(|e| RanError::Other(format!("netstat 失败: {e}")))?;
    let text = String::from_utf8_lossy(&out.stdout);
    let entries = crate::sysproc::parse_listening(&text);
    let mut killed = 0u32;
    for (p, pid, _) in entries {
        if p == port as u32 && pid > 0 {
            kill_tree(pid)?;
            killed += 1;
        }
    }
    Ok(killed)
}
