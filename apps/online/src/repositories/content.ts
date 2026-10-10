import {
  activitySchema,
  NotFoundError,
  type Activity,
  type Actor,
  type MarkdownFile,
  type PlanEventPage,
} from "@statedock/core";
import type { ActivityRow, EventRow } from "./rows.js";
import { TaskRepository } from "./tasks.js";
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
export class D1Repository extends TaskRepository {
  async listPlanEvents(after?: number, limit = 100): Promise<PlanEventPage> {
    if (after === undefined) {
      const last = await this.db
        .prepare(
          "SELECT COALESCE(MAX(sequence),0) sequence FROM plan_events e JOIN projects p ON p.id=e.project_id WHERE (p.owner_id=? OR p.id IN (SELECT project_id FROM project_members WHERE user_id=?))",
        )
        .bind(this.ownerId, this.ownerId)
        .first<{ sequence: number }>();
      return { events: [], cursor: last?.sequence ?? 0, hasMore: false };
    }
    const rows = await this.db
      .prepare(
        "SELECT e.*, p.slug project_slug FROM plan_events e JOIN projects p ON p.id=e.project_id WHERE (p.owner_id=? OR p.id IN (SELECT project_id FROM project_members WHERE user_id=?)) AND e.sequence>? ORDER BY e.sequence LIMIT ?",
      )
      .bind(this.ownerId, this.ownerId, after, limit + 1)
      .all<EventRow>();
    const events = rows.results.slice(0, limit).map((r) => ({
      sequence: r.sequence,
      projectId: r.project_id,
      projectSlug: r.project_slug,
      reference: r.reference,
      number: r.number,
      title: r.title,
      kind: r.kind,
      createdAt: r.created_at,
    }));
    return {
      events,
      cursor: events.at(-1)?.sequence ?? after,
      hasMore: rows.results.length > limit,
    };
  }
  async listFiles(key: string): Promise<MarkdownFile[]> {
    const pid = await this.projectId(key);
    const r = await this.db
      .prepare(
        "SELECT project_id projectId,path,content,updated_at updatedAt FROM markdown_files WHERE project_id=? ORDER BY path",
      )
      .bind(pid)
      .all<MarkdownFile>();
    return r.results;
  }
  async getFile(key: string, path: string): Promise<MarkdownFile> {
    const pid = await this.projectId(key);
    const r = await this.db
      .prepare(
        "SELECT project_id projectId,path,content,updated_at updatedAt FROM markdown_files WHERE project_id=? AND path=?",
      )
      .bind(pid, path)
      .first<MarkdownFile>();
    if (!r) throw new NotFoundError("File not found");
    return r;
  }
  async writeFile(key: string, path: string, content: string, actor: Actor): Promise<MarkdownFile> {
    const pid = await this.projectId(key),
      at = now();
    await this.db
      .prepare(
        "INSERT INTO markdown_files(project_id,path,content,updated_at) VALUES(?,?,?,?) ON CONFLICT(project_id,path) DO UPDATE SET content=excluded.content,updated_at=excluded.updated_at",
      )
      .bind(pid, path, content, at)
      .run();
    await this.record(pid, actor, "file.written", "file", path);
    return this.getFile(pid, path);
  }
  async deleteFile(key: string, path: string, actor: Actor): Promise<void> {
    const pid = await this.projectId(key);
    await this.getFile(pid, path);
    await this.db
      .prepare("DELETE FROM markdown_files WHERE project_id=? AND path=?")
      .bind(pid, path)
      .run();
    await this.record(pid, actor, "file.deleted", "file", path);
  }
  async appendActivity(
    key: string,
    input: ReturnType<typeof activitySchema.parse>,
    actor: Actor,
  ): Promise<void> {
    const pid = await this.projectId(key);
    await this.record(pid, actor, input.action, input.subjectType, input.subjectId, input.details);
  }
  async listActivity(key: string, limit = 50): Promise<Activity[]> {
    const pid = await this.projectId(key);
    const r = await this.db
      .prepare("SELECT * FROM activities WHERE project_id=? ORDER BY created_at DESC LIMIT ?")
      .bind(pid, Math.min(Math.max(limit, 1), 200))
      .all<ActivityRow>();
    return r.results.map((x) => this.activity(x));
  }
}
