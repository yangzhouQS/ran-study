use crate::download;
use crate::error::{RanError, RanResult};
use crate::provider::service;
use crate::provider::{process, ProgressCb, RunMode, RunStatus, SoftwareSpec, SoftwareProvider};
use async_trait::async_trait;
use std::path::{Path, PathBuf};
use std::process::Command;

const DEFAULT_PORT: u16 = 6379;
// tporadowski 移植版（Windows x64）
const URL: &str =
    "https://github.com/tporadowski/redis/releases/download/v${version}/Redis-x64-${version}.zip";

pub struct RedisProvider;

/// install_path = <root>/env/redis/redis-x  →  <root>/tools
fn tools_dir_from(install_path: &Path) -> PathBuf {
    install_path
        .ancestors()
        .nth(3)
        .unwrap_or(install_path)
        .join("tools")
}

#[async_trait]
impl SoftwareProvider for RedisProvider {
    fn id(&self) -> &str {
        "redis"
    }

    fn manifest(&self) -> crate::provider::Manifest {
        crate::provider::Manifest {
            id: "redis".into(),
            versions: vec![v("5.0.14.1", false)],
            download_url_template: URL.into(),
            archive: "zip".into(),
            mirror: String::new(),
        }
    }

    async fn install(
        &self,
        root: &Path,
        version: &str,
        run_mode: RunMode,
        progress: ProgressCb,
    ) -> RanResult<SoftwareSpec> {
        let url = URL.replace("${version}", version);
        let install_path = root.join("env").join("redis").join(format!("redis-{version}"));
        let data_path = root.join("data").join("redis").join(format!("redis-{version}"));
        let config_path = install_path.join("redis.conf");
        let bin_path = install_path.join("redis-server.exe");
        let cache = root.join("cache");
        std::fs::create_dir_all(&cache)?;

        if install_path.exists() {
            return Err(RanError::Other(format!("Redis {version} 已存在")));
        }

        if run_mode == RunMode::Service {
            progress(2, "置备 nssm");
            let p2 = progress.clone();
            service::ensure_nssm(&root.join("tools"), move |pct, msg| {
                p2(pct / 4, msg);
            })
            .await?;
        }

        progress(10, &format!("下载 Redis {version}"));
        let zip = cache.join(format!("redis-{version}.zip"));
        let p = progress.clone();
        download::download(&url, &zip, move |d, t| {
            let pct = if t > 0 { (d * 50 / t) as u32 + 10 } else { 10 };
            p(pct.min(60), &format!("下载 {d}/{t}"));
        }, 0)
        .await?;

        progress(70, "解压");
        download::install_from_zip(&zip, &install_path)?;
        if !bin_path.exists() {
            return Err(RanError::Other("解压后未找到 redis-server.exe".into()));
        }

        progress(85, "生成配置");
        std::fs::create_dir_all(&data_path)?;
        write_redis_conf(&config_path, DEFAULT_PORT, &data_path)?;

        let svc = if run_mode == RunMode::Service {
            Some(format!("ran-redis-{version}"))
        } else {
            None
        };
        progress(100, "安装完成");
        Ok(SoftwareSpec {
            id: 0,
            provider: "redis".into(),
            version: version.into(),
            install_path,
            bin_path,
            data_path,
            config_path,
            port: DEFAULT_PORT,
            run_mode,
            service_name: svc,
        })
    }

    async fn uninstall(&self, spec: &SoftwareSpec) -> RanResult<()> {
        if spec.run_mode == RunMode::Service {
            if let Some(svc) = &spec.service_name {
                let _ = service::nssm_stop(svc, &tools_dir_from(&spec.install_path));
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
                let cfg = spec.config_path.to_string_lossy().to_string();
                process::spawn_child(&spec.bin_path, &[cfg.as_str()], Some(&spec.install_path))?;
                Ok(())
            }
            RunMode::Service => {
                let Some(svc) = &spec.service_name else {
                    return Err(RanError::Other("缺服务名".into()));
                };
                service::nssm_start(svc, &tools_dir_from(&spec.install_path))
            }
        }
    }

    async fn stop(&self, spec: &SoftwareSpec) -> RanResult<()> {
        match spec.run_mode {
            RunMode::Portable => {
                let cli = spec.install_path.join("redis-cli.exe");
                let _ = Command::new(&cli)
                    .args(["-p", &spec.port.to_string(), "shutdown"])
                    .status();
                Ok(())
            }
            RunMode::Service => {
                if let Some(svc) = &spec.service_name {
                    service::nssm_stop(svc, &tools_dir_from(&spec.install_path))?;
                }
                Ok(())
            }
        }
    }

    async fn status(&self, spec: &SoftwareSpec) -> RanResult<RunStatus> {
        if download::port_open("127.0.0.1", spec.port) {
            Ok(RunStatus::Running)
        } else {
            Ok(RunStatus::Stopped)
        }
    }
}

fn v(version: &str, lts: bool) -> crate::provider::ManifestVersion {
    crate::provider::ManifestVersion {
        version: version.into(),
        lts,
    }
}

fn write_redis_conf(path: &Path, port: u16, dir: &Path) -> RanResult<()> {
    let conf = format!(
        "port {port}\nbind 127.0.0.1\ndir \"{d}\"\nprotected-mode yes\nappendonly yes\n",
        d = dir.display()
    );
    std::fs::write(path, conf)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redis_conf_has_port_and_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("redis.conf");
        write_redis_conf(&p, 6380, tmp.path()).unwrap();
        let s = std::fs::read_to_string(&p).unwrap();
        assert!(s.contains("port 6380"));
        assert!(s.contains("appendonly yes"));
    }

    #[test]
    fn tools_dir_from_install_path() {
        let ip = PathBuf::from("D:/ran/env/redis/redis-5.0.14.1");
        assert_eq!(tools_dir_from(&ip), PathBuf::from("D:/ran/tools"));
    }
}
