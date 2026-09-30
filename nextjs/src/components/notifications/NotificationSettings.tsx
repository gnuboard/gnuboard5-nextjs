"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toastError } from "@/lib/toast";
import {
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFICATION_PREF_FLAGS,
  NOTIFICATION_PREF_LABELS,
  getNotificationPrefs,
  updateNotificationPrefs,
  type NotificationPrefFlag,
  type NotificationPrefs,
} from "@/services/notification-prefs";

/**
 * Per-event push switches. Each toggle sends only its own key (partial PATCH)
 * and rolls back if the server refuses. Turning one off silences the push; the
 * notification still shows up in the inbox below.
 */
export function NotificationSettings({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<NotificationPrefFlag | null>(null);

  const load = useCallback(async () => {
    try {
      setPrefs(await getNotificationPrefs());
    } catch {
      // Defaults (everything on) are a safe thing to show while the API is away.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (open && !loaded) load();
  }, [open, loaded, load]);

  const toggle = async (flag: NotificationPrefFlag) => {
    const next = !prefs[flag];
    const before = prefs;
    setPrefs({ ...prefs, [flag]: next });
    setPending(flag);
    try {
      setPrefs(await updateNotificationPrefs({ [flag]: next }));
    } catch (error) {
      setPrefs(before);
      toastError(error instanceof Error ? error.message : "설정을 저장하지 못했습니다.");
    } finally {
      setPending(null);
    }
  };

  const offCount = NOTIFICATION_PREF_FLAGS.filter((flag) => !prefs[flag]).length;

  return (
    <section className="rounded-lg border" aria-label="알림 수신 설정">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <BellRing className="h-4 w-4 text-primary" aria-hidden />
          알림 수신 설정
          {loaded && offCount > 0 && (
            <span className="rounded-full border px-2 py-0.5 text-xs font-normal text-muted-foreground">
              {offCount}개 꺼짐
            </span>
          )}
        </span>
        {open ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
      </button>

      {open && (
        <div className="border-t px-4 py-3">
          <p className="mb-3 text-xs text-muted-foreground">
            끄면 폰 푸시만 오지 않고, 알림은 이 목록에 그대로 쌓입니다. 앱과 같은 설정입니다.
          </p>
          <ul className="divide-y">
            {NOTIFICATION_PREF_FLAGS.map((flag) => {
              const on = prefs[flag];
              const busy = pending === flag;
              return (
                <li key={flag} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{NOTIFICATION_PREF_LABELS[flag].label}</p>
                    <p className="text-xs text-muted-foreground">{NOTIFICATION_PREF_LABELS[flag].hint}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${NOTIFICATION_PREF_LABELS[flag].label} 푸시 ${on ? "받음" : "안 받음"}`}
                    disabled={!loaded || busy}
                    onClick={() => toggle(flag)}
                    className={cn(
                      "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60",
                      on ? "bg-primary" : "bg-muted-foreground/30"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                        on ? "translate-x-[22px]" : "translate-x-0.5"
                      )}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
