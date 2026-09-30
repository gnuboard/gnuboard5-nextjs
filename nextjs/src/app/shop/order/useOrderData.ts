"use client";

import { useState } from "react";
import { type ShopCartItem, type ShopPolicy } from "@/lib/api";
import {
  EMPTY_ADDRESS,
  type AddressForm,
  type AddressSelection,
  type SavedAddress,
} from "./orderAddressHelpers";
import { type PaymentConfig } from "./orderPaymentHelpers";
import { type MyCoupon } from "./orderPricingHelpers";
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

  useOrderShippingQuote({
    itemCount: items.length,
    shippingZip,
    directCheckout,
    directCtIds,
    setCartShippingCost,
    setShippingPolicy,
  });

  return {
    items,
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
