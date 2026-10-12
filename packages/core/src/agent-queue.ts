/** The caller must supply identity resolved from validated credentials, never tool input. */
export interface QueuePrincipal {
  userId: string;
  agentId: string | null;
}
export type ReadyQueueMode = "mine" | "unassigned";

/** Shared predicate for listing and atomic claiming; legacy credentials fail closed. */
export function readyQueuePredicate(
  principal: QueuePrincipal,
  mode: ReadyQueueMode = "mine",
): { sql: string; bindings: string[] } {
  if (mode !== "mine" && mode !== "unassigned") throw new Error("Invalid Ready queue mode");
  if (!principal.userId || !principal.agentId)
    throw new Error("Bind this credential to an Agent profile before accessing a Ready queue");
  return {
    sql: `status='READY' AND ${mode === "mine" ? "assigned_agent_id=?" : "assigned_agent_id IS NULL"}`,
    bindings: mode === "mine" ? [principal.agentId] : [],
  };
}

/** One SQLite statement prevents two sessions from claiming the same task.
 * Permission and profile ownership are rechecked inside the write statement.
 */
export function readyQueueClaim(
  projectId: string,
  principal: QueuePrincipal,
  updatedAt: string,
  mode: ReadyQueueMode = "mine",
  claimId: string = crypto.randomUUID(),
): { sql: string; bindings: string[] } {
  const predicate = readyQueuePredicate(principal, mode);
  return {
    sql: `UPDATE plans SET status='WORKING',claimed_agent_id=?,updated_at=CASE WHEN updated_at>=? THEN strftime('%Y-%m-%dT%H:%M:%fZ',updated_at,'+0.001 seconds') ELSE ? END,claim_id=?
      WHERE id=(SELECT id FROM plans WHERE project_id=? AND ${predicate.sql}
        AND EXISTS(SELECT 1 FROM agent_profiles WHERE id=? AND user_id=? AND deleted_at IS NULL)
        AND project_id IN (SELECT id FROM projects WHERE owner_id=?
          UNION SELECT project_id FROM project_members WHERE user_id=?)
        ORDER BY number LIMIT 1)
      AND ${predicate.sql} RETURNING *`,
    bindings: [
      principal.agentId!,
      updatedAt,
      updatedAt,
      claimId,
      projectId,
      ...predicate.bindings,
      principal.agentId!,
      principal.userId,
      principal.userId,
      principal.userId,
      ...predicate.bindings,
    ],
  };
}
