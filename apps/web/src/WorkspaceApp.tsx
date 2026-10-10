import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { GlobalDashboard } from "@/components/dashboard/GlobalDashboard";
import { FileExplorer } from "@/components/files/FileExplorer";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { Header } from "@/components/layout/Header";
import { MobileNav } from "@/components/layout/MobileNav";
import { Sidebar } from "@/components/layout/Sidebar";
import { StateDockLogo } from "@/components/layout/StateDockLogo";
import { ActionModals } from "@/components/modals/ActionModals";
import { CollaboratorModal } from "@/components/modals/CollaboratorModal";
import { PlanBoard } from "@/components/plans/PlanBoard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Plan, PlanStatus, Project } from "@statedock/core";
import { Plus, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { CaptureHome, QuickCapture } from "./CaptureHome";
import { LocalImport } from "./LocalImport";
import { McpClients } from "./McpClients";
import { NotificationCenter } from "./NotificationCenter";
import { ToastItem } from "./ToastItem";
import { useNotifications } from "./useNotifications";
import { useWorkspaceActions } from "./useWorkspaceActions";

import { formatProjectName } from "@/lib/project";
import { InstanceAdmin } from "./InstanceAdmin";
import { useI18n } from "./i18n/context";
import { InstallPrompt } from "./InstallPrompt";
import { useWorkspaceData } from "./useWorkspaceData";

const base = (id: string) => `/projects/${encodeURIComponent(id)}`;

export function WorkspaceApp({
  user,
  onSignOut,
}: {
  user?: { id: string; email: string; isAdmin?: boolean };
  onSignOut?: () => void;
}) {
  const { t, lang } = useI18n();
  const [projectId, setProjectId] = useState<string>(
    () =>
      new URLSearchParams(window.location.search).get("project") ??
      localStorage.getItem("statedock.project") ??
      "",
  );

  const {
    projects,
    project,
    plans,
    files,
    activity,
    allPlans,
    globalLoading,
    loaded,
    synced,
    error,
    setError,
    refresh,
  } = useWorkspaceData(projectId, setProjectId);

  const [tab, setTab] = useState(() =>
    window.matchMedia("(max-width: 767px)").matches ? "home" : "overview",
  );
  const [selectedPlanNumber, setSelectedPlanNumber] = useState<number | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [modal, setModal] = useState<"project" | "plan" | "settings" | "file" | null>(null);
  const [createStatus, setCreateStatus] = useState<PlanStatus>("WORKING");
  const [mcpOpen, setMcpOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collaboratorOpen, setCollaboratorOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  // Global keyboard shortcuts (Cmd+K for palette, N for new task)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K to open palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
        return;
      }
      // N key to create new task when not in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (
        e.key.toLowerCase() === "n" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        tag !== "input" &&
        tag !== "textarea" &&
        !modal &&
        !paletteOpen &&
        !mcpOpen
      ) {
        e.preventDefault();
        setCreateStatus(window.matchMedia("(max-width: 767px)").matches ? "PLAN" : "WORKING");
        setModal("plan");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modal, paletteOpen, mcpOpen]);

  // Theme setup: default to dark
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return (localStorage.getItem("statedock.theme") as "dark" | "light") || "dark";
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("statedock.theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const pendingNotification = useRef<string | null>(
    new URLSearchParams(window.location.search).get("task"),
  );
  const notifications = useNotifications(
    (event) => {
      if (!event.projectId) return;
      pendingNotification.current = event.reference;
      setProjectId(event.projectId);
      setTab("plans");
    },
    lang,
    user?.id ?? "local",
  );

  useEffect(() => {
    const pending = pendingNotification.current;
    if (pending) {
      const match = plans.find((p) => p.reference === pending);
      if (match) {
        setSelectedPlanNumber(match.number);
        setTab("plans");
        pendingNotification.current = null;
        const url = new URL(window.location.href);
        url.searchParams.delete("project");
        url.searchParams.delete("task");
        window.history.replaceState(null, "", url);
      }
    }
  }, [plans]);

  useEffect(() => {
    setSelectedPlanNumber(null);
    setFilePath(null);
  }, [projectId]);

  const handleSelectProject = (id: string) => {
    setProjectId(id);
    if (modal) setModal(null);
    if (tab === "notifications" || tab === "global-dashboard" || tab === "projects") {
      setTab(window.matchMedia("(max-width: 767px)").matches ? "home" : "overview");
    }
  };

  const handleSelectPlan = (plan: Plan) => {
    if (plan.projectId !== projectId) {
      pendingNotification.current = plan.reference;
      setProjectId(plan.projectId);
    } else setSelectedPlanNumber(plan.number);
    setTab("plans");
  };

  const { handleSavePlan, handleStartPlan, handleMovePlan } = useWorkspaceActions({
    projectId,
    selectedPlanNumber,
    setSaving,
    setError,
    refresh,
    setProjectId,
    setSelectedPlanNumber,
  });

  const handleNewPlan = (st: PlanStatus) => {
    if (st === "PLAN" || window.matchMedia("(max-width: 767px)").matches) {
      setModal(null);
      setTab("home");
      requestAnimationFrame(() => document.getElementById("quick-capture-description")?.focus());
      return;
    }
    setCreateStatus(st);
    setModal("plan");
  };

  const handleOpenFile = (path: string) => {
    setFilePath(path);
    setModal("file");
  };

  const handleNewFile = () => {
    setFilePath(null);
    setModal("file");
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar (Desktop fixed + Mobile drawer) */}
      <Sidebar
        currentTab={tab}
        onSelectTab={setTab}
        projects={projects}
        activeProjectId={projectId}
        onSelectProject={handleSelectProject}
        plansCount={plans.length}
        filesCount={files.length}
        activityCount={activity.length}
        onOpenSettings={() => setModal("settings")}
        onOpenCollaborators={() => setCollaboratorOpen(true)}
        onOpenNewProject={() => setModal("project")}
        onOpenMcp={() => setMcpOpen(true)}
        onOpenTelegram={() => setTab("notifications")}
        user={user}
        onSignOut={onSignOut}
        isOnline={Boolean(user)}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col md:pl-64 pl-0 pb-16 md:pb-0 min-w-0">
        {/* Sticky Header */}
        <Header
          currentTab={tab}
          onSelectTab={setTab}
          project={project}
          projects={projects}
          activeProjectId={projectId}
          onSelectProject={handleSelectProject}
          query={query}
          onQueryChange={(q) => {
            setQuery(q);
            setTab("plans");
          }}
          notificationEnabled={notifications.enabled}
          notificationPermission={notifications.permission}
          onToggleNotification={() => void notifications.toggle()}
          onTestNotification={notifications.test}
          onNewPlan={handleNewPlan}
          error={error}
          synced={synced}
          onRefresh={() => void refresh()}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenCollaborators={() => setCollaboratorOpen(true)}
        />

        {/* Page Container */}
        <main className="flex-1 p-3.5 sm:p-6 md:p-8">
          <div className="mx-auto max-w-7xl space-y-5">
            <InstallPrompt />

            {/* Error Banner */}
            {error && (
              <div className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-500">
                <span>{error}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refresh()}
                  className="h-7 text-xs"
                >
                  <RefreshCw className="mr-1 h-3 w-3" />
                  {t.app.general.retry}
                </Button>
              </div>
            )}

            {tab === "projects" && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">{t.app.general.projects}</h2>
                {projects.map((p) => (
                  <Button
                    key={p.id}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => {
                      setProjectId(p.id);
                      setTab("home");
                    }}
                  >
                    {formatProjectName(p, t.app.nav.inbox)}
                  </Button>
                ))}
                <Button onClick={() => setModal("project")}>{t.app.general.createProject}</Button>
              </section>
            )}
            {tab === "instance-admin" && user?.isAdmin && <InstanceAdmin currentUserId={user.id} />}
            {/* Active Views */}
            {tab === "global-dashboard" && (
              <GlobalDashboard
                projects={projects}
                allPlans={allPlans}
                loading={globalLoading}
                onSelectProject={(id) => {
                  setProjectId(id);
                  setTab("overview");
                }}
                onSelectPlan={(pid, plan) => {
                  setProjectId(pid);
                  setSelectedPlanNumber(plan.number);
                  setTab("plans");
                }}
                onNewPlan={(pid, s) => {
                  setProjectId(pid);
                  handleNewPlan(s);
                }}
              />
            )}

            {tab === "notifications" && (
              <NotificationCenter
                projects={projects}
                inAppToastsEnabled={notifications.inAppToastsEnabled}
                onInAppToastsChange={notifications.setInAppToastsEnabled}
                onTestInAppToast={notifications.test}
                onClose={() => setTab(project ? "overview" : "global-dashboard")}
              />
            )}

            {project ? (
              <>
                {tab === "home" && (
                  <CaptureHome
                    projects={projects}
                    projectId={projectId}
                    plans={plans}
                    onProject={setProjectId}
                    onSaved={() => void refresh()}
                    onOpen={handleSelectPlan}
                    onTasks={() => setTab("plans")}
                  />
                )}
                {tab === "overview" && (
                  <>
                    <QuickCapture
                      projects={projects}
                      projectId={projectId}
                      onProject={setProjectId}
                      onSaved={() => void refresh()}
                      onOpen={handleSelectPlan}
                    />
                    <Dashboard
                      project={project}
                      plans={plans}
                      files={files}
                      activity={activity}
                      onPlan={handleSelectPlan}
                      onTab={setTab}
                      onSettings={() => setModal("settings")}
                      onFile={handleOpenFile}
                      onNewFile={handleNewFile}
                      onNewPlan={handleNewPlan}
                    />
                  </>
                )}

                {tab === "plans" && (
                  <PlanBoard
                    project={project}
                    projects={projects}
                    plans={plans}
                    selectedNumber={selectedPlanNumber}
                    onSelectPlan={(p) => setSelectedPlanNumber(p.number)}
                    onCloseDetail={() => setSelectedPlanNumber(null)}
                    onSavePlan={handleSavePlan}
                    onStartPlan={handleStartPlan}
                    onMovePlan={handleMovePlan}
                    onNewPlan={handleNewPlan}
                    saving={saving}
                  />
                )}

                {tab === "files" && (
                  <FileExplorer
                    files={files}
                    onOpenFile={handleOpenFile}
                    onNewFile={handleNewFile}
                  />
                )}

                {tab === "activity" && <ActivityFeed activity={activity} plans={plans} />}
              </>
            ) : (
              loaded &&
              tab !== "instance-admin" && (
                <Card className="border-border/60 py-16 text-center shadow-sm">
                  <CardContent className="space-y-4">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
                      <StateDockLogo className="h-8 w-8" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-xl font-bold">{t.app.empty.welcomeTitle}</h2>
                      <p className="text-xs text-muted-foreground">{t.app.empty.welcomeDesc}</p>
                    </div>
                    {user && <LocalImport onComplete={() => void refresh()} />}
                    <Button onClick={() => setModal("project")}>
                      <Plus className="mr-1.5 h-4 w-4" />
                      {t.app.empty.createFirstProject}
                    </Button>
                  </CardContent>
                </Card>
              )
            )}
          </div>
        </main>
      </div>

      {/* Floating Notifications Toasts */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none">
        {notifications.toasts.map((event) => (
          <ToastItem
            key={event.sequence}
            event={event}
            lang={lang}
            onDismiss={notifications.dismiss}
            onSelect={(e) => {
              if (!e.projectId) return;
              setProjectId(e.projectId);
              setTab("plans");
              const match = plans.find((p) => p.reference === e.reference);
              if (match) setSelectedPlanNumber(match.number);
            }}
          />
        ))}
      </div>

      {/* Action Modals */}
      <ActionModals
        modal={modal}
        onClose={() => setModal(null)}
        project={project}
        createStatus={createStatus}
        filePath={filePath}
        files={files}
        onSubmitProject={async (data) => {
          setSaving(true);
          try {
            if (modal === "project") {
              const p = await api<Project>("/projects", "POST", data);
              setProjectId(p.id);
            } else if (modal === "settings" && project) {
              await api(base(projectId), "PATCH", data);
            }
            setModal(null);
            await refresh();
          } catch (e) {
            const msg = (e as Error).message || "";
            setError(msg);
          } finally {
            setSaving(false);
          }
        }}
        onSubmitPlan={async (data) => {
          if (!projectId) return;
          setSaving(true);
          try {
            const p = await api<Plan>(`${base(projectId)}/plans`, "POST", data);
            setModal(null);
            setSelectedPlanNumber(p.number);
            setTab("plans");
            await refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setSaving(false);
          }
        }}
        onSubmitFile={async (data) => {
          if (!projectId) return;
          setSaving(true);
          try {
            await api(`${base(projectId)}/files`, "PUT", data);
            setModal(null);
            await refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setSaving(false);
          }
        }}
        saving={saving}
        error={error}
      />

      {/* Mobile Bottom Navigation */}
      <MobileNav currentTab={tab} onSelectTab={setTab} onNewPlan={handleNewPlan} />

      {mcpOpen && <McpClients close={() => setMcpOpen(false)} />}

      <CollaboratorModal
        open={collaboratorOpen}
        onClose={() => setCollaboratorOpen(false)}
        project={project}
        user={user}
        onProjectLeft={async () => {
          await refresh();
          setTab("global-dashboard");
        }}
      />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        projects={projects}
        activeProject={project ?? null}
        onGoToGlobalDashboard={() => setTab("global-dashboard")}
        onGoToNotifications={() => setTab("notifications")}
        onSelectProject={(id) => {
          setProjectId(id);
          setTab("overview");
        }}
        plans={plans}
        onSelectPlan={(plan) => {
          setSelectedPlanNumber(plan.number);
          setTab("plans");
        }}
        onNewPlan={handleNewPlan}
      />
    </div>
  );
}
