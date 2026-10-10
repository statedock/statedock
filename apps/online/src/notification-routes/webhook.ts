import { Hono } from "hono";
import { z } from "zod";
import { type OnlineEnv } from "../auth.js";
import { getUserAccessibleProjectIds } from "../notification-connection-service.js";
import { validateWebhookUrl } from "../webhook.js";

export function registerWebhookRoutes(
  router: Hono<{ Bindings: OnlineEnv; Variables: { userId: string } }>,
) {
  // Outgoing Generic Webhook connections
  router.get("/webhook", async (c) => {
    const rows = await c.env.DB.prepare(
      `SELECT c.id, c.name, c.url, (c.secret IS NOT NULL AND c.secret != '') AS has_secret, c.created_at, p.project_ids
     FROM webhook_connections c
     LEFT JOIN notification_preferences p
       ON p.user_id = c.user_id AND p.channel = 'webhook' AND p.connection_id = c.id
     WHERE c.user_id = ?
     ORDER BY c.created_at`,
    )
      .bind(c.get("userId"))
      .all<{
        id: string;
        name: string;
        url: string;
        has_secret: number;
        created_at: string;
        project_ids: string | null;
      }>();
    const connections = rows.results.map((r) => ({
      id: r.id,
      name: r.name,
      url: r.url,
      has_secret: !!r.has_secret,
      created_at: r.created_at,
      projectIds: r.project_ids ? (JSON.parse(r.project_ids) as string[] | null) : null,
    }));
    return c.json({ data: connections });
  });

  router.post("/webhook", async (c) => {
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(100),
        url: z.string().max(2000),
        secret: z.string().max(500).optional(),
        projectIds: z.array(z.string().uuid()).max(200).nullable().optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ message: "请填写 Webhook 名称和有效 URL。" }, 400);
    const validUrl = validateWebhookUrl(parsed.data.url);
    if (!validUrl)
      return c.json({ message: "请填写以 http:// 或 https:// 开头的有效 Webhook 目标 URL。" }, 400);

    const count = await c.env.DB.prepare(
      "SELECT COUNT(*) n FROM webhook_connections WHERE user_id=?",
    )
      .bind(c.get("userId"))
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= 15)
      return c.json({ message: "最多可添加 15 个通用 Webhook 连接。" }, 400);

    if (parsed.data.projectIds) {
      const validIds = await getUserAccessibleProjectIds(c.env.DB, c.get("userId"));
      if (parsed.data.projectIds.some((id) => !validIds.includes(id))) {
        return c.json({ message: "所选项目不存在。" }, 400);
      }
    }

    const id = crypto.randomUUID();
    const statements = [
      c.env.DB.prepare(
        "INSERT INTO webhook_connections(id, user_id, name, url, secret, created_at) VALUES(?,?,?,?,?,?)",
      ).bind(
        id,
        c.get("userId"),
        parsed.data.name,
        validUrl,
        parsed.data.secret?.trim() || null,
        new Date().toISOString(),
      ),
    ];
    if (parsed.data.projectIds !== undefined) {
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO notification_preferences(user_id,channel,connection_id,enabled,project_ids,events) VALUES(?,?,?,?,?,?)",
        ).bind(
          c.get("userId"),
          "webhook",
          id,
          1,
          JSON.stringify(parsed.data.projectIds),
          JSON.stringify(["completed", "waiting"]),
        ),
      );
    }
    await c.env.DB.batch(statements);
    return c.json(
      { data: { id, name: parsed.data.name, projectIds: parsed.data.projectIds ?? null } },
      201,
    );
  });

  router.delete("/webhook/:id", async (c) => {
    const userId = c.get("userId"),
      id = c.req.param("id");
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM webhook_connections WHERE user_id=? AND id=?").bind(userId, id),
      c.env.DB.prepare(
        "DELETE FROM notification_preferences WHERE user_id=? AND channel='webhook' AND connection_id=?",
      ).bind(userId, id),
    ]);
    return c.body(null, 204);
  });
}
