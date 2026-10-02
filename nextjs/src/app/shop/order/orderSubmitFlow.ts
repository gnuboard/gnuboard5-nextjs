import { runtimeRouterPush as defaultRuntimeRouterPush } from "@/lib/runtime-router";
import { koreanApiErrorMessage } from "@/lib/api-error-messages";
import {
  toastError as defaultToastError,
  toastSuccess as defaultToastSuccess,
} from "@/lib/toast";
import type {
  PaymentConfig,
  PaymentNotice,
  PayMethodDef,
} from "./orderPaymentHelpers";
import { PAYMENT_NOTICE_AUTO_DISMISS_MS } from "./orderPaymentHelpers";
import {
  CART_CHANGED_MESSAGE,
  PAYMENT_PREPARING_NOTICE,
  getCreatedOrderPath,
  isCartChangedError,
  isPaymentCancelMessage,
} from "./orderSubmitFeedback";
import {
  createBankOrder as createBankOrderAction,
  requestPreparedOrderPayment as requestPreparedOrderPaymentAction,
} from "./orderSubmitActions";
import type { OrderBody } from "./orderSubmitTypes";

type RouterLike = {
  push(href: string): void;
  replace(href: string): void;
};

type SubmitBankOrderInput = {
  orderBody: OrderBody;
  bankAccount: string;
  depositName: string;
  router: RouterLike;
  setSubmitting: (submitting: boolean) => void;
  /** 서버가 장바구니가 바뀌었다고 멈추면(CART_CHANGED) — 주문서의 상품 줄을 다시 불러온다. */
  onCartChanged?: () => void;
  deps?: Partial<OrderSubmitFlowDeps>;
};

type SubmitPaymentOrderInput = {
  orderBody: OrderBody;
  paymentConfig: PaymentConfig | null;
  methodDef: PayMethodDef;
  /** 간편결제에서 고른 서비스(KCP · NICEPAY). 없으면 서버의 대표 서비스. */
  easyPayService?: string;
  origin: string;
  setSubmitting: (submitting: boolean) => void;
  setPaymentNotice: (notice: PaymentNotice | null) => void;
  onCartChanged?: () => void;
  deps?: Partial<OrderSubmitFlowDeps>;
};

export type OrderSubmitFlowDeps = {
  createBankOrder: typeof createBankOrderAction;
  requestPreparedOrderPayment: typeof requestPreparedOrderPaymentAction;
  routerPush: typeof defaultRuntimeRouterPush;
  toastError: typeof defaultToastError;
  toastSuccess: typeof defaultToastSuccess;
};

const defaultOrderSubmitFlowDeps: OrderSubmitFlowDeps = {
  createBankOrder: createBankOrderAction,
  requestPreparedOrderPayment: requestPreparedOrderPaymentAction,
  routerPush: defaultRuntimeRouterPush,
  toastError: defaultToastError,
  toastSuccess: defaultToastSuccess,
};

function resolveOrderSubmitFlowDeps(
  deps?: Partial<OrderSubmitFlowDeps>
): OrderSubmitFlowDeps {
  return { ...defaultOrderSubmitFlowDeps, ...deps };
}

export async function submitBankOrder({
  orderBody,
  bankAccount,
  depositName,
  router,
  setSubmitting,
  onCartChanged,
  deps,
}: SubmitBankOrderInput): Promise<void> {
  const flowDeps = resolveOrderSubmitFlowDeps(deps);
  const runtimeRouterPush = flowDeps.routerPush;
  const toastError = flowDeps.toastError;
  const toastSuccess = flowDeps.toastSuccess;

  try {
    const createdOrder = await flowDeps.createBankOrder({
      orderBody,
      bankAccount,
      depositName,
    });
    const createdOrderPath = getCreatedOrderPath(createdOrder);
    toastSuccess("주문이 완료되었습니다. 입금을 진행해주세요.");
    runtimeRouterPush(router, createdOrderPath);
  } catch (err: unknown) {
    if (isCartChangedError(err)) {
      toastError(CART_CHANGED_MESSAGE);
      onCartChanged?.();
      return;
    }
    const message = err instanceof Error ? err.message : "주문에 실패했습니다.";
    toastError(message);
  } finally {
    setSubmitting(false);
  }
}

export async function submitPaymentOrder({
  orderBody,
  paymentConfig,
  methodDef,
  easyPayService,
  origin,
  setSubmitting,
  setPaymentNotice,
  onCartChanged,
  deps,
}: SubmitPaymentOrderInput): Promise<void> {
  const flowDeps = resolveOrderSubmitFlowDeps(deps);
  const requestPreparedOrderPayment = flowDeps.requestPreparedOrderPayment;
  const toastError = flowDeps.toastError;

  if (!paymentConfig) {
    toastError("결제 설정을 불러오지 못했습니다.");
    setSubmitting(false);
    return;
  }
  if (!methodDef.pg_method) {
    toastError("결제 수단을 다시 선택해주세요.");
    setSubmitting(false);
    return;
  }

  try {
    setPaymentNotice(PAYMENT_PREPARING_NOTICE);
    await requestPreparedOrderPayment({
      orderBody,
      paymentConfig,
      methodDef,
      origin,
      onPaymentProgress: setPaymentNotice,
      ...(easyPayService ? { easyPayService } : {}),
    });
  } catch (err: unknown) {
    if (isCartChangedError(err)) {
      // 결제 준비가 멈췄다 — 결제창은 열리지 않았다. 준비 중 안내를 걷고 상품 줄을 다시 불러온다.
      setPaymentNotice(null);
      toastError(CART_CHANGED_MESSAGE, { duration: PAYMENT_NOTICE_AUTO_DISMISS_MS });
      onCartChanged?.();
      setSubmitting(false);
      return;
    }
    // PG 결제 창은 영어 문구("KCP payment cancelled" 등)로 끝나기도 한다. 화면에는 한국어로.
    const message = koreanApiErrorMessage(
      err instanceof Error ? err.message : "결제 요청에 실패했습니다.",
      0
    );
    const isCancelled = isPaymentCancelMessage(message);
    setPaymentNotice({
      tone: "error",
      title: isCancelled ? "결제가 취소되었습니다." : "결제 요청에 실패했습니다.",
      message,
    });
    toastError(message, { duration: PAYMENT_NOTICE_AUTO_DISMISS_MS });
    setSubmitting(false);
  }
}
