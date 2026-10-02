/**
 * 브라우저 저장소(localStorage · sessionStorage)를 예외 없이 쓴다.
 *
 * 저장소는 막혀 있을 수 있다 — 사생활 보호 설정 · 쿠키 차단 · 일부 내장 브라우저에서는 window.localStorage 를
 * 읽기만 해도 SecurityError 가 난다. 직접 쓰면 그 예외가 화면 전체를 "페이지를 표시하지 못했습니다"로 바꾼다
 * (ApiClient 생성자에서 실제로 일어났다). 저장은 덤 기능이므로, 막혀 있으면 없는 것처럼 굴고 화면은 그대로 둔다.
 */

import type { StateStorage } from "zustand/middleware";

type StorageKind = "local" | "session";

function storageOf(kind: StorageKind): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

/** 값. 없거나 저장소가 막혀 있으면 null. */
export function storageGet(key: string, kind: StorageKind = "local"): string | null {
  try {
    return storageOf(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** 저장했으면 true. 저장소가 막혔거나 가득 차면 false. */
export function storageSet(key: string, value: string, kind: StorageKind = "local"): boolean {
  try {
    const storage = storageOf(kind);
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function storageRemove(key: string, kind: StorageKind = "local"): void {
  try {
    storageOf(kind)?.removeItem(key);
  } catch {
    /* 막혀 있으면 지울 것도 없다. */
  }
}

/**
 * zustand persist 에 넘기는 localStorage. zustand 는 저장소를 얻을 때만 try 로 감싸고 setItem 실패(막힘 · 가득 참)는
 * 그대로 던져, 상태를 바꾸는 호출(비교 담기 · 언어 바꾸기)이 예외로 끝났다. 이것은 실패를 삼키고 메모리 상태만 둔다.
 */
export const safeLocalStateStorage: StateStorage = {
  getItem: (name) => storageGet(name),
  setItem: (name, value) => {
    storageSet(name, value);
  },
  removeItem: (name) => storageRemove(name),
};
