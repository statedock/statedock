import { Button } from "@/components/ui/button";
import { TaskCard } from "./components/plans/TaskCard";
import { formatProjectName } from "@/lib/project";
import type { Plan, Project } from "@statedock/core";
import { useEffect, useState } from "react";
import { api } from "./api";
import { uploadImage } from "./Attachments";
import { useI18n } from "./i18n/context";

export function QuickCapture({
  projects,
  projectId,
  onProject,
  onSaved,
  onOpen,
}: {
  projects: Project[];
  projectId: string;
  onProject: (id: string) => void;
  onSaved: () => void;
  onOpen: (plan: Plan) => void;
}) {
  const { t, lang } = useI18n();
  const qc = t.app.quickCapture;

  const [description, setDescription] = useState(
    () => localStorage.getItem("statedock.capture.draft") ?? "",
  );
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<Plan | null>(null);
  const [saved, setSaved] = useState<Plan | null>(null);

  useEffect(() => {
    localStorage.setItem("statedock.capture.draft", description);
  }, [description]);

  async function save() {
    setBusy(true);
    setMessage("");
    let plan = pending;
    try {
      if (!plan) {
        plan = await api<Plan>(`/projects/${projectId}/plans`, "POST", {
          title: (title.trim() || description.trim().split("\n")[0] || qc.screenshotTitle).slice(
            0,
            100,
          ),
          body: description.trim(),
          status: "PLAN",
        });
        setPending(plan);
        onSaved();
      }
      for (let i = 0; i < files.length; i++) {
        try {
          await uploadImage(plan.reference, files[i]);
        } catch (error) {
          setFiles(files.slice(i));
          throw error;
        }
      }
      setSaved(plan);
      setPending(null);
      setDescription("");
      setTitle("");
      setFiles([]);
      setMessage(
        lang === "zh"
          ? `${plan.reference} 已记录，等待安排。`
          : `${plan.reference} saved to backlog.`,
      );
      onSaved();
    } catch (error) {
      setMessage(
        `${plan ? plan.reference + (lang === "zh" ? " 已创建；" : " created; ") : ""}${
          (error as Error).message
        }`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-primary/20 bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{qc.title}</h2>
        <select
          aria-label={qc.recordToProject}
          value={projectId}
          disabled={busy || !!pending}
          onChange={(e) => onProject(e.target.value)}
          className="max-w-[60%] rounded-lg border border-border bg-background p-2 text-sm"
        >
          {projects.map((project) => (
            <option value={project.id} key={project.id}>
              {formatProjectName(project, t.app.nav.inbox)}
            </option>
          ))}
        </select>
      </div>
      <textarea
        id="quick-capture-description"
        aria-label="description"
        value={description}
        disabled={busy || !!pending}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        placeholder={qc.placeholder}
        className="w-full rounded-lg border border-border bg-background p-3 text-base"
      />
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">{qc.editTitle}</summary>
        <input
          aria-label="title"
          maxLength={100}
          value={title}
          disabled={busy || !!pending}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={description.trim().split("\n")[0].slice(0, 100) || qc.screenshotTitle}
          className="mt-2 w-full rounded-lg border border-border bg-background p-2 text-sm"
        />
      </details>
      <label className="block text-xs text-muted-foreground">
        {qc.addImages}
        <input
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          disabled={busy || !!pending}
          className="mt-2 block w-full text-xs"
          onChange={(e) => {
            const selected = Array.from(e.target.files ?? []);
            if (
              selected.some(
                (f) =>
                  f.size > 5 * 1024 * 1024 ||
                  !["image/png", "image/jpeg", "image/webp"].includes(f.type),
              )
            ) {
              setMessage(qc.imageSizeAlert);
              return;
            }
            setFiles(selected.slice(0, 5));
          }}
        />
      </label>
      {!!files.length && (
        <p className="break-words text-xs text-muted-foreground">
          {files.map((f) => f.name).join(" · ")}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{qc.savePlanHint}</span>
        <Button
          disabled={busy || !projectId || (!description.trim() && !files.length && !pending)}
          onClick={() => void save()}
        >
          {busy ? qc.saving : pending ? qc.retryUpload : qc.saveIdea}
        </Button>
      </div>
      {pending && !busy && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSaved(pending);
            setPending(null);
            setDescription("");
            setTitle("");
            setFiles([]);
            setMessage(qc.taskKept);
          }}
        >
          {qc.keepTask}
        </Button>
      )}
      <p role="status" className="text-xs text-muted-foreground">
        {message}
      </p>
      {saved && (
        <Button size="sm" variant="outline" onClick={() => onOpen(saved)}>
          {qc.viewSaved(saved.reference)}
        </Button>
      )}
    </section>
  );
}

export function CaptureHome({
  projects,
  projectId,
  plans,
  onProject,
  onSaved,
  onOpen,
  onTasks,
}: {
  projects: Project[];
  projectId: string;
  plans: Plan[];
  onProject: (id: string) => void;
  onSaved: () => void;
  onOpen: (plan: Plan) => void;
  onTasks: () => void;
}) {
  const { t } = useI18n();
  const qc = t.app.quickCapture;

  const waiting = plans.filter((p) => p.status === "WAITING");
  const done = plans
    .filter((p) => p.status === "DONE")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4);

  function list(items: Plan[]) {
    return items.map((plan) => (
      <TaskCard
        key={plan.id}
        plan={plan}
        project={projects.find((item) => item.id === plan.projectId)}
        taskRef={plan.reference}
        onOpen={onOpen}
      />
    ));
  }

  return (
    <div className="space-y-6">
      <QuickCapture
        projects={projects}
        projectId={projectId}
        onProject={onProject}
        onSaved={onSaved}
        onOpen={onOpen}
      />
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{qc.waitingCount(waiting.length)}</h2>
        {waiting.length ? (
          list(waiting)
        ) : (
          <p className="text-xs text-muted-foreground">{qc.noWaiting}</p>
        )}
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{qc.recentDone}</h2>
        {done.length ? list(done) : <p className="text-xs text-muted-foreground">{qc.noDone}</p>}
      </section>
      <Button variant="outline" className="w-full" onClick={onTasks}>
        {qc.plannedCount(plans.filter((p) => p.status === "PLAN").length)}
      </Button>
    </div>
  );
}
