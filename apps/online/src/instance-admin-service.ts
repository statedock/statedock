import type { OnlineEnv } from "./auth.js";

export async function isAdministrator(db: D1Database, userId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT value FROM instance_settings WHERE key='admin_user_id'")
    .first<{ value: string }>();
  return row?.value === userId;
}

/** Check again after OTP verification: a revoked invitation must not allow sign-in. */
export async function canRegister(env: OnlineEnv, email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const user = await env.DB.prepare(
    "SELECT id,disabled_at,instance_approved_at FROM users WHERE email=?",
  )
    .bind(normalized)
    .first<{ id: string; disabled_at: string | null; instance_approved_at: string | null }>();
  if (user?.disabled_at) return false;
  const admin = await env.DB.prepare(
    "SELECT value FROM instance_settings WHERE key='admin_user_id'",
  ).first();
  if (!admin)
    return Boolean(env.OWNER_EMAIL && normalized === env.OWNER_EMAIL.trim().toLowerCase());
  return Boolean(user?.instance_approved_at);
}

/** Called only after email OTP verification. Unique key prevents concurrent takeover. */
export async function initializeAdministrator(
  env: OnlineEnv,
  userId: string,
  verifiedEmail: string,
) {
  if (!env.OWNER_EMAIL || verifiedEmail.toLowerCase() !== env.OWNER_EMAIL.trim().toLowerCase())
    return;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO instance_settings(key,value) VALUES('admin_user_id',?) ON CONFLICT(key) DO NOTHING",
    ).bind(userId),
    env.DB.prepare(
      "UPDATE users SET instance_approved_at=COALESCE(instance_approved_at,?) WHERE id=? AND id=(SELECT value FROM instance_settings WHERE key='admin_user_id')",
    ).bind(new Date().toISOString(), userId),
    env.DB.prepare(
      "INSERT INTO admin_events(id,actor_id,action,subject_id,created_at) SELECT ?,?,'instance.initialized',?,? WHERE EXISTS(SELECT 1 FROM instance_settings WHERE key='admin_user_id' AND value=?) AND NOT EXISTS(SELECT 1 FROM admin_events WHERE action='instance.initialized')",
    ).bind(crypto.randomUUID(), userId, userId, new Date().toISOString(), userId),
  ]);
}

export async function setUserDisabled(
  db: D1Database,
  actorId: string,
  userId: string,
  disabled: boolean,
) {
  const at = new Date().toISOString();
  const results = await db.batch([
    db
      .prepare(
        "UPDATE users SET disabled_at=?,auth_version=auth_version+? WHERE id=? AND EXISTS(SELECT 1 FROM instance_settings WHERE key='admin_user_id' AND value=?) AND id!=(SELECT value FROM instance_settings WHERE key='admin_user_id')",
      )
      .bind(disabled ? at : null, Number(disabled), userId, actorId),
    db
      .prepare(
        "UPDATE sessions SET revoked_at=? WHERE user_id=? AND ?=1 AND EXISTS(SELECT 1 FROM users WHERE id=? AND disabled_at IS NOT NULL) AND EXISTS(SELECT 1 FROM instance_settings WHERE key='admin_user_id' AND value=?)",
      )
      .bind(at, userId, Number(disabled), userId, actorId),
    db
      .prepare(
        "UPDATE mcp_clients SET revoked_at=? WHERE user_id=? AND ?=1 AND EXISTS(SELECT 1 FROM users WHERE id=? AND disabled_at IS NOT NULL) AND EXISTS(SELECT 1 FROM instance_settings WHERE key='admin_user_id' AND value=?)",
      )
      .bind(at, userId, Number(disabled), userId, actorId),
    db
      .prepare(
        "DELETE FROM login_codes WHERE email=(SELECT email FROM users WHERE id=?) AND ?=1 AND EXISTS(SELECT 1 FROM users WHERE id=? AND disabled_at IS NOT NULL) AND EXISTS(SELECT 1 FROM instance_settings WHERE key='admin_user_id' AND value=?)",
      )
      .bind(userId, Number(disabled), userId, actorId),
    db
      .prepare(
        "INSERT INTO admin_events(id,actor_id,action,subject_id,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND id!=(SELECT value FROM instance_settings WHERE key='admin_user_id')) AND EXISTS(SELECT 1 FROM instance_settings WHERE key='admin_user_id' AND value=?)",
      )
      .bind(
        crypto.randomUUID(),
        actorId,
        disabled ? "user.disabled" : "user.enabled",
        userId,
        at,
        userId,
        actorId,
      ),
  ]);
  return Boolean(results[0].meta.changes);
}
