import { formatTaskId, formatTaskLabel, type PlanEvent } from "@statedock/core";
export const eventLabels: Record<"en" | "zh", Record<PlanEvent["kind"], string>> = {
  en: {
    created: "New Task",
    started: "Started",
    completed: "Completed",
    dropped: "Dropped",
    waiting: "Waiting",
  },
  zh: {
    created: "新任务",
    started: "开始执行",
    completed: "已完成",
    dropped: "决定不做",
    waiting: "等待处理",
  },
};
export function formatEventId(event: PlanEvent): string {
  return formatTaskId(event);
}
export function notificationText(event: PlanEvent, lang: "en" | "zh" = "en") {
  const labels = eventLabels[lang] || eventLabels.en;
  return { title: `StateDock · ${labels[event.kind] || event.kind}`, body: formatTaskLabel(event) };
}
// Defensively deduplicate even if polling responses overlap or arrive unordered.
export function freshEvents(events: PlanEvent[], cursor: number) {
  return [
    ...new Map(events.filter((e) => e.sequence > cursor).map((e) => [e.sequence, e])).values(),
  ].sort((a, b) => a.sequence - b.sequence);
}
