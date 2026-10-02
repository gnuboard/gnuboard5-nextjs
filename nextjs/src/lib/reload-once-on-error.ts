"use client";

import { useEffect, useState } from "react";
import { storageGet, storageSet } from "@/lib/safe-storage";

const STORAGE_KEY = "g5:error-reload";
/** 같은 주소에서 이 시간 안에 다시 오류가 나면 새로고침하지 않고 오류 화면을 보인다(무한 새로고침 방지). */
const RELOAD_WINDOW_MS = 60_000;

type LastReload = { path: string; at: number };

function readLastReload(): LastReload | null {
  const raw = storageGet(STORAGE_KEY, "session");
  if (!raw) return null;
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    typeof (parsed as LastReload).path === "string" &&
    typeof (parsed as LastReload).at === "number"
  ) {
    return parsed as LastReload;
  }
  return null;
}

/**
 * 새로 빌드(배포)하기 전에 열어 둔 탭은 옛 화면 코드에 새 빌드의 화면 데이터를 받아 그리다 깨진다.
 * 정적 빌드는 빌드 ID 가 늘 `g5-static` 이라 Next 가 이 섞임을 알아채고 스스로 새로 불러오지 못한다
 * (핸드북 「문제가 생기면 보는 순서」 9번). 오류 화면이 뜨면 먼저 한 번만 새로고침해 새 빌드를 통째로
 * 받게 한다. 새로고침 뒤에도 같은 주소에서 곧바로 또 나면 진짜 오류이므로 그때는 오류 화면을 둔다.
 *
 * - 운영 빌드에서만 건다. 개발 중에는 오류를 그대로 봐야 한다.
 * - sessionStorage 를 못 쓰는 브라우저(막힘 · 사생활 모드 제한)에서는 반복을 막을 수 없으므로 걸지 않는다.
 *
 * @returns 새로고침을 시작했으면 true — 호출한 화면은 오류 대신 "다시 불러오는 중"을 보인다.
 */
export function useReloadOnceOnError(): boolean {
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    const path = window.location.pathname;
    const now = Date.now();
    try {
      const last = readLastReload();
      if (last && last.path === path && now - last.at < RELOAD_WINDOW_MS) return;
      // 기록을 남기지 못하면(저장소가 막힘) 새로고침한 다음 문서가 "이미 한 번 했다"를 몰라 끝없이 반복한다.
      if (!storageSet(STORAGE_KEY, JSON.stringify({ path, at: now }), "session")) return;
    } catch {
      return;
    }
    setReloading(true);
    window.location.reload();
  }, []);

  return reloading;
}
