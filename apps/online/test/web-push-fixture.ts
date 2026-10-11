import { fixture } from "./fixture.js";
import { digest, type OnlineEnv } from "../src/auth.js";
export async function pushFixture() {
  const f = await fixture();
  const vapid = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const jwk = await crypto.subtle.exportKey("jwk", vapid.privateKey);
  const raw = await crypto.subtle.exportKey("raw", vapid.publicKey);
  const env = {
    DB: f.db,
    ATTACHMENTS: f.bucket,
    PUBLIC_BASE_URL: "https://instance.test",
    VAPID_PUBLIC_KEY: Buffer.from(raw).toString("base64url"),
    VAPID_PRIVATE_KEY: jwk.d!,
    VAPID_SUBJECT: "mailto:support@example.test",
  } as OnlineEnv;
  for (const user of ["one", "two"])
    await f.client.execute({
      sql: "INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,'2099-01-01','now')",
      args: [user, user, await digest(user)],
    });
  const keys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const p256dh = Buffer.from(await crypto.subtle.exportKey("raw", keys.publicKey)).toString(
    "base64url",
  );
  const auth = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");
  const subscription = (name: string) => ({
    name,
    language: "en",
    subscription: { endpoint: `https://fcm.googleapis.com/wp/${name}`, keys: { p256dh, auth } },
  });
  return { ...f, env, keys, subscription };
}
