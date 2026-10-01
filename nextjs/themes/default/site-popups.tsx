"use client";

import { useEffect, useState } from "react";
import { ShopHomePopups } from "@/app/shop/ShopHomeMarketing";
import type { ShopPopup } from "@/lib/api";
import { getShopPopups } from "@/services/shop";

const MOBILE_QUERY = "(max-width: 767px)";

/**
 * 관리자 > 환경설정 > 팝업레이어관리의 팝업을 띄운다.
 *
 * 정적 설치본은 빌드 때 그린 화면이라 팝업을 브라우저에서 새로 읽는다. 구분(comm · shop · both)과
 * 접속기기(PC · 모바일 · 모두)를 따르고, "N시간 보지 않기"는 ShopHomePopups 가 기억한다.
 */
export function SoluneSitePopups({ division }: { division: "comm" | "shop" }) {
  const [popups, setPopups] = useState<ShopPopup[]>([]);

  useEffect(() => {
    let alive = true;
    const device = window.matchMedia(MOBILE_QUERY).matches ? "mobile" : "pc";

    getShopPopups({ device, limit: 5, division }, 0)
      .then((list) => {
        if (alive) setPopups(list);
      })
      .catch(() => {
        // 팝업은 덤이다. 못 읽으면 띄우지 않는다.
      });

    return () => {
      alive = false;
    };
  }, [division]);

  return popups.length > 0 ? <ShopHomePopups popups={popups} /> : null;
}
