import { expect, test } from "@playwright/test";
import { createJSONStorage, persist } from "zustand/middleware";
import { create } from "zustand";
import { safeLocalStateStorage, storageGet, storageRemove, storageSet } from "../src/lib/safe-storage";

/*
 * 브라우저 저장소가 막혀도 화면이 멈추지 않는다는 약속(src/lib/safe-storage.ts).
 * 사생활 보호 설정 · 쿠키 차단에서는 window.localStorage 를 읽기만 해도 SecurityError 가 나고, 저장 공간이 차면
 * setItem 만 던진다. 2026-10-01 Codex 검증에서 ApiClient 생성자 · zustand persist 가 이 예외로 화면을 멈췄다.
 */

type FakeWindow = { localStorage?: unknown; sessionStorage?: unknown };
const globalAny = globalThis as unknown as { window?: FakeWindow };

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    key: (index) => Array.from(map.keys())[index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, String(value)),
  };
}

function throwing(): never {
  throw new DOMException("The operation is insecure.", "SecurityError");
}

function withWindow(win: FakeWindow, run: () => void) {
  const previous = globalAny.window;
  globalAny.window = win;
  try {
    run();
  } finally {
    globalAny.window = previous;
  }
}

test.describe("safe storage", () => {
  test("returns null and false outside a browser", () => {
    withWindow(undefined as unknown as FakeWindow, () => {
      expect(storageGet("k")).toBeNull();
      expect(storageSet("k", "v")).toBe(false);
      expect(() => storageRemove("k")).not.toThrow();
    });
  });

  test("works normally with a working storage", () => {
    const local = memoryStorage();
    const session = memoryStorage();
    withWindow({ localStorage: local, sessionStorage: session }, () => {
      expect(storageSet("k", "v")).toBe(true);
      expect(storageGet("k")).toBe("v");
      expect(storageSet("s", "1", "session")).toBe(true);
      expect(session.getItem("s")).toBe("1");
      expect(local.getItem("s")).toBeNull();
      storageRemove("k");
      expect(storageGet("k")).toBeNull();
    });
  });

  test("swallows SecurityError from the storage getter itself", () => {
    const win = {};
    Object.defineProperty(win, "localStorage", { get: throwing });
    Object.defineProperty(win, "sessionStorage", { get: throwing });
    withWindow(win, () => {
      expect(storageGet("k")).toBeNull();
      expect(storageGet("k", "session")).toBeNull();
      expect(storageSet("k", "v")).toBe(false);
      expect(() => storageRemove("k", "session")).not.toThrow();
    });
  });

  test("swallows errors from storage methods (blocked or quota exceeded)", () => {
    const broken = { getItem: throwing, setItem: throwing, removeItem: throwing };
    withWindow({ localStorage: broken, sessionStorage: broken }, () => {
      expect(storageGet("k")).toBeNull();
      expect(storageSet("k", "v")).toBe(false);
      expect(() => storageRemove("k")).not.toThrow();
    });
  });

  test("zustand persist with the safe adapter keeps working when setItem throws", () => {
    const broken = { getItem: () => null, setItem: throwing, removeItem: throwing };
    withWindow({ localStorage: broken }, () => {
      const store = create<{ items: string[]; add: (item: string) => void }>()(
        persist((set) => ({ items: [], add: (item) => set((state) => ({ items: [...state.items, item] })) }), {
          name: "safe-storage-spec",
          storage: createJSONStorage(() => safeLocalStateStorage),
        })
      );
      expect(() => store.getState().add("A")).not.toThrow();
      expect(store.getState().items).toEqual(["A"]);
    });
  });

  test("zustand persist with the safe adapter stores the usual JSON shape", () => {
    const local = memoryStorage();
    withWindow({ localStorage: local }, () => {
      const store = create<{ locale: string; setLocale: (locale: string) => void }>()(
        persist((set) => ({ locale: "ko", setLocale: (locale) => set({ locale }) }), {
          name: "safe-storage-shape",
          storage: createJSONStorage(() => safeLocalStateStorage),
        })
      );
      store.getState().setLocale("en");
      expect(JSON.parse(local.getItem("safe-storage-shape") as string)).toEqual({ state: { locale: "en" }, version: 0 });
    });
  });
});
