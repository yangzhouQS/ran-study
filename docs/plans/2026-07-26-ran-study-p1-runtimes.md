# ran-study P1 核心运行时 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 MySQL 与 Redis 两个真实 provider 的完整生命周期（下载→校验→解压→初始化→启动/停止/状态/卸载），支持便携进程与 Windows 服务（nssm/sc）两种运行模式，并通过独立 sidecar 二进制完成需要 UAC 的服务注册/卸载。

**Architecture:** 扩展 `SoftwareProvider` trait（async）为 install/uninstall/start/stop/status；新增共享基建 `process.rs`（子进程拉起/杀进程）与 `service.rs`（sc/nssm 封装 + nssm 下载置备）；MySQL/Redis 各为一个 provider 实现；服务模式经独立 `ran-sidecar` 二进制（`runas` 提权）执行 sc/nssm。命令层把 provider 调用与 SQLite 持久化、任务队列进度对接；前端把 P0 的软件占位页升级为「软件商店 + 已装列表 + 启停」。

**Tech Stack:** Rust（async-trait / tokio::process / reqwest / std::net TcpStream）+ 一个 `[[bin]] ran-sidecar` + TypeScript（Vue3/TSX/Element Plus）

**关联：** spec §6.4/6.5/7.1/7.2；P0 基座（provider trait 骨架、download、elevation、repo、task 队列）已就绪。

**范围说明：** P1 聚焦「装/启/停/状态/卸载」+ 服务化 + 提权 sidecar。数据库管理（建库/改 root 密码/CLI/备份导入）**延后**到 P1.5。

**验证策略：** 纯逻辑（my.ini/redis.conf 渲染、服务名、sc/nssm/sidecar 参数构造、清单）走单测；真实下载安装与 UAC 服务注册因依赖网络/管理员交互，作为 `pnpm tauri dev` 的人工验收项。

---

## 文件结构（P1 新增/修改）

```
src-tauri/
├── Cargo.toml                       加 async-trait、tempfile(转正式)、[[bin]] ran-sidecar
├── tauri.conf.json                  （无需改；sidecar 走 current_exe 同目录）
└── src/
    ├── provider/
    │   ├── mod.rs                   扩展 trait + RunMode/RunStatus/SoftwareSpec/ProgressCb
    │   ├── registry.rs              加 get()
    │   ├── process.rs               [新] ProcessManager：spawn_child / kill_pid / pid_alive
    │   ├── service.rs               [新] sc_* / nssm_* / provision_nssm / install_via_sidecar
    │   ├── mysql.rs                 [新] MysqlProvider
    │   └── redis.rs                 [新] RedisProvider
    ├── download.rs                  加 install_from_zip / port_open
    ├── elevation.rs                 加 sidecar 路径解析 + build_service_args
    ├── repo.rs                      加 software CRUD + SoftwareSpec 映射
    ├── bin/
    │   └── ran-sidecar.rs           [新] 提权 sidecar：解析 --op/--svc/--exe/--args 执行 sc/nssm
    ├── lib.rs                       注册 Mysql/Redis provider + software 命令 + 模块声明
    └── commands/
        ├── mod.rs                   AppState 不变
        └── software.rs              [新] catalog/installed/install/start/stop/status/uninstall
src/
├── api/software-api.ts              [新]
├── types/api-type.ts                加 SoftwareCatalog/InstalledSoftware/RunMode/RunStatus
├── views/software/software.tsx      升级为商店+已装+启停
└── composables/use-installed.ts     [新] 已装列表拉取/刷新
```

---

## Task P1-1: 扩展 Provider trait 与共享类型

**Files:** Modify `src-tauri/src/provider/mod.rs`, `provider/registry.rs`; `Cargo.toml`

- [ ] Step 1: Cargo.toml `[dependencies]` 加 `async-trait = "0.1"`；把 `tempfile` 从 `[dev-dependencies]` 提升到 `[dependencies]`（install_from_zip 非测试用）。

- [ ] Step 2: 重写 `provider/mod.rs`：

```rust
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestVersion {
    pub version: String,
    pub lts: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub id: String,
    pub versions: Vec<ManifestVersion>,
    pub download_url_template: String,
    pub archive: String,
    pub mirror: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RunMode {
    Portable,
    Service,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RunStatus {
    Running,
    Stopped,
    Unknown,
}

/// 运行时实例描述（与 DB software 行一一映射）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoftwareSpec {
    pub id: i64,
    pub provider: String,
    pub version: String,
    pub install_path: PathBuf,
    pub bin_path: PathBuf,
    pub data_path: PathBuf,
    pub config_path: PathBuf,
    pub port: u16,
    pub run_mode: RunMode,
    pub service_name: Option<String>,
}

/// 进度回调：(百分比, 消息)
pub type ProgressCb = Arc<dyn Fn(u32, &str) + Send + Sync>;

#[async_trait]
pub trait SoftwareProvider: Send + Sync {
    fn id(&self) -> &str;
    fn manifest(&self) -> Manifest;
    /// 下载→校验→解压→初始化；返回 spec（尚未落库，id 由调用方填）
    async fn install(
        &self,
        root: &std::path::Path,
        version: &str,
        run_mode: RunMode,
        progress: ProgressCb,
    ) -> crate::error::RanResult<SoftwareSpec>;
    async fn uninstall(&self, spec: &SoftwareSpec) -> crate::error::RanResult<()>;
    async fn start(&self, spec: &SoftwareSpec) -> crate::error::RanResult<()>;
    async fn stop(&self, spec: &SoftwareSpec) -> crate::error::RanResult<()>;
    async fn status(&self, spec: &SoftwareSpec) -> crate::error::RanResult<RunStatus>;
}

pub mod process;
pub mod service;
pub mod mysql;
pub mod redis;
pub mod registry;
```

- [ ] Step 3: `provider/registry.rs` 加 `get`：

```rust
pub fn get(&self, id: &str) -> Option<Arc<dyn SoftwareProvider>> {
    self.providers.get(id).cloned()
}
```
（顶部 `use std::sync::Arc;` 已有。）

- [ ] Step 4: `cargo check`（mysql/redis/process/service 模块文件尚未建会报错，先建空文件占位见各 Task；本步只确认 trait 编译——可暂时把 `pub mod mysql;` 等注释，待对应 Task 取消注释）。为避免反复，**本 Task 暂不在 mod.rs 声明 mysql/redis/process/service**，仅声明 trait；后续 Task 各自补 `pub mod xxx;`。

> 调整：Step 2 的 `pub mod process; pub mod service; pub mod mysql; pub mod redis;` 四行先不写，分别在各模块 Task 内追加。

---

