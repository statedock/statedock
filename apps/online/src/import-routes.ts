import { Hono } from "hono";
import { z } from "zod";
import { codeReferenceSchema } from "@statedock/core";
import { type OnlineEnv, currentSession } from "./auth.js";
import { jsonError, sameOrigin } from "./http.js";

const app = new Hono<{ Bindings: OnlineEnv }>();

app.post("/api/auth/import-local", async (c) => {
  if (!sameOrigin(c.req.raw)) return jsonError("origin_not_allowed", 403);
  const session = await currentSession(c);
  if (!session) return jsonError("unauthorized", 401);
  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).byteLength > 2_000_000)
    return jsonError("import_too_large", 413);
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return jsonError("invalid_json", 400);
  }
  const idString = z.string().min(1).max(200),
    dateString = z.string().datetime({ offset: true });
  const imported = z
    .object({
      format: z.literal("statedock-local-export-v1"),
      projects: z
        .array(
          z.object({
            id: idString,
            slug: z.string().min(1).max(100),
            name: z.string().min(1).max(200),
            description: z.string().max(10000).nullable(),
            local_path: z.string().max(1000).nullable(),
            created_at: dateString,
            updated_at: dateString,
          }),
        )
        .max(20),
      plans: z
        .array(
          z.object({
            id: idString,
            project_id: idString,
            number: z.number().int().positive(),
            global_number: z.number().int().positive(),
            title: z.string().min(1).max(300),
            body: z.string().max(1_000_000),
            summary: z.string().max(1000).nullable().optional(),
            code_reference: z
              .string()
              .max(4096)
              .nullable()
              .optional()
              .superRefine((value, ctx) => {
                if (value == null) return;
                try {
                  codeReferenceSchema.parse(JSON.parse(value));
                } catch {
                  ctx.addIssue({ code: "custom", message: "Invalid code reference" });
                }
              }),
            status: z.enum(["PLAN", "READY", "WORKING", "WAITING", "DONE", "DROPPED"]),
            created_at: dateString,
            updated_at: dateString,
          }),
        )
        .max(30),
      markdownFiles: z
        .array(
          z.object({
            project_id: idString,
            path: z.string().min(1).max(500),
            content: z.string().max(1_000_000),
            updated_at: dateString,
          }),
        )
        .max(20),
      activities: z
        .array(
          z.object({
            id: idString,
            project_id: idString,
            actor_id: idString,
            actor_type: z.enum(["human", "agent", "system"]),
            actor_name: z.string().max(200).nullable(),
            action: z.string().min(1).max(200),
            subject_type: z.enum(["project", "plan", "file"]),
            subject_id: idString,
            details: z.string().max(10000).nullable(),
            created_at: dateString,
          }),
        )
        .max(50),
      planEvents: z
        .array(
          z.object({
            sequence: z.number().int().positive(),
            project_id: idString,
            reference: z.string().min(1).max(20),
            number: z.number().int().positive(),
            title: z.string().min(1).max(300),
            kind: z.enum(["created", "started", "completed", "dropped"]),
            created_at: dateString,
          }),
        )
        .max(50),
    })
    .superRefine((v, ctx) => {
      const total =
        v.projects.length +
        v.plans.length +
        v.markdownFiles.length +
        v.activities.length +
        v.planEvents.length;
      if (total > 90)
        ctx.addIssue({
          code: "custom",
          message:
            "This migration tool supports up to 90 existing records; contact an administrator for a larger database.",
        });
      const projectIds = new Set(v.projects.map((p) => p.id));
      for (const row of [...v.plans, ...v.markdownFiles, ...v.activities, ...v.planEvents])
        if (!projectIds.has(row.project_id))
          ctx.addIssue({
            code: "custom",
            message: "Export contains a record for a missing project.",
          });
    });
  const parsed = imported.safeParse(input);
  if (!parsed.success)
    return c.json({ error: "invalid_export", details: parsed.error.flatten() }, 400);
  const already = await c.env.DB.prepare(
    "SELECT (SELECT COUNT(*) FROM projects) projects,(SELECT COUNT(*) FROM import_runs) imports",
  ).first<{ projects: number; imports: number }>();
  if ((already?.projects ?? 0) > 0 || (already?.imports ?? 0) > 0)
    return jsonError("database_not_empty", 409);
  const v = parsed.data,
    at = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare("UPDATE plan_sequence SET importing=1,last_number=? WHERE id=1").bind(
      Math.max(0, ...v.plans.map((p) => p.global_number)),
    ),
  ];
  for (const p of v.projects)
    statements.push(
      c.env.DB.prepare(
        "INSERT INTO projects(id,owner_id,slug,name,description,local_path,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
      ).bind(
        p.id,
        session.id,
        p.slug,
        p.name,
        p.description,
        p.local_path,
        p.created_at,
        p.updated_at,
      ),
    );
  for (const p of v.plans)
    statements.push(
      c.env.DB.prepare(
        "INSERT INTO plans(id,project_id,number,global_number,title,body,summary,code_reference,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      ).bind(
        p.id,
        p.project_id,
        p.number,
        p.global_number,
        p.title,
        p.body,
        p.summary ?? null,
        p.code_reference ?? null,
        p.status,
        p.created_at,
        p.updated_at,
      ),
    );
  for (const f of v.markdownFiles)
    statements.push(
      c.env.DB.prepare(
        "INSERT INTO markdown_files(project_id,path,content,updated_at) VALUES(?,?,?,?)",
      ).bind(f.project_id, f.path, f.content, f.updated_at),
    );
  for (const a of v.activities)
    statements.push(
      c.env.DB.prepare(
        "INSERT INTO activities(id,project_id,actor_id,actor_type,actor_name,action,subject_type,subject_id,details,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ).bind(
        a.id,
        a.project_id,
        a.actor_id,
        a.actor_type,
        a.actor_name,
        a.action,
        a.subject_type,
        a.subject_id,
        a.details,
        a.created_at,
      ),
    );
  for (const e of v.planEvents)
    statements.push(
      c.env.DB.prepare(
        "INSERT INTO plan_events(sequence,project_id,reference,number,title,kind,created_at) VALUES(?,?,?,?,?,?,?)",
      ).bind(e.sequence, e.project_id, e.reference, e.number, e.title, e.kind, e.created_at),
    );
  statements.push(c.env.DB.prepare("UPDATE plan_sequence SET importing=0 WHERE id=1"));
  statements.push(
    c.env.DB.prepare(
      "INSERT INTO import_runs(id,owner_id,source,row_count,created_at) VALUES(?,?, 'local-sqlite',?,?)",
    ).bind(
      crypto.randomUUID(),
      session.id,
      v.projects.length +
        v.plans.length +
        v.markdownFiles.length +
        v.activities.length +
        v.planEvents.length,
      at,
    ),
  );
  try {
    await c.env.DB.batch(statements);
  } catch (e) {
    console.error("StateDock local import failed", e);
    return jsonError("import_conflict", 409);
  }
  return c.json(
    {
      data: {
        projects: v.projects.length,
        plans: v.plans.length,
        markdownFiles: v.markdownFiles.length,
        activities: v.activities.length,
        planEvents: v.planEvents.length,
      },
    },
    201,
  );
});

export default app;
