use serde::Serialize;
use std::sync::Mutex;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
pub enum RanError {
    #[error("io error: {0}")]
    Io(String),
    #[error("db error: {0}")]
    Db(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("{0}")]
    Other(String),
}

impl From<std::io::Error> for RanError {
    fn from(e: std::io::Error) -> Self {
        RanError::Io(e.to_string())
    }
}

impl From<rusqlite::Error> for RanError {
    fn from(e: rusqlite::Error) -> Self {
        RanError::Db(e.to_string())
    }
}

pub type RanResult<T> = Result<T, RanError>;

/// 安全获取 Mutex 锁（Mutex 中毒时恢复而非 panic）
pub fn safe_lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}
