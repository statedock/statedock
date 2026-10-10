import { formatProjectName } from "@/lib/project";
import type { Project } from "@statedock/core";
import { Bell, MessageSquare, Radio, Send, Smartphone, Webhook as WebhookIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "./api";
import { useI18n } from "./i18n/context";
import type { BaseEndpoint, ChannelType, LinkTokenData } from "./notification-connections";
import { useNotificationConnections } from "./useNotificationConnections";
export function useNotificationCenter({
  projects: propProjects,
  inAppToastsEnabled = true,
  onInAppToastsChange,
  onTestInAppToast,
  onClose,
}: {
  projects?: Project[];
  inAppToastsEnabled?: boolean;
  onInAppToastsChange?: (enabled: boolean) => void;
  onTestInAppToast?: () => void;
  onClose?: () => void;
}) {
  const { t, lang } = useI18n();
  const n = t.app.notifications;
  const isZh = lang === "zh";

  const [projects, setProjects] = useState<Project[]>(propProjects || []);
  const [activeChannel, setActiveChannel] = useState<ChannelType>("bark");
  const [selectedItemId, setSelectedItemId] = useState<string | "new" | null>(null);
  const [mobileStep, setMobileStep] = useState<"channels" | "list" | "detail">("channels");

  const {
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
  } = useNotificationConnections();
  const [actionBusy, setActionBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Creation forms state
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [newAuthToken, setNewAuthToken] = useState("");
  const [newTargetProject, setNewTargetProject] = useState("all");
  const [copied, setCopied] = useState(false);
  const [linkData, setLinkData] = useState<LinkTokenData | null>(null);

  // Sync projects
  useEffect(() => {
    if (propProjects && propProjects.length > 0) {
      setProjects(propProjects);
    } else {
      api<Project[]>("/projects")
        .then((ps) => setProjects(ps))
        .catch(() => {});
    }
  }, [propProjects]);

  // When switching channels, reset selection
  useEffect(() => {
    setLinkData(null);
    setStatusMessage("");
    setErrorMessage("");
    setNewName("");
    setNewAddress("");
    setNewSecret("");
    setNewAuthToken("");
    setNewTargetProject("all");

    // Auto select first item or "new" if empty
    if (activeChannel === "bark") {
      setSelectedItemId(barkItems.length > 0 ? barkItems[0].id : "new");
    } else if (activeChannel === "ntfy") {
      setSelectedItemId(ntfyItems.length > 0 ? ntfyItems[0].id : "new");
    } else if (activeChannel === "discord") {
      setSelectedItemId(
        discordWebhooks.length > 0
          ? discordWebhooks[0].id
          : discordBotSubscriber
            ? "discord-bot"
            : "new",
      );
    } else if (activeChannel === "telegram") {
      setSelectedItemId(telegramItems.length > 0 ? telegramItems[0].id : "new");
    } else if (activeChannel === "webhook") {
      setSelectedItemId(webhookItems.length > 0 ? webhookItems[0].id : "new");
    } else if (activeChannel === "in-app") {
      setSelectedItemId("in-app-config");
    }
  }, [activeChannel]);

  // Project name lookup helper
  function getProjectNames(ids?: string[] | null) {
    if (!ids || ids.length === 0) return "";
    return ids
      .map((id) => {
        const p = projects.find((proj) => proj.id === id);
        return p ? formatProjectName(p, isZh ? "收集箱" : "Inbox") : id.slice(0, 8);
      })
      .join(", ");
  }

  // Get current endpoint list for Column 2
  const currentEndpoints: BaseEndpoint[] = (() => {
    switch (activeChannel) {
      case "bark":
        return barkItems.map((b) => ({
          id: b.id,
          name: b.name,
          subtitle: `Key: ••••••••${b.device_key.slice(-4)}`,
          projectIds: b.projectIds,
          createdAt: b.created_at,
        }));
      case "ntfy":
        return ntfyItems.map((nItem) => ({
          id: nItem.id,
          name: nItem.name,
          subtitle: `Topic: ${nItem.topic_url.replace(/^https?:\/\//, "")}`,
          projectIds: nItem.projectIds,
          createdAt: nItem.created_at,
        }));
      case "discord": {
        const list: BaseEndpoint[] = discordWebhooks.map((d) => ({
          id: d.id,
          name: d.name,
          subtitle: `Webhook · ${d.created_at.slice(0, 10)}`,
          projectIds: d.projectIds,
          createdAt: d.created_at,
        }));
        if (discordBotSubscriber) {
          list.push({
            id: "discord-bot",
            name: isZh ? "Discord 交互机器人账号" : "Discord Bot Account",
            subtitle: `@${discordBotSubscriber.discord_username || "Linked User"}`,
            projectIds: null,
            createdAt: discordBotSubscriber.created_at,
            isBotAccount: true,
          });
        }
        return list;
      }
      case "telegram":
        return telegramItems.map((tItem) => ({
          id: tItem.id,
          name: tItem.first_name || (tItem.username ? `@${tItem.username}` : n.telegramDefaultUser),
          subtitle: `Chat ID: ${tItem.chat_id}`,
          projectIds: tItem.projectIds,
          createdAt: tItem.created_at,
        }));
      case "webhook":
        return webhookItems.map((w) => ({
          id: w.id,
          name: w.name,
          subtitle: w.url.length > 30 ? `${w.url.slice(0, 30)}…` : w.url,
          projectIds: w.projectIds,
          createdAt: w.created_at,
        }));
      case "in-app":
        return [
          {
            id: "in-app-config",
            name: isZh ? "站内即时浮动提醒" : "In-App Toast Alerts",
            subtitle: inAppToastsEnabled
              ? isZh
                ? "已启用 (5秒自动消失)"
                : "Enabled (5s auto-dismiss)"
              : isZh
                ? "已停用"
                : "Disabled",
            projectIds: null,
          },
        ];
    }
  })();

  // Channel metadata definitions
  const channelsList: {
    id: ChannelType;
    label: string;
    desc: string;
    icon: typeof Smartphone;
    count: number;
  }[] = [
    {
      id: "bark",
      label: "Bark",
      desc: "iOS (iPhone/iPad)",
      icon: Smartphone,
      count: barkItems.length,
    },
    {
      id: "discord",
      label: "Discord",
      desc: isZh ? "频道 Webhook & Bot" : "Webhooks & Bot",
      icon: MessageSquare,
      count: discordWebhooks.length + (discordBotSubscriber ? 1 : 0),
    },
    {
      id: "telegram",
      label: "Telegram",
      desc: isZh ? "机器人双向推送" : "Bot & Push",
      icon: Send,
      count: telegramItems.length,
    },
    {
      id: "ntfy",
      label: "ntfy",
      desc: isZh ? "Android / 桌面 / 网页" : "Android / Desktop",
      icon: Radio,
      count: ntfyItems.length,
    },
    {
      id: "webhook",
      label: "Webhook",
      desc: isZh ? "自定义 HTTP 回调" : "Custom HTTP",
      icon: WebhookIcon,
      count: webhookItems.length,
    },
    {
      id: "in-app",
      label: isZh ? "站内提醒" : "In-App",
      desc: isZh ? "5秒轻量弹窗" : "5s Toast Alerts",
      icon: Bell,
      count: inAppToastsEnabled ? 1 : 0,
    },
  ];

  // Action: Add new endpoint
  async function handleCreateEndpoint() {
    if (!newName.trim()) {
      setErrorMessage(isZh ? "请填写配置名称" : "Please provide a name");
      return;
    }
    setActionBusy(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const pIds = newTargetProject === "all" ? null : [newTargetProject];

      if (activeChannel === "bark") {
        if (!newAddress.trim())
          throw new Error(isZh ? "请填写 Bark 推送地址" : "Bark address is required");
        await api("/auth/notifications/bark", "POST", {
          name: newName.trim(),
          address: newAddress.trim(),
          projectIds: pIds,
        });
      } else if (activeChannel === "ntfy") {
        if (!newAddress.trim())
          throw new Error(isZh ? "请填写 ntfy Topic 地址" : "Topic URL is required");
        await api("/auth/notifications/ntfy", "POST", {
          name: newName.trim(),
          topic: newAddress.trim(),
          authToken: newAuthToken.trim() || undefined,
          projectIds: pIds,
        });
      } else if (activeChannel === "discord") {
        if (!newAddress.trim())
          throw new Error(isZh ? "请填写 Discord Webhook 地址" : "Webhook URL is required");
        await api("/auth/notifications/discord", "POST", {
          name: newName.trim(),
          url: newAddress.trim(),
          projectIds: pIds,
        });
      } else if (activeChannel === "webhook") {
        if (!newAddress.trim())
          throw new Error(isZh ? "请填写 Webhook URL" : "Webhook URL is required");
        await api("/auth/notifications/webhook", "POST", {
          name: newName.trim(),
          url: newAddress.trim(),
          secret: newSecret.trim() || undefined,
          projectIds: pIds,
        });
      }

      setStatusMessage(isZh ? "已成功添加配置！" : "Endpoint added successfully!");
      setNewName("");
      setNewAddress("");
      setNewSecret("");
      setNewAuthToken("");
      await loadChannelData();
    } catch (e) {
      setErrorMessage((e as Error).message);
    } finally {
      setActionBusy(false);
    }
  }

  // Action: Test endpoint
  async function handleTestEndpoint(id: string) {
    setActionBusy(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      await api(`/auth/notifications/${activeChannel}/${encodeURIComponent(id)}/test`, "POST");
      setStatusMessage(
        isZh ? "测试通知已发送，请检查接收设备！" : "Test notification sent successfully!",
      );
    } catch (e) {
      setErrorMessage((e as Error).message);
    } finally {
      setActionBusy(false);
    }
  }

  // Action: Delete endpoint
  async function handleDeleteEndpoint(id: string) {
    if (
      !confirm(
        isZh ? "确定要删除该通知端点配置吗？" : "Are you sure you want to remove this endpoint?",
      )
    )
      return;
    setActionBusy(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      if (activeChannel === "telegram") {
        await api(`/auth/telegram/${encodeURIComponent(id)}`, "DELETE");
      } else {
        await api(`/auth/notifications/${activeChannel}/${encodeURIComponent(id)}`, "DELETE");
      }
      setStatusMessage(isZh ? "配置已删除" : "Endpoint removed");
      setSelectedItemId(null);
      await loadChannelData();
    } catch (e) {
      setErrorMessage((e as Error).message);
    } finally {
      setActionBusy(false);
    }
  }

  // Action: Unlink Discord Bot account
  async function handleUnlinkDiscordBot() {
    if (!confirm(isZh ? "确定要解除 Discord 账号绑定吗？" : "Unlink Discord account?")) return;
    setActionBusy(true);
    try {
      await api("/auth/discord/subscriber", "DELETE");
      setDiscordBotSubscriber(null);
      setSelectedItemId(null);
      setStatusMessage(isZh ? "已解除 Discord 账号绑定" : "Discord account unlinked");
      await loadChannelData();
    } catch (e) {
      setErrorMessage((e as Error).message);
    } finally {
      setActionBusy(false);
    }
  }

  // Action: Generate Telegram link token
  async function handleGenerateTelegramLink() {
    setActionBusy(true);
    setErrorMessage("");
    try {
      const res = await api<LinkTokenData>("/auth/telegram/link-token", "POST");
      setLinkData(res);
    } catch (e) {
      setErrorMessage((e as Error).message);
    } finally {
      setActionBusy(false);
    }
  }

  // Action: Generate Discord link token
  async function handleGenerateDiscordLink() {
    setActionBusy(true);
    setErrorMessage("");
    try {
      const res = await api<LinkTokenData>("/auth/discord/link-token", "POST");
      setLinkData(res);
    } catch (e) {
      setErrorMessage((e as Error).message);
    } finally {
      setActionBusy(false);
    }
  }

  // Selected item object lookup
  const selectedItem = currentEndpoints.find((e) => e.id === selectedItemId);

  return {
    propProjects,
    inAppToastsEnabled,
    onInAppToastsChange,
    onTestInAppToast,
    onClose,
    t,
    lang,
    n,
    isZh,
    projects,
    setProjects,
    activeChannel,
    setActiveChannel,
    selectedItemId,
    setSelectedItemId,
    mobileStep,
    setMobileStep,
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
    actionBusy,
    setActionBusy,
    statusMessage,
    setStatusMessage,
    errorMessage,
    setErrorMessage,
    newName,
    setNewName,
    newAddress,
    setNewAddress,
    newSecret,
    setNewSecret,
    newAuthToken,
    setNewAuthToken,
    newTargetProject,
    setNewTargetProject,
    copied,
    setCopied,
    linkData,
    setLinkData,
    getProjectNames,
    currentEndpoints,
    channelsList,
    handleCreateEndpoint,
    handleTestEndpoint,
    handleDeleteEndpoint,
    handleUnlinkDiscordBot,
    handleGenerateTelegramLink,
    handleGenerateDiscordLink,
    selectedItem,
  };
}
