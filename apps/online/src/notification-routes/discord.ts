import { Hono } from "hono";
import { z } from "zod";
import { type OnlineEnv } from "../auth.js";
import { discordUrl } from "../discord.js";
import { getUserAccessibleProjectIds } from "../notification-connection-service.js";

export function registerDiscordRoutes(
  router: Hono<{ Bindings: OnlineEnv; Variables: { userId: string } }>,
) {
  // Discord connections
  router.get("/discord", async (c) => {
    const rows = await c.env.DB.prepare(
      `SELECT c.id, c.name, c.created_at, p.project_ids
     FROM discord_connections c
     LEFT JOIN notification_preferences p
       ON p.user_id = c.user_id AND p.channel = 'discord' AND p.connection_id = c.id
     WHERE c.user_id = ?
     ORDER BY c.created_at`,
    )
      .bind(c.get("userId"))
      .all<{ id: string; name: string; created_at: string; project_ids: string | null }>();
    const connections = rows.results.map((r) => ({
      id: r.id,
      name: r.name,
      created_at: r.created_at,
      projectIds: r.project_ids ? (JSON.parse(r.project_ids) as string[] | null) : null,
    }));
    return c.json({ data: connections });
  });

  router.post("/discord", async (c) => {
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(100),
        url: z.string().max(1000),
        projectIds: z.array(z.string().uuid()).max(200).nullable().optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ message: "请填写频道名称和 Webhook 地址。" }, 400);
    const url = discordUrl(parsed.data.url);
    if (!url)
      return c.json(
        {
          message: "请使用 Discord 文字频道的 Webhook 地址（https://discord.com/api/webhooks/…）。",
        },
        400,
      );
    const count = await c.env.DB.prepare(
      "SELECT COUNT(*) n FROM discord_connections WHERE user_id=?",
    )
      .bind(c.get("userId"))
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= 10) return c.json({ message: "最多可添加 10 个 Discord 连接。" }, 400);

    if (parsed.data.projectIds) {
      const validIds = await getUserAccessibleProjectIds(c.env.DB, c.get("userId"));
      if (parsed.data.projectIds.some((id) => !validIds.includes(id))) {
        return c.json({ message: "所选项目不存在。" }, 400);
      }
    }

    const id = crypto.randomUUID();
    const statements = [
      c.env.DB.prepare(
        "INSERT INTO discord_connections(id,user_id,name,webhook_url,created_at) VALUES(?,?,?,?,?)",
      ).bind(id, c.get("userId"), parsed.data.name, url, new Date().toISOString()),
    ];
    if (parsed.data.projectIds !== undefined) {
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO notification_preferences(user_id,channel,connection_id,enabled,project_ids,events) VALUES(?,?,?,?,?,?)",
        ).bind(
          c.get("userId"),
          "discord",
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

  router.delete("/discord/:id", async (c) => {
    const userId = c.get("userId"),
      id = c.req.param("id");
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM discord_connections WHERE user_id=? AND id=?").bind(userId, id),
      c.env.DB.prepare(
        "DELETE FROM notification_preferences WHERE user_id=? AND channel='discord' AND connection_id=?",
      ).bind(userId, id),
    ]);
    return c.body(null, 204);
  });
}
