pub mod model;

use chrono::Utc;
use model::{Task, TaskStatus};
use std::collections::HashMap;
use std::sync::Mutex;

pub struct TaskQueue {
    tasks: Mutex<HashMap<String, Task>>,
}

impl TaskQueue {
    pub fn new() -> Self {
        Self {
            tasks: Mutex::new(HashMap::new()),
        }
    }

    pub fn create(&self, kind: &str, target: &str) -> Task {
        let now = Utc::now().timestamp();
        let task = Task {
            id: uuid::Uuid::new_v4().to_string(),
            kind: kind.to_string(),
            target: target.to_string(),
            status: TaskStatus::Queued,
            progress: 0,
            message: String::new(),
            log_path: String::new(),
            created_at: now,
            updated_at: now,
        };
        self.tasks
            .lock()
            .unwrap()
            .insert(task.id.clone(), task.clone());
        task
    }

    pub fn set_progress(&self, id: &str, progress: u32, message: &str) {
        if let Some(t) = self.tasks.lock().unwrap_or_else(|e| e.into_inner()).get_mut(id) {
            t.progress = progress;
            t.message = message.to_string();
            t.status = TaskStatus::Running;
            t.updated_at = Utc::now().timestamp();
        }
    }

    pub fn finish(&self, id: &str, ok: bool) {
        if let Some(t) = self.tasks.lock().unwrap_or_else(|e| e.into_inner()).get_mut(id) {
            t.status = if ok { TaskStatus::Done } else { TaskStatus::Failed };
            t.progress = 100;
            t.updated_at = Utc::now().timestamp();
        }
    }

    pub fn list(&self) -> Vec<Task> {
        self.tasks.lock().unwrap_or_else(|e| e.into_inner()).values().cloned().collect()
    }

    pub fn get(&self, id: &str) -> Option<Task> {
        self.tasks.lock().unwrap_or_else(|e| e.into_inner()).get(id).cloned()
    }
}

impl Default for TaskQueue {
    fn default() -> Self {
        Self::new()
    }
}