## Task P1-2: download.rs 补 install_from_zip 与 port_open

**Files:** Modify `src-tauri/src/download.rs`

- [ ] Step 1: 追加：

```rust
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration as StdDuration;

/// 解压 zip 并「展平单一顶层目录」后放入 final_dir：
/// 若压缩包内仅一个顶层目录（如 mysql-8.0.36-winx64），则把其内容直接放到 final_dir；
/// 若顶层是多个文件（如 Redis 直接放 redis-server.exe），则原样放入。
pub fn install_from_zip(archive: &Path, final_dir: &Path) -> RanResult<()> {
    let tmp = tempfile::tempdir()?;
    extract_zip(archive, tmp.path())?;
    let entries: Vec<std::fs::DirEntry> =
        std::fs::read_dir(tmp.path())?.collect::<Result<_, _>>()?;
    let src = if entries.len() == 1 && entries[0].path().is_dir() {
        entries[0].path()
    } else {
        tmp.path().to_path_buf()
    };
    std::fs::create_dir_all(final_dir)?;
    move_dir_contents(&src, final_dir)?;
    Ok(())
}

fn move_dir_contents(src: &Path, dest: &Path) -> RanResult<()> {
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let name = entry.file_name();
        let from = entry.path();
        let to = dest.join(&name);
        // 优先 rename（同卷快），失败则 copy+remove（跨卷）
        if std::fs::rename(&from, &to).is_err() {
            if entry.path().is_dir() {
                copy_dir_recursive(&from, &to)?;
            } else {
                std::fs::copy(&from, &to)?;
            }
            if entry.path().is_dir() {
                std::fs::remove_dir_all(&from)?;
            } else {
                std::fs::remove_file(&from)?;
            }
        }
    }
    Ok(())
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> RanResult<()> {
    std::fs::create_dir_all(dest)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let to = dest.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir_recursive(&entry.path(), &to)?;
        } else {
            std::fs::copy(entry.path(), to)?;
        }
    }
    Ok(())
}

/// 探测端口是否被监听（用于运行状态判断，跨重启有效）
pub fn port_open(host: &str, port: u16) -> bool {
    let addr = format!("{host}:{port}");
    let Ok(mut it) = addr.to_socket_addrs() else {
        return false;
    };
    it.next()
        .map(|a| TcpStream::connect_timeout(&a, StdDuration::from_millis(500)).is_ok())
        .unwrap_or(false)
}
```

- [ ] Step 2: 加测试：

```rust
#[test]
fn install_from_zip_flatten_single_root() {
    let tmp = tempfile::tempdir().unwrap();
    let zip_path = tmp.path().join("a.zip");
    make_zip_with_single_top(&zip_path);
    let out = tmp.path().join("out");
    install_from_zip(&zip_path, &out).unwrap();
    assert!(out.join("bin").exists());
}
```
辅助 `make_zip_with_single_top` 用 `zip` crate 写一个含 `pkg-1.0/bin/run.txt` 的 zip（见实现）。

- [ ] Step 3: `cargo test download`，Expected pass。

---

## Task P1-3: 进程管理 process.rs（便携模式）

**Files:** Create `src-tauri/src/provider/process.rs`；在 `provider/mod.rs` 加 `pub mod process;`

- [ ] Step 1: `provider/mod.rs` 顶部追加 `pub mod process;`

- [ ] Step 2: 写 `process.rs`：

```rust
use crate::error::{RanError, RanResult};
use std::path::Path;
use std::process::{Command, Stdio};

/// 后台拉起便携进程（DETACHED），返回 PID。stdout/stderr 可重定向到 log。
pub fn spawn_child(exe: &Path, args: &[&str], cwd: Option<&Path>) -> RanResult<u32> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;
    const DETACHED_PROCESS: u32 = 0x00000008;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;

    let mut cmd = Command::new(exe);
    cmd.args(args);
    if let Some(d) = cwd {
        cmd.current_dir(d);
    }
    cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);

    let child = cmd
        .spawn()
        .map_err(|e| RanError::Other(format!("spawn {} 失败: {e}", exe.display())))?;
    Ok(child.id())
}

/// 结束进程树（taskkill /T /F）
pub fn kill_tree(pid: u32) -> RanResult<()> {
    let status = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    match status {
        Ok(s) if s.success() => Ok(()),
        Ok(_) => Ok(()), // 进程可能已退出
        Err(e) => Err(RanError::Other(format!("taskkill 失败: {e}"))),
    }
}

/// PID 是否存活
pub fn pid_alive(pid: u32) -> bool {
    Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}")])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains(&pid.to_string()))
        .unwrap_or(false)
}
```

- [ ] Step 3: `cargo check`。

---

## Task P1-4: 服务封装 service.rs（sc/nssm + nssm 置备 + sidecar 调用）

**Files:** Create `src-tauri/src/provider/service.rs`；`provider/mod.rs` 加 `pub mod service;`；改 `elevation.rs`

- [ ] Step 1: `provider/mod.rs` 加 `pub mod service;`

- [ ] Step 2: 写 `service.rs`：

