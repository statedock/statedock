import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";
import type { Project } from "@statedock/core";
import {
  Bell,
  ExternalLink,
  FileText,
  History,
  Home,
  KeyRound,
  LayoutDashboard,
  LayoutList,
  LogOut,
  Plus,
  Settings2,
  Users,
  X,
  Zap,
} from "lucide-react";
import { StateDockLogo } from "./StateDockLogo";

interface Props {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  projects: Project[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  plansCount: number;
  filesCount: number;
  activityCount: number;
  onOpenSettings: () => void;
  onOpenCollaborators?: () => void;
  onOpenNewProject: () => void;
  onOpenMcp: () => void;
  onOpenTelegram: () => void;
  user?: { id: string; email: string; isAdmin?: boolean };
  onSignOut?: () => void;
  isOnline: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({
  currentTab,
  onSelectTab,
  projects,
  activeProjectId,
  onSelectProject,
  plansCount,
  filesCount,
  activityCount,
  onOpenSettings,
  onOpenCollaborators,
  onOpenNewProject,
  onOpenMcp,
  onOpenTelegram,
  user,
  onSignOut,
  isOnline,
  mobileOpen,
  onMobileClose,
}: Props) {
  const { t } = useI18n();
  const n = t.app.nav;
  const activeProject = projects.find((p) => p.id === activeProjectId);

  const navItems = [
    { key: "overview", label: n.overview, icon: Home, count: null },
    { key: "plans", label: n.plans, icon: LayoutList, count: plansCount },
    { key: "files", label: n.files, icon: FileText, count: filesCount },
    { key: "activity", label: n.activity, icon: History, count: activityCount },
  ];

  const handleNavClick = (tab: string) => {
    onSelectTab(tab);
    onMobileClose();
  };

  const handleProjectSelect = (id: string) => {
    onSelectProject(id);
    if (
      currentTab === "notifications" ||
      currentTab === "global-dashboard" ||
      currentTab === "projects"
    ) {
      const defaultTab = window.matchMedia("(max-width: 767px)").matches ? "home" : "overview";
      onSelectTab(defaultTab);
    }
    onMobileClose();
  };

  const sidebarContent = (
    <div className="app-sidebar flex h-full w-64 flex-col border-r border-border/60 bg-card/95 backdrop-blur-md">
      {/* Brand Header */}
      <div className="flex items-center justify-between p-5 pb-4 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <StateDockLogo className="h-7 w-7 shrink-0" />
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-foreground">StateDock</span>
              <Badge
                variant="outline"
                className="font-mono text-[9px] px-1 py-0 tracking-wider text-muted-foreground uppercase"
              >
                {isOnline ? "ONLINE" : "LOCAL"}
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground">{n.projectStatesSub}</p>
          </div>
        </div>

        {/* Mobile close button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onMobileClose}
          className="h-8 w-8 text-muted-foreground md:hidden"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Main Nav */}
      <div className="p-3">
        {/* Global Cockpit Entry */}
        <div className="mb-2 pb-2 border-b border-border/40">
          <button
            onClick={() => handleNavClick("global-dashboard")}
            className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              currentTab === "global-dashboard"
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : "text-foreground/90 hover:bg-muted/70 hover:text-foreground font-semibold"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <LayoutDashboard className="h-4 w-4 shrink-0 text-blue-500 group-hover:text-foreground" />
              <span>{n.globalDashboard}</span>
            </div>
            <Badge variant="outline" className="font-mono text-[9px] px-1 py-0 uppercase">
              {n.projectsCount(projects.length)}
            </Badge>
          </button>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => handleNavClick(item.key)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-accent text-accent-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </div>
                {item.count !== null && (
                  <span className="font-mono text-[10px] text-muted-foreground">{item.count}</span>
                )}
              </button>
            );
          })}
          <button
            onClick={() => {
              onOpenSettings();
              onMobileClose();
            }}
            disabled={!activeProject}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-40"
          >
            <Settings2 className="h-4 w-4 shrink-0" />
            <span>{n.settings}</span>
          </button>
          {isOnline && (
            <button
              onClick={() => {
                onOpenCollaborators?.();
                onMobileClose();
              }}
              disabled={!activeProject}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-40"
            >
              <Users className="h-4 w-4 shrink-0 text-blue-500" />
              <span>{n.collaborators}</span>
            </button>
          )}
        </nav>
      </div>

      {/* Workspaces / Projects section */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <div className="mb-2 flex items-center justify-between px-2 text-[10px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
          <span>{n.workspaceProjects}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              onOpenNewProject();
              onMobileClose();
            }}
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            title={n.newProject}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="space-y-1">
          {projects.map((p) => {
            const isSelected = p.id === activeProjectId;
            return (
              <button
                key={p.id}
                onClick={() => handleProjectSelect(p.id)}
                className={`group flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                  isSelected
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border/80 bg-background font-mono text-[10px] font-semibold text-foreground">
                    {p.slug === "inbox" ? "📥" : p.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="truncate">{p.slug === "inbox" ? n.inbox : p.name}</span>
                  {p.isOwner === false && (
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1 py-0 border-blue-500/30 text-blue-500 bg-blue-500/5 shrink-0"
                    >
                      {t.app.collaborators.sharedBadge}
                    </Badge>
                  )}
                </div>
                {isSelected && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sidebar Footer */}
      <div className="border-t border-border/40 p-3 space-y-2">
        {user ? (
          <>
            <Button
              variant={currentTab === "notifications" ? "secondary" : "outline"}
              size="sm"
              onClick={() => {
                onSelectTab("notifications");
                onMobileClose();
              }}
              className={`w-full justify-start text-xs h-8 ${
                currentTab === "notifications"
                  ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                  : "text-blue-500 hover:text-blue-600"
              }`}
            >
              <Bell className="mr-2 h-3.5 w-3.5" />
              {n.notifications}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenMcp();
                onMobileClose();
              }}
              className="w-full justify-start text-xs h-8"
            >
              <KeyRound className="mr-2 h-3.5 w-3.5" />
              {n.mcp}
            </Button>
            <a
              href="/doc"
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-between rounded-md border border-border/80 bg-background px-3 py-1.5 text-xs hover:bg-muted text-muted-foreground hover:text-foreground transition-colors h-8"
            >
              <span className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Docs</span>
              </span>
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>

            {user.isAdmin && (
              <Button variant="outline" size="sm" onClick={() => handleNavClick("instance-admin")}>
                {t.app.instanceAdmin.title}
              </Button>
            )}
            <div className="flex items-center justify-between gap-2 pt-1 px-1 text-xs">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{user.email}</p>
                <p className="text-[10px] text-muted-foreground">{n.cloudMode}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onSignOut}
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title={n.signOut}
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2.5 px-2 py-1 text-xs text-muted-foreground">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/10 font-mono text-[11px] font-bold text-blue-500">
              L
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">{n.localEnv}</p>
              <p className="text-[10px] text-muted-foreground">Local SQLite + MCP</p>
            </div>
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop fixed sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden md:flex">{sidebarContent}</aside>

      {/* Mobile drawer with backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            onClick={onMobileClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in"
          />
          {/* Drawer */}
          <div className="fixed inset-y-0 left-0 z-50 w-64 shadow-2xl transition-transform animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
