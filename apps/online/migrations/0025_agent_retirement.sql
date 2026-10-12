-- Keep historical task attribution while removing identities from active choices.
ALTER TABLE agent_profiles ADD COLUMN deleted_at TEXT;
CREATE TRIGGER active_mcp_agent_insert BEFORE INSERT ON mcp_clients
WHEN NEW.agent_id IS NOT NULL AND EXISTS(SELECT 1 FROM agent_profiles WHERE id=NEW.agent_id AND deleted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'Agent has been deleted'); END;
CREATE TRIGGER active_mcp_agent_update BEFORE UPDATE OF agent_id ON mcp_clients
WHEN NEW.agent_id IS NOT NULL AND EXISTS(SELECT 1 FROM agent_profiles WHERE id=NEW.agent_id AND deleted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'Agent has been deleted'); END;
CREATE TRIGGER active_task_agent_insert BEFORE INSERT ON plans
WHEN NEW.assigned_agent_id IS NOT NULL AND EXISTS(SELECT 1 FROM agent_profiles WHERE id=NEW.assigned_agent_id AND deleted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'Agent has been deleted'); END;
CREATE TRIGGER active_task_agent_update BEFORE UPDATE OF assigned_agent_id ON plans
WHEN NEW.assigned_agent_id IS NOT NULL AND NEW.assigned_agent_id IS NOT OLD.assigned_agent_id AND EXISTS(SELECT 1 FROM agent_profiles WHERE id=NEW.assigned_agent_id AND deleted_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'Agent has been deleted'); END;
