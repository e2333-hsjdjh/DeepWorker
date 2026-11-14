# DeepWorker

把 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai) 当成 Codex 在本地养的电子黑奴：Codex 负责动脑、开工单、拉群、派活、验收、挑刺，DSH 负责在 HTTP/WebSocket 管道里疯狂打工，最后再由 Codex 写一份“本次事故基本可控”的复盘。

DeepWorker 则是那个把俩人关进同一间机房的纯 Node.js（ESM）包工头：一个 MCP Server + CLI，塞给 Codex 12 把 `dsh_*` 电动扳手，让它直接调度本地 DSH 干活，不点网页、不演赛博木偶戏，主打一个 API 里开会、终端里坐牢。


## 核心功能

- 12 个 MCP 工具：`dsh_status` / `dsh_start` / `dsh_stop` / `dsh_create_project` / `dsh_create_session` / `dsh_list_sessions` / `dsh_send` / `dsh_wait` / `dsh_history` / `dsh_pending_approvals` / `dsh_decide_approval` / `dsh_cancel`
- 逐行 JSON-RPC 2.0 stdio 协议，`stdout` 只输出协议响应，诊断一律写 `stderr`
- 生命周期管理：`start` 运行 `dsh web`（不打开、不操控浏览器），`stop` 只停止本控制器记录并拥有的 PID，拒绝停止外部进程
- WebSocket 事件流：自动重连（指数退避）、最近事件缓存、pending approvals 跟踪
- `doctor --json`：只读地检查本地 DSH Web / API / WebSocket

## 技术栈

