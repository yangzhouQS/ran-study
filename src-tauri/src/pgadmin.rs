use crate::error::{RanError, RanResult};
use crate::provider::SoftwareSpec;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

fn psql_exe(spec: &SoftwareSpec) -> PathBuf {
    spec.bin_path
        .parent().unwrap_or(std::path::Path::new("."))
        .join(if cfg!(windows) { "psql.exe" } else { "psql" })
}
fn pg_dump_exe(spec: &SoftwareSpec) -> PathBuf {
    spec.bin_path
        .parent().unwrap_or(std::path::Path::new("."))
        .join(if cfg!(windows) { "pg_dump.exe" } else { "pg_dump" })
}

fn base(exe: &Path, spec: &SoftwareSpec, pw: &str) -> Command {
    let mut c = Command::new(exe);
    c.args([
        "-U",
        "postgres",
        "-h",
        "127.0.0.1",
        "-p",
        &spec.port.to_string(),
    ]);
    if !pw.is_empty() {
        c.env("PGPASSWORD", pw);
    }
    c
}

fn check(out: std::process::Output) -> RanResult<String> {
    if !out.status.success() {
        return Err(RanError::Other(String::from_utf8_lossy(&out.stderr).to_string()));
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

pub fn run_query(spec: &SoftwareSpec, pw: &str, sql: &str) -> RanResult<String> {
    let out = base(&psql_exe(spec), spec, pw)
        .args(["-c", sql])
        .output()?;
    check(out)
}

fn is_system_db(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "postgres" | "template0" | "template1"
    )
}

pub fn list_databases(spec: &SoftwareSpec, pw: &str) -> RanResult<Vec<String>> {
    let out = base(&psql_exe(spec), spec, pw)
        .args([
            "-t",
            "-A",
            "-c",
            "SELECT datname FROM pg_database WHERE datistemplate=false ORDER BY 1",
        ])
        .output()?;
    let text = check(out)?;
    Ok(text
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|n| !n.is_empty() && !is_system_db(n))
        .collect())
}

pub fn create_database(
    spec: &SoftwareSpec,
    pw: &str,
    name: &str,
    user_pw: &Option<String>,
) -> RanResult<()> {
    let mut sql = format!("CREATE DATABASE \"{}\";", name);
    if let Some(p) = user_pw {
        sql.push_str(&format!(
            "CREATE ROLE \"{}\" LOGIN PASSWORD '{}';",
            name, p
        ));
    }
    run_query(spec, pw, &sql)?;
    Ok(())
}

pub fn change_password(spec: &SoftwareSpec, pw: &str, new_pw: &str) -> RanResult<()> {
    run_query(
        spec,
        pw,
        &format!("ALTER USER postgres PASSWORD '{}';", new_pw),
    )?;
    Ok(())
}

pub fn backup(spec: &SoftwareSpec, pw: &str, db: &str, dest: &Path) -> RanResult<()> {
    let out = base(&pg_dump_exe(spec), spec, pw).args(["-d", db]).output()?;
    let dump = check(out)?;
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(dest, dump)?;
    Ok(())
}

pub fn import(spec: &SoftwareSpec, pw: &str, db: &str, src: &Path) -> RanResult<()> {
    let f = std::fs::File::open(src)?;
    let st = base(&psql_exe(spec), spec, pw)
        .args(["-d", db])
        .stdin(Stdio::from(f))
        .status()?;
    if !st.success() {
        return Err(RanError::Other("psql 导入失败".into()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn system_db_filter() {
        assert!(is_system_db("postgres"));
        assert!(is_system_db("template0"));
        assert!(!is_system_db("mydb"));
    }
}
