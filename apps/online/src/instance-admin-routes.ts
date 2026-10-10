import { Hono } from "hono";
import { z } from "zod";
import { currentSession, type OnlineEnv } from "./auth.js";
import { isAdministrator, setUserDisabled } from "./instance-admin-service.js";
import { jsonError, sameOrigin } from "./http.js";

const app = new Hono<{ Bindings: OnlineEnv; Variables: { actorId: string } }>();
app.use("/api/admin/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  if (!sameOrigin(c.req.raw)) return jsonError("origin_not_allowed", 403);
  const session = await currentSession(c);
  if (!session) return jsonError("unauthorized", 401);
  if (!(await isAdministrator(c.env.DB, session.id)))
    return jsonError("administrator_required", 403);
  c.set("actorId", session.id);
  await next();
});
app.get("/api/admin/instance", async (c) =>
  c.json({
    data: {
      registrationMode: "invite",
      publicUrl: c.env.PUBLIC_BASE_URL,
      emailConfigured: Boolean(c.env.EMAIL_FROM && (c.env.RESEND_API_KEY || c.env.EMAIL)),
      telegramConfigured: Boolean(c.env.TELEGRAM_BOT_TOKEN),
      discordConfigured: Boolean(c.env.DISCORD_PUBLIC_KEY && c.env.DISCORD_APPLICATION_ID),
    },
  }),
);
// Kept as an explicit rejection for older clients: public registration cannot be enabled.
app.put("/api/admin/instance", (c) => jsonError("registration_fixed", 403));
app.get("/api/admin/users", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT id,email,disabled_at,instance_approved_at,created_at FROM users ORDER BY created_at DESC LIMIT 200",
  ).all();
  return c.json({ data: rows.results });
});
app.post("/api/admin/users", async (c) => {
  const parsed = z
    .object({
      email: z
        .string()
        .trim()
        .email()
        .max(320)
        .transform((v) => v.toLowerCase()),
    })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return jsonError("validation_error", 400);
  const at = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO users(id,email,created_at,instance_approved_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM instance_settings WHERE key='admin_user_id' AND value=?) ON CONFLICT(email) DO UPDATE SET instance_approved_at=COALESCE(users.instance_approved_at,excluded.instance_approved_at)",
    ).bind(crypto.randomUUID(), parsed.data.email, at, at, c.get("actorId")),
    c.env.DB.prepare(
      "INSERT INTO admin_events(id,actor_id,action,subject_id,created_at) SELECT ?,?,'user.invited',?,? WHERE changes()=1",
    ).bind(crypto.randomUUID(), c.get("actorId"), parsed.data.email, at),
  ]);
  return c.json({ data: { email: parsed.data.email } }, 201);
});
app.put("/api/admin/users/:id", async (c) => {
  const parsed = z
    .object({ disabled: z.boolean() })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return jsonError("validation_error", 400);
  const id = c.req.param("id");
  if (await isAdministrator(c.env.DB, id)) return jsonError("cannot_disable_administrator", 409);
  const changed = await setUserDisabled(c.env.DB, c.get("actorId"), id, parsed.data.disabled);
  if (!changed) return jsonError("user_not_found", 404);
  return c.json({ data: { id, disabled: parsed.data.disabled } });
});
app.get("/api/admin/events", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT id,actor_id,action,subject_id,created_at FROM admin_events ORDER BY created_at DESC LIMIT 100",
  ).all();
  return c.json({ data: rows.results });
});
export default app;
