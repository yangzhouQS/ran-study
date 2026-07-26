# ran-study

> Windows 本地开发环境软件安装与管理工具

参考小皮面板（phpstudy）的功能形态，面向 Windows 桌面端构建的开发环境一站式管理工具。支持 MySQL / Redis / PostgreSQL 的安装、接入、启停、数据库管理，Node.js 多版本切换，PM2 应用管理，以及进程/服务/监控/计划任务/终端等增强功能。

---

## 截图预览

| 首页 | 软件管理 |
|:---:|:---:|
| CPU/内存/磁盘环形图 + 统计卡片 | 商店安装 + 接入已安装 + 操作日志 |
| 监控页 | 终端 |
| 实时面积图 + 历史折线（Top5 进程） | 多标签 PowerShell |

---

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | **Tauri 2**（Rust 后端 + WebView 前端） |
| 前端 | **Vue 3 + TypeScript + TSX 组件** |
| 构建 | **Rsbuild**（Rspack 内核）+ Babel（`@vue/babel-plugin-jsx`） |
| UI 库 | **Element Plus** |
| 图表 | **G2Plot**（环形图 / 面积图 / 折线图） |
| 状态管理 | Pinia |
| 路由 | Vue Router（Hash 模式） |
| 终端 | xterm.js + portable-pty（ConPTY） |
| 持久化 | SQLite（rusqlite）+ JSON 配置 |

---

## 核心功能

### 软件管理

| 功能 | 说明 |
|---|---|
| **软件商店** | 在线下载安装 MySQL / Redis（官方绿色包，支持镜像源切换） |
| **接入已安装** | 登记系统已装的 MySQL / Redis / PostgreSQL（指定安装目录/可执行文件/配置/端口/服务名），无需重复安装 |
| **多模式运行** | 便携进程模式（后台无窗口）+ Windows 服务模式（sc / nssm） |
| **启停/重启** | 启动、停止、重启（优雅停止 + 端口 kill 兜底）、状态轮询（5s 自动刷新） |
| **配置编辑** | 在线编辑 `my.ini` / `redis.conf` / `postgresql.conf` |
| **操作日志** | 每次操作显示完整命令参数 + 执行结果（✓/✗） |

### 数据库管理

| 数据库 | 能力 |
|---|---|
| **MySQL** | 建库（含用户）/ 改 root 密码 / 执行 SQL / 备份(mysqldump) / 导入 / **多实例**（同版本多端口） |
| **Redis** | 列键 / 加键 / 取值 / 删键 / 命令行 / **改密码**（重写 conf + 重启）/ 远程连接 |
| **PostgreSQL** | 建库（含角色）/ 改 postgres 密码 / 执行 SQL(psql) / 备份(pg_dump) / 导入 |

### Node.js 生态

| 功能 | 说明 |
|---|---|
| **nvm-windows** | 绿色版置备（自动下载 nvm-noinstall + 配置 settings.txt + 环境变量），Node 版本安装 / 切换 / 卸载 |
| **PM2 应用** | 添加 node 应用（名称/脚本/工作目录/环境变量）→ 启动/停止/重启/删除/日志查看 |
| **开机自启** | 生成 `ran-pm2-resurrect.vbs`（用户 Startup 目录，隐藏窗口执行 `pm2 resurrect`） |

### 第三方应用

| 功能 | 说明 |
|---|---|
| **自定义应用** | 登记任意 Windows 可执行程序（名称/exe/参数/工作目录/服务模式 nssm），启停/重启/状态 |
| **OpenClaw** | 预填模板（Java -jar 方式），需自备 JDK |

### 系统增强

| 模块 | 说明 |
|---|---|
| **进程与服务** | 进程列表（按 CPU 排序）/ 服务列表 / **端口检测**（监听端口→进程→杀掉）/ 白名单保护（系统关键进程禁操作） |
| **系统监控** | 首页环形图（CPU/内存/磁盘）+ 监控页面积图/历史折线（10s 落库、Top5 进程悬停、保留 7 天） |
| **计划任务** | 基于 schtasks 创建/运行/启用禁用/删除，内置脚本库，`.ran` 任务包导入导出 |
| **内置终端** | 多标签 PowerShell（ConPTY），环境注入激活 Node |

### 设置与工具

