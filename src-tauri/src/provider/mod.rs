use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestVersion {
    pub version: String,
    pub lts: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub id: String,
    pub versions: Vec<ManifestVersion>,
    pub download_url_template: String,
    pub archive: String,
    pub mirror: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum RunMode {
    Portable,
    Service,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum RunStatus {
    Running,
    Stopped,
    Unknown,
}

/// 运行时实例描述（与 DB software 行一一映射）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoftwareSpec {
    pub id: i64,
    pub provider: String,
    pub version: String,
    pub install_path: PathBuf,
    pub bin_path: PathBuf,
    pub data_path: PathBuf,
    pub config_path: PathBuf,
    pub port: u16,
    pub run_mode: RunMode,
    pub service_name: Option<String>,
    /// true = 外部接入（不下载、卸载只删登记不删文件）
    #[serde(default)]
    pub linked: bool,
}

/// 进度回调：(百分比, 消息)
pub type ProgressCb = Arc<dyn Fn(u32, &str) + Send + Sync>;

#[async_trait]
pub trait SoftwareProvider: Send + Sync {
    fn id(&self) -> &str;
    fn manifest(&self) -> Manifest;
    /// 下载→校验→解压→初始化；返回 spec（id 由调用方落库后填）
    async fn install(
        &self,
        root: &std::path::Path,
        version: &str,
        run_mode: RunMode,
        progress: ProgressCb,
    ) -> crate::error::RanResult<SoftwareSpec>;
    async fn uninstall(&self, spec: &SoftwareSpec) -> crate::error::RanResult<()>;
    async fn start(&self, spec: &SoftwareSpec) -> crate::error::RanResult<()>;
    async fn stop(&self, spec: &SoftwareSpec) -> crate::error::RanResult<()>;
    async fn status(&self, spec: &SoftwareSpec) -> crate::error::RanResult<RunStatus>;
}

pub mod process;
pub mod service;
pub mod mysql;
pub mod redis;
pub mod postgres;
pub mod registry;
