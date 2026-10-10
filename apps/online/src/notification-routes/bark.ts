import { Hono } from "hono";
import { z } from "zod";
import { type OnlineEnv } from "../auth.js";
import { barkKey } from "../bark.js";
import { getUserAccessibleProjectIds } from "../notification-connection-service.js";

export function registerBarkRoutes(
  router: Hono<{ Bindings: OnlineEnv; Variables: { userId: string } }>,
) {
  // Bark connections
  router.get("/bark", async (c) => {
    const rows = await c.env.DB.prepare(
      `SELECT b.id, b.name, b.device_key, b.enabled, b.created_at, p.project_ids
     FROM bark_subscribers b
     LEFT JOIN notification_preferences p
       ON p.user_id = b.user_id AND p.channel = 'bark' AND p.connection_id = b.id
     WHERE b.user_id = ?
     ORDER BY b.created_at`,
    )
      .bind(c.get("userId"))
      .all<{
        id: string;
        name: string;
        device_key: string;
        enabled: number;
        created_at: string;
        project_ids: string | null;
      }>();
    const connections = rows.results.map((r) => ({
      id: r.id,
      name: r.name,
      device_key: r.device_key,
      enabled: !!r.enabled,
      created_at: r.created_at,
      projectIds: r.project_ids ? (JSON.parse(r.project_ids) as string[] | null) : null,
    }));
    return c.json({ data: connections });
  });

  router.post("/bark", async (c) => {
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(100),
        address: z.string().max(1000),
        projectIds: z.array(z.string().uuid()).max(200).nullable().optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ message: "请填写设备名称和 Bark 推送地址。" }, 400);
    const key = barkKey(parsed.data.address);
    if (!key)
      return c.json(
        { message: "请粘贴 Bark App 中 https://api.day.app/ 开头的有效推送地址。" },
        400,
      );
    const count = await c.env.DB.prepare("SELECT COUNT(*) n FROM bark_subscribers WHERE user_id=?")
      .bind(c.get("userId"))
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= 10) return c.json({ message: "最多可添加 10 个 Bark 设备连接。" }, 400);

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
        "INSERT INTO bark_subscribers(id, user_id, name, device_key, enabled, created_at, updated_at) VALUES(?,?,?,?,1,?,?)",
      ).bind(id, c.get("userId"), parsed.data.name, key, now, now),
    ];
    if (parsed.data.projectIds !== undefined) {
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO notification_preferences(user_id,channel,connection_id,enabled,project_ids,events) VALUES(?,?,?,?,?,?)",
        ).bind(
          c.get("userId"),
          "bark",
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

  router.delete("/bark/:id", async (c) => {
    const userId = c.get("userId"),
      id = c.req.param("id");
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM bark_subscribers WHERE user_id=? AND id=?").bind(userId, id),
      c.env.DB.prepare(
        "DELETE FROM notification_preferences WHERE user_id=? AND channel='bark' AND connection_id=?",
      ).bind(userId, id),
    ]);
    return c.body(null, 204);
  });
}
