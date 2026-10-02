"use client";

import { useEffect, useMemo, useState } from "react";
import { SafeHtml } from "@/components/SafeHtml";
import type { ShopPopup } from "@/lib/api";
import { X } from "lucide-react";
import { storageGet, storageRemove, storageSet } from "@/lib/safe-storage";

// 기본 배너 줄은 ShopHomeBanners.tsx 로 옮겼다 — 이 파일(정화기를 쓰는 팝업)과 한 번들에 묶이지 않게.

function popupStorageKey(id: number): string {
  return `g5_shop_popup_hidden_until_${id}`;
}

function popupIsHidden(id: number): boolean {
  if (typeof window === "undefined") return false;

  const raw = storageGet(popupStorageKey(id));
  if (!raw) return false;

  const hiddenUntil = Number(raw);
  if (!Number.isFinite(hiddenUntil) || hiddenUntil <= Date.now()) {
    storageRemove(popupStorageKey(id));
    return false;
  }

  return true;
}

function hidePopupForHours(id: number, hours: number) {
  if (typeof window === "undefined") return;

  const safeHours = Math.max(1, hours || 24);
  storageSet(
    popupStorageKey(id),
    String(Date.now() + safeHours * 60 * 60 * 1000)
  );
}

export function ShopHomePopups({ popups }: { popups: ShopPopup[] }) {
  const [closedIds, setClosedIds] = useState<number[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  const visiblePopups = useMemo(() => {
    if (!ready) return [];

    return popups
      .filter((popup) => popup.nw_id > 0)
      .filter((popup) => !closedIds.includes(popup.nw_id))
      .filter((popup) => !popupIsHidden(popup.nw_id))
      .slice(0, 3);
  }, [closedIds, popups, ready]);

  if (visiblePopups.length === 0) return null;

  const closePopup = (id: number) => {
    setClosedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const closeForConfiguredTime = (popup: ShopPopup) => {
    hidePopupForHours(popup.nw_id, popup.nw_disable_hours || 24);
    closePopup(popup.nw_id);
  };

  return (
    <div className="fixed bottom-4 left-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col gap-3 sm:left-auto sm:right-4">
      {visiblePopups.map((popup) => {
        const maxWidth = Math.min(Math.max(popup.nw_width || 360, 280), 520);
        const maxHeight = Math.min(Math.max(popup.nw_height || 260, 180), 620);

        return (
          <section
            key={popup.nw_id}
            className="overflow-hidden rounded-[6px] border border-[#dfe4ea] bg-white shadow-[0_16px_40px_rgba(15,23,42,0.16)]"
            style={{ width: maxWidth }}
            aria-label={popup.nw_subject || "쇼핑몰 팝업"}
          >
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <h2 className="line-clamp-1 text-sm font-bold text-[#202124]">
                {popup.nw_subject || "쇼핑몰 안내"}
              </h2>
              <button
                type="button"
                onClick={() => closePopup(popup.nw_id)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#6b7280] hover:bg-[#f1f3f5] hover:text-[#202124]"
                aria-label="팝업 닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SafeHtml
              className="prose prose-sm max-w-none overflow-auto px-4 py-3 text-sm"
              style={{ maxHeight }}
              html={popup.nw_content_html === 1 ? popup.nw_content : popup.nw_content_text}
              policy="commerce"
            />
            <div className="flex items-center justify-end gap-2 border-t bg-[#f8f9fa] px-4 py-3">
              <button
                type="button"
                onClick={() => closeForConfiguredTime(popup)}
                className="text-xs font-medium text-[#5f6368] hover:text-[#202124]"
              >
                {popup.nw_disable_hours || 24}시간 보지 않기
              </button>
              <button
                type="button"
                onClick={() => closePopup(popup.nw_id)}
                className="rounded-[4px] bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
              >
                닫기
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
