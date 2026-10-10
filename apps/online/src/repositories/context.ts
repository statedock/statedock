import {
  formatPlanReference,
  NotFoundError,
  type Activity,
  type Actor,
  type Plan,
  type Project,
} from "@statedock/core";
import type { ActivityRow, PlanRow, ProjectRow } from "./rows.js";
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
export class RepositoryContext {
  constructor(
    protected readonly db: D1Database,
    protected readonly ownerId: string,
    protected readonly onPlanEvent?: (event: {
      projectId: string;
      number: number;
      reference: string;
      title: string;
      kind: "created" | "started" | "completed" | "waiting" | "dropped";
      reason?: string;
      isNew?: boolean;
      summary?: string | null;
    }) => Promise<void> | void,
    protected readonly bucket?: R2Bucket,
  ) {}
  protected async requirePlanAccess(planId: string): Promise<void> {
    const row = await this.db
      .prepare(
        "SELECT p.id FROM plans p JOIN projects pr ON pr.id=p.project_id WHERE p.id=? AND (pr.owner_id=? OR pr.id IN (SELECT project_id FROM project_members WHERE user_id=?))",
      )
      .bind(planId, this.ownerId, this.ownerId)
      .first<{ id: string }>();
    if (!row) throw new NotFoundError("Plan not found");
  }
  protected async projectId(key: string): Promise<string> {
    const row = await this.db
      .prepare(
        "SELECT id FROM projects WHERE (owner_id = ? OR id IN (SELECT project_id FROM project_members WHERE user_id = ?)) AND (id = ? OR slug = ?) LIMIT 1",
      )
      .bind(this.ownerId, this.ownerId, key, key)
      .first<{ id: string }>();
    if (!row) throw new NotFoundError("Project not found");
    return row.id;
  }
  protected project(row: ProjectRow): Project & { isOwner?: boolean } {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      localPath: row.local_path,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isOwner: row.owner_id === this.ownerId,
    };
  }
  protected plan(row: PlanRow): Plan {
    return {
      id: row.id,
      projectId: row.project_id,
      number: row.number,
      reference: formatPlanReference(row.global_number),
      title: row.title,
      body: row.body,
      summary: row.summary ?? null,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  protected activity(row: ActivityRow): Activity {
    return {
      id: row.id,
      projectId: row.project_id,
      actor: {
        id: row.actor_id,
        type: row.actor_type,
        ...(row.actor_name ? { name: row.actor_name } : {}),
      },
      action: row.action,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      details: row.details ? JSON.parse(row.details) : null,
      createdAt: row.created_at,
    };
  }
  protected async record(
    projectId: string,
    actor: Actor,
    action: string,
    subjectType: string,
    subjectId: string,
    details?: Record<string, unknown>,
  ) {
    await this.db
      .prepare(
        "INSERT INTO activities(id,project_id,actor_id,actor_type,actor_name,action,subject_type,subject_id,details,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        id(),
        projectId,
        actor.id,
        actor.type,
        actor.name ?? null,
        action,
        subjectType,
        subjectId,
        details ? JSON.stringify(details) : null,
        now(),
      )
      .run();
  }
}
