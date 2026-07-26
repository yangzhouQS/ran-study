use crate::error::{RanError, RanResult};
use crate::provider::{process, service, RunMode, SoftwareSpec};
use crate::{download, elevation};
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

// ---------- MySQL 多实例 ----------
pub struct InstanceCreated {
    pub port: u16,
    pub data_path: PathBuf,
    pub config_path: PathBuf,
    pub service_name: Option<String>,
}

fn write_my_ini_port(path: &Path, basedir: &Path, datadir: &Path, port: u16) -> RanResult<()> {
    let ini = format!(
        "[mysqld]\nbasedir=\"{}\"\ndatadir=\"{}\"\nport={}\ncharacter-set-server=utf8mb4\ncollation-server=utf8mb4_unicode_ci\nmax_connections=100\n",
        basedir.display(),
        datadir.display(),
        port
    );
    std::fs::write(path, ini)?;
    Ok(())
}

pub fn create_instance(spec: &SoftwareSpec, name: &str, port: u16, run_mode: RunMode) -> RanResult<InstanceCreated> {
    let parent = spec.data_path.parent().unwrap_or(&spec.data_path);
    let data_path = parent.join(format!("inst-{name}"));
    if data_path.exists() {
        return Err(RanError::Other(format!("实例 {name} 已存在")));
    }
    std::fs::create_dir_all(&data_path)?;
    let config_path = data_path.join("my.ini");
    write_my_ini_port(&config_path, &spec.install_path, &data_path, port)?;

    let df = format!("--defaults-file={}", config_path.display());
    let st = Command::new(&spec.bin_path)
        .arg(&df)
        .arg("--initialize-insecure")
        .status()?;
    if !st.success() {
        return Err(RanError::Other("实例 initialize-insecure 失败".into()));
    }

    let service_name = if run_mode == RunMode::Service {
        Some(format!("ran-mysql-{name}"))
    } else {
        None
    };
    if run_mode == RunMode::Service {
        if let Some(svc) = &service_name {
            let fake = SoftwareSpec {
                id: 0,
                provider: "mysql".into(),
                version: spec.version.clone(),
                install_path: spec.install_path.clone(),
                bin_path: spec.bin_path.clone(),
                data_path: data_path.clone(),
                config_path: config_path.clone(),
                port,
                run_mode,
                service_name: Some(svc.clone()),
            };
            if let Ok(sc) = elevation::sidecar_path() {
                let args = elevation::build_service_install_args(&fake);
                let _ = elevation::run_elevated(sc.to_str().unwrap(), &args);
            }
        }
    }
    Ok(InstanceCreated {
        port,
        data_path,
        config_path,
        service_name,
    })
}

pub fn start_instance(spec: &SoftwareSpec, inst: &InstanceCreated) -> RanResult<()> {
    match inst.service_name {
        Some(ref svc) => service::sc_start(svc),
        None => {
            let df = format!("--defaults-file={}", inst.config_path.display());
            process::spawn_child(&spec.bin_path, &[df.as_str()], None)?;
            Ok(())
        }
    }
}

pub fn stop_instance(spec: &SoftwareSpec, inst: &InstanceCreated) -> RanResult<()> {
    match inst.service_name {
        Some(ref svc) => service::sc_stop(svc),
        None => {
            let admin = spec.bin_path.parent().unwrap().join(if cfg!(windows) {
                "mysqladmin.exe"
            } else {
                "mysqladmin"
            });
            let _ = Command::new(&admin)
                .args(["-P", &inst.port.to_string(), "-u", "root", "shutdown"])
                .status();
            Ok(())
        }
    }
}

pub fn status_instance(inst: &InstanceCreated) -> RanResult<bool> {
    match inst.service_name {
        Some(ref svc) => {
            let text = service::sc_query_status(svc)?;
            Ok(service::parse_running(&text))
        }
        None => Ok(download::port_open("127.0.0.1", inst.port)),
    }
}

pub fn delete_instance(spec: &SoftwareSpec, inst: &InstanceCreated) -> RanResult<()> {
    let _ = stop_instance(spec, inst);
    if let Some(svc) = &inst.service_name {
        if let Ok(sc) = elevation::sidecar_path() {
            let fake = SoftwareSpec {
                id: 0,
                provider: "mysql".into(),
                version: spec.version.clone(),
                install_path: spec.install_path.clone(),
                bin_path: spec.bin_path.clone(),
                data_path: inst.data_path.clone(),
                config_path: inst.config_path.clone(),
                port: inst.port,
                run_mode: RunMode::Service,
                service_name: Some(svc.clone()),
            };
            let _ = elevation::run_elevated(sc.to_str().unwrap(), &elevation::build_service_remove_args(&fake));
        }
    }
    if inst.data_path.exists() {
        std::fs::remove_dir_all(&inst.data_path)?;
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
