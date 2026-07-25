use crate::error::{RanError, RanResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub root_dir: String,
    #[serde(default)]
    pub mirror: String,
    #[serde(default)]
    pub proxy: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            root_dir: crate::paths::default_root().to_string_lossy().to_string(),
            mirror: String::new(),
            proxy: String::new(),
        }
    }
}

impl Settings {
    pub fn load(config_dir: &Path) -> RanResult<Self> {
        let file = config_dir.join("settings.json");
        if !file.exists() {
            let s = Settings::default();
            s.save(config_dir)?;
            return Ok(s);
        }
        let text = std::fs::read_to_string(&file)?;
        Ok(serde_json::from_str(&text).unwrap_or_default())
    }

    pub fn save(&self, config_dir: &Path) -> RanResult<()> {
        std::fs::create_dir_all(config_dir)?;
        let text = serde_json::to_string_pretty(self).map_err(|e| RanError::Other(e.to_string()))?;
        std::fs::write(config_dir.join("settings.json"), text)?;
        Ok(())
    }
}

/// 引导指针：记录上次选定的 root，位于 %LOCALAPPDATA%\ran\root.txt
pub fn bootstrap_root_path() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ran")
        .join("root.txt")
}

pub fn read_bootstrap_root() -> Option<PathBuf> {
    let text = std::fs::read_to_string(bootstrap_root_path()).ok()?;
    let p = PathBuf::from(text.trim());
    if p.as_os_str().is_empty() {
        None
    } else {
        Some(p)
    }
}

pub fn write_bootstrap_root(root: &Path) -> RanResult<()> {
    let p = bootstrap_root_path();
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(p, root.to_string_lossy().as_bytes())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_creates_default_when_absent() {
        let tmp = tempfile::tempdir().unwrap();
        let s = Settings::load(tmp.path()).unwrap();
        assert!(!s.root_dir.is_empty());
        assert!(tmp.path().join("settings.json").exists());
    }

    #[test]
    fn save_then_load_roundtrip() {
        let tmp = tempfile::tempdir().unwrap();
        let mut s = Settings::default();
        s.mirror = "huawei".into();
        s.save(tmp.path()).unwrap();
        let loaded = Settings::load(tmp.path()).unwrap();
        assert_eq!(loaded.mirror, "huawei");
    }
}