```rust
use crate::download;
use crate::error::{RanError, RanResult};
use crate::provider::SoftwareSpec;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

const NSSM_ZIP_URL: &str = "https://nssm.cc/release/nssm-2.24.zip";

pub fn nssm_exe(tools_dir: &Path) -> PathBuf {
    tools_dir.join("nssm").join("nssm.exe")
}

/// 若 nssm.exe 不存在，下载 nssm-2.24.zip 并解压放置
pub fn ensure_nssm(tools_dir: &Path, progress: impl Fn(u32, &str)) -> RanResult<()> {
    let exe = nssm_exe(tools_dir);
    if exe.exists() {
        return Ok(());
    }
    let cache = tools_dir.parent().unwrap_or(tools_dir).join("cache");
    std::fs::create_dir_all(&cache)?;
    let zip = cache.join("nssm-2.24.zip");
    if !zip.exists() {
        progress(10, "下载 nssm-2.24.zip");
        // 复用 download::download（同步包装：在 async 上下文外用阻塞亦可，这里在 install 任务里调用）
        let rt = tokio::runtime::Handle::try_current();
        let downloaded = match rt {
            Ok(h) => h.block_on(download::download(NSSM_ZIP_URL, &zip, |_, _| {}, 0))?,
            Err(_) => {
                let rt = tokio::runtime::Runtime::new()?;
                rt.block_on(download::download(NSSM_ZIP_URL, &zip, |_, _| {}, 0))?
            }
        };
        progress(60, &format!("已下载 {downloaded} 字节"));
    }
    progress(80, "解压 nssm");
    let tmp = tempfile::tempdir()?;
    download::extract_zip(&zip, tmp.path())?;
    let win64 = tmp.path().join("nssm-2.24").join("win64").join("nssm.exe");
    if !win64.exists() {
        return Err(RanError::Other("nssm 包内未找到 win64/nssm.exe".into()));
    }
    std::fs::create_dir_all(exe.parent().unwrap())?;
    std::fs::copy(&win64, &exe)?;
    progress(100, "nssm 就绪");
    Ok(())
}

// ---- sc.exe（MySQL 原生服务） ----
pub fn sc_query_status(svc: &str) -> RanResult<String> {
    let out = Command::new("sc")
        .args(["query", svc])
        .output()
        .map_err(|e| RanError::Other(e.to_string()))?;
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

pub fn sc_start(svc: &str) -> RanResult<()> {
    run_ignore("sc", &["start", svc])
}
pub fn sc_stop(svc: &str) -> RanResult<()> {
    run_ignore("sc", &["stop", svc])
}

// ---- nssm（Redis 等无原生服务） ----
pub fn nssm_start(svc: &str, tools_dir: &Path) -> RanResult<()> {
    run_ignore(nssm_exe(tools_dir).to_str().unwrap(), &["start", svc])
}
pub fn nssm_stop(svc: &str, tools_dir: &Path) -> RanResult<()> {
    run_ignore(nssm_exe(tools_dir).to_str().unwrap(), &["stop", svc])
}

fn run_ignore(prog: &str, args: &[&str]) -> RanResult<()> {
    let _ = Command::new(prog)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    Ok(())
}

/// 解析 sc query 文本中的 STATE
pub fn parse_running(sc_text: &str) -> bool {
    sc_text.to_ascii_lowercase().contains("running")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parse_running_state() {
        assert!(parse_running("STATE : 4 RUNNING"));
        assert!(!parse_running("STATE : 1 STOPPED"));
    }
    #[test]
    fn nssm_path_shape() {
        let p = nssm_exe(Path::new("D:/ran/tools"));
        assert!(p.ends_with(["nssm", "nssm.exe"]));
    }
}
```

- [ ] Step 3: 改 `elevation.rs`：加 sidecar 路径解析与服务安装/卸载参数构造：

```rust
use crate::error::RanResult;
use crate::provider::service;
use crate::provider::SoftwareSpec;
use std::path::PathBuf;

/// 定位 ran-sidecar.exe：与当前 exe 同目录（dev: target/debug）
pub fn sidecar_path() -> RanResult<PathBuf> {
    let exe = std::env::current_exe().map_err(|e| crate::error::RanError::Other(e.to_string()))?;
    let dir = exe
        .parent()
        .ok_or_else(|| crate::error::RanError::Other("无法定位 exe 目录".into()))?;
    Ok(dir.join("ran-sidecar.exe"))
}

/// 构造交给 sidecar 的服务安装参数
pub fn build_service_install_args(spec: &SoftwareSpec) -> Vec<String> {
    let kind = match spec.provider.as_str() {
        "mysql" => "sc_mysql",
        "redis" => "nssm_redis",
        _ => "sc_generic",
    };
    let svc = spec.service_name.clone().unwrap_or_default();
    vec![
        "--op".into(), "service_install".into(),
        "--kind".into(), kind.into(),
        "--svc".into(), svc,
        "--exe".into(), spec.bin_path.to_string_lossy().to_string(),
        "--cfg".into(), spec.config_path.to_string_lossy().to_string(),
    ]
}

pub fn build_service_remove_args(spec: &SoftwareSpec) -> Vec<String> {
    let kind = if spec.provider == "redis" { "nssm" } else { "sc" };
    vec![
        "--op".into(), "service_remove".into(),
        "--kind".into(), kind.into(),
        "--svc".into(), spec.service_name.clone().unwrap_or_default(),
    ]
}

pub fn run_elevated(sidecar_exe: &str, args: &[String]) -> RanResult<()> {
    let mut cmd = runas::Command::new(sidecar_exe);
    for a in args {
        cmd.arg(a);
    }
    cmd.status().map_err(|e| crate::error::RanError::Other(e.to_string()))?;
    Ok(())
}
```
（保留 `build_sidecar_args` 旧函数或删除——P1 改用上面两个。）

- [ ] Step 4: `cargo test service` + `cargo check`。

---

## Task P1-5: 提权 sidecar 二进制 ran-sidecar

**Files:** Create `src-tauri/src/bin/ran-sidecar.rs`；`Cargo.toml` 加 `[[bin]]`

- [ ] Step 1: `Cargo.toml` 加：

```toml
[[bin]]
name = "ran-sidecar"
path = "src/bin/ran-sidecar.rs"
```

- [ ] Step 2: 写 `src/bin/ran-sidecar.rs`（用 lib 的 service 模块执行 sc/nssm）：

```rust
use ran_study_lib::provider::service;
use std::collections::HashMap;
use std::process::Command;

fn parse_args() -> HashMap<String, String> {
    let mut map = HashMap::new();
    let mut args = std::env::args().skip(1);
    while let Some(k) = args.next() {
        if let Some(key) = k.strip_prefix("--") {
            if let Some(v) = args.next() {
                map.insert(key.to_string(), v);
            }
        }
    }
    map
}

fn main() {
    let a = parse_args();
    let op = a.get("op").cloned().unwrap_or_default();
    let kind = a.get("kind").cloned().unwrap_or_default();
    let svc = a.get("svc").cloned().unwrap_or_default();
    let result: i32 = match (op.as_str(), kind.as_str()) {
        ("service_install", "sc_mysql") => install_sc_mysql(&a, &svc),
        ("service_install", "nssm_redis") => install_nssm_redis(&a, &svc),
        ("service_install", _) => install_sc_generic(&a, &svc),
        ("service_remove", "nssm") => nssm_remove(&svc),
        ("service_remove", _) => sc_remove(&svc),
        _ => { eprintln!("unknown op/kind"); 2 }
    };
    std::process::exit(result);
}

fn install_sc_mysql(a: &HashMap<String, String>, svc: &str) -> i32 {
    let exe = a.get("exe").cloned().unwrap_or_default();
    let cfg = a.get("cfg").cloned().unwrap_or_default();
    let s = Command::new(&exe)
        .args(["--install", svc, "--defaults-file", &cfg]).status();
    status_code(s)
}
fn install_sc_generic(a: &HashMap<String, String>, svc: &str) -> i32 {
    let exe = a.get("exe").cloned().unwrap_or_default();
    let binname = std::path::Path::new(&exe)
        .file_name().and_then(|n| n.to_str()).unwrap_or("svc");
    // 通用二进制服务：用 sc create + binPath
    let s = Command::new("sc").args(["create", svc, "binPath=", &format!("\"{exe}\""), "start=", "auto"]).status();
    let _ = binname;
    status_code(s)
}
fn install_nssm_redis(a: &HashMap<String, String>, svc: &str) -> i32 {
    let exe = a.get("exe").cloned().unwrap_or_default();
    let cfg = a.get("cfg").cloned().unwrap_or_default();
    // nssm 需在 PATH 或同目录；sidecar 与主程序同目录无 nssm，这里要求已置备到默认 tools
    let tools = std::env::var("RAN_TOOLS_DIR").unwrap_or_else(|_| "D:\\ran\\tools".into());
    let nssm = std::path::Path::new(&tools).join("nssm").join("nssm.exe");
    let s1 = Command::new(&nssm).args(["install", svc, &exe, &cfg]).status();
    let _ = service::run_ignore; // 触发引用，避免未使用告警
    status_code(s1)
}
fn sc_remove(svc: &str) -> i32 {
    let _ = Command::new("sc").args(["stop", svc]).status();
    status_code(Command::new("sc").args(["delete", svc]).status())
}
fn nssm_remove(svc: &str) -> i32 {
    let tools = std::env::var("RAN_TOOLS_DIR").unwrap_or_else(|_| "D:\\ran\\tools".into());
    let nssm = std::path::Path::new(&tools).join("nssm").join("nssm.exe");
    let _ = Command::new(&nssm).args(["stop", svc]).status();
    status_code(Command::new(&nssm).args(["remove", svc, "confirm"]).status())
}
fn status_code(r: std::io::Result<std::process::ExitStatus>) -> i32 {
    match r { Ok(s) => s.code().unwrap_or(1), Err(_) => 1 }
}
```

