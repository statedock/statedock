-- Preserve existing statuses, attachments, history and sync triggers.

PRAGMA defer_foreign_keys = ON;

DROP TRIGGER plan_number_positive;

DROP TRIGGER plan_number_immutable;

DROP TRIGGER task_entries_no_update;

DROP TRIGGER task_entries_no_delete;

DROP TRIGGER plan_event_created;

DROP TRIGGER plan_event_status;

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
 global_number INTEGER NOT NULL,
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
 id TEXT PRIMARY KEY NOT NULL,
 plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
 name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL,
 data TEXT NOT NULL, created_at TEXT NOT NULL
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

CREATE UNIQUE INDEX plans_global_number_uq ON plans(global_number);

CREATE INDEX plans_project_status_idx ON plans(project_id,status);

CREATE INDEX attachments_plan_idx ON attachments(plan_id);

CREATE INDEX task_entries_plan_idx ON task_entries(plan_id,kind,created_at);

CREATE TRIGGER plan_number_positive BEFORE INSERT ON plans WHEN NEW.global_number <= 0 BEGIN SELECT RAISE(ABORT,'Global plan number must be positive'); END;

CREATE TRIGGER plan_number_immutable BEFORE UPDATE OF global_number ON plans WHEN NEW.global_number <> OLD.global_number BEGIN SELECT RAISE(ABORT,'Global plan number is immutable'); END;

CREATE TRIGGER task_entries_no_update BEFORE UPDATE ON task_entries BEGIN SELECT RAISE(ABORT,'Task entries are append-only'); END;

CREATE TRIGGER task_entries_no_delete BEFORE DELETE ON task_entries WHEN EXISTS (SELECT 1 FROM plans WHERE id=OLD.plan_id) BEGIN SELECT RAISE(ABORT,'Task entries are append-only'); END;

CREATE TRIGGER plan_event_created AFTER INSERT ON plans BEGIN
 INSERT INTO plan_events(project_id,reference,number,title,kind,created_at)
 VALUES(NEW.project_id,printf('SD-%06d',NEW.global_number),NEW.number,NEW.title,'created',NEW.created_at);
 INSERT INTO plan_events(project_id,reference,number,title,kind,created_at)
 SELECT NEW.project_id,printf('SD-%06d',NEW.global_number),NEW.number,NEW.title,
   CASE NEW.status WHEN 'WORKING' THEN 'started' WHEN 'DONE' THEN 'completed' WHEN 'WAITING' THEN 'waiting' ELSE 'dropped' END,NEW.created_at
 WHERE NEW.status IN ('WORKING','DONE','WAITING','DROPPED');
END;

CREATE TRIGGER plan_event_status AFTER UPDATE OF status ON plans
WHEN NEW.status <> OLD.status AND NEW.status IN ('WORKING','DONE','WAITING','DROPPED') BEGIN
 INSERT INTO plan_events(project_id,reference,number,title,kind,created_at)
 VALUES(NEW.project_id,printf('SD-%06d',NEW.global_number),NEW.number,NEW.title,
   CASE NEW.status WHEN 'WORKING' THEN 'started' WHEN 'DONE' THEN 'completed' WHEN 'WAITING' THEN 'waiting' ELSE 'dropped' END,NEW.updated_at);
END;

PRAGMA defer_foreign_keys = OFF;
