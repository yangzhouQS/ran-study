use crate::error::RanResult;
use crate::provider::SoftwareSpec;
use std::path::PathBuf;

/// P0 演示用：构造通用 sidecar 参数（保留以兼容既有测试）
pub fn build_sidecar_args(op: &str, target: &str) -> Vec<String> {
    vec!["--op".into(), op.into(), "--target".into(), target.into()]
}

/// 定位 ran-sidecar.exe：与当前 exe 同目录（dev: target/debug）
pub fn sidecar_path() -> RanResult<PathBuf> {
    let exe =
        std::env::current_exe().map_err(|e| crate::error::RanError::Other(e.to_string()))?;
    let dir = exe
        .parent()
        .ok_or_else(|| crate::error::RanError::Other("无法定位 exe 目录".into()))?;
    Ok(dir.join(if cfg!(windows) {
        "ran-sidecar.exe"
    } else {
        "ran-sidecar"
    }))
}

/// 构造交给 sidecar 的服务安装参数
pub fn build_service_install_args(spec: &SoftwareSpec) -> Vec<String> {
    let kind = match spec.provider.as_str() {
        "mysql" => "sc_mysql",
        "redis" => "nssm_redis",
        _ => "sc_generic",
    };
    vec![
        "--op".into(),
        "service_install".into(),
        "--kind".into(),
        kind.into(),
        "--svc".into(),
        spec.service_name.clone().unwrap_or_default(),
        "--exe".into(),
        spec.bin_path.to_string_lossy().to_string(),
        "--cfg".into(),
        spec.config_path.to_string_lossy().to_string(),
    ]
}

/// 构造交给 sidecar 的服务卸载参数
pub fn build_service_remove_args(spec: &SoftwareSpec) -> Vec<String> {
    let kind = if spec.provider == "redis" {
        "nssm"
    } else {
        "sc"
    };
    vec![
        "--op".into(),
        "service_remove".into(),
        "--kind".into(),
        kind.into(),
        "--svc".into(),
        spec.service_name.clone().unwrap_or_default(),
    ]
}

/// 自定义应用通用 nssm 注册参数（exe + args + cwd）
pub fn build_nssm_install_args(svc: &str, exe: &str, args: &str, cwd: &str) -> Vec<String> {
    vec![
        "--op".into(),
        "service_install".into(),
        "--kind".into(),
        "nssm".into(),
        "--svc".into(),
        svc.into(),
        "--exe".into(),
        exe.into(),
        "--cfg".into(),
        cwd.into(),
        "--extra".into(),
        args.into(),
    ]
}

pub fn build_nssm_remove_args(svc: &str) -> Vec<String> {
    vec![
        "--op".into(),
        "service_remove".into(),
        "--kind".into(),
        "nssm".into(),
        "--svc".into(),
        svc.into(),
    ]
}

/// 以管理员身份拉起 sidecar（触发系统 UAC）
pub fn run_elevated(sidecar_exe: &str, args: &[String]) -> RanResult<()> {
    let mut cmd = runas::Command::new(sidecar_exe);
    for a in args {
        cmd.arg(a);
    }
    cmd.status()
        .map_err(|e| crate::error::RanError::Other(e.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::provider::RunMode;
    use std::path::PathBuf;

    fn spec(provider: &str, svc: Option<&str>) -> SoftwareSpec {
        SoftwareSpec {
            id: 1,
            provider: provider.into(),
            version: "1".into(),
            install_path: PathBuf::from("/a"),
            bin_path: PathBuf::from("/a/mysqld.exe"),
            data_path: PathBuf::from("/d"),
            config_path: PathBuf::from("/a/my.ini"),
            port: 3306,
            run_mode: RunMode::Service,
            service_name: svc.map(String::from),
            linked: false,
        }
    }

    #[test]
    fn build_sidecar_args_shape() {
        let args = build_sidecar_args("service_install", "ran-redis-7.2.4");
        assert_eq!(
            args,
            vec!["--op", "service_install", "--target", "ran-redis-7.2.4"]
        );
    }

    #[test]
    fn service_install_args_mysql() {
        let args = build_service_install_args(&spec("mysql", Some("ran-mysql-8")));
        assert!(args.contains(&"--kind".into()) && args.contains(&"sc_mysql".into()));
        assert!(args.contains(&"ran-mysql-8".into()));
    }

    #[test]
    fn service_remove_args_redis_nssm() {
        let args = build_service_remove_args(&spec("redis", Some("ran-redis-7")));
        assert!(args.contains(&"nssm".into()));
        assert!(args.contains(&"ran-redis-7".into()));
    }
}
