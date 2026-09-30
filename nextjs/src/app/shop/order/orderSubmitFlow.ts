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
  PAYMENT_PREPARING_NOTICE,
  getCreatedOrderPath,
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
