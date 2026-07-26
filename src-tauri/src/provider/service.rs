use crate::download;
use crate::error::{RanError, RanResult};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

const NSSM_ZIP_URL: &str = "https://nssm.cc/release/nssm-2.24.zip";

pub fn nssm_exe(tools_dir: &Path) -> PathBuf {
    tools_dir.join("nssm").join("nssm.exe")
}

/// 若 nssm.exe 不存在，下载 nssm-2.24.zip 并解压放置（async，避免嵌套 runtime）
pub async fn ensure_nssm(tools_dir: &Path, progress: impl Fn(u32, &str) + Send + Sync) -> RanResult<()> {
    let exe = nssm_exe(tools_dir);
    if exe.exists() {
        return Ok(());
    }
    let cache = tools_dir.parent().unwrap_or(tools_dir).join("cache");
    std::fs::create_dir_all(&cache)?;
    let zip = cache.join("nssm-2.24.zip");
    if !zip.exists() {
        progress(10, "下载 nssm-2.24.zip");
        download::download(NSSM_ZIP_URL, &zip, |_, _| {}, 0).await?;
        progress(60, "nssm 下载完成");
    }
    progress(80, "解压 nssm");
    let tmp = tempfile::tempdir()?;
    download::extract_zip(&zip, tmp.path())?;
    let win64 = tmp.path().join("nssm-2.24").join("win64").join("nssm.exe");
    if !win64.exists() {
        return Err(RanError::Other("nssm 包内未找到 win64/nssm.exe".into()));
    }
    std::fs::create_dir_all(exe.parent().unwrap())?;
    std::fs::copy(&win64, &exe)?;
    progress(100, "nssm 就绪");
    Ok(())
}

// ---- sc.exe（MySQL 原生服务） ----
pub fn sc_query_status(svc: &str) -> RanResult<String> {
    let out = Command::new("sc")
        .args(["query", svc])
        .output()
        .map_err(|e| RanError::Other(e.to_string()))?;
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

pub fn sc_start(svc: &str) -> RanResult<()> {
    let out = Command::new("sc")
        .args(["start", svc])
        .output()
        .map_err(|e| RanError::Other(e.to_string()))?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    let lower = text.to_ascii_lowercase();
    if lower.contains("failed") || text.contains("失败") || text.contains("错误") {
        return Err(RanError::Other(format!("sc start {svc}: {}", text.trim())));
    }
    Ok(())
}
pub fn sc_stop(svc: &str) -> RanResult<()> {
    let out = Command::new("sc")
        .args(["stop", svc])
        .output()
        .map_err(|e| RanError::Other(e.to_string()))?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    let lower = text.to_ascii_lowercase();
    if lower.contains("failed") || text.contains("失败") || text.contains("错误") {
        return Err(RanError::Other(format!("sc stop {svc}: {}", text.trim())));
    }
    Ok(())
}

// ---- nssm（Redis 等无原生服务） ----
pub fn nssm_start(svc: &str, tools_dir: &Path) -> RanResult<()> {
    run_ignore(nssm_exe(tools_dir).to_str().unwrap_or(""), &["start", svc])
}
pub fn nssm_stop(svc: &str, tools_dir: &Path) -> RanResult<()> {
    run_ignore(nssm_exe(tools_dir).to_str().unwrap_or(""), &["stop", svc])
}

fn run_ignore(prog: &str, args: &[&str]) -> RanResult<()> {
    let _ = Command::new(prog)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    Ok(())
}

/// 解析 sc query 文本中的 STATE 是否 RUNNING
pub fn parse_running(sc_text: &str) -> bool {
    sc_text.to_ascii_lowercase().contains("running")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_running_state() {
        assert!(parse_running("STATE              : 4  RUNNING"));
        assert!(!parse_running("STATE              : 1  STOPPED"));
    }

    #[test]
    fn nssm_path_shape() {
        let p = nssm_exe(Path::new("D:/ran/tools"));
        assert!(p.ends_with(std::path::Path::new("nssm/nssm.exe")));
    }
}
