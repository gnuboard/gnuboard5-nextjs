"use client";

import { useSearchParams } from "next/navigation";
import { useOrderAddressBook } from "./useOrderAddressBook";
import { useOrderData } from "./useOrderData";
import { useOrderDiscounts } from "./useOrderDiscounts";
import { useOrderFormState } from "./useOrderFormState";
import { useOrderSubmit } from "./useOrderSubmit";
import { buildOrderPageControllerResult } from "./orderPageControllerResult";
import { buildOrderSubmitOptions } from "./orderPageSubmitOptions";
import { isDirectCheckoutEnabled } from "./orderPageSectionProps";

export function useOrderPageController() {
  const searchParams = useSearchParams();
  const directCtIds = searchParams.get("ct_ids") ?? "";
  const directCheckoutRaw =
    searchParams.get("direct") ?? searchParams.get("sw_direct") ?? "";
  const directCheckout = isDirectCheckoutEnabled(directCheckoutRaw);
  const formState = useOrderFormState();
  const orderData = useOrderData({
    directCheckout,
    directCtIds,
    addressSelection: formState.addressSelection,
  });
  const addressBook = useOrderAddressBook({
    addressSelection: formState.addressSelection,
    setAddressSelection: formState.setAddressSelection,
    savedAddresses: orderData.savedAddresses,
    setSavedAddresses: orderData.setSavedAddresses,
    setOrderer: orderData.setOrderer,
    setRecipient: orderData.setRecipient,
  });
  const discounts = useOrderDiscounts({
    items: orderData.items,
    shippingPolicy: orderData.shippingPolicy,
    cartShippingCost: orderData.cartShippingCost,
    myCoupons: orderData.myCoupons,
    selectedCouponId: formState.couponPoint.selectedCouponId,
    selectedSendCouponId: formState.couponPoint.selectedSendCouponId,
    pointUseInput: formState.couponPoint.pointUseInput,
    pointBalance: orderData.pointBalance,
  });
  const handleSubmit = useOrderSubmit(
    buildOrderSubmitOptions({
      formState,
      orderData,
      discounts,
      directCheckout,
      directCtIds,
    })
  );

  return buildOrderPageControllerResult({
    formState,
    orderData,
    addressBook,
    discounts,
    handleSubmit,
  });
}
