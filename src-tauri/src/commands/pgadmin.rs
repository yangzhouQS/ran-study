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

fn get_creds(state: &State<'_, Arc<AppState>>, id: i64) -> RanResult<(String, String)> {
    state.repo.get_db_credentials(id)
}

#[tauri::command]
pub fn test_pg_connection(
    state: State<'_, Arc<AppState>>,
    id: i64,
    username: String,
    password: String,
) -> RanResult<bool> {
    let spec = load_pg(&state, id)?;
    pgadmin::test_connection(&spec, &username, &password)
}

#[tauri::command]
pub fn save_pg_credentials(
    state: State<'_, Arc<AppState>>,
    id: i64,
    username: String,
    password: String,
) -> RanResult<()> {
    state.repo.set_db_credentials(id, &username, &password)
}

#[tauri::command]
pub fn get_pg_credentials(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> RanResult<(String, String)> {
    get_creds(&state, id)
}

#[tauri::command]
pub fn list_pg_databases(state: State<'_, Arc<AppState>>, id: i64) -> RanResult<Vec<String>> {
    let spec = load_pg(&state, id)?;
    let (u, p) = get_creds(&state, id)?;
    pgadmin::list_databases(&spec, &u, &p)
}

#[tauri::command]
pub fn create_pg_database(
    state: State<'_, Arc<AppState>>,
    id: i64,
    name: String,
    new_user: Option<String>,
    new_password: Option<String>,
) -> RanResult<()> {
    let spec = load_pg(&state, id)?;
    let (u, p) = get_creds(&state, id)?;
    pgadmin::create_database(&spec, &u, &p, &name, &new_user, &new_password)
}

#[tauri::command]
pub fn change_pg_password(
    state: State<'_, Arc<AppState>>,
    id: i64,
    target_user: String,
    new_password: String,
) -> RanResult<()> {
    let spec = load_pg(&state, id)?;
    let (u, p) = get_creds(&state, id)?;
    pgadmin::change_password(&spec, &u, &p, &target_user, &new_password)?;
    state.repo.set_db_credentials(id, &target_user, &new_password)
}

#[tauri::command]
pub fn backup_pg(
    state: State<'_, Arc<AppState>>,
    id: i64,
    db: String,
    dest: Option<String>,
) -> RanResult<String> {
    let spec = load_pg(&state, id)?;
    let (u, p) = get_creds(&state, id)?;
    let p_path = match dest {
        Some(d) if !d.trim().is_empty() => std::path::PathBuf::from(d),
        _ => {
            let ts = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
            state.root.join("data").join("pg").join(format!("{db}-{ts}.sql"))
        }
    };
    pgadmin::backup(&spec, &u, &p, &db, &p_path)?;
    Ok(p_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn import_pg(
    state: State<'_, Arc<AppState>>,
    id: i64,
    db: String,
    src: String,
) -> RanResult<()> {
    let spec = load_pg(&state, id)?;
    let (u, p) = get_creds(&state, id)?;
    pgadmin::import(&spec, &u, &p, &db, std::path::Path::new(&src))
}

#[tauri::command]
pub fn run_pg_query(state: State<'_, Arc<AppState>>, id: i64, sql: String) -> RanResult<String> {
    let spec = load_pg(&state, id)?;
    let (u, p) = get_creds(&state, id)?;
    pgadmin::run_query(&spec, &u, &p, &sql)
}
