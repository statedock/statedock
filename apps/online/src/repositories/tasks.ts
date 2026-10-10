import {
  ConflictError,
  createPlanSchema,
  NotFoundError,
  updatePlanSchema,
  type Actor,
  type Plan,
  type PlanStatus,
} from "@statedock/core";
import { ProjectRepository } from "./projects.js";
import type { PlanRow } from "./rows.js";
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
export class TaskRepository extends ProjectRepository {
  async listPlans(key: string, status?: PlanStatus): Promise<Plan[]> {
    const pid = await this.projectId(key);
    const rows = await this.db
      .prepare(
        `SELECT * FROM plans WHERE project_id=? ${status ? "AND status=?" : ""} ORDER BY number`,
      )
      .bind(...(status ? [pid, status] : [pid]))
      .all<PlanRow>();
    return rows.results.map((r) => this.plan(r));
  }
  async getPlan(key: string, number: number): Promise<Plan> {
    const pid = await this.projectId(key);
    const r = await this.db
      .prepare("SELECT * FROM plans WHERE project_id=? AND number=?")
      .bind(pid, number)
      .first<PlanRow>();
    if (!r) throw new NotFoundError("Plan not found");
    return this.plan(r);
  }
  protected async planBy(where: string, value: string | number): Promise<Plan> {
    const r = await this.db
      .prepare(
        `SELECT plans.* FROM plans JOIN projects ON projects.id=plans.project_id WHERE (projects.owner_id=? OR projects.id IN (SELECT project_id FROM project_members WHERE user_id=?)) AND ${where}=?`,
      )
      .bind(this.ownerId, this.ownerId, value)
      .first<PlanRow>();
    if (!r) throw new NotFoundError("Plan not found");
    return this.plan(r);
  }
  async getPlanById(planId: string): Promise<Plan> {
    return this.planBy("plans.id", planId);
  }
  async getPlanByGlobalNumber(n: number): Promise<Plan> {
    return this.planBy("plans.global_number", n);
  }
  async createPlan(
    key: string,
    input: ReturnType<typeof createPlanSchema.parse>,
    actor: Actor,
  ): Promise<Plan> {
    const pid = await this.projectId(key);
    const at = now(),
      planId = id();
    await this.db.batch([
      this.db.prepare("UPDATE plan_sequence SET last_number=last_number+1 WHERE id=1"),
      this.db
        .prepare(
          "INSERT INTO plans(id,project_id,number,global_number,title,body,summary,status,created_at,updated_at) SELECT ?,?,COALESCE((SELECT MAX(number)+1 FROM plans WHERE project_id=?),1),last_number,?,?,?,?,?,? FROM plan_sequence WHERE id=1",
        )
        .bind(
          planId,
          pid,
          pid,
          input.title,
          input.body ?? "",
          input.summary ?? null,
          input.status,
          at,
          at,
        ),
      this.db
        .prepare(
          "INSERT INTO activities(id,project_id,actor_id,actor_type,actor_name,action,subject_type,subject_id,details,created_at) VALUES(?,?,?,?,?,'plan.created','plan',?,NULL,?)",
        )
        .bind(id(), pid, actor.id, actor.type, actor.name ?? null, planId, at),
    ]);
    const plan = await this.getPlanById(planId);
    if (this.onPlanEvent) {
      const kind =
        plan.status === "WORKING"
          ? "started"
          : plan.status === "DONE"
            ? "completed"
            : plan.status === "DROPPED"
              ? "dropped"
              : plan.status === "WAITING"
                ? "waiting"
                : "created";
      try {
        await this.onPlanEvent({
          projectId: pid,
          number: plan.number,
          reference: plan.reference,
          title: plan.title,
          kind,
          summary: plan.summary,
          reason: plan.body.slice(0, 1000),
          isNew: true,
        });
      } catch (err) {
        console.error("onPlanEvent error:", err);
      }
    }
    return plan;
  }
  async updatePlan(
    key: string,
    number: number,
    input: ReturnType<typeof updatePlanSchema.parse>,
    actor: Actor,
  ): Promise<Plan> {
    const pid = await this.projectId(key);
    const existing = await this.getPlan(pid, number);
    if (input.expectedUpdatedAt && input.expectedUpdatedAt !== existing.updatedAt)
      throw new ConflictError("Task 已被其他人或 agent 更新，请重新读取后再保存。");
    const changes = Object.entries({
      title: input.title,
      body: input.body,
      summary: input.summary,
      status: input.status,
    }).filter(([, v]) => v !== undefined);
    if (changes.length) {
      const columns: Record<string, string> = {
        title: "title",
        body: "body",
        summary: "summary",
        status: "status",
      };
      const sets = changes.map(([k]) => `${columns[k]}=?`);
      const values = changes.map(([, v]) => v);
      const at = new Date(Math.max(Date.now(), Date.parse(existing.updatedAt) + 1)).toISOString();
      const [result] = await this.db.batch([
        this.db
          .prepare(
            `UPDATE plans SET ${sets.join(",")},updated_at=? WHERE id=? AND project_id=? AND updated_at=?`,
          )
          .bind(...values, at, existing.id, pid, existing.updatedAt),
        this.db
          .prepare(
            "INSERT INTO activities(id,project_id,actor_id,actor_type,actor_name,action,subject_type,subject_id,details,created_at) SELECT ?,?,?,?,?, 'plan.updated','plan',?,?,? WHERE changes()=1",
          )
          .bind(
            id(),
            pid,
            actor.id,
            actor.type,
            actor.name ?? null,
            existing.id,
            JSON.stringify(input),
            at,
          ),
      ]);
      if (!result.meta.changes)
        throw new ConflictError("Task changed; read it again before saving");
    }
    const updated = await this.getPlan(pid, number);
    if (this.onPlanEvent && input.status && input.status !== existing.status) {
      const kind =
        input.status === "WORKING"
          ? "started"
          : input.status === "DONE"
            ? "completed"
            : input.status === "DROPPED"
              ? "dropped"
              : input.status === "WAITING"
                ? "waiting"
                : null;
      if (kind) {
        try {
          await this.onPlanEvent({
            projectId: pid,
            number: updated.number,
            reference: updated.reference,
            title: updated.title,
            kind,
            summary: updated.summary,
            reason: updated.body.slice(0, 1000),
          });
        } catch (err) {
          console.error("onPlanEvent error:", err);
        }
      }
    }
    return updated;
  }
  async movePlan(plan: Plan, targetProjectKey: string, actor: Actor): Promise<Plan> {
    const targetPid = await this.projectId(targetProjectKey);
    if (plan.projectId === targetPid) return plan;
    const targetProject = await this.getProject(targetPid);
    const sourceProject = await this.getProject(plan.projectId);
    const at = new Date(Math.max(Date.now(), Date.parse(plan.updatedAt) + 1)).toISOString();
    await this.db.batch([
      this.db
        .prepare(
          "UPDATE plans SET project_id=?,number=COALESCE((SELECT MAX(number)+1 FROM plans WHERE project_id=?),1),updated_at=? WHERE id=? AND project_id=?",
        )
        .bind(targetPid, targetPid, at, plan.id, sourceProject.id),
      this.db
        .prepare(
          "INSERT INTO activities(id,project_id,actor_id,actor_type,actor_name,action,subject_type,subject_id,details,created_at) SELECT ?,?,?,?,?,?,'plan',?,?,? WHERE EXISTS(SELECT 1 FROM plans WHERE id=? AND project_id=? AND updated_at=?)",
        )
        .bind(
          id(),
          sourceProject.id,
          actor.id,
          actor.type,
          actor.name ?? null,
          "plan.moved_out",
          plan.id,
          JSON.stringify({
            toProjectId: targetPid,
            toProjectName: targetProject.name,
            reference: plan.reference,
          }),
          at,
          plan.id,
          targetPid,
          at,
        ),
      this.db
        .prepare(
          "INSERT INTO activities(id,project_id,actor_id,actor_type,actor_name,action,subject_type,subject_id,details,created_at) SELECT ?,?,?,?,?,?,'plan',?,?,? WHERE EXISTS(SELECT 1 FROM plans WHERE id=? AND project_id=? AND updated_at=?)",
        )
        .bind(
          id(),
          targetPid,
          actor.id,
          actor.type,
          actor.name ?? null,
          "plan.moved_in",
          plan.id,
          JSON.stringify({
            fromProjectId: sourceProject.id,
            fromProjectName: sourceProject.name,
            reference: plan.reference,
          }),
          at,
          plan.id,
          targetPid,
          at,
        ),
    ]);
    return this.getPlanById(plan.id);
  }
}
