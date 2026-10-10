import { digest, type OnlineEnv } from "./auth.js";
import { instanceConfig } from "./instance-config.js";

export async function telegramWebhookSecret(env: OnlineEnv) {
  if (!env.SESSION_SECRET) throw new Error("Telegram webhook secret unavailable");
  return digest(`statedock-webhook:${env.SESSION_SECRET}`);
}

export async function ensureTelegramWebhook(env: OnlineEnv) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  const secret = await telegramWebhookSecret(env);
  const webhookUrl = instanceConfig(env).telegramWebhookUrl;
  const fingerprint = await digest(secret + env.TELEGRAM_BOT_TOKEN + webhookUrl);
  const configured = await env.DB.prepare(
    "SELECT value FROM integration_settings WHERE key='telegram_webhook'",
  ).first<{ value: string }>();
  if (configured?.value === fingerprint) return;
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ["message"],
    }),
    signal: AbortSignal.timeout(8000),
  });
  const result = (await response.json()) as { ok?: boolean };
  if (!response.ok || !result.ok) throw new Error("Telegram webhook setup failed");
  await env.DB.prepare(
    "INSERT INTO integration_settings(key,value) VALUES('telegram_webhook',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  )
    .bind(fingerprint)
    .run();
}
