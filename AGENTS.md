# 项目协作规则

## 项目目标

让 Codex 通过 DeepWorker（纯 Node.js MCP 服务器）在本地编排 DeepSeek Harness（DSH），包含 12 个 `dsh_*` 工具、生命周期管理、审批复核，并以 npm 包形式发布。

## 工作方式

- 修改前阅读相关代码和文档；参考实现位于 `/Users/zzzzzz/plugins/dsh-controller/`（只读，不得修改）。
- 优先复用现有组件；不修改与任务无关的内容。
- 未经许可不增加依赖：运行时仅允许 `ws`，HTTP 用内置 `fetch`，测试用 `node:test`。
- 不把密钥写入仓库；`.env.example` 只列变量名与安全占位值。
- 修改后运行与风险相称的测试或检查：`npm test`、`npm run lint`。
- 保留用户已有修改；遇到冲突先说明。

## 代码与界面约定

- 纯 Node ESM；模块按职责拆分（config / rpc / events / lifecycle / tools / server / doctor / validate）。
- `stdout` 只输出 MCP 协议响应；诊断一律写 `stderr`。
- 用户可见文本语言：以中文为主，命令可复制。
- 生命周期默认 `dsh web`（不硬编码 `--no-open`；仅在探测确认支持时才附加）。

## 验收与完成标准

- 行为符合 `SPEC.md` 的验收标准。
- `npm install` 后 `npm test`、`npm run lint`、`npm pack --dry-run` 均可通过。
- 相关测试通过，且文档与实现保持一致。

## 命令速查

```bash
npm test            # node:test，本地 mock server，不访问互联网
npm run lint        # node --check 全部 .js/.mjs
npm run pack:dry-run
node bin/deepworker.js --help
```

## 安全红线

- 未经用户确认，不得创建远端、推送（`git push`）或 `npm publish`。
- 不得修改工作区外的文件；不得触碰旧插件 `/Users/zzzzzz/plugins/dsh-controller/`。
- 审批只允许 `allowed-once` / `rejected`；`stop` 只停自有 PID。
