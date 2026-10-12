import {
  AuthorizationError,
  CimdFetchError,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { type OnlineEnv, currentSession } from "./auth.js";

const app = new Hono<{ Bindings: OnlineEnv }>();

import { renderConsentPage, renderErrorPage, renderLoginPage } from "./oauth-pages.js";

app.get("/oauth/authorize", async (c) => {
  const session = await currentSession(c);
  if (!session) {
    return new Response(renderLoginPage(c.req.url), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
      },
    });
  }

  const oauth = (c.env as any).OAUTH_PROVIDER as OAuthHelpers;
  if (!oauth) {
    return new Response(renderErrorPage("OAuth 服务未就绪"), {
      status: 500,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
      },
    });
  }

  try {
    const authRequest = await oauth.parseAuthRequest(c.req.raw);
    const details = await oauth.describeConsent(authRequest);
    const consent = await oauth.beginConsent(authRequest);

    const agents = await c.env.DB.prepare(
      "SELECT id,name FROM agent_profiles WHERE user_id=? AND deleted_at IS NULL ORDER BY name,id",
    )
      .bind(session.id)
      .all<{ id: string; name: string }>();
    const html = renderConsentPage({
      agents: agents.results,
      details,
      handle: consent.handle,
      userEmail: session.email,
      oauthUrl: c.req.url,
    });
    consent.headers.set("Content-Type", "text/html; charset=utf-8");
    consent.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    return new Response(html, { headers: consent.headers });
  } catch (error) {
    if (error instanceof AuthorizationError && error.redirectTo) {
      return Response.redirect(error.redirectTo, 302);
    }
    if (error instanceof AuthorizationError || error instanceof CimdFetchError) {
      const msg =
        error instanceof AuthorizationError ? error.description : "应用客户端信息解析失败。";
      return new Response(renderErrorPage(msg), {
        status: 400,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate, private",
        },
      });
    }
    console.error("OAuth parseAuthRequest error", error);
    return new Response(renderErrorPage("授权请求处理遇到错误"), {
      status: 500,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
      },
    });
  }
});

app.post("/oauth/authorize", async (c) => {
  const session = await currentSession(c);
  if (!session) {
    return c.redirect(c.req.url, 302);
  }

  const oauth = (c.env as any).OAUTH_PROVIDER as OAuthHelpers;
  if (!oauth) {
    return new Response(renderErrorPage("OAuth 服务未就绪"), {
      status: 500,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
      },
    });
  }

  const form = await c.req.formData();
  const handle = String(form.get("handle") || "");
  const decision = form.get("decision");

  try {
    if (decision !== "approve") {
      const denied = await oauth.denyConsent(c.req.raw, handle, {
        description: "User declined authorization",
      });
      denied.headers.set("Location", denied.redirectTo);
      return new Response(null, { status: 302, headers: denied.headers });
    }

    const agentId = String(form.get("agentId") || "");
    const agent = agentId
      ? await c.env.DB.prepare(
          "SELECT id,name FROM agent_profiles WHERE id=? AND user_id=? AND deleted_at IS NULL",
        )
          .bind(agentId, session.id)
          .first<{ id: string; name: string }>()
      : null;
    if (agentId && !agent) return c.json({ error: "invalid_agent" }, 400);
    const requestedScopes = form.getAll("scope").map(String);
    const approvedScopes = requestedScopes.length > 0 ? requestedScopes : ["mcp:read", "mcp:write"];
    const approved = await oauth.approveConsent(c.req.raw, handle, {
      scope: approvedScopes,
    });
    const { redirectTo } = await oauth.completeAuthorization({
      request: approved.request,
      // Independent hosts may share a client and callback; retain their separate grants.
      revokeExistingGrants: false,
      userId: session.id,
      metadata: { email: session.email },
      scope: approved.request.scope,
      props: {
        userId: session.id,
        email: session.email,
        isApiKey: false,
        authVersion: session.auth_version,
        agentId: agent?.id ?? null,
        agentName: agent?.name ?? null,
      },
    });

    approved.headers.set("Location", redirectTo);
    return new Response(null, { status: 302, headers: approved.headers });
  } catch (error) {
    if (error instanceof AuthorizationError && error.redirectTo) {
      return Response.redirect(error.redirectTo, 302);
    }
    if (error instanceof AuthorizationError || error instanceof CimdFetchError) {
      const msg = error instanceof AuthorizationError ? error.description : "授权提交失败。";
      return new Response(renderErrorPage(msg), {
        status: 400,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate, private",
        },
      });
    }
    console.error("OAuth consent approval error", error);
    return new Response(renderErrorPage("完成授权时发生错误"), {
      status: 500,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
      },
    });
  }
});

export default app;
