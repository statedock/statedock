import type { OnlineEnv } from "./auth.js";
import type { Channel } from "./notification-preferences.js";
export async function owns(env: OnlineEnv, userId: string, channel: Channel, id: string) {
  const tables = {
    bark: "bark_subscribers",
    ntfy: "ntfy_subscribers",
    telegram: "telegram_subscribers",
    discord: "discord_connections",
    webhook: "webhook_connections",
  };
  const row = await env.DB.prepare(
    `SELECT user_id FROM ${tables[channel]} WHERE user_id=? AND id=?`,
  )
    .bind(userId, id)
    .first();
  return !!row;
}

export async function getUserAccessibleProjectIds(
  db: D1Database,
  userId: string,
): Promise<string[]> {
  const rows = await db
    .prepare(
      "SELECT id FROM projects WHERE owner_id=? OR id IN (SELECT project_id FROM project_members WHERE user_id=?)",
    )
    .bind(userId, userId)
    .all<{ id: string }>();
  return (rows.results ?? []).map((p) => p.id);
}