> 说明：sidecar 依赖主程序已置备 nssm 到 `<root>/tools/nssm`，并通过环境变量 `RAN_TOOLS_DIR`（主程序启动时设置）告知路径。主程序 run() 中 `std::env::set_var("RAN_TOOLS_DIR", root.join("tools"))`。

- [ ] Step 3: `cargo check`（会同时编译 ran-sidecar.bin）。

---

## Task P1-6: MysqlProvider

**Files:** Create `src-tauri/src/provider/mysql.rs`；`provider/mod.rs` 加 `pub mod mysql;`；lib.rs 注册

- [ ] Step 1: `provider/mod.rs` 加 `pub mod mysql;`

- [ ] Step 2: 写 `mysql.rs`：

```rust
use crate::download;
use crate::error::{RanError, RanResult};
use crate::provider::service;
use crate::provider::{process, ProgressCb, RunMode, RunStatus, SoftwareSpec, SoftwareProvider};
use async_trait::async_trait;
use std::path::{Path, PathBuf};
use std::process::Command;

const DEFAULT_PORT: u16 = 3306;

pub struct MysqlProvider;

#[async_trait]
impl SoftwareProvider for MysqlProvider {
    fn id(&self) -> &str { "mysql" }

    fn manifest(&self) -> crate::provider::Manifest {
        crate::provider::Manifest {
            id: "mysql".into(),
            versions: vec![
                v("8.0.36", true),
                v("8.4.3", true),
            ],
            download_url_template:
                "https://dev.mysql.com/get/Downloads/MySQL-${major}/mysql-${version}-winx64.zip".into(),
            archive: "zip".into(),
            mirror:
                "https://mirrors.tuna.tsinghua.edu.cn/mysql/downloads/MySQL-${major}/mysql-${version}-winx64.zip".into(),
        }
    }

    async fn install(&self, root: &Path, version: &str, run_mode: RunMode, progress: ProgressCb) -> RanResult<SoftwareSpec> {
        let major = version.split('.').take(2).collect::<Vec<_>>().join(".");
        let url = self.manifest().download_url_template
            .replace("${major}", &major).replace("${version}", version);
        let install_path = root.join("env").join("mysql").join(format!("mysql-{version}"));
        let data_path = root.join("data").join("mysql").join(format!("mysql-{version}"));
        let config_path = install_path.join("my.ini");
        let bin_path = install_path.join("bin").join("mysqld.exe");
        let cache = root.join("cache");
        std::fs::create_dir_all(&cache)?;

        if install_path.exists() {
            return Err(RanError::Other(format!("MySQL {version} 已存在")));
        }

        progress(5, &format!("下载 {version}"));
        let zip = cache.join(format!("mysql-{version}-winx64.zip"));
        let total = 0u64;
        download::download(&url, &zip, |d, t| {
            let pct = if t > 0 { (d * 60 / t) as u32 + 5 } else { 5 };
            progress(pct.min(60), &format!("下载 {d}/{t} 字节"));
        }, total).await?;

        progress(65, "校验并解压");
        download::install_from_zip(&zip, &install_path)?;

        if !bin_path.exists() {
            return Err(RanError::Other(format!("解压后未找到 {}", bin_path.display())));
        }

        progress(75, "初始化数据目录");
        std::fs::create_dir_all(&data_path)?;
        write_my_ini(&config_path, &install_path, &data_path, DEFAULT_PORT)?;
        // mysqld --initialize-insecure（无密码 root）
        let st = Command::new(&bin_path)
            .args(["--defaults-file=".to_string() + config_path.to_str().unwrap(), "--initialize-insecure"])
            .status()?;
        if !st.success() {
            return Err(RanError::Other("mysqld --initialize-insecure 失败".into()));
        }

        let svc = if run_mode == RunMode::Service {
            Some(format!("ran-mysql-{version}"))
        } else { None };

        progress(100, "安装完成");
        Ok(SoftwareSpec {
            id: 0, provider: "mysql".into(), version: version.into(),
            install_path, bin_path, data_path, config_path,
            port: DEFAULT_PORT, run_mode, service_name: svc,
        })
    }

    async fn uninstall(&self, spec: &SoftwareSpec) -> RanResult<()> {
        if spec.run_mode == RunMode::Service {
            if let Some(svc) = &spec.service_name {
                let _ = Command::new("sc").args(["stop", svc]).status();
                let _ = Command::new("sc").args(["delete", svc]).status();
            }
        }
        if spec.install_path.exists() { std::fs::remove_dir_all(&spec.install_path)?; }
        if spec.data_path.exists() { std::fs::remove_dir_all(&spec.data_path)?; }
        Ok(())
    }

    async fn start(&self, spec: &SoftwareSpec) -> RanResult<()> {
        match spec.run_mode {
            RunMode::Portable => {
                let cfg = format!("--defaults-file={}", spec.config_path.display());
                process::spawn_child(&spec.bin_path, &[cfg.as_str()], None)?;
                Ok(())
            }
            RunMode::Service => {
                let Some(svc) = &spec.service_name else {
                    return Err(RanError::Other("服务模式缺少服务名".into()));
                };
                // 已注册则直接启动（注册在 install 时经 sidecar 完成）
                service::sc_start(svc)
            }
        }
    }

    async fn stop(&self, spec: &SoftwareSpec) -> RanResult<()> {
        match spec.run_mode {
            RunMode::Portable => {
                let admin = spec.install_path.join("bin").join("mysqladmin.exe");
                let _ = Command::new(&admin)
                    .args(["-u", "root", "shutdown"]).status();
                Ok(())
            }
            RunMode::Service => {
                if let Some(svc) = &spec.service_name { service::sc_stop(svc)?; }
                Ok(())
            }
        }
    }

    async fn status(&self, spec: &SoftwareSpec) -> RanResult<RunStatus> {
        match spec.run_mode {
            RunMode::Portable => {
                Ok(if download::port_open("127.0.0.1", spec.port) { RunStatus::Running } else { RunStatus::Stopped })
            }
            RunMode::Service => {
                let Some(svc) = &spec.service_name else { return Ok(RunStatus::Unknown); };
                let text = service::sc_query_status(svc)?;
                Ok(if service::parse_running(&text) { RunStatus::Running } else { RunStatus::Stopped })
            }
        }
    }
}

fn v(version: &str, lts: bool) -> crate::provider::ManifestVersion {
    crate::provider::ManifestVersion { version: version.into(), lts }
}

fn write_my_ini(path: &Path, basedir: &Path, datadir: &Path, port: u16) -> RanResult<()> {
    let ini = format!(
        "[mysqld]\nbasedir=\"{}\"\ndatadir=\"{}\"\nport={}\ncharacter-set-server=utf8mb4\ncollation-server=utf8mb4_unicode_ci\nmax_connections=200\n",
        basedir.display(), datadir.display(), port
    );
    std::fs::write(path, ini)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn my_ini_has_port_and_charset() {
        let tmp = tempfile::tempdir().unwrap();
        let ini = tmp.path().join("my.ini");
        write_my_ini(&ini, tmp.path(), tmp.path(), 3307).unwrap();
        let s = std::fs::read_to_string(&ini).unwrap();
        assert!(s.contains("port=3307"));
        assert!(s.contains("utf8mb4"));
    }
    #[test]
    fn manifest_versions_nonempty() {
        let m = MysqlProvider.manifest();
        assert!(!m.versions.is_empty());
        assert!(m.download_url_template.contains("${version}"));
    }
}
```

