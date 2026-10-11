import type { OnlineEnv } from "./auth.js";
import { shouldNotify, type NotificationEvent } from "./notification-preferences.js";
import { webPushConfig } from "./web-push-config.js";
import { pushNotice, sendWebPush, type PushDevice } from "./web-push-sender.js";
/** Per-device leases prevent a successful device being resent when a second device fails. */
export async function dispatchWebPush(env: OnlineEnv, projectId?: string) {
  if (!webPushConfig(env)) return;
  const at = new Date().toISOString();
  // Drop expired jobs before selection, so a long outage never sends stale alerts.
  await env.DB.prepare(
    "DELETE FROM web_push_outbox WHERE event_id IN (SELECT sequence FROM plan_events WHERE created_at<?)",
  )
    .bind(new Date(Date.now() - 86400000).toISOString())
    .run();
  const jobs = await env.DB.prepare(
    `SELECT event_id,subscription_id,payload,attempts FROM web_push_outbox
    WHERE delivered_at IS NULL AND available_at<=? ${projectId ? "AND project_id=?" : ""} ORDER BY available_at LIMIT 50`,
  )
    .bind(...(projectId ? [at, projectId] : [at]))
    .all<{ event_id: number; subscription_id: string; payload: string; attempts: number }>();
  await Promise.allSettled(
    jobs.results.map(async (job) => {
      const lease = crypto.randomUUID();
      const claimed = await env.DB.prepare(
        "UPDATE web_push_outbox SET lease=?,available_at=?,attempts=attempts+1 WHERE event_id=? AND subscription_id=? AND delivered_at IS NULL AND available_at<=?",
      )
        .bind(
          lease,
          new Date(Date.now() + 120000).toISOString(),
          job.event_id,
          job.subscription_id,
          at,
        )
        .run();
      if (!claimed.meta.changes) return;
      try {
        const event = JSON.parse(job.payload) as NotificationEvent;
        const device = await env.DB.prepare(
          `SELECT s.* FROM web_push_subscriptions s JOIN users u ON u.id=s.user_id
        JOIN sessions ss ON ss.id=s.session_id AND ss.revoked_at IS NULL AND ss.expires_at>?
        JOIN projects pr ON pr.id=? WHERE s.id=? AND u.disabled_at IS NULL
        AND (pr.owner_id=s.user_id OR EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id=pr.id AND pm.user_id=s.user_id))`,
        )
          .bind(at, event.projectId, job.subscription_id)
          .first<PushDevice>();
        if (
          device &&
          (await shouldNotify(env, device.user_id, "webpush", job.subscription_id, event))
        ) {
          const result = await sendWebPush(env, device, pushNotice(event, job.event_id, device));
          if (result === "expired") {
            await env.DB.batch([
              env.DB.prepare(
                "DELETE FROM notification_preferences WHERE channel='webpush' AND connection_id=? AND user_id=?",
              ).bind(job.subscription_id, device.user_id),
              env.DB.prepare("DELETE FROM web_push_subscriptions WHERE id=?").bind(
                job.subscription_id,
              ),
            ]);
            return;
          }
        }
        await env.DB.prepare(
          "UPDATE web_push_outbox SET delivered_at=?,lease=NULL WHERE event_id=? AND subscription_id=? AND lease=?",
        )
          .bind(at, job.event_id, job.subscription_id, lease)
          .run();
      } catch {
        await env.DB.prepare(
          "UPDATE web_push_outbox SET available_at=?,lease=NULL WHERE event_id=? AND subscription_id=? AND lease=?",
        )
          .bind(
            new Date(
              Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(job.attempts, 7)),
            ).toISOString(),
            job.event_id,
            job.subscription_id,
            lease,
          )
          .run();
        console.warn("Web Push delivery deferred", { attempt: job.attempts + 1 });
      }
    }),
  );
  await env.DB.prepare(
    "DELETE FROM web_push_outbox WHERE delivered_at<? OR event_id IN (SELECT sequence FROM plan_events WHERE created_at<?)",
  )
    .bind(
      new Date(Date.now() - 7 * 86400000).toISOString(),
      new Date(Date.now() - 86400000).toISOString(),
    )
    .run();
}
