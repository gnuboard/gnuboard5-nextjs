"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { G5Link as Link } from "@/components/ui/g5-link";
import { useAuthStore } from "@/store/auth";
import { getUnreadNotificationCount } from "@/services/notifications";

const POLL_INTERVAL = 60_000;

/**
 * "알림" entry for the top strip. It is a plain link to the notifications page
 * (no dropdown — the reference site's strip is a row of links), with the unread
 * count as a badge so the reader knows whether it is worth the click.
 */
export function SoluneNotifyLink() {
  const { user } = useAuthStore();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await getUnreadNotificationCount();
        if (!cancelled) setCount(next);
      } catch {
        // The strip stays usable even when the count is temporarily unavailable.
      }
    };
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [user]);

  if (!user) return null;

  const label = count > 0 ? `알림 ${count > 99 ? "99+" : count}건 안 읽음` : "알림";

  return (
    <Link
      href="/mypage/notifications"
      className={`solune-community-member-notify${count > 0 ? " solune-community-member-notify-unread" : ""}`}
      aria-label={label}
      title={label}
    >
      <Bell className="solune-community-member-notify-icon" size={14} aria-hidden />
      <span>알림</span>
      {count > 0 && (
        <span className="solune-community-member-notify-badge" aria-hidden>
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
