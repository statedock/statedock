import { useNotificationCenter } from "./useNotificationCenter";
export function NotificationChannelRail({
  model,
}: {
  model: ReturnType<typeof useNotificationCenter>;
}) {
  const {
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
  } = model;
  return (
    <div
      className={`space-y-2 lg:col-span-3 ${mobileStep !== "channels" ? "hidden lg:block" : ""}`}
    >
      <div className="px-1 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {isZh ? "1. 通知渠道" : "1. Channels"}
      </div>

      <div className="rounded-xl border border-border/70 bg-card p-1.5 space-y-1 shadow-xs">
        {channelsList.map((ch) => {
          const Icon = ch.icon;
          const isActive = activeChannel === ch.id;
          return (
            <button
              key={ch.id}
              onClick={() => {
                setActiveChannel(ch.id);
                setMobileStep("list");
              }}
              className={`w-full flex items-center justify-between gap-3 p-2.5 rounded-lg text-left transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-md ${
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium leading-tight truncate">{ch.label}</div>
                  <div
                    className={`text-[10px] leading-tight truncate ${isActive ? "text-primary-foreground/80" : "text-muted-foreground/80"}`}
                  >
                    {ch.desc}
                  </div>
                </div>
              </div>

              <span
                className={`font-mono text-[10px] px-1.5 py-0.5 rounded-full ${
                  isActive
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : ch.count > 0
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {ch.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-[11px] text-muted-foreground leading-relaxed">
        <span className="font-semibold block text-foreground mb-1">
          💡 {isZh ? "项目隔离原则" : "Project Isolation"}
        </span>
        {isZh
          ? "每个端点均可指定关联 1 个或多个项目。未关联项目的端点将不会收到任何推送，避免打扰。"
          : "Each endpoint can be linked to specific projects. Unlinked endpoints receive no pushes."}
      </div>
    </div>
  );
}
