import { Hono } from "hono";
import { type OnlineEnv } from "./auth.js";
import { handleDiscordInteraction, verifyDiscordSignature } from "./discord-interactions.js";
import { jsonError, timingSafeEqual } from "./http.js";
import { notificationRepository } from "./notification-service.js";
import { captureTelegram, telegramWebhookSecret } from "./telegram-capture.js";

const app = new Hono<{ Bindings: OnlineEnv }>();

app.post("/api/telegram/webhook", async (c) => {
  if (!c.env.SESSION_SECRET || !c.env.TELEGRAM_BOT_TOKEN)
    return jsonError("integration_unavailable", 503);
  const secret = c.req.header("X-Telegram-Bot-Api-Secret-Token") ?? "";
  if (!timingSafeEqual(secret, await telegramWebhookSecret(c.env)))
    return jsonError("unauthorized", 401);
  const update = await c.req.json().catch(() => null);
  if (!update) return c.json({ ok: true });
  try {
    await captureTelegram(c.env, update, notificationRepository);
    return c.json({ ok: true });
  } catch {
    console.error("Telegram capture failed");
    return c.json({ ok: false }, 500);
  }
});

app.post("/api/discord/interactions", async (c) => {
  const signature = c.req.header("X-Signature-Ed25519");
  const timestamp = c.req.header("X-Signature-Timestamp");
  const rawBody = await c.req.text();

  if (!c.env.DISCORD_PUBLIC_KEY) return c.text("Discord integration unavailable", 503);
  {
    if (!signature || !timestamp) return c.text("Invalid request signature", 401);
    const valid = await verifyDiscordSignature(
      c.env.DISCORD_PUBLIC_KEY,
      signature,
      timestamp,
      rawBody,
    );
    if (!valid) return c.text("Invalid request signature", 401);
  }

  let interaction: any;
  try {
    interaction = JSON.parse(rawBody);
  } catch {
    return c.text("Invalid JSON", 400);
  }

  const response = await handleDiscordInteraction(c.env, interaction, notificationRepository);
  return c.json(response);
});

export default app;
