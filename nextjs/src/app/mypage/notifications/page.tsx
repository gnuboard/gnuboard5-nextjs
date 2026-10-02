"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, BellOff, CheckCheck, Trash2 } from "lucide-react";
import { runtimeRouterPush } from "@/lib/runtime-router";
import type { ApiMeta } from "@/lib/api-response";
import { cn, formatDate } from "@/lib/utils";
import { notificationEventLabel, notificationHref, notificationTypeLabel } from "@/lib/notification-link";
import {
  deleteNotification,
  getNotificationEvents,
  getNotificationPage,
  type NotificationEventCount,
  markNotificationRead,
  markNotificationsRead,
  type NotificationItem,
} from "@/services/notifications";
import { Button } from "@/components/ui/button";
import { NotificationSettings } from "@/components/notifications/NotificationSettings";
import { toastError, toastSuccess } from "@/lib/toast";
import { MypagePanel } from "../MypagePanel";

type Filter = "all" | "unread";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "unread", label: "안 읽음" },
];

const PER_PAGE = 20;

export default function NotificationListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filter: Filter = searchParams.get("filter") === "unread" ? "unread" : "all";
  const eventParam = searchParams.get("event") ?? "";
  const event = /^[a-z0-9_.-]{1,40}$/.test(eventParam) ? eventParam : "";
  const page = Math.max(1, Number(searchParams.get("page") || "1"));

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [events, setEvents] = useState<NotificationEventCount[]>([]);
  const [meta, setMeta] = useState<ApiMeta | undefined>();
  const [loading, setLoading] = useState(true);

  const updateParams = useCallback(
    (nextFilter: Filter, nextPage = 1, nextEvent = event) => {
      const params = new URLSearchParams();
      if (nextFilter !== "all") params.set("filter", nextFilter);
      if (nextEvent) params.set("event", nextEvent);
      if (nextPage > 1) params.set("page", String(nextPage));
      const query = params.toString();
      runtimeRouterPush(router, `/mypage/notifications${query ? `?${query}` : ""}`);
    },
    [router, event]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getNotificationPage(page, PER_PAGE, filter === "unread", event);
      setItems(result.items);
      setMeta(result.meta);
    } catch (error) {
      setItems([]);
      setMeta(undefined);
      toastError(error instanceof Error ? error.message : "알림을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [page, filter, event]);

  useEffect(() => {
    load();
  }, [load]);

  // Chips come from what the inbox actually holds, so an empty category never shows up.
  const loadEvents = useCallback(async () => {
    try {
      setEvents(await getNotificationEvents());
    } catch {
      setEvents([]);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents, items]);

  const unreadOnPage = items.filter((item) => !item.is_read).length;

  const handleMarkAllRead = async () => {
    try {
      await markNotificationsRead();
      toastSuccess("모든 알림을 읽음으로 표시했습니다.");
      load();
    } catch (error) {
      toastError(error instanceof Error ? error.message : "읽음 처리에 실패했습니다.");
    }
  };

  // Opening a notification marks it read first; the list updates in place so
  // the row does not jump while the browser is already leaving the page.
  const handleOpen = async (item: NotificationItem, href: string | null) => {
    if (!item.is_read) {
      setItems((current) =>
        current.map((row) => (row.nt_id === item.nt_id ? { ...row, is_read: true } : row))
      );
      try {
        await markNotificationRead(item.nt_id);
      } catch {
        // The server keeps it unread; the next load shows the truth.
      }
    }
    if (href) {
      window.location.href = href;
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("이 알림을 삭제하시겠습니까?")) return;
    try {
      await deleteNotification(id);
      toastSuccess("알림을 삭제했습니다.");
      load();
    } catch (error) {
      toastError(error instanceof Error ? error.message : "알림 삭제에 실패했습니다.");
    }
  };

  const lastPage = meta?.last_page ?? 1;

  return (
    <MypagePanel
      title="알림"
      description="댓글·답글·쪽지·문의 답변 등 내게 온 알림입니다. 앱으로 받은 알림도 여기에 같이 쌓입니다."
      actions={
        <Button
          type="button"
          variant="outline"
          onClick={handleMarkAllRead}
          disabled={loading || unreadOnPage === 0}
        >
          <CheckCheck className="mr-2 h-4 w-4" />
          모두 읽음
        </Button>
      }
    >
      <NotificationSettings />

      <div className="flex gap-2 border-b">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => updateParams(option.value)}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              filter === option.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        ))}
        {meta && (
          <span className="ml-auto self-center text-xs text-muted-foreground">총 {meta.total}건</span>
        )}
      </div>

      {events.length > 0 && (
        <div className="notification-event-chips flex flex-wrap gap-2" role="group" aria-label="알림 종류">
          <button
            type="button"
            onClick={() => updateParams(filter, 1, "")}
            aria-pressed={event === ""}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              event === "" ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
            )}
          >
            모든 종류
          </button>
          {events.map((row) => (
            <button
              key={row.event}
              type="button"
              onClick={() => updateParams(filter, 1, row.event)}
              aria-pressed={event === row.event}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                event === row.event ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
              )}
            >
              {notificationEventLabel(row.event)}
              <span className={cn("ml-1", event === row.event ? "opacity-80" : "text-muted-foreground")}>
                {row.unread > 0 ? `${row.unread}/${row.total}` : row.total}
              </span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton h-20 rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border py-20 text-center">
          <BellOff className="mb-4 h-14 w-14 text-muted-foreground/50" />
          <p className="text-lg font-medium">알림이 없습니다</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {event
              ? "이 종류의 알림이 없습니다."
              : filter === "unread"
                ? "읽지 않은 알림이 없습니다."
                : "아직 받은 알림이 없습니다."}
          </p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {items.map((item) => {
            const href = notificationHref(item);
            const unread = !item.is_read;
            return (
              <div
                key={item.nt_id}
                className={cn(
                  "flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between",
                  unread && "bg-primary/5"
                )}
              >
                <button
                  type="button"
                  onClick={() => handleOpen(item, href)}
                  className="min-w-0 flex-1 text-left"
                  aria-label={`${item.nt_title || "알림"} 열기`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {unread && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                        새 알림
                      </span>
                    )}
                    <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                      {notificationTypeLabel(item)}
                    </span>
                    <span className={cn("text-sm font-medium", !unread && "text-foreground/80")}>
                      {item.nt_title || "알림"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(item.nt_sent_at)}
                    </span>
                  </div>
                  {item.nt_body && (
                    <p className="mt-1 break-words text-sm text-muted-foreground">
                      {item.nt_body}
                    </p>
                  )}
                  {href && (
                    <p className="mt-1 text-xs text-primary">바로 가기 →</p>
                  )}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(item.nt_id)}
                  aria-label="알림 삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {lastPage > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => updateParams(filter, page - 1)}
          >
            이전
          </Button>
          <span className="px-2 text-sm text-muted-foreground">
            {page} / {lastPage}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= lastPage}
            onClick={() => updateParams(filter, page + 1)}
          >
            다음
          </Button>
        </div>
      )}

      {!loading && items.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Bell className="h-3.5 w-3.5" aria-hidden />
          알림을 누르면 읽음으로 바뀌고, 연결된 글이 있으면 그리로 이동합니다.
        </p>
      )}
    </MypagePanel>
  );
}
