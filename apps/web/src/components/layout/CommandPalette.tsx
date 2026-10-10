import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/context";
import { formatProjectName } from "@/lib/project";
import type { Plan, Project } from "@statedock/core";
import {
  ArrowRight,
  Bell,
  Folder,
  LayoutDashboard,
  MessageCircle,
  Plus,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  activeProject: Project | null;
  onSelectProject: (id: string) => void;
  plans: Plan[];
  onSelectPlan: (plan: Plan) => void;
  onNewPlan: (status: "WORKING" | "PLAN") => void;
  onGoToGlobalDashboard?: () => void;
  onGoToNotifications?: () => void;
}

export function CommandPalette({
  open,
  onClose,
  projects,
  activeProject,
  onSelectProject,
  plans,
  onSelectPlan,
  onNewPlan,
  onGoToGlobalDashboard,
  onGoToNotifications,
}: Props) {
  const { t } = useI18n();
  const cp = t.app.commandPalette;
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  if (!open) return null;

  const q = search.trim().toLowerCase();

  const matchingPlans = plans
    .filter((p) => {
      if (!q) return true;
      const natural = activeProject
        ? `${activeProject.slug}-${p.number} ${activeProject.slug}${p.number} #${p.number}`
        : "";
      return `${natural} ${p.reference} ${p.title} ${p.summary ?? ""}`.toLowerCase().includes(q);
    })
    .slice(0, 6);

  const matchingProjects = projects.filter((p) => {
    if (!q) return false;
    const displayName = formatProjectName(p, t.app.nav.inbox);
    return `${p.slug} ${p.name} ${displayName}`.toLowerCase().includes(q);
  });

  return (
    <Dialog open onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="p-0 max-w-xl overflow-hidden border-border/80 shadow-2xl bg-card">
        {/* Search Input */}
        <div className="flex items-center border-b border-border/60 px-3.5 py-3 gap-2.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={cp.placeholder}
            className="border-none shadow-none focus-visible:ring-0 text-sm h-8 px-0"
            autoFocus
          />
          <kbd className="hidden sm:inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* Content list */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-3">
          {/* Quick Actions */}
          {!q && (
            <div className="space-y-1">
              <span className="px-2 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">
                {cp.quickActions}
              </span>
              {onGoToGlobalDashboard && (
                <button
                  onClick={() => {
                    onClose();
                    onGoToGlobalDashboard();
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-muted/60 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <LayoutDashboard className="h-3.5 w-3.5 text-blue-500" />
                    <span className="font-medium">{cp.openGlobal}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] py-0 font-normal">
                    Dashboard
                  </Badge>
                </button>
              )}
              {onGoToNotifications && (
                <button
                  onClick={() => {
                    onClose();
                    onGoToNotifications();
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-muted/60 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Bell className="h-3.5 w-3.5 text-primary" />
                    <span className="font-medium">{t.app.nav.notifications}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] py-0 font-normal">
                    Notifications
                  </Badge>
                </button>
              )}
              <button
                onClick={() => {
                  onClose();
                  onNewPlan("WORKING");
                }}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-muted/60 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Plus className="h-3.5 w-3.5 text-blue-500" />
                  <span>{cp.createNew}</span>
                </div>
                <kbd className="text-[10px] text-muted-foreground font-mono">N</kbd>
              </button>
              <button
                onClick={() => {
                  onClose();
                  onNewPlan("PLAN");
                }}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-muted/60 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-3.5 w-3.5 text-amber-500" />
                  <span>{cp.captureIdea}</span>
                </div>
              </button>
            </div>
          )}

          {/* Matching Projects */}
          {matchingProjects.length > 0 && (
            <div className="space-y-1">
              <span className="px-2 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">
                {cp.projectsGroup}
              </span>
              {matchingProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onSelectProject(p.id);
                    onClose();
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-muted/60 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium truncate">
                      {formatProjectName(p, t.app.nav.inbox)}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono">({p.slug})</span>
                  </div>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}

          {/* Matching Tasks */}
          {matchingPlans.length > 0 ? (
            <div className="space-y-1">
              <span className="px-2 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">
                {cp.tasksGroup(matchingPlans.length)}
              </span>
              {matchingPlans.map((plan) => {
                const natural = activeProject
                  ? `${activeProject.slug}-${plan.number}`
                  : plan.reference;
                return (
                  <button
                    key={plan.id}
                    onClick={() => {
                      onSelectPlan(plan);
                      onClose();
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-muted/60 transition-colors group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-xs font-bold text-blue-500 shrink-0">
                        {natural}
                      </span>
                      <span className="truncate text-foreground font-medium group-hover:text-blue-500">
                        {plan.title}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0 font-normal">
                      {plan.status}
                    </Badge>
                  </button>
                );
              })}
            </div>
          ) : (
            q &&
            matchingProjects.length === 0 && (
              <div className="p-6 text-center text-xs text-muted-foreground">{cp.noResults}</div>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
