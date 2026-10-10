import { instanceConfig } from "./instance-config.js";
import { Hono } from "hono";
import { z } from "zod";
import { type OnlineEnv, currentSession, randomToken } from "./auth.js";
import { barkKey, sendBark } from "./bark.js";
import { jsonError, sameOrigin } from "./http.js";
import { notificationRoutes } from "./notification-routes.js";
import { parseNtfyUrl, sendNtfy } from "./ntfy.js";
import { ensureTelegramWebhook } from "./telegram-capture.js";

const app = new Hono<{ Bindings: OnlineEnv }>();

app.route("/api/auth/notifications", notificationRoutes);
app.get("/api/auth/bark", async (c) => {
  const session = await currentSession(c);
  if (!session) return jsonError("unauthorized", 401);
  const row = await c.env.DB.prepare(
    "SELECT enabled FROM bark_subscribers WHERE user_id=? AND enabled=1",
  )
    .bind(session.id)
    .first<{ enabled: number }>();
  return c.json({ data: { configured: !!row, enabled: !!row?.enabled } });
});
app.put("/api/auth/bark", async (c) => {
  if (!sameOrigin(c.req.raw)) return jsonError("origin_not_allowed", 403);
  const session = await currentSession(c);
  if (!session) return jsonError("unauthorized", 401);
  const parsed = z
    .object({ address: z.string().max(1000).optional(), enabled: z.boolean() })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return jsonError("validation_error", 400);
  const { address, enabled } = parsed.data;
  if (address) {
    const key = barkKey(address);
    if (!key)
      return c.json({ message: "请粘贴 Bark App 中 https://api.day.app/ 开头的推送地址。" }, 400);
    const existingConnection = await c.env.DB.prepare(
      "SELECT id FROM bark_subscribers WHERE user_id=? ORDER BY created_at LIMIT 1",
    )
      .bind(session.id)
      .first<{ id: string }>();
    const connectionId = existingConnection?.id ?? `${session.id}:default`;
    await c.env.DB.prepare(
      "INSERT INTO bark_subscribers(id,user_id,device_key,enabled,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET device_key=excluded.device_key,enabled=excluded.enabled,updated_at=excluded.updated_at WHERE bark_subscribers.user_id=excluded.user_id",
    )
      .bind(connectionId, session.id, key, Number(enabled), new Date().toISOString())
      .run();
  } else {
    const row = await c.env.DB.prepare(
      "UPDATE bark_subscribers SET enabled=?,updated_at=? WHERE user_id=? RETURNING user_id",
    )
      .bind(Number(enabled), new Date().toISOString(), session.id)
      .first();
    if (!row) return c.json({ message: "请先填写 Bark 推送地址。" }, 400);
  }
  return c.json({ data: { configured: true, enabled } });
});
app.delete("/api/auth/bark", async (c) => {
  if (!sameOrigin(c.req.raw)) return jsonError("origin_not_allowed", 403);
  const session = await currentSession(c);
  if (!session) return jsonError("unauthorized", 401);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM bark_subscribers WHERE user_id=?").bind(session.id),
    c.env.DB.prepare(
      "DELETE FROM notification_preferences WHERE user_id=? AND channel='bark'",
    ).bind(session.id),
  ]);
  return c.body(null, 204);
});
app.post("/api/auth/bark/test", async (c) => {
  if (!sameOrigin(c.req.raw)) return jsonError("origin_not_allowed", 403);
  const session = await currentSession(c);
  if (!session) return jsonError("unauthorized", 401);
  const sub = await c.env.DB.prepare(
    "SELECT device_key FROM bark_subscribers WHERE user_id=? AND enabled=1",
  )
    .bind(session.id)
    .first<{ device_key: string }>();
  if (!sub) return c.json({ message: "请先保存 Bark 推送地址。" }, 400);
  const ok = await sendBark(
    sub.device_key,
    "StateDock · 测试提醒",
    "Bark 已连接，可以接收任务提醒。",
  );
  if (!ok) return c.json({ message: "发送失败，请检查 Bark 地址后重试。" }, 502);
  return c.json({ data: { sent: true } });
});
app.get("/api/auth/ntfy", async (c) => {
  const session = await currentSession(c);
  if (!session) return jsonError("unauthorized", 401);
  const row = await c.env.DB.prepare(
    "SELECT topic_url,auth_token,enabled FROM ntfy_subscribers WHERE user_id=? AND enabled=1",
  )
    .bind(session.id)
    .first<{ topic_url: string; auth_token: string | null; enabled: number }>();
  return c.json({
    data: {
      configured: !!row,
      enabled: !!row?.enabled,
      topicUrl: row?.topic_url ?? "",
      hasAuthToken: !!row?.auth_token,
    },
  });
});
app.put("/api/auth/ntfy", async (c) => {
  if (!sameOrigin(c.req.raw)) return jsonError("origin_not_allowed", 403);
  const session = await currentSession(c);
  if (!session) return jsonError("unauthorized", 401);
  const parsed = z
    .object({
      topic: z.string().max(1000).optional(),
      authToken: z.string().max(500).optional(),
      enabled: z.boolean(),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return jsonError("validation_error", 400);
  const { topic, authToken, enabled } = parsed.data;
  if (topic) {
    const topicUrl = parseNtfyUrl(topic);
    if (!topicUrl)
      return c.json(
        { message: "请填写有效的 ntfy Topic 名称或完整推送地址（如 https://ntfy.sh/你的Topic）。" },
        400,
      );
    const existingConnection = await c.env.DB.prepare(
      "SELECT id FROM ntfy_subscribers WHERE user_id=? ORDER BY created_at LIMIT 1",
    )
      .bind(session.id)
      .first<{ id: string }>();
    const connectionId = existingConnection?.id ?? `${session.id}:default`;
    await c.env.DB.prepare(
      "INSERT INTO ntfy_subscribers(id,user_id,topic_url,auth_token,enabled,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET topic_url=excluded.topic_url,auth_token=coalesce(excluded.auth_token,ntfy_subscribers.auth_token),enabled=excluded.enabled,updated_at=excluded.updated_at WHERE ntfy_subscribers.user_id=excluded.user_id",
    )
      .bind(
        connectionId,
        session.id,
        topicUrl,
        authToken?.trim() || null,
        Number(enabled),
        new Date().toISOString(),
      )
      .run();
  } else {
    const row = await c.env.DB.prepare(
      "UPDATE ntfy_subscribers SET enabled=?,updated_at=? WHERE user_id=? RETURNING user_id",
    )
      .bind(Number(enabled), new Date().toISOString(), session.id)
      .first();
    if (!row) return c.json({ message: "请先填写 ntfy Topic 地址。" }, 400);
  }
  return c.json({ data: { configured: true, enabled } });
});
app.delete("/api/auth/ntfy", async (c) => {
  if (!sameOrigin(c.req.raw)) return jsonError("origin_not_allowed", 403);
  const session = await currentSession(c);
  if (!session) return jsonError("unauthorized", 401);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM ntfy_subscribers WHERE user_id=?").bind(session.id),
    c.env.DB.prepare(
      "DELETE FROM notification_preferences WHERE user_id=? AND channel='ntfy'",
    ).bind(session.id),
  ]);
  return c.body(null, 204);
});
app.post("/api/auth/ntfy/test", async (c) => {
  if (!sameOrigin(c.req.raw)) return jsonError("origin_not_allowed", 403);
  const session = await currentSession(c);
  if (!session) return jsonError("unauthorized", 401);
  const body = await c.req.json().catch(() => ({}));
  let topicUrl: string | null = null,
    authToken: string | null = null;
  if (body?.topic && typeof body.topic === "string" && body.topic.trim()) {
    topicUrl = parseNtfyUrl(body.topic.trim());
    if (!topicUrl)
      return c.json(
        { message: "请填写有效的 ntfy Topic 名称或完整推送地址（如 https://ntfy.sh/你的Topic）。" },
        400,
      );
    authToken = typeof body.authToken === "string" ? body.authToken.trim() || null : null;
  } else {
    const sub = await c.env.DB.prepare(
      "SELECT topic_url,auth_token FROM ntfy_subscribers WHERE user_id=? AND enabled=1",
    )
      .bind(session.id)
      .first<{ topic_url: string; auth_token: string | null }>();
    if (!sub) return c.json({ message: "请先保存 ntfy 配置或输入 Topic 后测试。" }, 400);
    topicUrl = sub.topic_url;
    authToken = sub.auth_token;
  }
  const result = await sendNtfy(
    topicUrl,
    "StateDock · 测试提醒",
    "ntfy 已成功连接，可以接收任务提醒。",
    instanceConfig(c.env).appOrigin,
    authToken,
  );
  if (!result.ok)
    return c.json({ message: result.message || "发送失败，请检查 ntfy Topic 地址或权限。" }, 502);
  return c.json({ data: { sent: true } });
});
app.get("/api/auth/telegram", async (c) => {
  const s = await currentSession(c);
  if (!s) return jsonError("unauthorized", 401);
  const rows = await c.env.DB.prepare(
    `SELECT t.id, t.chat_id, t.username, t.first_name, t.notify_on_complete, t.notify_on_create, t.created_at, p.project_ids
     FROM telegram_subscribers t
     LEFT JOIN notification_preferences p
       ON p.user_id = t.user_id AND p.channel = 'telegram' AND p.connection_id = t.id
     WHERE t.user_id = ?
     ORDER BY t.created_at DESC`,
  )
    .bind(s.id)
    .all<{
      id: string;
      chat_id: string;
      username: string | null;
      first_name: string | null;
      notify_on_complete: number;
      notify_on_create: number;
      created_at: string;
      project_ids: string | null;
    }>();
  const connections = rows.results.map((r) => ({
    ...r,
    projectIds: r.project_ids ? (JSON.parse(r.project_ids) as string[] | null) : null,
  }));
  return c.json({ data: connections });
});
app.post("/api/auth/telegram/link-token", async (c) => {
  if (!sameOrigin(c.req.raw)) return jsonError("origin_not_allowed", 403);
  const s = await currentSession(c);
  if (!s) return jsonError("unauthorized", 401);
  await ensureTelegramWebhook(c.env);
  const token = randomToken(16),
    expires = new Date(Date.now() + 15 * 60_000).toISOString(),
    at = new Date().toISOString();
  await c.env.DB.prepare("DELETE FROM telegram_link_tokens WHERE user_id=? OR expires_at<?")
    .bind(s.id, at)
    .run();
  await c.env.DB.prepare(
    "INSERT INTO telegram_link_tokens(token,user_id,expires_at,created_at) VALUES(?,?,?,?)",
  )
    .bind(token, s.id, expires, at)
    .run();
  return c.json({ data: { token, botUsername: "StatedockBot", expiresAt: expires } });
});
app.delete("/api/auth/telegram/:id", async (c) => {
  if (!sameOrigin(c.req.raw)) return jsonError("origin_not_allowed", 403);
  const s = await currentSession(c);
  if (!s) return jsonError("unauthorized", 401);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM telegram_subscribers WHERE id=? AND user_id=?").bind(
      c.req.param("id"),
      s.id,
    ),
    c.env.DB.prepare(
      "DELETE FROM notification_preferences WHERE user_id=? AND channel='telegram' AND connection_id=?",
    ).bind(s.id, c.req.param("id")),
  ]);
  return c.body(null, 204);
});
app.post("/api/auth/discord/link-token", async (c) => {
  if (!sameOrigin(c.req.raw)) return jsonError("origin_not_allowed", 403);
  const s = await currentSession(c);
  if (!s) return jsonError("unauthorized", 401);
  const token = randomToken(16);
  const expires = new Date(Date.now() + 15 * 60_000).toISOString();
  const at = new Date().toISOString();
  await c.env.DB.prepare("DELETE FROM discord_link_tokens WHERE user_id=? OR expires_at<?")
    .bind(s.id, at)
    .run();
  await c.env.DB.prepare(
    "INSERT INTO discord_link_tokens(token,user_id,expires_at,created_at) VALUES(?,?,?,?)",
  )
    .bind(token, s.id, expires, at)
    .run();
  return c.json({ data: { token, expiresAt: expires } });
});

app.get("/api/auth/discord/subscriber", async (c) => {
  const s = await currentSession(c);
  if (!s) return jsonError("unauthorized", 401);
  const row = await c.env.DB.prepare(
    "SELECT id, discord_user_id, discord_username, default_project_id, created_at FROM discord_subscribers WHERE user_id=? LIMIT 1",
  )
    .bind(s.id)
    .first();
  return c.json({ data: row ?? null });
});

app.delete("/api/auth/discord/subscriber", async (c) => {
  if (!sameOrigin(c.req.raw)) return jsonError("origin_not_allowed", 403);
  const s = await currentSession(c);
  if (!s) return jsonError("unauthorized", 401);
  await c.env.DB.prepare("DELETE FROM discord_subscribers WHERE user_id=?").bind(s.id).run();
  return c.body(null, 204);
});

export default app;
