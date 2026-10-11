import { instanceConfig } from "./instance-config.js";
import { Hono } from "hono";
import { z } from "zod";
import { currentSession, type OnlineEnv } from "./auth.js";
import { sendBark } from "./bark.js";
import { sendDiscord } from "./discord.js";
import { preferences } from "./notification-preferences.js";
import { registerBarkRoutes } from "./notification-routes/bark.js";
import { registerDiscordRoutes } from "./notification-routes/discord.js";
import { registerNtfyRoutes } from "./notification-routes/ntfy.js";
import { registerTelegramRoutes } from "./notification-routes/telegram.js";
import { registerWebhookRoutes } from "./notification-routes/webhook.js";
import { sendNtfy } from "./ntfy.js";
import { sendTelegramMessage } from "./telegram.js";
import { sendWebhook } from "./webhook.js";

const router = new Hono<{ Bindings: OnlineEnv; Variables: { userId: string } }>();

router.use("*", async (c, next) => {
  if (c.req.method !== "GET") {
    const origin = c.req.header("Origin");
    if (
      (origin && origin !== new URL(c.req.url).origin) ||
      c.req.header("Sec-Fetch-Site") === "cross-site"
    ) {
      return c.json({ error: "origin_not_allowed" }, 403);
    }
  }
  const session = await currentSession(c);
  if (!session) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", session.id);
  await next();
});

import { getUserAccessibleProjectIds, owns } from "./notification-connection-service.js";

const channelSchema = z.enum(["bark", "telegram", "discord", "ntfy", "webhook", "webpush"]);

router.get("/:channel/:id", async (c) => {
  const channel = channelSchema.safeParse(c.req.param("channel"));
  if (!channel.success || !(await owns(c.env, c.get("userId"), channel.data, c.req.param("id")))) {
    return c.json({ error: "not_found" }, 404);
  }
  return c.json({
    data: await preferences(c.env, c.get("userId"), channel.data, c.req.param("id")),
  });
});

router.put("/:channel/:id", async (c) => {
  const channel = channelSchema.safeParse(c.req.param("channel"));
  const parsed = z
    .object({
      enabled: z.boolean(),
      projectIds: z.array(z.string().uuid()).max(200).nullable(),
      events: z.array(z.enum(["created", "started", "completed", "waiting", "dropped"])).max(5),
    })
    .safeParse(await c.req.json().catch(() => null));
  if (!channel.success || !parsed.success) return c.json({ message: "提醒设置无效。" }, 400);
  const userId = c.get("userId"),
    id = c.req.param("id");
  if (!(await owns(c.env, userId, channel.data, id))) return c.json({ error: "not_found" }, 404);
  if (parsed.data.projectIds) {
    const validIds = await getUserAccessibleProjectIds(c.env.DB, userId);
    if (parsed.data.projectIds.some((id) => !validIds.includes(id))) {
      return c.json({ message: "所选项目不存在。" }, 400);
    }
  }
  const data = parsed.data;
  await c.env.DB.prepare(
    "INSERT INTO notification_preferences(user_id,channel,connection_id,enabled,project_ids,events) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,channel,connection_id) DO UPDATE SET enabled=excluded.enabled,project_ids=excluded.project_ids,events=excluded.events",
  )
    .bind(
      userId,
      channel.data,
      id,
      Number(data.enabled),
      JSON.stringify(data.projectIds),
      JSON.stringify([...new Set(data.events)]),
    )
    .run();
  return c.json({ data });
});

// Test connection
router.post("/:channel/:id/test", async (c) => {
  const channel = c.req.param("channel"),
    id = c.req.param("id"),
    userId = c.get("userId");
  let ok = false;
  let errorDetail = "";

  if (channel === "bark") {
    const row = await c.env.DB.prepare(
      "SELECT device_key FROM bark_subscribers WHERE user_id=? AND id=?",
    )
      .bind(userId, id)
      .first<{ device_key: string }>();
    if (!row) return c.json({ error: "not_found" }, 404);
    ok = await sendBark(row.device_key, "StateDock · 测试提醒", "Bark 已连接，可以接收任务提醒。");
  } else if (channel === "discord") {
    const row = await c.env.DB.prepare(
      "SELECT webhook_url FROM discord_connections WHERE user_id=? AND id=?",
    )
      .bind(userId, id)
      .first<{ webhook_url: string }>();
    if (!row) return c.json({ error: "not_found" }, 404);
    ok = await sendDiscord(row.webhook_url);
  } else if (channel === "telegram") {
    const row = await c.env.DB.prepare(
      "SELECT chat_id FROM telegram_subscribers WHERE user_id=? AND id=?",
    )
      .bind(userId, id)
      .first<{ chat_id: string }>();
    if (!row) return c.json({ error: "not_found" }, 404);
    if (c.env.TELEGRAM_BOT_TOKEN) {
      const result = await sendTelegramMessage(
        c.env.TELEGRAM_BOT_TOKEN,
        row.chat_id,
        "StateDock · 测试提醒：Telegram 已连接。",
      );
      ok = !!(result as { ok?: boolean } | null)?.ok;
    }
  } else if (channel === "ntfy") {
    const row = await c.env.DB.prepare(
      "SELECT topic_url, auth_token FROM ntfy_subscribers WHERE user_id=? AND id=?",
    )
      .bind(userId, id)
      .first<{ topic_url: string; auth_token: string | null }>();
    if (!row) return c.json({ error: "not_found" }, 404);
    const res = await sendNtfy(
      row.topic_url,
      "StateDock · 测试提醒",
      "ntfy 已成功连接，可以接收任务提醒。",
      instanceConfig(c.env).appOrigin,
      row.auth_token,
    );
    ok = res.ok;
    if (!ok && res.message) errorDetail = res.message;
  } else if (channel === "webhook") {
    const row = await c.env.DB.prepare(
      "SELECT url, secret FROM webhook_connections WHERE user_id=? AND id=?",
    )
      .bind(userId, id)
      .first<{ url: string; secret: string | null }>();
    if (!row) return c.json({ error: "not_found" }, 404);
    const res = await sendWebhook(row, undefined, instanceConfig(c.env).appOrigin);
    ok = res.ok;
    if (!ok && res.error) errorDetail = res.error;
  } else {
    return c.json({ error: "not_found" }, 404);
  }

  return ok
    ? c.json({ data: { sent: true } })
    : c.json({ message: errorDetail || "发送失败，请检查连接后重试。" }, 502);
});

registerBarkRoutes(router);
registerNtfyRoutes(router);
registerDiscordRoutes(router);
registerTelegramRoutes(router);
registerWebhookRoutes(router);
export { router as notificationRoutes };
