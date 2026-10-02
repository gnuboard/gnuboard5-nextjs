"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toastError } from "@/lib/toast";
import {
  LEGACY_NOTIFICATION_PREF_OPTIONS,
  getNotificationPrefs,
  updateNotificationPrefs,
  type NotificationPrefsState,
} from "@/services/notification-prefs";

/** Until the server answers no switch is drawn (placeholders instead) — a site
 *  without a product must not flash that product's switch. If the request fails,
 *  the old switches are shown, all on. */
const EMPTY_STATE: NotificationPrefsState = { options: [], values: {} };
const FALLBACK_STATE: NotificationPrefsState = {
  options: LEGACY_NOTIFICATION_PREF_OPTIONS,
  values: Object.fromEntries(LEGACY_NOTIFICATION_PREF_OPTIONS.map((option) => [option.key, true])),
};
const PLACEHOLDER_ROWS = 5;

/**
 * Per-item push switches. The list comes from the server (core items plus what
 * product plugins add), so a site without the D-day product shows no D-day switch.
 * Each toggle sends only its own key (partial PATCH) and rolls back if the server
 * refuses. Turning one off silences the push; the notification still shows up in
 * the inbox below.
 */
export function NotificationSettings({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [prefs, setPrefs] = useState<NotificationPrefsState>(EMPTY_STATE);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPrefs(await getNotificationPrefs());
    } catch {
      // Defaults (everything on) are a safe thing to show while the API is away.
      setPrefs(FALLBACK_STATE);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (open && !loaded) load();
  }, [open, loaded, load]);

  const toggle = async (key: string) => {
    const next = !prefs.values[key];
    const before = prefs;
    setPrefs({ ...prefs, values: { ...prefs.values, [key]: next } });
    setPending(key);
    try {
      setPrefs(await updateNotificationPrefs({ [key]: next }));
    } catch (error) {
      setPrefs(before);
      toastError(error instanceof Error ? error.message : "설정을 저장하지 못했습니다.");
    } finally {
      setPending(null);
    }
  };

  const offCount = prefs.options.filter((option) => !prefs.values[option.key]).length;

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
          {!loaded && (
            <div className="space-y-3 py-1" aria-hidden>
              {Array.from({ length: PLACEHOLDER_ROWS }).map((_, index) => (
                <div key={index} className="skeleton h-10 rounded-md" />
              ))}
            </div>
          )}
          <ul className="divide-y">
            {prefs.options.map((option) => {
              const on = prefs.values[option.key] !== false;
              const busy = pending === option.key;
              return (
                <li key={option.key} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{option.label}</p>
                    {option.hint ? <p className="text-xs text-muted-foreground">{option.hint}</p> : null}
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${option.label} 푸시 ${on ? "받음" : "안 받음"}`}
                    disabled={!loaded || busy}
                    onClick={() => toggle(option.key)}
                    className={cn(
                      "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60",
                      on ? "bg-primary" : "bg-muted-foreground/30"
                    )}
                  >
                    <span
                      className={cn(
                        // left-0 이 없으면 손잡이가 버튼의 가운데 정렬 자리에서 시작해 트랙 밖으로 밀려 나간다.
                        "absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
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
