# ran-study P2 Node 生态 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 集成 nvm-windows 绿色版做 Node 多版本编排；通过 PM2 管理 node 应用（添加/启停/删除/状态）；生成开机自启 resurrect.vbs，使勾选的 PM2 应用在用户登录时由激活 Node 执行 `pm2 resurrect` 恢复。

**Architecture:** Node 不走 SoftwareProvider（它是多版本切换工具而非单一实例），单独建 `nvm.rs` 模块：置备 nvm-noinstall（下载→解压→settings.txt→`setx` 写 NVM_HOME/NVM_SYMLINK）+ 封装 `nvm list/install/use/uninstall`。PM2 单独建 `pm2.rs`：用激活 Node 的 npm 全局装 pm2，封装 `pm2 jlist/start/stop/restart/delete/save/resurrect`，应用配置落 `pm2_apps` 表。开机自启建 `boot.rs`：在用户 Startup 目录写/删 `ran-pm2-resurrect.vbs`。三者各为独立模块/命令/视图。

**Tech Stack:** Rust（std::process::Command / serde_json 解析 / setx 写用户环境变量）+ TypeScript（Vue3/TSX/Element Plus）

**关联：** spec §5（Node 版本/PM2 应用 为独立菜单）、§6.7 BootManager、§7.3 nvm、§7.4 PM2。

**验证策略：** 纯逻辑（settings.txt 渲染、nvm list 解析、pm2 jlist 解析、resurrect.vbs 生成、Startup 路径）走单测；真实 nvm 下载/Node 安装/PM2 守护为 `pnpm tauri dev` 人工验收。

---

## 文件结构（P2 新增）

```
src-tauri/src/
├── nvm.rs          [新] nvm 置备 + node 版本操作（list/install/use/uninstall）
├── pm2.rs          [新] pm2 封装（ensure/list/start/stop/restart/delete/save/resurrect）
├── boot.rs         [新] resurrect.vbs 生成/移除 + 开机自启开关
├── repo.rs         加 pm2_apps CRUD + NodeVersion/Pm2Process 映射
├── lib.rs          声明 nvm/pm2/boot 模块 + 注册 node/pm2 命令
└── commands/
    ├── node.rs     [新] nvm 置备/版本列表/安装/切换/卸载/激活状态
    └── pm2.rs      [新] 应用 增删改查/启停/重启/状态/开机自启/保存
src/
├── api/node-api.ts        [新]
├── api/pm2-api.ts         [新]
├── types/api-type.ts      加 NodeVersion/Pm2App/Pm2Process
├── views/node-version/node-version.tsx   [新]
└── views/pm2-app/pm2-app.tsx             [新]
```

---

## Task P2-1: nvm 模块

**Files:** Create `src-tauri/src/nvm.rs`；`lib.rs` 加 `mod nvm;`

- [ ] Step 1: `lib.rs` 加 `mod nvm;`（顶部模块声明区）

- [ ] Step 2: 写 `nvm.rs`：

