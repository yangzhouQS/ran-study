# ran-study P5 延后功能补全 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐各模块「延后」子功能：①监控历史(落库/保留/清空/Top N 悬停)；②计划任务脚本库 + .ran 导入导出；③终端多标签；④PM2 日志查看器；⑤进程/服务白名单；⑥MySQL 多实例；⑦Redis 数据管理。

**Architecture:** 多为对既有模块的扩展 + 新增命令/视图。监控新增 `monitor_samples` 表与后台采样任务；白名单在 sysproc 加保护判定；PM2 日志读 `<PM2_HOME>/logs`；MySQL 多实例复用 `instances` 表 + provider 的 init/start 逻辑；Redis 用 `redis-cli` 封装；计划任务脚本库为前端内置数据、.ran 为 JSON 文件导入导出。

**Tech Stack:** Rust（tokio interval / std::process / serde_json）+ TS（Vue3/TSX/Element Plus / ECharts）

**验证策略：** 纯逻辑（白名单判定、redis 命令拼装、.ran 序列化、监控采样结构）走单测；交互为 `pnpm tauri dev` 人工验收。

---

## Task P5-1: 监控历史（落库 + 保留 + 清空 + Top N）

**Files:** `repo.rs`（monitor_samples 表 + CRUD）；`monitor.rs`（sample_with_procs）；`lib.rs`（后台采样任务）；`commands/monitor.rs`（history/clear/retain/top）

- [ ] repo: `monitor_samples(ts INTEGER PRIMARY KEY, cpu REAL, mem_used INTEGER, mem_total INTEGER, procs TEXT)` + insert/list_since/clear/delete_before。
- [ ] monitor.rs: `sample_with_procs() -> (SystemStats, Vec<ProcInfo top5>)`（一次 System 采样 + top5 cpu）。
- [ ] lib.rs run(): setup 中 `tauri::async_runtime::spawn` 每 10s 采样落库 + 删超 retain 天的旧数据（retain 存 settings 或固定 7 天）。
- [ ] commands/monitor.rs: `list_monitor_history(hours)`、`clear_monitor_history()`、`top_processes(n)`。
- [ ] 前端 monitor.tsx：加时间范围切换(1h/24h/7d) → 拉历史画第二条折线；tooltip 悬停显示该样本 procs(JSON)。

---

## Task P5-2: 进程/服务白名单

**Files:** `sysproc.rs`；`commands/sysproc.rs`

- [ ] sysproc.rs: `PROTECTED_PROCESS`（ran-study、csrss、lsass、smss、wininit、winlogon、services、System 等）+ `PROTECTED_SERVICE`（上述 + Windows 关键服务名）；`is_protected_process(name)`、`is_protected_service(name)`。
- [ ] kill_process / control_service：命中保护 → `Err("受保护，禁止操作")`。
- [ ] 前端 process-service.tsx：受保护行禁用「结束/停止」并加 tag。

---

## Task P5-3: PM2 日志查看器

**Files:** `pm2.rs`；`commands/pm2.rs`

- [ ] pm2.rs: `read_logs(root, name, kind: "out"|"error", lines)` → 读 `<PM2_HOME>/logs/<name>-<kind>.log` 尾 N 行。
- [ ] commands/pm2.rs: `pm2_logs(name, kind, lines)`。
- [ ] 前端 pm2-app.tsx：每个进程「日志」按钮 → 弹窗显示 out/error 切换 + 刷新。

---

## Task P5-4: MySQL 多实例

**Files:** `dbadmin.rs`（加实例生命周期）；`repo.rs`（instances CRUD）；`commands/dbadmin.rs`

- [ ] dbadmin.rs: 复用 mysql bin；`create_instance(spec, name, port, run_mode)` → 建独立 data 目录 + my.ini(port) + `mysqld --initialize-insecure` + (服务模式 sidecar 注册)；`start_instance/stop_instance/status_instance/delete_instance`。
- [ ] repo: `instances` 表 CRUD（已存在表结构：id, software_id, name, port, config_path, pid, status）+ InstanceRow。
- [ ] commands/dbadmin.rs: `list_mysql_instances/create/start/stop/status/delete`。
- [ ] 前端 database.tsx：实例下展示「子实例」列表 + 新建(端口)/启停/删除。

---

## Task P5-5: Redis 数据管理

**Files:** `redis_admin.rs`（新）；`commands/redis_admin.rs`（新）

- [ ] redis_admin.rs: `redis_cli(spec)` 路径；`run(spec, pw, args)`（`-p port -a pw` 或无密码）；`list_keys/add_key/get_key/del_key`；`change_password(spec, new_pw)`（改 redis.conf requirepass + 重启）；`run_remote(host,port,pw,args)`。
- [ ] commands/redis_admin.rs: 上述命令（按 redis 软件 id）。
- [ ] 前端 database.tsx：Redis 实例下「键浏览 + CLI + 改密码 + 远程连接」面板。

---

## Task P5-6: 计划任务脚本库 + .ran 导入导出

**Files:** `commands/schedule.rs`；前端 schedule.tsx

- [ ] commands/schedule.rs: `export_scheduled(path, ids)` → 写 JSON(.ran)；`import_scheduled(path)` → 读 JSON 批量创建（schtasks + 落表）。
- [ ] 前端：内置脚本库常量（如「清理临时文件」「每日备份 MySQL」等几条）一键带入表单；导出勾选任务到 .ran、从 .ran 导入。

---

## Task P5-7: 终端多标签

**Files:** 前端 terminal.tsx

- [ ] terminal.tsx：ElTabs 动态标签；每标签独立 xterm Terminal + sessionId + listener；新建/关闭标签调 open_terminal/close_terminal。后端已支持多 session，无需改。

---

## Task P5-8: 注册命令 + 全量验证 + 打标签

- [ ] lib.rs 注册全部新命令。
- [ ] `cargo test` + `cargo build` + `tsc --noEmit` + `pnpm build` + 运行时冒烟。
- [ ] `git commit -m "feat(p5): monitor history, whitelist, pm2 logs, mysql instances, redis admin, schedule presets, terminal tabs" && git tag p5-completeness`。

---

## P5 验收标准

1. 监控：每 10s 落库；历史折线可选 1h/24h/7d；悬停显示当时 Top5 进程；可清空。
2. 进程/服务：受保护项禁止结束/停止并标识。
3. PM2：查看某应用 out/error 日志尾 N 行。
4. MySQL：同版本建多个实例（不同端口/data）；独立启停/状态/删除。
5. Redis：列键/加键/取值/删键/改密码/远程 CLI。
6. 计划任务：脚本库一键带入；.ran 导出/导入。
7. 终端：多标签独立会话。
