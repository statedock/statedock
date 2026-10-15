import {
  actorSchema,
  ConflictError,
  createPlanSchema,
  createProjectSchema,
  fileSchema,
  handoffSchema,
  NotFoundError,
  planCreationMessage,
  planStatuses,
  StateDockService,
  updatePlanSchema,
  updateProjectSchema,
} from "@statedock/core";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { Buffer } from "node:buffer";
import { z, ZodError } from "zod";

export function createApp(service: StateDockService) {
  const app = new Hono<{ Variables: { actor: import("@statedock/core").Actor } }>();
  app.use("*", async (c, next) => {
    c.set(
      "actor",
      actorSchema.parse({
        id: c.req.header("x-actor-id") ?? "anonymous",
        type: c.req.header("x-actor-type") ?? "human",
        name: c.req.header("x-actor-name"),
      }),
    );
    await next();
  });
  app.onError((error, c) => {
    if (error instanceof SyntaxError) return c.json({ error: "invalid_json" }, 400);
    if (error instanceof ZodError)
      return c.json({ error: "validation_error", details: error.flatten() }, 400);
    if (error instanceof NotFoundError)
      return c.json({ error: "not_found", message: error.message }, 404);
    if (error instanceof ConflictError)
      return c.json({ error: "conflict", message: error.message }, 409);
    console.error(error);
    return c.json({ error: "internal_error" }, 500);
  });
  app.use(
    "/api/plans/:reference/attachments",
    bodyLimit({
      maxSize: 5 * 1024 * 1024,
      onError: (c) => c.json({ message: "图片不能超过 5 MB。" }, 413),
    }),
  );
  app.get("/api/plans/:reference/attachments", async (c) =>
    c.json({ data: await service.listAttachments({ reference: c.req.param("reference") }) }),
  );
  app.post("/api/plans/:reference/attachments", async (c) => {
    const bytes = await c.req.arrayBuffer();
    return c.json(
      {
        data: await service.writeAttachment(
          { reference: c.req.param("reference") },
          {
            name: decodeURIComponent(c.req.header("x-file-name") ?? "image"),
            mimeType: c.req.header("content-type"),
            data: Buffer.from(bytes).toString("base64"),
          },
          c.get("actor"),
        ),
      },
      201,
    );
  });
  app.get("/api/attachments/:id", async (c) => {
    const row = await service.readAttachment(c.req.param("id"));
    return new Response(Buffer.from(row.data, "base64"), {
      headers: {
        "Content-Type": row.mimeType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  });
  app.delete("/api/attachments/:id", async (c) => {
    await service.deleteAttachment(c.req.param("id"), c.get("actor"));
    return c.body(null, 204);
  });
  app.get("/api/plans/:reference/reviews", async (c) =>
    c.json({ data: await service.listReviews({ reference: c.req.param("reference") }) }),
  );
  app.post("/api/plans/:reference/reviews", async (c) =>
    c.json(
      {
        data: await service.addReview(
          { reference: c.req.param("reference") },
          await c.req.json(),
          c.get("actor"),
        ),
      },
      201,
    ),
  );
  app.get("/api/plans/:reference/feedback", async (c) =>
    c.json({ data: await service.listFeedback({ reference: c.req.param("reference") }) }),
  );
  app.post("/api/plans/:reference/feedback", async (c) =>
    c.json(
      {
        data: await service.addFeedback(
          { reference: c.req.param("reference") },
          await c.req.json(),
          c.get("actor"),
        ),
      },
      201,
    ),
  );
  app.get("/api/plans/:reference", async (c) =>
    c.json({ data: await service.resolvePlan({ reference: c.req.param("reference") }) }),
  );
  app.post("/api/plans/:reference/start", async (c) =>
    c.json({
      data: await service.startPlan({ reference: c.req.param("reference") }, c.get("actor")),
    }),
  );
  app.post("/api/plans/:reference/move", async (c) => {
    const { targetProject } = z
      .object({ targetProject: z.string().min(1) })
      .parse(await c.req.json());
    return c.json({
      data: await service.movePlan(
        { reference: c.req.param("reference") },
        targetProject,
        c.get("actor"),
      ),
    });
  });
  app.post("/api/plans/:reference/pause", async (c) => {
    const { reason } = z.object({ reason: z.string().min(1) }).parse(await c.req.json());
    return c.json({
      data: await service.pauseTask(
        { reference: c.req.param("reference") },
        reason,
        c.get("actor"),
      ),
    });
  });
  app.post("/api/plans/:reference/handoff", async (c) => {
    const body = handoffSchema.parse(await c.req.json());
    return c.json({
      data: await service.submitHandoff(
        { reference: c.req.param("reference") },
        body,
        c.get("actor"),
      ),
    });
  });
  app.get("/api/plan-events", async (c) =>
    c.json({
      data: await service.listPlanEvents(
        c.req.query("after") === undefined
          ? undefined
          : z.coerce.number().int().nonnegative().safe().parse(c.req.query("after")),
        c.req.query("limit") === undefined
          ? 100
          : z.coerce.number().int().min(1).max(200).parse(c.req.query("limit")),
      ),
    }),
  );
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.get("/api/projects", async (c) => c.json({ data: await service.listProjects() }));
  app.post("/api/projects", async (c) =>
    c.json(
      {
        data: await service.createProject(
          createProjectSchema.parse(await c.req.json()),
          c.get("actor"),
        ),
      },
      201,
    ),
  );
  app.get("/api/projects/:project", async (c) =>
    c.json({ data: await service.getProject(c.req.param("project")) }),
  );
  app.get("/api/projects/:project/resume", async (c) =>
    c.json({ data: await service.resumeProject(c.req.param("project")) }),
  );
  app.post("/api/projects/:project/claim-next", async (c) =>
    c.json({ data: await service.claimNextTask(c.req.param("project"), c.get("actor")) }),
  );
  app.patch("/api/projects/:project", async (c) =>
    c.json({
      data: await service.updateProject(
        c.req.param("project"),
        updateProjectSchema.parse(await c.req.json()),
        c.get("actor"),
      ),
    }),
  );
  app.delete("/api/projects/:project", async (c) => {
    await service.deleteProject(c.req.param("project"), c.get("actor"));
    return c.body(null, 204);
  });
  app.get("/api/projects/:project/plans", async (c) => {
    const status = c.req.query("status");
    const parsed = status ? z.enum(planStatuses).parse(status) : undefined;
    return c.json({ data: await service.listPlans(c.req.param("project"), parsed) });
  });
  app.post("/api/projects/:project/plans", async (c) => {
    const plan = await service.createPlan(
      c.req.param("project"),
      createPlanSchema.parse(await c.req.json()),
      c.get("actor"),
    );
    return c.json(
      {
        data: {
          ...plan,
          creationMessage: planCreationMessage(plan),
          startPrompt: plan.status === "PLAN" ? `开始 ${plan.reference}` : null,
        },
      },
      201,
    );
  });
  app.get("/api/projects/:project/plans/:number", async (c) =>
    c.json({
      data: await service.getPlan(
        c.req.param("project"),
        z.coerce.number().int().positive().parse(c.req.param("number")),
      ),
    }),
  );
  app.patch("/api/projects/:project/plans/:number", async (c) =>
    c.json({
      data: await service.updatePlan(
        c.req.param("project"),
        z.coerce.number().int().positive().parse(c.req.param("number")),
        updatePlanSchema.parse(await c.req.json()),
        c.get("actor"),
      ),
    }),
  );
  app.get("/api/projects/:project/files", async (c) =>
    c.json({ data: await service.listFiles(c.req.param("project")) }),
  );
  app.get("/api/projects/:project/files/*", async (c) =>
    c.json({
      data: await service.getFile(
        c.req.param("project"),
        decodeURIComponent(c.req.path.split("/files/")[1] ?? ""),
      ),
    }),
  );
  app.put("/api/projects/:project/files", async (c) => {
    const b = fileSchema.parse(await c.req.json());
    return c.json({
      data: await service.writeFile(c.req.param("project"), b.path, b.content, c.get("actor")),
    });
  });
  app.get("/api/projects/:project/activity", async (c) =>
    c.json({
      data: await service.listActivity(
        c.req.param("project"),
        z.coerce
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .parse(c.req.query("limit") ?? "50"),
      ),
    }),
  );
  app.delete("/api/projects/:project/files/*", async (c) => {
    await service.deleteFile(
      c.req.param("project"),
      decodeURIComponent(c.req.path.split("/files/")[1] ?? ""),
      c.get("actor"),
    );
    return c.body(null, 204);
  });
  app.post("/api/projects/:project/activity", async (c) => {
    await service.appendActivity(c.req.param("project"), await c.req.json(), c.get("actor"));
    return c.body(null, 201);
  });
  return app;
}
