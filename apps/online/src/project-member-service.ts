/** Membership mutations and their activity trail share a single transaction. */
export class ProjectMemberService {
  constructor(private readonly db: D1Database) {}
  async list(projectKey: string, userId: string) {
    const project = await this.db
      .prepare(
        "SELECT id, owner_id, name, slug, created_at FROM projects " +
          "WHERE (owner_id = ? OR id IN (SELECT project_id FROM project_members WHERE user_id = ?)) " +
          "AND (id = ? OR slug = ?) LIMIT 1",
      )
      .bind(userId, userId, projectKey, projectKey)
      .first<{
        id: string;
        owner_id: string;
        name: string;
        slug: string;
        created_at: string;
      }>();

    if (!project) throw new MembershipError("project_not_found", 404);

    const owner = await this.db
      .prepare("SELECT id, email FROM users WHERE id = ?")
      .bind(project.owner_id)
      .first<{ id: string; email: string }>();

    const members = await this.db
      .prepare(
        "SELECT pm.id, pm.user_id, pm.created_at, u.email " +
          "FROM project_members pm " +
          "JOIN users u ON u.id = pm.user_id " +
          "WHERE pm.project_id = ? " +
          "ORDER BY pm.created_at",
      )
      .bind(project.id)
      .all<{
        id: string;
        user_id: string;
        created_at: string;
        email: string;
      }>();

    return {
      data: {
        projectId: project.id,
        projectSlug: project.slug,
        projectName: project.name,
        isOwner: project.owner_id === userId,
        owner: {
          id: owner?.id ?? project.owner_id,
          email: owner?.email ?? "",
          role: "owner" as const,
        },
        members: (members.results ?? []).map((m) => ({
          id: m.id,
          userId: m.user_id,
          email: m.email,
          role: "collaborator" as const,
          joinedAt: m.created_at,
        })),
      },
    };
  }
  async remove(projectKey: string, memberId: string, userId: string, email: string) {
    const project = await this.db
      .prepare("SELECT id,owner_id FROM projects WHERE id=? OR slug=?")
      .bind(projectKey, projectKey)
      .first<{ id: string; owner_id: string }>();
    if (!project) throw new MembershipError("project_not_found", 404);
    const member = await this.db
      .prepare(
        memberId === "me"
          ? "SELECT id,user_id FROM project_members WHERE project_id=? AND user_id=?"
          : "SELECT id,user_id FROM project_members WHERE project_id=? AND (id=? OR user_id=?)",
      )
      .bind(...(memberId === "me" ? [project.id, userId] : [project.id, memberId, memberId]))
      .first<{ id: string; user_id: string }>();
    if (!member) throw new MembershipError("member_not_found", 404);
    if (project.owner_id !== userId && member.user_id !== userId)
      throw new MembershipError("unauthorized", 403);
    await this.db.batch([
      this.db
        .prepare(
          "DELETE FROM project_members WHERE id=? AND (user_id=? OR EXISTS(SELECT id FROM projects WHERE id=? AND owner_id=?))",
        )
        .bind(member.id, userId, project.id, userId),
      this.db
        .prepare(
          "INSERT INTO activities(id,project_id,actor_id,actor_type,actor_name,action,subject_type,subject_id,details,created_at) SELECT ?,?,?,'human',?,?,'project',?,?,? WHERE changes()=1",
        )
        .bind(
          crypto.randomUUID(),
          project.id,
          userId,
          email,
          member.user_id === userId ? "collaborator.left" : "collaborator.removed",
          project.id,
          JSON.stringify({ removedUserId: member.user_id }),
          new Date().toISOString(),
        ),
    ]);
  }
  async invite(
    projectId: string,
    userId: string,
    ownerId: string,
    ownerEmail: string,
    email: string,
    memberId: string,
    at: string,
  ) {
    const results = await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO project_members(id,project_id,user_id,created_at)
     SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM projects WHERE id=? AND owner_id=?)
       AND EXISTS(SELECT 1 FROM users WHERE id=? AND instance_approved_at IS NOT NULL AND disabled_at IS NULL)
       AND NOT EXISTS(SELECT 1 FROM project_members WHERE project_id=? AND user_id=?)`,
        )
        .bind(memberId, projectId, userId, at, projectId, ownerId, userId, projectId, userId),
      this.db
        .prepare(
          `INSERT INTO activities(id,project_id,actor_id,actor_type,actor_name,action,subject_type,subject_id,details,created_at)
     SELECT ?,?,?,'human',?,'collaborator.added','project',?,?,? WHERE EXISTS(SELECT 1 FROM project_members WHERE id=?)`,
        )
        .bind(
          crypto.randomUUID(),
          projectId,
          ownerId,
          ownerEmail,
          projectId,
          JSON.stringify({ memberEmail: email, memberId: userId }),
          at,
          memberId,
        ),
    ]);
    return Boolean(results[0].meta.changes);
  }
}

export class MembershipError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
  }
}