```rust
use crate::download;
use crate::error::{RanError, RanResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

const NVM_NOINSTALL_URL: &str =
    "https://github.com/coreybutler/nvm-windows/releases/download/1.2.2/nvm-noinstall.zip";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeVersion {
    pub version: String,
    pub active: bool,
}

/// 已知常用 LTS 版本（前端选择器用；实际安装由 nvm install 完成）
pub fn known_versions() -> Vec<String> {
    vec![
        "18.20.4".into(),
        "20.18.1".into(),
        "22.11.0".into(),
    ]
}

pub fn nvm_dir(root: &Path) -> PathBuf {
    root.join("env").join("nvm")
}
pub fn nvm_exe(root: &Path) -> PathBuf {
    nvm_dir(root).join(if cfg!(windows) { "nvm.exe" } else { "nvm" })
}
/// nvm use 后激活 Node 的 junction 目标
pub fn node_symlink(root: &Path) -> PathBuf {
    root.join("env").join("node")
}
pub fn node_exe(root: &Path) -> PathBuf {
    node_symlink(root).join(if cfg!(windows) { "node.exe" } else { "node" })
}

pub fn is_provisioned(root: &Path) -> bool {
    nvm_exe(root).exists()
}

/// 下载 nvm-noinstall.zip → 解压到 env/nvm → 写 settings.txt → setx 环境变量
pub fn provision(root: &Path, progress: impl Fn(u32, &str)) -> RanResult<()> {
    if is_provisioned(root) {
        return Ok(());
    }
    let dir = nvm_dir(root);
    let cache = root.join("cache");
    std::fs::create_dir_all(&cache)?;
    let zip = cache.join("nvm-noinstall.zip");
    if !zip.exists() {
        progress(10, "下载 nvm-noinstall.zip");
        let rt = tokio::runtime::Runtime::new()?;
        rt.block_on(download::download(NVM_NOINSTALL_URL, &zip, |_, _| {}, 0))?;
        progress(60, "nvm 下载完成");
    }
    progress(75, "解压 nvm");
    download::install_from_zip(&zip, &dir)?;
    if !nvm_exe(root).exists() {
        return Err(RanError::Other("解压后未找到 nvm.exe".into()));
    }

    progress(85, "写 settings.txt");
    write_settings(root)?;

    progress(95, "设置环境变量");
    set_user_env("NVM_HOME", &dir.to_string_lossy());
    set_user_env("NVM_SYMLINK", &node_symlink(root).to_string_lossy());
    // 当前进程也注入，供后续 spawn 的 nvm/node/pm2 使用
    std::env::set_var("NVM_HOME", &dir);
    std::env::set_var("NVM_SYMLINK", node_symlink(root));

    progress(100, "nvm 就绪");
    Ok(())
}

fn write_settings(root: &Path) -> RanResult<()> {
    let settings = format!(
        "root: {}\r\npath: {}\r\narch: 64\r\nproxy: none\r\noriginalpath: \r\noriginalversion: \r\n",
        nvm_dir(root).display(),
        node_symlink(root).display()
    );
    std::fs::write(nvm_dir(root).join("settings.txt"), settings)?;
    Ok(())
}

/// 通过 setx 持久化用户级环境变量（新开的终端可见）
fn set_user_env(key: &str, val: &str) {
    let _ = Command::new("setx").args([key, val]).status();
}

/// 运行 nvm.exe（注入 NVM_HOME/NVM_SYMLINK），返回 stdout
pub fn run_nvm(root: &Path, args: &[&str]) -> RanResult<String> {
    std::env::set_var("NVM_HOME", nvm_dir(root));
    std::env::set_var("NVM_SYMLINK", node_symlink(root));
    let out = Command::new(nvm_exe(root))
        .args(args)
        .output()
        .map_err(|e| RanError::Other(format!("运行 nvm 失败: {e}")))?;
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

/// 解析 `nvm list` 输出
pub fn list_local(root: &Path) -> RanResult<Vec<NodeVersion>> {
    let text = run_nvm(root, &["list"])?;
    Ok(parse_nvm_list(&text))
}

pub fn parse_nvm_list(text: &str) -> Vec<NodeVersion> {
    let mut out = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.contains("NVM for Windows") || trimmed.starts_with("------") {
            continue;
        }
        let active = trimmed.starts_with('*');
        let body = trimmed.trim_start_matches('*').trim();
        let version = body.split_whitespace().next().unwrap_or("").to_string();
        if !version.is_empty() {
            out.push(NodeVersion { version, active });
        }
    }
    out
}

pub fn install_version(root: &Path, version: &str) -> RanResult<()> {
    let _ = run_nvm(root, &["install", version])?;
    Ok(())
}
pub fn use_version(root: &Path, version: &str) -> RanResult<()> {
    let _ = run_nvm(root, &["use", version])?;
    Ok(())
}
pub fn uninstall_version(root: &Path, version: &str) -> RanResult<()> {
    let _ = run_nvm(root, &["uninstall", version])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_list_with_active() {
        let text = "* 20.18.1 (Currently using 64-bit executable)\n    18.20.4\n";
        let v = parse_nvm_list(text);
        assert_eq!(v.len(), 2);
        assert_eq!(v[0].version, "20.18.1");
        assert!(v[0].active);
        assert!(!v[1].active);
    }

    #[test]
    fn settings_rendered() {
        let tmp = tempfile::tempdir().unwrap();
        write_settings(tmp.path()).unwrap();
        let s = std::fs::read_to_string(nvm_dir(tmp.path()).join("settings.txt")).unwrap();
        assert!(s.contains("arch: 64"));
        assert!(s.contains("env\\nvm"));
    }

    #[test]
    fn known_versions_nonempty() {
        assert!(!known_versions().is_empty());
    }
}
```

