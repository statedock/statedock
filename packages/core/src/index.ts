import { z } from "zod";

export const planStatuses = ["PLAN", "WORKING", "WAITING", "DONE", "DROPPED"] as const;
export type PlanStatus = (typeof planStatuses)[number];

export const actorSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.enum(["human", "agent", "system"]).default("human"),
  name: z.string().max(200).optional(),
});
export type Actor = z.infer<typeof actorSchema>;

export const createProjectSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1).max(200),
  description: z.string().max(10000).optional(),
  localPath: z
    .string()
    .max(1000)
    .refine(
      (p) => p === "" || p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p),
      "Use an absolute local directory path",
    )
    .nullable()
    .optional(),
});
export const updateProjectSchema = createProjectSchema
  .partial()
  .omit({ slug: true })
  .refine((v) => Object.keys(v).length > 0, "At least one field is required");
export const createPlanSchema = z.object({
  title: z.string().min(1).max(300),
  body: z.string().default(""),
  summary: z.string().max(1000).nullable().optional(),
  status: z.enum(planStatuses).default("PLAN"),
});
export const updatePlanSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    body: z.string().optional(),
    summary: z.string().max(1000).nullable().optional(),
    status: z.enum(planStatuses).optional(),
    expectedUpdatedAt: z.string().optional(),
  })
  .refine(
    (v) => Object.keys(v).some((k) => k !== "expectedUpdatedAt"),
    "At least one field is required",
  );
export const fileSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(500)
    .refine(
      (p) =>
        !p.includes("\\") &&
        !p.includes("\0") &&
        p.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".."),
      "Path must be project-relative",
    ),
  content: z.string(),
});
export const activitySchema = z.object({
  action: z.string().min(1).max(200),
  subjectType: z.enum(["project", "plan", "file"]),
  subjectId: z.string().min(1),
  details: z.record(z.unknown()).optional(),
});

export interface Project {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  localPath: string | null;
  createdAt: string;
  updatedAt: string;
  isOwner?: boolean;
}
export interface Plan {
  id: string;
  projectId: string;
  number: number;
  reference: string;
  title: string;
  body: string;
  summary: string | null;
  status: PlanStatus;
  createdAt: string;
  updatedAt: string;
}
export interface MarkdownFile {
  projectId: string;
  path: string;
  content: string;
  updatedAt: string;
}
export interface Activity {
  id: string;
  projectId: string;
  actor: Actor;
  action: string;
  subjectType: "project" | "plan" | "file";
  subjectId: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

export { StateDockService, type Repository } from "./service.js";

export function formatPlanReference(number: number): string {
  return `SD-${String(z.number().int().positive().safe().parse(number)).padStart(6, "0")}`;
}
export const planLocatorSchema = z.union([
  z.object({ reference: z.string().min(1) }).strict(),
  z.object({ project: z.string().min(1), number: z.number().int().positive().safe() }).strict(),
]);
export function planCreationMessage(plan: Plan): string {
  return plan.status === "WORKING"
    ? `${plan.reference} Task 已开始：${plan.title}。`
    : `${plan.reference} 想法已记录：${plan.title}。以后可说“开始 ${plan.reference}”开始实施。`;
}

export interface PlanEvent {
  sequence: number;
  projectId: string;
  projectSlug?: string;
  reference: string;
  number: number;
  title: string;
  kind: "created" | "started" | "completed" | "waiting" | "dropped";
  createdAt: string;
}
export interface PlanEventPage {
  events: PlanEvent[];
  cursor: number;
  hasMore: boolean;
}

export interface Attachment {
  id: string;
  planId: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
}
export const attachmentSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    data: z.string().min(1).max(7_000_000),
  })
  .superRefine((value, ctx) => {
    try {
      const raw = atob(value.data),
        b = Array.from(raw.slice(0, 12), (c) => c.charCodeAt(0));
      const valid =
        value.mimeType === "image/png"
          ? b.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10"
          : value.mimeType === "image/jpeg"
            ? b[0] === 255 && b[1] === 216 && b[2] === 255
            : raw.slice(0, 4) === "RIFF" && raw.slice(8, 12) === "WEBP";
      if (!valid || raw.length > 5 * 1024 * 1024)
        ctx.addIssue({ code: "custom", message: "请选择不超过 5 MB 的 PNG、JPEG 或 WebP 图片。" });
    } catch {
      ctx.addIssue({ code: "custom", message: "图片编码无效。" });
    }
  });

export const reviewSchema = z.object({
  scope: z.string().trim().min(1).max(2000),
  verdict: z.enum(["passed", "changes_requested", "inconclusive"]),
  summary: z.string().trim().min(1).max(1000),
  limitations: z.string().max(2000).default(""),
  evidence: z.string().max(2000).default(""),
});
export const feedbackSchema = z.object({ body: z.string().trim().min(1).max(4000) });
export type ReviewInput = z.infer<typeof reviewSchema>;
export type FeedbackInput = z.infer<typeof feedbackSchema>;
export interface TaskEntry {
  id: string;
  planId: string;
  kind: "review" | "feedback";
  content: ReviewInput | FeedbackInput;
  actor: Actor;
  createdAt: string;
}

/** Human-readable task identity shared by browser and outbound notifications. */
export function formatTaskId(task: {
  projectSlug?: string;
  number: number;
  reference: string;
}): string {
  return task.projectSlug && Number.isSafeInteger(task.number) && task.number > 0
    ? `${task.projectSlug}-${task.number}`
    : task.reference;
}
export function formatTaskLabel(task: {
  projectSlug?: string;
  number: number;
  reference: string;
  title: string;
}): string {
  return `${formatTaskId(task)} · ${task.title}`;
}
