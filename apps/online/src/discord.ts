import type { OnlineEnv } from "./auth.js";
import {
  actions,
  eventDescription,
  formatTaskId,
  formatTaskLabel,
  shouldNotify,
  taskUrl,
  type NotificationEvent,
} from "./notification-preferences.js";
export function discordUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (
      url.origin !== "https://discord.com" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/api(?:\/v10)?\/webhooks\/\d{10,25}\/[A-Za-z0-9_-]{20,200}\/?$/.test(url.pathname)
    )
      return null;
    url.searchParams.set("wait", "true");
    return url.toString();
  } catch {
    return null;
  }
}
export async function sendDiscord(url: string, event?: NotificationEvent) {
  try {
    const res = await fetch(url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "StateDock",
        allowed_mentions: { parse: [] },
        embeds: [
          event
            ? {
                title: `${formatTaskId(event)} · ${actions[event.kind]}`,
                url: taskUrl(event),
                description: `${formatTaskLabel(event).slice(0, 600)}\n\n${eventDescription(event)}`,
                footer: { text: event.projectName.slice(0, 200) },
                color:
                  event.kind === "completed"
                    ? 0x238636
                    : event.kind === "waiting"
                      ? 0xd29922
                      : 0x5865f2,
              }
            : {
                title: "StateDock · 测试提醒",
                description: "Discord 已连接，可以接收任务提醒。",
                url: "http://localhost:8787",
              },
        ],
      }),
    });
    if (!res.ok) console.error("Discord delivery failed", { status: res.status });
    await res.body?.cancel();
    return res.ok;
  } catch {
    console.error("Discord delivery request failed");
    return false;
  }
}
export async function notifyDiscordSubscribers(
  env: OnlineEnv,
  userId: string,
  event: NotificationEvent,
) {
  const rows = await env.DB.prepare(
    "SELECT id,webhook_url FROM discord_connections WHERE user_id=?",
  )
    .bind(userId)
    .all<{ id: string; webhook_url: string }>();
  await Promise.all(
    rows.results.map(async (row) => {
      if (await shouldNotify(env, userId, "discord", row.id, event))
        if (!(await sendDiscord(row.webhook_url, event)))
          throw new Error("Discord delivery failed");
    }),
  );
}
