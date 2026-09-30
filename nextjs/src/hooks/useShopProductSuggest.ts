"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export interface ProductSuggestion {
  it_id: string;
  it_name: string;
  it_seo_title?: string;
  it_price: number;
  it_tel_inq?: string;
  image_url: string;
  ca_id: string;
}

/**
 * 쇼핑몰 상품명 자동완성 — /shop/products/suggest 호출.
 * query.length < 2 또는 disabled 면 비어 있는 결과 반환. 300ms 디바운스.
 */
export function useShopProductSuggest(query: string, enabled: boolean) {
  const [items, setItems] = useState<ProductSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!enabled || query.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    clearTimeout(timerRef.current);
    let cancelled = false;
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get<ProductSuggestion[]>(
          `/shop/products/suggest?q=${encodeURIComponent(query)}`
        );
        if (!cancelled) setItems((res.data as ProductSuggestion[]) ?? []);
      } catch {
        if (!cancelled) setItems([]);
      }
      if (!cancelled) setLoading(false);
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
    };
  }, [query, enabled]);

  return { items, loading };
}