| 功能 | 说明 |
|---|---|
| **根目录** | 可自定义（`D:\ran\` 默认），引导指针支持重启后恢复 |
| **镜像源** | 官方 / 清华 TUNA / 华为云（MySQL 下载源切换） |
| **HTTP 代理** | 支持配置代理（下载走 reqwest Proxy） |
| **日志页** | 集中查看 `<root>/logs` + PM2 日志文件，操作审计（install/start/stop/uninstall/link 自动记录） |
| **下载增强** | 断点续传（HTTP Range）+ 失败重试 3 次 + 代理 |

---

## 项目结构

```
ran-study/
├── src/                              # 前端
│   ├── api/                          # Tauri invoke 封装（按模块）
│   ├── components/app-layout/        # 应用外壳（渐变头部 + 图标菜单）
│   ├── composables/                  # use-task-stream / use-installed
│   ├── router/                       # 路由（Hash 模式）
│   ├── store/                        # Pinia
│   ├── types/                        # 共享类型定义
│   ├── views/                        # 页面视图（TSX）
│   │   ├── dashboard/                # 首页（G2Plot 环形图 + 统计卡片）
│   │   ├── software/                 # 软件管理（商店 + 接入 + 编辑 + 日志）
│   │   ├── database/                 # 数据库（MySQL/Redis/PG 管理）
│   │   ├── node-version/             # Node 版本（nvm）
│   │   ├── pm2-app/                  # PM2 应用
│   │   ├── process-service/          # 进程/服务/端口
│   │   ├── monitor/                  # 监控（G2Plot 面积/折线）
│   │   ├── schedule/                 # 计划任务
│   │   ├── terminal/                 # 终端（多标签）
│   │   ├── custom-apps/             # 第三方应用
│   │   ├── logs/                     # 日志查看
│   │   ├── task-queue/               # 任务队列
│   │   └── settings/                 # 设置
│   └── assets/styles/global.css      # 全局样式
├── src-tauri/                        # Rust 后端
│   ├── src/
│   │   ├── main.rs                   # 入口（UAC 自提权）
│   │   ├── lib.rs                    # Tauri Builder + 命令注册 + 监控采样
│   │   ├── provider/                 # Provider 引擎
│   │   │   ├── mod.rs                #   trait + SoftwareSpec + RunMode
│   │   │   ├── mysql.rs              #   MySQL provider
│   │   │   ├── redis.rs              #   Redis provider
│   │   │   ├── postgres.rs           #   PostgreSQL provider
│   │   │   ├── process.rs            #   便携进程管理 + kill_by_port
│   │   │   ├── service.rs            #   sc/nssm 服务封装
│   │   │   └── registry.rs           #   Provider 注册表
│   │   ├── commands/                 # Tauri 命令（按模块）
│   │   ├── dbadmin.rs                # MySQL 数据库管理
│   │   ├── pgadmin.rs                # PostgreSQL 数据库管理
│   │   ├── redis_admin.rs            # Redis 数据管理
│   │   ├── nvm.rs                    # nvm-windows 集成
│   │   ├── pm2.rs                    # PM2 封装
│   │   ├── boot.rs                   # 开机自启（resurrect.vbs）
│   │   ├── apps.rs                   # 自定义应用
│   │   ├── sysproc.rs                # 进程/服务/端口
│   │   ├── monitor.rs                # 系统快照
│   │   ├── schedule.rs               # 计划任务（schtasks）
│   │   ├── terminal.rs               # PTY 终端会话
│   │   ├── download.rs               # 下载/校验/解压（断点续传）
│   │   ├── elevation.rs              # 提权 sidecar（服务注册/卸载）
│   │   ├── logs.rs                   # 日志扫描/审计
│   │   ├── repo.rs                   # SQLite 持久化
│   │   ├── settings.rs               # settings.json + 根目录引导
│   │   └── paths.rs                  # 统一根目录解析
│   ├── src/bin/ran-sidecar.rs        # 提权辅助进程（服务 install/remove/start/stop）
│   └── Cargo.toml
├── rsbuild.config.ts                 # Rsbuild 配置
└── package.json
```

---

## 统一目录结构

```
<root>\                              默认 D:\ran\（可自定义）
├── env\                             各运行时（按 软件\版本 独立目录）
│   ├── mysql\mysql-8.0.36\
│   ├── redis\Redis-7.2.4\
│   ├── node\                        （nvm-windows 管理）
│   └── nvm\                         nvm-windows 绿色版
├── tools\nssm\nssm.exe             服务包装器
├── apps\                            PM2 托管的 node 应用
├── data\                            持久化数据（mysql/redis/pg/pm2）
├── logs\                            运行日志 + audit.log
├── cache\                           下载缓存（断点续传复用）
├── tasks\                           任务状态/脚本
├── autostart\                       开机自启脚本
└── config\
    ├── ran.db                       SQLite 数据库
    └── settings.json                用户设置
