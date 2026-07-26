use std::sync::{Mutex, OnceLock};
use sysinfo::System;

static SYS: OnceLock<Mutex<System>> = OnceLock::new();

/// 获取全局共享的 System 实例（初始化时 new_all 全量枚举，后续只 refresh）
pub fn shared() -> &'static Mutex<System> {
    SYS.get_or_init(|| Mutex::new(System::new_all()))
}
