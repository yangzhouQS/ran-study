use super::AppState;
use crate::dbadmin;
use crate::error::{RanError, RanResult};
use crate::provider::SoftwareSpec;
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
    let p = match dest {
        Some(d) if !d.trim().is_empty() => std::path::PathBuf::from(d),
        _ => {
            let ts = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
            state.root.join("data").join("mysql").join(format!("{db}-{ts}.sql"))
        }
    };
    dbadmin::backup(&spec, &pw, &db, Some(&p))?;
    Ok(p.to_string_lossy().to_string())
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

/// 测试数据库连接（用给定密码尝试执行 SELECT 1）
#[tauri::command]
pub fn test_mysql_connection(
    state: State<'_, Arc<AppState>>,
    id: i64,
    password: String,
) -> RanResult<bool> {
    let spec = load_mysql(&state, id)?;
    dbadmin::test_connection(&spec, &password)
}
