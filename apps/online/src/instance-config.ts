/** Runtime addresses are instance configuration, not product capabilities. */
export interface InstanceOptions {
  PUBLIC_BASE_URL?: string;
  APP_BASE_URL?: string;
}
export function instanceConfig(env: InstanceOptions = {}) {
  const publicUrl = new URL(env.PUBLIC_BASE_URL ?? "http://localhost:8787");
  const appUrl = new URL(env.APP_BASE_URL ?? env.PUBLIC_BASE_URL ?? "http://localhost:8787");
  for (const url of [publicUrl, appUrl]) {
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
      throw new Error("Invalid instance URL");
  }
  return {
    publicOrigin: publicUrl.origin,
    appOrigin: appUrl.origin,
    mcpUrl: new URL("/mcp", publicUrl).href,
    telegramWebhookUrl: new URL("/api/telegram/webhook", publicUrl).href,
  };
}
