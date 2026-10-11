import type { Plan, Project } from "@statedock/core";
import { useState } from "react";
import { buildBatchInstruction } from "./batch-instruction";
import { useI18n } from "./i18n/context";

export function BatchExecution({ project, plans }: { project: Project; plans: Plan[] }) {
  const { t, lang } = useI18n();
  const b = t.app.batch;

  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const available = plans.filter((p) => p.status === "PLAN" || p.status === "READY");
  const order = selected.filter((ref) => available.some((p) => p.reference === ref));
  const instruction = buildBatchInstruction(project.slug, order, lang);

  function move(index: number, delta: number) {
    const next = [...order];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setSelected(next);
    setMessage("");
  }

  return (
    <details className="rounded-xl border bg-card p-4">
      <summary className="cursor-pointer font-medium">{b.summaryTitle(order.length)}</summary>
      <div className="mt-4 space-y-4">
        <p className="text-sm text-muted-foreground">{b.description}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {available.map((p) => (
            <label
              key={p.id}
              className="flex min-h-11 items-center gap-3 rounded-lg border p-3 text-sm cursor-pointer hover:bg-muted/30"
            >
              <input
                type="checkbox"
                checked={order.includes(p.reference)}
                onChange={(e) => {
                  setSelected(
                    e.target.checked
                      ? [...order, p.reference]
                      : order.filter((r) => r !== p.reference),
                  );
                  setMessage("");
                }}
              />
              <span>
                {p.reference} · {p.title}
              </span>
            </label>
          ))}
        </div>
        {!available.length && <p className="text-sm text-muted-foreground">{b.noTasks}</p>}
        {order.length > 0 && (
          <>
            <ol className="space-y-2">
              {order.map((ref, index) => (
                <li key={ref} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">
                    {index + 1}. {ref} · {available.find((p) => p.reference === ref)?.title}
                  </span>
                  <button
                    className="min-h-11 rounded border px-3 disabled:opacity-30"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`${ref} ${b.moveUp}`}
                  >
                    ↑
                  </button>
                  <button
                    className="min-h-11 rounded border px-3 disabled:opacity-30"
                    disabled={index === order.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`${ref} ${b.moveDown}`}
                  >
                    ↓
                  </button>
                </li>
              ))}
            </ol>
            <textarea
              aria-label={b.instructionLabel}
              className="w-full rounded border bg-background p-3 text-sm"
              rows={7}
              readOnly
              value={instruction}
            />
            <button
              className="min-h-11 rounded bg-primary px-4 text-primary-foreground font-medium"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(instruction);
                  setMessage(b.copiedMsg);
                } catch {
                  setMessage(b.copyFailedMsg);
                }
              }}
            >
              {b.copyBtn}
            </button>
          </>
        )}
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      </div>
    </details>
  );
}
