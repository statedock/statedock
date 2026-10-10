import {
  ConflictError,
  createProjectSchema,
  NotFoundError,
  updateProjectSchema,
  type Actor,
  type Project,
} from "@statedock/core";
import { deleteStoredObjects } from "../storage-service.js";
import { AttachmentRepository } from "./attachments.js";
import type { ProjectRow } from "./rows.js";
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
export class ProjectRepository extends AttachmentRepository {
  async listProjects(): Promise<Project[]> {
    const r = await this.db
      .prepare(
        "SELECT * FROM projects WHERE owner_id=? OR id IN (SELECT project_id FROM project_members WHERE user_id=?) ORDER BY name",
      )
      .bind(this.ownerId, this.ownerId)
      .all<ProjectRow>();
    return r.results.map((x) => this.project(x));
  }
  async getProject(key: string): Promise<Project> {
    const pid = await this.projectId(key);
    const r = await this.db
      .prepare("SELECT * FROM projects WHERE id=?")
      .bind(pid)
      .first<ProjectRow>();
    if (!r) throw new NotFoundError("Project not found");
    return this.project(r);
  }
  async createProject(
    input: ReturnType<typeof createProjectSchema.parse>,
    actor: Actor,
  ): Promise<Project> {
    const at = now(),
      pid = id();
    try {
      const result = await this.db
        .prepare(
          "INSERT INTO projects(id,owner_id,slug,name,description,local_path,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
        )
        .bind(
          pid,
          this.ownerId,
          input.slug,
          input.name,
          input.description ?? null,
          input.localPath || null,
          at,
          at,
        )
        .run();
      if (!result.meta.changes) throw new ConflictError("Project creation failed");
    } catch (e) {
      if (String(e).toLowerCase().includes("unique"))
        throw new ConflictError("Project slug already exists");
      throw e;
    }
    await this.record(pid, actor, "project.created", "project", pid);
    return this.getProject(pid);
  }
  async updateProject(
    key: string,
    input: ReturnType<typeof updateProjectSchema.parse>,
    actor: Actor,
  ): Promise<Project> {
    const pid = await this.projectId(key);
    const owner = await this.db
      .prepare("SELECT owner_id FROM projects WHERE id=?")
      .bind(pid)
      .first<{ owner_id: string }>();
    if (owner?.owner_id !== this.ownerId)
      throw new ConflictError("Only the project owner can update project settings");
    const at = now();
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const [k, col] of [
      ["name", "name"],
      ["description", "description"],
      ["localPath", "local_path"],
    ] as const)
      if (input[k] !== undefined) {
        fields.push(`${col}=?`);
        values.push(input[k]);
      }
    await this.db
      .prepare(`UPDATE projects SET ${fields.join(",")},updated_at=? WHERE id=? AND owner_id=?`)
      .bind(...values, at, pid, this.ownerId)
      .run();
    await this.record(pid, actor, "project.updated", "project", pid, input);
    return this.getProject(pid);
  }
  async deleteProject(key: string, actor: Actor): Promise<void> {
    const pid = await this.projectId(key);
    const row = await this.db
      .prepare("SELECT owner_id FROM projects WHERE id = ?")
      .bind(pid)
      .first<{ owner_id: string }>();
    if (row?.owner_id !== this.ownerId) {
      throw new ConflictError("只有项目的创世人(Owner)有权删除该项目");
    }
    const attachments = await this.db
      .prepare(
        "SELECT a.object_key FROM attachments a JOIN plans p ON p.id=a.plan_id WHERE p.project_id=?",
      )
      .bind(pid)
      .all<{ object_key: string }>();
    if (attachments.results.length && !this.bucket)
      throw new Error("Attachment storage unavailable");
    await this.record(pid, actor, "project.deleted", "project", pid);
    const mutation = this.db
      .prepare("DELETE FROM projects WHERE id=? AND owner_id=?")
      .bind(pid, this.ownerId);
    if (attachments.results.length)
      await deleteStoredObjects(
        this.db,
        this.bucket!,
        attachments.results.map((a) => a.object_key),
        mutation,
      );
    else await mutation.run();
  }
}
