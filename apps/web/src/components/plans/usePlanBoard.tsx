import { useI18n } from "@/i18n/context";
import type { Plan, PlanStatus, Project } from "@statedock/core";
import { api } from "../../api";
import { useEffect, useState } from "react";
import { useTaskDraft } from "../../useTaskDraft";

const states: PlanStatus[] = ["WORKING", "READY", "PLAN", "WAITING", "DONE", "DROPPED"];

const statusBadgeVariant: Record<
  PlanStatus,
  "plan" | "ready" | "working" | "waiting" | "done" | "dropped"
> = {
  PLAN: "plan",
  READY: "ready",
  WORKING: "working",
  WAITING: "waiting",
  DONE: "done",
  DROPPED: "dropped",
};

export { parseBlocker, parseHandoffSummary } from "../../task-summary";

export interface Props {
  project: Project;
  projects?: Project[];
  plans: Plan[];
  selectedNumber: number | null;
  onSelectPlan: (plan: Plan) => void;
  onCloseDetail: () => void;
  onSavePlan: (input: {
    title: string;
    body: string;
    summary: string | null;
    status: PlanStatus;
    assignedAgentId?: string | null;
    expectedUpdatedAt: string;
  }) => Promise<void | boolean>;
  onStartPlan: (reference: string) => Promise<void>;
  onMovePlan?: (reference: string, targetProjectKey: string) => Promise<void>;
  onNewPlan: (status: PlanStatus) => void;
  saving: boolean;
}

export function usePlanBoard({
  project,
  projects,
  plans,
  selectedNumber,
  onSelectPlan,
  onCloseDetail,
  onSavePlan,
  onStartPlan,
  onMovePlan,
  onNewPlan,
  saving,
}: Props) {
  const { t, lang } = useI18n();
  const pI18n = t.app.plans;
  const getStatusLabel = (s: PlanStatus) => t.app.statuses[s];

  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [agentsError, setAgentsError] = useState("");
  const [agentFilter, setAgentFilter] = useState("ALL");
  useEffect(() => {
    let active = true;
    setAgents([]);
    setAgentsError("");
    setAgentFilter("ALL");
    const load = () => {
      api<{ id: string; name: string }[]>(`/auth/agents?project=${encodeURIComponent(project.id)}`)
        .then((rows) => {
          if (active) {
            setAgents(rows);
            setAgentsError("");
            setAgentFilter((value) =>
              value === "ALL" || value === "UNASSIGNED" || rows.some((a) => a.id === value)
                ? value
                : "ALL",
            );
          }
        })
        .catch((error) => {
          if (active) setAgentsError((error as Error).message);
        });
    };
    load();
    window.addEventListener("statedock:agents-changed", load);
    return () => {
      active = false;
      window.removeEventListener("statedock:agents-changed", load);
    };
  }, [project.id]);
  const [filter, setFilter] = useState<string>("ALL");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"updated" | "number">("updated");

  const selectedPlan = plans.find((p) => p.number === selectedNumber) ?? null;

  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const {
    title,
    setTitle,
    body,
    setBody,
    summary,
    setSummary,
    status,
    setStatus,
    assignedAgentId,
    setAssignedAgentId,
    dirty,
    setDirty,
    baseline,
    parsedHandoff,
    currentBlocker,
    resetForm,
    handleSave,
    handleStart,
  } = useTaskDraft(selectedPlan, onSavePlan, onStartPlan);
  const filteredPlans = plans
    .filter((p) => {
      const matchFilter = filter === "ALL" || p.status === filter;
      const natural = `${project.slug}-${p.number} ${project.slug}${p.number} #${p.number}`;
      const matchQuery =
        !query ||
        `${natural} ${p.reference} ${p.title} ${p.body} ${p.summary ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase());
      const matchAgent =
        agentFilter === "ALL" ||
        (agentFilter === "UNASSIGNED" ? !p.assignedAgentId : p.assignedAgentId === agentFilter);
      return matchFilter && matchQuery && matchAgent;
    })
    .sort((a, b) =>
      sort === "number" ? a.number - b.number : b.updatedAt.localeCompare(a.updatedAt),
    );

  return {
    agents,
    agentsError,
    agentFilter,
    setAgentFilter,
    project,
    projects,
    plans,
    selectedNumber,
    onSelectPlan,
    onCloseDetail,
    onSavePlan,
    onStartPlan,
    onMovePlan,
    onNewPlan,
    saving,
    t,
    lang,
    pI18n,
    getStatusLabel,
    filter,
    setFilter,
    query,
    setQuery,
    sort,
    setSort,
    selectedPlan,
    copiedPrompt,
    setCopiedPrompt,
    title,
    setTitle,
    body,
    setBody,
    summary,
    setSummary,
    status,
    setStatus,
    assignedAgentId,
    setAssignedAgentId,
    dirty,
    setDirty,
    baseline,
    parsedHandoff,
    currentBlocker,
    resetForm,
    handleSave,
    handleStart,
    filteredPlans,
  };
}
