import { TaskQueueCard } from "./TaskQueueCard";
import { TaskCard } from "../plans/TaskCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/context";
import type { Activity, MarkdownFile, Plan, PlanStatus, Project } from "@statedock/core";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clock,
  Copy,
  FileText,
  FolderGit2,
  Plus,
} from "lucide-react";
import React from "react";

interface Props {
  project: Project;
  plans: Plan[];
  files: MarkdownFile[];
  activity?: Activity[];
  onPlan: (plan: Plan) => void;
  onTab: (tab: string) => void;
  onSettings: () => void;
  onFile: (path: string) => void;
  onNewFile: () => void;
  onNewPlan?: (status: PlanStatus) => void;
}

export function Dashboard({
  project,
  plans,
  files,
  onPlan,
  onTab,
  onSettings,
  onFile,
  onNewFile,
}: Props) {
  const { t, lang } = useI18n();
  const d = t.app.dashboard;
  const formatDate = (value: string) =>
    new Date(value).toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  const waiting = plans
    .filter((p) => p.status === "WAITING")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const working = plans
    .filter((p) => p.status === "WORKING")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);
  const recentDone = plans
    .filter((p) => p.status === "DONE")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);

  const [copied, setCopied] = React.useState(false);
  const copyPath = () => {
    if (!project.localPath) return;
    navigator.clipboard.writeText(project.localPath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-5">
      {/* Project Local Path banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border border-border/60 bg-muted/30 p-3.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 overflow-hidden min-w-0">
          <FolderGit2 className="h-4 w-4 shrink-0 text-blue-500" />
          <span className="font-semibold text-foreground shrink-0">{d.localPathLabel}</span>
          <span className="truncate font-mono text-[11px] text-foreground/80">
            {project.localPath || d.localPathEmpty}
          </span>
          {project.localPath && (
            <button
              onClick={copyPath}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground shrink-0"
              title={d.copyPath}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSettings}
          className="h-7 self-start sm:self-auto text-xs shrink-0"
        >
          {project.localPath ? d.editSettings : d.linkDirectory}
        </Button>
      </div>

      {/* 1. WAITING */}
      {waiting.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between gap-2 p-4 pb-3">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-500 animate-pulse" />
              <CardTitle className="text-sm sm:text-base font-semibold text-amber-600 dark:text-amber-400">
                {d.needsAttention}
              </CardTitle>
              <Badge
                variant="outline"
                className="border-amber-500/40 font-mono text-xs text-amber-600 dark:text-amber-400 shrink-0"
              >
                {waiting.length}
              </Badge>
              <span className="hidden sm:inline text-xs text-muted-foreground">
                {d.needsAttentionDesc}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onTab("plans")}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              {d.viewAll}
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0">
            {waiting.map((plan) => (
              <TaskCard key={plan.id} plan={plan} project={project} onOpen={onPlan} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Grid: 2 columns on desktop, 1 on mobile */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left Column (2 spans): Active Work & Ideas */}
        <div className="space-y-5 lg:col-span-2">
          {/* 2. 正在做 (WORKING) */}
          <Card className="border-border/60 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between gap-2 p-4 pb-3">
              <div className="flex items-center gap-2 min-w-0">
                <CircleDashed className="h-4 w-4 shrink-0 text-blue-500 animate-spin-slow" />
                <CardTitle className="text-sm sm:text-base font-semibold truncate">
                  {d.inProgress}
                </CardTitle>
                <span className="hidden sm:inline text-xs text-muted-foreground">
                  {d.inProgressAgent}
                </span>
                <Badge variant="secondary" className="font-mono text-xs shrink-0">
                  {plans.filter((p) => p.status === "WORKING").length}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onTab("plans")}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                {d.all}
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </CardHeader>

            <CardContent className="space-y-2.5 p-4 pt-0">
              {working.length ? (
                working.map((plan) => (
                  <TaskCard key={plan.id} plan={plan} project={project} onOpen={onPlan} />
                ))
              ) : (
                <div className="flex items-center justify-between rounded-lg border border-dashed border-border/70 bg-muted/20 px-3.5 py-2.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500/70 shrink-0" />
                    <span>{d.noInProgress}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground/70 hidden sm:inline">
                    {d.noInProgressHint}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <TaskQueueCard
            status="READY"
            plans={plans}
            project={project}
            onPlan={onPlan}
            onTab={onTab}
          />
          <TaskQueueCard
            status="PLAN"
            plans={plans}
            project={project}
            onPlan={onPlan}
            onTab={onTab}
          />
        </div>

        {/* Right Column: Recent Done & Project Direction */}
        <div className="space-y-5">
          {/* 4. 最近完成成果 (DONE) */}
          <Card className="border-border/60 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between p-4 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                <CardTitle className="text-sm sm:text-base font-semibold">{d.recentDone}</CardTitle>
                <Badge variant="secondary" className="font-mono text-xs">
                  {plans.filter((p) => p.status === "DONE").length}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onTab("plans")}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                {d.viewAll}
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2.5 p-4 pt-0">
              {recentDone.length ? (
                recentDone.map((plan) => (
                  <TaskCard key={plan.id} plan={plan} project={project} onOpen={onPlan} />
                ))
              ) : (
                <div className="py-6 text-center text-xs text-muted-foreground">{d.noDone}</div>
              )}
            </CardContent>
          </Card>

          {/* Project Reference Files */}
          <Card className="border-border/60 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between p-4 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                <CardTitle className="text-sm sm:text-base font-semibold">
                  {d.projectDocs}
                </CardTitle>
                <Badge variant="secondary" className="font-mono text-xs">
                  {files.length}
                </Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={onNewFile} className="h-7 px-2 text-xs">
                <Plus className="mr-1 h-3 w-3" />
                {d.addDoc}
              </Button>
            </CardHeader>
            <CardContent className="space-y-1.5 p-4 pt-0">
              {files.length ? (
                files.slice(0, 4).map((f) => (
                  <button
                    key={f.path}
                    onClick={() => onFile(f.path)}
                    className="flex w-full items-center justify-between gap-2 rounded-md p-2 text-left text-xs transition-colors hover:bg-muted"
                  >
                    <span className="truncate font-mono font-medium text-foreground">{f.path}</span>
                    <time className="shrink-0 text-[10px] text-muted-foreground">
                      {formatDate(f.updatedAt)}
                    </time>
                  </button>
                ))
              ) : (
                <div className="py-4 text-center text-xs text-muted-foreground">{d.noDocs}</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
