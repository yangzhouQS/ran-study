use crate::error::RanResult;
use rusqlite::Connection;
use std::path::Path;
use std::sync::Mutex;

pub struct Repo {
    pub conn: Mutex<Connection>,
}

impl Repo {
    pub fn open(config_dir: &Path) -> RanResult<Self> {
        std::fs::create_dir_all(config_dir)?;
        let conn = Connection::open(config_dir.join("ran.db"))?;
        Self::migrate(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    fn migrate(conn: &Connection) -> RanResult<()> {
        for sql in [
            "CREATE TABLE IF NOT EXISTS software(
                id INTEGER PRIMARY KEY,
                type TEXT, version TEXT, install_path TEXT, data_path TEXT,
                run_mode TEXT, service_name TEXT, status TEXT, is_active INTEGER)",
            "CREATE TABLE IF NOT EXISTS instances(
                id INTEGER PRIMARY KEY, software_id INTEGER, name TEXT,
                port INTEGER, config_path TEXT, pid INTEGER, status TEXT)",
            "CREATE TABLE IF NOT EXISTS pm2_apps(
                id INTEGER PRIMARY KEY, name TEXT, script TEXT, cwd TEXT,
                node_version TEXT, env_json TEXT, instances INTEGER,
                log_path TEXT, autostart INTEGER, status TEXT)",
            "CREATE TABLE IF NOT EXISTS tasks(
                id TEXT PRIMARY KEY, kind TEXT, target TEXT, status TEXT,
                progress INTEGER, message TEXT, log_path TEXT,
                created_at INTEGER, updated_at INTEGER)",
            "CREATE TABLE IF NOT EXISTS scheduled_tasks(
                id INTEGER PRIMARY KEY, name TEXT, command TEXT,
                trigger TEXT, enabled INTEGER, log_path TEXT)",
        ] {
            conn.execute(sql, [])?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_creates_tables() {
        let tmp = tempfile::tempdir().unwrap();
        let repo = Repo::open(tmp.path()).unwrap();
        let conn = repo.conn.lock().unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('software','tasks','pm2_apps')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 3);
    }
}
