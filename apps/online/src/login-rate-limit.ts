import { codeHash } from "./auth.js";

/** Bound email delivery atomically across Worker isolates, including denied emails. */
export async function allowLoginRequest(db: D1Database, secret: string, email: string, ip: string) {
  const windowStart = Math.floor(Date.now() / 900_000) * 900_000;
  const [emailKey, ipKey] = await Promise.all([
    codeHash(secret, email, "login-rate-email"),
    codeHash(secret, ip, "login-rate-ip"),
  ]);
  const counter = (key: string, limit: number, onlyAfterSuccess = false) =>
    db
      .prepare(
        `INSERT INTO login_rate_limits(key,window_start,requests) SELECT ?,?,1 ${onlyAfterSuccess ? "WHERE changes()=1" : ""}
     ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start,
       requests=CASE WHEN login_rate_limits.window_start=excluded.window_start THEN login_rate_limits.requests+1 ELSE 1 END
     WHERE login_rate_limits.window_start<>excluded.window_start OR login_rate_limits.requests<?`,
      )
      .bind(key, windowStart, limit);
  const results = await db.batch([
    db.prepare("DELETE FROM login_rate_limits WHERE window_start<?").bind(windowStart),
    counter(`ip:${ipKey}`, 30),
    counter(`email:${emailKey}`, 3, true),
  ]);
  return Boolean(results[1].meta.changes && results[2].meta.changes);
}
