use crate::error::RanResult;
use std::path::PathBuf;

pub const DEFAULT_ROOT_NAME: &str = "ran";

/// 默认根目录：优先 D:\ran，盘符不存在则回退 %USERPROFILE%\ran
pub fn default_root() -> PathBuf {
    let d = PathBuf::from(format!("D:\\{}", DEFAULT_ROOT_NAME));
    if d.parent().map(|p| p.exists()).unwrap_or(false) {
        return d;
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(DEFAULT_ROOT_NAME)
}

/// 在 root 下创建规范目录结构
pub fn ensure_layout(root: &std::path::Path) -> RanResult<()> {
    for sub in [
        "env",
        "tools",
        "apps",
        "data",
        "logs",
        "cache",
        "tasks",
        "autostart",
        "config",
    ] {
        std::fs::create_dir_all(root.join(sub))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_root_ends_with_ran() {
        let root = default_root();
        assert!(root.ends_with(DEFAULT_ROOT_NAME));
    }

    #[test]
    fn ensure_layout_creates_all_dirs() {
        let tmp = tempfile::tempdir().unwrap();
        ensure_layout(tmp.path()).unwrap();
        for sub in ["env", "tools", "config", "logs"] {
            assert!(tmp.path().join(sub).exists(), "missing {sub}");
        }
    }
}
