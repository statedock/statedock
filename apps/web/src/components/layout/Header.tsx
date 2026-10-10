import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";
import { formatProjectName } from "@/lib/project";
import type { PlanStatus, Project } from "@statedock/core";
import {
  Bell,
  ChevronRight,
  Folder,
  LayoutDashboard,
  Menu,
  Moon,
  Search,
  Sun,
  Users,
} from "lucide-react";

interface Props {
  currentTab?: string;
  onSelectTab?: (tab: string) => void;
  project?: Project;
  projects: Project[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
  notificationEnabled: boolean;
  notificationPermission: string;
  onToggleNotification: () => void;
  onTestNotification: () => void;
  onNewPlan: (status: PlanStatus) => void;
  error?: string;
  synced: Date | null;
  onRefresh: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onOpenMobileSidebar: () => void;
  onOpenPalette?: () => void;
  onOpenCollaborators?: () => void;
}

export function Header({
  currentTab,
  onSelectTab,
  project,
  projects,
  activeProjectId,
  onSelectProject,
  query,
  onQueryChange,
  notificationEnabled,
  notificationPermission,
  onToggleNotification,
  onTestNotification,
  onNewPlan,
  error,
  synced,
  theme,
  onToggleTheme,
  onOpenMobileSidebar,
  onOpenPalette,
  onOpenCollaborators,
}: Props) {
  const { t } = useI18n();
  const h = t.app.header;

  return (
    <header className="app-header sticky top-0 z-20 flex items-center justify-between border-b border-border/60 bg-background/85 px-4 md:px-6 backdrop-blur-md">
      {/* Left: Mobile Menu Button + Project Breadcrumb */}
      <div className="flex items-center gap-2 text-xs min-w-0">
        {/* Mobile Hamburger Drawer Trigger */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenMobileSidebar}
          className="h-11 w-11 md:h-8 md:w-8 text-muted-foreground md:hidden shrink-0"
          title="Open menu"
        >
          <Menu className="h-4 w-4" />
        </Button>

        {currentTab === "notifications" ? (
          <div className="flex items-center gap-1.5 whitespace-nowrap text-foreground font-semibold">
            <Bell className="h-4 w-4 text-primary" />
            <span className="text-sm">{t.app.nav.notifications}</span>
          </div>
        ) : currentTab === "global-dashboard" ? (
          <div className="flex items-center gap-1.5 whitespace-nowrap text-foreground font-semibold">
            <LayoutDashboard className="h-4 w-4 text-blue-500" />
            <span className="text-sm">{h.globalCockpit}</span>
            <span className="hidden sm:inline-block text-xs font-normal text-muted-foreground ml-1">
              ({t.app.nav.projectsCount(projects.length)})
            </span>
          </div>
        ) : (
          <>
            {/* Desktop Breadcrumb */}
            <div className="hidden sm:flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
              <Folder className="h-4 w-4" />
              <span>{h.projectsBreadcrumb}</span>
              <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
            </div>

            {/* Project Name or Quick Switcher */}
            <div className="flex items-center gap-2 min-w-0">
              <strong className="truncate text-sm font-semibold text-foreground">
                {(project ? formatProjectName(project, t.app.nav.inbox) : "") || h.workspace}
              </strong>

              {project && project.isOwner === false && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 border-blue-500/30 text-blue-500 bg-blue-500/5 shrink-0 hidden sm:inline-flex"
                >
                  {t.app.collaborators.collaboratorLabel}
                </Badge>
              )}

              {project && onOpenCollaborators && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onOpenCollaborators}
                  className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0 hidden sm:inline-flex"
                  title={t.app.collaborators.modalTitle}
                >
                  <Users className="h-3.5 w-3.5 text-blue-500/80 hover:text-blue-500" />
                </Button>
              )}

              {/* Quick switcher dropdown */}
              {projects.length > 1 && (
                <select
                  value={activeProjectId}
                  onChange={(e) => {
                    onSelectProject(e.target.value);
                    if (
                      (currentTab === "global-dashboard" || currentTab === "notifications") &&
                      onSelectTab
                    ) {
                      onSelectTab("overview");
                    }
                  }}
                  className="hidden lg:block rounded border border-input bg-background/80 px-2 py-0.5 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {formatProjectName(p, t.app.nav.inbox)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </>
        )}
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Global Search Button / Trigger (desktop) */}
        <button
          onClick={onOpenPalette}
          className="hidden md:flex items-center justify-between w-44 lg:w-56 h-8 rounded-md border border-input bg-background/60 px-2.5 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
          title="Cmd+K"
        >
          <span className="flex items-center gap-2 truncate">
            <Search className="h-3.5 w-3.5" />
            <span className="truncate">{query ? `${query}` : h.searchPlaceholder}</span>
          </span>
          <kbd className="pointer-events-none inline-flex h-4.5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <span className="text-[9px]">⌘</span>K
          </kbd>
        </button>

        {/* Notifications center toggle */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              onSelectTab?.(
                currentTab === "notifications"
                  ? project
                    ? "overview"
                    : "global-dashboard"
                  : "notifications",
              )
            }
            className={`h-11 w-11 md:h-8 md:w-8 ${
              currentTab === "notifications"
                ? "text-primary bg-primary/10"
                : notificationEnabled
                  ? "text-blue-500"
                  : "text-muted-foreground"
            }`}
            title={t.app.nav.notifications}
          >
            <Bell className="h-4 w-4" />
          </Button>

          {notificationEnabled && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onTestNotification}
              className="hidden xl:inline-flex h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {h.test}
            </Button>
          )}
        </div>

        {/* Language Toggle */}
        <LanguageToggle />

        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleTheme}
          className="h-11 w-11 md:h-8 md:w-8 text-muted-foreground hover:text-foreground"
          title={theme === "dark" ? h.lightTheme : h.darkTheme}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {/* Sync Status Indicator */}
        <div
          className="flex items-center gap-1.5 pl-1 text-[11px] text-muted-foreground"
          title={error ? h.syncError : synced ? h.synced : h.connecting}
        >
          <span
            className={`h-2 w-2 rounded-full shrink-0 ${
              error ? "bg-rose-500" : synced ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
            }`}
          />
        </div>
      </div>
    </header>
  );
}
