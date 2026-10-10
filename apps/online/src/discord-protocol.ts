function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  rawBody: Uint8Array | string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(publicKeyHex),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const sigBytes = hexToBytes(signatureHex);
    const bodyBytes = typeof rawBody === "string" ? new TextEncoder().encode(rawBody) : rawBody;
    const timestampBytes = new TextEncoder().encode(timestamp);
    const data = new Uint8Array(timestampBytes.length + bodyBytes.length);
    data.set(timestampBytes, 0);
    data.set(bodyBytes, timestampBytes.length);

    return await crypto.subtle.verify("Ed25519", key, sigBytes, data);
  } catch (error) {
    console.error("Discord signature verification failed", error);
    return false;
  }
}

export interface DiscordInteraction {
  id: string;
  type: number; // 1 = PING, 2 = APPLICATION_COMMAND
  token: string;
  data?: {
    id: string;
    name: string;
    options?: { name: string; value: any; type: number }[];
  };
  channel_id?: string;
  guild_id?: string;
  user?: { id: string; username: string };
  member?: { user: { id: string; username: string } };
}

export interface DiscordInteractionResponse {
  type: number; // 1 = PONG, 4 = CHANNEL_MESSAGE_WITH_SOURCE
  data?: {
    content?: string;
    embeds?: {
      title?: string;
      description?: string;
      url?: string;
      color?: number;
      footer?: { text: string };
      fields?: { name: string; value: string; inline?: boolean }[];
    }[];
    flags?: number; // 64 = EPHEMERAL
  };
}

export const pong = (): DiscordInteractionResponse => ({ type: 1 });

export const ephemeral = (content: string): DiscordInteractionResponse => ({
  type: 4,
  data: { content, flags: 64 },
});

export const response = (
  content?: string,
  embeds?: NonNullable<DiscordInteractionResponse["data"]>["embeds"],
  isEphemeral = false,
): DiscordInteractionResponse => ({
  type: 4,
  data: {
    content,
    embeds,
    flags: isEphemeral ? 64 : undefined,
  },
});
