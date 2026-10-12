import type { Plan, PlanStatus } from "@statedock/core";
import React, { useRef, useState } from "react";
import { parseBlocker, parseHandoffSummary } from "./task-summary";
export type TaskSaveInput = {
  title: string;
  body: string;
  summary: string | null;
  status: PlanStatus;
  assignedAgentId?: string | null;
  expectedUpdatedAt: string;
};
export function useTaskDraft(
  selectedPlan: Plan | null,
  onSavePlan: (input: TaskSaveInput) => Promise<void | boolean>,
  onStartPlan: (reference: string) => Promise<void>,
) {
  // Detail form local state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState<PlanStatus>("PLAN");
  const [assignedAgentId, setAssignedAgentId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [baseline, setBaseline] = useState("");

  const parsedHandoff = parseHandoffSummary(summary);
  const currentBlocker =
    selectedPlan?.status === "WAITING" ? parseBlocker(selectedPlan.body) : null;

  const selectedId = useRef<string | null>(null);
  React.useEffect(() => {
    if (selectedPlan) {
      if (!dirty || selectedId.current !== selectedPlan.id) {
        selectedId.current = selectedPlan.id;
        setDirty(false);
        setTitle(selectedPlan.title);
        setBody(selectedPlan.body || "");
        setSummary(selectedPlan.summary || "");
        setStatus(selectedPlan.status);
        setAssignedAgentId(selectedPlan.assignedAgentId ?? null);
        setBaseline(selectedPlan.updatedAt);
      }
    } else {
      setDirty(false);
    }
  }, [selectedPlan, dirty]);

  const resetForm = () => {
    if (!selectedPlan) return;
    setTitle(selectedPlan.title);
    setBody(selectedPlan.body || "");
    setSummary(selectedPlan.summary || "");
    setStatus(selectedPlan.status);
    setAssignedAgentId(selectedPlan.assignedAgentId ?? null);
    setBaseline(selectedPlan.updatedAt);
    setDirty(false);
  };

  const handleSave = async () => {
    if (!selectedPlan) return;
    const saved = await onSavePlan({
      title: title.trim(),
      body: body.trim(),
      summary: summary.trim() ? summary.trim() : null,
      status,
      ...(assignedAgentId !== (selectedPlan.assignedAgentId ?? null) ? { assignedAgentId } : {}),
      expectedUpdatedAt: baseline,
    });
    if (saved !== false) setDirty(false);
  };

  const handleStart = async () => {
    if (!selectedPlan) return;
    await onStartPlan(selectedPlan.reference);
  };

  return {
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
  };
}
