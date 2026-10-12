import { ReadyExecution } from "../../ReadyExecution";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Plan, PlanStatus, Project } from "@statedock/core";
import { Search } from "lucide-react";
import { BatchExecution } from "../../BatchExecution";
import { TaskDetail } from "./TaskDetail";
import { TaskList } from "./TaskList";

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

interface Props {
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
    expectedUpdatedAt: string;
  }) => Promise<void | boolean>;
  onStartPlan: (reference: string) => Promise<void>;
  onMovePlan?: (reference: string, targetProjectKey: string) => Promise<void>;
  onNewPlan: (status: PlanStatus) => void;
  saving: boolean;
}

import { usePlanBoard } from "./usePlanBoard";
export function PlanBoard({
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
  const model = usePlanBoard({
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
  });
  const {
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
    dirty,
    setDirty,
    baseline,
    parsedHandoff,
    currentBlocker,
    resetForm,
    handleSave,
    handleStart,
    filteredPlans,
  } = model;
  return (
    <div className="space-y-4">
      <ReadyExecution key={`ready-${project.id}`} project={project} />
      <BatchExecution key={project.id} project={project} plans={plans} />
      {/* Top Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-sm">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <Button
            variant={filter === "ALL" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setFilter("ALL")}
            className="h-8 text-xs shrink-0"
          >
            {pI18n.filterAll} ({plans.length})
          </Button>
          {states.map((s) => {
            const count = plans.filter((p) => p.status === s).length;
            return (
              <Button
                key={s}
                variant={filter === s ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setFilter(s)}
                className="h-8 text-xs shrink-0"
              >
                <Badge
                  variant={statusBadgeVariant[s]}
                  className="mr-1 px-1 py-0 text-[10px] whitespace-nowrap"
                >
                  {getStatusLabel(s)}
                </Badge>
                {count > 0 && <span className="text-muted-foreground">{count}</span>}
              </Button>
            );
          })}
        </div>

        <label className="text-xs">
          <span className="sr-only">{lang === "zh" ? "按身份筛选" : "Filter by identity"}</span>
          <select
            value={model.agentFilter}
            onChange={(e) => model.setAgentFilter(e.target.value)}
            className="h-8 max-w-full rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="ALL">{lang === "zh" ? "全部身份" : "All identities"}</option>
            <option value="UNASSIGNED">{lang === "zh" ? "未分配" : "Unassigned"}</option>
            {model.agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        {/* Search and Sort */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-60">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={pI18n.searchTask}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "updated" | "number")}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring shrink-0"
          >
            <option value="updated">{pI18n.sortUpdated}</option>
            <option value="number">{pI18n.sortNumber}</option>
          </select>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left List Column */}
        <TaskList model={model} />

        {/* Right Detail Column */}
        {selectedPlan && <TaskDetail model={model} />}
      </div>
    </div>
  );
}
