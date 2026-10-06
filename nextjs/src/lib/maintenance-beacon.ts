/**
 * 화면이 다 뜬 뒤 보내는 백그라운드 신호(POST /api/v1/maintenance/tick).
 *
 * 크론 없는 공유 호스팅(카페24 — PHP 가 Apache 모듈이라 응답을 먼저 끝낼 수 없다)에서는 세션 파일 청소 · 쇼핑몰
 * 주기 작업을 손님 요청 끝에 얹으면 그 손님이 기다린다. 이 신호는 아무도 결과를 기다리지 않으므로 서버가 거기서
 * 돌린다. 브라우저 세션마다 한 번 보내고, 서버도 작업마다 정해진 간격보다 자주 돌지 않는다.
 */

import { storageGet, storageSet } from "@/lib/safe-storage";

export const MAINTENANCE_BEACON_KEY = "g5:maintenance-beacon";

interface BeaconStore {
  get(key: string): string | null;
  set(key: string, value: string): boolean;
}

interface BeaconNavigator {
  sendBeacon?: (url: string) => boolean;
}

type BeaconFetch = (url: string, init: RequestInit) => Promise<unknown>;

const sessionStore: BeaconStore = {
  get: (key) => storageGet(key, "session"),
  set: (key, value) => storageSet(key, value, "session"),
};

/** 이 브라우저 세션에서 처음이면 표시하고 true. 저장소가 막혀 있으면 표시는 못 해도 보낸다(서버가 간격을 지킨다). */
export function claimMaintenanceBeacon(store: BeaconStore = sessionStore): boolean {
  if (store.get(MAINTENANCE_BEACON_KEY)) return false;
  store.set(MAINTENANCE_BEACON_KEY, "1");
  return true;
}

/**
 * 기다리지 않는 POST — sendBeacon, 없거나 거절되면 keepalive fetch. 실패는 조용히 넘긴다(덤 작업).
 * nav · fetcher 를 생략하면 브라우저 것을 쓴다. null 은 "없음".
 */
export function sendMaintenanceBeacon(
  url: string,
  nav: BeaconNavigator | null = typeof navigator !== "undefined" ? navigator : null,
  fetcher: BeaconFetch | null = typeof fetch !== "undefined" ? fetch : null,
): boolean {
  try {
    if (nav?.sendBeacon && nav.sendBeacon(url)) return true;
  } catch {
    // 아래 keepalive fetch 로 보낸다
  }
  if (!fetcher) return false;
  void fetcher(url, { method: "POST", keepalive: true, credentials: "include" }).catch(() => undefined);
  return true;
}