- [ ] Step 3: `cargo test mysql`。

---

## Task P1-7: RedisProvider

**Files:** Create `src-tauri/src/provider/redis.rs`；`provider/mod.rs` 加 `pub mod redis;`

- [ ] Step 1: `provider/mod.rs` 加 `pub mod redis;`

- [ ] Step 2: 写 `redis.rs`（tporadowski 移植版，zip 内 redis-server.exe 在根，无顶层目录；服务模式经 nssm）：

```rust
use crate::download;
use crate::error::{RanError, RanResult};
use crate::provider::service;
use crate::provider::{process, ProgressCb, RunMode, RunStatus, SoftwareSpec, SoftwareProvider};
use async_trait::async_trait;
use std::path::{Path, PathBuf};
use std::process::Command;

const DEFAULT_PORT: u16 = 6379;
// tporadowski 移植版（Windows x64）
const URL: &str = "https://github.com/tporadowski/redis/releases/download/v${version}/Redis-x64-${version}.zip";

pub struct RedisProvider;

#[async_trait]
impl SoftwareProvider for RedisProvider {
    fn id(&self) -> &str { "redis" }

    fn manifest(&self) -> crate::provider::Manifest {
        crate::provider::Manifest {
            id: "redis".into(),
            versions: vec![v("5.0.14.1", false)],
            download_url_template: URL.into(),
            archive: "zip".into(),
            mirror: String::new(),
        }
    }

    async fn install(&self, root: &Path, version: &str, run_mode: RunMode, progress: ProgressCb) -> RanResult<SoftwareSpec> {
        let url = URL.replace("${version}", version);
        let install_path = root.join("env").join("redis").join(format!("redis-{version}"));
        let data_path = root.join("data").join("redis").join(format!("redis-{version}"));
        let config_path = install_path.join("redis.conf");
        let bin_path = install_path.join("redis-server.exe");
        let cache = root.join("cache");
        std::fs::create_dir_all(&cache)?;

        if install_path.exists() { return Err(RanError::Other(format!("Redis {version} 已存在"))); }

        // 服务模式需要 nssm
        if run_mode == RunMode::Service {
            progress(2, "置备 nssm");
            service::ensure_nssm(&root.join("tools"), |p, m| progress(p / 4, m))?;
        }

        progress(10, "下载 Redis");
        let zip = cache.join(format!("redis-{version}.zip"));
        download::download(&url, &zip, |d, t| {
            let pct = if t > 0 { (d * 50 / t) as u32 + 10 } else { 10 };
            progress(pct.min(60), &format!("下载 {d}/{t}"));
        }, 0).await?;

        progress(70, "解压");
        download::install_from_zip(&zip, &install_path)?;
        if !bin_path.exists() { return Err(RanError::Other("解压后未找到 redis-server.exe".into())); }

        progress(85, "生成配置");
        std::fs::create_dir_all(&data_path)?;
        write_redis_conf(&config_path, DEFAULT_PORT, &data_path)?;

        let svc = if run_mode == RunMode::Service { Some(format!("ran-redis-{version}")) } else { None };
        progress(100, "安装完成");
        Ok(SoftwareSpec {
            id: 0, provider: "redis".into(), version: version.into(),
            install_path, bin_path, data_path, config_path,
            port: DEFAULT_PORT, run_mode, service_name: svc,
        })
    }

    async fn uninstall(&self, spec: &SoftwareSpec) -> RanResult<()> {
        if spec.run_mode == RunMode::Service {
            if let Some(svc) = &spec.service_name {
                let _ = service::nssm_stop(svc, &spec.install_path); // tools_dir 略，见 note
            }
        }
        if spec.install_path.exists() { std::fs::remove_dir_all(&spec.install_path)?; }
        if spec.data_path.exists() { std::fs::remove_dir_all(&spec.data_path)?; }
        Ok(())
    }

    async fn start(&self, spec: &SoftwareSpec) -> RanResult<()> {
        match spec.run_mode {
            RunMode::Portable => {
                let cfg = spec.config_path.to_string_lossy().to_string();
                process::spawn_child(&spec.bin_path, &[cfg.as_str()], Some(&spec.install_path))?;
                Ok(())
            }
            RunMode::Service => {
                let Some(svc) = &spec.service_name else { return Err(RanError::Other("缺服务名".into())); };
                service::nssm_start(svc, &spec.install_path.parent().unwrap().parent().unwrap().join("tools"))
            }
        }
    }

    async fn stop(&self, spec: &SoftwareSpec) -> RanResult<()> {
        match spec.run_mode {
            RunMode::Portable => {
                let cli = spec.install_path.join("redis-cli.exe");
                let _ = Command::new(&cli).args(["-p", &spec.port.to_string(), "shutdown"]).status();
                Ok(())
            }
            RunMode::Service => {
                if let Some(svc) = &spec.service_name {
                    let tools = spec.install_path.parent().unwrap().parent().unwrap().join("tools");
                    service::nssm_stop(svc, &tools)?;
                }
                Ok(())
            }
        }
    }

    async fn status(&self, spec: &SoftwareSpec) -> RanResult<RunStatus> {
        Ok(if download::port_open("127.0.0.1", spec.port) { RunStatus::Running } else { RunStatus::Stopped })
    }
}

fn v(version: &str, lts: bool) -> crate::provider::ManifestVersion {
    crate::provider::ManifestVersion { version: version.into(), lts }
}

fn write_redis_conf(path: &Path, port: u16, dir: &Path) -> RanResult<()> {
    let conf = format!(
        "port {port}\nbind 127.0.0.1\ndir \"{}\"\nprotected-mode yes\nappendonly yes\n",
        dir.display()
    );
    std::fs::write(path, conf)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn redis_conf_has_port_and_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("redis.conf");
        write_redis_conf(&p, 6380, tmp.path()).unwrap();
        let s = std::fs::read_to_string(&p).unwrap();
        assert!(s.contains("port 6380"));
        assert!(s.contains("appendonly yes"));
    }
}
```

