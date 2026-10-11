import type { PlanEvent, PlanEventPage } from "@statedock/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { freshEvents } from "./notification-events";

const supported = () => typeof Notification !== "undefined" && window.isSecureContext;

export function useNotifications(
  open: (event: PlanEvent) => void,
  lang: "en" | "zh" = "en",
  userId = "local",
  /** Increments when synced data changed; triggers a check for new events without polling. */
  changeSignal = 0,
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
  const pollRef = useRef<(() => Promise<void>) | null>(null);

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
    const syncAccount = () => {
      void navigator.serviceWorker
        .getRegistration()
        .then((r) => r?.active?.postMessage({ type: "PUSH_ACCOUNT", userId }))
        .catch(() => {});
    };
    syncAccount();
    navigator.serviceWorker.addEventListener("controllerchange", syncAccount);
    navigator.serviceWorker.addEventListener("message", handleSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleSwMessage);
      navigator.serviceWorker.removeEventListener("controllerchange", syncAccount);
    };
  }, [userId]);

  const emit = useCallback(
    async (event: PlanEvent) => {
      if (inAppToastsRef.current) {
        setToasts((items) => [...items, event].slice(-5));
      }

      // OS notifications are delivered exclusively by the Service Worker's push handler.
      // A polled event must never display the same system alert a second time.
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

    pollRef.current = poll;
    void poll();
    const onStorage = (event: StorageEvent) => {
      if (event.key === enabledKey) setEnabled(event.newValue === "true");
      if (event.key === inAppToastsKey) setInAppToastsEnabledState(event.newValue !== "false");
    };
    const onFocus = () => void poll();

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      pollRef.current = null;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, emit, lang, scope, cursorKey, enabledKey, inAppToastsKey]);

  // New events always accompany a project revision change, so the shared sync poller
  // wakes this check; there is no separate timer.
  useEffect(() => {
    if (changeSignal > 0) void pollRef.current?.();
  }, [changeSignal]);

  async function toggle() {
    if (enabled) {
      localStorage.setItem(enabledKey, "false");
      setEnabled(false);
      setToasts([]);
      return;
    }

    try {
      const [page, value] = await Promise.all([
        api<PlanEventPage>("/plan-events"),
        Promise.resolve(supported() ? Notification.permission : ("unsupported" as const)),
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
