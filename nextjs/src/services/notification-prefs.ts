import * as z from "zod";
import { apiClient } from "@/lib/api";

/**
 * /v1/auth/preferences — the member's locale/timezone plus one on/off switch per
 * notification item. Shared with the mobile app: PATCH is partial (send only the
 * keys you change) and always answers with the full object. A switch that is off
 * stops the push only; the notification still lands in the inbox.
 *
 * Which switches exist is the server's call: `notify_options` lists the five core
 * items plus whatever product plugins add through the Gnuboard replace hook
 * (plugin/dday adds the D-day switch, for instance). A server that predates the
 * list gets the switches it always had.
 */
export interface NotificationPrefOption {
  key: string;
  label: string;
  hint: string;
}

export interface NotificationPrefsState {
  /** Switch key → on/off, for every listed option. */
  values: Record<string, boolean>;
  options: NotificationPrefOption[];
}

/** The switches an older server (no `notify_options`) always had. */
export const LEGACY_NOTIFICATION_PREF_OPTIONS: NotificationPrefOption[] = [
  { key: "notify_comment", label: "내 글의 댓글", hint: "누군가 내 글에 댓글을 달았을 때" },
  { key: "notify_reply", label: "내 글의 답글", hint: "내 글에 답글이 달렸을 때" },
  { key: "notify_message", label: "쪽지", hint: "쪽지를 받았을 때" },
  { key: "notify_inquiry", label: "1:1 문의 답변", hint: "문의에 답변이 등록되었을 때" },
  { key: "notify_dday", label: "디데이·접종 알림", hint: "서버가 보내는 D-day 푸시 (앱의 로컬 알림과는 별개)" },
  { key: "notify_system", label: "공지", hint: "운영자 공지와 점검 안내" },
];

const optionListSchema = z
  .array(
    z.object({
      key: z.string().regex(/^notify_[a-z0-9_]+$/),
      label: z.string(),
      hint: z.string().default(""),
    })
  )
  .min(1);

/** Missing means on — the server treats a member without a row the same way. */
function switchValue(value: unknown): boolean {
  return !(value === false || value === 0 || value === "0" || value === "false");
}

export function parseNotificationPrefs(data: unknown): NotificationPrefsState {
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const listed = optionListSchema.safeParse(record.notify_options);
  const options = listed.success ? listed.data : LEGACY_NOTIFICATION_PREF_OPTIONS;
  const values: Record<string, boolean> = {};
  for (const option of options) {
    values[option.key] = switchValue(record[option.key]);
  }
  return { values, options };
}

export async function getNotificationPrefs(): Promise<NotificationPrefsState> {
  const response = await apiClient.get<unknown>("/auth/preferences");
  return parseNotificationPrefs(response.data);
}

/** Partial update — only the keys given are changed; the server returns everything. */
export async function updateNotificationPrefs(
  patch: Record<string, boolean>
): Promise<NotificationPrefsState> {
  const response = await apiClient.patch<unknown>("/auth/preferences", patch);
  return parseNotificationPrefs(response.data);
}
