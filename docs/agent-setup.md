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
