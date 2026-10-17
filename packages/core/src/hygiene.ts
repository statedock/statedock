import type { Plan } from "./index.js";

export type HygieneKind =
  | "stale_active"
  | "done_without_handoff"
  | "done_unverified"
  | "untitled"
  | "possible_duplicate";

export interface HygieneIssue {
  kind: HygieneKind;
  reference: string;
  title: string;
  detail: string;
  /** What an agent may propose. Nothing here is applied automatically. */
  suggestion: string;
  relatedReference?: string;
}

export interface HygieneReport {
  checkedAt: string;
  total: number;
  counts: Record<HygieneKind, number>;
  issues: HygieneIssue[];
  truncated: boolean;
}

export interface HygieneOptions {
  now?: Date;
  /** WORKING tasks untouched for this many days are flagged for reconciliation. */
  staleDays?: number;
  /** Character-bigram similarity (0 to 1) above which two open tasks are flagged. */
  duplicateThreshold?: number;
  limit?: number;
}

const DAY_MS = 86_400_000;

function bigrams(title: string): Set<string> {
  const text = title.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
  const grams = new Set<string>();
  for (let i = 0; i < text.length - 1; i++) grams.add(text.slice(i, i + 2));
  return grams;
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * Read-only review of a project's tasks. It only reports; whether to fix anything is decided by
 * an agent or person afterwards, so records are never changed silently.
 */
export function findHygieneIssues(plans: Plan[], options: HygieneOptions = {}): HygieneReport {
  const now = options.now ?? new Date();
  const staleMs = (options.staleDays ?? 3) * DAY_MS;
  const threshold = options.duplicateThreshold ?? 0.7;
  const limit = options.limit ?? 50;
  const issues: HygieneIssue[] = [];

  for (const plan of plans) {
    if (plan.status === "WORKING") {
      const idle = now.getTime() - new Date(plan.updatedAt).getTime();
      if (idle > staleMs) {
        issues.push({
          kind: "stale_active",
          reference: plan.reference,
          title: plan.title,
          detail: `WORKING with no update for ${Math.floor(idle / DAY_MS)} days.`,
          suggestion:
            "Check whether it is really in progress. If it is finished, submit a handoff; if blocked, pause it; if abandoned, drop it.",
        });
      }
    }
    if (plan.status === "DONE" && (!plan.summary?.trim() || !plan.completedBy)) {
      issues.push({
        kind: "done_without_handoff",
        reference: plan.reference,
        title: plan.title,
        detail: !plan.summary?.trim()
          ? "DONE without an outcome summary."
          : "DONE without a recorded completer.",
        suggestion:
          "Reconstruct the outcome from the repository or task history and add a note. Do not invent verification that did not happen.",
      });
    }
    if (plan.status === "DONE" && plan.summary?.trim() && plan.completedBy) {
      // The handoff summary is assembled as "Changes: …; Verification: …; Notes: …".
      const match = plan.summary.match(/(?:verification|验证)\s*[:：]\s*([^;；]*)/i);
      if (!match || match[1].trim().length < 3) {
        issues.push({
          kind: "done_unverified",
          reference: plan.reference,
          title: plan.title,
          detail: "The outcome has no verification evidence.",
          suggestion:
            "A different identity can run an independent review against the task's acceptance criteria and record it with add_review. Do not add evidence that was not actually gathered.",
        });
      }
    }
    if (plan.title.trim().length < 3) {
      issues.push({
        kind: "untitled",
        reference: plan.reference,
        title: plan.title,
        detail: "The title is empty or too short to identify the goal.",
        suggestion: "Propose a title from the task body and ask before changing it.",
      });
    }
  }

  const open = plans.filter((plan) => plan.status === "PLAN" || plan.status === "READY");
  const grams = open.map((plan) => bigrams(plan.title));
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      if (similarity(grams[i], grams[j]) >= threshold) {
        issues.push({
          kind: "possible_duplicate",
          reference: open[j].reference,
          relatedReference: open[i].reference,
          title: open[j].title,
          detail: `Similar to ${open[i].reference}: ${open[i].title}`,
          suggestion:
            "If they describe the same goal, keep one, copy any missing decisions into it, and drop the other with a reason.",
        });
      }
    }
  }

  const counts: Record<HygieneKind, number> = {
    stale_active: 0,
    done_without_handoff: 0,
    done_unverified: 0,
    untitled: 0,
    possible_duplicate: 0,
  };
  for (const issue of issues) counts[issue.kind]++;
  return {
    checkedAt: now.toISOString(),
    total: issues.length,
    counts,
    issues: issues.slice(0, limit),
    truncated: issues.length > limit,
  };
}
