import type { OnlineEnv } from "./auth.js";
import { notifyBarkSubscribers } from "./bark.js";
import { notifyDiscordSubscribers } from "./discord.js";
import { instanceConfig } from "./instance-config.js";
import type { Channel, NotificationEvent } from "./notification-preferences.js";
import { notifyNtfySubscribers } from "./ntfy.js";
import { notifyTelegramSubscribers } from "./telegram.js";
import { notifyWebhookSubscribers } from "./webhook.js";
const deliveries = {
  telegram: notifyTelegramSubscribers,
  bark: notifyBarkSubscribers,
  discord: notifyDiscordSubscribers,
  ntfy: notifyNtfySubscribers,
  webhook: notifyWebhookSubscribers,
};
/** At-least-once delivery: failed jobs survive restarts; each lease has one consumer. */
export async function dispatchNotifications(env: OnlineEnv, projectId?: string) {
  const at = new Date().toISOString();
  const rows = await env.DB.prepare(
    `SELECT id,user_id,channel,payload,attempts FROM notification_outbox WHERE delivered_at IS NULL AND available_at<=? ${projectId ? "AND project_id=?" : ""} ORDER BY available_at LIMIT 50`,
  )
    .bind(...(projectId ? [at, projectId] : [at]))
    .all<{ id: string; user_id: string; channel: Channel; payload: string; attempts: number }>();
  await Promise.allSettled(
    rows.results.map(async (job) => {
      const lease = crypto.randomUUID();
      const claimed = await env.DB.prepare(
        "UPDATE notification_outbox SET lease=?,available_at=?,attempts=attempts+1 WHERE id=? AND delivered_at IS NULL AND available_at<=?",
      )
        .bind(lease, new Date(Date.now() + 120000).toISOString(), job.id, at)
        .run();
      if (!claimed.meta.changes) return;
      try {
        const event = JSON.parse(job.payload) as NotificationEvent;
        event.appOrigin = instanceConfig(env).appOrigin;
        const accessible = await env.DB.prepare(
          "SELECT id FROM projects WHERE id=? AND (owner_id=? OR id IN (SELECT project_id FROM project_members WHERE user_id=?)) AND EXISTS(SELECT 1 FROM users WHERE id=? AND disabled_at IS NULL AND instance_approved_at IS NOT NULL)",
        )
          .bind(event.projectId, job.user_id, job.user_id, job.user_id)
          .first();
        if (accessible) await deliveries[job.channel](env, job.user_id, event);
        await env.DB.prepare(
          "UPDATE notification_outbox SET delivered_at=?,lease=NULL WHERE id=? AND lease=?",
        )
          .bind(new Date().toISOString(), job.id, lease)
          .run();
      } catch {
        await env.DB.prepare(
          "UPDATE notification_outbox SET available_at=?,lease=NULL WHERE id=? AND lease=?",
        )
          .bind(
            new Date(
              Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(job.attempts, 7)),
            ).toISOString(),
            job.id,
            lease,
          )
          .run();
        console.warn("Notification delivery deferred", {
          channel: job.channel,
          attempt: job.attempts + 1,
        });
      }
    }),
  );
  await env.DB.prepare("DELETE FROM notification_outbox WHERE delivered_at<?")
    .bind(new Date(Date.now() - 7 * 86400000).toISOString())
    .run();
}
