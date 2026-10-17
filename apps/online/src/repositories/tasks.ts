import {
  ConflictError,
  readyQueueClaim,
  readyQueuePredicate,
  type ReadyQueueMode,
  createPlanSchema,
  NotFoundError,
  updatePlanSchema,
  type Actor,
  type CodeReference,
  type Plan,
  type PlanStatus,
} from "@statedock/core";
import { ProjectRepository } from "./projects.js";
import type { PlanRow } from "./rows.js";
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
export class TaskRepository extends ProjectRepository {
  private async queuePrincipal(actor: Actor) {
    if (actor.type !== "agent" || !actor.agentId)
      throw new ConflictError(
        "请先在 MCP 凭据设置中绑定 Agent；旧 OAuth 连接需重新授权。Bind this credential to an Agent profile first.",
      );
    const profile = await this.db
      .prepare("SELECT id FROM agent_profiles WHERE id=? AND user_id=? AND deleted_at IS NULL")
      .bind(actor.agentId, this.ownerId)
      .first();
    if (!profile) throw new ConflictError("Agent profile is not available for this account");
    return { userId: this.ownerId, agentId: actor.agentId };
  }
  async listReadyTasks(key: string, actor: Actor, mode: ReadyQueueMode = "mine"): Promise<Plan[]> {
    const pid = await this.projectId(key);
    const principal = await this.queuePrincipal(actor);
    const predicate = readyQueuePredicate(principal, mode);
    const rows = await this.db
      .prepare(`SELECT * FROM plans WHERE project_id=? AND ${predicate.sql} ORDER BY number`)
      .bind(pid, ...predicate.bindings)
      .all<PlanRow>();
    return rows.results.map((row) => this.plan(row));
  }
  async claimReadyTask(
    key: string,
    actor: Actor,
    mode: ReadyQueueMode = "mine",
  ): Promise<Plan | null> {
    const pid = await this.projectId(key);
    const principal = await this.queuePrincipal(actor);
    const at = now();
    const claimId = id();
    const query = readyQueueClaim(pid, principal, at, mode, claimId);
    const [result] = await this.db.batch([
      this.db.prepare(query.sql).bind(...query.bindings),
      this.db
        .prepare(
          "INSERT INTO activities(id,project_id,actor_id,actor_type,actor_name,action,subject_type,subject_id,details,created_at) SELECT ?,project_id,?,?,?,'plan.claimed','plan',id,?,? FROM plans WHERE project_id=? AND claimed_agent_id=? AND claim_id=? AND changes()=1",
        )
        .bind(
          id(),
          actor.id,
          actor.type,
          actor.name ?? null,
          JSON.stringify({ mode, agentId: actor.agentId }),
          at,
          pid,
          actor.agentId!,
          claimId,
        ),
    ]);
    const row = result.results[0] as PlanRow | undefined;
    if (!row) return null;
    const plan = this.plan(row);
    if (this.onPlanEvent) {
      try {
        await this.onPlanEvent({
          projectId: pid,
          number: plan.number,
          reference: plan.reference,
          title: plan.title,
          kind: "started",
        });
      } catch (error) {
        console.error("onPlanEvent error:", error);
      }
    }
    return plan;
  }
  private async requireAssigneeAccess(pid: string, agentId: string) {
    const row = await this.db
      .prepare(
        "SELECT a.id FROM agent_profiles a WHERE a.id=? AND a.deleted_at IS NULL AND EXISTS(SELECT 1 FROM projects p WHERE p.id=? AND (p.owner_id=a.user_id OR EXISTS(SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=a.user_id)))",
      )
      .bind(agentId, pid)
      .first();
    if (!row) throw new ConflictError("Assigned Agent must belong to a project member");
  }

  /** Completion is the latest explicit DONE write, never inferred from assignment/claim. */
  private async withCompletion(plans: Plan[]): Promise<Plan[]> {
    if (!plans.some((p) => p.status === "DONE")) return plans;
    const rows = await this.db
      .prepare(
        `SELECT a.subject_id,a.actor_id,a.actor_type,COALESCE(ap.name,a.actor_name) AS actor_name,a.created_at
       FROM activities a JOIN plans p ON p.id=a.subject_id
       LEFT JOIN agent_profiles ap ON a.actor_type='agent' AND a.actor_id='agent:'||ap.id
       WHERE p.project_id=? AND p.status='DONE' AND a.subject_type='plan'
       AND a.action IN ('plan.updated','plan.created')
       AND CASE WHEN json_valid(a.details) THEN json_extract(a.details,'$.status') END='DONE'
       AND CASE WHEN json_valid(a.details) THEN json_extract(a.details,'$.completionTransition') END IS NOT 0
       ORDER BY a.created_at DESC,a.id DESC`,
      )
      .bind(plans[0].projectId)
      .all<{
        subject_id: string;
        actor_id: string;
        actor_type: Actor["type"];
        actor_name: string | null;
        created_at: string;
      }>();
    const latest = new Map<string, (typeof rows.results)[number]>();
    for (const row of rows.results)
      if (!latest.has(row.subject_id)) latest.set(row.subject_id, row);
    return plans.map((plan) => {
      if (plan.status !== "DONE") return plan;
      const row = latest.get(plan.id);
      return {
        ...plan,
        completedBy: row
          ? {
              id: row.actor_id,
              type: row.actor_type,
              ...(row.actor_name ? { name: row.actor_name } : {}),
              ...(row.actor_type === "agent" && row.actor_id.startsWith("agent:")
                ? { agentId: row.actor_id.slice(6) }
                : {}),
            }
          : null,
        completedAt: row?.created_at ?? null,
      };
    });
  }

