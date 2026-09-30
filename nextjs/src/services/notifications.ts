import { apiClient } from "@/lib/api";
import { validateApiData, type ApiMeta } from "@/lib/api-response";
import {
  notificationListSchema,
  notificationReadSchema,
  type NotificationItem,
} from "@/lib/schemas";

export interface NotificationSummary {
  count: number;
  items: NotificationItem[];
}

export interface NotificationPage {
  items: NotificationItem[];
  meta?: ApiMeta;
}

/** Unread-only slice for the header bell. */
export async function getNotifications(): Promise<NotificationSummary> {
  const params = {
    unread_only: 1,
    per_page: 30,
  };

  const response = await apiClient.get<unknown>("/notifications", { params });
  const items = validateApiData(response.data, notificationListSchema, []);

  return {
    count: response.meta?.total ?? items.length,
    items,
  };
}

/** Full, paginated list for the notifications page. */
export async function getNotificationPage(
  page = 1,
  perPage = 20,
  unreadOnly = false,
  event = ""
): Promise<NotificationPage> {
  const params: Record<string, number | string> = { page, per_page: perPage };
  if (unreadOnly) params.unread_only = 1;
  if (event) params.event = event;

  const response = await apiClient.get<unknown>("/notifications", { params });
  return {
    items: validateApiData(response.data, notificationListSchema, []),
    meta: response.meta,
  };
}

export interface NotificationEventCount {
  event: string;
  total: number;
  unread: number;
}

/** Events present in this member's inbox, newest first — drives the filter chips. */
export async function getNotificationEvents(): Promise<NotificationEventCount[]> {
  const response = await apiClient.get<unknown>("/notifications/events");
  const raw = Array.isArray(response.data) ? response.data : [];
  return raw
    .map((row) => {
      const r = (row ?? {}) as Record<string, unknown>;
      return {
        event: typeof r.event === "string" ? r.event : "",
        total: Number(r.total) || 0,
        unread: Number(r.unread) || 0,
      };
    })
    .filter((row) => row.event !== "");
}

export async function getUnreadNotificationCount(): Promise<number> {
  const response = await apiClient.get<{ unread_count?: unknown }>("/notifications/unread-count");
  const raw = response.data?.unread_count;
  const count = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

export async function markNotificationsRead(): Promise<string | null> {
  const response = await apiClient.post<unknown>("/notifications/read-all");
  const data = validateApiData(response.data, notificationReadSchema, {});

  return data.read_at ?? new Date().toISOString();
}

export async function markNotificationRead(id: number): Promise<void> {
  await apiClient.patch(`/notifications/${id}/read`);
}

export async function deleteNotification(id: number): Promise<void> {
  await apiClient.delete(`/notifications/${id}`);
}

export type { NotificationItem };
