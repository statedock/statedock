import type { ReadyQueueMode } from "./agent-queue.js";
import { z } from "zod";
import {
  activitySchema,
  actorSchema,
  attachmentSchema,
  ConflictError,
  createPlanSchema,
  createProjectSchema,
  feedbackSchema,
  fileSchema,
  ForbiddenError,
  handoffSchema,
  planLocatorSchema,
  planStatuses,
  reviewSchema,
  updatePlanSchema,
  updateProjectSchema,
  type Activity,
  type Actor,
  type Attachment,
  type CodeReference,
  type MarkdownFile,
  type Plan,
  type PlanEventPage,
  type Project,
  type TaskEntry,
} from "./index.js";
export interface Repository {
  claimReadyTask?(key: string, actor: Actor, mode: ReadyQueueMode): Promise<Plan | null>;
  listReadyTasks?(key: string, actor: Actor, mode: ReadyQueueMode): Promise<Plan[]>;

  listEntries(plan: Plan, kind: TaskEntry["kind"]): Promise<TaskEntry[]>;
  appendEntry(
    plan: Plan,
    kind: TaskEntry["kind"],
    content: TaskEntry["content"],
    actor: Actor,
  ): Promise<TaskEntry>;

  listAttachments(plan: Plan): Promise<Attachment[]>;
  writeAttachment(
    plan: Plan,
    input: ReturnType<typeof attachmentSchema.parse>,
    actor: Actor,
  ): Promise<Attachment>;
  readAttachment(id: string): Promise<Attachment & { data: string }>;
  deleteAttachment(id: string, actor: Actor): Promise<void>;
  listPlanEvents(after?: number, limit?: number): Promise<PlanEventPage>;
  listProjects(): Promise<Project[]>;
  getProject(key: string): Promise<Project>;
  createProject(
    input: ReturnType<typeof createProjectSchema.parse>,
    actor: Actor,
  ): Promise<Project>;
  updateProject(
    key: string,
    input: ReturnType<typeof updateProjectSchema.parse>,
    actor: Actor,
  ): Promise<Project>;
  deleteProject(key: string, actor: Actor): Promise<void>;
  listPlans(key: string, status?: Plan["status"]): Promise<Plan[]>;
  getPlan(key: string, number: number): Promise<Plan>;
  createPlan(
    key: string,
    input: ReturnType<typeof createPlanSchema.parse>,
    actor: Actor,
  ): Promise<Plan>;
  updatePlan(
    key: string,
    number: number,
    input: ReturnType<typeof updatePlanSchema.parse> & { codeReference?: CodeReference | null },
    actor: Actor,
  ): Promise<Plan>;
  movePlan(plan: Plan, targetProjectKey: string, actor: Actor): Promise<Plan>;
  getPlanById(id: string): Promise<Plan>;
  getPlanByGlobalNumber(number: number): Promise<Plan>;
  listFiles(key: string): Promise<MarkdownFile[]>;
  getFile(key: string, path: string): Promise<MarkdownFile>;
  writeFile(key: string, path: string, content: string, actor: Actor): Promise<MarkdownFile>;
  deleteFile(key: string, path: string, actor: Actor): Promise<void>;
  appendActivity(
    key: string,
    input: ReturnType<typeof activitySchema.parse>,
    actor: Actor,
  ): Promise<void>;
  listActivity(key: string, limit?: number): Promise<Activity[]>;
}
export class StateDockService {
  constructor(private readonly store: Repository) {}
  async listReviews(locator: unknown) {
    return this.store.listEntries(await this.resolvePlan(locator), "review");
  }
  async addReview(locator: unknown, input: unknown, actor: Actor) {
    return this.store.appendEntry(
      await this.resolvePlan(locator),
      "review",
      reviewSchema.parse(input),
      actorSchema.parse(actor),
    );
  }
  async listFeedback(locator: unknown) {
    return this.store.listEntries(await this.resolvePlan(locator), "feedback");
  }
  async addFeedback(locator: unknown, input: unknown, actor: Actor) {
    return this.store.appendEntry(
      await this.resolvePlan(locator),
      "feedback",
      feedbackSchema.parse(input),
      actorSchema.parse(actor),
    );
  }
  async listAttachments(locator: unknown) {
    return this.store.listAttachments(await this.resolvePlan(locator));
  }
  async writeAttachment(locator: unknown, input: unknown, actor: Actor) {
    const plan = await this.resolvePlan(locator);
    return this.store.writeAttachment(
      plan,
      attachmentSchema.parse(input),
      actorSchema.parse(actor),
    );
  }
  readAttachment(id: string) {
    return this.store.readAttachment(z.string().uuid().parse(id));
  }
  deleteAttachment(id: string, actor: Actor) {
    return this.store.deleteAttachment(z.string().uuid().parse(id), actorSchema.parse(actor));
  }
  async resolvePlan(input: unknown): Promise<Plan> {
    const locator = planLocatorSchema.parse(input);
    if ("project" in locator) return this.getPlan(locator.project, locator.number);
    const raw = locator.reference.trim();
    const global = /^SD-?0*([1-9][0-9]*)$/i.exec(raw);
    if (global)
      return this.store.getPlanByGlobalNumber(
        z.number().int().positive().safe().parse(Number(global[1])),
      );
    const hashScoped = /^([a-z0-9]+(?:-[a-z0-9]+)*)#([1-9][0-9]*)$/i.exec(raw);
    if (hashScoped)
      return this.getPlan(
        hashScoped[1].toLowerCase(),
        z.number().int().positive().safe().parse(Number(hashScoped[2])),
      );
    const dashScoped = /^([a-z0-9]+(?:-[a-z0-9]+)*)-([1-9][0-9]*)$/i.exec(raw);
    if (dashScoped)
      return this.getPlan(
        dashScoped[1].toLowerCase(),
        z.number().int().positive().safe().parse(Number(dashScoped[2])),
      );
    const compactScoped = /^([a-z][a-z0-9_-]*?)([1-9][0-9]*)$/i.exec(raw);
    if (compactScoped) {
      try {
        return await this.getPlan(
          compactScoped[1].toLowerCase(),
          z.number().int().positive().safe().parse(Number(compactScoped[2])),
        );
      } catch {}
    }
    return this.store.getPlanById(z.string().uuid().parse(raw));
  }
  async startPlan(input: unknown, actor: Actor): Promise<Plan> {
    const plan = await this.resolvePlan(input);
    if (plan.status === "DONE" || plan.status === "DROPPED")
      throw new ConflictError("这项工作已结束；请先明确是否重新打开。");
    if (plan.status === "WORKING") return plan;
    return this.applyPlanUpdate(
      plan.projectId,
      plan.number,
      { status: "WORKING", expectedUpdatedAt: plan.updatedAt },
      actor,
    );
  }
  listPlanEvents(after?: number, limit = 100) {
    return this.store.listPlanEvents(
      after === undefined ? undefined : z.number().int().nonnegative().safe().parse(after),
      z.number().int().min(1).max(200).parse(limit),
    );
  }
  listProjects() {
    return this.store.listProjects();
  }
  getProject(key: string) {
    return this.store.getProject(key);
  }
  createProject(input: unknown, actor: Actor) {
    return this.store.createProject(createProjectSchema.parse(input), actorSchema.parse(actor));
  }
  updateProject(key: string, input: unknown, actor: Actor) {
    return this.store.updateProject(
      key,
      updateProjectSchema.parse(input),
      actorSchema.parse(actor),
    );
  }
  deleteProject(key: string, actor: Actor) {
    return this.store.deleteProject(key, actorSchema.parse(actor));
  }
  listPlans(key: string, status?: Plan["status"]) {
    return this.store.listPlans(
      key,
      status === undefined ? undefined : z.enum(planStatuses).parse(status),
    );
  }
  getPlan(key: string, number: number) {
    return this.store.getPlan(key, z.number().int().positive().parse(number));
  }
  createPlan(key: string, input: unknown, actor: Actor) {
    return this.store.createPlan(key, createPlanSchema.parse(input), actorSchema.parse(actor));
  }
  /**
   * Edits to an existing task. An agent may only resume work (status WORKING): the goal, its
   * decisions and its outcome are written by the person, or recorded through the lifecycle
   * operations (pause, handoff, notes) that leave the original text in place.
   */
  async updatePlan(key: string, number: number, input: unknown, actor: Actor) {
    const parsed = updatePlanSchema.parse(input);
    if (actorSchema.parse(actor).type === "agent") {
      const edited = (["title", "body", "summary"] as const).filter((k) => parsed[k] !== undefined);
      if (edited.length)
        throw new ForbiddenError(
          `Agents cannot edit a task's ${edited.join(", ")}. Record what you learn with add_note, block with pause_task, and finish with submit_handoff.`,
        );
      if (parsed.status !== undefined && parsed.status !== "WORKING")
        throw new ForbiddenError(
          "Agents can only resume a task to WORKING with update_plan. Use pause_task to block and submit_handoff to finish; a person sets READY, PLAN or DROPPED.",
        );
    }
    return this.applyPlanUpdate(key, number, parsed, actor);
  }
  private applyPlanUpdate(key: string, number: number, input: unknown, actor: Actor) {
    return this.store.updatePlan(
      key,
      z.number().int().positive().parse(number),
      updatePlanSchema.parse(input),
      actorSchema.parse(actor),
    );
  }
  async movePlan(locator: unknown, targetProjectKey: string, actor: Actor) {
    const plan = await this.resolvePlan(locator);
    return this.store.movePlan(plan, targetProjectKey, actorSchema.parse(actor));
  }
  listFiles(key: string) {
    return this.store.listFiles(key);
  }
  getFile(key: string, path: string) {
    fileSchema.parse({ path, content: "" });
    return this.store.getFile(key, path);
  }
  writeFile(key: string, path: string, content: string, actor: Actor) {
    fileSchema.parse({ path, content });
    return this.store.writeFile(key, path, content, actorSchema.parse(actor));
  }
  deleteFile(key: string, path: string, actor: Actor) {
    fileSchema.parse({ path, content: "" });
    return this.store.deleteFile(key, path, actorSchema.parse(actor));
  }
  appendActivity(key: string, input: unknown, actor: Actor) {
    return this.store.appendActivity(key, activitySchema.parse(input), actorSchema.parse(actor));
  }
  listActivity(key: string, limit?: number) {
    return this.store.listActivity(
      key,
      limit === undefined ? undefined : z.number().int().min(1).max(200).parse(limit),
    );
  }
  async resumeProject(key: string) {
    const project = await this.getProject(key);
    const plans = await this.listPlans(project.id);
    const files = await this.listFiles(project.id).catch(() => []);
    const activeTasks = plans
      .filter((p) => p.status === "WORKING" || p.status === "WAITING")
      .map((p) => ({
        reference: p.reference,
        number: p.number,
        title: p.title,
        status: p.status as "WORKING" | "WAITING",
        blockerOrReason:
          p.status === "WAITING" ? (p.body.split("\n").find((l) => l.trim()) ?? null) : null,
        updatedAt: p.updatedAt,
      }));
    const lastDone =
      plans
        .filter((p) => p.status === "DONE")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
    const lastCompletedTask = lastDone
      ? {
          reference: lastDone.reference,
          number: lastDone.number,
          title: lastDone.title,
          summary: lastDone.summary,
          codeReference: lastDone.codeReference ?? null,
          completedAt: lastDone.updatedAt,
        }
      : null;
    const nextPendingTasks = plans
      .filter((p) => p.status === "READY")
      .sort((a, b) => a.number - b.number)
      .slice(0, 5)
      .map((p) => ({
        reference: p.reference,
        number: p.number,
        title: p.title,
        body: p.body,
      }));
    const plannedIdeas = plans
      .filter((p) => p.status === "PLAN")
      .sort((a, b) => a.number - b.number)
      .slice(0, 5)
      .map((p) => ({ reference: p.reference, number: p.number, title: p.title, body: p.body }));
    return {
      project: {
        id: project.id,
        slug: project.slug,
        name: project.name,
        description: project.description,
        localPath: project.localPath,
      },
      activeTasks,
      lastCompletedTask,
      nextPendingTasks,
      plannedIdeas,
      keyFiles: files.map((f) => ({ path: f.path })),
    };
  }
  async listReadyTasks(
    projectKey: string,
    actor: Actor,
    mode: ReadyQueueMode = "mine",
  ): Promise<Plan[]> {
    if (this.store.listReadyTasks)
      return this.store.listReadyTasks(projectKey, actorSchema.parse(actor), mode);
    // Standalone local repositories have no credential/profile system.
    return this.listPlans(projectKey, "READY");
  }
  async claimNextTask(
    projectKey: string,
    actor: Actor,
    mode: ReadyQueueMode = "mine",
  ): Promise<Plan | null> {
    if (this.store.claimReadyTask)
      return this.store.claimReadyTask(projectKey, actorSchema.parse(actor), mode);
    const project = await this.getProject(projectKey);
    for (let attempt = 0; attempt < 10; attempt++) {
      const plans = await this.listPlans(project.id, "READY");
      const candidate = [...plans].sort((a, b) => a.number - b.number)[0];
      if (!candidate) return null;
      try {
        return await this.applyPlanUpdate(
          project.id,
          candidate.number,
          { status: "WORKING", expectedUpdatedAt: candidate.updatedAt },
          actorSchema.parse(actor),
        );
      } catch (error) {
        if (!(error instanceof ConflictError)) throw error;
      }
    }
    throw new ConflictError("Tasks are changing; retry the claim");
  }
  async pauseTask(locator: unknown, reason: string, actor: Actor): Promise<Plan> {
    const plan = await this.resolvePlan(locator);
    if (plan.status === "DONE" || plan.status === "DROPPED")
      throw new ConflictError("这项工作已结束；无法挂起。");
    const cleanReason = reason.trim();
    const isZh = /[\u4e00-\u9fa5]/.test(cleanReason + (plan.body || ""));
    const prefix = isZh ? "⚠️ 卡点：" : "⚠️ Blocker: ";
    const updatedBody = plan.body
      ? `${prefix}${cleanReason}\n\n${plan.body}`
      : `${prefix}${cleanReason}`;
    const updated = await this.applyPlanUpdate(
      plan.projectId,
      plan.number,
      { status: "WAITING", body: updatedBody, expectedUpdatedAt: plan.updatedAt },
      actorSchema.parse(actor),
    );
    await this.appendActivity(
      plan.projectId,
      {
        action: "plan.paused",
        subjectType: "plan",
        subjectId: plan.id,
        details: { number: plan.number, reference: plan.reference, reason: cleanReason },
      },
      actorSchema.parse(actor),
    );
    return updated;
  }
  async submitHandoff(locator: unknown, input: unknown, actor: Actor): Promise<Plan> {
    const handoff = handoffSchema.parse(input);
    const plan = await this.resolvePlan(locator);
    const combined = `${handoff.changes} ${handoff.verification || ""} ${handoff.nextSteps || ""}`;
    const isZh = /[\u4e00-\u9fa5]/.test(combined);
    const formatPart = (zhLabel: string, enLabel: string, text?: string) => {
      if (!text?.trim()) return "";
      const clean = text.trim();
      if (
        /^(变更|Changes)[：:]\s*/i.test(clean) ||
        /^(验证|Verification)[：:]\s*/i.test(clean) ||
        /^(注意|Notes)[：:]\s*/i.test(clean)
      ) {
        return clean;
      }
      return `${isZh ? zhLabel : enLabel}${clean}`;
    };
    const parts: string[] = [];
    const c = formatPart("变更：", "Changes: ", handoff.changes);
    if (c) parts.push(c);
    const v = formatPart("验证：", "Verification: ", handoff.verification);
    if (v) parts.push(v);
    if (handoff.deliverables?.length) {
      const items = handoff.deliverables
        .map((d) => (d.title ? `${d.title} — ${d.location}` : d.location))
        .join(" | ");
      parts.push(`${isZh ? "成果：" : "Deliverables: "}${items}`);
    }
    const n = formatPart("注意：", "Notes: ", handoff.nextSteps);
    if (n) parts.push(n);
    const summary = parts.join(isZh ? "；" : "; ");
    const parsedActor = actorSchema.parse(actor);
    const updated = await this.store.updatePlan(
      plan.projectId,
      plan.number,
      {
        status: "DONE",
        summary,
        codeReference: handoff.codeReference ?? null,
        expectedUpdatedAt: plan.updatedAt,
      },
      parsedActor,
    );
    await this.appendActivity(
      plan.projectId,
      {
        action: "plan.handoff",
        subjectType: "plan",
        subjectId: plan.id,
        details: { number: plan.number, reference: plan.reference, ...handoff },
      },
      parsedActor,
    );
    return updated;
  }
}
