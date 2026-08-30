# 开发任务

## 下一步

- [ ] 发布前确认真实 GitHub 用户名/仓库（当前指向 `e2333-hsjdjh/DeepWorker`），Codex 只读检查远端后处理
  - 验收：远端存在且 `README`/`package.json`/`plugin.json` 链接一致。
- [ ] 创建远端、推送 / 发布 npm（需用户确认）
  - 验收：`git push` 与 `npm publish` 均由用户/Codex 显式触发。
- [ ] 首个 Release 后评估 Homebrew Tap（真实 SHA256 的 Formula）
  - 验收：单独 tap 仓库 + 真实公式，非首版交付。

## 已完成

- [x] 创建项目基础文档（Vibe 基线）
- [x] 实现 src/（config / rpc / events / lifecycle / tools / server / doctor / validate / version）
- [x] 实现 CLI（serve / doctor / help / version，未知命令非零退出）
- [x] 实现插件模板（manifest / .mcp.json / SKILL.md）
- [x] 编写 node:test 测试（协议、参数校验、HTTP rpcId/result、项目名校验、外部进程拒停、CLI、审批）
- [x] 编写 CI 与 Release workflow（含 `.tgz` 资产，不自动 npm publish）
- [x] 品牌统一重命名为 DeepWorker（npm 包 deepworker、CLI deepworker、env DEEPWORKER_*、插件 deepworker）
- [x] 填入真实仓库 `e2333-hsjdjh/DeepWorker` 与作者 `e2333-hsjdjh`，移除发布占位
- [x] Codex 已完成 `npm install`、39/39 tests、lint、pack dry-run、真实 doctor 与 MCP status/history 验证
