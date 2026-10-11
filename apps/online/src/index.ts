import { Hono } from "hono";
import authRoutes from "./auth-routes.js";
import type { OnlineEnv } from "./auth.js";
import adminRoutes from "./instance-admin-routes.js";
import collaboratorRoutes from "./collaborator-routes.js";
import connectionRoutes from "./connection-routes.js";
import gatewayRoutes from "./gateway-routes.js";
import importRoutes from "./import-routes.js";
import { instanceConfig } from "./instance-config.js";
import integrationRoutes from "./integration-routes.js";
import { dispatchNotifications } from "./notification-dispatcher.js";
import { createOAuthProvider } from "./oauth-provider.js";
import oauthRoutes from "./oauth-routes.js";
import { drainStorageCleanup } from "./storage-service.js";

const app = new Hono<{ Bindings: OnlineEnv }>();

// Public addresses only; no credentials or account data.
app.get("/api/instance-info", (c) => {
  const { publicOrigin, mcpUrl } = instanceConfig(c.env);
  return c.json({ data: { publicOrigin, mcpUrl } }, 200, { "Cache-Control": "no-store" });
});

app.get("/api/health", async (c) => {
  await c.env.DB.prepare("SELECT 1").first();
  return c.json({ status: "ok", environment: c.env.APP_ENV });
});

app.get("/doc", async (c) => {
  const accept = c.req.header("Accept") || "";
  const wantsMarkdown = accept.split(",").some((range) => {
    const [type, ...parameters] = range.trim().toLowerCase().split(";");
    const quality = parameters.find((p) => p.trim().startsWith("q="));
    return type.trim() === "text/markdown" && (!quality || Number(quality.trim().slice(2)) > 0);
  });
  let response: Response;
  let markdown = false;
  if (wantsMarkdown) {
    response = await c.env.ASSETS.fetch(new Request(new URL("/doc.md", c.req.url)));
    markdown = response.ok;
    if (!markdown) response = await c.env.ASSETS.fetch(c.req.raw);
  } else {
    response = await c.env.ASSETS.fetch(c.req.raw);
  }
  const headers = new Headers(response.headers);
  if (markdown) headers.set("Content-Type", "text/markdown; charset=utf-8");
  const vary = headers.get("Vary");
  if (!vary?.split(",").some((value) => ["accept", "*"].includes(value.trim().toLowerCase()))) {
    headers.append("Vary", "Accept");
  }
  // Browser-only freshness avoids depending on an operator's shared-cache Vary policy.
  headers.set("Cache-Control", "private, max-age=60");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});

app.route("/", authRoutes);
app.route("/", oauthRoutes);
app.route("/", adminRoutes);
app.route("/", connectionRoutes);
app.route("/", integrationRoutes);
app.route("/", importRoutes);
app.route("/", collaboratorRoutes);
// Authenticated API fallback must follow all concrete endpoints.
app.route("/", gatewayRoutes);
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

const providers = new WeakMap<
  OnlineEnv,
  { origin: string; provider: ReturnType<typeof createOAuthProvider> }
>();
function providerFor(env: OnlineEnv) {
  const origin = instanceConfig(env).publicOrigin;
  const cached = providers.get(env);
  if (cached?.origin === origin) return cached.provider;
  const provider = createOAuthProvider(app, env);
  providers.set(env, { origin, provider });
  return provider;
}

const handler = {
  scheduled(_event: ScheduledController, env: OnlineEnv, ctx: ExecutionContext) {
    ctx.waitUntil(
      Promise.all([dispatchNotifications(env), drainStorageCleanup(env.DB, env.ATTACHMENTS)]),
    );
  },
  fetch(request: Request, env: OnlineEnv, ctx: ExecutionContext) {
    if (!env.PUBLIC_BASE_URL)
      return Response.json({ error: "instance_url_not_configured" }, { status: 503 });
    const url = new URL(request.url);
    let req = request;
    if (
      (url.pathname === "/mcp" ||
        url.pathname.startsWith("/.well-known/oauth-") ||
        url.pathname === "/oauth/token" ||
        url.pathname === "/oauth/register" ||
        url.pathname === "/oauth/revoke") &&
      url.origin !== instanceConfig(env).publicOrigin
    ) {
      req = new Request(`${instanceConfig(env).publicOrigin}${url.pathname}${url.search}`, request);
    }
    const provider = providerFor(env);
    return provider.fetch(req, env, ctx);
  },
  request: app.request.bind(app),
};

export { app };
export default handler;
