# Connect an agent to your StateDock instance

Use your own HTTPS origin wherever this guide shows `https://dock.example.com`; that hostname is an example, not a StateDock service. The guide URL and the active MCP connection are different things: reading this guide does not switch tools already loaded in a conversation.

1. Sign in to your instance and generate a personal Agent Access Token in **Connect Agent**.
2. Add a **separate connection** whose name identifies this instance. For `https://dock.example.com`, use `statedock_dock_example_com`. Derive the name from the endpoint host (including a nondefault port), replacing punctuation with underscores. Preserve other StateDock connections; never overwrite an existing entry pointing elsewhere.
3. Configure the remote MCP endpoint and token together:

```json
{
  "mcpServers": {
    "statedock_dock_example_com": {
      "url": "https://dock.example.com/mcp",
      "headers": {"Authorization": "Bearer YOUR_PERSONAL_TOKEN"}
    }
  }
}
```

Adapt the example host and connection name for your own instance. Store the token only in the client's secret/configuration file. For clients supporting OAuth, add your instance's `/mcp` URL and authorize that instance. Discovery, PKCE, token exchange, and registration use the same origin; read-only grants cannot call write tools.

## Verify the active connection before writing

After adding or changing a connection, reload/reconnect the client or start a new conversation as required by the client. Do not continue setup by creating a project with tools loaded before the configuration change.

Through the **actual selected MCP connection**, call `get_instance_info`. Its `publicOrigin` must exactly match the intended HTTPS origin, and `mcpUrl` must match the configured endpoint. A direct HTTP fetch of the guide or changing a display name is not this check. If the tool is missing, unavailable, or reports another origin, stop all writes and ask the user to reconnect. Never use another StateDock connection as a fallback.

Only after verification, list projects on that connection and select or create the intended project. Bind the repository using the tuple **connection name + public origin + project UUID**, with local path as supplementary information. A project name or UUID alone cannot identify an instance. Save this binding in the repository's working rules without credentials. Before each new conversation performs a write, verify `get_instance_info` against that binding again; if multiple connections exist, use the explicitly bound one.

Read the verified instance's `/skill.md` and configure project working rules. StateDock records goals through MCP calls; it does not observe every conversation automatically. Each collaborator uses their own account and credentials. Never put tokens in task descriptions or commit them. Revoked credentials require reconnecting.

## Instance working rules

Use the `/skill.md` served by your verified instance. This repository's English skill records tasks in the conversation language and requires instance identity verification. Official Cloud instructions can use different update addresses; do not copy a Cloud connection or its update URL into your self-deployed binding. Update working rules from the same verified instance.

## Ready 队列执行契约

只有用户明确要求执行某项目 Ready 队列，或授权此项目在 Agent 空闲时领取 Ready，才进入队列执行模式。用户授权空闲领取并不会自动创建调度器，也不保证宿主结束当前运行后能自行唤醒；支持远程指令或已授权定时任务的宿主可以复用相同协议。

1. 在任何写入前，调用当前连接的 `get_instance_info`，验证实例 publicOrigin/mcpUrl；核对项目 UUID、slug 与本机仓库绑定。不能只按项目名称猜测，不能回退到其他实例。
2. 每次 `claim_next_task(project: UUID)` 只原子领取一条 READY，PLAN 保留待讨论。任务目标、决定、反馈和附件提供执行依据，不依赖历史聊天上下文，不扩大授权。
3. 认领后核对任务项目，在已绑定仓库执行并完成必要验证。成功后 `submit_handoff` 写入真实结果，再认领下一条。不得接管其他 Agent 的 WORKING。
4. 需求不明确或受阻时 `pause_task` 标为 WAITING、说明需要补充的信息，暂停队列。无 Ready 时安静结束，不自行创建轮询、提醒或定时任务。
5. 用户明确给出固定编号批次时仍只执行那个批次，不能替换为动态 Ready 队列。未授权的发布、删除及外部通信仍需要遵循宿主权限规则。
