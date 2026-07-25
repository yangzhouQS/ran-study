# ran-study P3 增强 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现四个增强模块：①进程与服务管理（sysinfo + sc）；②系统监控仪表盘（sysinfo 采样 + ECharts）；③计划任务（schtasks）；④内置终端（portable-pty + xterm.js）。每个为独立模块/命令/视图。

**Architecture:** 新增 `sysproc.rs`（进程/服务）、`monitor.rs`（系统快照）、`schedule.rs`（schtasks 封装）、`terminal.rs`（PTY 会话）。监控用前端轮询 `get_system_stats()` 每 2s 拉一次、ECharts 滚动窗口；终端用 `portable-pty` 后台读线程经 `terminal://output` 事件推流、前端 xterm.js。计划任务用 `scheduled_tasks` 表登记 + schtasks 实际调度。

**Tech Stack:** Rust（sysinfo / portable-pty / std::process Command 调 sc、schtasks、taskkill）+ TS（Vue3/TSX/Element Plus / echarts / @xterm/xterm）

**关联：** spec §8.1 进程服务、§8.2 监控、§8.3 计划任务、§8.4 终端。

**验证策略：** 纯逻辑（sc/schtasks 解析、schtasks 触发器映射、快照结构、终端参数）走单测；交互（杀进程、起停服务、终端输入输出、实时图表）为 `pnpm tauri dev` 人工验收。

---

## 文件结构（P3 新增）

```
src-tauri/src/
├── sysproc.rs    [新] 进程(sysinfo) + 服务(sc query 解析) + kill/control
├── monitor.rs    [新] 系统快照(CPU/内存/磁盘/网络)
├── schedule.rs   [新] schtasks 封装(create/run/enable/disable/delete)
├── terminal.rs   [新] PTY 会话(open/write/close)
├── repo.rs       加 scheduled_tasks CRUD + ScheduledTaskRow
├── commands/mod.rs  AppState 加 terminals 字段
├── commands/sysproc.rs   [新] 进程/服务命令
├── commands/monitor.rs   [新] 快照命令
├── commands/schedule.rs  [新] 计划任务命令
├── commands/terminal.rs  [新] 终端命令
└── lib.rs        声明模块 + 注册命令
src/
├── api/{sysproc,monitor,schedule,terminal}-api.ts
├── types/api-type.ts   加 ProcInfo/SvcInfo/SystemStats/ScheduledTask/TerminalOutput
├── composables/use-system-stats.ts   [新] 轮询 + 滚动窗口
├── views/{process-service,monitor,schedule,terminal}/*.tsx
```

---

## Task P3-1: 依赖 + sysproc 模块

**Files:** `Cargo.toml`；`sysproc.rs`

- [ ] Step 1: `Cargo.toml` `[dependencies]` 加 `sysinfo = "0.32"`。

- [ ] Step 2: 写 `sysproc.rs`：

