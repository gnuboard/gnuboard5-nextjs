"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import type { ShopCartItem } from "@/lib/api";
import { notifyCartChanged } from "@/lib/cart-events";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { toastError } from "@/lib/toast";
import { loadOrderCartData } from "./orderDataActions";
import { applyInitialCartData } from "./orderInitialDataState";

type UseOrderCartReloadOptions = {
  directCheckout: boolean;
  directCtIds: string;
  setItems: Dispatch<SetStateAction<ShopCartItem[]>>;
  setCartShippingCost: Dispatch<SetStateAction<number | null>>;
};

/**
 * 주문서의 상품 줄만 다시 불러온다 — 주문 · 결제 준비가 장바구니가 바뀌었다고(CART_CHANGED) 멈췄을 때.
 * 주문자 · 배송지 · 결제 수단처럼 손님이 입력한 것은 두고 상품 줄과 배송비만 바꾼다. 남은 줄이 없으면 장바구니로.
 */
export function useOrderCartReload({
  directCheckout,
  directCtIds,
  setItems,
  setCartShippingCost,
}: UseOrderCartReloadOptions): () => void {
  const router = useRouter();

  return useCallback(() => {
    loadOrderCartData({ directCheckout, directCtIds })
      .then((cartData) => {
        // 머리의 미니 장바구니(개수 표시)도 다시 받게 한다.
        notifyCartChanged();
        const cartItems = applyInitialCartData(cartData, { setCartShippingCost });
        if (cartItems.length === 0) {
          toastError("장바구니가 비어있습니다.");
          runtimeRouterPush(router, "/shop/cart");
          return;
        }
        setItems(cartItems);
      })
      .catch(() => {
        toastError("장바구니 정보를 다시 불러오지 못했습니다. 새로고침해 주세요.");
      });
  }, [directCheckout, directCtIds, router, setCartShippingCost, setItems]);
}
