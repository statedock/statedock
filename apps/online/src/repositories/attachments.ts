import {
  attachmentSchema,
  NotFoundError,
  type Actor,
  type Attachment,
  type Plan,
  type TaskEntry,
} from "@statedock/core";
import { Buffer } from "node:buffer";
import { deleteStoredObjects } from "../storage-service.js";
import { RepositoryContext } from "./context.js";
import type { EntryRow } from "./rows.js";
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
export class AttachmentRepository extends RepositoryContext {
  async listEntries(plan: Plan, kind: TaskEntry["kind"]): Promise<TaskEntry[]> {
    await this.requirePlanAccess(plan.id);
    const rows = await this.db
      .prepare(
        "SELECT e.* FROM task_entries e JOIN plans p ON p.id=e.plan_id JOIN projects pr ON pr.id=p.project_id WHERE e.plan_id=? AND e.kind=? AND (pr.owner_id=? OR pr.id IN (SELECT project_id FROM project_members WHERE user_id=?)) ORDER BY e.created_at,e.rowid",
      )
      .bind(plan.id, kind, this.ownerId, this.ownerId)
      .all<EntryRow>();
    return rows.results.map((row) => ({
      id: row.id,
      planId: row.plan_id,
      kind: row.kind,
      content: JSON.parse(row.content),
      actor: {
        id: row.actor_id,
        type: row.actor_type,
        ...(row.actor_name ? { name: row.actor_name } : {}),
      },
      createdAt: row.created_at,
    }));
  }
  async appendEntry(
    plan: Plan,
    kind: TaskEntry["kind"],
    content: TaskEntry["content"],
    actor: Actor,
  ): Promise<TaskEntry> {
    await this.requirePlanAccess(plan.id);
    const row: TaskEntry = { id: id(), planId: plan.id, kind, content, actor, createdAt: now() };
    await this.db
      .prepare(
        "INSERT INTO task_entries(id,plan_id,kind,content,actor_id,actor_type,actor_name,created_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .bind(
        row.id,
        plan.id,
        kind,
        JSON.stringify(content),
        actor.id,
        actor.type,
        actor.name ?? null,
        row.createdAt,
      )
      .run();
    return row;
  }
  async listAttachments(plan: Plan): Promise<Attachment[]> {
    const rows = await this.db
      .prepare(
        "SELECT a.id,a.plan_id planId,a.name,a.mime_type mimeType,a.size,a.created_at createdAt FROM attachments a JOIN plans p ON p.id=a.plan_id JOIN projects pr ON pr.id=p.project_id WHERE a.plan_id=? AND (pr.owner_id=? OR pr.id IN (SELECT project_id FROM project_members WHERE user_id=?)) ORDER BY a.created_at",
      )
      .bind(plan.id, this.ownerId, this.ownerId)
      .all<Attachment>();
    return rows.results;
  }
  async writeAttachment(
    plan: Plan,
    input: ReturnType<typeof attachmentSchema.parse>,
    actor: Actor,
  ): Promise<Attachment> {
    await this.requirePlanAccess(plan.id);
    if (!this.bucket) throw new Error("Attachment storage unavailable");
    const key = id(),
      objectKey = `${this.ownerId}/${plan.id}/${key}`,
      bytes = Buffer.from(input.data, "base64"),
      at = now();
    await this.bucket.put(objectKey, bytes, { httpMetadata: { contentType: input.mimeType } });
    try {
      await this.db
        .prepare(
          "INSERT INTO attachments(id,plan_id,name,mime_type,size,object_key,created_at) VALUES(?,?,?,?,?,?,?)",
        )
        .bind(key, plan.id, input.name, input.mimeType, bytes.length, objectKey, at)
        .run();
    } catch (error) {
      await this.bucket.delete(objectKey);
      throw error;
    }
    return {
      id: key,
      planId: plan.id,
      name: input.name,
      mimeType: input.mimeType,
      size: bytes.length,
      createdAt: at,
    };
  }
  protected async attachmentRow(key: string) {
    const row = await this.db
      .prepare(
        "SELECT a.id,a.plan_id planId,a.name,a.mime_type mimeType,a.size,a.created_at createdAt,a.object_key objectKey FROM attachments a JOIN plans p ON p.id=a.plan_id JOIN projects pr ON pr.id=p.project_id WHERE a.id=? AND (pr.owner_id=? OR pr.id IN (SELECT project_id FROM project_members WHERE user_id=?))",
      )
      .bind(key, this.ownerId, this.ownerId)
      .first<Attachment & { objectKey: string }>();
    if (!row) throw new NotFoundError("Attachment not found");
    return row;
  }
  async readAttachment(key: string) {
    const { objectKey, ...row } = await this.attachmentRow(key);
    const object = await this.bucket?.get(objectKey);
    if (!object) throw new NotFoundError("Attachment not found");
    return { ...row, data: Buffer.from(await object.arrayBuffer()).toString("base64") };
  }
  async deleteAttachment(key: string, actor: Actor) {
    const row = await this.attachmentRow(key);
    if (!this.bucket) throw new Error("Attachment storage unavailable");
    await deleteStoredObjects(
      this.db,
      this.bucket,
      [row.objectKey],
      this.db.prepare("DELETE FROM attachments WHERE id=?").bind(key),
    );
  }
}