- [ ] Step 3: `cargo test nvm`。

---

## Task P2-2: pm2 模块

**Files:** Create `src-tauri/src/pm2.rs`；`lib.rs` 加 `mod pm2;`

- [ ] Step 1: `lib.rs` 加 `mod pm2;`

- [ ] Step 2: 写 `pm2.rs`：

```rust
use crate::error::{RanError, RanResult};
use crate::nvm::node_exe;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pm2Process {
    pub name: String,
    pub pid: Option<i32>,
    pub status: String,
    pub cpu: Option<f64>,
    pub memory: Option<f64>,
}

pub fn node_path(root: &Path) -> PathBuf {
    node_exe(root)
}
/// 激活 Node 全局安装的 pm2 入口
pub fn pm2_bin(root: &Path) -> PathBuf {
    node_path(root)
        .parent()
        .unwrap()
        .join("node_modules")
        .join("pm2")
        .join("bin")
        .join("pm2.js")
}
pub fn pm2_installed(root: &Path) -> bool {
    pm2_bin(root).exists()
}
pub fn pm2_home(root: &Path) -> PathBuf {
    root.join("data").join("pm2")
}

/// 用激活 Node 的 npm 全局安装 pm2
pub fn ensure_pm2(root: &Path) -> RanResult<()> {
    if pm2_installed(root) {
        return Ok(());
    }
    let node = node_path(root);
    if !node.exists() {
        return Err(RanError::Other("未找到激活的 Node，先用 nvm 安装并 use 一个版本".into()));
    }
    let npm_cli = node
        .parent()
        .unwrap()
        .join("node_modules")
        .join("npm")
        .join("bin")
        .join("npm-cli.js");
    if !npm_cli.exists() {
        return Err(RanError::Other("未找到 npm-cli.js".into()));
    }
    std::env::set_var("PM2_HOME", pm2_home(root));
    let st = Command::new(&node)
        .arg(&npm_cli)
        .args(["i", "-g", "pm2"])
        .status()?;
    if !st.success() {
        return Err(RanError::Other("npm i -g pm2 失败".into()));
    }
    Ok(())
}

/// 运行 pm2（node pm2.js ...），返回 stdout
pub fn run_pm2(root: &Path, args: &[&str]) -> RanResult<String> {
    let node = node_path(root);
    let bin = pm2_bin(root);
    if !bin.exists() {
        return Err(RanError::Other("pm2 未安装".into()));
    }
    std::env::set_var("PM2_HOME", pm2_home(root));
    let out = Command::new(&node)
        .arg(&bin)
        .args(args)
        .output()
        .map_err(|e| RanError::Other(format!("运行 pm2 失败: {e}")))?;
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

pub fn list(root: &Path) -> RanResult<Vec<Pm2Process>> {
    let text = run_pm2(root, &["jlist"])?;
    Ok(parse_jlist(&text))
}

pub fn parse_jlist(text: &str) -> Vec<Pm2Process> {
    let start = text.find('[');
    let end = text.rfind(']');
    let Some((s, e)) = start.zip(end) else {
        return Vec::new();
    };
    let slice = &text[s..=e];
    #[derive(Deserialize)]
    struct Monit {
        cpu: Option<f64>,
        memory: Option<f64>,
    }
    #[derive(Deserialize)]
    struct Env {
        status: Option<String>,
    }
    #[derive(Deserialize)]
    struct Row {
        name: Option<String>,
        pid: Option<i32>,
        #[serde(rename = "pm2_env")]
        env: Option<Env>,
        monit: Option<Monit>,
    }
    let rows: Vec<Row> = serde_json::from_str(slice).unwrap_or_default();
    rows.into_iter()
        .map(|r| Pm2Process {
            name: r.name.unwrap_or_default(),
            pid: r.pid,
            status: r.env.and_then(|e| e.status).unwrap_or_else(|| "unknown".into()),
            cpu: r.monit.and_then(|m| m.cpu),
            memory: r.monit.and_then(|m| m.memory),
        })
        .collect()
}

pub struct AppInput {
    pub name: String,
    pub script: String,
    pub cwd: String,
    pub env: HashMap<String, String>,
}

pub fn start_app(root: &Path, app: &AppInput) -> RanResult<()> {
    let mut cmd = Command::new(node_path(root));
    cmd.arg(pm2_bin(root));
    cmd.args(["start", &app.script, "--name", &app.name, "--cwd", &app.cwd]);
    std::env::set_var("PM2_HOME", pm2_home(root));
    cmd.env("PM2_HOME", pm2_home(root));
    for (k, v) in &app.env {
        cmd.env(k, v);
    }
    let st = cmd.status()?;
    if !st.success() {
        return Err(RanError::Other(format!("pm2 start {} 失败", app.name)));
    }
    Ok(())
}
pub fn stop_app(root: &Path, name: &str) -> RanResult<()> {
    let _ = run_pm2(root, &["stop", name])?;
    Ok(())
}
pub fn restart_app(root: &Path, name: &str) -> RanResult<()> {
    let _ = run_pm2(root, &["restart", name])?;
    Ok(())
}
pub fn delete_app(root: &Path, name: &str) -> RanResult<()> {
    let _ = run_pm2(root, &["delete", name])?;
    Ok(())
}
pub fn save(root: &Path) -> RanResult<()> {
    let _ = run_pm2(root, &["save"])?;
    Ok(())
}
pub fn resurrect(root: &Path) -> RanResult<()> {
    let _ = run_pm2(root, &["resurrect"])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_jlist_basic() {
        let text = r#"[{"name":"app","pid":12,"pm2_env":{"status":"online"},"monit":{"cpu":1.0,"memory":12345.0}}]"#;
        let v = parse_jlist(text);
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].name, "app");
        assert_eq!(v[0].status, "online");
        assert_eq!(v[0].pid, Some(12));
    }

    #[test]
    fn parse_jlist_dirty_output() {
        let text = "some noise [{\"name\":\"x\",\"pid\":null,\"pm2_env\":{\"status\":\"stopped\"}}] tail";
        let v = parse_jlist(text);
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].status, "stopped");
    }
}
```

