import type { PlanStatus } from "@statedock/core";

const appearances: Record<
  PlanStatus,
  { button: string; selected: string; card: string; text: string }
> = {
  WORKING: {
    button:
      "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 [.dark_&]:border-blue-700/60 [.dark_&]:bg-blue-950/40 [.dark_&]:text-blue-200 [.dark_&]:hover:bg-blue-900/50",
    selected:
      "ring-blue-500/50 [.dark_&]:ring-blue-300/50 border-blue-700 bg-blue-700 text-white hover:bg-blue-800 [.dark_&]:border-blue-400 [.dark_&]:bg-blue-400 [.dark_&]:text-blue-950 [.dark_&]:hover:bg-blue-300",
    card: "bg-blue-50/60 [.dark_&]:bg-blue-950/25",
    text: "text-blue-800 [.dark_&]:text-blue-200",
  },
  READY: {
    button:
      "border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100 [.dark_&]:border-cyan-700/60 [.dark_&]:bg-cyan-950/40 [.dark_&]:text-cyan-200 [.dark_&]:hover:bg-cyan-900/50",
    selected:
      "ring-cyan-500/50 [.dark_&]:ring-cyan-300/50 border-cyan-700 bg-cyan-700 text-white hover:bg-cyan-800 [.dark_&]:border-cyan-400 [.dark_&]:bg-cyan-400 [.dark_&]:text-cyan-950 [.dark_&]:hover:bg-cyan-300",
    card: "bg-cyan-50/60 [.dark_&]:bg-cyan-950/25",
    text: "text-cyan-800 [.dark_&]:text-cyan-200",
  },
  PLAN: {
    button:
      "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 [.dark_&]:border-amber-700/60 [.dark_&]:bg-amber-950/40 [.dark_&]:text-amber-200 [.dark_&]:hover:bg-amber-900/50",
    selected:
      "ring-amber-500/50 [.dark_&]:ring-amber-300/50 border-amber-700 bg-amber-700 text-white hover:bg-amber-800 [.dark_&]:border-amber-400 [.dark_&]:bg-amber-400 [.dark_&]:text-amber-950 [.dark_&]:hover:bg-amber-300",
    card: "bg-amber-50/60 [.dark_&]:bg-amber-950/25",
    text: "text-amber-800 [.dark_&]:text-amber-200",
  },
  WAITING: {
    button:
      "border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100 [.dark_&]:border-purple-700/60 [.dark_&]:bg-purple-950/40 [.dark_&]:text-purple-200 [.dark_&]:hover:bg-purple-900/50",
    selected:
      "ring-purple-500/50 [.dark_&]:ring-purple-300/50 border-purple-700 bg-purple-700 text-white hover:bg-purple-800 [.dark_&]:border-purple-400 [.dark_&]:bg-purple-400 [.dark_&]:text-purple-950 [.dark_&]:hover:bg-purple-300",
    card: "bg-purple-50/60 [.dark_&]:bg-purple-950/25",
    text: "text-purple-800 [.dark_&]:text-purple-200",
  },
  DONE: {
    button:
      "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 [.dark_&]:border-emerald-700/60 [.dark_&]:bg-emerald-950/40 [.dark_&]:text-emerald-200 [.dark_&]:hover:bg-emerald-900/50",
    selected:
      "ring-emerald-500/50 [.dark_&]:ring-emerald-300/50 border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800 [.dark_&]:border-emerald-400 [.dark_&]:bg-emerald-400 [.dark_&]:text-emerald-950 [.dark_&]:hover:bg-emerald-300",
    card: "bg-emerald-50/60 [.dark_&]:bg-emerald-950/25",
    text: "text-emerald-800 [.dark_&]:text-emerald-200",
  },
  DROPPED: {
    button:
      "border-zinc-200 bg-zinc-50 text-zinc-800 hover:bg-zinc-100 [.dark_&]:border-zinc-700/60 [.dark_&]:bg-zinc-950/40 [.dark_&]:text-zinc-200 [.dark_&]:hover:bg-zinc-900/50",
    selected:
      "ring-zinc-500/50 [.dark_&]:ring-zinc-300/50 border-zinc-700 bg-zinc-700 text-white hover:bg-zinc-800 [.dark_&]:border-zinc-400 [.dark_&]:bg-zinc-400 [.dark_&]:text-zinc-950 [.dark_&]:hover:bg-zinc-300",
    card: "bg-zinc-50/60 [.dark_&]:bg-zinc-950/25",
    text: "text-zinc-800 [.dark_&]:text-zinc-200",
  },
};

export const statusAppearance = (status: PlanStatus) => appearances[status];
