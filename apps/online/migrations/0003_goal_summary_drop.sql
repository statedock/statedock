DROP TRIGGER plan_event_created;
DROP TRIGGER plan_event_status;
DROP TRIGGER plan_event_no_update;
DROP TRIGGER plan_event_no_delete;
DROP TRIGGER plan_number_immutable;

CREATE TABLE plan_events_v2 (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 project_id TEXT NOT NULL, reference TEXT NOT NULL, number INTEGER NOT NULL,
 title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('created','started','completed','dropped')), created_at TEXT NOT NULL
);
INSERT INTO plan_events_v2(sequence,project_id,reference,number,title,kind,created_at)
 SELECT sequence,project_id,reference,number,title,kind,created_at FROM plan_events;
DROP TABLE plan_events;
ALTER TABLE plan_events_v2 RENAME TO plan_events;
CREATE TRIGGER plan_event_no_update BEFORE UPDATE ON plan_events BEGIN SELECT RAISE(ABORT,'Plan events are append-only'); END;
CREATE TRIGGER plan_event_no_delete BEFORE DELETE ON plan_events BEGIN SELECT RAISE(ABORT,'Plan events are append-only'); END;

CREATE TABLE plans_v2 (
 id TEXT PRIMARY KEY NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 number INTEGER NOT NULL,
 global_number INTEGER NOT NULL UNIQUE CHECK(global_number > 0),
 title TEXT NOT NULL,
 body TEXT NOT NULL DEFAULT '',
 summary TEXT,
 status TEXT NOT NULL DEFAULT 'PLAN' CHECK(status IN ('PLAN','WORKING','WAITING','DONE','DROPPED')),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(project_id,number)
);
INSERT INTO plans_v2(id,project_id,number,global_number,title,body,summary,status,created_at,updated_at)
 SELECT id,project_id,number,global_number,title,body,NULL,status,created_at,updated_at FROM plans;
DROP TABLE plans;
ALTER TABLE plans_v2 RENAME TO plans;
CREATE INDEX plans_project_status_idx ON plans(project_id,status);
CREATE TRIGGER plan_number_immutable BEFORE UPDATE OF global_number ON plans
 WHEN NEW.global_number <> OLD.global_number BEGIN SELECT RAISE(ABORT,'Global plan number is immutable'); END;

CREATE TRIGGER plan_event_created AFTER INSERT ON plans
WHEN (SELECT importing FROM plan_sequence WHERE id=1)=0 BEGIN
  INSERT INTO plan_events(project_id,reference,number,title,kind,created_at)
  VALUES(NEW.project_id,printf('SD-%06d',NEW.global_number),NEW.number,NEW.title,'created',NEW.created_at);
  INSERT INTO plan_events(project_id,reference,number,title,kind,created_at)
  SELECT NEW.project_id,printf('SD-%06d',NEW.global_number),NEW.number,NEW.title,
    CASE NEW.status WHEN 'WORKING' THEN 'started' WHEN 'DONE' THEN 'completed' ELSE 'dropped' END,NEW.created_at
  WHERE NEW.status IN ('WORKING','DONE','DROPPED');
END;
CREATE TRIGGER plan_event_status AFTER UPDATE OF status ON plans
WHEN NEW.status <> OLD.status AND NEW.status IN ('WORKING','DONE','DROPPED')
  AND (SELECT importing FROM plan_sequence WHERE id=1)=0 BEGIN
  INSERT INTO plan_events(project_id,reference,number,title,kind,created_at)
  VALUES(NEW.project_id,printf('SD-%06d',NEW.global_number),NEW.number,NEW.title,
    CASE NEW.status WHEN 'WORKING' THEN 'started' WHEN 'DONE' THEN 'completed' ELSE 'dropped' END,NEW.updated_at);
END;
