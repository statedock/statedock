CREATE TABLE plan_events (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 project_id TEXT NOT NULL, reference TEXT NOT NULL, number INTEGER NOT NULL,
 title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('created','started','completed')), created_at TEXT NOT NULL
);
CREATE TRIGGER plan_event_created AFTER INSERT ON plans BEGIN
 INSERT INTO plan_events(project_id,reference,number,title,kind,created_at) VALUES(NEW.project_id,printf('SD-%06d',NEW.global_number),NEW.number,NEW.title,'created',NEW.created_at);
 INSERT INTO plan_events(project_id,reference,number,title,kind,created_at) SELECT NEW.project_id,printf('SD-%06d',NEW.global_number),NEW.number,NEW.title,CASE WHEN NEW.status='WORKING' THEN 'started' ELSE 'completed' END,NEW.created_at WHERE NEW.status IN ('WORKING','DONE');
END;
CREATE TRIGGER plan_event_status AFTER UPDATE OF status ON plans WHEN NEW.status<>OLD.status AND NEW.status IN ('WORKING','DONE') BEGIN
 INSERT INTO plan_events(project_id,reference,number,title,kind,created_at) VALUES(NEW.project_id,printf('SD-%06d',NEW.global_number),NEW.number,NEW.title,CASE WHEN NEW.status='WORKING' THEN 'started' ELSE 'completed' END,NEW.updated_at);
END;
CREATE TRIGGER plan_event_no_update BEFORE UPDATE ON plan_events BEGIN SELECT RAISE(ABORT,'Plan events are append-only'); END;
CREATE TRIGGER plan_event_no_delete BEFORE DELETE ON plan_events BEGIN SELECT RAISE(ABORT,'Plan events are append-only'); END;
