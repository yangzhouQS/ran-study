use crate::error::{RanError, RanResult};
use std::path::Path;

#[tauri::command]
pub fn read_text_file(path: String) -> RanResult<String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(RanError::Other(format!("文件不存在: {path}")));
    }
    std::fs::read_to_string(p).map_err(|e| RanError::Other(format!("读取失败: {e}")))
}

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> RanResult<()> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(p, &content)?;
    Ok(())
}
