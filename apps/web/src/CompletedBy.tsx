import type { Plan } from "@statedock/core";
import { useI18n } from "@/i18n/context";
export function CompletedBy({ plan, details = false }: { plan: Plan; details?: boolean }) {
  const { lang } = useI18n();
  if (plan.status !== "DONE") return null;
  const actor = plan.completedBy;
  const label =
    actor?.name ||
    (actor
      ? lang === "zh"
        ? actor.type === "human"
          ? "用户"
          : "Agent"
        : actor.type === "human"
          ? "User"
          : "Agent"
      : lang === "zh"
        ? "未记录"
        : "Not recorded");
  const identityId = actor?.agentId ?? actor?.id;
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p>
        {lang === "zh" ? "完成者：" : "Completed by: "}
        <span className="font-medium text-foreground/80">{label}</span>
      </p>
      {details && actor && (
        <>
          <p>
            {lang === "zh" ? "身份类型：" : "Identity type: "}
            {actor.type === "human"
              ? lang === "zh"
                ? "用户"
                : "User"
              : lang === "zh"
                ? "Agent 身份"
                : "Agent identity"}
          </p>
          <p className="break-all">
            {lang === "zh" ? "身份 ID：" : "Identity ID: "}
            <code className="select-all">{identityId}</code>
          </p>
        </>
      )}
    </div>
  );
}
