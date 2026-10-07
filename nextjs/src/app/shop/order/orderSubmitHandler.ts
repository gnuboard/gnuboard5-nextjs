import { isMobileDevice as defaultIsMobileDevice } from "@/lib/payment";
import { toastError as defaultToastError } from "@/lib/toast";
import {
  type AddressForm,
  type AddressSelection,
} from "./orderAddressHelpers";
import {
  type PaymentConfig,
  type PaymentNotice,
} from "./orderPaymentHelpers";
import {
  submitBankOrder as submitBankOrderAction,
  submitPaymentOrder as submitPaymentOrderAction,
} from "./orderSubmitFlow";
import { buildOrderBody as buildOrderBodyAction } from "./orderSubmitPayload";
import { validateOrderSubmission as validateOrderSubmissionAction } from "./orderSubmitValidation";

type RouterLike = {
  push(href: string): void;
  replace(href: string): void;
};

type SetSubmitting = (submitting: boolean) => void;
type SetPaymentNotice = (notice: PaymentNotice | null) => void;

export type UseOrderSubmitOptions = {
  orderer: AddressForm;
  recipient: AddressForm;
  addressSelection: AddressSelection;
  saveAsNewAddress: boolean;
  newAddressSubject: string;
  newAddressDefault: boolean;
  email: string;
  memo: string;
  hopeDate: string;
  guestPassword: string;
  isMemberOrder: boolean;
  paymentMethod: string;
  /** 간편결제에서 고른 서비스(KCP · NICEPAY). 비어 있으면 서버의 대표 서비스. */
  easyPayService?: string;
  paymentConfig: PaymentConfig | null;
  bankAccount: string;
  depositName: string;
  selectedCouponId: string;
  selectedSendCouponId: string;
  pointUse: number;
  directCheckout: boolean;
  directCtIds: string;
  setSubmitting: SetSubmitting;
  setPaymentNotice: SetPaymentNotice;
  /** 서버가 장바구니가 바뀌었다고 멈추면(CART_CHANGED) 주문서의 상품 줄을 다시 불러온다. */
  onCartChanged?: () => void;
  /** 서버가 희망배송일로 멈추면(HOPE_DATE) 결제 설정을 다시 받는다. */
  onHopeDateRejected?: () => void;
};

type SubmitOrderInput = UseOrderSubmitOptions & {
  router: RouterLike;
  origin: string;
  clientUid?: string;
  deps?: Partial<OrderSubmitHandlerDeps>;
};

export type OrderSubmitHandlerDeps = {
  buildOrderBody: typeof buildOrderBodyAction;
  isMobileDevice: typeof defaultIsMobileDevice;
  submitBankOrder: typeof submitBankOrderAction;
  submitPaymentOrder: typeof submitPaymentOrderAction;
  toastError: typeof defaultToastError;
  validateOrderSubmission: typeof validateOrderSubmissionAction;
};

const defaultOrderSubmitHandlerDeps: OrderSubmitHandlerDeps = {
  buildOrderBody: buildOrderBodyAction,
  isMobileDevice: defaultIsMobileDevice,
  submitBankOrder: submitBankOrderAction,
  submitPaymentOrder: submitPaymentOrderAction,
  toastError: defaultToastError,
  validateOrderSubmission: validateOrderSubmissionAction,
};

function resolveOrderSubmitHandlerDeps(
  deps?: Partial<OrderSubmitHandlerDeps>
): OrderSubmitHandlerDeps {
  return { ...defaultOrderSubmitHandlerDeps, ...deps };
}

export async function submitOrder({
  orderer,
  recipient,
  addressSelection,
  saveAsNewAddress,
  newAddressSubject,
  newAddressDefault,
  email,
  memo,
  hopeDate,
  guestPassword,
  isMemberOrder,
  paymentMethod,
  easyPayService,
  paymentConfig,
  bankAccount,
  depositName,
  selectedCouponId,
  selectedSendCouponId,
  pointUse,
  directCheckout,
  directCtIds,
  setSubmitting,
  setPaymentNotice,
  onCartChanged,
  onHopeDateRejected,
  router,
  origin,
  clientUid,
  deps,
}: SubmitOrderInput): Promise<void> {
  const handlerDeps = resolveOrderSubmitHandlerDeps(deps);

  const validation = handlerDeps.validateOrderSubmission({
    orderer,
    recipient,
    addressSelection,
    paymentMethod,
    bankAccount,
    depositName,
    guestPassword,
    isMemberOrder,
    hopeDate,
    hopeDateRule: paymentConfig?.hope_date ?? null,
  });

  if (!validation.ok) {
    if (validation.message) handlerDeps.toastError(validation.message);
    return;
  }
  const { methodDef } = validation;

  setSubmitting(true);
  setPaymentNotice(null);

  const orderBody = handlerDeps.buildOrderBody({
    orderer,
    recipient,
    addressSelection,
    saveAsNewAddress,
    newAddressSubject,
    newAddressDefault,
    email,
    memo,
    hopeDate,
    guestPassword,
    isMemberOrder,
    methodDef,
    selectedCouponId,
    selectedSendCouponId,
    pointUse,
    directCheckout,
    directCtIds,
    paymentDevice: handlerDeps.isMobileDevice() ? "mobile" : "pc",
    clientUid,
  });

  const cartChanged = {
    ...(onCartChanged ? { onCartChanged } : {}),
    ...(onHopeDateRejected ? { onHopeDateRejected } : {}),
  };

  if (methodDef.value === "bank") {
    await handlerDeps.submitBankOrder({
      orderBody,
      bankAccount,
      depositName,
      router,
      setSubmitting,
      ...cartChanged,
    });
    return;
  }

  await handlerDeps.submitPaymentOrder({
    orderBody,
    paymentConfig,
    methodDef,
    origin,
    setSubmitting,
    setPaymentNotice,
    ...(methodDef.value === "easy_pay" && easyPayService ? { easyPayService } : {}),
    ...cartChanged,
  });
}
