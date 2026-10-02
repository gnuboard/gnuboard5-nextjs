"use client";

import type { ShopBanner } from "@/lib/api";
import { cn } from "@/lib/utils";

/*
 * 테마가 쇼핑 홈을 그리지 않을 때의 기본 배너 줄.
 * 팝업(ShopHomeMarketing.tsx)과 따로 둔다 — 팝업은 본문 HTML 정화기(sanitize-html, 약 180KB)를 쓰는데,
 * 한 파일에 있으면 배너만 쓰는 쇼핑 홈도 첫 번들로 정화기를 받는다.
 */

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
