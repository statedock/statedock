import { Hono } from "hono";
import { z } from "zod";
import {
  type OnlineEnv,
  clearCookie,
  codeHash,
  cookie,
  currentSession,
  digest,
  randomCode,
  randomToken,
  sendLoginCode,
} from "./auth.js";
import { jsonError, sameOrigin, timingSafeEqual } from "./http.js";
import { canRegister, initializeAdministrator, isAdministrator } from "./instance-admin-service.js";
import { allowLoginRequest } from "./login-rate-limit.js";
const emailSchema = z
  .string()
  .trim()
  .email()
  .max(320)
  .transform((v) => v.trim().toLowerCase());

const app = new Hono<{ Bindings: OnlineEnv }>();
app.use("/api/auth/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});

app.get("/api/auth/session", async (c) => {
  const s = await currentSession(c);
  if (!s) return c.json({ data: null });
  return c.json({
    data: { id: s.id, email: s.email, isAdmin: await isAdministrator(c.env.DB, s.id) },
  });
});
app.post("/api/auth/request-code", async (c) => {
  if (!sameOrigin(c.req.raw)) return jsonError("origin_not_allowed", 403);
  const parsed = z.object({ email: emailSchema }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "validation_error" }, 400);
  if (!c.env.SESSION_SECRET || !c.env.OWNER_EMAIL || !c.env.EMAIL_FROM)
    return jsonError("email_login_not_configured", 503);
  const { email } = parsed.data;
  const expires = new Date(Date.now() + 10 * 60_000).toISOString();
  // The same response/rate policy applies to approved and unknown emails.
  if (
    !(await allowLoginRequest(
      c.env.DB,
      c.env.SESSION_SECRET,
      email,
      c.req.header("CF-Connecting-IP") ?? "local",
    ))
  )
    return new Response(JSON.stringify({ error: "too_many_requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "900" },
    });
  if (!(await canRegister(c.env, email)))
    return c.json({ data: { sent: true, expiresAt: expires } });
  const id = crypto.randomUUID(),
    code = randomCode(),
    at = new Date();
  await c.env.DB.prepare(
    "INSERT INTO login_codes(id,email,code_hash,expires_at,attempts,created_at) VALUES(?,?,?,?,0,?)",
  )
    .bind(id, email, await codeHash(c.env.SESSION_SECRET, email, code), expires, at.toISOString())
    .run();
  try {
    await sendLoginCode(c.env, email, code);
  } catch (e) {
    await c.env.DB.prepare("DELETE FROM login_codes WHERE id=?").bind(id).run();
    console.error("StateDock email delivery failed", e);
    return jsonError("email_delivery_failed", 503);
  }
  return c.json({ data: { sent: true, expiresAt: expires } });
});
app.post("/api/auth/verify-code", async (c) => {
  if (!sameOrigin(c.req.raw)) return jsonError("origin_not_allowed", 403);
  const parsed = z
    .object({ email: emailSchema, code: z.string().regex(/^\d{6}$/) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_code" }, 400);
  if (!c.env.SESSION_SECRET) return jsonError("auth_not_configured", 503);
  if (!(await canRegister(c.env, parsed.data.email)))
    return jsonError("invalid_or_expired_code", 400);
  const { email, code } = parsed.data,
    at = new Date().toISOString();
  const row = await c.env.DB.prepare(
    "SELECT * FROM login_codes WHERE email=? AND consumed_at IS NULL AND attempts<5 AND expires_at>? ORDER BY created_at DESC LIMIT 1",
  )
    .bind(email, at)
    .first<{ id: string; code_hash: string; attempts: number }>();
  if (!row) return jsonError("invalid_or_expired_code", 400);
  const candidate = await codeHash(c.env.SESSION_SECRET, email, code);
  if (!timingSafeEqual(candidate, row.code_hash)) {
    await c.env.DB.prepare(
      "UPDATE login_codes SET attempts=attempts+1 WHERE id=? AND consumed_at IS NULL AND attempts<5",
    )
      .bind(row.id)
      .run();
    return jsonError("invalid_or_expired_code", 400);
  }
  const consumed = await c.env.DB.prepare(
    "UPDATE login_codes SET consumed_at=? WHERE id=? AND consumed_at IS NULL AND attempts<5 RETURNING id",
  )
    .bind(at, row.id)
    .first<{ id: string }>();
  if (!consumed) return jsonError("invalid_or_expired_code", 400);
  const userId = crypto.randomUUID(),
    token = randomToken(),
    sessionId = crypto.randomUUID(),
    expires = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();
  await c.env.DB.prepare(
    "INSERT INTO users(id,email,created_at) VALUES(?,?,?) ON CONFLICT(email) DO NOTHING",
  )
    .bind(userId, email, at)
    .run();
  const user = await c.env.DB.prepare(
    "SELECT id,email FROM users WHERE email=? AND disabled_at IS NULL",
  )
    .bind(email)
    .first<{ id: string; email: string }>();
  if (!user) return jsonError("auth_failed", 403);
  await initializeAdministrator(c.env, user.id, user.email);
  const sessionCreated = await c.env.DB.prepare(
    "INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND disabled_at IS NULL AND instance_approved_at IS NOT NULL)",
  )
    .bind(sessionId, user.id, await digest(token), expires, at, user.id)
    .run();
  if (!sessionCreated.meta.changes) return jsonError("auth_failed", 403);
  const host = c.req.header("Host") || c.req.header("host");
  return new Response(
    JSON.stringify({
      data: { id: user.id, email: user.email, isAdmin: await isAdministrator(c.env.DB, user.id) },
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookie(token, 30 * 24 * 60 * 60, host),
      },
    },
  );
});
app.post("/api/auth/logout", async (c) => {
  if (!sameOrigin(c.req.raw)) return jsonError("origin_not_allowed", 403);
  const s = await currentSession(c);
  if (s)
    await c.env.DB.prepare("UPDATE sessions SET revoked_at=? WHERE id=?")
      .bind(new Date().toISOString(), s.session_id)
      .run();
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": clearCookie(c.req.header("Host") || c.req.header("host")) },
  });
});

app.get("/api/auth/mcp-clients", async (c) => {
  const s = await currentSession(c);
  if (!s) return jsonError("unauthorized", 401);
  const rows = await c.env.DB.prepare(
    "SELECT id,name,token_prefix,last_used_at,expires_at,created_at FROM mcp_clients WHERE user_id=? AND revoked_at IS NULL ORDER BY created_at DESC",
  )
    .bind(s.id)
    .all();
  return c.json({ data: rows.results });
});
app.post("/api/auth/mcp-clients", async (c) => {
  if (!sameOrigin(c.req.raw)) return jsonError("origin_not_allowed", 403);
  const s = await currentSession(c);
  if (!s) return jsonError("unauthorized", 401);
  const parsed = z
    .object({ name: z.string().min(1).max(100) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "validation_error" }, 400);
  const token = `sdm_${randomToken(32)}`,
    id = crypto.randomUUID(),
    prefix = token.slice(0, 12),
    at = new Date().toISOString();
  await c.env.DB.prepare(
    "INSERT INTO mcp_clients(id,user_id,name,token_hash,token_prefix,created_at) VALUES(?,?,?,?,?,?)",
  )
    .bind(id, s.id, parsed.data.name, await digest(token), prefix, at)
    .run();
  return c.json({ data: { id, name: parsed.data.name, token, createdAt: at } }, 201);
});

app.delete("/api/auth/mcp-clients/:id", async (c) => {
  if (!sameOrigin(c.req.raw)) return jsonError("origin_not_allowed", 403);
  const session = await currentSession(c);
  if (!session) return jsonError("unauthorized", 401);
  const result = await c.env.DB.prepare(
    "UPDATE mcp_clients SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND user_id=?",
  )
    .bind(new Date().toISOString(), c.req.param("id"), session.id)
    .run();
  if (!result.meta.changes) return jsonError("not_found", 404);
  return new Response(null, { status: 204 });
});

export default app;
