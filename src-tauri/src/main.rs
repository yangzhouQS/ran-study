// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(windows)]
    {
        // 已在重启中或已提权则跳过
        let already_elevating = std::env::args().any(|a| a == "--ran-elevated");
        if !already_elevating && !is_admin() {
            if let Ok(exe) = std::env::current_exe() {
                eprintln!("ran-study: 非管理员，正在请求 UAC 提权...");
                let _ = runas::Command::new(&exe)
                    .arg("--ran-elevated")
                    .show(true)
                    .force_prompt(true)
                    .status();
            }
            // 用户拒绝 UAC 或提权失败也退出
            std::process::exit(0);
        }
    }
    ran_study_lib::run()
}

/// 检测当前进程是否以管理员权限运行
#[cfg(windows)]
fn is_admin() -> bool {
    // reg query HKU\S-1-5-19 只有管理员能访问（LocalService 的注册表配置单元）
    std::process::Command::new("reg")
        .args(["query", "HKU\\S-1-5-19"])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}
