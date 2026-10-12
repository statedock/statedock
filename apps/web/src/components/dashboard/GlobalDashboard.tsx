import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/context";
import { formatProjectName } from "@/lib/project";
import type { Plan, PlanStatus, Project } from "@statedock/core";
import { TaskCard } from "../plans/TaskCard";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Folder,
  Layers,
  Sparkles,
} from "lucide-react";

export interface GlobalPlanItem {
  plan: Plan;
  project: Project;
}

interface Props {
  projects: Project[];
  allPlans: GlobalPlanItem[];
  loading?: boolean;
  onSelectProject: (projectId: string) => void;
  onSelectPlan: (projectId: string, plan: Plan) => void;
  onNewPlan: (projectId: string, status: PlanStatus) => void;
}

export function GlobalDashboard({
  projects,
  allPlans,
  loading,
  onSelectProject,
  onSelectPlan,
  onNewPlan,
}: Props) {
  const { t } = useI18n();
  const gd = t.app.globalDashboard;
  const s = t.app.statuses;
  // 1. All currently active tasks across all projects (WORKING or WAITING)
  const activeItems = allPlans
    .filter((item) => item.plan.status === "WORKING" || item.plan.status === "WAITING")
    .sort((a, b) => b.plan.updatedAt.localeCompare(a.plan.updatedAt));

  // 2. Recent completed tasks across all projects (DONE)
  const recentDoneItems = allPlans
    .filter((item) => item.plan.status === "DONE")
    .sort((a, b) => b.plan.updatedAt.localeCompare(a.plan.updatedAt))
    .slice(0, 8);

  // 3. Unclassified Inbox items
  const inboxItems = allPlans.filter((item) => item.project.slug === "inbox");

  // Group active tasks by project
  const activeProjectsMap = new Map<string, GlobalPlanItem[]>();
  for (const item of activeItems) {
    const list = activeProjectsMap.get(item.project.id) ?? [];
    list.push(item);
    activeProjectsMap.set(item.project.id, list);
  }

  // Count stats per project
  const projectStats = projects.map((p) => {
    const pPlans = allPlans.filter((item) => item.project.id === p.id);
    const activeCount = pPlans.filter(
      (i) => i.plan.status === "WORKING" || i.plan.status === "WAITING",
    ).length;
    const doneCount = pPlans.filter((i) => i.plan.status === "DONE").length;
    const readyCount = pPlans.filter((i) => i.plan.status === "READY").length;
    const planCount = pPlans.filter((i) => i.plan.status === "PLAN").length;
    return { project: p, total: pPlans.length, activeCount, doneCount, planCount, readyCount };
  });

  return (
    <div className="space-y-6">
      {/* Top Banner / Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-purple-500/10 p-5 md:p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-500/20 text-blue-500">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <h2 className="text-lg md:text-xl font-bold tracking-tight text-foreground">
                {gd.title}
              </h2>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{gd.subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-border/60 bg-card/80 px-3.5 py-2 backdrop-blur-xs text-center min-w-20">
              <div className="text-base md:text-lg font-bold font-mono text-blue-500">
                {activeItems.length}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {gd.executing}
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/80 px-3.5 py-2 backdrop-blur-xs text-center min-w-20">
              <div className="text-base md:text-lg font-bold font-mono text-emerald-500">
                {recentDoneItems.length}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {gd.recentDone}
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/80 px-3.5 py-2 backdrop-blur-xs text-center min-w-20">
              <div className="text-base md:text-lg font-bold font-mono text-foreground">
                {projects.length}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {gd.manageProjects}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Inbox Items Alert */}
      {inboxItems.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-xs text-blue-900 dark:text-blue-200">
          <div className="flex items-center gap-3">
            <span className="text-xl shrink-0">📥</span>
            <div>
              <strong className="block text-sm font-semibold">
                {gd.inboxTitle(inboxItems.length)}
              </strong>
              <p className="text-xs text-blue-700/80 dark:text-blue-300/80">{gd.inboxDesc}</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSelectProject(inboxItems[0].project.id)}
            className="h-8 shrink-0 text-xs border-blue-500/40 text-blue-700 dark:text-blue-300 hover:bg-blue-500/20"
          >
            {gd.openInbox}
          </Button>
        </div>
      )}

      {/* Main Grid: Left for Active Work, Right for Recent Done & Project Cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Spans: Active Work Across Projects */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="border-border/70 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between gap-2 p-4 pb-3 border-b border-border/40">
              <div className="flex items-center gap-2 min-w-0">
                <CircleDashed className="h-4 w-4 shrink-0 text-blue-500 animate-spin-slow" />
                <CardTitle className="text-sm sm:text-base font-semibold truncate">
                  {gd.crossProjectActive}
                </CardTitle>
                <Badge variant="secondary" className="font-mono text-xs shrink-0">
                  {gd.itemsCount(activeItems.length)}
                </Badge>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {gd.projectsRunning(activeProjectsMap.size)}
              </span>
            </CardHeader>

            <CardContent className="p-4 space-y-3">
              {loading && !activeItems.length ? (
                <div className="py-8 text-center text-xs text-muted-foreground">{gd.syncing}</div>
              ) : activeItems.length > 0 ? (
                activeItems.map(({ plan, project }) => (
                  <TaskCard
                    key={plan.id}
                    plan={plan}
                    project={project}
                    projectLabel={formatProjectName(project, t.app.nav.inbox)}
                    onOpen={() => onSelectPlan(project.id, plan)}
                  />
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/80 mb-3">
                    <CircleDashed className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-medium text-foreground">{gd.noActiveAll}</p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                    {gd.noActiveAllHint}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Span: Recent Completed Work & Project Quick Cards */}
        <div className="space-y-6">
          {/* Recent Completed Across All Projects */}
          <Card className="border-border/70 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between p-4 pb-3 border-b border-border/40">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                <CardTitle className="text-sm sm:text-base font-semibold">
                  {gd.recentDoneCross}
                </CardTitle>
              </div>
              <Badge variant="outline" className="font-mono text-[10px]">
                {recentDoneItems.length}
              </Badge>
            </CardHeader>

            <CardContent className="p-4 space-y-3">
              {recentDoneItems.length ? (
                recentDoneItems.map(({ plan, project }) => (
                  <TaskCard
                    key={plan.id}
                    plan={plan}
                    project={project}
                    projectLabel={formatProjectName(project, t.app.nav.inbox)}
                    onOpen={() => onSelectPlan(project.id, plan)}
                  />
                ))
              ) : (
                <div className="py-8 text-center text-xs text-muted-foreground">{gd.noDone}</div>
              )}
            </CardContent>
          </Card>

          {/* Project Status Cards */}
          <Card className="border-border/70 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between p-4 pb-3 border-b border-border/40">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 shrink-0 text-purple-500" />
                <CardTitle className="text-sm sm:text-base font-semibold">
                  {gd.statusFlow}
                </CardTitle>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {gd.totalProjects(projects.length)}
              </span>
            </CardHeader>

            <CardContent className="p-3 space-y-2">
              {projectStats.map(({ project, activeCount, doneCount, planCount, readyCount }) => (
                <div
                  key={project.id}
                  onClick={() => onSelectProject(project.id)}
                  className="group flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border/40 bg-card p-2.5 transition-colors hover:border-border hover:bg-muted/40"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-background font-mono text-xs font-bold text-foreground">
                      {project.slug === "inbox" ? "📥" : project.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <strong className="text-xs font-semibold truncate text-foreground group-hover:text-blue-500">
                          {formatProjectName(project, t.app.nav.inbox)}
                        </strong>
                        <span className="text-[10px] text-muted-foreground font-mono truncate">
                          ({project.slug})
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        {activeCount > 0 ? (
                          <span className="text-blue-500 font-medium">
                            {activeCount} {gd.active}
                          </span>
                        ) : (
                          <span>{gd.idle}</span>
                        )}
                        <span>·</span>
                        <span>
                          {doneCount} {gd.done}
                        </span>
                        {readyCount > 0 && (
                          <Badge variant="ready" className="text-[10px]">
                            {s.READY} {readyCount}
                          </Badge>
                        )}
                        {planCount > 0 && (
                          <>
                            <span>·</span>
                            <span>
                              {planCount} {gd.toDiscuss}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
