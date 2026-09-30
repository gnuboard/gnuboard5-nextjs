import { expect, test } from "@playwright/test";
import { createRequestShare } from "@/lib/request-share";
import { routeDataPrefetchTarget } from "@/lib/route-data-prefetch-target";

// 같은 GET 을 잠깐 나눠 쓰는 캐시와, 링크 주소에서 무엇을 미리 부를지 정하는 규칙.

function fakeClock(start = 1_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => { now += ms; } };
}

test("shares one in-flight request per key", async () => {
  const share = createRequestShare({ enabled: () => true });
  let calls = 0;
  const load = async () => { calls += 1; return "ok"; };

  const [a, b] = await Promise.all([share.get("k", 1000, load), share.get("k", 1000, load)]);

  expect([a, b]).toEqual(["ok", "ok"]);
  expect(calls).toBe(1);
});

test("loads again after the time to live", async () => {
  const clock = fakeClock();
  const share = createRequestShare({ enabled: () => true, now: clock.now });
  let calls = 0;
  const load = async () => { calls += 1; return calls; };

  expect(await share.get("k", 1000, load)).toBe(1);
  clock.advance(999);
  expect(await share.get("k", 1000, load)).toBe(1);
  clock.advance(2);
  expect(await share.get("k", 1000, load)).toBe(2);
});

test("does not keep a rejected request", async () => {
  const share = createRequestShare({ enabled: () => true });
  let calls = 0;
  const load = async () => { calls += 1; if (calls === 1) throw new Error("down"); return "ok"; };

  await expect(share.get("k", 1000, load)).rejects.toThrow("down");
  expect(await share.get("k", 1000, load)).toBe("ok");
  expect(calls).toBe(2);
});

test("does not keep a result the caller marks as a failure", async () => {
  const share = createRequestShare({ enabled: () => true });
  let calls = 0;
  const load = async () => { calls += 1; return { ok: calls > 1 }; };
  const isFailure = (value: { ok: boolean }) => !value.ok;

  expect(await share.get("k", 1000, load, isFailure)).toEqual({ ok: false });
  expect(await share.get("k", 1000, load, isFailure)).toEqual({ ok: true });
  expect(calls).toBe(2);
});

test("clear() drops everything", async () => {
  const share = createRequestShare({ enabled: () => true });
  let calls = 0;
  const load = async () => { calls += 1; return calls; };

  await share.get("k", 60_000, load);
  share.clear();
  expect(await share.get("k", 60_000, load)).toBe(2);
});

test("keeps at most maxEntries, dropping expired then oldest entries", async () => {
  const clock = fakeClock();
  const share = createRequestShare({ enabled: () => true, now: clock.now, maxEntries: 3 });
  const calls: Record<string, number> = {};
  const loader = (key: string) => async () => { calls[key] = (calls[key] ?? 0) + 1; return key; };

  await share.get("a", 100, loader("a"));
  await share.get("b", 60_000, loader("b"));
  await share.get("c", 60_000, loader("c"));
  clock.advance(200); // "a" 는 만료
  await share.get("d", 60_000, loader("d")); // 만료된 "a" 가 먼저 빠진다
  expect(share.size()).toBe(3);

  await share.get("e", 60_000, loader("e")); // 만료된 것이 없으면 가장 오래된 "b" 가 빠진다
  expect(share.size()).toBe(3);
  await share.get("b", 60_000, loader("b"));
  await share.get("d", 60_000, loader("d"));
  expect(calls.b).toBe(2);
  expect(calls.d).toBe(1);
});

test("never shares when disabled (server, build)", async () => {
  const share = createRequestShare({ enabled: () => false });
  let calls = 0;
  const load = async () => { calls += 1; return calls; };

  await share.get("k", 60_000, load);
  await share.get("k", 60_000, load);
  expect(calls).toBe(2);
});

test("product links prefetch the product", () => {
  expect(routeDataPrefetchTarget("/shop/1446772772")).toEqual({ kind: "product", itId: "1446772772" });
  expect(routeDataPrefetchTarget("/shop/products/clarityshop01")).toEqual({ kind: "product", itId: "clarityshop01" });
});

test("category links prefetch the first page with the link's sort", () => {
  expect(routeDataPrefetchTarget("/shop/list-d0")).toEqual({
    kind: "category",
    caId: "d0",
    params: { page: "1", per_page: "20" },
  });
  expect(routeDataPrefetchTarget("/shop/list-d0?sort=latest&page=2")).toEqual({
    kind: "category",
    caId: "d0",
    params: { page: "2", per_page: "20", sort: "latest" },
  });
});

test("post links prefetch only the board — never the post, which counts a view and charges read points", () => {
  expect(routeDataPrefetchTarget("/free/4161")).toEqual({ kind: "board", boTable: "free" });
  expect(routeDataPrefetchTarget("/free")).toEqual({ kind: "board", boTable: "free" });
});

test("other links prefetch nothing", () => {
  for (const path of ["/", "/shop", "/shop/type-1", "/content/company", "/free/write", "/members/1", "/login"]) {
    expect(routeDataPrefetchTarget(path)).toBeNull();
  }
});
