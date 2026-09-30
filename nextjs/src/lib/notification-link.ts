import { g5ShortHref } from "@/lib/g5-short-url";
import type { NotificationItem } from "@/lib/schemas";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringFromData(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

/** Only same-origin http(s) paths survive; anything else (javascript:, other hosts) is dropped. */
function safeNotificationHref(value: string): string | null {
  const raw = value.trim();
  if (!raw || /[\u0000-\u001F\u007F]/.test(raw)) return null;
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    return g5ShortHref(raw);
  }
  if (typeof window === "undefined") return null;

  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return g5ShortHref(`${url.pathname}${url.search}${url.hash}` || "/");
  } catch {
    return null;
  }
}

/**
 * Where a notification should take the reader. Server-side emitters put a
 * `link` in nt_data; older rows only carry bo_table + wr_id.
 */
export function notificationHref(notification: NotificationItem): string | null {
  if (!isRecord(notification.nt_data)) return null;

  const directHref = stringFromData(notification.nt_data, ["href", "url", "link"]);
  if (directHref) {
    return safeNotificationHref(directHref);
  }

  const boTable = stringFromData(notification.nt_data, ["bo_table", "boTable"]);
  const postId = stringFromData(notification.nt_data, ["post_id", "postId", "wr_id", "wrId"]);
  if (boTable && postId) {
    return g5ShortHref(`/boards/${boTable}/${postId}`);
  }

  return null;
}

const TYPE_LABELS: Record<string, string> = {
  "comment.created": "댓글",
  "reply.created": "답글",
  "memo.received": "쪽지",
  "qa.answered": "문의 답변",
  customer_qa_answer: "문의 답변", // the pre-Notify emitter's name for the same event
  "dday.reminder": "디데이",
  "vaccine.due": "접종",
  custom: "알림",
  dday: "디데이",
  system: "시스템",
};

/** The event name: the nt_event column, else the older nt_data.type, else the coarse nt_type. */
export function notificationEvent(
  notification: Pick<NotificationItem, "nt_type" | "nt_event" | "nt_data">
): string {
  if (notification.nt_event) return notification.nt_event;
  const fromData = isRecord(notification.nt_data) ? stringFromData(notification.nt_data, ["type", "event"]) : "";
  return fromData || notification.nt_type;
}

export function notificationTypeLabel(
  notification: Pick<NotificationItem, "nt_type" | "nt_event" | "nt_data">
): string {
  return TYPE_LABELS[notificationEvent(notification)] ?? TYPE_LABELS[notification.nt_type] ?? "알림";
}

/** Label for a filter chip: known events get their Korean name, unknown ones show as-is. */
export function notificationEventLabel(event: string): string {
  return TYPE_LABELS[event] ?? event;
}
