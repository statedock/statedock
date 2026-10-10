import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Project } from "@statedock/core";
import { ArrowLeft, Bell, CheckCircle2, RefreshCw } from "lucide-react";
import { NotificationChannelRail } from "./NotificationChannelRail";
import { NotificationEndpointDetails } from "./NotificationEndpointDetails";
import { NotificationEndpointList } from "./NotificationEndpointList";

import { useNotificationCenter } from "./useNotificationCenter";
export function NotificationCenter({
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
  const model = useNotificationCenter({
    projects: propProjects,
    inAppToastsEnabled,
    onInAppToastsChange,
    onTestInAppToast,
    onClose,
  });
  const {
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
  } = model;
  return (
    <div className="space-y-4">
      {/* Top Header / Breadcrumb Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/40">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Bell className="h-4.5 w-4.5" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">
              {isZh ? "消息通知中心" : "Notification Center"}
            </h1>
            <Badge
              variant="outline"
              className="text-[10px] font-mono uppercase text-muted-foreground"
            >
              {isZh ? "三栏控制台" : "3-Column Console"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isZh
              ? "多渠道出站通知管理：左侧选择渠道、中间查看配置端点、右侧细化项目关联与事件偏好。"
              : "Multi-channel notification management: select channel on the left, inspect endpoints in the middle, refine project associations on the right."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadChannelData()}
            disabled={loading}
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {isZh ? "刷新数据" : "Refresh"}
          </Button>
          {onClose && (
            <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs shrink-0">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              {isZh ? "返回工作台" : "Back to Workspace"}
            </Button>
          )}
        </div>
      </div>

      {/* Global Status / Alert Banners */}
      {statusMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}
      {(errorMessage || channelErrors[activeChannel]) && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-500">
          <span className="font-semibold">⚠️</span>
          <span>{errorMessage || channelErrors[activeChannel]}</span>
        </div>
      )}

      {/* 3-Column Layout Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* ============================================================ */}
        {/* COLUMN 1: Notification Channels Rail (lg:col-span-3)        */}
        {/* ============================================================ */}
        <NotificationChannelRail model={model} />

        {/* ============================================================ */}
        {/* COLUMN 2: Endpoints / Configurations List (lg:col-span-4)   */}
        {/* ============================================================ */}
        <NotificationEndpointList model={model} />

        {/* ============================================================ */}
        {/* COLUMN 3: Details & Preferences Panel (lg:col-span-5)        */}
        {/* ============================================================ */}
        <NotificationEndpointDetails model={model} />
      </div>
    </div>
  );
}
