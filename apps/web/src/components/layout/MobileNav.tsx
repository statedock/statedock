import { useI18n } from "@/i18n/context";
import type { PlanStatus } from "@statedock/core";
import { Home, LayoutDashboard, LayoutList, Plus } from "lucide-react";

interface Props {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onNewPlan: (status: PlanStatus) => void;
}

export function MobileNav({ currentTab, onSelectTab }: Props) {
  const { t } = useI18n();
  const tabs = [
    { key: "home", label: t.app.mobileNav.home, icon: Home },
    { key: "plans", label: t.app.mobileNav.plans, icon: LayoutList },
    { key: "projects", label: t.app.mobileNav.projects, icon: LayoutDashboard },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex min-h-16 pb-[env(safe-area-inset-bottom)] items-center justify-around border-t border-border/80 bg-background/95 px-2 backdrop-blur-md md:hidden">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = currentTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onSelectTab(tab.key)}
            className={`flex flex-col items-center justify-center gap-1 py-1 text-[11px] font-medium transition-colors ${
              isActive
                ? "text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-5 w-5" />
            <span>{tab.label}</span>
          </button>
        );
      })}

      {/* Floating Add Plan button on mobile */}
      <button
        onClick={() => onSelectTab("home")}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95"
        title={t.app.mobileNav.captureTooltip}
      >
        <Plus className="h-5 w-5" />
      </button>
    </nav>
  );
}
