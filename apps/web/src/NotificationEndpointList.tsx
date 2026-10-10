import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronRight, Plus, Sliders } from "lucide-react";
import { useNotificationCenter } from "./useNotificationCenter";
export function NotificationEndpointList({
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
    <div className={`space-y-2 lg:col-span-4 ${mobileStep !== "list" ? "hidden lg:block" : ""}`}>
      <div className="flex items-center justify-between px-1 pb-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <button
            onClick={() => setMobileStep("channels")}
            className="lg:hidden text-primary flex items-center mr-1"
          >
            <ArrowLeft className="h-3 w-3 mr-0.5" />
            {isZh ? "渠道" : "Channels"}
          </button>
          <span>{isZh ? "2. 配置项目" : "2. Endpoints"}</span>
          <span className="font-mono text-[10px] text-muted-foreground">
            ({currentEndpoints.length})
          </span>
        </div>

        {activeChannel !== "in-app" && (
          <Button
            size="sm"
            variant={selectedItemId === "new" ? "secondary" : "outline"}
            onClick={() => {
              setSelectedItemId("new");
              setMobileStep("detail");
            }}
            className="h-7 text-xs px-2 shadow-xs"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {activeChannel === "telegram"
              ? isZh
                ? "绑定新账号"
                : "Link Bot"
              : activeChannel === "discord"
                ? isZh
                  ? "添加 Webhook"
                  : "Add Webhook"
                : isZh
                  ? "添加端点"
                  : "Add Endpoint"}
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-border/70 bg-card p-2 space-y-2 min-h-[480px]">
        {/* "Add New" active indicator card */}
        {selectedItemId === "new" && (
          <div className="rounded-lg border-2 border-primary bg-primary/5 p-3 text-xs shadow-xs transition-all">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-primary flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                {isZh ? "正在添加新配置…" : "Adding new endpoint…"}
              </span>
              <Badge
                variant="outline"
                className="text-[9px] uppercase border-primary/30 text-primary"
              >
                {isZh ? "新建中" : "New"}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {isZh ? "在右侧填写参数并保存" : "Fill parameters on the right"}
            </p>
          </div>
        )}

        {currentEndpoints.length === 0 && selectedItemId !== "new" ? (
          <div className="rounded-lg border border-dashed border-border/70 p-8 text-center space-y-3">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Sliders className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">
                {isZh ? "暂无配置端点" : "No endpoints configured"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {isZh
                  ? "点击上方按钮即可添加你的第一个推送端点"
                  : "Click Add Endpoint above to get started"}
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setSelectedItemId("new");
                setMobileStep("detail");
              }}
              className="text-xs h-7.5"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {isZh ? "立即添加" : "Add Now"}
            </Button>
          </div>
        ) : (
          currentEndpoints.map((item) => {
            const isSelected = selectedItemId === item.id;
            return (
              <div
                key={item.id}
                onClick={() => {
                  setSelectedItemId(item.id);
                  setMobileStep("detail");
                }}
                className={`group cursor-pointer rounded-lg border p-3 text-xs transition-all ${
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20 shadow-xs"
                    : "border-border/70 hover:border-border hover:bg-muted/40"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h4
                        className={`font-semibold text-xs truncate ${isSelected ? "text-primary" : "text-foreground"}`}
                      >
                        {item.name}
                      </h4>
                      {item.isBotAccount && (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1 py-0 border-blue-500/30 text-blue-500"
                        >
                          BOT
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] font-mono text-muted-foreground truncate mt-0.5">
                      {item.subtitle}
                    </p>
                  </div>

                  <ChevronRight
                    className={`h-4 w-4 shrink-0 transition-transform ${
                      isSelected
                        ? "text-primary translate-x-0.5"
                        : "text-muted-foreground/40 group-hover:text-muted-foreground"
                    }`}
                  />
                </div>

                {/* Project association badge row */}
                <div className="mt-2.5 pt-2 border-t border-border/40 flex items-center justify-between">
                  <div>
                    {item.projectIds === null || item.projectIds === undefined ? (
                      <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                        🌐 {n.badgeAllProjects}
                      </span>
                    ) : item.projectIds.length > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400">
                        📁 {n.badgeProjectPrefix}
                        {getProjectNames(item.projectIds)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                        ⚠️ {n.badgeNoProjects}
                      </span>
                    )}
                  </div>

                  {item.createdAt && (
                    <span className="font-mono text-[9px] text-muted-foreground/60">
                      {item.createdAt.slice(0, 10)}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
