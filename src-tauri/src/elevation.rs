use crate::error::RanResult;

/// 构造交给提权 sidecar 执行的参数向量（P1 起由真实 sidecar 解析）
pub fn build_sidecar_args(op: &str, target: &str) -> Vec<String> {
    vec!["--op".into(), op.into(), "--target".into(), target.into()]
}

/// 以管理员身份拉起 sidecar（触发系统 UAC）。P0 仅封装，P1 接入真实 sidecar 调用
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

    #[test]
    fn build_sidecar_args_shape() {
        let args = build_sidecar_args("service_install", "ran-redis-7.2.4");
        assert_eq!(
            args,
            vec!["--op", "service_install", "--target", "ran-redis-7.2.4"]
        );
    }
}