- 纯 Node.js ESM，运行时仅依赖 [`ws`](https://www.npmjs.com/package/ws)
- 不依赖 Python；HTTP 用内置 `fetch`，进程用 `child_process`/`net`，测试用 `node:test`

## 三种安装方式

### 方式一：npm / npx

```bash
# 直接跑（不落地安装）
npx -y deepworker serve

# 或全局安装后用命令名调用
npm install -g deepworker
deepworker serve
deepworker doctor --json
```

### 方式二：从 GitHub 仓库安装

```bash
git clone https://github.com/e2333-hsjdjh/DeepWorker.git
cd DeepWorker
npm ci
npm link   # 或 npm install -g .
deepworker serve
```

### 方式三：下载 GitHub Release 的 `.tgz` 安装

在仓库的 Releases 页面下载 `deepworker-<version>.tgz`，然后：

```bash
npm install -g ./deepworker-0.1.0.tgz
deepworker serve
deepworker doctor
```

> 发布流程见下方「发布步骤」——推一个 `v*` tag 会触发 `.github/workflows/release.yml` 生成 Release 并上传 `.tgz`。

### 关于 Homebrew Tap（下一阶段，首版不做）

首版不提供包含假 SHA256 的 Formula。稳定仓库 URL 和首个 Release 就绪后，再单独建 tap 仓库（如 `homebrew-deepworker`）提交真实公式；这不属于 0.1.0 的交付范围。首版也不提供 `curl | sh` 或 Docker 分发。

## 本地开发

```bash
git clone https://github.com/e2333-hsjdjh/DeepWorker.git
cd DeepWorker
npm ci          # 安装依赖（仅 ws）
npm test        # node:test 全部用例（本地 mock 服务器，不访问互联网）
npm run lint    # node --check 语法检查
npm run pack:dry-run   # 预检 npm 打包内容
```

## 接入 Codex

包内附带插件模板 `plugin/deepworker/`，其 `.mcp.json` 通过 `npx -y deepworker serve` 调用本包：

```json
{
  "mcpServers": {
    "deepworker": {
      "command": "npx",
      "args": ["-y", "deepworker", "serve"],
      "startup_timeout_sec": 10,
      "tool_timeout_sec": 3600
    }
  }
}
```

插件 manifest（`plugin/deepworker/.codex-plugin/plugin.json`）与技能文档（`plugin/deepworker/skills/orchestrate-dsh/SKILL.md`）也一并打包。

## 接入 DSH 0.2.2

启动 `dsh web --no-open`，将启动链接中的 `token` 通过环境变量
`DEEPWORKER_DSH_TOKEN` 传给 DeepWorker。若 DSH 使用其他端口，同时设置
`DEEPWORKER_PORT`。DeepWorker 通过本地接口交换 API Cookie，并在单独的连接上接收审批。
旧版 DSH 继续使用原来的接入方式。

## 12 工具一览

| 工具 | 作用 | 副作用 |
| --- | --- | --- |
| `dsh_status` | 读取 DSH 进程 / API / 事件流状态 | 只读 |
| `dsh_start` | 启动 DSH Web（无浏览器） | 启动 |
| `dsh_stop` | 停止本控制器拥有的 DSH 进程 | 停止 |
| `dsh_create_project` | 新建目录 + 注册 workspace + 建会话 | 变更 |
| `dsh_create_session` | 为已有路径注册 workspace + 建会话 | 变更 |
| `dsh_list_sessions` | 列出 workspaces 与 durable sessions | 只读 |
| `dsh_send` | 发送 brief / 追问到会话 | 变更 |
| `dsh_wait` | 等待完成或审批（≤60s） | 只读 |
| `dsh_history` | 读取有界会话历史 | 只读 |
| `dsh_pending_approvals` | 列出未答复的审批请求 | 只读 |
| `dsh_decide_approval` | 允许一次 / 拒绝某个审批 | 变更 |
| `dsh_cancel` | 取消某个会话的进行中工作 | 变更 |

## 安全模型

- 默认只连接 `127.0.0.1:3080`，可显式用 `DEEPWORKER_HOST` / `DEEPWORKER_PORT` 覆盖（一般不需要）
- `stop` 只停止由本控制器启动、且 PID 记录在 `DEEPWORKER_STATE_DIR` 下的进程；无记录一律拒绝，绝不杀外部进程
- 审批只允许 `allowed-once`（允许一次）与 `rejected`（拒绝）两种结果；不允许 persistent/global 授权
- HTTP 请求核验 `rpcId` 与 `result.ok`，任何不匹配都报错；路径解析、项目名校验、超时与错误都显式处理
- 不在仓库写入任何密钥或凭据（参照 `.env.example` 仅列变量名）

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `DEEPWORKER_HOST` | `127.0.0.1` | DSH 主机 |
| `DEEPWORKER_PORT` | `3080` | DSH 端口 |
| `DEEPWORKER_STATE_DIR` | `~/.dsh/deepworker` | 进程簿记目录（`web.pid`/`web.log`） |

## 故障排查

- `doctor` 显示端口未监听：先确认 `deepworker serve` 所在的机器上有 DSH Web 在 3080 端口运行，或手动 `dsh web`
- `doctor` API 返回 `mismatched rpcId`：DSH 协议实现不兼容，检查 DSH 版本
- `stop` 提示 `refusing to stop an external process`：该 DSH 不是本控制器启动的，属预期行为
- `web --no-open` 报 unknown option：本机 DSH 版本不支持该 flag，本控制器已改为默认 `dsh web` 启动，仅在探测确认支持时才附加 `--no-open`
- WebSocket 持续重连：确认 DSH Web 事件流 `/api/events.mux` 可达

## 发布步骤

1. 更新 `CHANGELOG.md` 与版本号
2. 打 tag 并推送，触发 Release 构建：

```bash
git tag v0.1.0
git push origin v0.1.0
```

`.github/workflows/release.yml` 会执行 `npm ci`、`npm test`、`npm run lint`、`npm pack`，并用 GitHub CLI 创建/更新 Release、上传生成的 `.tgz`。**此流程不会 `npm publish`。** 如需发布到 npm 需另行手动执行（本项目当前不自动发布 npm）。

> ⚠️ 本项目的 CI/Release 流程只做构建与校验，不会自动改任何用户全局配置、不会安装 postinstall 脚本。

## 验证

- `npm install` 后 `npm test` 全部通过（本地 mock server，不访问互联网）
- `npm run lint` 零错误
- `npm pack --dry-run` 只包含 `bin`、`src`、`plugin`、`README.md`、`LICENSE`、`CHANGELOG.md`
- 无密钥、无 TODO 占位符

## 当前状态

0.1.0 实现完成，测试/lint/打包均已验证通过，待发布。
