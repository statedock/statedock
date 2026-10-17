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
      "headers": { "Authorization": "Bearer YOUR_PERSONAL_TOKEN" }
    }
  }
}
```

Adapt the example host and connection name for your own instance. Store the token only in the client's secret/configuration file. For clients supporting OAuth, add your instance's `/mcp` URL and authorize that instance. Discovery, PKCE, token exchange, and registration use the same origin; read-only grants cannot call write tools.

## Verify the active connection before writing

After adding or changing a connection, reload/reconnect the client or start a new conversation as required by the client. Do not continue setup by creating a project with tools loaded before the configuration change.

Through the **actual selected MCP connection**, call `get_instance_info`. Its `publicOrigin` must exactly match the intended HTTPS origin, and `mcpUrl` must match the configured endpoint. A direct HTTP fetch of the guide or changing a display name is not this check. If the tool is missing, unavailable, or reports another origin, stop all writes and ask the user to reconnect. Never use another StateDock connection as a fallback.

Only after verification, list projects on that connection and select or create the intended project. Bind the repository using the tuple **connection name + public origin + project UUID**, with local path as supplementary information. A project name or UUID alone cannot identify an instance. Save this binding in the repository's working rules without credentials. Before each new conversation performs a write, verify `get_instance_info` against that binding again; if multiple connections exist, use the explicitly bound one.

## Check task context and execution conditions

Before changing an existing task, read its current record and verify its project, status, assigned identity, and claim owner. Review the current goal, decisions, summary, relevant recent discussion or feedback, and attachments. Restore only the project context needed for the work. When something is unclear, inspect relevant history, source files, documentation, Git status and relevant diffs, the actual working directory, and available tools or permissions. Resolve routine choices yourself when the task and saved decisions allow it, preserve unrelated local changes, and do not ask the user to confirm facts you can verify. Ask only for a real conflict, missing authorization or access, or a decision that requires the human. Record important findings on the original task using existing fields; do not add management fields or expand scope into UI, database, approval, or orchestration work. If another identity owns the task or another Agent is working on it, do not claim or overwrite it.

When submitting a handoff from a Git repository, include the optional `codeReference` with full HEAD SHA, branch (or null when detached), and clean/dirty working-tree state, including staged, unstaged, and untracked changes. Optionally include a safe repository identifier and HTTPS commit/PR URL. Dirty state means HEAD may not contain the worktree changes. Omit the field if there is no Git repository; do not initialize Git or store diffs. This reference is not verification or independent review evidence.

The working rules arrive with the verified connection itself: its MCP `instructions` carry the workflow, and the same instance serves the full protocol at `/skill.md` for the details. Do not copy the rules into the repository or a host skill directory; put only a short pointer in the repository's working rules (the connection name, public origin and project UUID, and a line telling the agent to call `resume_project` first). StateDock records goals through MCP calls; it does not observe every conversation automatically. Each collaborator uses their own account and credentials. Never put tokens in task descriptions or commit them. Revoked credentials require reconnecting.

## Instance working rules

Rules version 2026-10-17.2. Use the rules served by your verified instance: its MCP `instructions` for the short workflow and its `/skill.md` for the full protocol. Both record tasks in the conversation language and require instance identity verification. Official Cloud instructions can use different addresses; do not copy a Cloud connection or its URL into your self-deployed binding.

Agents cannot edit a task after it exists. A task's title, body (the goal and the person's decisions) and summary are written by a person or by `submit_handoff`; an agent records what it learns with `add_note`, blocks with `pause_task`, finishes with `submit_handoff`, and can only return a task to `WORKING` with `update_plan`. Setting `READY`, `PLAN` or `DROPPED` is for a person. The server refuses anything else with `forbidden`, and a person's edits keep the replaced text in the task's activity log so a handoff can always be reviewed.

## Ready 队列执行契约

只有用户明确要求执行某项目 Ready 队列，或授权此项目在 Agent 空闲时领取 Ready，才进入队列执行模式。用户授权空闲领取并不会自动创建调度器，也不保证宿主结束当前运行后能自行唤醒；支持远程指令或已授权定时任务的宿主可以复用相同协议。

1. 在任何写入前，调用当前连接的 `get_instance_info`，验证实例 publicOrigin/mcpUrl；核对项目 UUID、slug 与本机仓库绑定。不能只按项目名称猜测，不能回退到其他实例。
2. 每次 `claim_next_task(project: UUID)` 只原子领取一条 READY，PLAN 保留待讨论。任务目标、决定、反馈和附件提供执行依据，不依赖历史聊天上下文，不扩大授权。
3. 认领后核对任务项目，在已绑定仓库执行并完成必要验证。成功后 `submit_handoff` 写入真实结果，再认领下一条。不得接管其他 Agent 的 WORKING。
4. 需求不明确或受阻时 `pause_task` 标为 WAITING、说明需要补充的信息，暂停队列。无 Ready 时安静结束，不自行创建轮询、提醒或定时任务。
5. 用户明确给出固定编号批次时仍只执行那个批次，不能替换为动态 Ready 队列。未授权的发布、删除及外部通信仍需要遵循宿主权限规则。

## Agent Identities and assigned Ready tasks

Create identities to assign tasks and group MCP connections. An identity doesn't create or launch an AI agent. `Codex-Mac` and `Codex-Cloud` can be separate identities even when both use Codex. Multiple tokens bound to one identity share its assigned task queue.

1. Open **MCP Connections → Agent Identities**. Enter a name and click **Add Identity**. The **Identities** list shows existing identities; adding one does not select it for a new token.
2. For a new token, choose **Assign to identity**, then **Create Token**. For an existing token, change its **Identity** selector. The existing token value stays valid; its binding takes effect on subsequent MCP requests without replacing the token or updating the skill. The token's display name does not determine its identity.
3. For OAuth, select an identity on the consent page. To change an existing OAuth connection's identity, reconnect and authorize it again. Independent authorizations can coexist even when clients share a client ID and callback; each keeps its own identity and scopes. A host may need a fresh chat or refreshed tool connection to discover changes.
4. Open a task, choose **Assigned Identity**, save it, and set it to **Ready**. Use the task list's identity filter to review each queue. For a task already **Working**, explicitly return it to **Ready** before reassigning it.
5. Tell the connected agent to execute its own Ready tasks. `list_ready_tasks(project, mode="mine")` and `claim_next_task(project, mode="mine")` only use the identity verified from its credentials. Other identities' tasks and **Unassigned** tasks are excluded. Only use `mode="unassigned"` when the user explicitly authorizes that queue. Claiming is atomic; clients sharing an identity cannot claim the same task twice.

**Unbound** means a connection has no identity; **Unassigned** means a task has no assigned identity. Unbound connections cannot claim remote Ready queues. StateDock records and assigns work; setting Ready does not wake or launch an agent.

Delete an identity with the delete button in **Identities**. Deletion is blocked while it has Working tasks. Otherwise, bound tokens become Unbound and assignments on Planned, Ready and Waiting tasks are cleared; completed task history is retained. Move or complete active work before deleting its identity.

There is nothing to refresh by hand: the connection supplies the current rules. If an older setup left a copy of the skill in a repository or host skill directory, replace it with the short pointer. To check an agent, ask it to call `get_instance_info` and report `publicOrigin`, `mcpUrl`, `agentId` and `rulesVersion`; match `agentId` to the identity in MCP Connections. It must not infer its identity from its software name or token label. Remote Cloudflare MCP uses identity queues; the standalone local SQLite adapter keeps its local queue behavior.