- [ ] Step 3: `cargo test redis`。

---

## Task P1-8: repo.rs software CRUD

**Files:** Modify `src-tauri/src/repo.rs`

- [ ] Step 1: 追加方法（用 `SoftwareSpec` 做 row ↔ struct 映射）：

```rust
use crate::provider::{RunMode, SoftwareSpec};

impl Repo {
    pub fn insert_software(&self, spec: &SoftwareSpec) -> RanResult<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO software(type,version,install_path,data_path,run_mode,service_name,status,is_active)
             VALUES (?1,?2,?3,?4,?5,?6,?7,1)",
            rusqlite::params![
                spec.provider, spec.version,
                spec.install_path.to_string_lossy(), spec.data_path.to_string_lossy(),
                run_mode_str(spec.run_mode),
                spec.service_name.as_deref().unwrap_or(""),
                "stopped",
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn list_software(&self) -> RanResult<Vec<SoftwareSpec>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id,type,version,install_path,data_path,run_mode,service_name FROM software")?;
        let rows = stmt.query_map([], |r| {
            let inst: String = r.get(2)?; // placeholder
            Ok((r.get::<_,i64>(0)?, r.get::<_,String>(1)?, r.get::<_,String>(2)?,
                r.get::<_,String>(3)?, r.get::<_,String>(4)?, r.get::<_,String>(5)?,
                r.get::<_,String>(6)?))
        })?;
        let mut out = Vec::new();
        for row in rows {
            let (id, prov, ver, inst, data, rm, svc) = row?;
            let inst_p = std::path::PathBuf::from(&inst);
            let bin = bin_for(&prov, &inst_p);
            out.push(SoftwareSpec {
                id, provider: prov, version: ver,
                install_path: inst_p.clone(),
                bin_path: bin.clone(),
                data_path: std::path::PathBuf::from(&data),
                config_path: config_for(&prov, &inst_p),
                port: default_port(&prov),
                run_mode: parse_run_mode(&rm),
                service_name: if svc.is_empty() { None } else { Some(svc) },
            });
        }
        Ok(out)
    }

    pub fn update_status(&self, id: i64, status: &str) -> RanResult<()> {
        self.conn.lock().unwrap().execute(
            "UPDATE software SET status=?1 WHERE id=?2", rusqlite::params![status, id])?;
        Ok(())
    }

    pub fn delete_software(&self, id: i64) -> RanResult<()> {
        self.conn.lock().unwrap().execute("DELETE FROM software WHERE id=?1", rusqlite::params![id])?;
        Ok(())
    }
}

fn run_mode_str(m: RunMode) -> &'static str { match m { RunMode::Portable => "portable", RunMode::Service => "service" } }
fn parse_run_mode(s: &str) -> RunMode { if s == "service" { RunMode::Service } else { RunMode::Portable } }
fn bin_for(prov: &str, inst: &std::path::Path) -> std::path::PathBuf {
    match prov { "mysql" => inst.join("bin").join("mysqld.exe"), _ => inst.join("redis-server.exe") }
}
fn config_for(prov: &str, inst: &std::path::Path) -> std::path::PathBuf {
    match prov { "mysql" => inst.join("my.ini"), _ => inst.join("redis.conf") }
}
fn default_port(prov: &str) -> u16 { match prov { "mysql" => 3306, "redis" => 6379, _ => 0 } }
```

- [ ] Step 2: `cargo check` + `cargo test repo`（既有 1 测仍过）。

---

## Task P1-9: commands/software.rs + 注册 provider + lib.rs

**Files:** Create `src-tauri/src/commands/software.rs`；改 `commands/mod.rs`、`lib.rs`

- [ ] Step 1: `commands/mod.rs` 加 `pub mod software;`

- [ ] Step 2: 写 `commands/software.rs`：

