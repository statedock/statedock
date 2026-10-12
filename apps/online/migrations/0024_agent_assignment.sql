-- Profiles survive credential rotation. Existing credentials remain unbound.
CREATE TABLE agent_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
  created_at TEXT NOT NULL,
  UNIQUE(id, user_id)
);
ALTER TABLE mcp_clients ADD COLUMN agent_id TEXT REFERENCES agent_profiles(id);
ALTER TABLE plans ADD COLUMN assigned_agent_id TEXT REFERENCES agent_profiles(id);
ALTER TABLE plans ADD COLUMN claimed_agent_id TEXT REFERENCES agent_profiles(id);
ALTER TABLE plans ADD COLUMN claim_id TEXT;
CREATE INDEX plans_agent_ready_idx ON plans(project_id,status,assigned_agent_id,number);
CREATE INDEX mcp_clients_agent_idx ON mcp_clients(agent_id);

-- A credential cannot borrow another account's profile, including on rebinding.
CREATE TRIGGER mcp_agent_owner_insert BEFORE INSERT ON mcp_clients
WHEN NEW.agent_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM agent_profiles WHERE id=NEW.agent_id AND user_id=NEW.user_id
)
BEGIN SELECT RAISE(ABORT,'Agent profile belongs to another account'); END;
CREATE TRIGGER mcp_agent_owner_update BEFORE UPDATE OF agent_id,user_id ON mcp_clients
WHEN NEW.agent_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM agent_profiles WHERE id=NEW.agent_id AND user_id=NEW.user_id
)
BEGIN SELECT RAISE(ABORT,'Agent profile belongs to another account'); END;
CREATE TRIGGER agent_profile_owner_immutable BEFORE UPDATE OF user_id ON agent_profiles
WHEN NEW.user_id != OLD.user_id
BEGIN SELECT RAISE(ABORT,'Agent profile ownership is immutable'); END;

-- Assignments are valid only for an account that can access the project.
CREATE TRIGGER plan_agent_access_insert BEFORE INSERT ON plans
WHEN NEW.assigned_agent_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM agent_profiles a JOIN projects p ON p.id=NEW.project_id
  WHERE a.id=NEW.assigned_agent_id AND (p.owner_id=a.user_id OR EXISTS (
    SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=a.user_id
  ))
)
BEGIN SELECT RAISE(ABORT,'Assigned Agent must belong to a project member'); END;
CREATE TRIGGER plan_agent_access_update BEFORE UPDATE OF assigned_agent_id,project_id ON plans
WHEN NEW.assigned_agent_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM agent_profiles a JOIN projects p ON p.id=NEW.project_id
  WHERE a.id=NEW.assigned_agent_id AND (p.owner_id=a.user_id OR EXISTS (
    SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=a.user_id
  ))
)
BEGIN SELECT RAISE(ABORT,'Assigned Agent must belong to a project member'); END;
