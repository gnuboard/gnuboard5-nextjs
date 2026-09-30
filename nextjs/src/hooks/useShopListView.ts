"use client";

import { useCallback, useEffect, useState } from "react";
import type { ShopListView } from "@/lib/theme-types";

const STORAGE_KEY = "shop:list-view";

function readStoredView(): ShopListView | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "grid" || value === "list" ? value : null;
  } catch {
    return null;
  }
}

/**
 * 상품 목록의 격자/목록 모양. 한 번 고르면 다른 목록 페이지에서도 그대로다 —
 * 영카트의 sct_lst 토글이 쿠키로 기억하는 것과 같다. 첫 렌더는 항상 격자다;
 * 저장된 값은 마운트 뒤에 읽어 서버 HTML 과 어긋나지 않게 한다.
 */
export function useShopListView(initial: ShopListView = "grid"): [ShopListView, (view: ShopListView) => void] {
  const [view, setView] = useState<ShopListView>(initial);

  useEffect(() => {
    const stored = readStoredView();
    if (stored) setView(stored);
  }, []);

  const update = useCallback((next: ShopListView) => {
    setView(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* 사생활 모드 등에서 저장이 막혀도 이번 페이지에서는 바뀐 대로 보인다. */
    }
  }, []);

  return [view, update];
}
