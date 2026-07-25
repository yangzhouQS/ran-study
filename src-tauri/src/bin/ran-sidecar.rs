// ran-sidecar：以管理员身份运行的服务注册/卸载辅助进程（由主程序经 runas 拉起）
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;

fn parse_args() -> HashMap<String, String> {
    let mut map = HashMap::new();
    let mut args = std::env::args().skip(1);
    while let Some(k) = args.next() {
        if let Some(key) = k.strip_prefix("--") {
            if let Some(v) = args.next() {
                map.insert(key.to_string(), v);
            }
        }
    }
    map
}

fn nssm_path() -> PathBuf {
    let tools = std::env::var("RAN_TOOLS_DIR").unwrap_or_else(|_| "D:\\ran\\tools".into());
    PathBuf::from(tools).join("nssm").join("nssm.exe")
}

fn status_code(r: std::io::Result<std::process::ExitStatus>) -> i32 {
    match r {
        Ok(s) => s.code().unwrap_or(1),
        Err(e) => {
            eprintln!("ran-sidecar: {e}");
            1
        }
    }
}

fn install_sc_mysql(a: &HashMap<String, String>, svc: &str) -> i32 {
    let exe = a.get("exe").cloned().unwrap_or_default();
    let cfg = a.get("cfg").cloned().unwrap_or_default();
    status_code(
        Command::new(&exe)
            .args(["--install", svc, "--defaults-file", &cfg])
            .status(),
    )
}

fn install_sc_generic(a: &HashMap<String, String>, svc: &str) -> i32 {
    let exe = a.get("exe").cloned().unwrap_or_default();
    status_code(
        Command::new("sc")
            .args(["create", svc, "binPath=", &format!("\"{exe}\""), "start=", "auto"])
            .status(),
    )
}

fn install_nssm(a: &HashMap<String, String>, svc: &str) -> i32 {
    let exe = a.get("exe").cloned().unwrap_or_default();
    let cfg = a.get("cfg").cloned().unwrap_or_default();
    status_code(
        Command::new(nssm_path())
            .args(["install", svc, &exe, &cfg])
            .status(),
    )
}

fn remove_sc(svc: &str) -> i32 {
    let _ = Command::new("sc").args(["stop", svc]).status();
    status_code(Command::new("sc").args(["delete", svc]).status())
}

fn remove_nssm(svc: &str) -> i32 {
    let _ = Command::new(nssm_path()).args(["stop", svc]).status();
    status_code(
        Command::new(nssm_path())
            .args(["remove", svc, "confirm"])
            .status(),
    )
}

fn main() {
    let a = parse_args();
    let op = a.get("op").cloned().unwrap_or_default();
    let kind = a.get("kind").cloned().unwrap_or_default();
    let svc = a.get("svc").cloned().unwrap_or_default();

    let code = match (op.as_str(), kind.as_str()) {
        ("service_install", "sc_mysql") => install_sc_mysql(&a, &svc),
        ("service_install", "nssm_redis") => install_nssm(&a, &svc),
        ("service_install", _) => install_sc_generic(&a, &svc),
        ("service_remove", "nssm") => remove_nssm(&svc),
        ("service_remove", _) => remove_sc(&svc),
        _ => {
            eprintln!("ran-sidecar: unknown op/kind: {op}/{kind}");
            2
        }
    };
    std::process::exit(code);
}