```rust
use crate::error::{RanError, RanResult};
use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcInfo {
    pub pid: u32,
    pub name: String,
    pub cpu: f32,
    pub memory: u64,
    pub user: String,
    pub command: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SvcInfo {
    pub name: String,
    pub state: String,
    pub display: String,
}

/// 进程列表（按 CPU 降序，上限 300）
pub fn list_processes() -> Vec<ProcInfo> {
    let mut sys = sysinfo::System::new_all();
    sys.refresh_cpu_usage();
    let mut v: Vec<ProcInfo> = sys
        .processes()
        .iter()
        .map(|(pid, p)| ProcInfo {
            pid: pid.as_u32(),
            name: p.name().to_string(),
            cpu: p.cpu_usage(),
            memory: p.memory(),
            user: p.user_id().map(|u| u.to_string()).unwrap_or_default(),
            command: p.cmd().iter().map(|s| s.to_string_lossy().to_string()).collect::<Vec<_>>().join(" "),
        })
        .collect();
    v.sort_by(|a, b| b.cpu.partial_cmp(&a.cpu).unwrap_or(std::cmp::Ordering::Equal));
    v.truncate(300);
    v
}

pub fn kill_process(pid: u32) -> RanResult<()> {
    let st = Command::new("taskkill").args(["/F", "/PID", &pid.to_string()]).status();
    match st {
        Ok(s) if s.success() => Ok(()),
        Ok(_) => Err(RanError::Other(format!("结束 {pid} 失败"))),
        Err(e) => Err(RanError::Other(format!("taskkill 失败: {e}"))),
    }
}

pub fn list_services() -> RanResult<Vec<SvcInfo>> {
    let out = Command::new("sc").args(["query", "type=", "service", "state=", "all"]).output()
        .map_err(|e| RanError::Other(e.to_string()))?;
    let text = String::from_utf8_lossy(&out.stdout);
    Ok(parse_services(&text))
}

pub fn parse_services(text: &str) -> Vec<SvcInfo> {
    let mut out = Vec::new();
    let mut name = String::new();
    let mut state = String::new();
    let mut display = String::new();
    for line in text.lines() {
        let t = line.trim();
        if let Some(rest) = t.strip_prefix("SERVICE_NAME:") {
            name = rest.trim().to_string();
        } else if let Some(rest) = t.strip_prefix("DISPLAY_NAME:") {
            display = rest.trim().to_string();
        } else if let Some(rest) = t.strip_prefix("STATE") {
            // "STATE              : 4  RUNNING ..."
            if let Some(val) = rest.split(':').nth(1) {
                let lower = val.to_ascii_lowercase();
                state = if lower.contains("running") { "running".into() }
                    else if lower.contains("stopped") { "stopped".into() }
                    else { val.trim().to_ascii_lowercase() };
            }
        } else if t.is_empty() {
            if !name.is_empty() {
                out.push(SvcInfo { name: std::mem::take(&mut name), state: std::mem::take(&mut state), display: std::mem::take(&mut display) });
            }
        }
    }
    if !name.is_empty() {
        out.push(SvcInfo { name, state, display });
    }
    out
}

pub fn control_service(name: &str, action: &str) -> RanResult<()> {
    let verb = match action { "start" => "start", "stop" => "stop", _ => return Err(RanError::Other("未知服务动作".into())) };
    let _ = Command::new("sc").args([verb, name]).status();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_services_basic() {
        let text = "\r\nSERVICE_NAME: ran-redis-7\r\nDISPLAY_NAME: ran redis\r\n        TYPE               : 10  WIN32_OWN_PROCESS\r\n        STATE              : 4  RUNNING \r\n\r\nSERVICE_NAME: MySQL80\r\nDISPLAY_NAME: MySQL\r\n        STATE              : 1  STOPPED \r\n";
        let v = parse_services(text);
        assert_eq!(v.len(), 2);
        assert_eq!(v[0].name, "ran-redis-7");
        assert_eq!(v[0].state, "running");
        assert_eq!(v[1].state, "stopped");
    }
}
```

- [ ] Step 3: `cargo test sysproc`（按 sysinfo 实际 API 微调）。

---

## Task P3-2: monitor 模块

**Files:** `monitor.rs`

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo { pub name: String, pub total: u64, pub available: u64 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    pub cpu: f32,
    pub mem_total: u64,
    pub mem_used: u64,
    pub disks: Vec<DiskInfo>,
    pub net_rx: u64,
    pub net_tx: u64,
}

pub fn snapshot() -> SystemStats {
    let mut sys = sysinfo::System::new_all();
    sys.refresh_cpu_usage();
    let cpu = sys.global_cpu_usage();
    let disks = sysinfo::Disks::new_with_refreshed_list()
        .iter()
        .map(|d| DiskInfo {
            name: d.name().to_string_lossy().to_string(),
            total: d.total_space(),
            available: d.available_space(),
        })
        .collect();
    let (net_rx, net_tx) = sysinfo::Networks::new_with_refreshed_list()
        .iter()
        .fold((0u64, 0u64), |(rx, tx), (_, n)| (rx + n.received(), tx + n.transmitted()));
    SystemStats {
        cpu,
        mem_total: sys.total_memory(),
        mem_used: sys.used_memory(),
        disks,
        net_rx,
        net_tx,
    }
}
```

---

## Task P3-3: schedule 模块 + repo

**Files:** `schedule.rs`；`repo.rs`（加 ScheduledTaskRow + CRUD）

`schedule.rs`：
```rust
use crate::error::{RanError, RanResult};
use std::process::Command;

