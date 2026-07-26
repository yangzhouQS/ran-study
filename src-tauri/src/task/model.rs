use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TaskStatus {
    Queued,
    Running,
    Done,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub kind: String,
    pub target: String,
    pub status: TaskStatus,
    pub progress: u32,
    pub message: String,
    pub log_path: String,
    pub created_at: i64,
    pub updated_at: i64,
}
