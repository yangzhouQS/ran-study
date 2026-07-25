use crate::error::RanResult;
use crate::provider::{RunMode, SoftwareSpec};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
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

    pub fn insert_software(&self, spec: &SoftwareSpec) -> RanResult<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO software(type,version,install_path,data_path,run_mode,service_name,status,is_active)
             VALUES (?1,?2,?3,?4,?5,?6,?7,1)",
            rusqlite::params![
                spec.provider,
                spec.version,
                spec.install_path.to_string_lossy(),
                spec.data_path.to_string_lossy(),
                run_mode_str(spec.run_mode),
                spec.service_name.as_deref().unwrap_or(""),
                "stopped",
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn list_software(&self) -> RanResult<Vec<SoftwareSpec>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt =
            conn.prepare("SELECT id,type,version,install_path,data_path,run_mode,service_name FROM software")?;
        let rows = stmt.query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, String>(6)?,
            ))
        })?;
        let mut out = Vec::new();
        for row in rows {
            let (id, prov, ver, inst, data, rm, svc) = row?;
            let inst_p = PathBuf::from(&inst);
            out.push(SoftwareSpec {
                id,
                provider: prov.clone(),
                version: ver,
                bin_path: bin_for_provider(&prov, &inst_p),
                install_path: inst_p.clone(),
                data_path: PathBuf::from(&data),
                config_path: config_for_provider(&prov, &inst_p),
                port: default_port(&prov),
                run_mode: parse_run_mode(&rm),
                service_name: if svc.is_empty() { None } else { Some(svc) },
            });
        }
        Ok(out)
    }

    pub fn update_status(&self, id: i64, status: &str) -> RanResult<()> {
        self.conn.lock().unwrap().execute(
            "UPDATE software SET status=?1 WHERE id=?2",
            rusqlite::params![status, id],
        )?;
        Ok(())
    }

    pub fn delete_software(&self, id: i64) -> RanResult<()> {
        self.conn
            .lock()
            .unwrap()
            .execute("DELETE FROM software WHERE id=?1", rusqlite::params![id])?;
        Ok(())
    }

    pub fn insert_pm2_app(&self, a: &Pm2AppRow) -> RanResult<i64> {
        let c = self.conn.lock().unwrap();
        c.execute(
            "INSERT INTO pm2_apps(name,script,cwd,node_version,env_json,instances,log_path,autostart,status)
             VALUES (?1,?2,?3,?4,?5,1,'',?6,?7)",
            rusqlite::params![
                a.name,
                a.script,
                a.cwd,
                a.node_version,
                a.env_json,
                if a.autostart { 1 } else { 0 },
                "stopped"
            ],
        )?;
        Ok(c.last_insert_rowid())
    }

    pub fn list_pm2_apps(&self) -> RanResult<Vec<Pm2AppRow>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id,name,script,cwd,node_version,env_json,autostart,status FROM pm2_apps",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(Pm2AppRow {
                id: r.get(0)?,
                name: r.get(1)?,
                script: r.get(2)?,
                cwd: r.get(3)?,
                node_version: r.get::<_, Option<String>>(4)?.unwrap_or_default(),
                env_json: r.get::<_, Option<String>>(5)?.unwrap_or_default(),
                autostart: r.get::<_, i64>(6)? != 0,
                status: r.get::<_, Option<String>>(7)?.unwrap_or_default(),
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    pub fn delete_pm2_app(&self, id: i64) -> RanResult<()> {
        self.conn
            .lock()
            .unwrap()
            .execute("DELETE FROM pm2_apps WHERE id=?1", rusqlite::params![id])?;
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pm2AppRow {
    #[serde(default)]
    pub id: i64,
    pub name: String,
    pub script: String,
    pub cwd: String,
    pub node_version: String,
    pub env_json: String,
    pub autostart: bool,
    #[serde(default)]
    pub status: String,
}

fn run_mode_str(m: RunMode) -> &'static str {
    match m {
        RunMode::Portable => "portable",
        RunMode::Service => "service",
    }
}

fn parse_run_mode(s: &str) -> RunMode {
    if s == "service" {
        RunMode::Service
    } else {
        RunMode::Portable
    }
}

fn bin_for_provider(prov: &str, inst: &Path) -> PathBuf {
    match prov {
        "mysql" => inst.join("bin").join("mysqld.exe"),
        _ => inst.join("redis-server.exe"),
    }
}

fn config_for_provider(prov: &str, inst: &Path) -> PathBuf {
    match prov {
        "mysql" => inst.join("my.ini"),
        _ => inst.join("redis.conf"),
    }
}

fn default_port(prov: &str) -> u16 {
    match prov {
        "mysql" => 3306,
        "redis" => 6379,
        _ => 0,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledTaskRow {
    #[serde(default)]
    pub id: i64,
    pub name: String,
    pub command: String,
    pub trigger: String,
    #[serde(default)]
    pub enabled: bool,
}

impl Repo {
    pub fn insert_scheduled(&self, t: &ScheduledTaskRow) -> RanResult<i64> {
        let c = self.conn.lock().unwrap();
        c.execute(
            "INSERT INTO scheduled_tasks(name,command,trigger,enabled,log_path)
             VALUES (?1,?2,?3,?4,'')",
            rusqlite::params![t.name, t.command, t.trigger, if t.enabled { 1 } else { 0 }],
        )?;
        Ok(c.last_insert_rowid())
    }

    pub fn list_scheduled(&self) -> RanResult<Vec<ScheduledTaskRow>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt =
            conn.prepare("SELECT id,name,command,trigger,enabled FROM scheduled_tasks")?;
        let rows = stmt.query_map([], |r| {
            Ok(ScheduledTaskRow {
                id: r.get(0)?,
                name: r.get(1)?,
                command: r.get(2)?,
                trigger: r.get(3)?,
                enabled: r.get::<_, i64>(4)? != 0,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    pub fn delete_scheduled(&self, id: i64) -> RanResult<()> {
        self.conn.lock().unwrap().execute(
            "DELETE FROM scheduled_tasks WHERE id=?1",
            rusqlite::params![id],
        )?;
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
