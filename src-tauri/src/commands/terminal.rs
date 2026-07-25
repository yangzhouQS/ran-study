use super::AppState;
use crate::error::RanResult;
use crate::terminal;
use std::sync::Arc;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn open_terminal(app: AppHandle, state: State<'_, Arc<AppState>>) -> RanResult<String> {
    terminal::open(app, &state.root, &state.terminals)
}

#[tauri::command]
pub fn write_terminal(
    state: State<'_, Arc<AppState>>,
    session_id: String,
    data: String,
) -> RanResult<()> {
    terminal::write(&state.terminals, &session_id, &data)
}

#[tauri::command]
pub fn close_terminal(
    state: State<'_, Arc<AppState>>,
    session_id: String,
) -> RanResult<()> {
    terminal::close(&state.terminals, &session_id)
}
