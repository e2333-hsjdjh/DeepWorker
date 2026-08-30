# 更新记录

## Unreleased

### Changed
- 品牌统一重命名为 DeepWorker：npm 包 `deepworker`、CLI `deepworker`、env `DEEPWORKER_*`、插件 `deepworker`。
- 仓库/作者更新为 `e2333-hsjdjh/DeepWorker`，移除早前发布占位。

### Added
- 初始化项目结构与协作文档（Vibe 基线）。
- 纯 Node ESM 实现：config / rpc / events / lifecycle / tools / server / doctor / validate / version。
- 12 个 `dsh_*` MCP 工具与逐行 JSON-RPC 2.0 stdio 服务。
- CLI：`serve`、`doctor [--json]`、`--help`、`--version`，未知命令非零退出。
- 插件模板 `plugin/deepworker/`（manifest + `.mcp.json` + 技能）。
- `node:test` 测试套件（本地 mock server）。
- CI 与 GitHub Release workflow（`.tgz` 资产，不自动 npm publish）。

## 0.1.0

- 首个发布版本。
