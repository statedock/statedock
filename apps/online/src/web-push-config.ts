import type { OnlineEnv } from "./auth.js";
/** Keys are operator-managed persistent secrets. Never generate them in a request. */
export function webPushConfig(env: OnlineEnv) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return null;
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT,
  };
}
/** Browser push services only: an authenticated user must not turn this into arbitrary outbound fetch. */
export function validPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (!url.port || url.port === "443") &&
      (url.hostname === "fcm.googleapis.com" ||
        url.hostname === "updates.push.services.mozilla.com" ||
        url.hostname === "web.push.apple.com" ||
        url.hostname.endsWith(".push.apple.com") ||
        url.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
export function validPushKeys(keys: { p256dh: string; auth: string }) {
  try {
    const decode = (v: string) =>
      Uint8Array.from(atob(v.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const publicKey = decode(keys.p256dh);
    return publicKey.length === 65 && publicKey[0] === 4 && decode(keys.auth).length === 16;
  } catch {
    return false;
  }
}
