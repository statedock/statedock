import type { Context } from "hono";

export interface OnlineEnv {
  PUBLIC_BASE_URL?: string;
  APP_BASE_URL?: string;
  DB: D1Database;
  ATTACHMENTS: R2Bucket;
  ASSETS: Fetcher;
  OAUTH_KV: KVNamespace;
  EMAIL?: {
    send(message: {
      to: string;
      from: string;
      subject: string;
      text: string;
    }): Promise<{ messageId: string }>;
  };
  APP_ENV: string;
  EMAIL_FROM?: string;
  SESSION_SECRET: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  OWNER_EMAIL?: string;
  RESEND_API_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  DISCORD_PUBLIC_KEY?: string;
  DISCORD_APPLICATION_ID?: string;
}
const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");
const randomToken = (size = 32) => {
  const b = new Uint8Array(size);
  crypto.getRandomValues(b);
  return hex(b);
};
export async function digest(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}
async function codeHash(secret: string, email: string, code: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, encoder.encode(`${email.toLowerCase()}\n${code}`)),
    ),
  );
}
export async function sendLoginCode(env: OnlineEnv, email: string, code: string) {
  if (!env.EMAIL_FROM) throw new Error("email_not_configured");
  const message = {
    from: env.EMAIL_FROM,
    to: email,
    subject: "Your StateDock sign-in code",
    text: `Your StateDock verification code is ${code}. It expires in 10 minutes.`,
  };
  if (env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });
    if (!response.ok) throw new Error("email_delivery_failed");
  } else if (env.EMAIL) {
    await env.EMAIL.send(message);
  } else throw new Error("email_not_configured");
}
export async function currentSession(c: Pick<Context<{ Bindings: OnlineEnv }>, "req" | "env">) {
  const token = c.req
    .header("Cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("statedock_session="))
    ?.slice("statedock_session=".length);
  if (!token) return null;
  const row = await c.env.DB.prepare(
    "SELECT u.id,u.email,s.id session_id,u.disabled_at,u.auth_version FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND u.disabled_at IS NULL AND u.instance_approved_at IS NOT NULL AND s.expires_at>? LIMIT 1",
  )
    .bind(await digest(token), new Date().toISOString())
    .first<{
      id: string;
      email: string;
      session_id: string;
      disabled_at: string | null;
      auth_version: number;
    }>();
  return row ?? null;
}
export function cookie(token: string, maxAge: number, _host?: string) {
  return `statedock_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
export function clearCookie(_host?: string) {
  return cookie("", 0);
}
export function randomCode() {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return String(b[0] % 1_000_000).padStart(6, "0");
}
export { codeHash, randomToken };