- [ ] Step 3: `cargo test pm2`。

---

## Task P2-3: boot 模块（开机自启）

**Files:** Create `src-tauri/src/boot.rs`；`lib.rs` 加 `mod boot;`

- [ ] Step 1: `lib.rs` 加 `mod boot;`

- [ ] Step 2: 写 `boot.rs`：

```rust
use crate::error::{RanError, RanResult};
use crate::nvm::{node_exe, node_symlink};
use crate::pm2::pm2_bin;
use std::path::{Path, PathBuf};

const VBS_NAME: &str = "ran-pm2-resurrect.vbs";

pub fn startup_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Microsoft")
        .join("Windows")
        .join("Start Menu")
        .join("Programs")
        .join("Startup")
}

pub fn vbs_path() -> PathBuf {
    startup_dir().join(VBS_NAME)
}

pub fn is_enabled() -> bool {
    vbs_path().exists()
}

/// 生成 vbs：隐藏窗口运行 `<node> <pm2.js> resurrect`，注入 PM2_HOME
pub fn enable(root: &Path) -> RanResult<()> {
    let node = node_exe(root).to_string_lossy().replace('\\', "\\\\");
    let pm2 = pm2_bin(root).to_string_lossy().replace('\\', "\\\\");
    let pm2_home = crate::pm2::pm2_home(root)
        .to_string_lossy()
        .replace('\\', "\\\\");
    let vbs = format!(
        "' ran-study PM2 autostart\n\
         Set sh = CreateObject(\"WScript.Shell\")\n\
         sh.Environment(\"Process\").Item(\"PM2_HOME\") = \"{pm2_home}\"\n\
         sh.Run \"\"\"{node}\"\" \"\"{pm2}\"\" resurrect\", 0, False\n"
    );
    std::fs::create_dir_all(startup_dir())?;
    std::fs::write(vbs_path(), vbs)?;
    Ok(())
}

pub fn disable() -> RanResult<()> {
    let p = vbs_path();
    if p.exists() {
        std::fs::remove_file(p)?;
    }
    Ok(())
}

/// 渲染 vbs 内容（供单测，不依赖真实 PM2_HOME 路径）
pub fn render_vbs(node: &str, pm2: &str, pm2_home: &str) -> String {
    let n = node.replace('\\', "\\\\");
    let p = pm2.replace('\\', "\\\\");
    let h = pm2_home.replace('\\', "\\\\");
    format!(
        "' ran-study PM2 autostart\n\
         Set sh = CreateObject(\"WScript.Shell\")\n\
         sh.Environment(\"Process\").Item(\"PM2_HOME\") = \"{h}\"\n\
         sh.Run \"\"\"{n}\"\" \"\"{p}\"\" resurrect\", 0, False\n"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn render_vbs_contains_resurrect_and_hidden() {
        let v = render_vbs("C:\\ran\\env\\node\\node.exe", "C:\\ran\\env\\node\\node_modules\\pm2\\bin\\pm2.js", "C:\\ran\\data\\pm2");
        assert!(v.contains("resurrect"));
        assert!(v.contains(", 0, False"));
        assert!(v.contains("PM2_HOME"));
    }

    #[test]
    fn startup_dir_ends_with_startup() {
        let p = startup_dir();
        assert!(p.ends_with("Startup"));
    }
}
```

