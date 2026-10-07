"use client";

import { useEffect, useState } from "react";
import type { ShopPolicy } from "@/lib/api";
import { getShopPolicy } from "@/services/shop";

interface ShopProductPageConfig {
  shippingPolicy: ShopPolicy | null;
}

/** 상품 상세가 처음 한 번 읽는 쇼핑몰 설정 — 배송비 정책. 읽지 못하면 null. */
export function useShopProductPageConfig(): ShopProductPageConfig {
  const [shippingPolicy, setShippingPolicy] = useState<ShopPolicy | null>(null);

  useEffect(() => {
    let alive = true;

    getShopPolicy()
      .then((policy) => {
        if (alive) setShippingPolicy(policy);
      })
      .catch(() => {
        if (alive) setShippingPolicy(null);
      });

    return () => {
      alive = false;
    };
  }, []);

  return { shippingPolicy };
}
