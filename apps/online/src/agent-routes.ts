import { Hono } from "hono";
import { z } from "zod";
import { currentSession, type OnlineEnv } from "./auth.js";
import { jsonError, sameOrigin } from "./http.js";

const app = new Hono<{ Bindings: OnlineEnv }>();
app.get("/api/auth/agents", async (c) => {
  const session = await currentSession(c);
  if (!session) return jsonError("unauthorized", 401);
  const project = c.req.query("project");
  if (project) {
    const accessible = await c.env.DB.prepare(
      "SELECT id FROM projects WHERE id=? AND (owner_id=? OR id IN (SELECT project_id FROM project_members WHERE user_id=?))",
    )
      .bind(project, session.id, session.id)
      .first();
    if (!accessible) return jsonError("not_found", 404);
  }
  const rows = project
    ? await c.env.DB.prepare(
        "SELECT id,name FROM agent_profiles WHERE deleted_at IS NULL AND user_id IN (SELECT owner_id FROM projects WHERE id=? UNION SELECT user_id FROM project_members WHERE project_id=?) ORDER BY name,id",
      )
        .bind(project, project)
        .all()
    : await c.env.DB.prepare(
        "SELECT id,name FROM agent_profiles WHERE user_id=? AND deleted_at IS NULL ORDER BY name,id",
      )
        .bind(session.id)
        .all();
  return c.json({ data: rows.results }, 200, { "Cache-Control": "no-store" });
});
app.post("/api/auth/agents", async (c) => {
  if (!sameOrigin(c.req.raw)) return jsonError("origin_not_allowed", 403);
  const session = await currentSession(c);
  if (!session) return jsonError("unauthorized", 401);
  const parsed = z
    .object({ name: z.string().trim().min(1).max(200) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return jsonError("validation_error", 400);
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO agent_profiles(id,user_id,name,created_at) VALUES(?,?,?,?)")
    .bind(id, session.id, parsed.data.name, new Date().toISOString())
    .run();
  return c.json({ data: { id, name: parsed.data.name } }, 201);
});
app.delete("/api/auth/agents/:id", async (c) => {
  if (!sameOrigin(c.req.raw)) return jsonError("origin_not_allowed", 403);
  const session = await currentSession(c);
  if (!session) return jsonError("unauthorized", 401);
  const agentId = c.req.param("id");
  const profile = await c.env.DB.prepare(
    "SELECT id FROM agent_profiles WHERE id=? AND user_id=? AND deleted_at IS NULL",
  )
    .bind(agentId, session.id)
    .first();
  if (!profile) return jsonError("not_found", 404);
  const at = new Date().toISOString();
  const [retired] = await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE agent_profiles SET deleted_at=? WHERE id=? AND user_id=? AND deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM plans WHERE status='WORKING' AND (assigned_agent_id=? OR claimed_agent_id=?))",
    ).bind(at, agentId, session.id, agentId, agentId),
    c.env.DB.prepare(
      "UPDATE mcp_clients SET agent_id=NULL WHERE agent_id=? AND user_id=? AND EXISTS(SELECT 1 FROM agent_profiles WHERE id=? AND deleted_at=?)",
    ).bind(agentId, session.id, agentId, at),
    c.env.DB.prepare(
      "INSERT INTO activities(id,project_id,actor_id,actor_type,actor_name,action,subject_type,subject_id,details,created_at) SELECT lower(hex(randomblob(16))),project_id,?,'human',?,'plan.agent_unassigned','plan',id,?,? FROM plans WHERE assigned_agent_id=? AND status IN ('PLAN','READY','WAITING') AND EXISTS(SELECT 1 FROM agent_profiles WHERE id=? AND deleted_at=?)",
    ).bind(
      session.id,
      session.email,
      JSON.stringify({ agentId, reason: "agent_deleted" }),
      at,
      agentId,
      agentId,
      at,
    ),
    c.env.DB.prepare(
      "UPDATE plans SET assigned_agent_id=NULL,updated_at=CASE WHEN updated_at>=? THEN strftime('%Y-%m-%dT%H:%M:%fZ',updated_at,'+0.001 seconds') ELSE ? END WHERE assigned_agent_id=? AND status IN ('PLAN','READY','WAITING') AND EXISTS(SELECT 1 FROM agent_profiles WHERE id=? AND deleted_at=?)",
    ).bind(at, at, agentId, agentId, at),
  ]);
  if (!retired.meta.changes)
    return jsonError(
      "agent_in_use",
      409,
      "此 Agent 有正在执行的任务，请先完成或交接，再删除。This Agent has working tasks; complete or hand them off before deleting.",
    );
  return c.body(null, 204);
});
export default app;
