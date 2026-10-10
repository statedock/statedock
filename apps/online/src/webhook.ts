import type { OnlineEnv } from "./auth.js";
import {
  actions,
  formatTaskId,
  formatTaskLabel,
  shouldNotify,
  taskUrl,
  type NotificationEvent,
} from "./notification-preferences.js";

export function validateWebhookUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname || url.hostname.includes(" ")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function signWebhookPayload(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret.trim()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

export interface WebhookSendResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export async function sendWebhook(
  connection: { url: string; secret?: string | null },
  event?: NotificationEvent,
  appOrigin = "http://localhost:8787",
): Promise<WebhookSendResult> {
  const targetUrl = validateWebhookUrl(connection.url);
  if (!targetUrl) return { ok: false, error: "无效的 Webhook URL。" };

  const eventName = event ? `task.${event.kind}` : "test";
  const deliveryId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const payloadObject = event
    ? {
        event: eventName,
        action: actions[event.kind],
        timestamp,
        deliveryId,
        data: {
          reference: event.reference,
          displayId: formatTaskId(event),
          displayLabel: formatTaskLabel(event),
          project: {
            id: event.projectId,
            name: event.projectName,
            slug: event.projectSlug ?? null,
          },
          task: {
            number: event.number,
            title: event.title,
            summary: event.summary ?? null,
            reason: event.reason ?? null,
            url: taskUrl(event),
          },
        },
      }
    : {
        event: "test",
        action: "连通性测试",
        timestamp,
        deliveryId,
        data: {
          message: "StateDock · Webhook 连通性测试成功，可以正常接收任务事件通知。",
          url: appOrigin,
        },
      };

  const payloadJson = JSON.stringify(payloadObject);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": `StateDock-Webhook/1.0 (+${new URL(appOrigin).origin})`,
    "X-StateDock-Event": eventName,
    "X-StateDock-Delivery": deliveryId,
  };

  if (connection.secret?.trim()) {
    headers["X-StateDock-Signature-256"] = await signWebhookPayload(
      connection.secret.trim(),
      payloadJson,
    );
  }

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers,
      body: payloadJson,
    });

    if (response.ok) {
      await response.body?.cancel().catch(() => {});
      return { ok: true, status: response.status };
    }

    const text = await response.text().catch(() => "");
    console.error("Webhook endpoint error", { status: response.status, body: text.slice(0, 300) });
    return {
      ok: false,
      status: response.status,
      error: `Webhook 响应异常 (HTTP ${response.status})`,
    };
  } catch (error) {
    console.error("Webhook request failure", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message.slice(0, 200) : "",
    });
    return {
      ok: false,
      error:
        error instanceof Error && error.name === "TimeoutError"
          ? "请求 Webhook 超时 (8s)。"
          : "连接 Webhook 服务器失败，请检查 URL 是否可访问。",
    };
  }
}

export async function notifyWebhookSubscribers(
  env: OnlineEnv,
  userId: string,
  event: NotificationEvent,
): Promise<void> {
  const rows = await env.DB.prepare(
    "SELECT id, url, secret FROM webhook_connections WHERE user_id=?",
  )
    .bind(userId)
    .all<{ id: string; url: string; secret: string | null }>();

  if (!rows.results.length) return;

  await Promise.all(
    rows.results.map(async (row) => {
      if (await shouldNotify(env, userId, "webhook", row.id, event)) {
        const result = await sendWebhook(row, event, new URL(taskUrl(event)).origin);
        if (!result.ok) {
          throw new Error("Webhook delivery failed");
        }
      }
    }),
  );
}
