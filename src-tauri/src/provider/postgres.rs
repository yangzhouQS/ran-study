use crate::download;
use crate::error::{RanError, RanResult};
use crate::provider::service;
use crate::provider::{Manifest, ProgressCb, RunMode, RunStatus, SoftwareSpec, SoftwareProvider};
use async_trait::async_trait;
use std::process::Command;

pub struct PostgresProvider;

#[async_trait]
impl SoftwareProvider for PostgresProvider {
    fn id(&self) -> &str {
        "postgres"
    }

    fn manifest(&self) -> Manifest {
        Manifest {
            id: "postgres".into(),
            versions: vec![],
            download_url_template: String::new(),
            archive: "zip".into(),
            mirror: String::new(),
        }
    }

    async fn install(
        &self,
        _root: &std::path::Path,
        _version: &str,
        _run_mode: RunMode,
        _progress: ProgressCb,
    ) -> RanResult<SoftwareSpec> {
        Err(RanError::Other(
            "PostgreSQL 暂不支持在线安装，请用「接入已安装」登记".into(),
        ))
    }

    async fn uninstall(&self, _spec: &SoftwareSpec) -> RanResult<()> {
        Ok(())
    }

    async fn start(&self, spec: &SoftwareSpec) -> RanResult<()> {
        match spec.run_mode {
            RunMode::Portable => {
                let data = spec.data_path.to_string_lossy().to_string();
                if data.is_empty() {
                    return Err(RanError::Other("PostgreSQL 缺少 data 目录".into()));
                }
                let st = Command::new(&spec.bin_path)
                    .args(["start", "-D", &data, "-w"])
                    .status()?;
                if !st.success() {
                    return Err(RanError::Other("pg_ctl start 失败".into()));
                }
                Ok(())
            }
            RunMode::Service => {
                if let Some(svc) = &spec.service_name {
                    service::sc_start(svc)
                } else {
                    Err(RanError::Other("服务模式缺少服务名".into()))
                }
            }
        }
    }

    async fn stop(&self, spec: &SoftwareSpec) -> RanResult<()> {
        match spec.run_mode {
            RunMode::Portable => {
                let data = spec.data_path.to_string_lossy().to_string();
                let _ = Command::new(&spec.bin_path)
                    .args(["stop", "-D", &data, "-m", "fast"])
                    .status();
                Ok(())
            }
            RunMode::Service => {
                if let Some(svc) = &spec.service_name {
                    service::sc_stop(svc)
                } else {
                    Ok(())
                }
            }
        }
    }

    async fn status(&self, spec: &SoftwareSpec) -> RanResult<RunStatus> {
        Ok(if download::port_open("127.0.0.1", spec.port) {
            RunStatus::Running
        } else {
            RunStatus::Stopped
        })
    }
}
