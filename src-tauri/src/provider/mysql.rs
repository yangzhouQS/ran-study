use crate::download;
use crate::error::{RanError, RanResult};
use crate::provider::service;
use crate::provider::{process, ProgressCb, RunMode, RunStatus, SoftwareSpec, SoftwareProvider};
use async_trait::async_trait;
use std::path::Path;
use std::process::Command;

const DEFAULT_PORT: u16 = 3306;

pub struct MysqlProvider;

#[async_trait]
impl SoftwareProvider for MysqlProvider {
    fn id(&self) -> &str {
        "mysql"
    }

    fn manifest(&self) -> crate::provider::Manifest {
        crate::provider::Manifest {
            id: "mysql".into(),
            versions: vec![v("8.0.36", true), v("8.4.3", true)],
            download_url_template:
                "https://dev.mysql.com/get/Downloads/MySQL-${major}/mysql-${version}-winx64.zip".into(),
            archive: "zip".into(),
            mirror:
                "https://mirrors.tuna.tsinghua.edu.cn/mysql/downloads/MySQL-${major}/mysql-${version}-winx64.zip"
                    .into(),
        }
    }

    async fn install(
        &self,
        root: &Path,
        version: &str,
        run_mode: RunMode,
        progress: ProgressCb,
    ) -> RanResult<SoftwareSpec> {
        let major = version.split('.').take(2).collect::<Vec<_>>().join(".");
        let m = self.manifest();
        let mirror_pref = std::env::var("RAN_MIRROR").unwrap_or_default();
        let tmpl = if (mirror_pref == "tuna" || mirror_pref == "huawei") && !m.mirror.is_empty() {
            m.mirror
        } else {
            m.download_url_template
        };
        let url = tmpl
            .replace("${major}", &major)
            .replace("${version}", version);
        let install_path = root.join("env").join("mysql").join(format!("mysql-{version}"));
        let data_path = root.join("data").join("mysql").join(format!("mysql-{version}"));
        let config_path = install_path.join("my.ini");
        let bin_path = install_path.join("bin").join("mysqld.exe");
        let cache = root.join("cache");
        std::fs::create_dir_all(&cache)?;

        if install_path.exists() {
            return Err(RanError::Other(format!("MySQL {version} 已存在")));
        }

        progress(5, &format!("下载 MySQL {version}"));
        let zip = cache.join(format!("mysql-{version}-winx64.zip"));
        let p = progress.clone();
        download::download(&url, &zip, move |d, t| {
            let pct = if t > 0 { (d * 55 / t) as u32 + 5 } else { 5 };
            p(pct.min(60), &format!("下载 {d}/{t} 字节"));
        }, 0)
        .await?;

        progress(65, "校验并解压");
        download::install_from_zip(&zip, &install_path)?;
        if !bin_path.exists() {
            return Err(RanError::Other(format!(
                "解压后未找到 {}",
                bin_path.display()
            )));
        }

        progress(75, "初始化数据目录");
        std::fs::create_dir_all(&data_path)?;
        write_my_ini(&config_path, &install_path, &data_path, DEFAULT_PORT)?;
        let df = format!("--defaults-file={}", config_path.display());
        let st = Command::new(&bin_path)
            .arg(&df)
            .arg("--initialize-insecure")
            .status()?;
        if !st.success() {
            return Err(RanError::Other("mysqld --initialize-insecure 失败".into()));
        }

        let svc = if run_mode == RunMode::Service {
            Some(format!("ran-mysql-{version}"))
        } else {
            None
        };

        progress(100, "安装完成");
        Ok(SoftwareSpec {
            id: 0,
            provider: "mysql".into(),
            version: version.into(),
            install_path,
            bin_path,
            data_path,
            config_path,
            port: DEFAULT_PORT,
            run_mode,
            service_name: svc,
            linked: false,
        })
    }

    async fn uninstall(&self, spec: &SoftwareSpec) -> RanResult<()> {
        if spec.run_mode == RunMode::Service {
            if let Some(svc) = &spec.service_name {
                let _ = Command::new("sc").args(["stop", svc]).status();
                let _ = Command::new("sc").args(["delete", svc]).status();
            }
        }
        if spec.install_path.exists() {
            std::fs::remove_dir_all(&spec.install_path)?;
        }
        if spec.data_path.exists() {
            std::fs::remove_dir_all(&spec.data_path)?;
        }
        Ok(())
    }

    async fn start(&self, spec: &SoftwareSpec) -> RanResult<()> {
        match spec.run_mode {
            RunMode::Portable => {
                let cfg = format!("--defaults-file={}", spec.config_path.display());
                process::spawn_child(&spec.bin_path, &[cfg.as_str()], None)?;
                Ok(())
            }
            RunMode::Service => {
                let Some(svc) = &spec.service_name else {
                    return Err(RanError::Other("服务模式缺少服务名".into()));
                };
                service::sc_start(svc)
            }
        }
    }

    async fn stop(&self, spec: &SoftwareSpec) -> RanResult<()> {
        match spec.run_mode {
            RunMode::Portable => {
                let admin = spec.install_path.join("bin").join("mysqladmin.exe");
                let _ = Command::new(&admin)
                    .args(["-u", "root", "shutdown"])
                    .status();
                Ok(())
            }
            RunMode::Service => {
                if let Some(svc) = &spec.service_name {
                    service::sc_stop(svc)?;
                }
                Ok(())
            }
        }
    }

    async fn status(&self, spec: &SoftwareSpec) -> RanResult<RunStatus> {
        match spec.run_mode {
            RunMode::Portable => {
                if download::port_open("127.0.0.1", spec.port) {
                    Ok(RunStatus::Running)
                } else {
                    Ok(RunStatus::Stopped)
                }
            }
            RunMode::Service => {
                let Some(svc) = &spec.service_name else {
                    return Ok(RunStatus::Unknown);
                };
                let text = service::sc_query_status(svc)?;
                Ok(if service::parse_running(&text) {
                    RunStatus::Running
                } else {
                    RunStatus::Stopped
                })
            }
        }
    }
}

fn v(version: &str, lts: bool) -> crate::provider::ManifestVersion {
    crate::provider::ManifestVersion {
        version: version.into(),
        lts,
    }
}

fn write_my_ini(path: &Path, basedir: &Path, datadir: &Path, port: u16) -> RanResult<()> {
    let ini = format!(
        "[mysqld]\nbasedir=\"{}\"\ndatadir=\"{}\"\nport={}\ncharacter-set-server=utf8mb4\ncollation-server=utf8mb4_unicode_ci\nmax_connections=200\n",
        basedir.display(),
        datadir.display(),
        port
    );
    std::fs::write(path, ini)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn my_ini_has_port_and_charset() {
        let tmp = tempfile::tempdir().unwrap();
        let ini = tmp.path().join("my.ini");
        write_my_ini(&ini, tmp.path(), tmp.path(), 3307).unwrap();
        let s = std::fs::read_to_string(&ini).unwrap();
        assert!(s.contains("port=3307"));
        assert!(s.contains("utf8mb4"));
    }

    #[test]
    fn manifest_versions_nonempty() {
        let m = MysqlProvider.manifest();
        assert!(!m.versions.is_empty());
        assert!(m.download_url_template.contains("${version}"));
    }
}
