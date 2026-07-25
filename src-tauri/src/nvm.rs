use crate::download;
use crate::error::{RanError, RanResult};
use crate::provider::ProgressCb;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

const NVM_NOINSTALL_URL: &str =
    "https://github.com/coreybutler/nvm-windows/releases/download/1.2.2/nvm-noinstall.zip";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeVersion {
    pub version: String,
    pub active: bool,
}

/// 已知常用 LTS 版本（前端选择器用；实际安装由 nvm install 完成）
pub fn known_versions() -> Vec<String> {
    vec!["18.20.4".into(), "20.18.1".into(), "22.11.0".into()]
}

pub fn nvm_dir(root: &Path) -> PathBuf {
    root.join("env").join("nvm")
}
pub fn nvm_exe(root: &Path) -> PathBuf {
    nvm_dir(root).join(if cfg!(windows) { "nvm.exe" } else { "nvm" })
}
pub fn node_symlink(root: &Path) -> PathBuf {
    root.join("env").join("node")
}
pub fn node_exe(root: &Path) -> PathBuf {
    node_symlink(root).join(if cfg!(windows) { "node.exe" } else { "node" })
}

pub fn is_provisioned(root: &Path) -> bool {
    nvm_exe(root).exists()
}

/// 下载 nvm-noinstall.zip → 解压到 env/nvm → 写 settings.txt → setx 环境变量
pub async fn provision(root: &Path, progress: ProgressCb) -> RanResult<()> {
    if is_provisioned(root) {
        return Ok(());
    }
    let dir = nvm_dir(root);
    let cache = root.join("cache");
    std::fs::create_dir_all(&cache)?;
    let zip = cache.join("nvm-noinstall.zip");
    if !zip.exists() {
        progress(10, "下载 nvm-noinstall.zip");
        let p = progress.clone();
        download::download(
            NVM_NOINSTALL_URL,
            &zip,
            move |d, t| {
                let pct = if t > 0 { (d * 50 / t) as u32 + 10 } else { 10 };
                p(pct.min(60), &format!("下载 {d}/{t}"));
            },
            0,
        )
        .await?;
        progress(60, "nvm 下载完成");
    }
    progress(75, "解压 nvm");
    download::install_from_zip(&zip, &dir)?;
    if !nvm_exe(root).exists() {
        return Err(RanError::Other("解压后未找到 nvm.exe".into()));
    }

    progress(85, "写 settings.txt");
    write_settings(root)?;

    progress(95, "设置环境变量");
    set_user_env("NVM_HOME", &dir.to_string_lossy());
    set_user_env("NVM_SYMLINK", &node_symlink(root).to_string_lossy());
    std::env::set_var("NVM_HOME", &dir);
    std::env::set_var("NVM_SYMLINK", node_symlink(root));

    progress(100, "nvm 就绪");
    Ok(())
}

fn write_settings(root: &Path) -> RanResult<()> {
    let settings = format!(
        "root: {}\r\npath: {}\r\narch: 64\r\nproxy: none\r\noriginalpath: \r\noriginalversion: \r\n",
        nvm_dir(root).display(),
        node_symlink(root).display()
    );
    std::fs::write(nvm_dir(root).join("settings.txt"), settings)?;
    Ok(())
}

/// 通过 setx 持久化用户级环境变量（新开的终端可见）
fn set_user_env(key: &str, val: &str) {
    let _ = Command::new("setx").args([key, val]).status();
}

/// 运行 nvm.exe（注入 NVM_HOME/NVM_SYMLINK），返回 stdout
pub fn run_nvm(root: &Path, args: &[&str]) -> RanResult<String> {
    std::env::set_var("NVM_HOME", nvm_dir(root));
    std::env::set_var("NVM_SYMLINK", node_symlink(root));
    let out = Command::new(nvm_exe(root))
        .args(args)
        .output()
        .map_err(|e| RanError::Other(format!("运行 nvm 失败: {e}")))?;
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

pub fn list_local(root: &Path) -> RanResult<Vec<NodeVersion>> {
    let text = run_nvm(root, &["list"])?;
    Ok(parse_nvm_list(&text))
}

pub fn parse_nvm_list(text: &str) -> Vec<NodeVersion> {
    let mut out = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty()
            || trimmed.contains("NVM for Windows")
            || trimmed.starts_with("------")
        {
            continue;
        }
        let active = trimmed.starts_with('*');
        let body = trimmed.trim_start_matches('*').trim();
        let version = body.split_whitespace().next().unwrap_or("").to_string();
        if !version.is_empty() {
            out.push(NodeVersion { version, active });
        }
    }
    out
}

pub fn install_version(root: &Path, version: &str) -> RanResult<()> {
    let _ = run_nvm(root, &["install", version])?;
    Ok(())
}
pub fn use_version(root: &Path, version: &str) -> RanResult<()> {
    let _ = run_nvm(root, &["use", version])?;
    Ok(())
}
pub fn uninstall_version(root: &Path, version: &str) -> RanResult<()> {
    let _ = run_nvm(root, &["uninstall", version])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_list_with_active() {
        let text = "* 20.18.1 (Currently using 64-bit executable)\n    18.20.4\n";
        let v = parse_nvm_list(text);
        assert_eq!(v.len(), 2);
        assert_eq!(v[0].version, "20.18.1");
        assert!(v[0].active);
        assert!(!v[1].active);
    }

    #[test]
    fn settings_rendered() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(nvm_dir(tmp.path())).unwrap();
        write_settings(tmp.path()).unwrap();
        let s = std::fs::read_to_string(nvm_dir(tmp.path()).join("settings.txt")).unwrap();
        assert!(s.contains("arch: 64"));
        assert!(s.contains("env\\nvm"));
    }

    #[test]
    fn known_versions_nonempty() {
        assert!(!known_versions().is_empty());
    }
}
