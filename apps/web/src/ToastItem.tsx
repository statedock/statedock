import type { PlanEvent } from "@statedock/core";
import { Bell, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { notificationText } from "./notification-events";

interface ToastItemProps {
  event: PlanEvent;
  lang: "en" | "zh";
  onDismiss: (sequence: number) => void;
  onSelect: (event: PlanEvent) => void;
}

export function ToastItem({ event, lang, onDismiss, onSelect }: ToastItemProps) {
  const [hovered, setHovered] = useState(false);
  const [remaining, setRemaining] = useState(5000);
  const lastTickRef = useRef<number>(Date.now());
  const text = notificationText(event, lang);

  useEffect(() => {
    lastTickRef.current = Date.now();
    const interval = setInterval(() => {
      if (!hovered) {
        const now = Date.now();
        const delta = now - lastTickRef.current;
        lastTickRef.current = now;
        setRemaining((prev) => {
          const next = prev - delta;
          if (next <= 0) {
            clearInterval(interval);
            onDismiss(event.sequence);
            return 0;
          }
          return next;
        });
      } else {
        lastTickRef.current = Date.now();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [event.sequence, hovered, onDismiss]);

  const progressPercent = Math.max(0, Math.min(100, (remaining / 5000) * 100));

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="pointer-events-auto relative overflow-hidden rounded-xl border border-blue-500/30 bg-card/95 p-4 shadow-xl ring-1 ring-black/10 backdrop-blur-md transition-all duration-200 hover:shadow-2xl hover:border-blue-500/50"
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <Bell className="h-4 w-4 shrink-0 text-blue-500 mt-0.5 animate-pulse" />
        <div
          className="flex-1 cursor-pointer space-y-1 text-xs"
          onClick={() => {
            onSelect(event);
            onDismiss(event.sequence);
          }}
        >
          <strong className="block font-semibold text-foreground tracking-tight">
            {text.title}
          </strong>
          <p className="text-muted-foreground line-clamp-2 leading-relaxed">{text.body}</p>
        </div>
        <button
          type="button"
          aria-label={lang === "zh" ? "关闭提示" : "Dismiss"}
          onClick={() => onDismiss(event.sequence)}
          className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 5s Auto-dismiss countdown bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted/40 overflow-hidden">
        <div
          className="h-full bg-blue-500/70 transition-[width] ease-linear duration-100"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}
