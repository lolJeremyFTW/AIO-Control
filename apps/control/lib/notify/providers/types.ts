import "server-only";

export type NotificationProvider = "telegram" | "slack" | "discord";

export type NotificationTarget = {
  id: string;
  workspace_id: string;
  provider: NotificationProvider;
  config: Record<string, unknown>;
  enabled: boolean;
};

export type SendResult =
  | { ok: true; status?: number; label?: string }
  | { ok: false; status?: number; error: string };

export function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function truncateMessage(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}