```rust
use super::AppState;
use crate::elevation;
use crate::provider::{Manifest, RunMode, RunStatus, SoftwareSpec};
use crate::error::RanResult;
use std::sync::Arc;
use tauri::async_runtime;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub fn list_catalog(state: State<'_, Arc<AppState>>) -> RanResult<Vec<Manifest>> {
    Ok(state.providers.lock().unwrap().list().into_iter().map(|p| p.manifest()).collect())
}

#[tauri::command]
pub fn list_installed(state: State<'_, Arc<AppState>>) -> RanResult<Vec<SoftwareSpec>> {
    state.repo.list_software()
}

#[tauri::command]
pub async fn install_software(
    app: AppHandle, state: State<'_, Arc<AppState>>,
    provider: String, version: String, run_mode: RunMode,
) -> RanResult<String> {
    let prov = state.providers.lock().unwrap().get(&provider)
        .ok_or_else(|| crate::error::RanError::NotFound(format!("provider {provider}")))?;
    let root = state.root.clone();
    let task = state.tasks.create("install", &format!("{provider}@{version}"));
    let task_id = task.id.clone();
    let st = state.inner().clone();

    let progress: crate::provider::ProgressCb = {
        let st = st.clone();
        let app = app.clone();
        Arc::new(move |pct, msg| {
            st.tasks.set_progress(&task_id, pct, msg);
            let _ = app.emit("task://progress", st.tasks.get(&task_id));
        })
    };

    async_runtime::spawn(async move {
        let res = prov.install(&root, &version, run_mode, progress).await;
        match res {
            Ok(mut spec) => {
                // 服务模式：经 sidecar 注册（UAC）
                if run_mode == RunMode::Service {
                    if let Ok(sc) = elevation::sidecar_path() {
                        let args = elevation::build_service_install_args(&spec);
                        let _ = elevation::run_elevated(sc.to_str().unwrap(), &args);
                    }
                }
                let id = st.repo.insert_software(&spec).unwrap_or(-1);
                spec.id = id;
                let _ = st.repo.update_status(id, "stopped");
                st.tasks.finish(&task_id, true);
                let _ = app.emit("task://progress", st.tasks.get(&task_id));
                let _ = app.emit("software://changed", ());
            }
            Err(e) => {
                st.tasks.set_progress(&task_id, 100, &e.to_string());
                st.tasks.finish(&task_id, false);
                let _ = app.emit("task://progress", st.tasks.get(&task_id));
            }
        }
    });
    Ok(task.id)
}

#[tauri::command]
pub async fn control_software(
    state: State<'_, Arc<AppState>>, id: i64, action: String,
) -> RanResult<RunStatus> {
    let spec = state.repo.list_software()?.into_iter().find(|s| s.id == id)
        .ok_or_else(|| crate::error::RanError::NotFound(format!("software {id}")))?;
    let prov = state.providers.lock().unwrap().get(&spec.provider)
        .ok_or_else(|| crate::error::RanError::NotFound(spec.provider.clone()))?;
    match action.as_str() {
        "start" => { prov.start(&spec).await?; let s = prov.status(&spec).await?; upd(&state.repo, id, s); Ok(s) }
        "stop"  => { prov.stop(&spec).await?; let s = prov.status(&spec).await?; upd(&state.repo, id, s); Ok(s) }
        "status"=> { let s = prov.status(&spec).await?; upd(&state.repo, id, s); Ok(s) }
        _ => Err(crate::error::RanError::Other("未知 action".into())),
    }
}

#[tauri::command]
pub async fn uninstall_software(state: State<'_, Arc<AppState>>, id: i64) -> RanResult<()> {
    let spec = state.repo.list_software()?.into_iter().find(|s| s.id == id)
        .ok_or_else(|| crate::error::RanError::NotFound(format!("software {id}")))?;
    let prov = state.providers.lock().unwrap().get(&spec.provider)
        .ok_or_else(|| crate::error::RanError::NotFound(spec.provider.clone()))?;
    if spec.run_mode == RunMode::Service {
        if let Ok(sc) = elevation::sidecar_path() {
            let _ = elevation::run_elevated(sc.to_str().unwrap(), &elevation::build_service_remove_args(&spec));
        }
    }
    prov.uninstall(&spec).await?;
    state.repo.delete_software(id)?;
    Ok(())
}

fn upd(repo: &crate::repo::Repo, id: i64, s: RunStatus) {
    let txt = match s { RunStatus::Running => "running", RunStatus::Stopped => "stopped", _ => "unknown" };
    let _ = repo.update_status(id, txt);
}
```

- [ ] Step 3: `lib.rs` 注册 provider + 命令 + 设 `RAN_TOOLS_DIR`：

```rust
use provider::mysql::MysqlProvider;
use provider::redis::RedisProvider;
use std::sync::Arc;
// ...
pub fn run() {
    let root = settings::read_bootstrap_root().unwrap_or_else(paths::default_root);
    let _ = paths::ensure_layout(&root);
    std::env::set_var("RAN_TOOLS_DIR", root.join("tools"));

    // ... repo/settings ...

    let mut providers = ProviderRegistry::new();
    providers.register(Arc::new(MysqlProvider));
    providers.register(Arc::new(RedisProvider));

    let state = Arc::new(commands::AppState {
        root: root.clone(), settings: Mutex::new(settings), repo,
        providers: Mutex::new(providers), tasks: task::TaskQueue::new(),
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            get_system_info, init_root, get_settings, set_root_dir,
            list_tasks, create_demo_task,
            commands::software::list_catalog,
            commands::software::list_installed,
            commands::software::install_software,
            commands::software::control_software,
            commands::software::uninstall_software,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] Step 4: `cargo check` + `cargo test`（全部通过）。

---

## Task P1-10: 前端软件商店视图

**Files:** Create `src/api/software-api.ts`, `src/composables/use-installed.ts`；改 `src/types/api-type.ts`, `src/views/software/software.tsx`

- [ ] Step 1: `types/api-type.ts` 追加：

```ts
export interface ManifestVersion { version: string; lts: boolean; }
export interface SoftwareCatalog { id: string; versions: ManifestVersion[]; downloadUrlTemplate: string; archive: string; mirror: string; }
export type RunMode = 'Portable' | 'Service';
export type RunStatus = 'Running' | 'Stopped' | 'Unknown';
export interface InstalledSoftware {
  id: number; provider: string; version: string;
  installPath: string; binPath: string; dataPath: string;
  configPath: string; port: number; runMode: RunMode; serviceName: string | null;
}
```

- [ ] Step 2: `api/software-api.ts`：

```ts
import { invoke } from '@tauri-apps/api/core';
import type { SoftwareCatalog, InstalledSoftware, RunMode, RunStatus } from '@/types/api-type';

export const listCatalog = () => invoke<SoftwareCatalog[]>('list_catalog');
export const listInstalled = () => invoke<InstalledSoftware[]>('list_installed');
export const installSoftware = (provider: string, version: string, runMode: RunMode) =>
  invoke<string>('install_software', { provider, version, runMode });
export const controlSoftware = (id: number, action: 'start'|'stop'|'status') =>
  invoke<RunStatus>('control_software', { id, action });
export const uninstallSoftware = (id: number) => invoke<void>('uninstall_software', { id });
```

- [ ] Step 3: `composables/use-installed.ts`：

```ts
import { listen } from '@tauri-apps/api/event';
import { onMounted, onUnmounted, ref } from 'vue';
import { listInstalled } from '@/api/software-api';
import type { InstalledSoftware } from '@/types/api-type';

