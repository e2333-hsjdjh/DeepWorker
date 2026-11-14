# DeepSeek Harness 本地任务队列

在 DeepSeek Harness 里创建和查阅待办任务，记录任务说明、验收条件和执行状态。任务存到本地 SQLite，可以跨会话查回。需要执行时，在 Harness 会话里指定任务 ID 并下达指令。

## GitHub 调研

| 方案 | 用途 |
| --- | --- |
| [AgentRQ](https://github.com/agentrq/agentrq/tree/main/plugins/deepseek-harness) | 接入已有的 AgentRQ 工作区，跨工具分派和自动接收任务 |
| [Scheduled Tasks](https://github.com/qihongmu/dsh-plugins) | 按时间自动启动任务。仓库列出了不同插件版本对应的 Harness 版本 |
| [Harness 官方工具](https://github.com/deepseek-ai/deepseek-harness/tree/master/docs/user/develop/basic) | 提供工具注册和 bundle 安装方式。内置 todo 用于会话中的步骤跟踪 |

本插件用官方工具 API 实现本地、跨会话的任务交接。插件本身没有付费服务依赖。

## 开发与测试

要求 Node.js 24.9 或更新的 24.x。项目锁定 Harness 0.2.2-rc.3，开发安装不需要全局 dsh。

    npm ci
    npm test
    npm run dev

- 开发环境启动 Harness Web，直接加载插件源码，会话和任务库在 `.local/development/`。通过 Harness 配置开发环境的模型凭证后可开展真实任务，会按模型用量计费。源码修改后可重启开发命令。
- 测试环境在 `.local/test/run-*/` 下创建独立工作目录和 Harness home。测试打包并安装实际 npm bundle，再用本地模拟模型驱动真实 Harness 工具调用。DeepSeek 模型适配器和遥测在测试中关闭，无模型 API 费用。通过的运行会清理临时目录，失败的运行会保留现场。
- 可运行 `node --test test/queue.test.js` 单独验证 SQLite。

## 在 Harness 中使用

先在对话中输入：

> 用 local_task_create 创建一个任务。标题为「验证安装说明」，任务说明为「检查 README 的安装命令并运行测试」，验收条件为「npm test 退出码为 0，报告中写明通过的测试数」。返回任务 ID。

稍后在同一开发环境的新会话输入：

> 用 local_task_get 读取指定 ID 的任务。先标记为 in_progress，再按任务说明执行。通过验收时标记 completed 并写入验证结果，遇到障碍时标记 blocked 并说明原因。

| 工具 | 用途 |
| --- | --- |
| `local_task_create` | 保存标题、任务说明和验收条件，返回 ID |
| `local_task_list` | 按状态筛选，可以用 limit 和 offset 分页 |
| `local_task_get` | 读取任务完整内容 |
| `local_task_update` | 更新为 pending、in_progress、blocked 或 completed。后两种状态需要备注 |

开发环境的任务库路径为 `.local/development/local-task-queue/tasks.sqlite`。安装到其他 Harness 环境时，默认路径为 `$DSH_HOME/local-task-queue/tasks.sqlite`。未设置 `DSH_HOME` 时用 `~/.dsh`。同一 Harness home 下的多个 profile 共用任务库。

## GitHub 和 npm

GitHub Actions 配置已随项目提供。创建 GitHub 仓库后，可以添加 remote 并推送项目。为了让用户发现插件，可添加 `dsh-plugin` 仓库主题。

发布前选定 npm 包名和许可证，填写 `package.json` 的仓库地址，并运行：

    npm ci
    npm test
    npm pack --dry-run
    npm pack

可在匹配版本的 Harness 中安装打包文件。将路径替换成实际 tarball 的绝对路径：

    dsh plugin --profile web add /absolute/path/dsh-local-task-queue-0.2.0.tgz
    dsh web

首次正式发布可用 `npm publish --access public`。以后更新版本再发布，已安装用户可在 Harness 插件管理中更新。

## 与 DeepWorker 联调

从本目录运行 `DEEPWORKER_CHECKOUT=../.. npm run test:deepworker`。先在仓库根目录和本目录各执行一次 `npm ci`。联调通过 MCP stdio 启动独立 Harness，并验证派活、审批、取消和重启后读取历史。
