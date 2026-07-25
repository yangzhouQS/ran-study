use super::AppState;
use crate::error::RanResult;
use crate::task::model::Task;
use std::sync::Arc;
use std::time::Duration;
use tauri::async_runtime;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub fn list_tasks(state: State<'_, Arc<AppState>>) -> RanResult<Vec<Task>> {
    Ok(state.tasks.list())
}

/// 创建一个会推送进度事件的演示任务（验证事件流通路，P1 起替换为真实 provider 调用）
#[tauri::command]
pub async fn create_demo_task(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    target: String,
) -> RanResult<Task> {
    let task = state.tasks.create("demo", &target);
    let id = task.id.clone();
    let app_state: Arc<AppState> = state.inner().clone();

    async_runtime::spawn(async move {
        for p in (0..=100i32).step_by(10) {
            tokio::time::sleep(Duration::from_millis(150)).await;
            app_state
                .tasks
                .set_progress(&id, p as u32, &format!("进度 {p}%"));
            let _ = app.emit("task://progress", app_state.tasks.get(&id));
        }
        app_state.tasks.finish(&id, true);
        let _ = app.emit("task://progress", app_state.tasks.get(&id));
    });

    Ok(task)
}
