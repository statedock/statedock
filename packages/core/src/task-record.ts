import type { Actor, FeedbackInput, Plan, Project, ReviewInput, TaskEntry } from "./index.js";

export const TASK_RECORD_SPEC_VERSION = "1.0";

export interface TaskDeliverable {
  title?: string;
  location: string;
}

/** Reads the "Deliverables: title — location | …" segment written by submit_handoff. */
export function parseDeliverables(summary: string | null | undefined): TaskDeliverable[] {
  if (!summary) return [];
  const match = summary.match(
    /(?:Deliverables|成果)[：:]\s*([\s\S]*?)(?=[;；]\s*(?:Notes|注意)[：:]|$)/,
  );
  if (!match) return [];
  return match[1]
    .split(" | ")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [title, ...rest] = item.split(" — ");
      return rest.length
        ? { title: title.trim(), location: rest.join(" — ").trim() }
        : { location: item };
    });
}

export interface TaskRecord {
  specVersion: string;
  reference: string;
  number?: number;
  project?: { slug: string; name: string };
  title: string;
  body: string;
  summary: string | null;
  status: Plan["status"];
  assignedTo?: Actor | null;
  completedBy?: Actor | null;
  completedAt?: string | null;
  codeReference?: Plan["codeReference"];
  deliverables?: TaskDeliverable[];
  createdAt: string;
  updatedAt: string;
  reviews: Array<ReviewInput & { actor: Actor; createdAt: string }>;
  feedback: Array<FeedbackInput & { actor: Actor; createdAt: string }>;
}

/**
 * Maps a stored task to the public, tool-neutral Task Record (docs/spec/task-record-v1.md).
 * Nothing here depends on which agent or product did the work.
 */
export function toTaskRecord(
  plan: Plan,
  options: {
    project?: Pick<Project, "slug" | "name">;
    entries?: TaskEntry[];
    assignedTo?: Actor | null;
  } = {},
): TaskRecord {
  const entries = options.entries ?? [];
  const reviews = entries
    .filter((entry) => entry.kind === "review")
    .map((entry) => ({
      ...(entry.content as ReviewInput),
      actor: entry.actor,
      createdAt: entry.createdAt,
    }));
  const feedback = entries
    .filter((entry) => entry.kind === "feedback")
    .map((entry) => ({
      ...(entry.content as FeedbackInput),
      actor: entry.actor,
      createdAt: entry.createdAt,
    }));
  return {
    specVersion: TASK_RECORD_SPEC_VERSION,
    reference: plan.reference,
    number: plan.number,
    ...(options.project
      ? { project: { slug: options.project.slug, name: options.project.name } }
      : {}),
    title: plan.title,
    body: plan.body,
    summary: plan.summary,
    status: plan.status,
    ...(options.assignedTo !== undefined ? { assignedTo: options.assignedTo } : {}),
    completedBy: plan.completedBy ?? null,
    completedAt: plan.completedAt ?? null,
    codeReference: plan.codeReference ?? null,
    ...(parseDeliverables(plan.summary).length
      ? { deliverables: parseDeliverables(plan.summary) }
      : {}),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    reviews,
    feedback,
  };
}

export interface TaskBundle {
  specVersion: string;
  exportedAt: string;
  source?: { name?: string; origin?: string };
  tasks: TaskRecord[];
}

/** Wraps task records in the portable bundle format (docs/spec/task-bundle.v1.schema.json). */
export function toTaskBundle(
  tasks: TaskRecord[],
  options: { source?: TaskBundle["source"]; exportedAt?: string } = {},
): TaskBundle {
  return {
    specVersion: TASK_RECORD_SPEC_VERSION,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    ...(options.source ? { source: options.source } : {}),
    tasks,
  };
}
