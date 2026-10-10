import { readFileSync } from "node:fs";
export const migrations = [
  {
    version: 1,
    sql: readFileSync(new URL("./migrations/0000_initial.sql", import.meta.url), "utf8"),
  },
  {
    version: 2,
    sql: readFileSync(new URL("./migrations/0001_local_path.sql", import.meta.url), "utf8"),
  },
  {
    version: 3,
    sql: readFileSync(new URL("./migrations/0002_plan_reference.sql", import.meta.url), "utf8"),
  },
  {
    version: 4,
    sql: readFileSync(new URL("./migrations/0003_plan_events.sql", import.meta.url), "utf8"),
  },
  {
    version: 5,
    sql: readFileSync(new URL("./migrations/0004_goal_summary_drop.sql", import.meta.url), "utf8"),
  },
  {
    version: 6,
    sql: readFileSync(new URL("./migrations/0005_attachments.sql", import.meta.url), "utf8"),
  },
  {
    version: 7,
    sql: readFileSync(new URL("./migrations/0006_task_entries.sql", import.meta.url), "utf8"),
  },
  {
    version: 8,
    sql: readFileSync(new URL("./migrations/0007_waiting_events.sql", import.meta.url), "utf8"),
  },
];
