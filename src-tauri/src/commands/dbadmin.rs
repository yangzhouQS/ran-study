use super::AppState;
use crate::dbadmin::{self, InstanceCreated};
use crate::error::{RanError, RanResult};
use crate::provider::{RunMode, SoftwareSpec};
use crate::repo::InstanceRow;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

fn load_mysql(state: &State<'_, Arc<AppState>>, id: i64) -> RanResult<SoftwareSpec> {
    state
        .repo
        .list_software()?
        .into_iter()
        .find(|s| s.id == id && s.provider == "mysql")
        .ok_or_else(|| RanError::NotFound(format!("mysql {id}")))
}

#[tauri::command]
pub fn list_mysql_databases(state: State<'_, Arc<AppState>>, id: i64) -> RanResult<Vec<String>> {
    let spec = load_mysql(&state, id)?;
    let pw = state.repo.get_root_pw(id)?;
    dbadmin::list_databases(&spec, &pw)
}

#[tauri::command]
pub fn create_mysql_database(
    state: State<'_, Arc<AppState>>,
    id: i64,
    name: String,
    password: Option<String>,
) -> RanResult<()> {
    let spec = load_mysql(&state, id)?;
    let pw = state.repo.get_root_pw(id)?;
    dbadmin::create_database(&spec, &pw, &name, &password)
}

#[tauri::command]
pub fn change_root_password(
    state: State<'_, Arc<AppState>>,
    id: i64,
    new_password: String,
) -> RanResult<()> {
    let spec = load_mysql(&state, id)?;
    let old = state.repo.get_root_pw(id)?;
    dbadmin::change_root_password(&spec, &old, &new_password)?;
    state.repo.set_root_pw(id, &new_password)
}

#[tauri::command]
pub fn backup_mysql(
    state: State<'_, Arc<AppState>>,
    id: i64,
    db: String,
    dest: Option<String>,
) -> RanResult<String> {
    let spec = load_mysql(&state, id)?;
    let pw = state.repo.get_root_pw(id)?;
    let dest_path = dest.as_deref().map(std::path::Path::new);
    let written = dbadmin::backup(&spec, &pw, &db, dest_path)?;
    Ok(written.to_string_lossy().to_string())
}

#[tauri::command]
pub fn import_mysql(
    state: State<'_, Arc<AppState>>,
    id: i64,
    db: String,
    src: String,
) -> RanResult<()> {
    let spec = load_mysql(&state, id)?;
    let pw = state.repo.get_root_pw(id)?;
    dbadmin::import(&spec, &pw, &db, std::path::Path::new(&src))
}

#[tauri::command]
pub fn run_mysql_query(
    state: State<'_, Arc<AppState>>,
    id: i64,
    sql: String,
) -> RanResult<String> {
    let spec = load_mysql(&state, id)?;
    let pw = state.repo.get_root_pw(id)?;
    dbadmin::run_query(&spec, &pw, &sql)
}

// ---------- MySQL 多实例 ----------
fn inst_from_row(row: &InstanceRow) -> InstanceCreated {
    let cfg = PathBuf::from(&row.config_path);
    let data = cfg.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    InstanceCreated {
        port: row.port as u16,
        data_path: data,
        config_path: cfg,
        service_name: row.service_name.clone(),
    }
}
fn find_instance(state: &State<'_, Arc<AppState>>, id: i64, inst_id: i64) -> RanResult<InstanceRow> {
    state
        .repo
        .list_instances(id)?
        .into_iter()
        .find(|r| r.id == inst_id)
        .ok_or_else(|| RanError::NotFound(format!("instance {inst_id}")))
}

#[tauri::command]
pub fn list_mysql_instances(state: State<'_, Arc<AppState>>, id: i64) -> RanResult<Vec<InstanceRow>> {
    state.repo.list_instances(id)
}
#[tauri::command]
pub fn create_mysql_instance(
    state: State<'_, Arc<AppState>>,
    id: i64,
    name: String,
    port: u16,
    run_mode: RunMode,
) -> RanResult<i64> {
    let spec = load_mysql(&state, id)?;
    let created = dbadmin::create_instance(&spec, &name, port, run_mode)?;
    let row = InstanceRow {
        id: 0,
        software_id: id,
        name,
        port: port as i64,
        data_path: created.data_path.to_string_lossy().to_string(),
        config_path: created.config_path.to_string_lossy().to_string(),
        service_name: created.service_name,
        status: "stopped".into(),
    };
    state.repo.insert_instance(&row)
}
#[tauri::command]
pub fn start_mysql_instance(state: State<'_, Arc<AppState>>, id: i64, inst_id: i64) -> RanResult<()> {
    let spec = load_mysql(&state, id)?;
    let row = find_instance(&state, id, inst_id)?;
    dbadmin::start_instance(&spec, &inst_from_row(&row))
}
#[tauri::command]
pub fn stop_mysql_instance(state: State<'_, Arc<AppState>>, id: i64, inst_id: i64) -> RanResult<()> {
    let spec = load_mysql(&state, id)?;
    let row = find_instance(&state, id, inst_id)?;
    dbadmin::stop_instance(&spec, &inst_from_row(&row))
}
#[tauri::command]
pub fn status_mysql_instance(state: State<'_, Arc<AppState>>, id: i64, inst_id: i64) -> RanResult<bool> {
    let row = find_instance(&state, id, inst_id)?;
    dbadmin::status_instance(&inst_from_row(&row))
}
#[tauri::command]
pub fn delete_mysql_instance(state: State<'_, Arc<AppState>>, id: i64, inst_id: i64) -> RanResult<()> {
    let spec = load_mysql(&state, id)?;
    let row = find_instance(&state, id, inst_id)?;
    dbadmin::delete_instance(&spec, &inst_from_row(&row))?;
    state.repo.delete_instance(inst_id)
}
