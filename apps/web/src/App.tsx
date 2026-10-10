import { StateDockLogo } from "@/components/layout/StateDockLogo";
import { useEffect, useState } from "react";
import { api } from "./api";
import { DocPage } from "./DocPage";
import { I18nProvider, useI18n } from "./i18n/context";
import { LoginScreen } from "./LoginScreen";
import { WorkspaceApp } from "./WorkspaceApp";

type ViewRoute = "doc" | "app";

function getInitialRoute(): ViewRoute {
  const search = new URLSearchParams(window.location.search);
  const pathname = window.location.pathname.toLowerCase();

  // 0. OAuth endpoints are strictly server-rendered
  if (pathname.startsWith("/oauth")) {
    window.location.reload();
    return "app";
  }

  // 1. Documentation page
  if (
    pathname === "/doc" ||
    pathname.startsWith("/doc/") ||
    pathname === "/docs" ||
    pathname.startsWith("/docs/") ||
    search.get("view") === "doc" ||
    search.get("page") === "doc"
  ) {
    return "doc";
  }

  return "app";
}

export default function App() {
  return (
    <I18nProvider>
      <AppRouter />
    </I18nProvider>
  );
}

function AppRouter() {
  const [route, setRoute] = useState<ViewRoute>(getInitialRoute);

  useEffect(() => {
    const handleLocationChange = () => {
      setRoute(getInitialRoute());
    };
    window.addEventListener("popstate", handleLocationChange);
    return () => window.removeEventListener("popstate", handleLocationChange);
  }, []);

  if (route === "doc") return <DocPage />;
  return <SessionApp />;
}

function SessionApp() {
  const { t } = useI18n();
  const [mode, setMode] = useState<"loading" | "local" | "online" | "offline">("loading");
  const [user, setUser] = useState<{
    id: string;
    email: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session")
      .then(async (response) => {
        if (response.status === 404) {
          if (active) setMode("local");
          return;
        }
        if (!response.ok) throw new Error("Unable to read session");
        const result = await response.json();
        if (active) {
          setUser(result.data);
          setMode("online");
        }
      })
      .catch(() => {
        if (active) {
          setMode("offline");
        }
      });
    const handleRefresh = () => {
      fetch("/api/auth/session")
        .then((r) => (r.ok ? r.json() : null))
        .then((res) => {
          if (active && res?.data) {
            setUser(res.data);
          }
        })
        .catch(() => {});
    };
    window.addEventListener("statedock:refresh-session", handleRefresh);

    return () => {
      active = false;
      window.removeEventListener("statedock:refresh-session", handleRefresh);
    };
  }, []);

  async function signOut() {
    await api("/auth/logout", "POST");
    setUser(null);
  }

  if (mode === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <StateDockLogo className="h-10 w-10 animate-pulse" />
          <span className="font-mono text-xs text-muted-foreground">StateDock Loading…</span>
        </div>
      </div>
    );
  }

  if (mode === "local") return <WorkspaceApp />;

  if (mode === "offline") {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-4 text-center">
        <div className="space-y-3">
          <StateDockLogo className="mx-auto h-10 w-10" />
          <h2 className="text-base font-semibold">{t.app.general.offlineNotice}</h2>
          <p className="text-xs text-muted-foreground">{t.app.empty.welcomeDesc}</p>
        </div>
      </div>
    );
  }

  return user ? (
    <WorkspaceApp user={user} onSignOut={() => void signOut()} />
  ) : (
    <LoginScreen onSignedIn={setUser} />
  );
}
