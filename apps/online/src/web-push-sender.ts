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
export async function sendWebPush(env: OnlineEnv, device: PushDevice, notice: PushNotice) {
  const config = webPushConfig(env);
  if (!config) throw new Error("web_push_not_configured");
  if (!validPushEndpoint(device.endpoint)) throw new Error("invalid_push_endpoint");
  const payload = await buildPushPayload(
    { data: { ...notice }, options: { ttl: 86400, urgency: "normal" } },
    {
      endpoint: device.endpoint,
      expirationTime: null,
      keys: { p256dh: device.p256dh, auth: device.auth },
    },
    config,
  );
  const response = await fetch(device.endpoint, {
    ...payload,
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  // No endpoint, keys, payload, or provider response in logs.
  await response.body?.cancel();
  if (response.status === 404 || response.status === 410) return "expired";
  if (!response.ok) throw new Error("web_push_delivery_failed");
  return "sent";
}
