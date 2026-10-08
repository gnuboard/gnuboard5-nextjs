import type {
  AddressForm,
  AddressSelection,
  SavedAddress,
} from "./orderAddressHelpers";
import type { AddressFieldUpdater, PostcodeTarget } from "./OrderAddressFields";
import type { HopeDateRule, PaymentConfig } from "./orderPaymentHelpers";
import type { MyCoupon } from "./orderPricingHelpers";

export const ORDER_INPUT_CLASS_NAME =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

export function isDirectCheckoutEnabled(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  return (
    normalized !== "" && !["0", "false", "no", "off"].includes(normalized)
  );
}

type BuildOrdererInfoPropsInput = {
  orderer: AddressForm;
  updateOrderer: AddressFieldUpdater;
  isMemberOrder: boolean;
  guestPassword: string;
  setGuestPassword: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
};

type AddressSaveState = {
  saveAsNewAddress: boolean;
  setSaveAsNewAddress: (checked: boolean) => void;
  newAddressSubject: string;
  setNewAddressSubject: (value: string) => void;
  newAddressDefault: boolean;
  setNewAddressDefault: (checked: boolean) => void;
};

type DeliveryRequestState = {
  memo: string;
  setMemo: (value: string) => void;
  hopeDate: string;
  setHopeDate: (value: string) => void;
};

type BuildRecipientInfoPropsInput = {
  addressSelection: AddressSelection;
  handleAddressSelection: (selection: AddressSelection) => void;
  savedAddresses: SavedAddress[];
  openAddressModal: () => void;
  recipient: AddressForm;
  updateRecipient: AddressFieldUpdater;
  isMemberOrder: boolean;
  addressSave: AddressSaveState;
  deliveryRequest: DeliveryRequestState;
  hopeDateRule: HopeDateRule | null;
};

type BuildPaymentMethodSectionPropsInput = {
  paymentMethod: string;
  setPaymentMethod: (value: string) => void;
  easyPayService: string;
  setEasyPayService: (value: string) => void;
  paymentConfig: PaymentConfig | null;
  bankAccount: string;
  setBankAccount: (value: string) => void;
  depositName: string;
  setDepositName: (value: string) => void;
};

type CouponPointState = {
  selectedCouponId: string;
  setSelectedCouponId: (value: string) => void;
  selectedSendCouponId: string;
  setSelectedSendCouponId: (value: string) => void;
  pointUseInput: string;
  setPointUseInput: (value: string) => void;
};

type BuildCouponPointSectionPropsInput = {
  orderCoupons: MyCoupon[];
  sendCoupons: MyCoupon[];
  selectedCoupon: MyCoupon | undefined;
  selectedSendCoupon: MyCoupon | undefined;
  orderCouponBase: number;
  orderAmountAfterCoupons: number;
  couponDiscount: number;
  sendCouponDiscount: number;
  shippingCost: number;
  pointBalance: number;
  settlePointUnit: number;
  maxPointUse: number;
  pointUse: number;
  normalizedPointUseInput: string;
  pointWarn: string;
  couponPoint: CouponPointState;
};

type BuildSummaryPropsInput = {
  subtotal: number;
  cartCoupon: number;
  couponDiscount: number;
  sendCouponDiscount: number;
  pointUse: number;
  shippingCost: number;
  total: number;
  submitting: boolean;
};

type BuildAddressModalPropsInput = {
  open: boolean;
  addresses: SavedAddress[];
  updatingAddressId: number | null;
  onClose: () => void;
  onSelect: (address: SavedAddress) => void;
  onSetDefault: (address: SavedAddress) => void;
  onDelete: (addressId: number) => void;
  onUpdateSubject: (address: SavedAddress, subject: string) => void;
};

export function buildOrdererInfoProps(input: BuildOrdererInfoPropsInput) {
  return input;
}

export function buildRecipientInfoProps({
  addressSave,
  deliveryRequest,
  ...input
}: BuildRecipientInfoPropsInput) {
  return {
    ...input,
    ...addressSave,
    ...deliveryRequest,
  };
}

export function buildPaymentMethodSectionProps({
  paymentConfig,
  ...input
}: BuildPaymentMethodSectionPropsInput) {
  return {
    ...input,
    paymentConfig,
    bankAccounts: paymentConfig?.bank_accounts ?? [],
  };
}

export function buildCouponPointSectionProps({
  couponPoint,
  ...input
}: BuildCouponPointSectionPropsInput) {
  return {
    ...input,
    ...couponPoint,
  };
}

export function buildSummaryProps(input: BuildSummaryPropsInput) {
  return input;
}

export function buildAddressModalProps(input: BuildAddressModalPropsInput) {
  return input;
}
