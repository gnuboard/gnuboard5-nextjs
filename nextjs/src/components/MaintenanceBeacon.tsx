"use client";

import { useEffect } from "react";
import { apiUrl } from "@/lib/config";
import { claimMaintenanceBeacon, sendMaintenanceBeacon } from "@/lib/maintenance-beacon";

/** 브라우저가 한가해질 때까지 기다리는 최대 시간 — 한가한 때가 없어도 이만큼 뒤에는 보낸다. */
const BEACON_IDLE_TIMEOUT_MS = 8000;
/** requestIdleCallback 이 없는 브라우저(사파리 등)는 화면이 뜬 뒤 이만큼 기다렸다 보낸다. */
const BEACON_FALLBACK_DELAY_MS = 4000;

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * 화면이 다 뜬 뒤 백그라운드 신호를 한 번 보낸다(lib/maintenance-beacon.ts). 보낼 때 표시하므로, 개발 모드처럼
 * effect 가 한 번 취소됐다 다시 돌아도 신호를 잃지 않는다.
 */
export function MaintenanceBeacon() {
  useEffect(() => {
    const run = () => {
      if (claimMaintenanceBeacon()) sendMaintenanceBeacon(apiUrl("/maintenance/tick"));
    };
    const idleWindow = window as IdleWindow;
    if (typeof idleWindow.requestIdleCallback === "function") {
      const handle = idleWindow.requestIdleCallback(run, { timeout: BEACON_IDLE_TIMEOUT_MS });
      return () => idleWindow.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(run, BEACON_FALLBACK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
