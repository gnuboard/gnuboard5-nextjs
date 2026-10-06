import { expect, test } from "@playwright/test";
import {
  MAINTENANCE_BEACON_KEY,
  claimMaintenanceBeacon,
  sendMaintenanceBeacon,
} from "../src/lib/maintenance-beacon";

/*
 * 화면이 다 뜬 뒤 보내는 백그라운드 신호(src/lib/maintenance-beacon.ts).
 * 크론 없는 공유 호스팅(PHP 가 Apache 모듈이라 응답을 먼저 끝낼 수 없다)에서 세션 청소 · 쇼핑몰 주기 작업을
 * 기다리는 손님이 없는 이 요청에서 돌린다. 브라우저 세션마다 한 번, 실패해도 화면에는 아무 일 없어야 한다.
 */

function memoryStore(blocked = false) {
  const map = new Map<string, string>();
  return {
    get: (key: string) => (blocked ? null : map.get(key) ?? null),
    set: (key: string, value: string) => {
      if (blocked) return false;
      map.set(key, value);
      return true;
    },
    map,
  };
}

test.describe("maintenance beacon", () => {
  test("claims once per browser session", () => {
    const store = memoryStore();
    expect(claimMaintenanceBeacon(store)).toBe(true);
    expect(store.map.get(MAINTENANCE_BEACON_KEY)).toBe("1");
    expect(claimMaintenanceBeacon(store)).toBe(false);
  });

  test("still sends when storage is blocked (the server keeps its own interval)", () => {
    const store = memoryStore(true);
    expect(claimMaintenanceBeacon(store)).toBe(true);
    expect(claimMaintenanceBeacon(store)).toBe(true);
  });

  test("uses sendBeacon when the browser accepts it", () => {
    const sent: string[] = [];
    const fetched: string[] = [];
    const ok = sendMaintenanceBeacon(
      "https://example.test/api/v1/maintenance/tick",
      { sendBeacon: (url: string) => (sent.push(url), true) },
      async (url: string) => fetched.push(url),
    );
    expect(ok).toBe(true);
    expect(sent).toEqual(["https://example.test/api/v1/maintenance/tick"]);
    expect(fetched).toEqual([]);
  });

  test("falls back to a keepalive POST when sendBeacon refuses or throws", () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = async (url: string, init: RequestInit) => calls.push({ url, init });
    expect(sendMaintenanceBeacon("/a", { sendBeacon: () => false }, fetcher)).toBe(true);
    expect(sendMaintenanceBeacon("/b", { sendBeacon: () => { throw new Error("blocked"); } }, fetcher)).toBe(true);
    expect(sendMaintenanceBeacon("/c", {}, fetcher)).toBe(true);
    expect(calls.map((call) => call.url)).toEqual(["/a", "/b", "/c"]);
    expect(calls.every((call) => call.init.method === "POST" && call.init.keepalive === true)).toBe(true);
  });

  test("does nothing and never throws without any transport", () => {
    expect(sendMaintenanceBeacon("/x", null, null)).toBe(false);
  });

  test("a failed keepalive POST stays quiet", async () => {
    let rejected = false;
    const fetcher = () => Promise.reject(new Error("offline")).finally(() => { rejected = true; });
    expect(sendMaintenanceBeacon("/y", {}, fetcher)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rejected).toBe(true);
  });
});
