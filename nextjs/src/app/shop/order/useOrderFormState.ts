"use client";

import { useState } from "react";
import { type AddressSelection } from "./orderAddressHelpers";
import { useOrderPaymentNotice } from "./useOrderPaymentNotice";

export function useOrderFormState() {
  const [submitting, setSubmitting] = useState(false);
  const [memo, setMemo] = useState("");
  const [hopeDate, setHopeDate] = useState("");
  const [guestPassword, setGuestPassword] = useState("");
  const [addressSelection, setAddressSelection] =
    useState<AddressSelection>("same");
  const [saveAsNewAddress, setSaveAsNewAddress] = useState(false);
  const [newAddressSubject, setNewAddressSubject] = useState("");
  const [newAddressDefault, setNewAddressDefault] = useState(false);
  const [selectedCouponId, setSelectedCouponId] = useState("");
  const [selectedSendCouponId, setSelectedSendCouponId] = useState("");
  const [pointUseInput, setPointUseInput] = useState("");

  const paymentNoticeState = useOrderPaymentNotice({ setSubmitting });
  const deliveryRequest = {
    memo,
    setMemo,
    hopeDate,
    setHopeDate,
  };
  const addressSave = {
    saveAsNewAddress,
    setSaveAsNewAddress,
    newAddressSubject,
    setNewAddressSubject,
    newAddressDefault,
    setNewAddressDefault,
  };
  const couponPoint = {
    selectedCouponId,
    setSelectedCouponId,
    selectedSendCouponId,
    setSelectedSendCouponId,
    pointUseInput,
    setPointUseInput,
  };

  return {
    submitting,
    setSubmitting,
    guestPassword,
    setGuestPassword,
    addressSelection,
    setAddressSelection,
    deliveryRequest,
    addressSave,
    couponPoint,
    paymentNoticeState,
  };
}
