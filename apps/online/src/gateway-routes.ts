import { StateDockService, actorSchema } from "@statedock/core";
import { Hono } from "hono";
import { createApp } from "../../api/src/app.js";
import { type OnlineEnv, currentSession } from "./auth.js";
import { jsonError, sameOrigin } from "./http.js";
import { authenticateMcpClient, handleMcpRequest } from "./mcp-session-service.js";
import { notificationRepository } from "./notification-service.js";

import { instanceConfig } from "./instance-config.js";

const app = new Hono<{ Bindings: OnlineEnv }>();

app.all("/mcp", async (c) => {
  const bearer = /^Bearer\s+(.+)$/i.exec(c.req.header("Authorization") ?? "")?.[1];
  if (!bearer) return jsonError("unauthorized", 401);
  const row = await authenticateMcpClient(c.env.DB, bearer);
  if (!row) return jsonError("invalid_client_token", 401);
  const actor = actorSchema.parse({
    id: row.agent_id ? `agent:${row.agent_id}` : `mcp:${row.id}`,
    type: "agent",
    name: row.name,
    agentId: row.agent_id ?? undefined,
  });
  const repo = notificationRepository(c.env, row.user_id);
  return handleMcpRequest(
    new StateDockService(repo),
    actor,
    c.req.raw,
    undefined,
    instanceConfig(c.env).publicOrigin,
  );
});

// Per request service construction keeps the D1 repository's tenant boundary bound to the session owner.
app.all("/api/*", async (c) => {
  if (!sameOrigin(c.req.raw)) return jsonError("origin_not_allowed", 403);
  const session = await currentSession(c);
  if (!session) return jsonError("unauthorized", 401);
  const actor = actorSchema.parse({ id: session.id, type: "human", name: session.email });
  const repo = notificationRepository(c.env, session.id);
  const api = createApp(new StateDockService(repo));
  const headers = new Headers(c.req.raw.headers);
  headers.set("x-actor-id", actor.id);
  headers.set("x-actor-type", actor.type);
  headers.set("x-actor-name", actor.name ?? "");
  let executionCtx: any;
  try {
    executionCtx = c.executionCtx;
  } catch {}
  return api.fetch(new Request(c.req.raw, { headers }), c.env, executionCtx);
});

export default app;
