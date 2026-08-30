# 贡献指南（Contributing）

感谢关注！本项目是 DeepWorker（封装并发布 npm 版 DSH Controller）的一次性落地，欢迎以 issue 或 PR 形式反馈。

## 开发环境

- Node.js >= 20，npm 8+
- 依赖仅 `ws`（`npm ci` 安装）

## 启动与验证

```bash
npm ci
npm test            # node:test，本地 mock server，不访问互联网
npm run lint        # node --check 全部 .js
npm run pack:dry-run
```

## 提交前检查

1. 不新增运行时依赖（`ws` 除外）。
2. 不写入密钥、不添加 TODO 占位符。
3. 测试与文档同步更新。
4. 不触碰参考实现 `/Users/zzzzzz/plugins/dsh-controller/`。

## 发布注意

推 `v*` tag 会触发 `.github/workflows/release.yml`（只构建与上传 `.tgz`，不自动 `npm publish`）。仓库：`https://github.com/e2333-hsjdjh/DeepWorker`。