  async listPlans(key: string, status?: PlanStatus): Promise<Plan[]> {
    const pid = await this.projectId(key);
    const rows = await this.db
      .prepare(
        `SELECT * FROM plans WHERE project_id=? ${status ? "AND status=?" : ""} ORDER BY number`,
      )
      .bind(...(status ? [pid, status] : [pid]))
      .all<PlanRow>();
    return this.withCompletion(rows.results.map((r) => this.plan(r)));
  }
  async getPlan(key: string, number: number): Promise<Plan> {
    const pid = await this.projectId(key);
    const r = await this.db
      .prepare("SELECT * FROM plans WHERE project_id=? AND number=?")
      .bind(pid, number)
      .first<PlanRow>();
    if (!r) throw new NotFoundError("Plan not found");
    return (await this.withCompletion([this.plan(r)]))[0];
  }
  protected async planBy(where: string, value: string | number): Promise<Plan> {
    const r = await this.db
      .prepare(
        `SELECT plans.* FROM plans JOIN projects ON projects.id=plans.project_id WHERE (projects.owner_id=? OR projects.id IN (SELECT project_id FROM project_members WHERE user_id=?)) AND ${where}=?`,
      )
      .bind(this.ownerId, this.ownerId, value)
      .first<PlanRow>();
    if (!r) throw new NotFoundError("Plan not found");
    return (await this.withCompletion([this.plan(r)]))[0];
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
      // Never trust the counter alone: a row written straight into the database ahead of it would
      // otherwise make every later create fail on the unique plans.global_number constraint.
      this.db.prepare(
        "UPDATE plan_sequence SET last_number=MAX(last_number,(SELECT COALESCE(MAX(global_number),0) FROM plans))+1 WHERE id=1",
      ),
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
          "INSERT INTO activities(id,project_id,actor_id,actor_type,actor_name,action,subject_type,subject_id,details,created_at) VALUES(?,?,?,?,?,'plan.created','plan',?,?,?)",
        )
        .bind(
          id(),
          pid,
          actor.id,
          actor.type,
          actor.name ?? null,
          planId,
          JSON.stringify({ status: input.status, title: input.title, body: input.body ?? "" }),
          at,
        ),
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
    input: ReturnType<typeof updatePlanSchema.parse> & { codeReference?: CodeReference | null },
    actor: Actor,
  ): Promise<Plan> {
    const pid = await this.projectId(key);
    const existing = await this.getPlan(pid, number);
    if (input.expectedUpdatedAt && input.expectedUpdatedAt !== existing.updatedAt)
      throw new ConflictError("Task 已被其他人或 agent 更新，请重新读取后再保存。");
    if (input.assignedAgentId !== undefined && input.assignedAgentId !== existing.assignedAgentId) {
      if (actor.type !== "human")
        throw new ConflictError("Only a human can assign or transfer tasks");
      if (existing.status === "WORKING" && input.status !== "READY")
        throw new ConflictError(
          "请先显式退回 Ready 再交接；不能转移正在执行的任务。Return this task to Ready explicitly before transferring it.",
        );
      if (input.assignedAgentId) await this.requireAssigneeAccess(pid, input.assignedAgentId);
    }
    if (
      actor.type === "agent" &&
      existing.assignedAgentId &&
      actor.agentId !== existing.assignedAgentId
    )
      throw new ConflictError(
        "This task belongs to another Agent; request an explicit human handoff",
      );
    if (
      actor.type === "agent" &&
      existing.claimedAgentId &&
      actor.agentId !== existing.claimedAgentId
    )
      throw new ConflictError("This task is being executed by another Agent");
    const changes = Object.entries({
      title: input.title,
      body: input.body,
      summary: input.summary,
      codeReference: input.codeReference,
      status: input.status,
      assignedAgentId: input.assignedAgentId,
      claimedAgentId: input.status === "READY" ? null : undefined,
      claimId: input.status === "READY" ? null : undefined,
    }).filter(([, v]) => v !== undefined);
    const before: Record<string, unknown> = {};
    for (const key of ["title", "body", "summary", "status", "assignedAgentId"] as const)
      if (input[key] !== undefined && input[key] !== existing[key]) before[key] = existing[key];
    if (changes.length) {
      const columns: Record<string, string> = {
        title: "title",
        body: "body",
        summary: "summary",
        codeReference: "code_reference",
        status: "status",
        assignedAgentId: "assigned_agent_id",
        claimedAgentId: "claimed_agent_id",
        claimId: "claim_id",
      };
      const sets = changes.map(([k]) => `${columns[k]}=?`);
      const values = changes.map(([key, value]) =>
        key === "codeReference" && value !== null ? JSON.stringify(value) : value,
      );
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
            JSON.stringify({
              ...input,
              // The replaced text, so an edit to the goal can be compared with what it was.
              ...(Object.keys(before).length ? { before } : {}),
              completionTransition: input.status === "DONE" && existing.status !== "DONE",
            }),
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
    if (plan.assignedAgentId) await this.requireAssigneeAccess(targetPid, plan.assignedAgentId);
    if (plan.claimedAgentId) await this.requireAssigneeAccess(targetPid, plan.claimedAgentId);
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
