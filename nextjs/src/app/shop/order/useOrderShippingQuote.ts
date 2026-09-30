"use client";

import { useEffect } from "react";
import type { ShopPolicy } from "@/lib/api";
import { toastError } from "@/lib/toast";
import { loadShippingQuote } from "./orderDataActions";

type UseOrderShippingQuoteOptions = {
  itemCount: number;
  shippingZip: string;
  directCheckout: boolean;
  directCtIds: string;
  setCartShippingCost: (cost: number | null) => void;
  setShippingPolicy: (policy: ShopPolicy | null) => void;
};

export function useOrderShippingQuote({
  itemCount,
  shippingZip,
  directCheckout,
  directCtIds,
  setCartShippingCost,
  setShippingPolicy,
}: UseOrderShippingQuoteOptions) {
  useEffect(() => {
    if (itemCount === 0) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      loadShippingQuote({ shippingZip, directCheckout, directCtIds })
        .then((quote) => {
          if (cancelled || !quote) return;
          setCartShippingCost(quote.total);
          if (quote.policy) {
            setShippingPolicy(quote.policy);
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setCartShippingCost(null);
          toastError(
            err instanceof Error
              ? err.message
              : "배송비를 다시 계산하지 못했습니다."
          );
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    directCheckout,
    directCtIds,
    itemCount,
    setCartShippingCost,
    setShippingPolicy,
    shippingZip,
  ]);
}
