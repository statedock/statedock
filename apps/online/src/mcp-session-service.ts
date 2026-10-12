import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Actor, StateDockService } from "@statedock/core";
import { createServer } from "../../mcp/src/server.js";
import { digest } from "./auth.js";
import { jsonError } from "./http.js";
interface ClientRow {
  id: string;
  user_id: string;
  name: string;
  email: string;
  agent_id: string | null;
}
export async function authenticateMcpClient(
  db: D1Database,
  token: string,
): Promise<ClientRow | null> {
  const row = await db
    .prepare(
      "SELECT mc.id,mc.user_id,mc.name,mc.agent_id,u.email FROM mcp_clients mc JOIN users u ON u.id=mc.user_id WHERE u.disabled_at IS NULL AND u.instance_approved_at IS NOT NULL AND mc.token_hash=? AND mc.revoked_at IS NULL AND (mc.expires_at IS NULL OR mc.expires_at>?)",
    )
    .bind(await digest(token), new Date().toISOString())
    .first<ClientRow>();
  if (row)
    await db
      .prepare("UPDATE mcp_clients SET last_used_at=? WHERE id=?")
      .bind(new Date().toISOString(), row.id)
      .run();
  return row;
}
export async function handleMcpRequest(
  service: StateDockService,
  actor: Actor,
  request: Request,
  transform?: (response: Response) => Promise<Response>,
  publicOrigin?: string,
) {
  const server = createServer(service, actor, publicOrigin);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    return transform ? await transform(response) : response;
  } catch (error) {
    console.error("StateDock MCP request failed", error);
    return jsonError("mcp_error", 500);
  } finally {
    await server.close().catch(() => {});
    await transport.close().catch(() => {});
  }
}