- [ ] Step 3: `cargo test boot`。

---

## Task P2-4: repo pm2_apps CRUD

**Files:** Modify `src-tauri/src/repo.rs`

- [ ] Step 1: 在 Repo impl 追加（结构体 `Pm2AppRow`）：

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pm2AppRow {
    pub id: i64,
    pub name: String,
    pub script: String,
    pub cwd: String,
    pub node_version: String,
    pub env_json: String,
    pub autostart: bool,
    pub status: String,
}

impl Repo {
    pub fn insert_pm2_app(&self, a: &Pm2AppRow) -> RanResult<i64> {
        let c = self.conn.lock().unwrap();
        c.execute(
            "INSERT INTO pm2_apps(name,script,cwd,node_version,env_json,instances,log_path,autostart,status)
             VALUES (?1,?2,?3,?4,?5,1,'',?6,?7)",
            rusqlite::params![a.name, a.script, a.cwd, a.node_version, a.env_json,
                if a.autostart { 1 } else { 0 }, "stopped"],
        )?;
        Ok(c.last_insert_rowid())
    }
    pub fn list_pm2_apps(&self) -> RanResult<Vec<Pm2AppRow>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id,name,script,cwd,node_version,env_json,autostart,status FROM pm2_apps")?;
        let rows = stmt.query_map([], |r| {
            Ok(Pm2AppRow {
                id: r.get(0)?, name: r.get(1)?, script: r.get(2)?, cwd: r.get(3)?,
                node_version: r.get::<_, Option<String>>(4)?.unwrap_or_default(),
                env_json: r.get::<_, Option<String>>(5)?.unwrap_or_default(),
                autostart: r.get::<_, i64>(6)? != 0,
                status: r.get::<_, Option<String>>(7)?.unwrap_or_default(),
            })
        })?;
        let mut out = Vec::new();
        for row in rows { out.push(row?); }
        Ok(out)
    }
    pub fn delete_pm2_app(&self, id: i64) -> RanResult<()> {
        self.conn.lock().unwrap().execute("DELETE FROM pm2_apps WHERE id=?1", rusqlite::params![id])?;
        Ok(())
    }
}
```
顶部 `use serde::{Deserialize, Serialize};`（已有）。

- [ ] Step 2: `cargo check`。

---

## Task P2-5: commands/node.rs + commands/pm2.rs + lib 注册

**Files:** Create `src-tauri/src/commands/node.rs`, `commands/pm2.rs`；改 `commands/mod.rs`、`lib.rs`

- [ ] Step 1: `commands/mod.rs` 加 `pub mod node; pub mod pm2;`

- [ ] Step 2: 写 `commands/node.rs`：

```rust
use crate::error::RanResult;
use crate::nvm::{self, NodeVersion};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use super::AppState;

