use crate::error::RanResult;
use std::path::PathBuf;

const VBS_NAME: &str = "ran-pm2-resurrect.vbs";

pub fn startup_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Microsoft")
        .join("Windows")
        .join("Start Menu")
        .join("Programs")
        .join("Startup")
}

pub fn vbs_path() -> PathBuf {
    startup_dir().join(VBS_NAME)
}

pub fn is_enabled() -> bool {
    vbs_path().exists()
}

/// 生成 vbs：隐藏窗口运行 `<node> <pm2.js> resurrect`，注入 PM2_HOME
pub fn enable(node: &str, pm2: &str, pm2_home: &str) -> RanResult<()> {
    let vbs = render_vbs(node, pm2, pm2_home);
    if let Some(parent) = vbs_path().parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(vbs_path(), vbs)?;
    Ok(())
}

pub fn disable() -> RanResult<()> {
    let p = vbs_path();
    if p.exists() {
        std::fs::remove_file(p)?;
    }
    Ok(())
}

/// 渲染 vbs 内容（供单测与 enable 复用）
pub fn render_vbs(node: &str, pm2: &str, pm2_home: &str) -> String {
    let n = node.replace('\\', "\\\\");
    let p = pm2.replace('\\', "\\\\");
    let h = pm2_home.replace('\\', "\\\\");
    format!(
        "' ran-study PM2 autostart\n\
         Set sh = CreateObject(\"WScript.Shell\")\n\
         sh.Environment(\"Process\").Item(\"PM2_HOME\") = \"{h}\"\n\
         sh.Run \"\"\"{n}\"\" \"\"{p}\"\" resurrect\", 0, False\n"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn render_vbs_contains_resurrect_and_hidden() {
        let v = render_vbs(
            "C:\\ran\\env\\node\\node.exe",
            "C:\\ran\\env\\node\\node_modules\\pm2\\bin\\pm2.js",
            "C:\\ran\\data\\pm2",
        );
        assert!(v.contains("resurrect"));
        assert!(v.contains(", 0, False"));
        assert!(v.contains("PM2_HOME"));
    }

    #[test]
    fn startup_dir_ends_with_startup() {
        let p = startup_dir();
        assert!(p.ends_with("Startup"));
    }
}
