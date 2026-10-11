-- Preserve existing Planned tasks, attachments and history.

PRAGMA defer_foreign_keys = ON;

DROP TRIGGER plan_number_immutable;

DROP TRIGGER task_entries_no_update;

DROP TRIGGER task_entries_no_delete;

DROP TRIGGER plan_event_created;

DROP TRIGGER plan_event_status;

DROP TRIGGER plan_event_notification_outbox;

CREATE TABLE ready_backup_attachments AS SELECT * FROM attachments;

CREATE TABLE ready_backup_task_entries AS SELECT * FROM task_entries;

CREATE TABLE ready_backup_plans AS SELECT * FROM plans;

DROP TABLE attachments;

DROP TABLE task_entries;

DROP TABLE plans;

CREATE TABLE "plans" (
 id TEXT PRIMARY KEY NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 number INTEGER NOT NULL,
 global_number INTEGER NOT NULL UNIQUE CHECK(global_number > 0),
 title TEXT NOT NULL,
 body TEXT NOT NULL DEFAULT '',
 summary TEXT,
 status TEXT NOT NULL DEFAULT 'PLAN' CHECK(status IN ('PLAN','READY','WORKING','WAITING','DONE','DROPPED')),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(project_id,number)
);

INSERT INTO plans SELECT * FROM ready_backup_plans;

DROP TABLE ready_backup_plans;

CREATE TABLE attachments (
 id TEXT PRIMARY KEY NOT NULL, plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
 name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL, object_key TEXT NOT NULL, created_at TEXT NOT NULL
);

INSERT INTO attachments SELECT * FROM ready_backup_attachments;

DROP TABLE ready_backup_attachments;

CREATE TABLE task_entries (
 id TEXT PRIMARY KEY NOT NULL,
 plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('review','feedback')),
 content TEXT NOT NULL,
 actor_id TEXT NOT NULL, actor_type TEXT NOT NULL, actor_name TEXT,
 created_at TEXT NOT NULL
);

INSERT INTO task_entries SELECT * FROM ready_backup_task_entries;

DROP TABLE ready_backup_task_entries;

CREATE INDEX plans_project_status_idx ON plans(project_id,status);

CREATE INDEX attachments_plan_idx ON attachments(plan_id);

CREATE INDEX task_entries_plan_idx ON task_entries(plan_id,kind,created_at);

CREATE TRIGGER plan_number_immutable BEFORE UPDATE OF global_number ON plans
 WHEN NEW.global_number <> OLD.global_number BEGIN SELECT RAISE(ABORT,'Global plan number is immutable'); END;

CREATE TRIGGER task_entries_no_update BEFORE UPDATE ON task_entries BEGIN SELECT RAISE(ABORT,'Task entries are append-only'); END;

CREATE TRIGGER task_entries_no_delete BEFORE DELETE ON task_entries WHEN EXISTS (SELECT 1 FROM plans WHERE id=OLD.plan_id) BEGIN SELECT RAISE(ABORT,'Task entries are append-only'); END;

CREATE TRIGGER plan_event_created AFTER INSERT ON plans
WHEN (SELECT importing FROM plan_sequence WHERE id=1)=0 BEGIN
  INSERT INTO plan_events(project_id,reference,number,title,kind,created_at)
  VALUES(NEW.project_id,printf('SD-%06d',NEW.global_number),NEW.number,NEW.title,'created',NEW.created_at);
  INSERT INTO plan_events(project_id,reference,number,title,kind,created_at)
  SELECT NEW.project_id,printf('SD-%06d',NEW.global_number),NEW.number,NEW.title,
    CASE NEW.status WHEN 'WORKING' THEN 'started' WHEN 'DONE' THEN 'completed' WHEN 'WAITING' THEN 'waiting' ELSE 'dropped' END,NEW.created_at
  WHERE NEW.status IN ('WORKING','DONE','WAITING','DROPPED');
END;

CREATE TRIGGER plan_event_status AFTER UPDATE OF status ON plans
WHEN NEW.status <> OLD.status AND NEW.status IN ('WORKING','DONE','WAITING','DROPPED')
  AND (SELECT importing FROM plan_sequence WHERE id=1)=0 BEGIN
  INSERT INTO plan_events(project_id,reference,number,title,kind,created_at)
  VALUES(NEW.project_id,printf('SD-%06d',NEW.global_number),NEW.number,NEW.title,
    CASE NEW.status WHEN 'WORKING' THEN 'started' WHEN 'DONE' THEN 'completed' WHEN 'WAITING' THEN 'waiting' ELSE 'dropped' END,NEW.updated_at);
END;

CREATE TRIGGER plan_event_notification_outbox AFTER INSERT ON plan_events BEGIN
 INSERT INTO notification_outbox(id,project_id,user_id,channel,payload,available_at)
 SELECT printf('%d:%s:%s',NEW.sequence,recipient.user_id,channels.channel),NEW.project_id,recipient.user_id,channels.channel,
 json_object('projectId',NEW.project_id,'projectName',pr.name,'projectSlug',pr.slug,'number',NEW.number,'reference',NEW.reference,'title',NEW.title,'kind',NEW.kind,'summary',p.summary,'reason',substr(p.body,1,1000)),NEW.created_at
 FROM projects pr JOIN plans p ON p.project_id=pr.id AND p.number=NEW.number
 JOIN (SELECT owner_id user_id,id project_id FROM projects UNION SELECT user_id,project_id FROM project_members) recipient ON recipient.project_id=pr.id
 CROSS JOIN (SELECT 'bark' channel UNION ALL SELECT 'ntfy' UNION ALL SELECT 'telegram' UNION ALL SELECT 'discord' UNION ALL SELECT 'webhook') channels
 WHERE pr.id=NEW.project_id;
END;

PRAGMA defer_foreign_keys = OFF;
