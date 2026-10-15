#!/usr/bin/env python3
"""Create a private JSON export for the one-time local-development importer."""
import argparse
import json
import os
import sqlite3
from pathlib import Path


def rows(db, query):
    return [dict(row) for row in db.execute(query).fetchall()]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", help="SQLite source, e.g. ./statedock.sqlite")
    parser.add_argument("output", help="New output path; existing files are never overwritten")
    args = parser.parse_args()
    source = Path(args.database).expanduser().resolve(strict=True)
    destination = Path(args.output).expanduser().resolve()
    if source == destination or destination.exists():
        raise SystemExit("Choose a new output path; the source and existing files are never changed.")
    uri = source.as_uri() + "?mode=ro"
    db = sqlite3.connect(uri, uri=True)
    db.row_factory = sqlite3.Row
    try:
        tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        required = {"projects", "plans", "markdown_files", "activities", "plan_events"}
        missing = required - tables
        if missing:
            raise SystemExit(f"The selected file is not the active StateDock database; missing tables: {', '.join(sorted(missing))}")
        plan_columns = {r[1] for r in db.execute("PRAGMA table_info(plans)")}
        summary = "summary" if "summary" in plan_columns else "NULL AS summary"
        code_reference = (
            "code_reference" if "code_reference" in plan_columns else "NULL AS code_reference"
        )
        payload = {
            "format": "statedock-local-export-v1",
            "projects": rows(db, "SELECT id,slug,name,description,local_path,created_at,updated_at FROM projects ORDER BY created_at,id"),
            "plans": rows(db, f"SELECT id,project_id,number,global_number,title,body,{summary},{code_reference},status,created_at,updated_at FROM plans ORDER BY global_number"),
            "markdownFiles": rows(db, "SELECT project_id,path,content,updated_at FROM markdown_files ORDER BY project_id,path"),
            "activities": rows(db, "SELECT id,project_id,actor_id,actor_type,actor_name,action,subject_type,subject_id,details,created_at FROM activities ORDER BY created_at,id"),
            "planEvents": rows(db, "SELECT sequence,project_id,reference,number,title,kind,created_at FROM plan_events ORDER BY sequence"),
        }
    finally:
        db.close()
    destination.parent.mkdir(parents=True, exist_ok=True)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    fd = os.open(destination, flags, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        json.dump(payload, stream, ensure_ascii=False, separators=(",", ":"))
    print("Export created with private file permissions.")
    print(f"Projects: {len(payload['projects'])}; Plans: {len(payload['plans'])}; Markdown files: {len(payload['markdownFiles'])}; Activities: {len(payload['activities'])}; Plan events: {len(payload['planEvents'])}")
    print(f"Output: {destination}")


if __name__ == "__main__":
    main()
