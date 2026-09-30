"use client";

import { useCallback, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { submitOrder, type UseOrderSubmitOptions } from "./orderSubmitHandler";

function createOrderClientUid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `order-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function useOrderSubmit({
  orderer,
  recipient,
  addressSelection,
  saveAsNewAddress,
  newAddressSubject,
  newAddressDefault,
  email,
  memo,
  hopeDate,
  taxRequest,
  cashRequest,
  guestPassword,
  isMemberOrder,
  paymentMethod,
  easyPayService,
  paymentConfig,
  bankAccount,
  depositName,
  agreeTerms,
  agreePrivacy,
  selectedCouponId,
  selectedSendCouponId,
  pointUse,
  directCheckout,
  directCtIds,
  setSubmitting,
  setPaymentNotice,
}: UseOrderSubmitOptions) {
  const router = useRouter();
  // Synchronous re-entrancy guard. setSubmitting is async React state, so it
  // cannot prevent a rapid double-click from starting a second submit before
  // the first render commits, which would create a duplicate order. The ref
  // flips synchronously on the first call and is cleared once submitOrder
  // settles.
  const submittingRef = useRef(false);
  const clientUidRef = useRef<string | null>(null);

  return useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (submittingRef.current) return;
      submittingRef.current = true;
      clientUidRef.current ??= createOrderClientUid();
      try {
        await submitOrder({
          orderer,
          recipient,
          addressSelection,
          saveAsNewAddress,
          newAddressSubject,
          newAddressDefault,
          email,
          memo,
          hopeDate,
          taxRequest,
          cashRequest,
          guestPassword,
          isMemberOrder,
          paymentMethod,
          easyPayService,
          paymentConfig,
          bankAccount,
          depositName,
          agreeTerms,
          agreePrivacy,
          selectedCouponId,
          selectedSendCouponId,
          pointUse,
          directCheckout,
          directCtIds,
          setSubmitting,
          setPaymentNotice,
          router,
          origin: window.location.origin,
          clientUid: clientUidRef.current,
        });
      } finally {
        submittingRef.current = false;
      }
    },
    [
      orderer,
      recipient,
      addressSelection,
      saveAsNewAddress,
      newAddressSubject,
      newAddressDefault,
      email,
      memo,
      hopeDate,
      taxRequest,
      cashRequest,
      guestPassword,
      isMemberOrder,
      paymentMethod,
      easyPayService,
      paymentConfig,
      bankAccount,
      depositName,
      agreeTerms,
      agreePrivacy,
      selectedCouponId,
      selectedSendCouponId,
      pointUse,
      directCheckout,
      directCtIds,
      setSubmitting,
      setPaymentNotice,
      router,
    ]
  );
}
