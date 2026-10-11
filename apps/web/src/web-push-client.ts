import { api } from "./api";
export interface WebPushDevice {
  id: string;
  name: string;
  language: string;
  active: number;
  enabled: number | null;
  projectIds: string[] | null;
  created_at: string;
}
export interface WebPushSettings {
  publicKey: string | null;
  devices: WebPushDevice[];
}
export function supportsWebPush() {
  return (
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}
export async function pushDeviceId(subscription: PushSubscription) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(subscription.endpoint),
  );
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function currentPushDevice() {
  if (!supportsWebPush()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? await pushDeviceId(subscription) : null;
}
export async function enableWebPush(
  publicKey: string,
  name: string,
  language: "en" | "zh",
  permission: Promise<NotificationPermission>,
) {
  if ((await permission) !== "granted") throw new Error("push_permission_denied");
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const key = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    }));
  try {
    const result = await api<{ id: string; userId: string }>("/auth/web-push", "POST", {
      name,
      language,
      subscription: subscription.toJSON(),
    });
    registration.active?.postMessage({ type: "PUSH_ACCOUNT", userId: result.userId });
    return result.id;
  } catch (error) {
    // A failed registration must not leave an unregistered browser endpoint behind.
    if (!existing) await subscription.unsubscribe().catch(() => {});
    throw error;
  }
}
export async function removeWebPush(id: string) {
  await api(`/auth/web-push/${encodeURIComponent(id)}`, "DELETE");
  if (!supportsWebPush()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription && (await pushDeviceId(subscription)) === id) await subscription.unsubscribe();
}
export async function clearPushOnSignOut() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  registration?.active?.postMessage({ type: "PUSH_ACCOUNT", userId: null });
  const subscription = await registration?.pushManager.getSubscription();
  await subscription?.unsubscribe().catch(() => {});
}
