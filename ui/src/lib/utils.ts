import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const STATUS_COLORS: Record<string, string> = {
  "To Do": "bg-slate-100 text-slate-700",
  "In Progress": "bg-blue-100 text-blue-700",
  "In Review": "bg-amber-100 text-amber-700",
  "Done": "bg-emerald-100 text-emerald-700",
};

export const PRIORITY_CONFIG: Record<string, { color: string; label: string }> = {
  Highest: { color: "text-red-600", label: "Highest" },
  High: { color: "text-orange-500", label: "High" },
  Medium: { color: "text-yellow-500", label: "Medium" },
  Low: { color: "text-blue-500", label: "Low" },
  Lowest: { color: "text-slate-400", label: "Lowest" },
};

export const ISSUE_TYPE_ICONS: Record<string, string> = {
  Epic: "⚡",
  Feature: "🚀",
  Story: "📖",
  Task: "✅",
  Bug: "🐛",
  "Sub-task": "📎",
};

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
