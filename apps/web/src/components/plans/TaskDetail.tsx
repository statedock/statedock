import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatProjectName } from "@/lib/project";
import type { Plan, PlanStatus, Project } from "@statedock/core";
import { AlertCircle, Check, FolderGit2, Play, RotateCcw, Sparkles, X } from "lucide-react";
import { Attachments } from "../../Attachments";
import { TaskFollowUp } from "../../TaskFollowUp";

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
export function TaskDetail({ model }: { model: ReturnType<typeof usePlanBoard> }) {
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
  if (!selectedPlan) return null;
  return (
    <div className="lg:col-span-7">
      <Card className="border-border/60 shadow-md sticky top-20">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-blue-500">
                {project.slug}-{selectedPlan.number}
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                (#{selectedPlan.number} · {selectedPlan.reference})
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{pI18n.boardSubtitle}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const prompt =
                  lang === "zh"
                    ? `请读取 StateDock 任务 ${project.slug}-${selectedPlan.number}（${selectedPlan.title}），开始实施并同步状态。`
                    : `Please read StateDock task ${project.slug}-${selectedPlan.number} ("${selectedPlan.title}"), begin implementation, and sync status.`;
                void navigator.clipboard.writeText(prompt);
                setCopiedPrompt(true);
                setTimeout(() => setCopiedPrompt(false), 2000);
              }}
              className="h-8 px-2.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700"
              title={pI18n.copyDirectiveTitle}
            >
              {copiedPrompt ? (
                <>
                  <Check className="mr-1 h-3.5 w-3.5 text-emerald-500" />
                  <span>{pI18n.directiveCopied}</span>
                </>
              ) : (
                <>
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  <span>{pI18n.copyDirective}</span>
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onCloseDetail}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-5">
          {/* Project mover / classifier */}
          {projects && projects.length > 1 && onMovePlan && (
            <div
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
                project.slug === "inbox"
                  ? "border-blue-500/40 bg-blue-500/10 text-blue-900 dark:text-blue-200"
                  : "border-border/60 bg-muted/20 text-muted-foreground"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <FolderGit2 className="h-4 w-4 shrink-0 text-blue-500" />
                <span className="truncate">
                  {project.slug === "inbox" ? (
                    <strong className="font-semibold text-blue-900 dark:text-blue-200">
                      {pI18n.inboxClassify}
                    </strong>
                  ) : (
                    <span>
                      {pI18n.inboxBelongsTo}
                      <strong className="text-foreground ml-1">
                        {formatProjectName(project, t.app.nav.inbox)}
                      </strong>
                    </span>
                  )}
                </span>
              </div>
              <select
                value={project.id}
                onChange={(e) => {
                  const target = e.target.value;
                  if (target && target !== project.id) {
                    void onMovePlan(selectedPlan.reference, target);
                  }
                }}
                disabled={saving}
                className="rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer shrink-0"
              >
                <option value={project.id} disabled>
                  {project.slug === "inbox" ? pI18n.inboxSelectProject : pI18n.inboxMoveOther}
                </option>
                {projects
                  .filter((p) => p.id !== project.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {formatProjectName(p, t.app.nav.inbox)} ({p.slug})
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Conflict warning if updated remotely */}
          {dirty && baseline !== selectedPlan.updatedAt && (
            <div className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              <span>{pI18n.remoteUpdateAlert}</span>
              <Button variant="outline" size="sm" onClick={resetForm} className="h-7 text-xs">
                <RotateCcw className="mr-1 h-3 w-3" />
                {pI18n.reload}
              </Button>
            </div>
          )}

          {/* Blocker alert if WAITING */}
          {currentBlocker && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>{pI18n.blockerAlert}</span>
              </div>
              <p className="pl-5 text-amber-700 dark:text-amber-300 leading-relaxed font-mono text-[11px]">
                {currentBlocker}
              </p>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">{pI18n.titleLabel}</label>
            <Input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirty(true);
              }}
              placeholder={pI18n.titlePlaceholder}
              className="text-sm font-medium"
            />
          </div>

          {/* Status selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">{pI18n.statusLabel}</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {states.map((s) => {
                const isActive = status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setStatus(s);
                      setDirty(true);
                    }}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-all ${
                      isActive
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Badge variant={statusBadgeVariant[s]} className="px-1 py-0 text-[10px]">
                      {getStatusLabel(s)}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Discussion & Decisions (body) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground">
                {pI18n.discussionSection}
              </label>
              <span className="text-[11px] text-muted-foreground">{pI18n.discussionSubtitle}</span>
            </div>
            <Textarea
              rows={7}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setDirty(true);
              }}
              placeholder={pI18n.discussionPlaceholder}
              className="font-mono text-xs leading-relaxed"
            />
          </div>

          {/* Final Outcome Summary (summary) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-foreground">
                  {pI18n.handoffSection}
                </label>
                {parsedHandoff && (
                  <Badge
                    variant="outline"
                    className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10 py-0"
                  >
                    {pI18n.threePartContract}
                  </Badge>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  const template =
                    lang === "zh" ? "变更：；验证：；注意：" : "Changes: ; Verification: ; Notes: ";
                  if (!summary.trim()) {
                    setSummary(template);
                  } else if (!summary.includes("变更：") && !summary.includes("Changes:")) {
                    setSummary(
                      lang === "zh"
                        ? `变更：${summary}；验证：；注意：`
                        : `Changes: ${summary}; Verification: ; Notes: `,
                    );
                  }
                  setDirty(true);
                }}
                className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                {pI18n.insertTemplate}
              </button>
            </div>

            {parsedHandoff && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2 text-xs">
                {parsedHandoff.changes && (
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-emerald-700 dark:text-emerald-300 shrink-0">
                      {pI18n.changes}
                    </span>
                    <span className="text-foreground leading-relaxed">{parsedHandoff.changes}</span>
                  </div>
                )}
                {parsedHandoff.verification && (
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-emerald-700 dark:text-emerald-300 shrink-0">
                      {pI18n.verification}
                    </span>
                    <span className="text-foreground leading-relaxed">
                      {parsedHandoff.verification}
                    </span>
                  </div>
                )}
                {parsedHandoff.nextSteps && (
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-emerald-700 dark:text-emerald-300 shrink-0">
                      {pI18n.notes}
                    </span>
                    <span className="text-foreground leading-relaxed">
                      {parsedHandoff.nextSteps}
                    </span>
                  </div>
                )}
              </div>
            )}

            <Textarea
              rows={parsedHandoff ? 2 : 3}
              value={summary}
              onChange={(e) => {
                setSummary(e.target.value);
                setDirty(true);
              }}
              placeholder={pI18n.handoffPlaceholder}
              className="text-xs leading-relaxed"
            />
            <p className="text-[11px] text-muted-foreground">{pI18n.handoffDesc}</p>
          </div>

          <Attachments key={selectedPlan.id} reference={selectedPlan.reference} />
          <TaskFollowUp key={`follow-${selectedPlan.id}`} plan={selectedPlan} />
          {/* Footer Actions */}
          <div className="flex items-center justify-between border-t border-border/40 pt-4">
            <div>
              {(selectedPlan.status === "PLAN" || selectedPlan.status === "READY") && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={saving}
                  onClick={handleStart}
                  className="text-xs font-medium text-blue-600 dark:text-blue-400"
                >
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  {pI18n.markInProgress}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {dirty && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetForm}
                  disabled={saving}
                  className="text-xs"
                >
                  {pI18n.discard}
                </Button>
              )}
              <Button
                size="sm"
                disabled={saving || !dirty || !title.trim()}
                onClick={handleSave}
                className="text-xs"
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                {saving ? pI18n.save : pI18n.saveChanges}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
