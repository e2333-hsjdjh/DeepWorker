# 产品规格

## 用户与问题

- 目标用户：使用 Codex 编排本地 DSH 实现任务的工程师。
- 核心问题：现有参考实现依赖 Python 与 `websocket-client`；需要一个纯 Node.js（ESM）、可通过 npm/npx 发布的等价实现。

## MVP 范围

- npm 包 `deepworker`，版本 `0.1.0`，MIT，Node.js >= 20，纯 ESM。
- `npx -y deepworker serve` 与全局安装后的 `deepworker serve` 均可启动 MCP stdio 服务。
- 12 个 MCP 工具：`dsh_status`/`dsh_start`/`dsh_stop`/`dsh_create_project`/`dsh_create_session`/`dsh_list_sessions`/`dsh_send`/`dsh_wait`/`dsh_history`/`dsh_pending_approvals`/`dsh_decide_approval`/`dsh_cancel`。
- CLI：`serve`、`doctor [--json]`、`--help`、`--version`；未知命令非零退出。
- 生命周期：默认 `dsh web` 启动；`stop` 只停自带 PID；审批只允许 `allowed-once`/`rejected`。
- WebSocket 事件流：重连、最近事件缓存、pending approvals。
- 插件模板 `plugin/deepworker/`（manifest + `.mcp.json` + 技能）。
- Vibe 文档基线 + CI/Release workflow。

## 暂不实现

- `npm publish`、创建 GitHub 远端、写用户全局配置（发布由用户/Codex 决定）。
- Homebrew Tap Formula（含 SHA256 的公式）——首版不做，属下一阶段。
- `curl | sh` 或 Docker 分发。
- Python 运行时、额外 npm 依赖（`ws` 除外）。
- 持久/全局审批授权。

## 用户流程

1. 用户 `npx -y deepworker serve`，或安装后再 `deepworker serve`。
2. 用户在 Codex 的 `.mcp.json` 里配置 npx 调用本包。
3. Codex 通过 12 个工具创建项目/会话、委派、等待、复核审批、验证。
4. `doctor --json` 诊断本地 DSH 连通性。
5. 推 `v*` tag 触发 Release，下载 `.tgz` 安装。

## 验收标准

- [x] 项目结构完整（代码、插件模板、文档、CI/Release）。
- [x] `npm install` 后 `npm test`、`npm run lint`、`npm pack --dry-run` 通过。
- [x] 包 tarball 只包含必要发布文件（`bin`、`src`、`plugin`、`README.md`、`LICENSE`、`CHANGELOG.md`）。
- [x] 无密钥、无 TODO 占位符。
- [x] 不触碰旧插件 `/Users/zzzzzz/plugins/dsh-controller/`。

## 非功能要求

- 性能：stdio MCP 首包响应 < 1s；HTTP 超时 35s；WebSocket 重连退避 0.25s→5s。
- 隐私与安全：只连 127.0.0.1；不提交密钥；审批最小权限。
- 可维护性：模块化、`node:test`、零额外 lint 依赖。