pub fn trigger_arg(trigger: &str) -> RanResult<&'static str> {
    match trigger {
        "onlogon" => Ok("ONLOGON"),
        "daily" => Ok("DAILY"),
        "weekly" => Ok("WEEKLY"),
        _ => Err(RanError::Other("未知触发器".into())),
    }
}

pub fn create(name: &str, command: &str, trigger: &str) -> RanResult<()> {
    let tn = format!("ran-{name}");
    let sc = trigger_arg(trigger)?;
    let st = Command::new("schtasks")
        .args(["/Create", "/F", "/TN", &tn, "/TR", command, "/SC", sc])
        .status()
        .map_err(|e| RanError::Other(e.to_string()))?;
    if !st.success() { return Err(RanError::Other("schtasks /Create 失败".into())); }
    Ok(())
}
pub fn run(name: &str) -> RanResult<()> { run_ignore(&["/Run", "/TN", &format!("ran-{name}")]) }
pub fn enable(name: &str) -> RanResult<()> { run_ignore(&["/Change", "/TN", &format!("ran-{name}"), "/ENABLE"]) }
pub fn disable(name: &str) -> RanResult<()> { run_ignore(&["/Change", "/TN", &format!("ran-{name}"), "/DISABLE"]) }
pub fn delete(name: &str) -> RanResult<()> { run_ignore(&["/Delete", "/F", "/TN", &format!("ran-{name}")]) }
fn run_ignore(args: &[&str]) -> RanResult<()> {
    let _ = Command::new("schtasks").args(args).status();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn trigger_mapping() {
        assert_eq!(trigger_arg("daily").unwrap(), "DAILY");
        assert!(trigger_arg("nope").is_err());
    }
}
```

`repo.rs` 加：
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledTaskRow {
    #[serde(default)] pub id: i64,
    pub name: String, pub command: String, pub trigger: String,
    #[serde(default)] pub enabled: bool,
}
impl Repo {
    pub fn insert_scheduled(&self, t: &ScheduledTaskRow) -> RanResult<i64> { /* INSERT */ }
    pub fn list_scheduled(&self) -> RanResult<Vec<ScheduledTaskRow>> { /* SELECT */ }
    pub fn delete_scheduled(&self, id: i64) -> RanResult<()> { /* DELETE */ }
}
```

---

## Task P3-4: terminal 模块

**Files:** `terminal.rs`；`Cargo.toml` 加 `portable-pty = "0.8"`

```rust
use crate::error::{RanError, RanResult};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

pub struct TerminalSession {
    pub writer: Box<dyn Write + Send>,
    pub child: Box<dyn portable_pty::Child + Send + Sync>,
    #[allow(dead_code)]
    pub master: Box<dyn portable_pty::Master + Send>,
}

pub type SessionMap = Mutex<HashMap<String, TerminalSession>>;

#[derive(Clone, Serialize)]
pub struct TerminalOutput {
    pub session_id: String,
    pub data: String,
}

pub fn open(app: AppHandle, cwd: &std::path::Path, map: &SessionMap) -> RanResult<String> {
    let pty = native_pty_system();
    let pair = pty.openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| RanError::Other(e.to_string()))?;
    let mut cmd = CommandBuilder::new(if cfg!(windows) { "powershell.exe" } else { "bash" });
    cmd.cwd(cwd);
    let child = pair.slave.spawn_command(cmd).map_err(|e| RanError::Other(e.to_string()))?;
    let mut reader = pair.master.take_reader().ok_or_else(|| RanError::Other("无 reader".into()))?;
    let writer = pair.master.take_writer();
    let master = pair.master;
    drop(pair.slave);

    let id = uuid::Uuid::new_v4().to_string();
    let app2 = app.clone();
    let id2 = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app2.emit("terminal://output", TerminalOutput { session_id: id2.clone(), data });
                }
            }
        }
    });

    map.lock().unwrap().insert(id.clone(), TerminalSession { writer, child, master });
    Ok(id)
}

pub fn write(map: &SessionMap, id: &str, data: &str) -> RanResult<()> {
    let mut m = map.lock().unwrap();
    let s = m.get_mut(id).ok_or_else(|| RanError::NotFound("terminal".into()))?;
    s.writer.write_all(data.as_bytes()).map_err(|e| RanError::Io(e.to_string()))?;
    s.writer.flush().map_err(|e| RanError::Io(e.to_string()))?;
    Ok(())
}

pub fn close(map: &SessionMap, id: &str) -> RanResult<()> {
    if let Some(mut s) = map.lock().unwrap().remove(id) {
        let _ = s.child.kill();
        let _ = s.child.wait();
    }
    Ok(())
}
```

