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

export function barkKey(address: string): string | null {
  try {
    const url = new URL(address.trim());
    if (
      url.origin !== "https://api.day.app" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    const key = url.pathname.split("/")[1];
    return key && /^[a-zA-Z0-9_-]{8,200}$/.test(key) ? key : null;
  } catch {
    return null;
  }
}

export async function sendBark(
  key: string,
  title: string,
  body: string,
  url = "http://localhost:8787",
) {
  try {
    const response = await fetch("https://api.day.app/push", {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_key: key, title, body, group: "StateDock", url }),
    });
    if (!response.ok) {
      console.error("Bark HTTP failure", { status: response.status });
      return false;
    }
    const result = (await response.json()) as { code?: number };
    const ok = response.ok && result.code === 200;
    if (!ok) console.error("Bark rejected push", { status: response.status, code: result.code });
    return ok;
  } catch (error) {
    console.error("Bark push request failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message.slice(0, 200) : "",
    });
    return false;
  }
}

export async function notifyBarkSubscribers(
  env: OnlineEnv,
  userId: string,
  event: NotificationEvent,
) {
  const rows = await env.DB.prepare(
    "SELECT id, device_key FROM bark_subscribers WHERE user_id=? AND enabled=1",
  )
    .bind(userId)
    .all<{ id: string; device_key: string }>();
  if (!rows.results?.length) return;
  const description = eventDescription(event);
  await Promise.all(
    rows.results.map(async (sub) => {
      if (await shouldNotify(env, userId, "bark", sub.id, event)) {
        const ok = await sendBark(
          sub.device_key,
          `${formatTaskId(event)} · ${actions[event.kind]}`,
          `${formatTaskLabel(event)}\n${event.projectName}${description ? "\n" + description : ""}`,
          taskUrl(event),
        );
        if (!ok) throw new Error("Bark delivery failed");
      }
    }),
  );
}
