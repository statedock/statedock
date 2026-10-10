import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatProjectName } from "@/lib/project";
import { ArrowLeft, Check, Copy, ExternalLink, Folder, Plus, Trash2, Zap } from "lucide-react";
import { NotificationPreferences } from "./NotificationPreferences";
import { useNotificationCenter } from "./useNotificationCenter";
export function NotificationEndpointDetails({
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
    <div className={`space-y-2 lg:col-span-5 ${mobileStep !== "detail" ? "hidden lg:block" : ""}`}>
      <div className="flex items-center justify-between px-1 pb-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <button
            onClick={() => setMobileStep("list")}
            className="lg:hidden text-primary flex items-center mr-1"
          >
            <ArrowLeft className="h-3 w-3 mr-0.5" />
            {isZh ? "配置列表" : "List"}
          </button>
          <span>{isZh ? "3. 详细设置与偏好" : "3. Configuration & Details"}</span>
        </div>
      </div>

      <div className="rounded-xl border border-border/70 bg-card p-4 space-y-4 min-h-[480px]">
        {/* MODE A: Adding new endpoint */}
        {selectedItemId === "new" ? (
          <div className="space-y-4">
            <div className="border-b border-border/40 pb-2.5">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary" />
                {isZh
                  ? `添加新 ${activeChannel.toUpperCase()} 配置`
                  : `Add New ${activeChannel.toUpperCase()} Endpoint`}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isZh
                  ? "录入端点信息并绑定接收的项目"
                  : "Enter endpoint credentials and assign projects"}
              </p>
            </div>

            {activeChannel === "telegram" ? (
              // Telegram linking guide
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {isZh
                    ? "Telegram 通过与官方 Bot 会话绑定完成。点击下方生成 15 分钟临时授权指令，并在 Telegram 中向机器人发送即可完成连接。"
                    : "Telegram connects via the bot. Generate a 15-minute token below and send it to the bot in Telegram."}
                </p>
                {!linkData ? (
                  <Button
                    size="sm"
                    onClick={handleGenerateTelegramLink}
                    disabled={actionBusy}
                    className="w-full text-xs h-8.5"
                  >
                    {isZh ? "生成 Telegram 绑定链接" : "Generate Telegram Link"}
                  </Button>
                ) : (
                  <div className="space-y-2.5 rounded-lg border border-border/70 bg-muted/20 p-3">
                    <div className="flex gap-2">
                      <a
                        href={`https://t.me/${linkData.botUsername || "StatedockBot"}?start=${linkData.token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1"
                      >
                        <Button
                          size="sm"
                          className="w-full text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                          {isZh ? "打开 Telegram 并启动" : "Open in Telegram & Start"}
                        </Button>
                      </a>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          void navigator.clipboard.writeText(`/start ${linkData.token}`);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="h-8 px-3 text-xs"
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span className="ml-1 text-[11px]">
                          {copied ? (isZh ? "已复制" : "Copied") : isZh ? "复制指令" : "Copy"}
                        </span>
                      </Button>
                    </div>
                    <div className="rounded bg-muted p-2 font-mono text-[11px] text-muted-foreground flex items-center justify-between">
                      <span>/start {linkData.token}</span>
                      <span className="text-[10px]">@{linkData.botUsername || "StatedockBot"}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // General Add Endpoint Form (Bark, ntfy, Discord, Webhook)
              <div className="space-y-3.5">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    {isZh ? "端点友好名称" : "Endpoint Name"}
                  </label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={
                      activeChannel === "bark"
                        ? isZh
                          ? "例如：我的 iPhone 15 Pro"
                          : "e.g. My iPhone 15 Pro"
                        : activeChannel === "discord"
                          ? isZh
                            ? "例如：前端开发群通知"
                            : "e.g. Frontend Channel"
                          : activeChannel === "ntfy"
                            ? isZh
                              ? "例如：办公室工作机"
                              : "e.g. Work Laptop"
                            : isZh
                              ? "例如：自动化运维网关"
                              : "e.g. Ops Webhook Gateway"
                    }
                    className="h-8 text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    {activeChannel === "bark"
                      ? isZh
                        ? "Bark 推送完整地址"
                        : "Bark Address"
                      : activeChannel === "ntfy"
                        ? isZh
                          ? "ntfy Topic 地址"
                          : "ntfy Topic URL"
                        : isZh
                          ? "接收 Webhook 地址"
                          : "Webhook URL"}
                  </label>
                  <Input
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    placeholder={
                      activeChannel === "bark"
                        ? "https://api.day.app/xxxxxxxxxxxxxxx/"
                        : activeChannel === "ntfy"
                          ? "https://ntfy.sh/my-secret-topic"
                          : activeChannel === "discord"
                            ? "https://discord.com/api/webhooks/..."
                            : "https://your-api.com/webhook"
                    }
                    className="h-8 text-xs font-mono"
                  />
                </div>

                {activeChannel === "ntfy" && (
                  <div>
                    <label className="text-xs font-medium text-foreground block mb-1">
                      {isZh ? "可选认证 Bearer Token / 访问密码" : "Optional Auth Token"}
                    </label>
                    <Input
                      type="password"
                      value={newAuthToken}
                      onChange={(e) => setNewAuthToken(e.target.value)}
                      placeholder="tk_xxxxxxxxxxxx"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                )}

                {activeChannel === "webhook" && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-foreground">
                        {isZh ? "HMAC-SHA256 签名密钥 (可选)" : "HMAC-SHA256 Secret (Optional)"}
                      </label>
                      <button
                        type="button"
                        onClick={() => setNewSecret(crypto.randomUUID().replace(/-/g, ""))}
                        className="text-[11px] text-blue-500 hover:underline"
                      >
                        {isZh ? "自动生成密钥" : "Generate Secret"}
                      </button>
                    </div>
                    <Input
                      type="password"
                      value={newSecret}
                      onChange={(e) => setNewSecret(e.target.value)}
                      placeholder="whsec_xxxxxxxxxxxx"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                )}

                {/* Initial Project Assignment */}
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    {isZh ? "初始关联项目" : "Assign to Project"}
                  </label>
                  <select
                    value={newTargetProject}
                    onChange={(e) => setNewTargetProject(e.target.value)}
                    className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="all">
                      🌐 {isZh ? "全部项目 (接收所有项目动态)" : "All Projects"}
                    </option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        📁 {formatProjectName(p, isZh ? "收集箱" : "Inbox")}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-2 flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleCreateEndpoint}
                    disabled={actionBusy}
                    className="text-xs h-8 flex-1"
                  >
                    {actionBusy
                      ? isZh
                        ? "正在保存…"
                        : "Saving…"
                      : isZh
                        ? "保存并启用端点"
                        : "Save & Enable"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedItemId(currentEndpoints[0]?.id || null)}
                    className="text-xs h-8"
                  >
                    {isZh ? "取消" : "Cancel"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : selectedItem ? (
          // MODE B: Inspecting / Editing existing endpoint
          <div className="space-y-4">
            {/* Header card for the selected item */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-foreground truncate">
                    {selectedItem.name}
                  </h3>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono">
                    {activeChannel.toUpperCase()}
                  </Badge>
                </div>
                <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                  {selectedItem.subtitle}
                </p>
              </div>

              {/* Actions: Test & Delete */}
              <div className="flex items-center gap-2">
                {activeChannel !== "in-app" && !selectedItem.isBotAccount && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionBusy}
                    onClick={() => handleTestEndpoint(selectedItem.id)}
                    className="h-7.5 text-xs px-2.5"
                  >
                    <Zap className="mr-1 h-3.5 w-3.5 text-amber-500" />
                    {isZh ? "发送测试" : "Send Test"}
                  </Button>
                )}

                {selectedItem.isBotAccount ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={actionBusy}
                    onClick={handleUnlinkDiscordBot}
                    className="h-7.5 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    {isZh ? "解除账号绑定" : "Unlink Account"}
                  </Button>
                ) : activeChannel !== "in-app" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={actionBusy}
                    onClick={() => handleDeleteEndpoint(selectedItem.id)}
                    className="h-7.5 text-xs text-muted-foreground hover:text-rose-500"
                    title={isZh ? "删除该端点" : "Delete endpoint"}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>

            {/* Sub-view: In-App Toasts config */}
            {activeChannel === "in-app" ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/30 p-3.5 text-xs">
                  <div>
                    <span className="font-semibold text-foreground block">
                      {isZh ? "站内浮动提醒开关" : "In-App Floating Toasts"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {isZh
                        ? "任务状态变化时在屏幕右下角弹出 5 秒倒计时提示"
                        : "Pops up a 5-second countdown notification on task events"}
                    </span>
                  </div>
                  {onInAppToastsChange && (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={inAppToastsEnabled}
                      onClick={() => onInAppToastsChange(!inAppToastsEnabled)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        inAppToastsEnabled ? "bg-primary" : "bg-muted-foreground/30"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
                          inAppToastsEnabled ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  )}
                </div>

                <div className="rounded-lg border border-border/60 bg-muted/10 p-3 text-xs space-y-2">
                  <span className="font-semibold text-foreground text-xs block">
                    {isZh ? "交互特性：" : "Interaction Features:"}
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-muted-foreground">
                    <li>
                      {isZh
                        ? "鼠标悬停在弹窗上时倒计时自动暂停"
                        : "Hovering over toast pauses the timer"}
                    </li>
                    <li>
                      {isZh
                        ? "点击弹窗直接跳转并高亮对应的任务详情"
                        : "Clicking toast navigates directly to the task"}
                    </li>
                    <li>
                      {isZh ? "点击右上角 × 可立即提前关闭" : "Click × to dismiss immediately"}
                    </li>
                  </ul>
                </div>

                {onTestInAppToast && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onTestInAppToast}
                    className="text-xs h-8"
                  >
                    <Zap className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
                    {isZh ? "立即触发测试弹窗" : "Trigger Test Toast"}
                  </Button>
                )}
              </div>
            ) : selectedItem.isBotAccount ? (
              // Discord Bot Account Info & Commands
              <div className="space-y-4">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs space-y-2">
                  <span className="font-semibold text-foreground text-xs block">
                    {isZh ? "Discord 斜杠指令指南：" : "Discord Commands Guide:"}
                  </span>
                  <div className="grid grid-cols-1 gap-1.5 text-[11px] font-mono text-muted-foreground">
                    <div>
                      • <code className="text-foreground">/todo [project]</code> —{" "}
                      {isZh ? "查看待安排任务" : "View planned"}
                    </div>
                    <div>
                      • <code className="text-foreground">/doing [project]</code> —{" "}
                      {isZh ? "查看正在进行" : "View working"}
                    </div>
                    <div>
                      • <code className="text-foreground">/review [project]</code> —{" "}
                      {isZh ? "查看卡住需介入" : "View blockers"}
                    </div>
                    <div>
                      • <code className="text-foreground">/done [project]</code> —{" "}
                      {isZh ? "查看最近交付成果" : "View recent done"}
                    </div>
                    <div>
                      • <code className="text-foreground">/summary [project]</code> —{" "}
                      {isZh ? "查看项目总览" : "Status summary"}
                    </div>
                    <div>
                      • <code className="text-foreground">/plan &lt;text&gt;</code> —{" "}
                      {isZh ? "随手记录想法 (自动存入收集箱)" : "Quick capture"}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              // Standard Endpoint Detail: Project Association & NotificationPreferences
              <div className="space-y-4">
                {/* Project Assignment banner (matching master-detail style) */}
                <div className="rounded-lg border border-border/80 bg-muted/30 p-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <Folder className="h-4 w-4 text-purple-500" />
                    <span>{isZh ? "项目过滤范围" : "Project Scope"}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {isZh
                      ? "在此配置该端点仅接收哪些项目的动态，或设置为全部项目广播。"
                      : "Configure which projects this endpoint receives updates for."}
                  </p>
                </div>

                {/* Integrated Notification Preferences Editor */}
                <NotificationPreferences
                  channel={activeChannel as "bark" | "telegram" | "discord" | "ntfy" | "webhook"}
                  id={selectedItem.id}
                  projects={projects}
                  onSaved={() => {
                    void loadChannelData();
                  }}
                />

                {/* Extra channel guidance */}
                {activeChannel === "telegram" && (
                  <div className="rounded-lg border border-border/50 bg-muted/15 p-3 text-[11px] font-mono text-muted-foreground space-y-1">
                    <span className="font-semibold text-foreground text-xs block font-sans">
                      {isZh ? "Telegram 指令速查：" : "Telegram Commands:"}
                    </span>
                    <div>• /todo [project] · /doing · /review · /done</div>
                    <div>• /summary · /use [project]</div>
                  </div>
                )}

                {activeChannel === "webhook" && (
                  <div className="rounded-lg border border-border/50 bg-muted/15 p-3 text-[11px] text-muted-foreground space-y-1 leading-relaxed">
                    <span className="font-semibold text-foreground text-xs block">
                      {isZh ? "Webhook 签名校验规范：" : "Webhook Signature Spec:"}
                    </span>
                    <p className="font-mono text-[10px]">
                      x-statedock-signature: sha256=&lt;hmac-hex&gt;
                    </p>
                    <p className="font-mono text-[10px]">
                      x-statedock-timestamp: &lt;unix-epoch-ms&gt;
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-muted-foreground">
            {isZh ? "请在左侧或中间列选择一个端点查看详情" : "Select an endpoint to view details"}
          </div>
        )}
      </div>
    </div>
  );
}
