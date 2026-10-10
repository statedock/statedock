ALTER TABLE plan_sequence ADD COLUMN importing INTEGER NOT NULL DEFAULT 0 CHECK(importing IN (0,1));
DROP TRIGGER plan_event_created;
DROP TRIGGER plan_event_status;
CREATE TRIGGER plan_event_created AFTER INSERT ON plans
WHEN (SELECT importing FROM plan_sequence WHERE id=1)=0 BEGIN
  INSERT INTO plan_events(project_id,reference,number,title,kind,created_at)
  VALUES(NEW.project_id,printf('SD-%06d',NEW.global_number),NEW.number,NEW.title,'created',NEW.created_at);
  INSERT INTO plan_events(project_id,reference,number,title,kind,created_at)
  SELECT NEW.project_id,printf('SD-%06d',NEW.global_number),NEW.number,NEW.title,
    CASE WHEN NEW.status='WORKING' THEN 'started' ELSE 'completed' END,NEW.created_at
  WHERE NEW.status IN ('WORKING','DONE');
END;
CREATE TRIGGER plan_event_status AFTER UPDATE OF status ON plans
WHEN NEW.status <> OLD.status AND NEW.status IN ('WORKING','DONE')
  AND (SELECT importing FROM plan_sequence WHERE id=1)=0 BEGIN
  INSERT INTO plan_events(project_id,reference,number,title,kind,created_at)
  VALUES(NEW.project_id,printf('SD-%06d',NEW.global_number),NEW.number,NEW.title,
    CASE WHEN NEW.status='WORKING' THEN 'started' ELSE 'completed' END,NEW.updated_at);
END;
CREATE TABLE import_runs (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  source TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX import_runs_source_uq ON import_runs(source);
