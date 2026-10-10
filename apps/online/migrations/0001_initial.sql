PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE login_codes (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  consumed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX login_codes_email_created_idx ON login_codes(email, created_at);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id, expires_at);

CREATE TABLE mcp_clients (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  last_used_at TEXT,
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX mcp_clients_user_idx ON mcp_clients(user_id, revoked_at);

CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  local_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id, slug)
);
CREATE INDEX projects_owner_name_idx ON projects(owner_id, name);

CREATE TABLE plans (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  global_number INTEGER NOT NULL UNIQUE CHECK(global_number > 0),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PLAN' CHECK(status IN ('PLAN','WORKING','WAITING','DONE')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, number)
);
CREATE INDEX plans_project_status_idx ON plans(project_id, status);
CREATE TABLE plan_sequence (id INTEGER PRIMARY KEY CHECK(id=1), last_number INTEGER NOT NULL);
INSERT INTO plan_sequence(id,last_number) VALUES(1,0);
CREATE TRIGGER plan_number_immutable BEFORE UPDATE OF global_number ON plans
WHEN NEW.global_number <> OLD.global_number BEGIN SELECT RAISE(ABORT,'Global plan number is immutable'); END;

CREATE TABLE markdown_files (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(project_id,path)
);

CREATE TABLE activities (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('human','agent','system')),
  actor_name TEXT,
  action TEXT NOT NULL,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('project','plan','file')),
  subject_id TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX activities_project_created_idx ON activities(project_id, created_at);
CREATE TRIGGER activity_no_update BEFORE UPDATE ON activities BEGIN SELECT RAISE(ABORT,'Activity is append-only'); END;
CREATE TRIGGER activity_no_delete BEFORE DELETE ON activities BEGIN SELECT RAISE(ABORT,'Activity is append-only'); END;

CREATE TABLE plan_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  reference TEXT NOT NULL,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('created','started','completed')),
  created_at TEXT NOT NULL
);
CREATE TRIGGER plan_event_created AFTER INSERT ON plans BEGIN
  INSERT INTO plan_events(project_id,reference,number,title,kind,created_at)
  VALUES(NEW.project_id,printf('SD-%06d',NEW.global_number),NEW.number,NEW.title,'created',NEW.created_at);
  INSERT INTO plan_events(project_id,reference,number,title,kind,created_at)
  SELECT NEW.project_id,printf('SD-%06d',NEW.global_number),NEW.number,NEW.title,
    CASE WHEN NEW.status='WORKING' THEN 'started' ELSE 'completed' END,NEW.created_at
  WHERE NEW.status IN ('WORKING','DONE');
END;
CREATE TRIGGER plan_event_status AFTER UPDATE OF status ON plans
WHEN NEW.status <> OLD.status AND NEW.status IN ('WORKING','DONE') BEGIN
  INSERT INTO plan_events(project_id,reference,number,title,kind,created_at)
  VALUES(NEW.project_id,printf('SD-%06d',NEW.global_number),NEW.number,NEW.title,
    CASE WHEN NEW.status='WORKING' THEN 'started' ELSE 'completed' END,NEW.updated_at);
END;
CREATE TRIGGER plan_event_no_update BEFORE UPDATE ON plan_events BEGIN SELECT RAISE(ABORT,'Plan events are append-only'); END;
CREATE TRIGGER plan_event_no_delete BEFORE DELETE ON plan_events BEGIN SELECT RAISE(ABORT,'Plan events are append-only'); END;
