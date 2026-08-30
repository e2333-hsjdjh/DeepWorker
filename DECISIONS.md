# 技术与产品决策

## 2026-08-30：纯 Node ESM 架构，运行时仅依赖 ws

### 状态
已采纳

### 决定
用纯 Node.js ESM 重写参考实现；HTTP 用内置 `fetch`，进程用 `child_process`/`net`，测试用 `node:test`；运行时唯一依赖 `ws`。

### 原因
满足「不依赖 Python、仅允许 ws 依赖」的硬约束，同时保持 12 工具与参考实现语义等价。

## 2026-08-30：生命周期默认 `dsh web`，不硬编码 `--no-open`

### 状态
已采纳

### 决定
`start` 默认以 `dsh web` 启动；仅在 `dsh web --help` 探测确认支持 `--no-open` 时附加该 flag。

### 原因
实际本机 `dsh web --no-open` 返回 unknown option（DSH 源码未见该 flag 定义）。不能因启动失败或误开浏览器，控制器自身绝不打开/操控浏览器。

## 2026-08-30：stop 只停自有 PID

### 状态
已采纳

### 决定
`stop` 只终止 PID 记录在 `DEEPWORKER_STATE_DIR/web.pid` 且仍存活的进程；无记录一律返回「拒绝停止外部进程」。

### 原因
安全边界：控制器不得杀死非其拥有的外部进程。

## 2026-08-30：审批仅 allowed-once / rejected

### 状态
已采纳

### 决定
`dsh_decide_approval` 的 `outcome` 枚举仅 `allowed-once` 与 `rejected`，不提供持久/全局授权。

### 原因
符合参考实现与最小权限原则：一次性授权即可满足的场景绝不接受持久授权。

## 2026-08-30：CLI 帮助/版本不加载 ws

### 状态
已采纳

### 决定
版本号抽到 `src/version.js`；`bin` 入口对 `serve`/`doctor` 做懒加载，`--help`/`--version`/未知命令保持零依赖加载。

### 原因
`--help`/`--version` 不应因 `ws` 未安装而崩溃；只有真正启动 MCP 服务才需要运行时依赖。

## 2026-08-30：GitHub Releases 作为 npm 之外的第二个分发路径

### 状态
已采纳

### 决定
`.github/workflows/release.yml` 仅在 `v*` tag 触发，Node 20，执行 `npm ci`/`npm test`/`npm run lint`/`npm pack`，并用 GitHub CLI 创建/更新 Release、上传 `.tgz`；权限最小化为 `contents: write`，不自动 `npm publish`。

## 2026-08-30：品牌统一为 DeepWorker，仓库 e2333-hsjdjh/DeepWorker

### 状态
已采纳

### 决定
产品/README/npm 包/CLI/插件统一命名为 DeepWorker（npm 包 `deepworker`、CLI `deepworker`、env `DEEPWORKER_*`、默认状态目录 `~/.dsh/deepworker`）；真实仓库 `https://github.com/e2333-hsjdjh/DeepWorker.git`，作者 `e2333-hsjdjh`。底层 DSH 与 `dsh_*` 工具名保持不变。

### 原因
用户要求品牌统一为 DeepWorker，并提供了真实仓库；首版尚未发布，因此无需保留旧 `DSH_CONTROLLER_*` 别名。

### 待确认假设
- 远端 `e2333-hsjdjh/DeepWorker` 由 Codex 只读检查确认后处理（不自行创建远端/推送）。
- release 文件名由 `npm pack` 自动变为 `deepworker-<version>.tgz`。
