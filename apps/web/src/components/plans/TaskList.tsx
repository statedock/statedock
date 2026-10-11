import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Plan, PlanStatus, Project } from "@statedock/core";
import { AlertCircle, Check, ChevronRight, HelpCircle, Plus } from "lucide-react";

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

import { parseBlocker } from "../../task-summary";
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
export function TaskList({ model }: { model: ReturnType<typeof usePlanBoard> }) {
  const {
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
    <div
      className={`min-w-0 space-y-2.5 ${selectedPlan ? "hidden lg:block lg:col-span-5 lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:overscroll-contain" : "lg:col-span-12"}`}
    >
      {filteredPlans.length === 0 ? (
        <Card className="border-border/60 py-12 text-center shadow-sm">
          <CardContent className="space-y-3">
            <HelpCircle className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">{pI18n.noMatchTitle}</p>
            <p className="text-xs text-muted-foreground">
              {plans.length === 0 ? pI18n.noMatchDescEmpty : pI18n.noMatchDescFilter}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNewPlan("WORKING")}
              className="mt-2 text-xs"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {pI18n.createFirstGoal}
            </Button>
          </CardContent>
        </Card>
      ) : (
        filteredPlans.map((plan) => {
          const isSelected = plan.number === selectedNumber;
          return (
            <div
              key={plan.id}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectPlan(plan);
                }
              }}
              onClick={() => {
                setDirty(false);
                onSelectPlan(plan);
              }}
              className={`group relative flex cursor-pointer items-start justify-between gap-3 rounded-xl border p-4 transition-all shadow-sm ${
                isSelected
                  ? "border-blue-500/60 bg-blue-500/[0.04] ring-1 ring-blue-500/20"
                  : "border-border/60 bg-card hover:border-border hover:bg-muted/40"
              }`}
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap shrink-0">
                    {project.slug}-{plan.number}
                  </span>
                  <h4 className="truncate text-xs sm:text-sm font-semibold text-foreground group-hover:text-primary">
                    {plan.title}
                  </h4>
                  <Badge
                    variant={statusBadgeVariant[plan.status]}
                    className="ml-auto shrink-0 whitespace-nowrap text-[10px]"
                  >
                    {getStatusLabel(plan.status)}
                  </Badge>
                </div>
                {/* Summary / Body snippet */}
                <p className="line-clamp-2 text-xs text-muted-foreground leading-relaxed">
                  {plan.summary || plan.body.split("\n").find((l) => l.trim()) || pI18n.noDetail}
                </p>
                <div className="flex items-center gap-3 pt-1 text-[11px] text-muted-foreground/70">
                  <span>
                    {pI18n.updatedAt(
                      new Date(plan.updatedAt).toLocaleDateString(
                        lang === "zh" ? "zh-CN" : "en-US",
                      ),
                    )}
                  </span>
                  {plan.summary && (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <Check className="h-3 w-3" />{" "}
                      {plan.summary.includes("变更：") || plan.summary.includes("Changes:")
                        ? pI18n.contractBadge
                        : pI18n.summaryBadge}
                    </span>
                  )}
                  {plan.status === "WAITING" && parseBlocker(plan.body) && (
                    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                      <AlertCircle className="h-3 w-3 shrink-0" /> {pI18n.blockedBadge}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight
                className={`h-4 w-4 shrink-0 transition-transform ${
                  isSelected
                    ? "text-blue-500 translate-x-0.5"
                    : "text-muted-foreground/40 group-hover:text-muted-foreground"
                }`}
              />
            </div>
          );
        })
      )}
    </div>
  );
}
