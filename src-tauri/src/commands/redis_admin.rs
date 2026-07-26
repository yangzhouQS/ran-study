use super::AppState;
use crate::error::{RanError, RanResult};
use crate::provider::SoftwareSpec;
use crate::redis_admin;
use std::sync::Arc;
use tauri::State;

fn load_redis(state: &State<'_, Arc<AppState>>, id: i64) -> RanResult<SoftwareSpec> {
    state
        .repo
        .list_software()?
        .into_iter()
        .find(|s| s.id == id && s.provider == "redis")
        .ok_or_else(|| RanError::NotFound(format!("redis {id}")))
}

#[tauri::command]
pub fn redis_list_keys(state: State<'_, Arc<AppState>>, id: i64, pw: String) -> RanResult<Vec<String>> {
    let spec = load_redis(&state, id)?;
    redis_admin::list_keys(&spec, &pw)
}

#[tauri::command]
pub fn redis_add_key(
    state: State<'_, Arc<AppState>>,
    id: i64,
    pw: String,
    key: String,
    val: String,
) -> RanResult<()> {
    let spec = load_redis(&state, id)?;
    redis_admin::add_key(&spec, &pw, &key, &val)
}

#[tauri::command]
pub fn redis_get_key(state: State<'_, Arc<AppState>>, id: i64, pw: String, key: String) -> RanResult<String> {
    let spec = load_redis(&state, id)?;
    redis_admin::get_key(&spec, &pw, &key)
}

#[tauri::command]
pub fn redis_del_key(state: State<'_, Arc<AppState>>, id: i64, pw: String, key: String) -> RanResult<()> {
    let spec = load_redis(&state, id)?;
    redis_admin::del_key(&spec, &pw, &key)
}

#[tauri::command]
pub fn redis_run(state: State<'_, Arc<AppState>>, id: i64, pw: String, args: Vec<String>) -> RanResult<String> {
    let spec = load_redis(&state, id)?;
    let args: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    redis_admin::run(&spec, &pw, &args)
}

#[tauri::command]
pub fn redis_run_remote(host: String, port: u16, pw: String, args: Vec<String>) -> RanResult<String> {
    let args: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    redis_admin::run_remote(&host, port, &pw, &args)
}

#[tauri::command]
pub fn redis_change_password(
    state: State<'_, Arc<AppState>>,
    id: i64,
    cur_pw: String,
    new_pw: String,
) -> RanResult<()> {
    let spec = load_redis(&state, id)?;
    redis_admin::change_password(&spec, &cur_pw, &new_pw)
}
