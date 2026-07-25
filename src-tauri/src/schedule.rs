use crate::error::{RanError, RanResult};
use std::process::Command;

pub fn trigger_arg(trigger: &str) -> RanResult<&'static str> {
    match trigger {
        "onlogon" => Ok("ONLOGON"),
        "daily" => Ok("DAILY"),
        "weekly" => Ok("WEEKLY"),
        _ => Err(RanError::Other("未知触发器".into())),
    }
}

pub fn create(name: &str, command: &str, trigger: &str) -> RanResult<()> {
    let tn = format!("ran-{name}");
    let sc = trigger_arg(trigger)?;
    let st = Command::new("schtasks")
        .args(["/Create", "/F", "/TN", &tn, "/TR", command, "/SC", sc])
        .status()
        .map_err(|e| RanError::Other(e.to_string()))?;
    if !st.success() {
        return Err(RanError::Other("schtasks /Create 失败".into()));
    }
    Ok(())
}

pub fn run(name: &str) -> RanResult<()> {
    run_ignore(&["/Run", "/TN", &format!("ran-{name}")])
}
pub fn enable(name: &str) -> RanResult<()> {
    run_ignore(&["/Change", "/TN", &format!("ran-{name}"), "/ENABLE"])
}
pub fn disable(name: &str) -> RanResult<()> {
    run_ignore(&["/Change", "/TN", &format!("ran-{name}"), "/DISABLE"])
}
pub fn delete(name: &str) -> RanResult<()> {
    run_ignore(&["/Delete", "/F", "/TN", &format!("ran-{name}")])
}

fn run_ignore(args: &[&str]) -> RanResult<()> {
    let _ = Command::new("schtasks").args(args).status();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trigger_mapping() {
        assert_eq!(trigger_arg("daily").unwrap(), "DAILY");
        assert_eq!(trigger_arg("weekly").unwrap(), "WEEKLY");
        assert_eq!(trigger_arg("onlogon").unwrap(), "ONLOGON");
        assert!(trigger_arg("nope").is_err());
    }
}
