import { useEffect, useState } from "react";
import type { Project } from "@statedock/core";
import { Button } from "@/components/ui/button";
import { useI18n } from "./i18n/context";
import { api } from "./api";
import { buildReadyInstruction, type ReadyInstance } from "./ready-instruction";
export function ReadyExecution({ project }: { project: Project }) {
  const { t, lang } = useI18n();
  const labels = t.app.readyExecution;
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
  const instruction = instance ? buildReadyInstruction(instance, project, lang) : "";
  return (
    <div className="space-y-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{labels.title}</p>
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