> AppState 加 `pub terminals: terminal::SessionMap`。

---

## Task P3-5: commands（4 组）+ lib 注册

- `commands/sysproc.rs`：`list_processes/kill_process/list_services/control_service`
- `commands/monitor.rs`：`get_system_stats`
- `commands/schedule.rs`：`create_scheduled/list_scheduled/run_scheduled/toggle_scheduled/delete_scheduled`（落 scheduled_tasks 表）
- `commands/terminal.rs`：`open_terminal/write_terminal/close_terminal`
- `commands/mod.rs`：AppState 加 `pub terminals: terminal::SessionMap`，构造处 `terminals: std::sync::Mutex::new(std::collections::HashMap::new())`
- `lib.rs`：`mod sysproc; mod monitor; mod schedule; mod terminal;` + 注册全部命令

---

## Task P3-6: 前端四视图

- 装：`pnpm add echarts @xterm/xterm @xterm/addon-fit`
- `types/api-type.ts` 加：ProcInfo/SvcInfo/DiskInfo/SystemStats/ScheduledTask/TerminalOutput
- `composables/use-system-stats.ts`：`setInterval` 2s 拉 snapshot → 维护 cpu/mem 滚动数组（60 点）；onUnmounted 清理
- 视图：
  - `process-service.tsx`：进程/服务切换 tab；搜索框；结束进程 / 起停服务
  - `monitor.tsx`：ECharts CPU% + 内存% 折线（滚动）、磁盘用量列表
  - `schedule.tsx`：列表 + 新建表单(名称/命令/触发器) + 运行/启用禁用/删除
  - `terminal.tsx`：xterm 容器；onMounted open_terminal + 监听 `terminal://output` → term.write；term.onData → write_terminal
- `router/index.ts` + 菜单加 4 项

---

## Task P3-7: 全量验证 + 打标签

- `cargo test`（含 sysproc/schedule 单测）+ `cargo build`
- `tsc --noEmit` + `pnpm build`
- 运行时冒烟 `ran-study.exe` 无 panic
- 人工验收（`pnpm tauri dev`）：进程列表/杀进程、服务列表/起停、监控实时折线、计划任务创建运行、终端可输入输出
- `git commit -m "feat(p3): process/service, monitor, scheduler, terminal" && git tag p3-enhancements`

---

## P3 验收标准

1. 进程：sysinfo 列出 PID/名称/CPU/内存/用户/命令，可结束进程。
2. 服务：`sc query` 解析出名称/状态/显示名，可起停。
3. 监控：每 2s 快照 CPU%/内存/磁盘/网络；ECharts CPU/内存滚动折线。
4. 计划任务：schtasks 创建/运行/启用禁用/删除；落 scheduled_tasks 表。
5. 终端：内置 powershell，输入回显、命令执行输出经 PTY 流回 xterm。

## 延后

监控历史落 SQLite、终端多标签、进程白名单 → 后续。
