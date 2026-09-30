import type { useOrderData } from "./useOrderData";
import type { useOrderDiscounts } from "./useOrderDiscounts";
import type { useOrderFormState } from "./useOrderFormState";
import type { UseOrderSubmitOptions } from "./orderSubmitHandler";

type OrderFormState = ReturnType<typeof useOrderFormState>;
type OrderData = ReturnType<typeof useOrderData>;
type OrderDiscounts = ReturnType<typeof useOrderDiscounts>;

type BuildOrderSubmitOptionsInput = {
  formState: OrderFormState;
  orderData: OrderData;
  discounts: OrderDiscounts;
  directCheckout: boolean;
  directCtIds: string;
};

export function buildOrderSubmitOptions({
  formState,
  orderData,
  discounts,
  directCheckout,
  directCtIds,
}: BuildOrderSubmitOptionsInput): UseOrderSubmitOptions {
  return {
    orderer: orderData.orderer,
    recipient: orderData.recipient,
    addressSelection: formState.addressSelection,
    saveAsNewAddress: formState.addressSave.saveAsNewAddress,
    newAddressSubject: formState.addressSave.newAddressSubject,
    newAddressDefault: formState.addressSave.newAddressDefault,
    email: orderData.email,
    memo: formState.deliveryRequest.memo,
    hopeDate: formState.deliveryRequest.hopeDate,
    taxRequest: formState.deliveryRequest.taxRequest,
    cashRequest: formState.deliveryRequest.cashRequest,
    guestPassword: formState.guestPassword,
    isMemberOrder: orderData.isMemberOrder,
    paymentMethod: orderData.paymentMethod,
    easyPayService: orderData.easyPayService,
    paymentConfig: orderData.paymentConfig,
    bankAccount: orderData.bankAccount,
    depositName: orderData.depositName,
    agreeTerms: formState.agreements.agreeTerms,
    agreePrivacy: formState.agreements.agreePrivacy,
    selectedCouponId: formState.couponPoint.selectedCouponId,
    selectedSendCouponId: formState.couponPoint.selectedSendCouponId,
    pointUse: discounts.pointUse,
    directCheckout,
    directCtIds,
    setSubmitting: formState.setSubmitting,
    setPaymentNotice: formState.paymentNoticeState.setPaymentNotice,
  };
}
