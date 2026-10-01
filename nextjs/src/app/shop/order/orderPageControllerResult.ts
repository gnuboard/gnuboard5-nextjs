import type { useOrderAddressBook } from "./useOrderAddressBook";
import type { useOrderData } from "./useOrderData";
import type { useOrderDiscounts } from "./useOrderDiscounts";
import type { useOrderFormState } from "./useOrderFormState";
import type { useOrderSubmit } from "./useOrderSubmit";
import {
  ORDER_INPUT_CLASS_NAME,
  buildAddressModalProps,
  buildCouponPointSectionProps,
  buildOrdererInfoProps,
  buildPaymentMethodSectionProps,
  buildRecipientInfoProps,
  buildSummaryProps,
} from "./orderPageSectionProps";

type OrderFormState = ReturnType<typeof useOrderFormState>;
type OrderData = ReturnType<typeof useOrderData>;
type OrderAddressBook = ReturnType<typeof useOrderAddressBook>;
type OrderDiscounts = ReturnType<typeof useOrderDiscounts>;
type OrderSubmitHandler = ReturnType<typeof useOrderSubmit>;

type BuildOrderPageControllerResultInput = {
  formState: OrderFormState;
  orderData: OrderData;
  addressBook: OrderAddressBook;
  discounts: OrderDiscounts;
  handleSubmit: OrderSubmitHandler;
};

export function buildOrderPageControllerResult({
  formState,
  orderData,
  addressBook,
  discounts,
  handleSubmit,
}: BuildOrderPageControllerResultInput) {
  return {
    loading: orderData.loading,
    inputClassName: ORDER_INPUT_CLASS_NAME,
    isMemberOrder: orderData.isMemberOrder,
    items: orderData.items,
    paymentNoticeState: formState.paymentNoticeState,
    handleSubmit,
    ordererInfo: buildOrdererInfoProps({
      orderer: orderData.orderer,
      updateOrderer: addressBook.updateOrderer,
      isMemberOrder: orderData.isMemberOrder,
      guestPassword: formState.guestPassword,
      setGuestPassword: formState.setGuestPassword,
      email: orderData.email,
      setEmail: orderData.setEmail,
    }),
    recipientInfo: buildRecipientInfoProps({
      addressSelection: formState.addressSelection,
      handleAddressSelection: addressBook.handleAddressSelection,
      savedAddresses: orderData.savedAddresses,
      openAddressModal: () => addressBook.setShowAddressModal(true),
      recipient: orderData.recipient,
      updateRecipient: addressBook.updateRecipient,
      isMemberOrder: orderData.isMemberOrder,
      addressSave: formState.addressSave,
      deliveryRequest: formState.deliveryRequest,
    }),
    paymentMethodSection: buildPaymentMethodSectionProps({
      paymentMethod: orderData.paymentMethod,
      setPaymentMethod: orderData.setPaymentMethod,
      easyPayService: orderData.easyPayService,
      setEasyPayService: orderData.setEasyPayService,
      paymentConfig: orderData.paymentConfig,
      bankAccount: orderData.bankAccount,
      setBankAccount: orderData.setBankAccount,
      depositName: orderData.depositName,
      setDepositName: orderData.setDepositName,
    }),
    couponPointSection: buildCouponPointSectionProps({
      orderCoupons: discounts.orderCoupons,
      sendCoupons: discounts.sendCoupons,
      selectedCoupon: discounts.selectedCoupon,
      selectedSendCoupon: discounts.selectedSendCoupon,
      orderCouponBase: discounts.orderCouponBase,
      orderAmountAfterCoupons: discounts.orderAmountAfterCoupons,
      shippingCost: discounts.shippingCost,
      pointBalance: orderData.pointBalance,
      settlePointUnit: discounts.settlePointUnit,
      maxPointUse: discounts.maxPointUse,
      pointUse: discounts.pointUse,
      normalizedPointUseInput: discounts.normalizedPointUseInput,
      pointWarn: discounts.pointWarn,
      couponPoint: formState.couponPoint,
    }),
    agreements: formState.agreements,
    summary: buildSummaryProps({
      subtotal: discounts.subtotal,
      cartCoupon: discounts.cartCoupon,
      couponDiscount: discounts.couponDiscount,
      sendCouponDiscount: discounts.sendCouponDiscount,
      pointUse: discounts.pointUse,
      shippingCost: discounts.shippingCost,
      total: discounts.total,
      submitting: formState.submitting,
    }),
    addressModal: buildAddressModalProps({
      open: addressBook.showAddressModal,
      addresses: orderData.savedAddresses,
      updatingAddressId: addressBook.updatingAddressId,
      onClose: () => addressBook.setShowAddressModal(false),
      onSelect: addressBook.handleSelectFromModal,
      onSetDefault: addressBook.handleSetDefaultAddress,
      onDelete: addressBook.handleDeleteAddress,
      onUpdateSubject: addressBook.handleUpdateAddressSubject,
    }),
  };
}
