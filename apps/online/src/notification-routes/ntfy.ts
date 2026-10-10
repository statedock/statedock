import { Hono } from "hono";
import { z } from "zod";
import { type OnlineEnv } from "../auth.js";
import { getUserAccessibleProjectIds } from "../notification-connection-service.js";
import { parseNtfyUrl } from "../ntfy.js";

export function registerNtfyRoutes(
  router: Hono<{ Bindings: OnlineEnv; Variables: { userId: string } }>,
) {
  // ntfy connections
  router.get("/ntfy", async (c) => {
    const rows = await c.env.DB.prepare(
      `SELECT n.id, n.name, n.topic_url, (n.auth_token IS NOT NULL AND n.auth_token != '') AS has_auth_token, n.enabled, n.created_at, p.project_ids
     FROM ntfy_subscribers n
     LEFT JOIN notification_preferences p
       ON p.user_id = n.user_id AND p.channel = 'ntfy' AND p.connection_id = n.id
     WHERE n.user_id = ?
     ORDER BY n.created_at`,
    )
      .bind(c.get("userId"))
      .all<{
        id: string;
        name: string;
        topic_url: string;
        has_auth_token: number;
        enabled: number;
        created_at: string;
        project_ids: string | null;
      }>();
    const connections = rows.results.map((r) => ({
      id: r.id,
      name: r.name,
      topic_url: r.topic_url,
      has_auth_token: !!r.has_auth_token,
      enabled: !!r.enabled,
      created_at: r.created_at,
      projectIds: r.project_ids ? (JSON.parse(r.project_ids) as string[] | null) : null,
    }));
    return c.json({ data: connections });
  });

  router.post("/ntfy", async (c) => {
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(100),
        topic: z.string().max(1000),
        authToken: z.string().max(500).optional(),
        projectIds: z.array(z.string().uuid()).max(200).nullable().optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ message: "请填写订阅名称和 ntfy Topic。" }, 400);
    const topicUrl = parseNtfyUrl(parsed.data.topic);
    if (!topicUrl) return c.json({ message: "请填写有效的 ntfy Topic 名称或完整推送地址。" }, 400);
    const count = await c.env.DB.prepare("SELECT COUNT(*) n FROM ntfy_subscribers WHERE user_id=?")
      .bind(c.get("userId"))
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= 10) return c.json({ message: "最多可添加 10 个 ntfy 订阅连接。" }, 400);

    if (parsed.data.projectIds) {
      const validIds = await getUserAccessibleProjectIds(c.env.DB, c.get("userId"));
      if (parsed.data.projectIds.some((id) => !validIds.includes(id))) {
        return c.json({ message: "所选项目不存在。" }, 400);
      }
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const statements = [
      c.env.DB.prepare(
        "INSERT INTO ntfy_subscribers(id, user_id, name, topic_url, auth_token, enabled, created_at, updated_at) VALUES(?,?,?,?,?,1,?,?)",
      ).bind(
        id,
        c.get("userId"),
        parsed.data.name,
        topicUrl,
        parsed.data.authToken?.trim() || null,
        now,
        now,
      ),
    ];
    if (parsed.data.projectIds !== undefined) {
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO notification_preferences(user_id,channel,connection_id,enabled,project_ids,events) VALUES(?,?,?,?,?,?)",
        ).bind(
          c.get("userId"),
          "ntfy",
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

  router.delete("/ntfy/:id", async (c) => {
    const userId = c.get("userId"),
      id = c.req.param("id");
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM ntfy_subscribers WHERE user_id=? AND id=?").bind(userId, id),
      c.env.DB.prepare(
        "DELETE FROM notification_preferences WHERE user_id=? AND channel='ntfy' AND connection_id=?",
      ).bind(userId, id),
    ]);
    return c.body(null, 204);
  });
}
