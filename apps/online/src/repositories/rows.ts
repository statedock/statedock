import type { Activity, Actor, PlanEvent, PlanStatus, TaskEntry } from "@statedock/core";
export interface ProjectRow {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  description: string | null;
  local_path: string | null;
  created_at: string;
  updated_at: string;
}
export interface PlanRow {
  id: string;
  project_id: string;
  number: number;
  global_number: number;
  title: string;
  body: string;
  summary: string | null;
  status: PlanStatus;
  created_at: string;
  updated_at: string;
}
export interface ActivityRow {
  id: string;
  project_id: string;
  actor_id: string;
  actor_type: Actor["type"];
  actor_name: string | null;
  action: string;
  subject_type: Activity["subjectType"];
  subject_id: string;
  details: string | null;
  created_at: string;
}
export interface EventRow {
  sequence: number;
  project_id: string;
  project_slug: string;
  reference: string;
  number: number;
  title: string;
  kind: PlanEvent["kind"];
  created_at: string;
}
export interface EntryRow {
  id: string;
  plan_id: string;
  kind: TaskEntry["kind"];
  content: string;
  actor_id: string;
  actor_type: Actor["type"];
  actor_name: string | null;
  created_at: string;
}
