import { useEffect, useState } from "react";
import { api } from "../../api";
import { CompletedBy } from "../../CompletedBy";
import { useI18n } from "@/i18n/context";
import type { Plan, Project } from "@statedock/core";
import { ChevronRight } from "lucide-react";
import { statusAppearance } from "./status-appearance";
import "./task-card.css";

const agentNamesByProject = new Map<string, Map<string, string>>();
const agentNameRequests = new Map<string, Promise<Map<string, string>>>();

function loadAgentNames(projectId: string) {
  const cached = agentNamesByProject.get(projectId);
  if (cached) return Promise.resolve(cached);

  const pending = agentNameRequests.get(projectId);
  if (pending) return pending;

  const request = api<{ id: string; name: string }[]>(
    `/auth/agents?project=${encodeURIComponent(projectId)}`,
  )
    .then((agents) => {
      const names = new Map(agents.map((agent) => [agent.id, agent.name]));
      agentNamesByProject.set(projectId, names);
      return names;
    })
    .catch(() => new Map<string, string>())
    .finally(() => agentNameRequests.delete(projectId));

  agentNameRequests.set(projectId, request);
  return request;
}

export function TaskCard({
  plan,
  project,
  projectLabel,
  taskRef,
  selected = false,
  onOpen,
}: {
  plan: Plan;
  project?: Project;
  projectLabel?: string;
  taskRef?: string;
  selected?: boolean;
  onOpen: (plan: Plan) => void;
}) {
  const { t, lang } = useI18n();
  const [agentNames, setAgentNames] = useState<Map<string, string> | null>(null);
  const statusStyle = statusAppearance(plan.status);

  useEffect(() => {
    if (!plan.assignedAgentId) {
      setAgentNames(null);
      return;
    }

    let active = true;
    const refresh = () => {
      agentNamesByProject.delete(plan.projectId);
      setAgentNames(null);
      void loadAgentNames(plan.projectId).then((names) => {
        if (active) setAgentNames(names);
      });
    };
    void loadAgentNames(plan.projectId).then((names) => {
      if (active) setAgentNames(names);
    });
    window.addEventListener("statedock:agents-changed", refresh);
    return () => {
      active = false;
      window.removeEventListener("statedock:agents-changed", refresh);
    };
  }, [plan.projectId, plan.assignedAgentId]);

  const assignedName = plan.assignedAgentId
    ? (agentNames?.get(plan.assignedAgentId) ??
      (agentNames === null
        ? lang === "zh"
          ? "加载身份…"
          : "Loading identity…"
        : lang === "zh"
          ? "身份暂不可用"
          : "Identity unavailable"))
    : plan.status === "READY"
      ? lang === "zh"
        ? "未分配"
        : "Unassigned"
      : null;
  const date = new Date(plan.updatedAt).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US");
  const reference = taskRef ?? (project ? `${project.slug}-${plan.number}` : plan.reference);
  const description =
    plan.summary ||
    plan.body.split("\n").find((line) => line.trim()) ||
    t.app.dashboard.noDescription;

  return (
    <div className="task-card-container w-full">
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen(plan);
          }
        }}
        onClick={() => onOpen(plan)}
        className={`group flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-left shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${statusStyle.card} ${
          selected
            ? "border-primary ring-2 ring-primary/30"
            : "border-border/60 hover:border-primary/40 hover:shadow-xs"
        }`}
      >
        <div className="min-w-0 flex-1">
          {projectLabel && (
            <p className="mb-1 truncate text-[11px] font-medium text-muted-foreground">
              {projectLabel}
            </p>
          )}
          <div className="task-card-header">
            <span className="task-card-reference whitespace-nowrap font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
              {reference}
            </span>
            <div className="task-card-status flex items-center gap-1.5">
              <span className={`whitespace-nowrap text-xs font-semibold ${statusStyle.text}`}>
                {t.app.statuses[plan.status]}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
            <h3 className="task-card-title min-w-0 text-xs font-semibold leading-snug text-foreground group-hover:text-primary sm:text-sm">
              {plan.title}
            </h3>
          </div>

          {(assignedName || plan.status === "DONE") && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
              {assignedName && (
                <p className="text-xs text-muted-foreground">
                  {lang === "zh" ? "分配身份：" : "Assigned identity: "}
                  <span className="font-medium text-foreground/80">{assignedName}</span>
                </p>
              )}
              <CompletedBy plan={plan} />
            </div>
          )}

          <p className="task-card-copy mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
          <p className="mt-1.5 text-[11px] text-muted-foreground/70">
            {t.app.plans.updatedAt(date)}
          </p>
        </div>
      </div>
    </div>
  );
}
