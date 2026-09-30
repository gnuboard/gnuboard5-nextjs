"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { runtimeRouterPush } from "@/lib/runtime-router";
import { toastError } from "@/lib/toast";
import {
  applyInitialCartData,
  applyInitialMemberData,
  applyInitialPaymentConfig,
  loadInitialMemberBenefits,
  resetInitialOrderData,
  type OrderInitialDataSetters,
} from "./orderInitialDataState";
import { loadOrderInitialData } from "./orderDataActions";

type UseOrderInitialDataOptions = {
  directCheckout: boolean;
  directCtIds: string;
} & OrderInitialDataSetters;

export function useOrderInitialData({
  directCheckout,
  directCtIds,
  setItems,
  setLoading,
  setPaymentMethod,
  setPaymentConfig,
  setShippingPolicy,
  setCartShippingCost,
  setBankAccount,
  setDepositName,
  setEmail,
  setSavedAddresses,
  setIsMemberOrder,
  setMyCoupons,
  setPointBalance,
  setOrderer,
}: UseOrderInitialDataOptions) {
  const router = useRouter();

  useEffect(() => {
    let alive = true;

    const loadData = async () => {
      try {
        const initialData = await loadOrderInitialData({
          directCheckout,
          directCtIds,
        });
        if (!alive) return;

        setShippingPolicy(initialData.shippingPolicy);
        applyInitialPaymentConfig(initialData.paymentConfig, {
          setBankAccount,
          setPaymentConfig,
          setPaymentMethod,
        });
        setSavedAddresses(initialData.savedAddresses);

        const cartItems = applyInitialCartData(initialData.cartData, {
          setCartShippingCost,
        });
        if (cartItems.length === 0) {
          toastError("장바구니가 비어있습니다.");
          runtimeRouterPush(router, "/shop/cart");
          return;
        }
        setItems(cartItems);

        if (initialData.member) {
          loadInitialMemberBenefits({
            setMyCoupons,
            setPointBalance,
            shouldApply: () => alive,
          });
        }
        applyInitialMemberData(initialData.member, {
          setDepositName,
          setEmail,
          setIsMemberOrder,
          setOrderer,
        });
      } catch {
        if (!alive) return;
        resetInitialOrderData({ setCartShippingCost, setShippingPolicy });
        toastError("장바구니 정보를 불러오지 못했습니다.");
        runtimeRouterPush(router, "/shop/cart");
      } finally {
        if (alive) setLoading(false);
      }
    };

    loadData();

    return () => {
      alive = false;
    };
  }, [
    directCheckout,
    directCtIds,
    router,
    setBankAccount,
    setCartShippingCost,
    setDepositName,
    setEmail,
    setIsMemberOrder,
    setItems,
    setLoading,
    setMyCoupons,
    setOrderer,
    setPaymentConfig,
    setPaymentMethod,
    setPointBalance,
    setSavedAddresses,
    setShippingPolicy,
  ]);
}
