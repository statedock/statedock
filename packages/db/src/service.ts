import {
  actorSchema,
  attachmentSchema,
  ConflictError,
  formatPlanReference,
  projectKnowledgeTemplates,
  NotFoundError,
  type Activity,
  type Actor,
  type Attachment,
  type CodeReference,
  type MarkdownFile,
  type Plan,
  type PlanEventPage,
  type Project,
  type TaskEntry,
} from "@statedock/core";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import type { StateDockDb } from "./index.js";
import {
  activities,
  attachments,
  markdownFiles,
  planEvents,
  plans,
  planSequence,
  projects,
  taskEntries,
} from "./schema.js";

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const projectOut = (r: typeof projects.$inferSelect): Project => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  description: r.description,
  localPath: r.localPath,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});
const planOut = (r: typeof plans.$inferSelect): Plan => ({
  id: r.id,
  projectId: r.projectId,
  number: r.number,
  reference: formatPlanReference(r.globalNumber),
  title: r.title,
  body: r.body,
  summary: r.summary,
  codeReference: r.codeReference ? JSON.parse(r.codeReference) : null,
  status: r.status,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export class SqliteRepository {
  constructor(private readonly db: StateDockDb) {}
  async listEntries(plan: Plan, kind: TaskEntry["kind"]): Promise<TaskEntry[]> {
    const rows = await this.db
      .select()
      .from(taskEntries)
      .where(and(eq(taskEntries.planId, plan.id), eq(taskEntries.kind, kind)))
      .orderBy(asc(taskEntries.createdAt));
    return rows.map((row) => ({
      id: row.id,
      planId: row.planId,
      kind: row.kind,
      content: JSON.parse(row.content),
      actor: {
        id: row.actorId,
        type: row.actorType,
        ...(row.actorName ? { name: row.actorName } : {}),
      },
      createdAt: row.createdAt,
    }));
  }
  async appendEntry(
    plan: Plan,
    kind: TaskEntry["kind"],
    content: TaskEntry["content"],
    actor: Actor,
  ): Promise<TaskEntry> {
    const row: TaskEntry = { id: id(), planId: plan.id, kind, content, actor, createdAt: now() };
    await this.db.insert(taskEntries).values({
      id: row.id,
      planId: plan.id,
      kind,
      content: JSON.stringify(content),
      actorId: actor.id,
      actorType: actor.type,
      actorName: actor.name ?? null,
      createdAt: row.createdAt,
    });
    return row;
  }
  async listAttachments(plan: Plan): Promise<Attachment[]> {
    const rows = await this.db.select().from(attachments).where(eq(attachments.planId, plan.id));
    return rows.map(({ data, ...row }) => row);
  }
  async writeAttachment(
    plan: Plan,
    input: ReturnType<typeof attachmentSchema.parse>,
    actor: Actor,
  ): Promise<Attachment> {
    const row = {
      id: id(),
      planId: plan.id,
      ...input,
      size: atob(input.data).length,
      createdAt: now(),
    };
    await this.db.insert(attachments).values(row);
    const { data, ...result } = row;
    return result;
  }
  async readAttachment(key: string) {
    const [row] = await this.db.select().from(attachments).where(eq(attachments.id, key)).limit(1);
    if (!row) throw new NotFoundError("Attachment not found");
    return row;
  }
  async deleteAttachment(key: string, actor: Actor) {
    await this.readAttachment(key);
    await this.db.delete(attachments).where(eq(attachments.id, key));
  }
  private async requireProject(projectId: string) {
    const [p] = await this.db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!p) throw new NotFoundError("Project not found");
    return p;
  }
  private async record(
    projectId: string,
    actor: Actor,
    action: string,
    subjectType: "project" | "plan" | "file",
    subjectId: string,
    details?: Record<string, unknown>,
  ) {
    const a = actorSchema.parse(actor);
    await this.db.insert(activities).values({
      id: id(),
      projectId,
      actorId: a.id,
      actorType: a.type,
      actorName: a.name ?? null,
      action,
      subjectType,
      subjectId,
      details: details ? JSON.stringify(details) : null,
      createdAt: now(),
    });
  }
  async listPlanEvents(after?: number, limit = 100): Promise<PlanEventPage> {
    if (after === undefined) {
      const [last] = await this.db
        .select({ sequence: planEvents.sequence })
        .from(planEvents)
        .orderBy(desc(planEvents.sequence))
        .limit(1);
      return { events: [], cursor: last?.sequence ?? 0, hasMore: false };
    }
    const rows = await this.db
      .select({
        sequence: planEvents.sequence,
        projectId: planEvents.projectId,
        projectSlug: projects.slug,
        reference: planEvents.reference,
        number: planEvents.number,
        title: planEvents.title,
        kind: planEvents.kind,
        createdAt: planEvents.createdAt,
      })
      .from(planEvents)
      .leftJoin(projects, eq(projects.id, planEvents.projectId))
      .where(gt(planEvents.sequence, after))
      .orderBy(asc(planEvents.sequence))
      .limit(limit + 1);
    const events = rows.slice(0, limit).map((r) => ({
      sequence: r.sequence,
      projectId: r.projectId,
      ...(r.projectSlug ? { projectSlug: r.projectSlug } : {}),
      reference: r.reference,
      number: r.number,
      title: r.title,
      kind: r.kind,
      createdAt: r.createdAt,
    }));
    return { events, cursor: events.at(-1)?.sequence ?? after, hasMore: rows.length > limit };
  }
  async listProjects(): Promise<Project[]> {
    return (await this.db.select().from(projects).orderBy(projects.name)).map(projectOut);
  }
  async getProject(idOrSlug: string): Promise<Project> {
    const [p] = await this.db
      .select()
      .from(projects)
      .where(sql`${projects.id} = ${idOrSlug} OR ${projects.slug} = ${idOrSlug}`)
      .limit(1);
    if (!p) throw new NotFoundError("Project not found");
    return projectOut(p);
  }
  async createProject(
    input: { slug: string; name: string; description?: string; localPath?: string | null },
    actor: Actor,
  ): Promise<Project> {
    const at = now(),
      projectId = id();
    try {
      await this.db.insert(projects).values({
        id: projectId,
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        localPath: input.localPath || null,
        createdAt: at,
        updatedAt: at,
      });
    } catch (e) {
      if (String(e).toLowerCase().includes("unique"))
        throw new ConflictError("Project slug already exists");
      throw e;
    }
    await this.db.insert(markdownFiles).values(
      projectKnowledgeTemplates.map(({ path, content }) => ({
        projectId,
        path,
        content,
        updatedAt: at,
      })),
    );
    await this.record(projectId, actor, "project.created", "project", projectId);
    return await this.getProject(projectId);
  }
  async updateProject(
    projectId: string,
    input: { name?: string; description?: string; localPath?: string | null },
    actor: Actor,
  ): Promise<Project> {
    projectId = (await this.getProject(projectId)).id;
    await this.db
      .update(projects)
      .set({ ...input, updatedAt: now() })
      .where(eq(projects.id, projectId));
    await this.record(projectId, actor, "project.updated", "project", projectId, input);
    return this.getProject(projectId);
  }
  async deleteProject(projectId: string, actor: Actor): Promise<void> {
    projectId = (await this.getProject(projectId)).id;
    await this.record(projectId, actor, "project.deleted", "project", projectId);
    await this.db.delete(projects).where(eq(projects.id, projectId));
  }
  async listPlans(projectId: string, status?: Plan["status"]): Promise<Plan[]> {
    projectId = (await this.getProject(projectId)).id;
    const rows = status
      ? await this.db
          .select()
          .from(plans)
          .where(and(eq(plans.projectId, projectId), eq(plans.status, status)))
          .orderBy(plans.number)
      : await this.db
          .select()
          .from(plans)
          .where(eq(plans.projectId, projectId))
          .orderBy(plans.number);
    return rows.map(planOut);
  }
  async getPlan(projectId: string, number: number): Promise<Plan> {
    projectId = (await this.getProject(projectId)).id;
    const [row] = await this.db
      .select()
      .from(plans)
      .where(and(eq(plans.projectId, projectId), eq(plans.number, number)))
      .limit(1);
    if (!row) throw new NotFoundError("Plan not found");
    return planOut(row);
  }
  async getPlanById(planId: string): Promise<Plan> {
    const [row] = await this.db.select().from(plans).where(eq(plans.id, planId)).limit(1);
    if (!row) throw new NotFoundError("Plan not found");
    return planOut(row);
  }
  async getPlanByGlobalNumber(globalNumber: number): Promise<Plan> {
    const [row] = await this.db
      .select()
      .from(plans)
      .where(eq(plans.globalNumber, globalNumber))
      .limit(1);
    if (!row) throw new NotFoundError("Plan not found");
    return planOut(row);
  }
  async createPlan(
    projectId: string,
    input: { title: string; body: string; summary?: string | null; status: Plan["status"] },
    actor: Actor,
  ): Promise<Plan> {
    projectId = (await this.getProject(projectId)).id;
    const at = now(),
      planId = id();
    const result = await (async () => {
      const tx = this.db;
      const [counter] = await tx
        .select({ next: sql<number>`coalesce(max(${plans.number}), 0) + 1` })
        .from(plans)
        .where(eq(plans.projectId, projectId));
      const [sequence] = await tx
        .update(planSequence)
        .set({ lastNumber: sql`${planSequence.lastNumber} + 1` })
        .where(eq(planSequence.id, 1))
        .returning();
      if (!sequence) throw new Error("Plan sequence missing");
      await tx.insert(plans).values({
        globalNumber: sequence.lastNumber,
        id: planId,
        projectId,
        number: Number(counter?.next ?? 1),
        ...input,
        createdAt: at,
        updatedAt: at,
      });
      return Number(counter?.next ?? 1);
    })();
    await this.record(projectId, actor, "plan.created", "plan", planId, {
      number: result,
      title: input.title,
      body: input.body,
      status: input.status,
    });
    return this.getPlan(projectId, result);
  }
  async updatePlan(
    projectId: string,
    number: number,
    input: Partial<Pick<Plan, "title" | "body" | "summary" | "status">> & {
      codeReference?: CodeReference | null;
      expectedUpdatedAt?: string;
    },
    actor: Actor,
  ): Promise<Plan> {
    projectId = (await this.getProject(projectId)).id;
    const existing = await this.getPlan(projectId, number);
    if (input.expectedUpdatedAt && input.expectedUpdatedAt !== existing.updatedAt)
      throw new ConflictError("Plan 已被其他人或 agent 更新，请重新读取后再保存。");
    const { expectedUpdatedAt, codeReference, ...changes } = input;
    const at = new Date(Math.max(Date.now(), Date.parse(existing.updatedAt) + 1)).toISOString();
    const updated = await this.db
      .update(plans)
      .set({
        ...changes,
        ...(codeReference !== undefined
          ? { codeReference: codeReference ? JSON.stringify(codeReference) : null }
          : {}),
        updatedAt: at,
      })
      .where(and(eq(plans.id, existing.id), eq(plans.updatedAt, existing.updatedAt)))
      .returning({ id: plans.id });
    if (!updated.length) throw new ConflictError("Task changed; read it again before saving");
    // Keep the replaced text so an edit to the goal can always be compared with what it was.
    const before: Record<string, unknown> = {};
    for (const key of ["title", "body", "summary", "status"] as const)
      if (changes[key] !== undefined && changes[key] !== existing[key]) before[key] = existing[key];
    await this.record(projectId, actor, "plan.updated", "plan", existing.id, {
      ...input,
      ...(Object.keys(before).length ? { before } : {}),
    });
    return this.getPlan(projectId, number);
  }
  async movePlan(plan: Plan, targetProjectKey: string, actor: Actor): Promise<Plan> {
    const targetProject = await this.getProject(targetProjectKey);
    if (plan.projectId === targetProject.id) return plan;
    const sourceProject = await this.getProject(plan.projectId);
    const [counter] = await this.db
      .select({ next: sql<number>`COALESCE(MAX(number), 0) + 1` })
      .from(plans)
      .where(eq(plans.projectId, targetProject.id));
    const nextNumber = Number(counter?.next ?? 1);
    await this.db
      .update(plans)
      .set({ projectId: targetProject.id, number: nextNumber, updatedAt: now() })
      .where(eq(plans.id, plan.id));
    await this.record(sourceProject.id, actor, "plan.moved_out", "plan", plan.id, {
      toProjectId: targetProject.id,
      toProjectName: targetProject.name,
      reference: plan.reference,
    });
    await this.record(targetProject.id, actor, "plan.moved_in", "plan", plan.id, {
      fromProjectId: sourceProject.id,
      fromProjectName: sourceProject.name,
      reference: plan.reference,
    });
    return this.getPlanById(plan.id);
  }
  async getFile(projectId: string, path: string): Promise<MarkdownFile> {
    projectId = (await this.getProject(projectId)).id;
    const [r] = await this.db
      .select()
      .from(markdownFiles)
      .where(and(eq(markdownFiles.projectId, projectId), eq(markdownFiles.path, path)))
      .limit(1);
    if (!r) throw new NotFoundError("File not found");
    return r;
  }
  async listFiles(projectId: string): Promise<MarkdownFile[]> {
    projectId = (await this.getProject(projectId)).id;
    return this.db
      .select()
      .from(markdownFiles)
      .where(eq(markdownFiles.projectId, projectId))
      .orderBy(markdownFiles.path);
  }
  async writeFile(
    projectId: string,
    path: string,
    content: string,
    actor: Actor,
  ): Promise<MarkdownFile> {
    projectId = (await this.getProject(projectId)).id;
    const at = now();
    await this.db
      .insert(markdownFiles)
      .values({ projectId, path, content, updatedAt: at })
      .onConflictDoUpdate({
        target: [markdownFiles.projectId, markdownFiles.path],
        set: { content, updatedAt: at },
      });
    await this.record(projectId, actor, "file.written", "file", path);
    return this.getFile(projectId, path);
  }
  async appendActivity(
    projectId: string,
    input: {
      action: string;
      subjectType: "project" | "plan" | "file";
      subjectId: string;
      details?: Record<string, unknown>;
    },
    actor: Actor,
  ): Promise<void> {
    projectId = (await this.getProject(projectId)).id;
    await this.record(
      projectId,
      actor,
      input.action,
      input.subjectType,
      input.subjectId,
      input.details,
    );
  }
  async deleteFile(projectId: string, path: string, actor: Actor): Promise<void> {
    projectId = (await this.getProject(projectId)).id;
    await this.getFile(projectId, path);
    await this.db
      .delete(markdownFiles)
      .where(and(eq(markdownFiles.projectId, projectId), eq(markdownFiles.path, path)));
    await this.record(projectId, actor, "file.deleted", "file", path);
  }
  async listActivity(projectId: string, limit = 50): Promise<Activity[]> {
    const found = await this.db
      .select()
      .from(projects)
      .where(sql`${projects.id} = ${projectId} OR ${projects.slug} = ${projectId}`)
      .limit(1);
    projectId = found[0]?.id ?? projectId;
    const rows = await this.db
      .select()
      .from(activities)
      .where(eq(activities.projectId, projectId))
      .orderBy(desc(activities.createdAt))
      .limit(Math.min(Math.max(limit, 1), 200));
    if (!found.length && !rows.length) throw new NotFoundError("Project not found");
    return rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      actor: { id: r.actorId, type: r.actorType, ...(r.actorName ? { name: r.actorName } : {}) },
      action: r.action,
      subjectType: r.subjectType,
      subjectId: r.subjectId,
      details: r.details ? JSON.parse(r.details) : null,
      createdAt: r.createdAt,
    }));
  }
}

export function createRepository(db: StateDockDb) {
  const repository = new SqliteRepository(db);
  const writes = new Set([
    "createProject",
    "updateProject",
    "deleteProject",
    "createPlan",
    "updatePlan",
    "movePlan",
    "writeFile",
    "appendActivity",
    "deleteFile",
  ]);
  return new Proxy(repository, {
    get(target, property) {
      const method = Reflect.get(target, property);
      if (typeof method !== "function") return method;
      if (writes.has(String(property)))
        return (...args: unknown[]) =>
          db.transaction(async (tx) => {
            const scoped = new SqliteRepository(tx as unknown as StateDockDb);
            return Reflect.get(scoped, property).apply(scoped, args);
          });
      return method.bind(target);
    },
  });
}
