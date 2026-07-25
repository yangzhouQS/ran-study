# AGENTS.md

## 项目说明

ran-study：Windows 本地开发环境软件安装与管理工具（Tauri 2 桌面应用）。

- 设计文档：`docs/design/2026-07-26-ran-study-design.md`
- 实施计划：`docs/plans/2026-07-26-ran-study-p0-foundation.md`

## 校验命令

在仓库根目录执行：

- Rust 检查/测试：`cd src-tauri && cargo check && cargo test`
- Rust 完整二进制构建：`cd src-tauri && cargo build`
- 前端类型检查：`pnpm exec tsc --noEmit`
- 前端构建：`pnpm build`
- 桌面开发运行：`pnpm tauri dev`
- 桌面打包构建：`pnpm tauri build`

## 技术栈

- 桌面：Tauri 2（Rust 后端，`src-tauri/`，lib 名 `ran_study_lib`，`run()` 在 `lib.rs`）
- 前端：Vue 3 + TS + Rsbuild（Rspack）+ Element Plus + Pinia + Vue Router，TSX 组件
- 前端约定：TSX 中 Element Plus 组件采用「显式导入 + PascalCase」（如 `<ElButton>`）以保证 `tsc` 通过；路由用 `createWebHashHistory`
- IPC：Tauri commands（请求/响应）+ events（`task://progress` 等流式推送）；跨进程结构体加 `#[serde(rename_all = "camelCase")]`
