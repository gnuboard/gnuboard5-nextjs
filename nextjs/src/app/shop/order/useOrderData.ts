"use client";

import { useCallback, useState } from "react";
import { api, type ShopCartItem, type ShopPolicy } from "@/lib/api";
import {
  EMPTY_ADDRESS,
  type AddressForm,
  type AddressSelection,
  type SavedAddress,
} from "./orderAddressHelpers";
import { type PaymentConfig } from "./orderPaymentHelpers";
import { shownOrderCtIds } from "./orderDataHelpers";
import { type MyCoupon } from "./orderPricingHelpers";
import { useOrderCartReload } from "./useOrderCartReload";
import { useOrderInitialData } from "./useOrderInitialData";
import { useOrderShippingQuote } from "./useOrderShippingQuote";

type UseOrderDataOptions = {
  directCheckout: boolean;
  directCtIds: string;
  addressSelection: AddressSelection;
};

export function useOrderData({
  directCheckout,
  directCtIds,
  addressSelection,
}: UseOrderDataOptions) {
  const [items, setItems] = useState<ShopCartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState("bank");
  // 간편결제에서 고른 서비스(KCP · NICEPAY). 비어 있으면 서버의 대표 서비스로 결제한다.
  const [easyPayService, setEasyPayService] = useState("");
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const [shippingPolicy, setShippingPolicy] = useState<ShopPolicy | null>(null);
  const [cartShippingCost, setCartShippingCost] = useState<number | null>(null);
  const [bankAccount, setBankAccount] = useState("");
  const [depositName, setDepositName] = useState("");
  const [email, setEmail] = useState("");
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [isMemberOrder, setIsMemberOrder] = useState(false);
  const [myCoupons, setMyCoupons] = useState<MyCoupon[]>([]);
  const [pointBalance, setPointBalance] = useState(0);
  const [orderer, setOrderer] = useState<AddressForm>(EMPTY_ADDRESS);
  const [recipient, setRecipient] = useState<AddressForm>(EMPTY_ADDRESS);

  useOrderInitialData({
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
  });

  const shippingZip = (
    addressSelection === "same" ? orderer.zip : recipient.zip
  ).replace(/[^0-9]/g, "");
  // 이 주문서가 보여 준 줄 — 배송비 견적 · 주문 · 결제 준비가 모두 이 줄만 쓴다.
  const orderCtIds = shownOrderCtIds(directCtIds, items);
  const reloadItems = useOrderCartReload({
    directCheckout,
    directCtIds,
    setItems,
    setCartShippingCost,
  });

  // 결제 설정만 다시 받는다 — 서버가 희망배송일로 멈췄을 때(날이 바뀌었거나 처음에 설정을 못 받았을 때) 칸 · 범위를 새로.
  const reloadPaymentConfig = useCallback(() => {
    api
      .get<PaymentConfig>("/shop/payment/config")
      .then((response) => {
        if (response?.data) setPaymentConfig(response.data);
      })
      .catch(() => undefined);
  }, []);

  useOrderShippingQuote({
    itemCount: items.length,
    shippingZip,
    directCheckout,
    directCtIds: orderCtIds,
    setCartShippingCost,
    setShippingPolicy,
  });

  return {
    items,
    orderCtIds,
    reloadItems,
    reloadPaymentConfig,
    loading,
    paymentMethod,
    setPaymentMethod,
    easyPayService,
    setEasyPayService,
    paymentConfig,
    shippingPolicy,
    cartShippingCost,
    bankAccount,
    setBankAccount,
    depositName,
    setDepositName,
    email,
    setEmail,
    savedAddresses,
    setSavedAddresses,
    isMemberOrder,
    myCoupons,
    pointBalance,
    orderer,
    setOrderer,
    recipient,
    setRecipient,
  };
}
