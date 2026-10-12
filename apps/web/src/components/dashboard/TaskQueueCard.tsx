import { useEffect, useState } from "react";
import { api } from "../../api";
import { ReadyExecution } from "../../ReadyExecution";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useI18n } from "@/i18n/context";
import type { Plan, Project } from "@statedock/core";
import { Clock, ChevronRight } from "lucide-react";
export function TaskQueueCard({
  status,
  plans,
  project,
  onPlan,
  onTab,
}: {
  status: "PLAN" | "READY";
  plans: Plan[];
  project: Project;
  onPlan: (p: Plan) => void;
  onTab: (tab: string) => void;
}) {
  const { t, lang } = useI18n();
  const d = t.app.dashboard;
  const s = t.app.statuses;
  const queue = plans
    .filter((p) => p.status === status)
    .sort((a, b) =>
      status === "READY" ? a.number - b.number : b.updatedAt.localeCompare(a.updatedAt),
    );
  const needsIdentityNames = status === "READY" && queue.some((p) => p.assignedAgentId);
  const [identities, setIdentities] = useState<{
    projectId: string;
    state: "loading" | "ready" | "error";
    rows: { id: string; name: string }[];
  }>({ projectId: "", state: "loading", rows: [] });
  useEffect(() => {
    if (!needsIdentityNames) return;
    let active = true;
    const load = () => {
      setIdentities({ projectId: project.id, state: "loading", rows: [] });
      api<{ id: string; name: string }[]>(`/auth/agents?project=${encodeURIComponent(project.id)}`)
        .then((rows) => {
          if (active) setIdentities({ projectId: project.id, state: "ready", rows });
        })
        .catch(() => {
          if (active) setIdentities({ projectId: project.id, state: "error", rows: [] });
        });
    };
    load();
    window.addEventListener("statedock:agents-changed", load);
    return () => {
      active = false;
      window.removeEventListener("statedock:agents-changed", load);
    };
  }, [project.id, needsIdentityNames]);
  const identityName = (plan: Plan) => {
    if (!plan.assignedAgentId) return lang === "zh" ? "未分配" : "Unassigned";
    if (identities.projectId !== project.id || identities.state === "loading")
      return lang === "zh" ? "加载身份…" : "Loading identity…";
    return (
      identities.rows.find((a) => a.id === plan.assignedAgentId)?.name ??
      (lang === "zh" ? "身份暂不可用" : "Identity unavailable")
    );
  };
  const visible = queue.slice(0, 5);
  const total = queue.length;
  return (
    <Card className="border-border/60 shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between gap-2 p-4 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="h-4 w-4 shrink-0 text-sky-500" />
          <CardTitle className="text-sm sm:text-base font-semibold truncate">{s[status]}</CardTitle>
          <span className="hidden sm:inline text-xs text-muted-foreground">
            {status === "READY" ? d.readyAgent : d.plannedAgent}
          </span>
          <Badge variant="secondary" className="font-mono text-xs shrink-0">
            {total}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onTab("plans")}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          {d.planAndExecute}
          <ChevronRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-2.5 p-4 pt-0">
        {status === "READY" && <ReadyExecution project={project} />}
        {visible.length ? (
          <>
            {visible.map((plan) => (
              <div
                key={plan.id}
                onClick={() => onPlan(plan)}
                className="group flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border/50 bg-card p-3 transition-colors hover:border-sky-500/40 hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-sky-600 dark:text-sky-400 whitespace-nowrap shrink-0">
                      {project.slug}-{plan.number}
                    </span>
                    <h4 className="truncate text-xs sm:text-sm font-medium text-foreground group-hover:text-sky-500">
                      {plan.title}
                    </h4>
                    <Badge
                      variant={status === "READY" ? "ready" : "plan"}
                      className="ml-auto shrink-0 whitespace-nowrap text-[10px]"
                    >
                      {s[status]}
                    </Badge>
                  </div>
                  {status === "READY" && (
                    <p className="text-xs font-medium text-foreground/80">
                      {lang === "zh" ? "分配身份：" : "Assigned Identity: "}
                      {identityName(plan)}
                    </p>
                  )}
                  <p className="line-clamp-2 text-xs text-muted-foreground leading-relaxed">
                    {plan.body.split("\n").find((line) => line.trim()) || d.noDiscussionBackground}
                  </p>
                </div>
              </div>
            ))}
            {total > visible.length && (
              <button
                onClick={() => onTab("plans")}
                className="flex w-full items-center justify-center gap-1 rounded-md py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <span>
                  {(status === "READY" ? d.moreReady : d.morePlanned)(total - visible.length)}
                </span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        ) : (
          <div className="py-5 text-center text-xs text-muted-foreground">
            {status === "READY" ? d.noReady : d.noPlanned}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
