import { buildPushPayload } from "@block65/webcrypto-web-push";
import type { OnlineEnv } from "./auth.js";
import {
  formatTaskLabel,
  eventDescription,
  type NotificationEvent,
} from "./notification-preferences.js";
import { webPushConfig, validPushEndpoint } from "./web-push-config.js";
export interface PushDevice {
  endpoint: string;
  p256dh: string;
  auth: string;
  language: string;
  user_id: string;
}
export interface PushNotice {
  eventId: string;
  userId: string;
  title: string;
  body: string;
  projectId?: string;
  reference?: string;
}
const actionsEn = {
  created: "Task created",
  started: "Task started",
  completed: "Task completed",
  waiting: "Needs your input",
  dropped: "Task dropped",
};
const actionsZh = {
  created: "新建任务",
  started: "任务已开始",
  completed: "任务已完成",
  waiting: "需要你介入",
  dropped: "任务已取消",
};
export function pushNotice(
  event: NotificationEvent,
  eventId: number,
  device: PushDevice,
): PushNotice {
  const zh = device.language === "zh";
  return {
    eventId: String(eventId),
    userId: device.user_id,
    projectId: event.projectId,
    reference: event.reference,
    title: `StateDock · ${(zh ? actionsZh : actionsEn)[event.kind]}`,
    body: `${formatTaskLabel(event).slice(0, 180)}${event.summary || event.reason ? "\n" + eventDescription(event) : ""}`,
  };
}
export class WebPushDeliveryError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export async function sendWebPush(env: OnlineEnv, device: PushDevice, notice: PushNotice) {
  const config = webPushConfig(env);
  if (!config) throw new Error("web_push_not_configured");
  if (!validPushEndpoint(device.endpoint)) throw new Error("invalid_push_endpoint");
  let payload;
  try {
    payload = await buildPushPayload(
      { data: { ...notice }, options: { ttl: 86400, urgency: "normal" } },
      {
        endpoint: device.endpoint,
        expirationTime: null,
        keys: { p256dh: device.p256dh, auth: device.auth },
      },
      config,
    );
  } catch (error) {
    console.warn("Web Push encryption failed", {
      type: error instanceof Error ? error.name : "unknown",
    });
    throw new WebPushDeliveryError("push_encryption_failed");
  }
  let response: Response;
  try {
    response = await fetch(device.endpoint, {
      ...payload,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    console.warn("Web Push provider connection failed");
    throw new WebPushDeliveryError("push_provider_unreachable");
  }
  // Only reviewed provider reason codes are logged; never endpoints, keys or task payloads.
  if (response.status === 404 || response.status === 410) {
    await response.body?.cancel();
    return "expired";
  }
  if (!response.ok) {
    let reason = "unavailable";
    const reviewed = new Set([
      "BadJwtToken",
      "BadVapidPublicKey",
      "BadAuthorizationHeader",
      "BadTtl",
      "BadUrgency",
      "BadTopic",
      "BadPayload",
      "PayloadTooLarge",
      "Forbidden",
      "TooManyRequests",
    ]);
    try {
      const data = (await response.json()) as { reason?: string };
      if (data.reason && reviewed.has(data.reason)) reason = data.reason;
    } catch {
      /* Non-JSON vendor errors contain no safe diagnostics. */
    }
    console.warn("Web Push provider rejected request", { status: response.status, reason });
    throw new WebPushDeliveryError(
      response.status === 401 || response.status === 403
        ? "push_auth_failed"
        : "push_provider_rejected",
    );
  }
  await response.body?.cancel();
  return "sent";
}
