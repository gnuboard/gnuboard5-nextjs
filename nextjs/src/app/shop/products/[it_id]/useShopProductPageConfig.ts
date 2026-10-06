"use client";

import { useEffect, useState } from "react";
import type { ShopNaverPayConfig, ShopPolicy } from "@/lib/api";
import { getShopNaverPayConfig, getShopPolicy } from "@/services/shop";

interface ShopProductPageConfig {
  shippingPolicy: ShopPolicy | null;
  naverPayConfig: ShopNaverPayConfig | null;
}

/** 상품 상세가 처음 한 번 읽는 쇼핑몰 설정 — 배송비 정책과 네이버페이 설정. 읽지 못하면 null. */
export function useShopProductPageConfig(): ShopProductPageConfig {
  const [shippingPolicy, setShippingPolicy] = useState<ShopPolicy | null>(null);
  const [naverPayConfig, setNaverPayConfig] = useState<ShopNaverPayConfig | null>(null);

  useEffect(() => {
    let alive = true;

    getShopPolicy()
      .then((policy) => {
        if (alive) setShippingPolicy(policy);
      })
      .catch(() => {
        if (alive) setShippingPolicy(null);
      });

    getShopNaverPayConfig()
      .then((config) => {
        if (alive) setNaverPayConfig(config);
      })
      .catch(() => {
        if (alive) setNaverPayConfig(null);
      });

    return () => {
      alive = false;
    };
  }, []);

  return { shippingPolicy, naverPayConfig };
}
