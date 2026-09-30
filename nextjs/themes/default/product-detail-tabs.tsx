"use client";

import type { G5ThemeProductDetailTabsProps } from "@/lib/theme-types";
import { cn } from "@/lib/utils";

/**
 * 레퍼런스 item.php 의 #sit_info: 왼쪽에 탭 띠(상품정보 · 사용후기 N · 상품문의 N ·
 * 배송/교환)와 본문, 오른쪽에 따라다니는 구매 상자(#sit_buy — 선택옵션 · 고른 옵션 ·
 * 합계 · 장바구니/바로구매). 탭의 접근성 속성은 앱이 buttonProps 로 주고, 본문은
 * panel 로 온다. 구매 상자의 알맹이도 앱 것(purchaseControls)이라 위 패널과 같은
 * 상태를 두 벌로 그린다 — 레퍼런스의 shop.js 가 두 상자를 맞추던 것과 같은 결과다.
 * 좁은 화면에서는 상자를 접는다(theme.shop.css).
 */
export function SoluneProductDetailTabs({
  tabs,
  panel,
  purchaseControls,
}: G5ThemeProductDetailTabsProps) {
  return (
    <section className={cn("solune-pdp-body", purchaseControls && "has-aside")}>
      <div className="solune-pdp-main">
        <div role="tablist" aria-label="상품 상세 정보" className="solune-pdp-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              {...tab.buttonProps}
              className={cn("solune-pdp-tab", tab.selected && "is-selected")}
            >
              {tab.label}
              {tab.count !== undefined ? (
                <span className="solune-pdp-tab-count">{tab.count}</span>
              ) : null}
            </button>
          ))}
        </div>
        {panel}
      </div>
      {purchaseControls ? (
        <aside className="solune-pdp-aside" aria-label="구매 옵션">
          <p className="solune-pdp-aside-eyebrow">선택옵션</p>
          {purchaseControls}
        </aside>
      ) : null}
    </section>
  );
}
