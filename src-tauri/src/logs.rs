use crate::error::RanResult;
use serde::Serialize;
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogFile {
    pub path: String,
    pub name: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergedLine {
    pub source: String,
    pub line: String,
}

/// 扫描 <root>/logs 与 <PM2_HOME>/logs 下的 *.log 文件
pub fn list(root: &Path) -> RanResult<Vec<LogFile>> {
    let mut out: Vec<LogFile> = Vec::new();
    let dirs: [PathBuf; 2] = [
        root.join("logs"),
        root.join("data").join("pm2").join("logs"),
    ];
    for d in dirs {
        if let Ok(entries) = std::fs::read_dir(&d) {
            for e in entries.flatten() {
                let p = e.path();
                if p.extension().and_then(|s| s.to_str()) == Some("log") {
                    let name = p
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    let size = e.metadata().map(|m| m.len()).unwrap_or(0);
                    out.push(LogFile {
                        path: p.to_string_lossy().to_string(),
                        name,
                        size,
                    });
                }
            }
        }
    }
    out.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(out)
}

/// 读取文件尾 N 行
pub fn read(path: &Path, lines: usize) -> RanResult<String> {
    if !path.exists() {
        return Ok(String::new());
    }
    let text = std::fs::read_to_string(path)?;
    let collected: Vec<&str> = text.lines().rev().take(lines).collect();
    Ok(collected.into_iter().rev().collect::<Vec<_>>().join("\n"))
}

/// 读取多个日志文件，合并并按来源标记前缀
pub fn read_merged(paths: &[String], lines_per_file: usize) -> RanResult<Vec<MergedLine>> {
    let mut all: Vec<MergedLine> = Vec::new();
    for p in paths {
        let path = Path::new(p);
        if !path.exists() {
            continue;
        }
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let text = std::fs::read_to_string(path).unwrap_or_default();
        let collected: Vec<&str> = text.lines().rev().take(lines_per_file).collect();
        for line in collected.into_iter().rev() {
            all.push(MergedLine {
                source: name.clone(),
                line: line.to_string(),
            });
        }
    }
    Ok(all)
}

/// 追加操作审计日志到 <root>/logs/audit.log
pub fn audit(root: &Path, action: &str, target: &str) {
    let dir = root.join("logs");
    let _ = std::fs::create_dir_all(&dir);
    let ts = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let line = format!("[{ts}] {action}: {target}\n");
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("audit.log"))
    {
        let _ = f.write_all(line.as_bytes());
    }
}
