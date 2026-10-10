DROP TRIGGER plan_event_created;
DROP TRIGGER plan_event_status;
DROP TRIGGER plan_event_no_update;
DROP TRIGGER plan_event_no_delete;
CREATE TABLE plan_events_next (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 project_id TEXT NOT NULL, reference TEXT NOT NULL, number INTEGER NOT NULL,
 title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('created','started','completed','waiting','dropped')), created_at TEXT NOT NULL
);
INSERT INTO plan_events_next SELECT * FROM plan_events;
DROP TABLE plan_events;
ALTER TABLE plan_events_next RENAME TO plan_events;
CREATE TRIGGER plan_event_no_update BEFORE UPDATE ON plan_events BEGIN SELECT RAISE(ABORT,'Plan events are append-only'); END;
CREATE TRIGGER plan_event_no_delete BEFORE DELETE ON plan_events BEGIN SELECT RAISE(ABORT,'Plan events are append-only'); END;
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
