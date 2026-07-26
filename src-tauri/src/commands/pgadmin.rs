use super::AppState;
use crate::error::{RanError, RanResult};
use crate::pgadmin;
use crate::provider::SoftwareSpec;
use std::sync::Arc;
use tauri::State;

fn load_pg(state: &State<'_, Arc<AppState>>, id: i64) -> RanResult<SoftwareSpec> {
    state
        .repo
        .list_software()?
        .into_iter()
        .find(|s| s.id == id && s.provider == "postgres")
        .ok_or_else(|| RanError::NotFound(format!("postgres {id}")))
}

#[tauri::command]
pub fn list_pg_databases(state: State<'_, Arc<AppState>>, id: i64) -> RanResult<Vec<String>> {
    let spec = load_pg(&state, id)?;
    let pw = state.repo.get_root_pw(id)?;
    pgadmin::list_databases(&spec, &pw)
}

#[tauri::command]
pub fn create_pg_database(
    state: State<'_, Arc<AppState>>,
    id: i64,
    name: String,
    password: Option<String>,
) -> RanResult<()> {
    let spec = load_pg(&state, id)?;
    let pw = state.repo.get_root_pw(id)?;
    pgadmin::create_database(&spec, &pw, &name, &password)
}

#[tauri::command]
pub fn change_pg_password(
    state: State<'_, Arc<AppState>>,
    id: i64,
    new_password: String,
) -> RanResult<()> {
    let spec = load_pg(&state, id)?;
    let old = state.repo.get_root_pw(id)?;
    pgadmin::change_password(&spec, &old, &new_password)?;
    state.repo.set_root_pw(id, &new_password)
}

#[tauri::command]
pub fn backup_pg(
    state: State<'_, Arc<AppState>>,
    id: i64,
    db: String,
    dest: Option<String>,
) -> RanResult<String> {
    let spec = load_pg(&state, id)?;
    let pw = state.repo.get_root_pw(id)?;
    let p = match dest {
        Some(d) if !d.trim().is_empty() => std::path::PathBuf::from(d),
        _ => {
            let ts = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
            state.root.join("data").join("pg").join(format!("{db}-{ts}.sql"))
        }
    };
    pgadmin::backup(&spec, &pw, &db, &p)?;
    Ok(p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn import_pg(
    state: State<'_, Arc<AppState>>,
    id: i64,
    db: String,
    src: String,
) -> RanResult<()> {
    let spec = load_pg(&state, id)?;
    let pw = state.repo.get_root_pw(id)?;
    pgadmin::import(&spec, &pw, &db, std::path::Path::new(&src))
}

#[tauri::command]
pub fn run_pg_query(state: State<'_, Arc<AppState>>, id: i64, sql: String) -> RanResult<String> {
    let spec = load_pg(&state, id)?;
    let pw = state.repo.get_root_pw(id)?;
    pgadmin::run_query(&spec, &pw, &sql)
}
