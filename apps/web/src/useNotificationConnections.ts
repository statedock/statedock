import { useEffect, useState } from "react";
import { api } from "./api";
import { apiErrorMessage } from "./api-error-message";
import { useI18n } from "./i18n/context";
import type {
  BarkConnection,
  ChannelType,
  DiscordConnection,
  DiscordSubscriber,
  NtfyConnection,
  TelegramSubscriber,
  WebhookConnection,
} from "./notification-connections";

export function useNotificationConnections() {
  const { lang } = useI18n();
  const [barkItems, setBarkItems] = useState<BarkConnection[]>([]);
  const [ntfyItems, setNtfyItems] = useState<NtfyConnection[]>([]);
  const [telegramItems, setTelegramItems] = useState<TelegramSubscriber[]>([]);
  const [discordWebhooks, setDiscordWebhooks] = useState<DiscordConnection[]>([]);
  const [discordBotSubscriber, setDiscordBotSubscriber] = useState<DiscordSubscriber | null>(null);
  const [webhookItems, setWebhookItems] = useState<WebhookConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [channelErrors, setChannelErrors] = useState<Partial<Record<ChannelType, string>>>({});
  async function loadChannelData() {
    setLoading(true);
    const errors: Partial<Record<ChannelType, string>> = {};
    const load = async <T>(channel: ChannelType, path: string, apply: (data: T) => void) => {
      try {
        apply(await api<T>(path));
      } catch (error) {
        errors[channel] = apiErrorMessage(error, lang);
      }
    };
    await Promise.all([
      load<BarkConnection[]>("bark", "/auth/notifications/bark", setBarkItems),
      load<NtfyConnection[]>("ntfy", "/auth/notifications/ntfy", setNtfyItems),
      load<TelegramSubscriber[]>("telegram", "/auth/telegram", setTelegramItems),
      load<DiscordConnection[]>("discord", "/auth/notifications/discord", setDiscordWebhooks),
      load<{ subscriber: DiscordSubscriber | null }>(
        "discord",
        "/auth/discord/subscriber",
        (data) => setDiscordBotSubscriber(data.subscriber),
      ),
      load<WebhookConnection[]>("webhook", "/auth/notifications/webhook", setWebhookItems),
    ]);
    setChannelErrors(errors);
    setLoading(false);
  }
  useEffect(() => {
    void loadChannelData();
  }, [lang]);
  return {
    barkItems,
    setBarkItems,
    ntfyItems,
    setNtfyItems,
    telegramItems,
    setTelegramItems,
    discordWebhooks,
    setDiscordWebhooks,
    discordBotSubscriber,
    setDiscordBotSubscriber,
    webhookItems,
    setWebhookItems,
    loading,
    channelErrors,
    loadChannelData,
  };
}
