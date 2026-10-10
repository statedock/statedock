import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/context";
import type { MarkdownFile, PlanStatus, Project } from "@statedock/core";
import { useEffect, useRef, useState } from "react";

interface Props {
  modal: "project" | "plan" | "settings" | "file" | null;
  onClose: () => void;
  project?: Project;
  createStatus: PlanStatus;
  filePath: string | null;
  files: MarkdownFile[];
  onSubmitProject: (data: {
    slug?: string;
    name: string;
    description?: string;
    localPath?: string | null;
  }) => Promise<void>;
  onSubmitPlan: (data: { title: string; body: string; status: PlanStatus }) => Promise<void>;
  onSubmitFile: (data: { path: string; content: string }) => Promise<void>;
  saving: boolean;
  error?: string;
}

export function ActionModals({
  modal,
  onClose,
  project,
  createStatus,
  filePath,
  files,
  onSubmitProject,
  onSubmitPlan,
  onSubmitFile,
  saving,
  error,
}: Props) {
  const { t } = useI18n();
  // Local state for forms
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [localPath, setLocalPath] = useState("");

  const [planTitle, setPlanTitle] = useState("");
  const [planBody, setPlanBody] = useState("");

  const [path, setPath] = useState("");
  const [content, setContent] = useState("");

  const initializedForm = useRef<string | null>(null);
  useEffect(() => {
    if (!modal) {
      initializedForm.current = null;
      return;
    }
    const identity = JSON.stringify([
      modal,
      project?.id ?? null,
      modal === "file" ? filePath : null,
    ]);
    // Polling replaces project/files objects; initialize only when opening another form.
    if (initializedForm.current === identity) return;
    initializedForm.current = identity;
    if (modal === "settings" && project) {
      setName(project.name);
      setDescription(project.description || "");
      setLocalPath(project.localPath || "");
    } else if (modal === "project") {
      setName("");
      setSlug("");
      setDescription("");
      setLocalPath("");
    } else if (modal === "plan") {
      setPlanTitle("");
      setPlanBody("");
    } else if (modal === "file") {
      setPath(filePath || "");
      const f = files.find((item) => item.path === filePath);
      setContent(f ? f.content : "");
    }
  }, [modal, project, filePath, files]);

  if (!modal) return null;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-[540px]">
        {/* Project Create or Settings */}
        {(modal === "project" || modal === "settings") && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await onSubmitProject({
                name: name.trim(),
                slug: modal === "project" ? slug.trim() : undefined,
                description: description.trim(),
                localPath: localPath.trim() || null,
              });
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>
                {modal === "project" ? t.app.modals.createProjectTitle : t.app.modals.settingsTitle}
              </DialogTitle>
              <DialogDescription>
                {modal === "project" ? t.app.modals.createProjectDesc : t.app.modals.settingsDesc}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">{t.app.modals.projectName}</label>
                <Input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.app.modals.projectNamePlaceholder}
                />
              </div>

              {modal === "project" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold">{t.app.modals.projectSlug}</label>
                  <Input
                    required
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase())}
                    placeholder={t.app.modals.projectSlugPlaceholder}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t.app.modals.projectSlugHint}
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">{t.app.modals.projectDesc}</label>
                <Textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t.app.modals.projectDescPlaceholder}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">{t.app.modals.localPath}</label>
                <Input
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                  placeholder={t.app.modals.localPathPlaceholder}
                />
                <p className="text-[11px] text-muted-foreground">{t.app.modals.localPathHint}</p>
              </div>
            </div>

            {error && <p className="text-xs text-rose-500">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
                {t.app.modals.cancel}
              </Button>
              <Button type="submit" disabled={saving || !name.trim()}>
                {saving ? t.app.modals.saving : t.app.modals.saveProject}
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* Plan Create */}
        {modal === "plan" && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await onSubmitPlan({
                title: planTitle.trim(),
                body: planBody.trim(),
                status: createStatus,
              });
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>
                {createStatus === "WORKING"
                  ? t.app.modals.planWorkingTitle
                  : t.app.modals.planIdeaTitle}
              </DialogTitle>
              <DialogDescription>
                {createStatus === "WORKING"
                  ? t.app.modals.planWorkingDesc
                  : t.app.modals.planIdeaDesc}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">
                  {createStatus === "WORKING"
                    ? t.app.modals.planWorkingField
                    : t.app.modals.planIdeaField}
                </label>
                <Input
                  required
                  value={planTitle}
                  onChange={(e) => setPlanTitle(e.target.value)}
                  placeholder={
                    createStatus === "WORKING"
                      ? t.app.modals.planWorkingPlaceholder
                      : t.app.modals.planIdeaPlaceholder
                  }
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">
                  {createStatus === "WORKING"
                    ? t.app.modals.planWorkingBodyLabel
                    : t.app.modals.planIdeaBodyLabel}
                </label>
                <Textarea
                  rows={4}
                  value={planBody}
                  onChange={(e) => setPlanBody(e.target.value)}
                  placeholder={
                    createStatus === "WORKING"
                      ? t.app.modals.planWorkingBodyPlaceholder
                      : t.app.modals.planIdeaBodyPlaceholder
                  }
                />
              </div>
            </div>

            {error && <p className="text-xs text-rose-500">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
                {t.app.modals.cancel}
              </Button>
              <Button type="submit" disabled={saving || !planTitle.trim()}>
                {saving
                  ? t.app.modals.submitting
                  : createStatus === "WORKING"
                    ? t.app.modals.planWorkingSubmit
                    : t.app.modals.planIdeaSubmit}
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* File Create or Edit */}
        {modal === "file" && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await onSubmitFile({
                path: path.trim(),
                content,
              });
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>
                {filePath ? t.app.modals.fileTitleEdit : t.app.modals.fileTitleNew}
              </DialogTitle>
              <DialogDescription>{t.app.modals.fileDesc}</DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">{t.app.modals.filePath}</label>
                <Input
                  required
                  readOnly={Boolean(filePath)}
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder={t.app.modals.filePathPlaceholder}
                  className={filePath ? "bg-muted font-mono" : "font-mono"}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">{t.app.modals.fileContent}</label>
                <Textarea
                  rows={12}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={t.app.modals.fileContentPlaceholder}
                  className="font-mono text-xs leading-relaxed"
                />
              </div>
            </div>

            {error && <p className="text-xs text-rose-500">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
                {t.app.modals.cancel}
              </Button>
              <Button type="submit" disabled={saving || !path.trim()}>
                {saving ? t.app.modals.saving : t.app.modals.saveFile}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
