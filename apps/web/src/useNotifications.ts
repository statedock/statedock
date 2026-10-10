import type { PlanEvent, PlanEventPage } from "@statedock/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { freshEvents, notificationText } from "./notification-events";

const supported = () => typeof Notification !== "undefined" && window.isSecureContext;

export function useNotifications(
  open: (event: PlanEvent) => void,
  lang: "en" | "zh" = "en",
  userId = "local",
) {
  const scope = `${window.location.origin}:${userId}`;
  const enabledKey = `statedock.notifications.${scope}.enabled`;
  const inAppToastsKey = `statedock.notifications.${scope}.in_app_toasts`;
  const cursorKey = `statedock.notifications.${scope}.cursor`;
  const [enabled, setEnabled] = useState(() => localStorage.getItem(enabledKey) === "true");
  const [inAppToastsEnabled, setInAppToastsEnabledState] = useState(
    () => localStorage.getItem(inAppToastsKey) !== "false",
  );
  const inAppToastsRef = useRef(inAppToastsEnabled);
  inAppToastsRef.current = inAppToastsEnabled;

  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    supported() ? Notification.permission : "unsupported",
  );
  const [toasts, setToasts] = useState<PlanEvent[]>([]);
  const [problem, setProblem] = useState("");
  const openRef = useRef(open);
  openRef.current = open;

  const setInAppToastsEnabled = useCallback(
    (value: boolean) => {
      localStorage.setItem(inAppToastsKey, value ? "true" : "false");
      setInAppToastsEnabledState(value);
      if (!value) setToasts([]);
    },
    [inAppToastsKey],
  );

  useEffect(() => {
    setEnabled(localStorage.getItem(enabledKey) === "true");
    setInAppToastsEnabledState(localStorage.getItem(inAppToastsKey) !== "false");
    setToasts([]);
    setProblem("");
  }, [enabledKey, inAppToastsKey]);

  // Listen for clicks forwarded from Service Worker
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handleSwMessage = (e: MessageEvent) => {
      if (e.data?.type === "NAVIGATE_TO_PLAN" && e.data.data) {
        openRef.current(e.data.data);
      }
    };
    navigator.serviceWorker.addEventListener("message", handleSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleSwMessage);
    };
  }, []);

  const emit = useCallback(
    async (event: PlanEvent) => {
      if (inAppToastsRef.current) {
        setToasts((items) => [...items, event].slice(-5));
      }

      if (supported() && Notification.permission === "granted") {
        const text = notificationText(event, lang);
        const options: NotificationOptions = {
          body: text.body,
          icon: "/icons/statedock-192.png",
          badge: "/icons/favicon-32x32.png",
          tag: `statedock-event-${event.sequence}`,
          data: event,
        };

        let shown = false;

        // 1. Prioritize Service Worker registration.showNotification (standard PWA OS push)
        if ("serviceWorker" in navigator) {
          try {
            const registration = await navigator.serviceWorker.ready;
            if (registration && typeof registration.showNotification === "function") {
              await registration.showNotification(text.title, options);
              shown = true;
              setProblem("");
            }
          } catch {
            // Fall through to window Notification
          }
        }

        // 2. Fallback to standard window Notification
        if (!shown) {
          try {
            const notification = new Notification(text.title, options);
            notification.onclick = () => {
              window.focus();
              openRef.current(event);
              notification.close();
            };
            setProblem("");
          } catch {
            setProblem(
              lang === "zh"
                ? "浏览器无法直接显示系统通知，已保留页面提示。请检查系统设置中的通知权限。"
                : "Browser notifications could not be displayed directly. In-app alerts remain active. Please check system notification settings.",
            );
          }
        }
      }
    },
    [lang],
  );

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let busy = false;

    async function poll() {
      if (busy || stopped) return;
      busy = true;
      try {
        const consume = async () => {
          if (stopped) return;
          const stored = localStorage.getItem(cursorKey);
          const parsed = stored === null ? undefined : Number(stored);
          let cursor =
            parsed !== undefined && Number.isSafeInteger(parsed) && parsed >= 0
              ? parsed
              : undefined;

          // First activation establishes a baseline; old history does not burst.
          if (cursor === undefined) {
            const page = await api<PlanEventPage>("/plan-events");
            if (!stopped) localStorage.setItem(cursorKey, String(page.cursor));
            return;
          }

          for (let batch = 0; batch < 10 && !stopped; batch++) {
            const page: PlanEventPage = await api<PlanEventPage>(
              `/plan-events?after=${cursor}&limit=100`,
            );
            if (stopped) return;
            for (const event of freshEvents(page.events, cursor ?? 0)) {
              localStorage.setItem(cursorKey, String(event.sequence));
              void emit(event);
            }
            cursor = page.cursor;
            if (!page.hasMore) break;
          }
          setPermission(supported() ? Notification.permission : "unsupported");
        };

        if (navigator.locks) {
          await navigator.locks.request(
            `statedock-notification-feed:${scope}`,
            { ifAvailable: true },
            async (lock) => {
              if (lock) await consume();
            },
          );
        } else {
          await consume();
        }
      } catch {
        if (!stopped)
          setProblem(
            lang === "zh"
              ? "通知连接暂时中断，恢复后会继续接收。"
              : "Notification connection temporarily interrupted; will reconnect automatically.",
          );
      } finally {
        busy = false;
      }
    }

    void poll();
    const timer = setInterval(() => void poll(), 5000);
    const onStorage = (event: StorageEvent) => {
      if (event.key === enabledKey) setEnabled(event.newValue === "true");
      if (event.key === inAppToastsKey) setInAppToastsEnabledState(event.newValue !== "false");
    };
    const onFocus = () => void poll();

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, emit, lang, scope, cursorKey, enabledKey, inAppToastsKey]);

  async function toggle() {
    if (enabled) {
      localStorage.setItem(enabledKey, "false");
      setEnabled(false);
      setToasts([]);
      return;
    }

    const permissionPromise =
      supported() && Notification.permission === "default"
        ? Notification.requestPermission()
        : Promise.resolve(supported() ? Notification.permission : ("unsupported" as const));

    try {
      const [page, value] = await Promise.all([
        api<PlanEventPage>("/plan-events"),
        permissionPromise,
      ]);
      localStorage.setItem(cursorKey, String(page.cursor));
      setPermission(value);
      localStorage.setItem(enabledKey, "true");
      setEnabled(true);
      setProblem("");
    } catch {
      setProblem(
        lang === "zh"
          ? "暂时无法启用通知，请重试。"
          : "Could not enable notifications. Please try again.",
      );
    }
  }

  return {
    enabled,
    permission,
    toasts,
    inAppToastsEnabled,
    setInAppToastsEnabled,
    problem,
    toggle,
    dismiss: (sequence: number) =>
      setToasts((items) => items.filter((e) => e.sequence !== sequence)),
    test: () =>
      emit({
        sequence: -Date.now(),
        projectId: "",
        reference: lang === "zh" ? "通知测试" : "Test Notification",
        number: 0,
        title:
          lang === "zh"
            ? "新任务、开始和完成时将在这里通知你。"
            : "You will receive notifications here for new tasks, starts, and completions.",
        kind: "created",
        createdAt: new Date().toISOString(),
      }),
  };
}
