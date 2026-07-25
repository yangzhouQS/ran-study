use crate::error::{RanError, RanResult};
use crate::provider::SoftwareSpec;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

fn mysql_exe(spec: &SoftwareSpec) -> PathBuf {
    spec.bin_path
        .parent()
        .unwrap()
        .join(if cfg!(windows) { "mysql.exe" } else { "mysql" })
}
fn mysqldump_exe(spec: &SoftwareSpec) -> PathBuf {
    spec.bin_path
        .parent()
        .unwrap()
        .join(if cfg!(windows) { "mysqldump.exe" } else { "mysqldump" })
}

fn base(exe: &Path, spec: &SoftwareSpec, pw: &str) -> Command {
    let mut c = Command::new(exe);
    c.args([
        "-u",
        "root",
        "-h",
        "127.0.0.1",
        "-P",
        &spec.port.to_string(),
        "--default-character-set=utf8mb4",
    ]);
    if !pw.is_empty() {
        c.env("MYSQL_PWD", pw);
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
    let out = base(&mysql_exe(spec), spec, pw)
        .args(["-e", sql])
        .output()?;
    check(out)
}

pub fn list_databases(spec: &SoftwareSpec, pw: &str) -> RanResult<Vec<String>> {
    let text = run_query(spec, pw, "SHOW DATABASES")?;
    Ok(parse_databases(&text))
}

pub fn parse_databases(text: &str) -> Vec<String> {
    text.lines()
        .skip(1)
        .map(|l| l.trim().to_string())
        .filter(|n| !n.is_empty() && !is_system_db(n))
        .collect()
}

fn is_system_db(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "information_schema" | "mysql" | "performance_schema" | "sys"
    )
}

pub fn create_database(
    spec: &SoftwareSpec,
    pw: &str,
    name: &str,
    user_pw: &Option<String>,
) -> RanResult<()> {
    let mut sql = format!(
        "CREATE DATABASE IF NOT EXISTS `{n}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
        n = name
    );
    if let Some(p) = user_pw {
        sql.push_str(&format!(
            "CREATE USER IF NOT EXISTS '{n}'@'localhost' IDENTIFIED BY '{p}'; \
             GRANT ALL PRIVILEGES ON `{n}`.* TO '{n}'@'localhost'; FLUSH PRIVILEGES;",
            n = name,
            p = p
        ));
    }
    run_query(spec, pw, &sql)?;
    Ok(())
}

pub fn change_root_password(spec: &SoftwareSpec, old_pw: &str, new_pw: &str) -> RanResult<()> {
    run_query(
        spec,
        old_pw,
        &format!(
            "ALTER USER 'root'@'localhost' IDENTIFIED BY '{p}'; FLUSH PRIVILEGES;",
            p = new_pw
        ),
    )?;
    Ok(())
}

pub fn backup(
    spec: &SoftwareSpec,
    pw: &str,
    db: &str,
    dest: Option<&Path>,
) -> RanResult<PathBuf> {
    let dest = match dest {
        Some(p) if !p.as_os_str().is_empty() => p.to_path_buf(),
        _ => {
            let ts = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
            spec.data_path.join(format!("{db}-{ts}.sql"))
        }
    };
    let out = base(&mysqldump_exe(spec), spec, pw)
        .args(["--databases", db])
        .output()?;
    let dump = check(out)?;
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&dest, dump)?;
    Ok(dest)
}

pub fn import(spec: &SoftwareSpec, pw: &str, db: &str, src: &Path) -> RanResult<()> {
    let f = std::fs::File::open(src)?;
    let st = base(&mysql_exe(spec), spec, pw)
        .arg(db)
        .stdin(Stdio::from(f))
        .status()?;
    if !st.success() {
        return Err(RanError::Other("mysql 导入失败".into()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_databases_skips_system() {
        let text = "Database\ninformation_schema\nmysql\nmydb\napp\ntest\nperformance_schema\nsys\n";
        let v = parse_databases(text);
        assert_eq!(v, vec!["mydb", "app", "test"]);
    }
}
