import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";
import { formatProjectName } from "@/lib/project";
import type { Project } from "@statedock/core";
import { useEffect, useState } from "react";
import { api } from "./api";

interface Preferences {
  enabled: boolean;
  projectIds: string[] | null;
  events: string[];
}

export function NotificationPreferences({
  channel,
  id,
  projects: initialProjects,
  onSaved,
}: {
  channel: "bark" | "telegram" | "discord" | "ntfy" | "webhook";
  id: string;
  projects?: Project[];
  onSaved?: (projectIds: string[] | null) => void;
}) {
  const { t } = useI18n();
  const n = t.app.notifications;

  const events: [string, string][] = [
    ["completed", n.eventCompleted],
    ["waiting", n.eventWaiting],
    ["created", n.eventCreated],
    ["started", n.eventStarted],
    ["dropped", n.eventDropped],
  ];

  const [data, setData] = useState<Preferences>({
    enabled: true,
    projectIds: null,
    events: ["completed", "waiting"],
  });
  const [projects, setProjects] = useState<Project[]>(initialProjects || []);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const path = `/auth/notifications/${channel}/${encodeURIComponent(id)}`;

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    const projectsPromise =
      initialProjects && initialProjects.length > 0
        ? Promise.resolve(initialProjects)
        : api<Project[]>("/projects");

    Promise.all([api<Preferences>(path), projectsPromise])
      .then(([pref, ps]) => {
        if (!cancelled) {
          setData(pref);
          setProjects(ps);
          setReady(true);
        }
      })
      .catch((e) => {
        if (!cancelled) setMessage(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [path, initialProjects]);

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await api(path, "PUT", data);
      setMessage(n.prefSavedMsg);
      onSaved?.(data.projectIds);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 w-full space-y-3 border-t border-border pt-3 text-xs">
      <fieldset disabled={!ready || busy} className="space-y-3 disabled:opacity-60">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={data.enabled}
            onChange={(e) => setData({ ...data, enabled: e.target.checked })}
          />
          {n.prefEnabledLabel}
        </label>
        <label className="block">
          {n.prefProjectsLabel}
          <select
            className="mt-1 w-full rounded-md border border-border bg-background p-2"
            value={data.projectIds === null ? "all" : "selected"}
            onChange={(e) => setData({ ...data, projectIds: e.target.value === "all" ? null : [] })}
          >
            <option value="all">{n.prefProjectsAll}</option>
            <option value="selected">{n.prefProjectsSelected}</option>
          </select>
        </label>
        {data.projectIds !== null && (
          <div className="max-h-36 space-y-2 overflow-y-auto rounded-md border border-border p-2">
            {projects.map((project) => (
              <label key={project.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={data.projectIds!.includes(project.id)}
                  onChange={(e) =>
                    setData({
                      ...data,
                      projectIds: e.target.checked
                        ? [...data.projectIds!, project.id]
                        : data.projectIds!.filter((id) => id !== project.id),
                    })
                  }
                />
                {formatProjectName(project, t.app.nav.inbox)}
              </label>
            ))}
            {!data.projectIds.length && (
              <p className="text-muted-foreground">{n.prefNoProjectsAlert}</p>
            )}
          </div>
        )}
        <div>
          <p className="mb-2">{n.prefEventsTitle}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-3">
            {events.map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={data.events.includes(value)}
                  onChange={(e) =>
                    setData({
                      ...data,
                      events: e.target.checked
                        ? [...data.events, value]
                        : data.events.filter((event) => event !== value),
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => void save()}>
          {n.prefSaveBtn}
        </Button>
      </fieldset>
      <p role="status" className="text-muted-foreground">
        {message}
      </p>
    </div>
  );
}
