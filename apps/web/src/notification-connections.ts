export type ChannelType =
  | "bark"
  | "discord"
  | "telegram"
  | "ntfy"
  | "webhook"
  | "webpush"
  | "in-app";

export interface BaseEndpoint {
  id: string;
  name: string;
  subtitle: string;
  projectIds?: string[] | null;
  createdAt?: string;
  isBotAccount?: boolean;
}

export interface BarkConnection {
  id: string;
  name: string;
  device_key: string;
  enabled: boolean;
  created_at: string;
  projectIds?: string[] | null;
}

export interface NtfyConnection {
  id: string;
  name: string;
  topic_url: string;
  has_auth_token: boolean;
  enabled: boolean;
  created_at: string;
  projectIds?: string[] | null;
}

export interface TelegramSubscriber {
  id: string;
  chat_id: string;
  username: string | null;
  first_name: string | null;
  notify_on_complete: number;
  notify_on_create: number;
  created_at: string;
  projectIds?: string[] | null;
}

export interface DiscordConnection {
  id: string;
  name: string;
  created_at: string;
  projectIds?: string[] | null;
}

export interface DiscordSubscriber {
  id: string;
  discord_user_id: string;
  discord_username: string | null;
  created_at: string;
}

export interface WebhookConnection {
  id: string;
  name: string;
  url: string;
  has_secret: boolean;
  created_at: string;
  projectIds?: string[] | null;
}

export interface LinkTokenData {
  token: string;
  botUsername?: string;
  expiresAt: string;
}
