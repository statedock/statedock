import {
  OAuthProvider,
  insufficientScope,
  type OAuthResourceAuth,
} from "@cloudflare/workers-oauth-provider";
import { StateDockService, actorSchema } from "@statedock/core";
import { type OnlineEnv } from "./auth.js";
import { jsonError } from "./http.js";
import { instanceConfig, type InstanceOptions } from "./instance-config.js";
import { authenticateMcpClient, handleMcpRequest } from "./mcp-session-service.js";
import { notificationRepository } from "./notification-service.js";

import { WRITE_TOOLS } from "../../mcp/src/tool-policy.js";

export function createOAuthProvider(
  defaultHandler: {
    fetch(request: Request, env: OnlineEnv, ctx: ExecutionContext): Promise<Response> | Response;
  },
  options: InstanceOptions = {},
) {
  const config = instanceConfig(options);
  return new OAuthProvider<OnlineEnv>({
    apiRoute: "/mcp",
    defaultHandler,
    authorizeEndpoint: "/oauth/authorize",
    tokenEndpoint: "/oauth/token",
    clientRegistrationEndpoint: "/oauth/register",
    scopesSupported: ["mcp:read", "mcp:write"],
    requiredScopes: ["mcp:read"],
    clientIdMetadataDocumentEnabled: true,
    allowPrivateUseRedirectUris: true,
    resourceMetadata: {
      resource: config.mcpUrl,
      authorization_servers: [config.publicOrigin],
      bearer_methods_supported: ["header"],
      resource_name: "StateDock Remote MCP Server",
    },

    resolveExternalToken: async ({ token, env }) => {
      if (!token) return null;
      try {
        const row = await authenticateMcpClient(env.DB, token);
        if (!row) return null;
        return {
          props: {
            userId: row.user_id,
            mcpClientId: row.id,
            clientName: row.name,
            isApiKey: true,
          },
          audience: config.mcpUrl,
        };
      } catch (err) {
        console.error("External token resolution error", err);
        return null;
      }
    },

    onError: ({ status, code, description, internal }) => {
      // Safe structured log without exposing credentials, codes, or tokens
      console.warn(
        `[OAuth Error] ${status} ${code}: ${description} (${internal?.category}/${internal?.reason})`,
      );
    },

    apiHandler: {
      fetch: async (
        request: Request,
        env: OnlineEnv,
        ctx: ExecutionContext & { props?: any; auth?: OAuthResourceAuth },
      ) => {
        const props = ctx.props || {};
        const isApiKey = Boolean(props.isApiKey);
        const userId = props.userId;
        const user = userId
          ? await env.DB.prepare(
              "SELECT id,auth_version FROM users WHERE id=? AND disabled_at IS NULL AND instance_approved_at IS NOT NULL",
            )
              .bind(userId)
              .first<{ id: string; auth_version: number }>()
          : null;

        if (!userId || !user || (!isApiKey && props.authVersion !== user.auth_version)) {
          return jsonError("unauthorized", 401);
        }

        // Scope check for OAuth clients
        let requestBody: any = null;
        try {
          requestBody = await request.clone().json();
        } catch {}

        if (!isApiKey) {
          const grantedScopes = new Set(ctx.auth?.scope || []);

          if (requestBody) {
            if (Array.isArray(requestBody)) {
              const hasWriteCall = requestBody.some(
                (item) => item?.method === "tools/call" && WRITE_TOOLS.has(item?.params?.name),
              );
              if (hasWriteCall && !grantedScopes.has("mcp:write")) {
                return insufficientScope(
                  ctx.auth!,
                  ["mcp:write"],
                  "Write tool in batch requires mcp:write scope",
                );
              }
              if (!grantedScopes.has("mcp:read")) {
                return insufficientScope(
                  ctx.auth!,
                  ["mcp:read"],
                  "MCP operations require mcp:read scope",
                );
              }
            } else if (requestBody.method === "tools/call") {
              const toolName = requestBody.params?.name;
              if (WRITE_TOOLS.has(toolName)) {
                if (!grantedScopes.has("mcp:write")) {
                  return insufficientScope(
                    ctx.auth!,
                    ["mcp:write"],
                    `Tool '${toolName}' requires mcp:write scope`,
                  );
                }
              } else {
                if (!grantedScopes.has("mcp:read")) {
                  return insufficientScope(
                    ctx.auth!,
                    ["mcp:read"],
                    `Tool '${toolName}' requires mcp:read scope`,
                  );
                }
              }
            } else {
              // Any other method like tools/list, resources/list
              if (!grantedScopes.has("mcp:read")) {
                return insufficientScope(
                  ctx.auth!,
                  ["mcp:read"],
                  "MCP access requires mcp:read scope",
                );
              }
            }
          }
        }

        // Configure actor
        const clientId = ctx.auth?.clientId || "client";
        const actor = isApiKey
          ? actorSchema.parse({
              id: `mcp:${props.mcpClientId || "key"}`,
              type: "agent",
              name: props.clientName || "API Client",
            })
          : actorSchema.parse({
              id: `oauth:${clientId.slice(0, 48)}`,
              type: "agent",
              name: "ChatGPT",
            });

        const repo = notificationRepository(env, userId);
        let mcpRequest = request;
        if (!mcpRequest.headers.has("accept")) {
          const headers = new Headers(mcpRequest.headers);
          headers.set("accept", "application/json, text/event-stream");
          mcpRequest = new Request(mcpRequest, { headers });
        }
        return handleMcpRequest(
          new StateDockService(repo),
          actor,
          mcpRequest,
          async (response) => {
            // For tools/list, augment tools with securitySchemes if client expects it
            if (
              requestBody &&
              !Array.isArray(requestBody) &&
              requestBody.method === "tools/list" &&
              response.status === 200
            ) {
              try {
                const json = (await response.clone().json()) as any;
                if (json?.result?.tools && Array.isArray(json.result.tools)) {
                  for (const t of json.result.tools) {
                    const isWrite = WRITE_TOOLS.has(t.name);
                    const sec = [{ type: "oauth2", scopes: [isWrite ? "mcp:write" : "mcp:read"] }];
                    t.securitySchemes = sec;
                    t._meta = t._meta || {};
                    t._meta.securitySchemes = sec;
                  }
                  const headers = new Headers(response.headers);
                  headers.set("content-type", "application/json");
                  return new Response(JSON.stringify(json), { status: 200, headers });
                }
              } catch {}
            }

            return response;
          },
          instanceConfig(env).publicOrigin,
        );
      },
    },
  });
}
