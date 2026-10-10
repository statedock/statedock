-- Account existence alone must not grant instance admission.
ALTER TABLE users ADD COLUMN instance_approved_at TEXT;
UPDATE users SET instance_approved_at=created_at
WHERE id=(SELECT value FROM instance_settings WHERE key='admin_user_id')
   OR EXISTS (
     SELECT 1 FROM admin_events e
     WHERE e.action='user.invited'
       AND e.actor_id=(SELECT value FROM instance_settings WHERE key='admin_user_id')
       AND lower(e.subject_id)=lower(users.email)
   );
CREATE TABLE login_rate_limits (
  key TEXT PRIMARY KEY NOT NULL,
  window_start INTEGER NOT NULL,
  requests INTEGER NOT NULL
);
CREATE INDEX login_rate_limits_window ON login_rate_limits(window_start);
