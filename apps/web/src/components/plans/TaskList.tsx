import { TaskCard } from "./TaskCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Plan, PlanStatus, Project } from "@statedock/core";
import { HelpCircle, Plus } from "lucide-react";

const states: PlanStatus[] = ["WORKING", "READY", "PLAN", "WAITING", "DONE", "DROPPED"];

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
    pI18n,
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
        filteredPlans.map((plan) => (
          <TaskCard
            key={plan.id}
            plan={plan}
            project={project}
            selected={plan.number === selectedNumber}
            onOpen={(selectedPlan) => {
              setDirty(false);
              onSelectPlan(selectedPlan);
            }}
          />
        ))
      )}
    </div>
  );
}
