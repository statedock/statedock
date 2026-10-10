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

export async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string,
  parseMode: "HTML" | "Markdown" = "HTML",
) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
    });
    return (await res.json()) as { ok?: boolean; result?: unknown };
  } catch (e) {
    console.error("Failed to send telegram message");
    return null;
  }
}

export async function notifyTelegramSubscribers(
  env: OnlineEnv,
  userId: string,
  event: NotificationEvent,
) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  const rows = await env.DB.prepare("SELECT id,chat_id FROM telegram_subscribers WHERE user_id=?")
    .bind(userId)
    .all<{ id: string; chat_id: string }>();
  const description = eventDescription(event);
  const text = [
    `<b>${escapeHtml(formatTaskId(event))} · ${actions[event.kind]}</b>`,
    escapeHtml(event.projectName),
    escapeHtml(formatTaskLabel(event)),
    description ? escapeHtml(description) : "",
    `<a href="${escapeHtml(taskUrl(event))}">查看任务</a>`,
  ]
    .filter(Boolean)
    .join("\n");
  await Promise.all(
    rows.results.map(async (sub) => {
      if (await shouldNotify(env, userId, "telegram", sub.id, event)) {
        const result = await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN!, sub.chat_id, text);
        if (!result?.ok) throw new Error("Telegram delivery failed");
      }
    }),
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
