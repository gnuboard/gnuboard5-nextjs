"use client";

import { useEffect, useMemo, useState } from "react";
import { SafeHtml } from "@/components/SafeHtml";
import type { ShopBanner, ShopPopup } from "@/lib/api";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function ShopHomeBanners({ banners }: { banners: ShopBanner[] }) {
  const visibleBanners = banners.filter((banner) => banner.image_url);

  if (visibleBanners.length === 0) return null;

  return (
    <section className="mb-8" aria-label="쇼핑몰 배너">
      <div
        className={cn(
          "grid gap-3",
          visibleBanners.length === 1
            ? "grid-cols-1"
            : "grid-cols-1 md:grid-cols-2"
        )}
      >
        {visibleBanners.map((banner, index) => {
          const href = `/shop/bannerhit.php?bn_id=${encodeURIComponent(String(banner.bn_id))}`;
          const openNew = banner.bn_new_win === 1 || isExternalUrl(banner.bn_url);

          return (
            <a
              key={banner.bn_id}
              href={href}
              target={openNew ? "_blank" : undefined}
              rel={openNew ? "noopener noreferrer" : undefined}
              className={cn(
                "group block overflow-hidden rounded-[4px] bg-[#f3f5f7]",
                banner.bn_border === 1 && "border border-[#dfe4ea]"
              )}
            >
              <img
                src={banner.image_url}
                alt={banner.bn_alt || `쇼핑몰 배너 ${index + 1}`}
                className="h-auto w-full object-cover transition duration-150 group-hover:brightness-[0.98]"
                loading={index === 0 ? "eager" : "lazy"}
              />
            </a>
          );
        })}
      </div>
    </section>
  );
}

function popupStorageKey(id: number): string {
  return `g5_shop_popup_hidden_until_${id}`;
}

function popupIsHidden(id: number): boolean {
  if (typeof window === "undefined") return false;

  const raw = window.localStorage.getItem(popupStorageKey(id));
  if (!raw) return false;

  const hiddenUntil = Number(raw);
  if (!Number.isFinite(hiddenUntil) || hiddenUntil <= Date.now()) {
    window.localStorage.removeItem(popupStorageKey(id));
    return false;
  }

  return true;
}

function hidePopupForHours(id: number, hours: number) {
  if (typeof window === "undefined") return;

  const safeHours = Math.max(1, hours || 24);
  window.localStorage.setItem(
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
