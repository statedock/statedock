import { useEffect, useState } from "react";
import type { Project } from "@statedock/core";
import { Button } from "@/components/ui/button";
import { useI18n } from "./i18n/context";
import { api } from "./api";
import { buildReadyInstruction, type ReadyInstance } from "./ready-instruction";
export function ReadyExecution({ project }: { project: Project }) {
  const { t, lang } = useI18n();
  const labels = t.app.readyExecution;
  const [mode, setMode] = useState<"mine" | "unassigned">("mine");
  const [instance, setInstance] = useState<ReadyInstance | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    api<ReadyInstance>("/instance-info")
      .then((value) => {
        buildReadyInstruction(value, project, lang);
        if (active) setInstance(value);
      })
      .catch(() => {
        if (active) setMessage(labels.unavailable);
      });
    return () => {
      active = false;
    };
  }, [project.id, project.slug, lang, labels.unavailable]);
  const instruction = instance ? buildReadyInstruction(instance, project, lang, mode) : "";
  return (
    <div className="space-y-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{labels.title}</p>
        <select
          aria-label={lang === "zh" ? "领取模式" : "Queue mode"}
          value={mode}
          onChange={(e) => setMode(e.target.value as "mine" | "unassigned")}
          className="max-w-full rounded-md border bg-background p-2 text-xs"
        >
          <option value="mine">
            {lang === "zh" ? "只执行自己的 Ready" : "Only my Ready tasks"}
          </option>
          <option value="unassigned">
            {lang === "zh" ? "明确领取未分配任务" : "Explicitly claim unassigned tasks"}
          </option>
        </select>
        <Button
          size="sm"
          disabled={!instance}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(instruction);
              setMessage(labels.copied);
            } catch {
              setMessage(labels.copyFailed);
            }
          }}
        >
          {labels.copy}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{labels.description}</p>
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">{labels.preview}</summary>
        <textarea
          aria-label={labels.preview}
          readOnly
          value={instruction}
          rows={8}
          className="mt-2 w-full min-w-0 rounded-md border bg-background p-2 font-mono text-xs [overflow-wrap:anywhere]"
        />
      </details>
      <p role="status" className="text-xs text-muted-foreground">
        {message}
      </p>
    </div>
  );
}
