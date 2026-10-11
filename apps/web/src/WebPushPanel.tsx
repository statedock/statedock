import { useEffect, useState } from "react";
import type { Project } from "@statedock/core";
import { Bell, RefreshCw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "./i18n/context";
import { api } from "./api";
import { NotificationPreferences } from "./NotificationPreferences";
import {
  currentPushDevice,
  enableWebPush,
  removeWebPush,
  supportsWebPush,
  type WebPushSettings,
} from "./web-push-client";
const errorText = (code: string, zh: boolean) => {
  const messages: Record<string, [string, string]> = {
    push_permission_denied: [
      "Allow notifications in your browser or system settings, then try again.",
      "请在浏览器或系统设置中允许通知后重试。",
    ],
    push_device_bound_elsewhere: [
      "This browser is linked to another account. Sign out of that account before enabling notifications here.",
      "此浏览器仍绑定其他账号，请先退出原账号再启用。",
    ],
    web_push_not_configured: [
      "The server has not configured Web Push yet.",
      "服务器尚未配置 Web Push。",
    ],
    push_device_limit: [
      "Up to 20 devices can be connected. Remove an old device first.",
      "最多可连接 20 台设备，请先移除旧设备。",
    ],
    rate_limited: ["Wait 30 seconds before sending another test.", "请等待 30 秒后再发送测试。"],
    push_subscription_expired: [
      "This subscription expired. Enable this device again.",
      "此订阅已失效，请重新启用此设备。",
    ],
  };
  return (
    messages[code]?.[zh ? 1 : 0] ??
    (zh
      ? "操作失败，请检查网络与通知权限后重试。"
      : "Could not complete the action. Check your connection and notification permissions, then retry.")
  );
};
export function WebPushPanel({
  projects,
  onCount,
}: {
  projects: Project[];
  onCount: (n: number) => void;
}) {
  const { lang } = useI18n(),
    zh = lang === "zh";
  const [settings, setSettings] = useState<WebPushSettings>({ publicKey: null, devices: [] });
  const [current, setCurrent] = useState<string | null>(null),
    [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [message, setMessage] = useState("");
  const supported = supportsWebPush();
  async function load() {
    const [data, id] = await Promise.all([
      api<WebPushSettings>("/auth/web-push"),
      currentPushDevice(),
    ]);
    setSettings(data);
    setCurrent(id);
    onCount(data.devices.length);
    setReady(true);
    setSelected((old) =>
      data.devices.some((d) => d.id === old)
        ? old
        : (data.devices.find((d) => d.id === id)?.id ?? data.devices[0]?.id ?? null),
    );
  }
  useEffect(() => {
    let active = true;
    void load().catch((e) => {
      if (active) setMessage(errorText(e.message, zh));
    });
    return () => {
      active = false;
    };
  }, [lang]);
  async function action(run: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await run();
      await load();
      setMessage(success);
    } catch (e) {
      setMessage(errorText((e as Error).message, zh));
    } finally {
      setBusy(false);
    }
  }
  const currentDevice = settings.devices.find((d) => d.id === current);
  const device = settings.devices.find((d) => d.id === selected);
  return (
    <section className="lg:col-span-9 min-w-0 space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Bell className="h-4 w-4" />
            {zh ? "设备后台通知" : "Device notifications"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {zh
              ? "任务完成或受阻时，即使 PWA 关闭也能收到系统通知。无需 Bark 等额外应用。"
              : "Receive system notifications when tasks finish or need your input, even with the PWA closed. No extra app required."}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void action(load, zh ? "已刷新" : "Refreshed")}
          aria-label={zh ? "刷新设备" : "Refresh devices"}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {zh
          ? "iPhone / iPad：先添加到主屏幕，再点击启用并允许通知。其他设备请使用支持 Web Push 的浏览器。"
          : "iPhone / iPad: add StateDock to your Home Screen, then enable and allow notifications. On other devices, use a Web Push-compatible browser."}
      </p>
      {!supported && (
        <p role="status" className="text-sm text-muted-foreground">
          {zh
            ? "此环境不支持 Web Push。请打开已安装的 PWA 或支持的 HTTPS 浏览器。"
            : "Web Push is unavailable here. Open the installed PWA or a supported browser over HTTPS."}
        </p>
      )}
      {ready && !settings.publicKey && (
        <p role="status" className="text-sm text-muted-foreground">
          {zh
            ? "管理员尚未配置后台通知。"
            : "The administrator has not configured background notifications yet."}
        </p>
      )}
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          aria-label={zh ? "此设备名称" : "This device’s name"}
          placeholder={zh ? "例如：我的 iPhone" : "e.g. My iPhone"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          className="sm:max-w-64"
        />
        <Button
          disabled={busy || !supported || !settings.publicKey}
          onClick={() => {
            // Permission must be requested synchronously inside this click on iOS.
            const permission =
              Notification.permission === "default"
                ? Notification.requestPermission()
                : Promise.resolve(Notification.permission);
            void action(
              () =>
                enableWebPush(
                  settings.publicKey!,
                  name.trim() || currentDevice?.name || (zh ? "我的设备" : "My device"),
                  lang,
                  permission,
                ),
              zh ? "此设备已启用后台通知" : "Background notifications enabled for this device",
            );
          }}
        >
          {currentDevice?.active
            ? zh
              ? "更新此设备"
              : "Update this device"
            : zh
              ? "启用此设备通知"
              : "Enable this device"}
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">
            {zh ? "已连接设备" : "Connected devices"} ({settings.devices.length})
          </h3>
          {!settings.devices.length && (
            <p className="text-sm text-muted-foreground">
              {zh
                ? "尚未连接设备。请在每台设备上分别启用。"
                : "No devices connected. Enable notifications separately on each device."}
            </p>
          )}
          {settings.devices.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelected(d.id)}
              className={`w-full min-w-0 rounded-lg border p-3 text-left ${d.id === selected ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <span className="flex gap-2 items-center text-sm font-medium break-words">
                <Smartphone className="h-4 w-4 shrink-0" />
                {d.name}
              </span>
              <span className="block mt-1 text-xs text-muted-foreground">
                {d.id === current ? (zh ? "此设备 · " : "This device · ") : ""}
                {!d.active
                  ? zh
                    ? "请在此设备重新启用"
                    : "Re-enable on this device"
                  : d.enabled === 0
                    ? zh
                      ? "已暂停"
                      : "Paused"
                    : zh
                      ? "已启用"
                      : "Enabled"}
              </span>
            </button>
          ))}
        </div>
        {device && (
          <div className="min-w-0 rounded-lg border border-border p-3">
            <h3 className="text-sm font-semibold break-words">{device.name}</h3>
            <div className="flex flex-wrap gap-2 mt-3">
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !device.active}
                onClick={() =>
                  void action(
                    () => api(`/auth/web-push/${device.id}/test`, "POST"),
                    zh
                      ? "测试已发送，请查看设备通知"
                      : "Test sent. Check the device’s notifications.",
                  )
                }
              >
                {zh ? "发送测试" : "Send test"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void action(
                    () => removeWebPush(device.id),
                    zh ? "设备通知已关闭" : "Device notifications disabled",
                  )
                }
              >
                {zh ? "关闭此设备通知" : "Disable this device"}
              </Button>
            </div>
            <NotificationPreferences
              key={device.id}
              channel="webpush"
              id={device.id}
              projects={projects}
              onSaved={() => void load()}
            />
          </div>
        )}
      </div>
      <p role="status" className="text-xs">
        {message}
      </p>
      <p className="text-xs text-muted-foreground">
        {zh
          ? "自建实例不经过 StateDock 官方中转。通知可送达不代表网页可从外网访问；局域网实例可能需要 VPN 才能打开任务。"
          : "Self-hosted instances send directly to browser push services, without a StateDock relay. Receiving a notification does not make a private server reachable; opening a LAN-hosted task may require a VPN."}
      </p>
    </section>
  );
}
