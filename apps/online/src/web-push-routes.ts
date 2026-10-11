import { Hono } from "hono";
import { z } from "zod";
import { currentSession, digest, type OnlineEnv } from "./auth.js";
import { sameOrigin } from "./http.js";
import { webPushConfig, validPushEndpoint, validPushKeys } from "./web-push-config.js";
import { sendWebPush, type PushDevice } from "./web-push-sender.js";
const router = new Hono<{
  Bindings: OnlineEnv;
  Variables: { userId: string; sessionId: string };
}>();
router.use("/api/auth/web-push*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  if (!sameOrigin(c.req.raw)) return c.json({ error: "origin_not_allowed" }, 403);
  const session = await currentSession(c);
  if (!session) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", session.id);
  c.set("sessionId", session.session_id);
  await next();
});
router.get("/api/auth/web-push", async (c) => {
  const devices = await c.env.DB.prepare(
    `SELECT s.id,s.name,s.language,s.created_at,p.enabled,p.project_ids projectIds,
    CASE WHEN ss.revoked_at IS NULL AND ss.expires_at>? THEN 1 ELSE 0 END active
    FROM web_push_subscriptions s LEFT JOIN notification_preferences p ON p.channel='webpush' AND p.connection_id=s.id AND p.user_id=s.user_id
    JOIN sessions ss ON ss.id=s.session_id WHERE s.user_id=? ORDER BY s.created_at`,
  )
    .bind(new Date().toISOString(), c.get("userId"))
    .all();
  return c.json({
    data: {
      publicKey: webPushConfig(c.env)?.publicKey ?? null,
      devices: devices.results.map((d) => ({
        ...d,
        projectIds: JSON.parse(String(d.projectIds ?? "null")),
      })),
    },
  });
});
const subscriptionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  language: z.enum(["en", "zh"]),
  subscription: z.object({
    endpoint: z.string().max(2048).refine(validPushEndpoint),
    keys: z
      .object({
        p256dh: z
          .string()
          .regex(/^[A-Za-z0-9_-]+={0,2}$/)
          .max(90),
        auth: z
          .string()
          .regex(/^[A-Za-z0-9_-]+={0,2}$/)
          .max(24),
      })
      .refine(validPushKeys),
  }),
});
router.post("/api/auth/web-push", async (c) => {
  if (!webPushConfig(c.env)) return c.json({ error: "web_push_not_configured" }, 503);
  const parsed = subscriptionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "validation_error" }, 400);
  const { name, language, subscription } = parsed.data,
    at = new Date().toISOString(),
    userId = c.get("userId"),
    id = await digest(subscription.endpoint);
  const existing = await c.env.DB.prepare("SELECT user_id FROM web_push_subscriptions WHERE id=?")
    .bind(id)
    .first<{ user_id: string }>();
  if (existing && existing.user_id !== userId)
    return c.json({ error: "push_device_bound_elsewhere" }, 409);
  const count = await c.env.DB.prepare(
    "SELECT COUNT(*) n FROM web_push_subscriptions WHERE user_id=?",
  )
    .bind(userId)
    .first<{ n: number }>();
  if (!existing && (count?.n ?? 0) >= 20) return c.json({ error: "push_device_limit" }, 409);
  try {
    const results = await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO web_push_subscriptions(id,user_id,session_id,endpoint,p256dh,auth,name,language,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET session_id=excluded.session_id,p256dh=excluded.p256dh,auth=excluded.auth,name=excluded.name,language=excluded.language,updated_at=excluded.updated_at WHERE web_push_subscriptions.user_id=excluded.user_id`,
      ).bind(
        id,
        userId,
        c.get("sessionId"),
        subscription.endpoint,
        subscription.keys.p256dh,
        subscription.keys.auth,
        name,
        language,
        at,
        at,
      ),
      c.env.DB.prepare(
        "INSERT OR IGNORE INTO notification_preferences(user_id,channel,connection_id) SELECT ?, 'webpush',? WHERE EXISTS(SELECT 1 FROM web_push_subscriptions WHERE id=? AND user_id=?)",
      ).bind(userId, id, id, userId),
    ]);
    if (!results[0].meta.changes) return c.json({ error: "push_device_bound_elsewhere" }, 409);
  } catch {
    return c.json({ error: "push_subscription_failed" }, 409);
  }
  return c.json({ data: { id, userId } }, 201);
});
router.delete("/api/auth/web-push/:id", async (c) => {
  const id = c.req.param("id"),
    userId = c.get("userId");
  await c.env.DB.batch([
    c.env.DB.prepare(
      "DELETE FROM notification_preferences WHERE channel='webpush' AND connection_id=? AND user_id=?",
    ).bind(id, userId),
    c.env.DB.prepare("DELETE FROM web_push_subscriptions WHERE id=? AND user_id=?").bind(
      id,
      userId,
    ),
  ]);
  return c.body(null, 204);
});
router.post("/api/auth/web-push/:id/test", async (c) => {
  const id = c.req.param("id"),
    at = new Date().toISOString();
  const device = await c.env.DB.prepare(
    "SELECT * FROM web_push_subscriptions WHERE id=? AND user_id=? AND session_id IN(SELECT id FROM sessions WHERE revoked_at IS NULL AND expires_at>?)",
  )
    .bind(id, c.get("userId"), at)
    .first<PushDevice>();
  if (!device) return c.json({ error: "not_found" }, 404);
  if (!webPushConfig(c.env)) return c.json({ error: "web_push_not_configured" }, 503);
  const allowed = await c.env.DB.prepare(
    "UPDATE web_push_subscriptions SET last_test_at=? WHERE id=? AND (last_test_at IS NULL OR last_test_at<?)",
  )
    .bind(at, id, new Date(Date.now() - 30000).toISOString())
    .run();
  if (!allowed.meta.changes) return c.json({ error: "rate_limited" }, 429);
  try {
    const zh = device.language === "zh";
    const result = await sendWebPush(c.env, device, {
      eventId: `test:${crypto.randomUUID()}`,
      userId: device.user_id,
      title: zh ? "StateDock · 测试通知" : "StateDock · Test notification",
      body: zh
        ? "此设备已连接后台任务通知。"
        : "This device is connected to background task notifications.",
    });
    if (result === "expired") {
      await c.env.DB.batch([
        c.env.DB.prepare(
          "DELETE FROM notification_preferences WHERE channel='webpush' AND connection_id=? AND user_id=?",
        ).bind(id, device.user_id),
        c.env.DB.prepare("DELETE FROM web_push_subscriptions WHERE id=? AND user_id=?").bind(
          id,
          device.user_id,
        ),
      ]);
      return c.json({ error: "push_subscription_expired" }, 410);
    }
    return c.json({ data: { sent: true } });
  } catch {
    return c.json({ error: "push_delivery_failed" }, 502);
  }
});
export default router;
