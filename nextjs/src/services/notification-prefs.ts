import * as z from "zod";
import { apiClient } from "@/lib/api";
import { validateApiData } from "@/lib/api-response";

/**
 * /v1/auth/preferences — the member's locale/timezone plus one on/off switch per
 * notification event. Shared with the mobile app: PATCH is partial (send only the
 * keys you change) and always answers with the full object. A switch that is off
 * stops the push only; the notification still lands in the inbox.
 */
export const NOTIFICATION_PREF_FLAGS = [
  "notify_comment",
  "notify_reply",
  "notify_message",
  "notify_inquiry",
  "notify_dday",
  "notify_system",
] as const;

export type NotificationPrefFlag = (typeof NOTIFICATION_PREF_FLAGS)[number];

const booleanDefaultTrue = z.preprocess((value) => {
  if (value === undefined || value === null) return true;
  if (value === "1" || value === 1 || value === "true") return true;
  if (value === "0" || value === 0 || value === "false") return false;
  return value;
}, z.boolean());

export const notificationPrefsSchema = z
  .object({
    locale: z.string().default("ko"),
    tz: z.string().default("Asia/Seoul"),
    notify_comment: booleanDefaultTrue,
    notify_reply: booleanDefaultTrue,
    notify_message: booleanDefaultTrue,
    notify_inquiry: booleanDefaultTrue,
    notify_dday: booleanDefaultTrue,
    notify_system: booleanDefaultTrue,
  })
  .passthrough();

export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  locale: "ko",
  tz: "Asia/Seoul",
  notify_comment: true,
  notify_reply: true,
  notify_message: true,
  notify_inquiry: true,
  notify_dday: true,
  notify_system: true,
};

export const NOTIFICATION_PREF_LABELS: Record<NotificationPrefFlag, { label: string; hint: string }> = {
  notify_comment: { label: "내 글의 댓글", hint: "누군가 내 글에 댓글을 달았을 때" },
  notify_reply: { label: "내 글의 답글", hint: "내 글에 답글이 달렸을 때" },
  notify_message: { label: "쪽지", hint: "쪽지를 받았을 때" },
  notify_inquiry: { label: "1:1 문의 답변", hint: "문의에 답변이 등록되었을 때" },
  notify_dday: { label: "디데이·접종 알림", hint: "서버가 보내는 D-day 푸시 (앱의 로컬 알림과는 별개)" },
  notify_system: { label: "공지", hint: "운영자 공지와 점검 안내" },
};

export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  const response = await apiClient.get<unknown>("/auth/preferences");
  return validateApiData(response.data, notificationPrefsSchema, DEFAULT_NOTIFICATION_PREFS);
}

/** Partial update — only the keys given are changed; the server returns everything. */
export async function updateNotificationPrefs(
  patch: Partial<NotificationPrefs>
): Promise<NotificationPrefs> {
  const response = await apiClient.patch<unknown>("/auth/preferences", patch);
  return validateApiData(response.data, notificationPrefsSchema, DEFAULT_NOTIFICATION_PREFS);
}
