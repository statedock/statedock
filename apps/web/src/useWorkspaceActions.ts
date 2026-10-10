import type { Plan, PlanStatus } from "@statedock/core";
import { api } from "./api";
import { apiErrorMessage } from "./api-error-message";
import { useI18n } from "./i18n/context";
const base = (id: string) => `/projects/${encodeURIComponent(id)}`;
export function useWorkspaceActions({
  projectId,
  selectedPlanNumber,
  setSaving,
  setError,
  refresh,
  setProjectId,
  setSelectedPlanNumber,
}: {
  projectId: string;
  selectedPlanNumber: number | null;
  setSaving: (value: boolean) => void;
  setError: (value: string) => void;
  refresh: () => Promise<void>;
  setProjectId: (value: string) => void;
  setSelectedPlanNumber: (value: number | null) => void;
}) {
  const { lang } = useI18n();
  const handleSavePlan = async (input: {
    title: string;
    body: string;
    summary: string | null;
    status: PlanStatus;
    expectedUpdatedAt: string;
  }) => {
    if (!selectedPlanNumber || !projectId) return false;
    setSaving(true);
    try {
      await api(`${base(projectId)}/plans/${selectedPlanNumber}`, "PATCH", input);
      setError("");
      await refresh();
      return true;
    } catch (e) {
      setError(apiErrorMessage(e, lang));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleStartPlan = async (reference: string) => {
    setSaving(true);
    try {
      await api(`/plans/${reference}/start`, "POST");
      await refresh();
    } catch (e) {
      setError(apiErrorMessage(e, lang));
    } finally {
      setSaving(false);
    }
  };

  const handleMovePlan = async (reference: string, targetProjectKey: string) => {
    setSaving(true);
    try {
      const moved = await api<Plan>(`/plans/${encodeURIComponent(reference)}/move`, "POST", {
        targetProject: targetProjectKey,
      });
      setError("");
      setProjectId(moved.projectId);
      setSelectedPlanNumber(moved.number);
      await refresh();
    } catch (e) {
      setError(apiErrorMessage(e, lang));
    } finally {
      setSaving(false);
    }
  };

  return { handleSavePlan, handleStartPlan, handleMovePlan };
}
