import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  localPath: text("local_path"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const plans = sqliteTable(
  "plans",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    globalNumber: integer("global_number").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    summary: text("summary"),
    status: text("status", { enum: ["PLAN", "READY", "WORKING", "WAITING", "DONE", "DROPPED"] })
      .notNull()
      .default("PLAN"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("plans_global_number_uq").on(t.globalNumber),
    uniqueIndex("plans_project_number_uq").on(t.projectId, t.number),
    index("plans_project_status_idx").on(t.projectId, t.status),
  ],
);
export const markdownFiles = sqliteTable(
  "markdown_files",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    content: text("content").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.path] })],
);
export const activities = sqliteTable(
  "activities",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    actorId: text("actor_id").notNull(),
    actorType: text("actor_type", { enum: ["human", "agent", "system"] }).notNull(),
    actorName: text("actor_name"),
    action: text("action").notNull(),
    subjectType: text("subject_type", { enum: ["project", "plan", "file"] }).notNull(),
    subjectId: text("subject_id").notNull(),
    details: text("details"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("activities_project_created_idx").on(t.projectId, t.createdAt)],
);

export const planSequence = sqliteTable("plan_sequence", {
  id: integer("id").primaryKey(),
  lastNumber: integer("last_number").notNull(),
});

export const planEvents = sqliteTable("plan_events", {
  sequence: integer("sequence").primaryKey({ autoIncrement: true }),
  projectId: text("project_id").notNull(),
  reference: text("reference").notNull(),
  number: integer("number").notNull(),
  title: text("title").notNull(),
  kind: text("kind", { enum: ["created", "started", "completed", "waiting", "dropped"] }).notNull(),
  createdAt: text("created_at").notNull(),
});

export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey(),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  data: text("data").notNull(),
  createdAt: text("created_at").notNull(),
});

export const taskEntries = sqliteTable("task_entries", {
  id: text("id").primaryKey(),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["review", "feedback"] }).notNull(),
  content: text("content").notNull(),
  actorId: text("actor_id").notNull(),
  actorType: text("actor_type", { enum: ["human", "agent", "system"] }).notNull(),
  actorName: text("actor_name"),
  createdAt: text("created_at").notNull(),
});
