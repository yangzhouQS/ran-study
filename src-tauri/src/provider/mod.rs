use serde::{Deserialize, Serialize};

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

pub trait SoftwareProvider: Send + Sync {
    fn id(&self) -> &str;
    fn manifest(&self) -> Manifest;
    // install/start/stop/configure 等留给 P1 各 provider 实现
}

pub mod registry;
