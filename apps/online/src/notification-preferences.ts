import { formatTaskId, formatTaskLabel } from "@statedock/core";
import type { OnlineEnv } from "./auth.js";
export { formatTaskId, formatTaskLabel };
export type Channel = "bark" | "telegram" | "discord" | "ntfy" | "webhook";
export type NotificationKind = "created" | "started" | "completed" | "waiting" | "dropped";
export interface NotificationEvent {
  appOrigin?: string;
  projectId: string;
  projectName: string;
  projectSlug?: string;
  number: number;
  reference: string;
  title: string;
  kind: NotificationKind;
  summary?: string | null;
  reason?: string;
  isNew?: boolean;
}
export const actions: Record<NotificationKind, string> = {
  created: "新建任务",
  started: "任务已开始",
  completed: "任务已完成",
  waiting: "需要你介入",
  dropped: "任务已取消",
};
export const defaultPreferences = {
  enabled: true,
  projectIds: null as string[] | null,
  events: ["completed", "waiting"] as NotificationKind[],
};
export async function preferences(
  env: OnlineEnv,
  userId: string,
  channel: Channel,
  connectionId: string,
) {
  const row = await env.DB.prepare(
    "SELECT enabled,project_ids,events FROM notification_preferences WHERE user_id=? AND channel=? AND connection_id=?",
  )
    .bind(userId, channel, connectionId)
    .first<{ enabled: number; project_ids: string; events: string }>();
  return row
    ? {
        enabled: !!row.enabled,
        projectIds: JSON.parse(row.project_ids) as string[] | null,
        events: JSON.parse(row.events) as NotificationKind[],
      }
    : defaultPreferences;
}
export async function shouldNotify(
  env: OnlineEnv,
  userId: string,
  channel: Channel,
  connectionId: string,
  event: NotificationEvent,
) {
  const pref = await preferences(env, userId, channel, connectionId);
  return (
    pref.enabled &&
    (pref.events.includes(event.kind) || (!!event.isNew && pref.events.includes("created"))) &&
    (pref.projectIds === null || pref.projectIds.includes(event.projectId))
  );
}
export function taskUrl(event: NotificationEvent) {
  return `${event.appOrigin ?? "http://localhost:8787"}/?project=${encodeURIComponent(event.projectId)}&task=${encodeURIComponent(event.reference)}`;
}
export function eventDescription(event: NotificationEvent) {
  return (
    event.kind === "waiting"
      ? event.reason || "请打开任务查看需要决定的事项。"
      : event.summary || ""
  ).slice(0, 400);
}
