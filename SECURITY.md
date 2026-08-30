# 安全策略（Security Policy）

## 报告漏洞

请勿在公开 issue 里披露安全漏洞。请通过 GitHub 私有渠道（GitHub Security Advisories）或项目维护者邮箱报告。

## 已支持的版本

| 版本 | 支持状态 |
| --- | --- |
| 0.1.x | 受支持 |

## 安全设计

- 只连 `127.0.0.1:3080`，可显式覆盖，但默认不暴露到网络。
- `stop` 只停本控制器拥有的 PID；审批只允许 `allowed-once`/`rejected`。
- HTTP 请求核验 `rpcId` 与 `result.ok`；不在仓库写入密钥。
- 无 install/postinstall 脚本，不会自动修改用户全局配置。

## 报告内容建议

请附上：受影响的版本、复现步骤、预期与实际行为、以及你认为的影响范围。我们会尽快响应并修复。
