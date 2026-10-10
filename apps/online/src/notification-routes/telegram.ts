import { Hono } from "hono";
import { type OnlineEnv } from "../auth.js";

export function registerTelegramRoutes(
  router: Hono<{ Bindings: OnlineEnv; Variables: { userId: string } }>,
) {
  // Telegram connections
  router.get("/telegram", async (c) => {
    const rows = await c.env.DB.prepare(
      `SELECT t.id, t.chat_id, t.username, t.first_name, t.notify_on_complete, t.notify_on_create, t.created_at, p.project_ids
     FROM telegram_subscribers t
     LEFT JOIN notification_preferences p
       ON p.user_id = t.user_id AND p.channel = 'telegram' AND p.connection_id = t.id
     WHERE t.user_id = ?
     ORDER BY t.created_at DESC`,
    )
      .bind(c.get("userId"))
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
}