export function useInstalled() {
  const list = ref<InstalledSoftware[]>([]);
  let un: (() => void) | null = null;
  const refresh = async () => { list.value = await listInstalled(); };
  onMounted(async () => { await refresh(); un = await listen('software://changed', refresh); });
  onUnmounted(() => un?.());
  return { list, refresh };
}
```

- [ ] Step 4: 重写 `views/software/software.tsx`：商店区（每个 provider 选版本+模式→安装），已装区（启/停/状态/卸载）。安装触发后用 `useTaskStream` 显示进度。

```tsx
import { defineComponent, onMounted, ref } from 'vue';
import { ElAlert, ElButton, ElSelect, ElOption, ElTable, ElTableColumn, ElTag, ElMessage } from 'element-plus';
import { listCatalog } from '@/api/software-api';
import { useInstalled } from '@/composables/use-installed';
import { installSoftware, controlSoftware, uninstallSoftware } from '@/api/software-api';
import { useTaskStream } from '@/composables/use-task-stream';
import type { SoftwareCatalog, RunMode } from '@/types/api-type';

export default defineComponent({
  name: 'Software',
  setup() {
    const catalog = ref<SoftwareCatalog[]>([]);
    const { list: installed, refresh } = useInstalled();
    const { tasks } = useTaskStream();
    const sel: Record<string, { version: string; mode: RunMode }> = {};

    onMounted(async () => { catalog.value = await listCatalog(); });

    const doInstall = async (c: SoftwareCatalog) => {
      const v = (sel[c.id]?.version) || c.versions[0]?.version || '';
      const m: RunMode = sel[c.id]?.mode || 'Portable';
      await installSoftware(c.id, v, m);
      ElMessage.success(`已提交安装 ${c.id}@${v}`);
    };
    const act = async (id: number, a: 'start'|'stop') => {
      await controlSoftware(id, a); await refresh();
    };
    const rm = async (id: number) => { await uninstallSoftware(id); await refresh(); };

    return () => (
      <div>
        <ElAlert title="软件商店（P1）" type="info" showIcon closable={false} />
        <h3>可安装</h3>
        <ElTable data={catalog.value}>
          <ElTableColumn prop="id" label="软件" width={120} />
          <ElTableColumn label="版本" width={180}>
            {{ default: (scope: { row: SoftwareCatalog }) => (
              <ElSelect modelValue={sel[scope.row.id]?.version || scope.row.versions[0]?.version}
                onChange={(v: string) => { sel[scope.row.id] = { version: v, mode: sel[scope.row.id]?.mode || 'Portable' }; }}
                placeholder="版本" size="small">
                {scope.row.versions.map(x => <ElOption label={x.version} value={x.version} />)}
              </ElSelect>
            ) }}
          </ElTableColumn>
          <ElTableColumn label="模式" width={150}>
            {{ default: (scope: { row: SoftwareCatalog }) => (
              <ElSelect modelValue={sel[scope.row.id]?.mode || 'Portable'}
                onChange={(m: RunMode) => { sel[scope.row.id] = { version: sel[scope.row.id]?.version || scope.row.versions[0]?.version || '', mode: m }; }}
                size="small">
                <ElOption label="便携" value="Portable" />
                <ElOption label="服务" value="Service" />
              </ElSelect>
            ) }}
          </ElTableColumn>
          <ElTableColumn label="操作" width={120}>
            {{ default: (scope: { row: SoftwareCatalog }) => (
              <ElButton type="primary" size="small" onClick={() => doInstall(scope.row)}>安装</ElButton>
            ) }}
          </ElTableColumn>
        </ElTable>

        <h3>已安装</h3>
        <ElTable data={installed.value}>
          <ElTableColumn prop="provider" label="软件" width={120} />
          <ElTableColumn prop="version" label="版本" width={140} />
          <ElTableColumn prop="runMode" label="模式" width={100} />
          <ElTableColumn prop="port" label="端口" width={90} />
          <ElTableColumn label="操作" width={240}>
            {{ default: (scope: { row: { id: number } }) => (
              <span>
                <ElButton size="small" onClick={() => act(scope.row.id, 'start')}>启动</ElButton>
                <ElButton size="small" onClick={() => act(scope.row.id, 'stop')}>停止</ElButton>
                <ElButton type="danger" size="small" onClick={() => rm(scope.row.id)}>卸载</ElButton>
              </span>
            ) }}
          </ElTableColumn>
        </ElTable>

        <h3>任务进度</h3>
        <ElTable data={tasks.value}>
          <ElTableColumn prop="target" label="目标" />
          <ElTableColumn prop="status" label="状态" width={120} />
          <ElTableColumn label="进度" width={200}>
            {{ default: (scope: { row: { progress: number } }) => <ElTag>{scope.row.progress}%</ElTag> }}
          </ElTableColumn>
          <ElTableColumn prop="message" label="消息" />
        </ElTable>
      </div>
    );
  },
});
```

- [ ] Step 5: `pnpm exec tsc --noEmit` 通过；`pnpm build` 通过。

---

## Task P1-11: 全量验证 + 提交打标签

- [ ] Step 1: `cd src-tauri && cargo test`（paths/settings/repo/download/elevation/service/mysql/redis 全过）。
- [ ] Step 2: `cd src-tauri && cargo build`（含 `ran-sidecar` 二进制，链接成功）。
- [ ] Step 3: `pnpm exec tsc --noEmit` + `pnpm build`。
- [ ] Step 4: 运行时冒烟：直接跑 `target/debug/ran-study.exe` 8s 无 panic。
- [ ] Step 5: 人工验收（`pnpm tauri dev`）：软件商店选 Redis 便携模式安装→已装列表出现→启动→状态运行（6379）→停止；MySQL 便携安装→初始化→启动（3306）。
- [ ] Step 6: `git add -A && git commit -m "feat(p1): mysql/redis providers with nssm service mode and elevation sidecar" && git tag p1-runtimes`。

---

## P1 验收标准

1. `list_catalog` 返回 mysql/redis 清单；`install_software` 创建任务并推送进度事件。
2. MySQL：下载→解压→`--initialize-insecure`→生成 my.ini；便携启动后 3306 端口可达，停止后不可达。
3. Redis：下载→解压→redis.conf；便携启动后 6379 可达；服务模式经 nssm（自动置备）。
4. 服务模式安装/卸载经 `ran-sidecar.exe`（UAC）执行 sc/nssm。
5. 已装列表持久化于 SQLite，重启后保留。
6. 单测覆盖：my.ini/redis.conf 渲染、sc 状态解析、nssm 路径、清单、install_from_zip 展平。

## 延后（P1.5）

数据库管理：建库/改 root 密码/CLI/备份与导入。
