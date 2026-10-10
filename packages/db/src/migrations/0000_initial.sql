PRAGMA foreign_keys = ON;
CREATE TABLE projects (id TEXT PRIMARY KEY NOT NULL, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE plans (id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, number INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'PLAN' CHECK (status IN ('PLAN','WORKING','WAITING','DONE')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(project_id, number));
CREATE INDEX plans_project_status_idx ON plans(project_id, status);
CREATE TABLE markdown_files (project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, path TEXT NOT NULL, content TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(project_id,path));
CREATE TABLE activities (id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, actor_id TEXT NOT NULL, actor_type TEXT NOT NULL CHECK (actor_type IN ('human','agent','system')), actor_name TEXT, action TEXT NOT NULL, subject_type TEXT NOT NULL CHECK (subject_type IN ('project','plan','file')), subject_id TEXT NOT NULL, details TEXT, created_at TEXT NOT NULL);
CREATE INDEX activities_project_created_idx ON activities(project_id, created_at);

CREATE TRIGGER activity_no_update BEFORE UPDATE ON activities BEGIN SELECT RAISE(ABORT, 'Activity is append-only'); END;
CREATE TRIGGER activity_no_delete BEFORE DELETE ON activities BEGIN SELECT RAISE(ABORT, 'Activity is append-only'); END;
