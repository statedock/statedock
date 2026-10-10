import { Hono } from "hono";
import { z } from "zod";
import { type OnlineEnv, currentSession } from "./auth.js";
import { jsonError, sameOrigin } from "./http.js";
import { MembershipError, ProjectMemberService } from "./project-member-service.js";

const emailSchema = z
  .string()
  .email()
  .max(320)
  .transform((v) => v.trim().toLowerCase());

const app = new Hono<{ Bindings: OnlineEnv }>();

/**
 * GET /api/projects/:project/members
 * 获取项目的所有成员列表（Owner + Collaborators）
 */
app.get("/api/projects/:project/members", async (c) => {
  const session = await currentSession(c);
  if (!session) return jsonError("unauthorized", 401);

  try {
    return c.json(
      await new ProjectMemberService(c.env.DB).list(c.req.param("project"), session.id),
    );
  } catch (error) {
    if (error instanceof MembershipError) return jsonError(error.code, error.status);
    throw error;
  }
});

/**
 * POST /api/projects/:project/members
 * 创世人（Owner）邀请/添加协作者
 */
app.post("/api/projects/:project/members", async (c) => {
  if (!sameOrigin(c.req.raw)) return jsonError("origin_not_allowed", 403);
  const session = await currentSession(c);
  if (!session) return jsonError("unauthorized", 401);

  const projectKey = c.req.param("project");
  const project = await c.env.DB.prepare(
    "SELECT id, owner_id, name, slug FROM projects WHERE (id = ? OR slug = ?) LIMIT 1",
  )
    .bind(projectKey, projectKey)
    .first<{
      id: string;
      owner_id: string;
      name: string;
      slug: string;
    }>();

  if (!project) return jsonError("project_not_found", 404, "项目不存在。");

  if (project.owner_id !== session.id) {
    return jsonError(
      "only_owner_can_manage_members",
      403,
      "只有项目的创世人(Owner)有权添加协作者。",
    );
  }

  const parsed = z.object({ email: emailSchema }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "validation_error", message: "请输入有效的电子邮箱地址。" }, 400);
  }

  const targetEmail = parsed.data.email;
  if (targetEmail === session.email.toLowerCase()) {
    return c.json({ error: "cannot_invite_self", message: "不能将自己作为协作者添加。" }, 400);
  }

  const targetUser = await c.env.DB.prepare(
    "SELECT id,email FROM users WHERE email=? AND instance_approved_at IS NOT NULL AND disabled_at IS NULL",
  )
    .bind(targetEmail)
    .first<{ id: string; email: string }>();
  if (!targetUser) return jsonError("instance_approval_required", 403);

  if (targetUser.id === project.owner_id) {
    return c.json({ error: "already_owner", message: "该用户已经是该项目的创世人。" }, 400);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM project_members WHERE project_id = ? AND user_id = ?",
  )
    .bind(project.id, targetUser.id)
    .first();

  if (existing) {
    return c.json({ error: "already_member", message: "该用户已经是该项目的协作者。" }, 409);
  }

  const memberId = crypto.randomUUID();
  const now = new Date().toISOString();
  const added = await new ProjectMemberService(c.env.DB).invite(
    project.id,
    targetUser.id,
    session.id,
    session.email,
    targetUser.email,
    memberId,
    now,
  );
  if (!added)
    return c.json(
      { error: "member_conflict", message: "Project membership changed; refresh and try again" },
      403,
    );

  return c.json(
    {
      data: {
        id: memberId,
        userId: targetUser.id,
        email: targetUser.email,
        role: "collaborator" as const,
        joinedAt: now,
      },
    },
    201,
  );
});

/**
 * DELETE /api/projects/:project/members/:memberId
 * 创世人移除协作者，或协作者主动退出项目
 */
app.delete("/api/projects/:project/members/:memberId", async (c) => {
  if (!sameOrigin(c.req.raw)) return jsonError("origin_not_allowed", 403);
  const session = await currentSession(c);
  if (!session) return jsonError("unauthorized", 401);

  try {
    await new ProjectMemberService(c.env.DB).remove(
      c.req.param("project"),
      c.req.param("memberId"),
      session.id,
      session.email,
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof MembershipError) return jsonError(error.code, error.status);
    throw error;
  }
});

export default app;