```

---

## 快速开始

### 环境要求

- **Node.js** ≥ 18
- **pnpm** ≥ 8
- **Rust**（stable）+ Cargo
- **Windows 10/11**（WebView2 运行时）

### 开发运行

```bash
pnpm install
pnpm tauri dev
```

> 应用启动时会自动检测管理员权限；非管理员则弹 UAC 重新以管理员启动。
> 服务管理操作（sc start/stop）需要管理员权限。

### 校验命令

```bash
# Rust
cd src-tauri && cargo check && cargo test

# 前端
pnpm exec tsc --noEmit    # 类型检查
pnpm build                # 生产构建

# 完整桌面打包
pnpm tauri build
```

---

## 架构设计

### IPC 通信

- **Commands**（请求/响应）：前端 `invoke('cmd', payload)` → Rust 处理 → 返回结果
- **Events**（后端推送）：`task://progress`（任务进度）、`terminal://output`（终端输出）、`software://changed`（列表刷新）、`apps://changed`
- **跨进程序列化**：结构体加 `#[serde(rename_all = "camelCase")]`，枚举变体保持 PascalCase

### Provider 抽象

每种软件实现 `SoftwareProvider` trait：

```rust
#[async_trait]
pub trait SoftwareProvider: Send + Sync {
    fn id(&self) -> &str;
    fn manifest(&self) -> Manifest;
    async fn install(&self, root, version, run_mode, progress) -> Result<SoftwareSpec>;
    async fn uninstall(&self, spec) -> Result<()>;
    async fn start(&self, spec) -> Result<()>;
    async fn stop(&self, spec) -> Result<()>;
    async fn status(&self, spec) -> Result<RunStatus>;
}
```

新增软件 = 新增 provider 实现 + 注册到 `ProviderRegistry`。

### 提权机制

- **运行时自提权**：`main.rs` 检测 `is_admin()`（`reg query HKU\S-1-5-19`），非管理员则 `runas` 重启自身（UAC 弹窗）
- **服务注册/卸载**：经 `ran-sidecar.exe`（独立二进制，`runas` 提权执行 sc/nssm）
- `--ran-elevated` 命令行标记防止无限提权循环

### 任务队列

后台异步任务（下载/安装/卸载）经 `TaskQueue` 管理，进度通过 `task://progress` 事件实时推前端。

---

## 开发阶段

| 阶段 | 标签 | 内容 |
|---|---|---|
| P0 | `p0-foundation` | Tauri 骨架 + Rsbuild + 统一目录 + SQLite + Provider trait + 任务队列 + 下载/解压 |
| P1 | `p1-runtimes` | MySQL / Redis provider（便携 + 服务 nssm + sidecar 提权） |
| P1.5 | `p1.5-dbadmin` | MySQL 数据库管理（建库/改密/SQL/备份导入） |
| P2 | `p2-node-ecosystem` | nvm-windows + PM2 应用 + 开机自启 |
| P3 | `p3-enhancements` | 进程/服务/端口 + 监控仪表盘 + 计划任务 + 内置终端 |
| P4 | `p4-custom-apps` | 自定义应用 provider（OpenClaw） |
| P5 | `p5-completeness` | 监控历史 + 白名单 + PM2 日志 + MySQL 多实例 + Redis 管理 + 计划脚本库 + 终端多标签 |
| P6 | `p6-completeness` | 设置页 + 下载断点续传/镜像 + 首页卡片 + 配置编辑 + 日志页 |
| P7 | `p7-link-existing` | 接入已安装 MySQL/Redis + 编辑 + PostgreSQL provider + PG 数据库管理 |

---

## License

MIT
