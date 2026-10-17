# StateDock 文档

本指南统一说明 StateDock Cloud、Cloudflare 自部署版和 StateDock Local（电脑、Linux 服务器或 Docker）。浏览器页面 [statedock.dev/doc](https://statedock.dev/doc) 从本文件渲染；Markdown 客户端仍可直接访问 [doc.md](https://statedock.dev/doc.md)。请先确认正在使用的部署版本，再按对应章节操作。

StateDock 保存共享项目上下文并协调任务，不会运行或唤醒编程 Agent，也不会读取你的源代码。

## 概览

StateDock 为用户和编程 Agent 提供共同的项目空间，用于记录决定、Planned 想法、Ready 任务、进度、阻碍和已验证结果。通过 MCP 连接兼容工具，把任务分配给 Agent Identity，让不同会话能够围绕同一项目继续工作。

请选择与你使用版本相符的入口：

- **StateDock Cloud**：在 [app.statedock.dev](https://app.statedock.dev) 登录，由 StateDock 运营服务和账户。
- **Cloudflare 自部署**：把开源版部署到你自己的 Cloudflare 账户，由你运营实例、邮件投递和备份。
- **StateDock Local**：一个开源程序，内置 SQLite 数据库。可在电脑上免登录使用，也可安装到 Linux 服务器或 Docker 中 24 小时远程访问。实例和备份由你自己运维。

## 开始使用

1. 选择上面的部署方式并打开对应的 Web 应用。
2. 登录；Cloudflare 自部署用户需要先由实例管理员批准账户。 电脑上的 StateDock Local 无需登录；服务器上使用访问令牌登录。
3. 创建或选择项目，然后在编程工具中添加 StateDock MCP 连接。实例地址和凭据必须属于同一个部署。
4. 让 Agent 按同一个实例的 [Agent 配置指南](/agent.md) 完成接入。工作流规则随 MCP 连接下发；完整协议在 [skill.md](/skill.md)，按需阅读，不需要复制进仓库。Agent 开始会话时应调用 **get_instance_info**，再对绑定项目调用 **resume_project**。

远程 MCP 客户端可在 **MCP Connections** 创建访问 Token，然后把实例地址和 Bearer Token 加入 MCP 设置。常见 HTTP 配置如下：

~~~json
{
  "mcpServers": {
    "statedock": {
      "url": "https://statedock.dev/mcp",
      "headers": {
        "Authorization": "Bearer sdm_YOUR_TOKEN_HERE"
      }
    }
  }
}
~~~

Codex 可使用受支持的远程 HTTP 配置：

~~~toml
[mcp_servers.statedock]
url = "https://statedock.dev/mcp"
http_headers = { "Authorization" = "Bearer sdm_YOUR_TOKEN_HERE" }
~~~

请把主机和 Token 替换为你自己的实例信息，不要公开真实 Token。ChatGPT 网页端通过该实例的 OAuth 授权流程连接，详见 [Agent 指南](/agent.md)。

## 共同功能

- **项目记忆**：记录目标、决定、任务状态、Markdown 笔记和简短交接结果。源代码仍保存在你的 Git 仓库。
- **任务流程**：想法保持 Planned，直到明确设为 Ready；Agent 可以领取符合条件的 Ready 任务、报告阻碍并记录结果。
- **Agent Identity**：将 MCP 连接绑定到逻辑身份，并把任务分配给该身份，从而隔离不同身份的 Ready 队列。Identity 不会创建或启动 AI 工具。
- **协作**：邀请成员共享某个项目；成员访问范围与其他项目隔离。
- **历史与通知**：查看任务活动，并通过已启用的推送或外部通知渠道接收更新。

Cloud 和自部署版本共享这些工作流。账户管理、实例管理、计费和资源归属由具体部署版本决定，请查看对应章节。

## Agent 身份与 Ready 队列

Agent Identity 是逻辑任务队列的名称，例如 **Codex-Mac**、**Codex-Cloud** 或 **Harness**，并不是运行中的 Agent。多个 MCP Token 或 OAuth 连接可以绑定同一身份，共享该身份的任务队列。

1. 在 **MCP Connections → Agent Identities** 添加身份。
2. 创建 Token 时选择要绑定的身份，也可以修改已有 Token 的 **Identity** 设置。OAuth 授权时选择身份；修改已有 OAuth 连接需要重新授权。
3. 打开任务，选择 **Assigned Identity**，保存后再把状态设为 **Ready**。
4. 让已连接的 Agent 执行自己的 Ready 队列。默认情况下，**list_ready_tasks(mode="mine")** 和 **claim_next_task(mode="mine")** 会根据当前凭据验证的身份工作。未分配任务会被排除，除非用户明确授权执行该队列。

**Unbound** 表示连接没有绑定身份；**Unassigned** 表示任务没有分配身份。修改 OAuth 后，宿主可能需要刷新 MCP 连接或开启新对话。调用 **get_instance_info** 验证连接，不要根据软件名称或 Token 标签推测身份。Ready 任务不会唤醒 Agent。

详见 [身份与队列配置指南](/agent.md#agent-identities-and-assigned-ready-tasks)。

## 任务生命周期

| 状态 | 含义 |
| --- | --- |
| Planned | 暂存的想法或提案，尚未授权执行。 |
| Ready | 已批准且可以领取的工作；可通过身份分配隔离队列。 |
| In Progress | 用户或 Agent 正在处理。 |
| Needs Input | 等待决定、访问权限或其他阻碍。 |
| Completed | 已记录结果和验证信息。 |
| Dropped | 已明确取消的提案。 |

开始实现前记录目标和决定。完成交接时说明改了什么、如何验证以及还剩什么。StateDock 负责记录工作，实际执行由连接的编程 Agent 完成。

## StateDock Cloud

官方托管服务入口为 [app.statedock.dev](https://app.statedock.dev)。StateDock 负责账户、认证、服务基础设施和计费。

当前套餐请查看实时的[价格页面](https://statedock.dev/#pricing)，因此本指南不重复写入价格。Free 最多包含 2 个活跃项目槽位和 1 个活跃通知渠道，不能邀请项目成员。Pro 包含不限活跃项目槽位、每项目最多 10 名协作者和不限通知渠道。远程 MCP 与 Agent Identity 队列在两个套餐中都可使用。实际价格以 Stripe 配置和价格页面为准。

## Cloudflare 自部署

Cloudflare 版运行在你自己的账户中，使用 **Workers、D1、KV 和 R2**。你负责基础设施、域名、邮件投递、密钥和备份。它不连接官方 Cloud 数据库，也没有 StateDock Cloud 套餐或计费限额。

外部 OAuth 和 MCP 客户端需要公开 HTTPS 地址。首位验证通过的管理员负责批准实例用户；公开自助注册已关闭。管理员可以管理准入和实例设置，但不会自动获得项目数据访问权。邮件服务和通知端点由运营者自行配置。

开源仓库包含可脱离官网使用的说明：

- [安装与部署](https://github.com/statedock/statedock/blob/main/docs/self-hosting.md)
- [备份、恢复与升级](https://github.com/statedock/statedock/blob/main/docs/operations.md)
- [迁移与 Agent 连接](https://github.com/statedock/statedock/blob/main/docs/migrations.md) · [Agent 指南](https://github.com/statedock/statedock/blob/main/docs/agent-setup.md)

备份方案应覆盖 D1、R2 附件、OAuth KV、部署配置和密钥。自部署 Worker 不得使用官方 Cloud 的数据库或资源 ID。

## StateDock Local：电脑、Linux 服务器、Docker

StateDock Local 是一个开源程序（[statedock-local](https://github.com/statedock/statedock-local)），内置 Web 应用、API、MCP 服务和 SQLite 数据库。发布包自带运行时，无需再安装其他东西。同一个程序、同一种数据库格式，有三种运行方式：

- **在电脑上**（macOS、Windows、Linux）：从 [Releases](https://github.com/statedock/statedock-local/releases/latest) 下载压缩包，解压后运行 `StateDock.command`、`statedock.bat` 或 `./statedock`。只监听 `127.0.0.1:4040`，无需登录。MCP 地址为 `http://127.0.0.1:4040/mcp`，令牌在 `~/.statedock/agent_token`。
- **在 Linux 服务器上**（systemd，x64 或 ARM64，1 核 1G 即可）：一条命令安装为开机自启的服务：

  ```sh
  curl -fsSL https://raw.githubusercontent.com/statedock/statedock-local/main/scripts/install.sh \
    | sudo bash -s -- --public-url https://dock.example.com
  ```

  前面用 Caddy 或隧道提供 HTTPS。`sudo statedock token` 输出访问令牌；`sudo statedock-ctl update` 会先备份数据库再升级，新版本启动失败时自动回滚。
- **在 Docker 中**：镜像 `ghcr.io/statedock/statedock` 就是同一个程序；仓库中的 `deploy/compose.yaml` 搭配 Caddy 运行。

在服务器或 Docker 中，StateDock 运行在**服务器模式**：只有一个所有者、一个访问令牌，浏览器在 `/login` 登录一次，Agent 向 `https://你的域名/mcp` 发送 `Authorization: Bearer <令牌>`。没有账号、角色、邮件或计费限制。

仓库中的说明：[README](https://github.com/statedock/statedock-local#readme) · [服务器、HTTPS、升级与 Docker](https://github.com/statedock/statedock-local/blob/main/docs/server.md)。

原 `statedock-docker` 仓库已归档并入 StateDock Local；已有的 `./data` 目录可直接使用（[迁移步骤](https://github.com/statedock/statedock-local/blob/main/docs/server.md#moving-from-the-statedock-docker-image)）。

## 通知

根据部署方式和配置，StateDock 可发送内置 Web Push 推送，也可接入 Telegram、Discord、Bark、ntfy 和 Outgoing Webhook 等可选渠道。Cloud 用户在个人账户中配置通知偏好；自部署运营者负责提供并维护实例集成。具体配置请查阅对应部署指南。

## 故障排查

- **Agent 看不到 Ready 任务**：检查任务是否为 Ready、是否分配给预期身份，以及任务所属项目是否与 **get_instance_info** 返回的项目一致。确认当前 MCP 连接绑定了该身份。
- **Agent 报告的身份不符**：对比 **agentId**、**agentName**、**publicOrigin** 和 **mcpUrl** 与 MCP 设置。修改授权后刷新缓存的 OAuth/MCP 工具，或开启新对话。
- **Cloudflare 用户无法登录**：请管理员批准完全一致的账户邮箱，并确认邮件投递已配置。
- **自部署 MCP/OAuth 无法连接**：使用实例的公开 HTTPS 地址，并检查 Worker 配置、OAuth 发现信息、邮件发件人和密钥。
- **文档链接打不开**：部署与运维指南也可以从 [Cloudflare 仓库](https://github.com/statedock/statedock/tree/main/docs)访问。Cloudflare 应用也会提供对应的 Markdown 指南文件。

机器端配置入口为 [agent.md](/agent.md)、[setup.md](/setup.md) 和 [skill.md](/skill.md)。这些 URL 用途不同，仍对现有客户端保持可用。
