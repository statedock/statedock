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

export function parseNtfyUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // If user provided just a topic name like "my-secret-topic"
  if (/^[a-zA-Z0-9_-]{2,100}$/.test(trimmed)) {
    return `https://ntfy.sh/${trimmed}`;
  }
  try {
    const url = new URL(
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? trimmed
        : `https://${trimmed}`,
    );
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.pathname || url.pathname === "/") return null;
    return url.origin + url.pathname;
  } catch {
    return null;
  }
}

export type SendNtfyResult = {
  ok: boolean;
  status?: number;
  message?: string;
};

export function parseNtfyEndpoint(topicUrl: string) {
  try {
    const raw =
      topicUrl.trim().startsWith("http://") || topicUrl.trim().startsWith("https://")
        ? topicUrl.trim()
        : `https://${topicUrl.trim()}`;
    const parsed = new URL(raw);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (!segments.length) return null;
    const topic = segments[segments.length - 1];
    const basePath = segments.slice(0, -1).join("/");
    const publishUrl = `${parsed.origin}${basePath ? `/${basePath}` : ""}/`;
    return { topic, publishUrl };
  } catch {
    return null;
  }
}

export async function sendNtfy(
  topicUrl: string,
  title: string,
  body: string,
  clickUrl = "http://localhost:8787",
  authToken?: string | null,
  tags: string[] = ["statedock"],
): Promise<SendNtfyResult> {
  const ep = parseNtfyEndpoint(topicUrl);
  const targetUrl = ep ? ep.publishUrl : topicUrl;
  const payload = ep
    ? { topic: ep.topic, title, message: body, click: clickUrl, tags }
    : { title, message: body, click: clickUrl, tags };

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": `StateDock/1.0 (+${new URL(clickUrl).origin})`,
    };
    if (authToken?.trim()) {
      headers["Authorization"] = `Bearer ${authToken.trim()}`;
    }
    const response = await fetch(targetUrl, {
      method: "POST",
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers,
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      return { ok: true, status: response.status };
    }

    // If publishing to server root returned 404/405, fallback to posting to topicUrl directly
    if (ep && (response.status === 404 || response.status === 405)) {
      const fallbackRes = await fetch(topicUrl, {
        method: "POST",
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
        headers,
        body: JSON.stringify(payload),
      });
      if (fallbackRes.ok) return { ok: true, status: fallbackRes.status };
    }

    const errorText = await response.text().catch(() => "");
    console.error("ntfy HTTP failure", { status: response.status, body: errorText.slice(0, 300) });

    let message = `ntfy 服务器响应错误 (HTTP ${response.status})`;
    if (response.status === 401 || response.status === 403) {
      message = "ntfy 提示权限不足或未授权，请检查 Topic 是否需要访问令牌 (Auth Token)。";
    } else if (response.status === 404) {
      message = "ntfy 目标地址不存在，请检查 Topic 名称或服务器地址。";
    } else if (response.status === 429) {
      message = "ntfy 请求过于频繁 (Rate Limited)，请稍后再试或换用更独特的 Topic 名称。";
    }
    return { ok: false, status: response.status, message };
  } catch (error) {
    console.error("ntfy push request failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message.slice(0, 200) : "",
    });
    return {
      ok: false,
      message:
        error instanceof Error && error.name === "TimeoutError"
          ? "请求 ntfy 超时，请检查网络或服务器地址。"
          : "连接 ntfy 服务器失败，请检查网络或地址。",
    };
  }
}

export async function notifyNtfySubscribers(
  env: OnlineEnv,
  userId: string,
  event: NotificationEvent,
) {
  const rows = await env.DB.prepare(
    "SELECT id, topic_url, auth_token FROM ntfy_subscribers WHERE user_id=? AND enabled=1",
  )
    .bind(userId)
    .all<{ id: string; topic_url: string; auth_token: string | null }>();
  if (!rows.results?.length) return;
  const description = eventDescription(event);
  const tag =
    event.kind === "waiting"
      ? "warning"
      : event.kind === "completed"
        ? "white_check_mark"
        : "statedock";
  await Promise.all(
    rows.results.map(async (sub) => {
      if (await shouldNotify(env, userId, "ntfy", sub.id, event)) {
        const res = await sendNtfy(
          sub.topic_url,
          `${formatTaskId(event)} · ${actions[event.kind]}`,
          `${formatTaskLabel(event)}\n${event.projectName}${description ? "\n" + description : ""}`,
          taskUrl(event),
          sub.auth_token,
          ["statedock", tag],
        );
        if (!res.ok) throw new Error("ntfy delivery failed");
      }
    }),
  );
}