#[tauri::command]
pub fn node_provisioned(state: State<'_, Arc<AppState>>) -> RanResult<bool> {
    Ok(nvm::is_provisioned(&state.root))
}
#[tauri::command]
pub fn known_node_versions() -> RanResult<Vec<String>> {
    Ok(nvm::known_versions())
}
#[tauri::command]
pub fn node_versions_local(state: State<'_, Arc<AppState>>) -> RanResult<Vec<NodeVersion>> {
    nvm::list_local(&state.root)
}
#[tauri::command]
pub async fn provision_nvm(app: AppHandle, state: State<'_, Arc<AppState>>) -> RanResult<()> {
    let root = state.root.clone();
    let st = state.inner().clone();
    let task = st.tasks.create("nvm", "nvm-windows");
    let id = task.id.clone();
    let p = crate::task_progress(st.clone(), id.clone(), app.clone());
    tokio::task::spawn_blocking(move || {
        let r = nvm::provision(&root, |pct, msg| p(pct, msg));
        match r {
            Ok(_) => { st.tasks.finish(&id, true); }
            Err(e) => { st.tasks.set_progress(&id, 100, &e.to_string()); st.tasks.finish(&id, false); }
        }
        let _ = app.emit("task://progress", st.tasks.get(&id));
    }).await.map_err(|e| crate::error::RanError::Other(e.to_string()))?;
    Ok(())
}
#[tauri::command]
pub async fn install_node(app: AppHandle, state: State<'_, Arc<AppState>>, version: String) -> RanResult<()> {
    let root = state.root.clone();
    let st = state.inner().clone();
    let task = st.tasks.create("node", &format!("node@{version}"));
    let id = task.id.clone();
    tokio::task::spawn_blocking(move || {
        let r = nvm::install_version(&root, &version);
        match r { Ok(_) => st.tasks.finish(&id, true), Err(e) => { st.tasks.set_progress(&id,100,&e.to_string()); st.tasks.finish(&id,false);} }
        let _ = app.emit("task://progress", st.tasks.get(&id));
    }).await.map_err(|e| crate::error::RanError::Other(e.to_string()))?;
    Ok(())
}
#[tauri::command]
pub fn use_node(state: State<'_, Arc<AppState>>, version: String) -> RanResult<()> {
    nvm::use_version(&state.root, &version)
}
#[tauri::command]
pub fn uninstall_node(state: State<'_, Arc<AppState>>, version: String) -> RanResult<()> {
    nvm::uninstall_version(&state.root, &version)
}
```

> 需要在 `task/mod.rs` 或 lib 加一个 `task_progress` 助手生成 `ProgressCb`。在 `lib.rs` 加：

```rust
pub fn task_progress(st: Arc<commands::AppState>, id: String, app: tauri::AppHandle) -> crate::provider::ProgressCb {
    use tauri::Emitter;
    std::sync::Arc::new(move |pct, msg| {
        st.tasks.set_progress(&id, pct, msg);
        let _ = app.emit("task://progress", st.tasks.get(&id));
    })
}
```

- [ ] Step 3: 写 `commands/pm2.rs`：

```rust
use super::AppState;
use crate::boot;
use crate::error::RanResult;
use crate::pm2::{self, AppInput, Pm2Process};
use crate::repo::Pm2AppRow;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn pm2_installed(state: State<'_, Arc<AppState>>) -> RanResult<bool> {
    Ok(pm2::pm2_installed(&state.root))
}
#[tauri::command]
pub fn ensure_pm2(state: State<'_, Arc<AppState>>) -> RanResult<()> {
    pm2::ensure_pm2(&state.root)
}
#[tauri::command]
pub fn pm2_list(state: State<'_, Arc<AppState>>) -> RanResult<Vec<Pm2Process>> {
    pm2::list(&state.root)
}
#[tauri::command]
pub fn pm2_apps(state: State<'_, Arc<AppState>>) -> RanResult<Vec<Pm2AppRow>> {
    state.repo.list_pm2_apps()
}
#[tauri::command]
pub fn add_pm2_app(state: State<'_, Arc<AppState>>, row: Pm2AppRow) -> RanResult<i64> {
    let env: HashMap<String, String> = serde_json::from_str(&row.env_json).unwrap_or_default();
    pm2::start_app(&state.root, &AppInput {
        name: row.name.clone(), script: row.script.clone(), cwd: row.cwd.clone(), env,
    })?;
    pm2::save(&state.root)?;
    if row.autostart { let _ = boot::enable(&state.root); }
    state.repo.insert_pm2_app(&row)
}
#[tauri::command]
pub fn stop_pm2_app(state: State<'_, Arc<AppState>>, name: String) -> RanResult<()> {
    pm2::stop_app(&state.root, &name)
}
#[tauri::command]
pub fn restart_pm2_app(state: State<'_, Arc<AppState>>, name: String) -> RanResult<()> {
    pm2::restart_app(&state.root, &name)
}
#[tauri::command]
pub fn delete_pm2_app_cmd(state: State<'_, Arc<AppState>>, id: i64, name: String) -> RanResult<()> {
    pm2::delete_app(&state.root, &name)?;
    pm2::save(&state.root)?;
    state.repo.delete_pm2_app(id)?;
    Ok(())
}
#[tauri::command]
pub fn pm2_boot_enabled() -> RanResult<bool> {
    Ok(boot::is_enabled())
}
#[tauri::command]
pub fn pm2_boot_set(state: State<'_, Arc<AppState>>, enabled: bool) -> RanResult<()> {
    if enabled { boot::enable(&state.root) } else { boot::disable() }
}
```

- [ ] Step 4: `lib.rs` invoke_handler 注册全部 node/pm2 命令。

- [ ] Step 5: `cargo check` + `cargo test`。

---

## Task P2-6: 前端 Node 版本 + PM2 应用 视图

**Files:** `types/api-type.ts` 加类型；`api/node-api.ts`、`api/pm2-api.ts`；`views/node-version/node-version.tsx`、`views/pm2-app/pm2-app.tsx`；`router/index.ts` + 菜单

- [ ] Step 1: `types/api-type.ts` 追加：

```ts
export interface NodeVersion { version: string; active: boolean; }
export interface Pm2Process { name: string; pid: number | null; status: string; cpu: number | null; memory: number | null; }
export interface Pm2App { id: number; name: string; script: string; cwd: string; nodeVersion: string; envJson: string; autostart: boolean; status: string; }
```

- [ ] Step 2: `api/node-api.ts`：

```ts
import { invoke } from '@tauri-apps/api/core';
import type { NodeVersion } from '@/types/api-type';
export const nodeProvisioned = () => invoke<boolean>('node_provisioned');
export const knownNodeVersions = () => invoke<string[]>('known_node_versions');
export const nodeVersionsLocal = () => invoke<NodeVersion[]>('node_versions_local');
export const provisionNvm = () => invoke<void>('provision_nvm');
export const installNode = (version: string) => invoke<void>('install_node', { version });
export const useNode = (version: string) => invoke<void>('use_node', { version });
export const uninstallNode = (version: string) => invoke<void>('uninstall_node', { version });
```

- [ ] Step 3: `api/pm2-api.ts`：

```ts
import { invoke } from '@tauri-apps/api/core';
import type { Pm2App, Pm2Process } from '@/types/api-type';
export const pm2Installed = () => invoke<boolean>('pm2_installed');
export const ensurePm2 = () => invoke<void>('ensure_pm2');
export const pm2List = () => invoke<Pm2Process[]>('pm2_list');
export const pm2Apps = () => invoke<Pm2App[]>('pm2_apps');
export const addPm2App = (row: Omit<Pm2App,'id'|'status'>) => invoke<number>('add_pm2_app', { row });
export const stopPm2App = (name: string) => invoke<void>('stop_pm2_app', { name });
export const restartPm2App = (name: string) => invoke<void>('restart_pm2_app', { name });
export const deletePm2App = (id: number, name: string) => invoke<void>('delete_pm2_app_cmd', { id, name });
export const pm2BootEnabled = () => invoke<boolean>('pm2_boot_enabled');
export const pm2BootSet = (enabled: boolean) => invoke<void>('pm2_boot_set', { enabled });
```

- [ ] Step 4: `views/node-version/node-version.tsx`（已装/已知版本列表 + 安装/切换/卸载 + nvm 置备按钮）。

- [ ] Step 5: `views/pm2-app/pm2-app.tsx`（添加应用表单 + 运行进程表 + 启停/重启/删除 + 开机自启开关）。

- [ ] Step 6: `router/index.ts` 加 `/node-version`、`/pm2-app` 路由；`app-layout` 菜单加项。

- [ ] Step 7: `pnpm exec tsc --noEmit` + `pnpm build`。

---

## Task P2-7: 全量验证 + 提交打标签

- [ ] Step 1: `cargo test`（含 nvm/pm2/boot 单测）。
- [ ] Step 2: `cargo build`（含 sidecar）。
- [ ] Step 3: `tsc --noEmit` + `pnpm build`。
- [ ] Step 4: 运行时冒烟 `ran-study.exe` 无 panic。
- [ ] Step 5: 人工验收（`pnpm tauri dev`）：Node 版本页 → 置备 nvm → 安装 20.x → use → PM2 应用页 → ensure pm2 → 添加 app → 启动 → 状态 online → 勾选开机自启生成 vbs。
- [ ] Step 6: `git commit -m "feat(p2): nvm-windows, pm2 app management, boot autostart" && git tag p2-node-ecosystem`。

---

## P2 验收标准

1. nvm 置备：下载 nvm-noinstall → env/nvm/nvm.exe + settings.txt + 用户级 NVM_HOME/NVM_SYMLINK。
2. `nvm list` 解析正确（active 标记）。
3. `nvm install/use` 后 `<root>/env/node/node.exe` 可用。
4. pm2 ensure（npm i -g pm2）；`pm2 jlist` 解析出 name/status/pid。
5. 添加应用 → pm2 start + save + 持久化 pm2_apps；启停/重启/删除生效。
6. 开机自启：勾选后在用户 Startup 目录生成 `ran-pm2-resurrect.vbs`（隐藏窗口、注入 PM2_HOME、执行 resurrect）。

## 延后

PM2 日志查看器、集群/重启策略、进程级 CPU/内存图表 → P3。
